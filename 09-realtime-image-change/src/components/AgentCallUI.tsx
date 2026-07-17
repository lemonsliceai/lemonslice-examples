"use client";

/**
 * LiveKit voice-agent UI with realtime LemonSlice image updates.
 *
 * 1. **Pre-join** — No token yet; “Start call” fetches `/api/token`.
 * 2. **Calling** — In room, waiting for avatar readiness via `@lemonsliceai/avatar` `LiveKitAvatarReadyWatcher`.
 * 3. **Active** — Bot pipeline ready; image panel can send URL, upload, or Nano Banana edits.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTrackToggle,
  useRoomContext,
  useRemoteParticipants,
  useTracks,
} from "@livekit/components-react";
import { LiveKitAvatarReadyWatcher } from "@lemonsliceai/avatar/livekit-react";
import {
  Track,
  RoomEvent,
  ConnectionState,
  isVideoTrack,
  ParticipantKind,
  type Participant,
  type RemoteParticipant,
} from "livekit-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { CallControlsBar } from "@/components/agent-call/CallControlsBar";
import { PreJoinPreview } from "@/components/agent-call/PreJoinPreview";
import { ImageChangePanel } from "@/components/ImageChangePanel";
import {
  AGENT_EVENTS_TOPIC,
  IMAGE_CHANGE_TIMEOUT_MS,
  IMAGE_EDIT_TIMEOUT_MS,
  LEMONSLICE_RPC_TOPIC,
  appendImageChangeLog,
  publishAvatarReady,
  publishImageEditCommand,
  publishSetImageCommand,
  type ImageChangeState,
} from "@/lib/agent-messages";

const WIDGET_ASPECT_RATIO = 2 / 3;
const TOPIC_CHAT = "lk.chat";
const DEFAULT_PLACEHOLDER_VIDEO = "/welcome.mp4";
const LEMONSLICE_AVATAR_IDENTITY = "lemonslice-avatar-agent";
const BASE_IMAGE_URL =
  "https://6ammc3n5zzf5ljnz.public.blob.vercel-storage.com/public/hero_agents/jess2/base.png";

const INITIAL_IMAGE_STATE: ImageChangeState = {
  phase: "idle",
  currentImageUrl: BASE_IMAGE_URL,
  events: [],
};

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

function ActiveCallPanel({
  activeWidth,
  activeHeight,
  placeholderVideoUrl,
  imageState,
  setImageState,
  onAvatarDisconnected,
  onHangUp,
}: {
  activeWidth: number;
  activeHeight: number;
  placeholderVideoUrl?: string | null;
  imageState: ImageChangeState;
  setImageState: React.Dispatch<React.SetStateAction<ImageChangeState>>;
  onAvatarDisconnected: () => void;
  onHangUp: () => void;
}) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const { videoTrack } = useRemoteAgentVideo();

  const [avatarJoined, setAvatarJoined] = useState(false);
  const greetedRef = useRef(false);
  const compactLayout = !avatarJoined;

  const handleAvatarReady = useCallback(() => {
    setAvatarJoined(true);
    if (greetedRef.current) return;
    greetedRef.current = true;
    publishAvatarReady(room.localParticipant).catch((e) =>
      console.error("Failed to publish avatar_ready:", e),
    );
  }, [room]);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdogs = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (editWatchdogRef.current) {
      clearTimeout(editWatchdogRef.current);
      editWatchdogRef.current = null;
    }
  }, []);

  const armImageChangeWatchdog = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      setImageState((s) =>
        appendImageChangeLog(
          { ...s, phase: "idle" },
          "image_change_error",
          "Timed out waiting for image_change_complete",
        ),
      );
    }, IMAGE_CHANGE_TIMEOUT_MS);
  }, [setImageState]);

  useEffect(() => {
    void room.localParticipant.setMicrophoneEnabled(avatarJoined);
  }, [room, avatarJoined]);

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

  // Listen for agent/events + lemonslice image_change_*.
  useEffect(() => {
    const handler = (
      payload: Uint8Array,
      _participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) => {
      let data: {
        type?: string;
        image_url?: string;
        request_id?: string;
        message?: string;
      };
      try {
        data = JSON.parse(new TextDecoder().decode(payload)) as typeof data;
      } catch {
        return;
      }
      if (!data || typeof data !== "object" || !data.type) return;

      if (topic === LEMONSLICE_RPC_TOPIC) {
        if (data.type === "image_change_complete") {
          clearWatchdogs();
          setImageState((s) =>
            appendImageChangeLog({ ...s, phase: "idle" }, "image_change_complete"),
          );
          return;
        }
        if (data.type === "image_change_error") {
          clearWatchdogs();
          const msg = data.message ?? "Image change failed";
          showToast(msg);
          setImageState((s) =>
            appendImageChangeLog({ ...s, phase: "idle" }, "image_change_error", msg),
          );
        }
        return;
      }

      if (topic !== AGENT_EVENTS_TOPIC) return;

      if (data.type === "tool_call") {
        setImageState((s) =>
          appendImageChangeLog(s, "tool_call", data.message),
        );
        return;
      }

      if (data.type === "fal_edit_started" || data.type === "fal_edit_complete") {
        const kind = data.type;
        setImageState((s) =>
          appendImageChangeLog(s, kind, data.message ?? data.image_url),
        );
        return;
      }

      if (data.type === "image_accepted") {
        if (editWatchdogRef.current) {
          clearTimeout(editWatchdogRef.current);
          editWatchdogRef.current = null;
        }
        armImageChangeWatchdog();
        setImageState((s) =>
          appendImageChangeLog(
            {
              ...s,
              currentImageUrl: data.image_url ?? s.currentImageUrl,
            },
            "image_accepted",
            data.message ?? data.image_url,
          ),
        );
        return;
      }

      if (data.type === "image_update_failed") {
        clearWatchdogs();
        const msg = data.message ?? "Image update failed";
        showToast(msg);
        setImageState((s) =>
          appendImageChangeLog({ ...s, phase: "idle" }, "image_update_failed", msg),
        );
      }
    };

    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
      clearWatchdogs();
    };
  }, [room, setImageState, armImageChangeWatchdog, clearWatchdogs, showToast]);

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

  const handleApplyUrl = useCallback(
    async (url: string) => {
      if (room.state !== ConnectionState.Connected) return;
      clearWatchdogs();
      try {
        await publishSetImageCommand(room.localParticipant, {
          type: "set_image",
          image_url: url,
        });
        armImageChangeWatchdog();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to publish set_image";
        showToast(msg);
        setImageState((s) =>
          appendImageChangeLog(s, "image_update_failed", msg),
        );
      }
    },
    [room, setImageState, armImageChangeWatchdog, clearWatchdogs, showToast],
  );

  const handleApplyUpload = useCallback(
    async (imageBase64: string) => {
      if (room.state !== ConnectionState.Connected) return;
      clearWatchdogs();
      try {
        await publishSetImageCommand(room.localParticipant, {
          type: "set_image",
          image_base64: imageBase64,
        });
        armImageChangeWatchdog();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to publish uploaded image";
        showToast(msg);
        setImageState((s) =>
          appendImageChangeLog(s, "image_update_failed", msg),
        );
      }
    },
    [room, setImageState, armImageChangeWatchdog, clearWatchdogs, showToast],
  );

  const handleGenerateEdit = useCallback(
    async (prompt: string) => {
      if (room.state !== ConnectionState.Connected) return;
      clearWatchdogs();
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `edit-${Date.now()}`;
      setImageState((s) => ({ ...s, phase: "editing" }));
      editWatchdogRef.current = setTimeout(() => {
        setImageState((s) =>
          appendImageChangeLog(
            { ...s, phase: "idle" },
            "image_update_failed",
            "Timed out waiting for image_accepted",
          ),
        );
      }, IMAGE_EDIT_TIMEOUT_MS);
      try {
        await publishImageEditCommand(room.localParticipant, {
          type: "image_edit",
          request_id: requestId,
          prompt,
          source_image_url: imageState.currentImageUrl ?? undefined,
        });
      } catch (e) {
        clearWatchdogs();
        const msg = e instanceof Error ? e.message : "Failed to publish edit";
        showToast(msg);
        setImageState((s) =>
          appendImageChangeLog({ ...s, phase: "idle" }, "image_update_failed", msg),
        );
      }
    },
    [room, imageState.currentImageUrl, setImageState, clearWatchdogs, showToast],
  );

  // Iridescent ring for Fal edit until LemonSlice image_change_complete / error.
  const transitioning = imageState.phase === "editing";

  return (
    <div className="flex min-h-screen w-full flex-1 flex-col lg:h-screen lg:min-h-0 lg:flex-row lg:overflow-hidden">
      {/* Left half: call UI stays centered in this pane as the window resizes */}
      <div className="flex min-h-[50vh] w-full flex-1 flex-col items-center justify-center p-4 lg:h-full lg:min-h-0 lg:w-1/2 lg:flex-none">
        <div
          className="flex w-full max-w-full flex-col items-center justify-center gap-4"
          style={{ width: Math.max(activeWidth, 250) }}
        >
          <div className="relative flex flex-col items-center">
            {/* Attach the LiveKit track only after LiveKitAvatarReadyWatcher
                reports first-frame readiness — attaching early shows an empty gray circle. */}
            <AgentVideoView
              compact={compactLayout}
              width={activeWidth}
              height={activeHeight}
              placeholderVideoUrl={placeholderVideoUrl}
              agentVideoTrack={compactLayout ? null : videoTrack}
              imageTransitioning={transitioning && !compactLayout}
            />
            {toastVisible && toastMessage ? (
              <div
                className="absolute left-2 right-2 z-10 flex justify-center"
                style={{ bottom: 16 }}
              >
                <div className="mx-auto max-w-[90%] overflow-hidden rounded-2xl bg-black/20 px-3 py-2 text-center text-sm text-white backdrop-blur-xl">
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
        </div>

        <LiveKitAvatarReadyWatcher onReady={handleAvatarReady} />
        <RoomAudioRenderer />
      </div>

      <div className="flex w-full min-h-0 flex-col lg:h-full lg:w-1/2 lg:overflow-hidden">
        <ImageChangePanel
          state={imageState}
          connected={avatarJoined}
          onApplyUrl={handleApplyUrl}
          onApplyUpload={handleApplyUpload}
          onGenerateEdit={handleGenerateEdit}
          className="lg:h-full lg:min-h-0"
        />
      </div>
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
  const [tokenState, setTokenState] = useState<{ token: string; serverUrl: string } | null>(
    null,
  );
  /**
   * After hang-up / avatar leave, ignore controlled token props so the call can
   * unmount. Local Start Call then uses tokenState; a new tokenProp from the
   * parent clears this and takes over again.
   */
  const [ignoreTokenProps, setIgnoreTokenProps] = useState(false);
  const [imageState, setImageState] = useState<ImageChangeState>(INITIAL_IMAGE_STATE);
  const [activeSize, setActiveSize] = useState({
    width: customActiveWidth ?? 280,
    height: customActiveHeight ?? 420,
  });

  // Parent pushed new credentials — accept them for a fresh session.
  useEffect(() => {
    if (!tokenProp || !serverUrlProp) return;
    setIgnoreTokenProps(false);
    setTokenState(null);
  }, [tokenProp, serverUrlProp]);

  const token = ignoreTokenProps
    ? (tokenState?.token ?? null)
    : (tokenProp ?? tokenState?.token ?? null);
  const serverUrl = ignoreTokenProps
    ? (tokenState?.serverUrl ?? null)
    : (serverUrlProp ?? tokenState?.serverUrl ?? null);

  const activeWidth = customActiveWidth ?? activeSize.width;
  const activeHeight = customActiveHeight ?? activeSize.height;

  useEffect(() => {
    if (customActiveWidth !== undefined && customActiveHeight !== undefined) return;
    const calc = () => {
      if (typeof window === "undefined") return;
      const isMobile = window.innerWidth < 1024;
      // Fit inside the left half (desktop) or full width (stacked), leaving room for controls.
      const paneWidth = isMobile
        ? window.innerWidth - 32
        : Math.floor(window.innerWidth / 2) - 32;
      const paneHeight = isMobile
        ? Math.floor(window.innerHeight * 0.5) - 48
        : window.innerHeight - 48;
      const controlsBudget = isMobile ? 72 : 96;
      const maxW = Math.max(200, paneWidth);
      const maxH = Math.max(240, paneHeight - controlsBudget);
      let h = maxH;
      let w = Math.floor(h * WIDGET_ASPECT_RATIO);
      if (w > maxW) {
        w = Math.floor(maxW);
        h = Math.floor(w / WIDGET_ASPECT_RATIO);
      }
      setActiveSize({ width: w, height: h });
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [customActiveWidth, customActiveHeight]);

  const endSession = useCallback(() => {
    setTokenState(null);
    setIgnoreTokenProps(true);
  }, []);

  const handleStartCall = useCallback(async () => {
    try {
      const res = await fetch("/api/token");
      if (!res.ok) throw new Error("Token failed");
      const data = (await res.json()) as { token: string; serverUrl: string };
      setImageState(INITIAL_IMAGE_STATE);
      // Prefer this fetch over any stale controlled props from before hang-up.
      setIgnoreTokenProps(true);
      setTokenState({ token: data.token, serverUrl: data.serverUrl });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleDisconnected = endSession;
  const handleHangUp = endSession;
  const handleAvatarDisconnected = endSession;

  const placeholderVideo = placeholderVideoUrl ?? DEFAULT_PLACEHOLDER_VIDEO;

  if (!token || !serverUrl) {
    return (
      <div
        className={cn(
          "flex min-h-screen w-full flex-col lg:h-screen lg:flex-row lg:overflow-hidden",
          className,
        )}
      >
        <div className="flex min-h-[50vh] w-full flex-1 items-center justify-center p-6 lg:h-full lg:w-1/2 lg:flex-none">
          <PreJoinPreview placeholderVideo={placeholderVideo} onStartCall={handleStartCall} />
        </div>
        <div className="flex w-full min-h-0 flex-col lg:h-full lg:w-1/2 lg:overflow-hidden">
          <ImageChangePanel
            state={imageState}
            connected={false}
            onApplyUrl={() => {}}
            onApplyUpload={() => {}}
            onGenerateEdit={() => {}}
            className="min-h-[50vh] lg:h-full lg:min-h-0"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-screen w-full flex-col lg:h-screen lg:overflow-hidden", className)}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={false}
        video={false}
        onDisconnected={handleDisconnected}
        className="flex min-h-screen w-full flex-1 flex-col lg:h-full lg:min-h-0"
      >
        <ActiveCallPanel
          activeWidth={activeWidth}
          activeHeight={activeHeight}
          placeholderVideoUrl={placeholderVideo}
          imageState={imageState}
          setImageState={setImageState}
          onAvatarDisconnected={handleAvatarDisconnected}
          onHangUp={handleHangUp}
        />
      </LiveKitRoom>
    </div>
  );
}
