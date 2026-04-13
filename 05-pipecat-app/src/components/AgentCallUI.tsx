"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  useAudioTrack,
  DailyProvider,
  useCallObject,
  useDaily,
  useDailyEvent,
  useParticipantIds,
  useVideoTrack,
} from "@daily-co/daily-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { CallControlsBar } from "@/components/agent-call/CallControlsBar";
import { PreJoinPreview } from "@/components/agent-call/PreJoinPreview";

const WIDGET_ASPECT_RATIO = 2 / 3;
const DEFAULT_PLACEHOLDER_VIDEO = null;

type DailyParticipant = {
  local?: boolean;
  user_name?: string;
  participantType?: string;
};

export interface AgentCallUIProps {
  customActiveWidth?: number;
  customActiveHeight?: number;
  placeholderVideoUrl?: string | null;
  className?: string;
}

function AgentCallUIInner({
  customActiveWidth,
  customActiveHeight,
  placeholderVideoUrl,
  className,
}: AgentCallUIProps) {
  const callObject = useDaily();
  const [sessionState, setSessionState] = useState<{ roomUrl: string; token: string } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micPending, setMicPending] = useState(false);
  const [message, setMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [activeSize, setActiveSize] = useState({
    width: customActiveWidth ?? 320,
    height: customActiveHeight ?? 480,
  });

  const clearToastTimeout = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (text: string, duration = 3000) => {
      clearToastTimeout();
      setToastMessage(text);
      setToastVisible(true);
      toastTimeoutRef.current = setTimeout(() => {
        setToastVisible(false);
        setToastMessage("");
        toastTimeoutRef.current = null;
      }, duration);
    },
    [clearToastTimeout],
  );

  const stopSession = useCallback(async () => {
    if (callObject) {
      try {
        await callObject.leave();
      } catch {
        // Ignore leave failures during teardown.
      }
    }
    clearToastTimeout();
    setToastVisible(false);
    setToastMessage("");
    setSessionState(null);
    try {
      await fetch("/api/session", { method: "DELETE" });
    } catch {
      // Backend might already be gone; safe to ignore.
    }
  }, [callObject, clearToastTimeout]);

  useEffect(() => {
    if (customActiveWidth !== undefined && customActiveHeight !== undefined) return;
    const calc = () => {
      if (typeof window === "undefined") return;
      const headerHeight = 24;
      const isMobile = window.innerWidth < 640;
      const bottomPadding = isMobile ? 140 : 72;
      const available = window.innerHeight - headerHeight - bottomPadding;
      const maxHeight = Math.floor(available * 0.96);
      const width = Math.floor(maxHeight * WIDGET_ASPECT_RATIO);
      setActiveSize({ width, height: maxHeight });
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [customActiveWidth, customActiveHeight]);

  useEffect(() => {
    return () => {
      void stopSession();
    };
  }, [stopSession]);

  const avatarParticipantIds = useParticipantIds({
    filter: (p: DailyParticipant) =>
      !p.local && (p.user_name?.trim().toLowerCase() === "lemonslice"),
  });
  const selectedRemoteParticipantId = avatarParticipantIds[0] ?? null;
  const audioTrackState = useAudioTrack(selectedRemoteParticipantId ?? "local");
  const videoTrackState = useVideoTrack(selectedRemoteParticipantId ?? "local");
  const audioTrack = selectedRemoteParticipantId ? (audioTrackState.track ?? null) : null;
  const videoTrack = selectedRemoteParticipantId ? (videoTrackState.track ?? null) : null;

  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el || !audioTrack) return;
    const stream = new MediaStream([audioTrack]);
    el.srcObject = stream;
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [audioTrack]);

  const handleStartCall = useCallback(async () => {
    if (isConnecting || !callObject) return;
    setIsConnecting(true);
    try {
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start Pipecat session");
      const data = (await res.json()) as { room_url: string; token: string };
      const roomUrl = data.room_url;
      const token = data.token;

      // Mount call UI immediately so participant/audio events are reflected without waiting
      // for the full Daily join lifecycle to settle.
      setSessionState({ roomUrl, token });

      await callObject.join({
        url: roomUrl,
        token,
        audioSource: true,
        videoSource: false,
      });

      setMicEnabled(Boolean(callObject.localAudio()));
    } catch (error) {
      console.error(error);
      await stopSession();
    } finally {
      setIsConnecting(false);
    }
  }, [callObject, isConnecting, stopSession]);

  const handleToggleMic = useCallback(async () => {
    if (!callObject) return;
    setMicPending(true);
    try {
      const nextValue = !micEnabled;
      await callObject.setLocalAudio(nextValue);
      setMicEnabled(nextValue);
    } catch (error) {
      console.error("Failed to toggle mic", error);
    } finally {
      setMicPending(false);
    }
  }, [callObject, micEnabled]);

  const handleSendMessage = useCallback(async () => {
    const text = message.trim();
    if (!text || !callObject) return;
    setMessage("");
    showToast(text);
    try {
      const response = await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail ?? payload.error ?? "Failed to send message");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to send message");
    }
  }, [callObject, message, showToast]);

  const activeWidth = customActiveWidth ?? activeSize.width;
  const activeHeight = customActiveHeight ?? activeSize.height;
  const placeholderVideo = placeholderVideoUrl ?? DEFAULT_PLACEHOLDER_VIDEO;
  const avatarJoined = avatarParticipantIds.length > 0;
  const compactLayout = !avatarJoined;

  const onAppMessage = useCallback(
    (event: { data?: { text?: string; message?: string } }) => {
      const text = event?.data?.text ?? event?.data?.message;
      if (text) showToast(text);
    },
    [showToast],
  );

  useDailyEvent("app-message", onAppMessage);

  if (!sessionState?.roomUrl) {
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
      <div className="w-full flex flex-col items-center gap-4">
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
        <div className="relative flex flex-col items-center">
          <AgentVideoView
            compact={compactLayout}
            width={activeWidth}
            height={activeHeight}
            placeholderVideoUrl={placeholderVideo}
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
            onToggleMic={handleToggleMic}
            onHangUp={() => {
              void stopSession();
            }}
          />
        )}

        {compactLayout && (
          <Button size="default" className="gap-2" disabled variant="secondary">
            <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Ringing...
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AgentCallUI(props: AgentCallUIProps) {
  const callObject = useCallObject({});
  return (
    <DailyProvider callObject={callObject}>
      <AgentCallUIInner {...props} />
    </DailyProvider>
  );
}
