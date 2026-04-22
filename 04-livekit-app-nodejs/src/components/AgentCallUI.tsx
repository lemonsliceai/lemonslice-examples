"use client";

/**
 * LiveKit voice-agent UI.
 *
 * 1. **Pre-join** — No token yet; “Start call” fetches `/api/token`.
 * 2. **Ringing** — In room, waiting for LemonSlice `bot_ready` on topic `lemonslice` (not mere participant join).
 * 3. **Active** — Bot pipeline ready; full controls. If the avatar leaves (`ParticipantDisconnected`),
 *    we disconnect and return to pre-join.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useDataChannel,
  useTrackToggle,
  useRoomContext,
  useRemoteParticipants,
  useTracks,
} from "@livekit/components-react";
import type { ReceivedDataMessage } from "@livekit/components-core";
import { Track, RoomEvent, isVideoTrack, type Participant } from "livekit-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { CallControlsBar } from "@/components/agent-call/CallControlsBar";
import { PreJoinPreview } from "@/components/agent-call/PreJoinPreview";

const WIDGET_ASPECT_RATIO = 2 / 3;

/** Text stream topic for agent chat */
const TOPIC_CHAT = "lk.chat";

/** LemonSlice data RPC topic — `bot_ready` indicates avatar video pipeline is warm. */
const LEMONSLICE_RPC_TOPIC = "lemonslice";
const BOT_READY_MSG_TYPE = "bot_ready";

const DEFAULT_PLACEHOLDER_VIDEO = "/welcome.mp4";

function useRemoteAgentVideo() {
  const room = useRoomContext();
  const tracks = useTracks([Track.Source.Camera]);
  const remoteVideo = tracks.find(
    (t) =>
      t.publication.source === Track.Source.Camera &&
      t.participant?.identity !== room?.localParticipant?.identity,
  );
  const raw = remoteVideo?.publication?.track;
  const videoTrack = raw && isVideoTrack(raw) ? raw : null;
  const hasRemoteVideo = videoTrack != null;
  return { videoTrack, hasRemoteVideo };
}

/**
 * In-room UI: ringing (compact) until LemonSlice sends `bot_ready`, then full active call.
 */
function ActiveCallPanel({
  activeWidth,
  activeHeight,
  placeholderVideoUrl,
  onAvatarDisconnected,
  onHangUp,
}: {
  activeWidth: number;
  activeHeight: number;
  placeholderVideoUrl?: string | null;
  onAvatarDisconnected: () => void;
  onHangUp: () => void;
}) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const { videoTrack } = useRemoteAgentVideo();

  const [avatarJoined, setAvatarJoined] = useState(false);
  const compactLayout = !avatarJoined;

  const [message, setMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agentIdentity = remoteParticipants[0]?.identity ?? null;

  const showToast = useCallback((text: string, duration = 3000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(text);
    setToastVisible(true);
    toastTimeoutRef.current = setTimeout(() => {
      setToastVisible(false);
      setToastMessage("");
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    const handler = (
      segments: { text: string; final?: boolean }[],
      participant: { identity: string } | undefined,
    ) => {
      if (!participant || participant.identity !== room.localParticipant.identity) return;
      const text = segments.map((s) => s.text).join(" ").trim();
      if (text) showToast(text);
    };
    room.on(RoomEvent.TranscriptionReceived, handler);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handler);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [room, showToast]);

  const onLemonsliceData = useCallback((msg: ReceivedDataMessage<typeof LEMONSLICE_RPC_TOPIC>) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(msg.payload));
    } catch {
      return;
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { type?: unknown }).type !== BOT_READY_MSG_TYPE
    ) {
      return;
    }
    setAvatarJoined(true);
  }, []);

  /** Subscribes to the single shared data channel; `topic` filters to LemonSlice RPC only. */
  useDataChannel(LEMONSLICE_RPC_TOPIC, onLemonsliceData);

  useEffect(() => {
    const onParticipantDisconnected = (_p: Participant) => {
      if (room.remoteParticipants.size > 0) return;
      setAvatarJoined(false);
      room.disconnect().catch(() => {});
      onAvatarDisconnected();
    };

    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    };
  }, [room, onAvatarDisconnected]);

  const { toggle: toggleMic, enabled: micEnabled, pending: micPending } = useTrackToggle({
    source: Track.Source.Microphone,
  });

  const handleSendMessage = useCallback(() => {
    const text = message.trim();
    if (!text) return;
    if (!agentIdentity) {
      console.warn("No agent in room, cannot send message");
      return;
    }
    setMessage("");
    showToast(text);
    room.localParticipant
      .sendText(text, {
        topic: TOPIC_CHAT,
        destinationIdentities: [agentIdentity],
      })
      .catch((e) => console.error("Send message failed:", e));
  }, [message, room, agentIdentity, showToast]);

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="relative flex flex-col items-center">
        <AgentVideoView
          compact={compactLayout}
          width={activeWidth}
          height={activeHeight}
          placeholderVideoUrl={placeholderVideoUrl}
          agentVideoTrack={videoTrack}
        />
        {toastVisible && toastMessage ? (
          <div className="absolute left-2 right-2 flex justify-center z-10" style={{ bottom: 16 }}>
            <div className="mx-auto bg-black/20 backdrop-blur-xl text-white rounded-2xl px-3 py-2 text-sm text-center max-w-[90%] overflow-hidden">
              <div className="line-clamp-4">{toastMessage}</div>
            </div>
          </div>
        ) : null}
      </div>

      {!compactLayout && (
        <CallControlsBar
          message={message}
          onMessageChange={setMessage}
          onSendMessage={handleSendMessage}
          micEnabled={micEnabled}
          micPending={micPending}
          onToggleMic={() => toggleMic()}
          onHangUp={onHangUp}
        />
      )}

      {compactLayout && (
        <Button size="default" className="gap-2" disabled variant="secondary">
          <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Ringing…
        </Button>
      )}

      <RoomAudioRenderer />
    </div>
  );
}

export interface AgentCallUIProps {
  token?: string | null;
  serverUrl?: string | null;
  customActiveWidth?: number;
  customActiveHeight?: number;
  placeholderVideoUrl?: string | null;
  className?: string;
}

export default function AgentCallUI({
  token: tokenProp,
  serverUrl: serverUrlProp,
  customActiveWidth,
  customActiveHeight,
  placeholderVideoUrl,
  className,
}: AgentCallUIProps) {
  const [tokenState, setTokenState] = useState<{ token: string; serverUrl: string } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSize, setActiveSize] = useState({
    width: customActiveWidth ?? 320,
    height: customActiveHeight ?? 480,
  });

  const token = tokenProp ?? tokenState?.token ?? null;
  const serverUrl = serverUrlProp ?? tokenState?.serverUrl ?? null;

  const activeWidth = customActiveWidth ?? activeSize.width;
  const activeHeight = customActiveHeight ?? activeSize.height;

  useEffect(() => {
    if (customActiveWidth !== undefined && customActiveHeight !== undefined) return;
    const calc = () => {
      if (typeof window === "undefined") return;
      const headerHeight = 24;
      const isMobile = window.innerWidth < 640;
      const bottomPadding = isMobile ? 140 : 72;
      const available = window.innerHeight - headerHeight - bottomPadding;
      const maxHeight = Math.floor(available * 0.96);
      const w = Math.floor(maxHeight * WIDGET_ASPECT_RATIO);
      setActiveSize({ width: w, height: maxHeight });
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [customActiveWidth, customActiveHeight]);

  const handleStartCall = useCallback(async () => {
    setIsConnecting(true);
    try {
      const res = await fetch("/api/token");
      if (!res.ok) throw new Error("Token failed");
      const data = (await res.json()) as { token: string; serverUrl: string };
      setTokenState({ token: data.token, serverUrl: data.serverUrl });
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const handleDisconnected = useCallback(() => {
    setTokenState(null);
  }, []);

  const handleHangUp = useCallback(() => {
    setTokenState(null);
  }, []);

  const handleAvatarDisconnected = useCallback(() => {
    setTokenState(null);
  }, []);

  const placeholderVideo = placeholderVideoUrl ?? DEFAULT_PLACEHOLDER_VIDEO;

  if (!token || !serverUrl) {
    return (
      <PreJoinPreview
        placeholderVideo={placeholderVideo}
        isConnecting={isConnecting}
        onStartCall={handleStartCall}
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex flex-col items-stretch w-full", className)}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio
        video={false}
        onDisconnected={handleDisconnected}
        style={{ height: "100%" }}
      >
        <ActiveCallPanel
          activeWidth={activeWidth}
          activeHeight={activeHeight}
          placeholderVideoUrl={placeholderVideo}
          onAvatarDisconnected={handleAvatarDisconnected}
          onHangUp={handleHangUp}
        />
      </LiveKitRoom>
    </div>
  );
}
