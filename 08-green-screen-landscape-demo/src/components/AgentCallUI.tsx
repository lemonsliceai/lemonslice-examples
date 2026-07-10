"use client";

/**
 * LiveKit voice-agent UI with client-side chroma key compositing.
 *
 * 1. **Pre-join** — No token yet; “Start call” fetches `/api/token`.
 * 2. **Calling** — In room, waiting for avatar readiness via `@lemonsliceai/avatar` `LiveKitAvatarReadyWatcher`.
 * 3. **Active** — Avatar is ready; chroma-keyed 2:3 portrait video over a 16:9 background.
 *    When the LemonSlice avatar leaves, disconnect and return to pre-join.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTrackToggle,
  useRoomContext,
  useRemoteParticipants,
  useTracks,
} from "@livekit/components-react";
import { LiveKitAvatarReadyWatcher } from "@lemonsliceai/avatar/livekit-react";
import { Track, RoomEvent, isVideoTrack, ParticipantKind, type Participant } from "livekit-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { CallControlsBar } from "@/components/agent-call/CallControlsBar";
import { PreJoinPreview } from "@/components/agent-call/PreJoinPreview";

const LANDSCAPE_ASPECT_RATIO = 16 / 9;

function calcActiveFrameSize() {
  if (typeof window === "undefined") return { width: 640, height: 360 };
  const headerHeight = 24;
  const isMobile = window.innerWidth < 640;
  const bottomPadding = isMobile ? 140 : 72;
  const horizontalPadding = 32;
  const maxWidth = window.innerWidth - horizontalPadding;
  const maxHeight = Math.floor((window.innerHeight - headerHeight - bottomPadding) * 0.96);

  let height = maxHeight;
  let width = Math.floor(height * LANDSCAPE_ASPECT_RATIO);
  if (width > maxWidth) {
    width = Math.floor(maxWidth);
    height = Math.floor(width / LANDSCAPE_ASPECT_RATIO);
  }
  return { width, height };
}

const TOPIC_CHAT = "lk.chat";
/** LiveKit identity used by the LemonSlice avatar participant. */
const LEMONSLICE_AVATAR_IDENTITY = "lemonslice-avatar-agent";

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
  return { videoTrack };
}

/**
 * In-room UI: calling (compact) until `LiveKitAvatarReadyWatcher` reports the avatar is ready.
 */
function ActiveCallPanel({
  activeWidth,
  activeHeight,
  onAvatarDisconnected,
  onHangUp,
}: {
  activeWidth: number;
  activeHeight: number;
  onAvatarDisconnected: () => void;
  onHangUp: () => void;
}) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const { videoTrack } = useRemoteAgentVideo();

  const [avatarJoined, setAvatarJoined] = useState(false);
  const compactLayout = !avatarJoined;

  useEffect(() => {
    if (!compactLayout) return;
    const audio = new Audio("/sounds/ring.m4a");
    audio.volume = 0.5;
    const play = () => {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    };
    play();
    const id = setInterval(play, 2000);
    return () => {
      clearInterval(id);
      audio.pause();
    };
  }, [compactLayout]);

  const [message, setMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // LIVEKIT_AGENT_NAME is the dispatch name, not the room identity (that's auto-assigned).
  // The worker joins as ParticipantKind.AGENT; the avatar is a separate standard participant.
  const agentIdentity =
    remoteParticipants.find((p) => p.kind === ParticipantKind.AGENT)?.identity ?? null;

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

  useEffect(() => {
    const onParticipantDisconnected = (p: Participant) => {
      // Agent worker and avatar are separate remotes — avatar leave must end the call
      // even if the agent is still in the room.
      if (p.identity !== LEMONSLICE_AVATAR_IDENTITY && room.remoteParticipants.size > 0) {
        return;
      }
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
        <Button size="default" disabled variant="secondary">
          Calling…
        </Button>
      )}

      <LiveKitAvatarReadyWatcher onReady={() => setAvatarJoined(true)} />
      <RoomAudioRenderer />
    </div>
  );
}

export interface AgentCallUIProps {
  token?: string | null;
  serverUrl?: string | null;
  customActiveWidth?: number;
  customActiveHeight?: number;
  className?: string;
}

export default function AgentCallUI({
  token: tokenProp,
  serverUrl: serverUrlProp,
  customActiveWidth,
  customActiveHeight,
  className,
}: AgentCallUIProps) {
  const [tokenState, setTokenState] = useState<{ token: string; serverUrl: string } | null>(null);
  const [activeSize, setActiveSize] = useState(() => {
    if (customActiveWidth !== undefined && customActiveHeight !== undefined) {
      return { width: customActiveWidth, height: customActiveHeight };
    }
    return calcActiveFrameSize();
  });

  const token = tokenProp ?? tokenState?.token ?? null;
  const serverUrl = serverUrlProp ?? tokenState?.serverUrl ?? null;

  const activeWidth = customActiveWidth ?? activeSize.width;
  const activeHeight = customActiveHeight ?? activeSize.height;

  useLayoutEffect(() => {
    if (customActiveWidth !== undefined && customActiveHeight !== undefined) return;
    const calc = () => setActiveSize(calcActiveFrameSize());
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [customActiveWidth, customActiveHeight]);

  const handleStartCall = useCallback(async () => {
    try {
      const res = await fetch("/api/token");
      if (!res.ok) throw new Error("Token failed");
      const data = (await res.json()) as { token: string; serverUrl: string };
      setTokenState({ token: data.token, serverUrl: data.serverUrl });
    } catch (e) {
      console.error(e);
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

  if (!token || !serverUrl) {
    return (
      <PreJoinPreview onStartCall={handleStartCall} className={className} />
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
          onAvatarDisconnected={handleAvatarDisconnected}
          onHangUp={handleHangUp}
        />
      </LiveKitRoom>
    </div>
  );
}
