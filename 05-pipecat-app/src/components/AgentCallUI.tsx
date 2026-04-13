"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DailyIframe from "@daily-co/daily-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { CallControlsBar } from "@/components/agent-call/CallControlsBar";
import { PreJoinPreview } from "@/components/agent-call/PreJoinPreview";

const WIDGET_ASPECT_RATIO = 2 / 3;
const DEFAULT_PLACEHOLDER_VIDEO = null;

type DailyParticipant = {
  session_id?: string;
  local?: boolean;
  user_name?: string;
  tracks?: {
    audio?: {
      state?: string;
      track?: MediaStreamTrack | null;
    };
    video?: {
      state?: string;
      track?: MediaStreamTrack | null;
    };
  };
};

function isAvatarParticipant(p: DailyParticipant): boolean {
  const userName = p.user_name?.toLowerCase() ?? "";
  const sessionId = p.session_id?.toLowerCase() ?? "";
  return (
    userName.includes("lemonslice") ||
    userName.includes("pipecat") ||
    sessionId.includes("lemonslice-avatar")
  );
}

function pickRemoteVideoTrack(participants: DailyParticipant[]): MediaStreamTrack | null {
  const avatarParticipant =
    participants.find((p) => !p.local && isAvatarParticipant(p) && p.tracks?.video?.track) ?? null;
  const fallback =
    participants.find((p) => !p.local && p.tracks?.video?.track && p.tracks.video.state === "playable") ??
    null;
  return avatarParticipant?.tracks?.video?.track ?? fallback?.tracks?.video?.track ?? null;
}

function pickRemoteAudioTrack(participants: DailyParticipant[]): MediaStreamTrack | null {
  const avatarParticipant =
    participants.find((p) => !p.local && isAvatarParticipant(p) && p.tracks?.audio?.track) ?? null;
  const fallback =
    participants.find((p) => !p.local && p.tracks?.audio?.track && p.tracks.audio.state === "playable") ??
    null;
  return avatarParticipant?.tracks?.audio?.track ?? fallback?.tracks?.audio?.track ?? null;
}

export interface AgentCallUIProps {
  customActiveWidth?: number;
  customActiveHeight?: number;
  placeholderVideoUrl?: string | null;
  className?: string;
}

export default function AgentCallUI({
  customActiveWidth,
  customActiveHeight,
  placeholderVideoUrl,
  className,
}: AgentCallUIProps) {
  const callRef = useRef<ReturnType<typeof DailyIframe.createCallObject> | null>(null);
  const [sessionState, setSessionState] = useState<{ roomUrl: string; token: string } | null>(null);
  const [participants, setParticipants] = useState<DailyParticipant[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
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

  const updateParticipants = useCallback(() => {
    if (!callRef.current) return;
    const entries = Object.values(callRef.current.participants() ?? {}) as DailyParticipant[];
    console.log("[AgentCallUI] updateParticipants", {
      total: entries.length,
      remote: entries.filter((p) => !p.local).length,
      participants: entries.map((p) => p.user_name ?? p.session_id ?? "unknown"),
    });
    setParticipants(entries);
  }, []);

  const clearToastTimeout = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (text: string, duration = 3000) => {
      console.log("[AgentCallUI] showToast", { text, duration });
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
    console.log("[AgentCallUI] stopSession start");
    if (callRef.current) {
      try {
        console.log("[AgentCallUI] leaving meeting");
        await callRef.current.leave();
      } catch {
        // Ignore leave failures during teardown.
      }
      try {
        console.log("[AgentCallUI] destroying call object");
        callRef.current.destroy();
      } catch {
        // Ignore destroy failures during teardown.
      }
      callRef.current = null;
    }
    clearToastTimeout();
    setToastVisible(false);
    setToastMessage("");
    setParticipants([]);
    setIsConnected(false);
    setSessionState(null);
    try {
      await fetch("/api/session", { method: "DELETE" });
    } catch {
      // Backend might already be gone; safe to ignore.
    }
    console.log("[AgentCallUI] stopSession complete");
  }, [clearToastTimeout]);

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

  const audioTrack = pickRemoteAudioTrack(participants);

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
    if (isConnecting) return;
    console.log("[AgentCallUI] handleStartCall");
    setIsConnecting(true);
    try {
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start Pipecat session");
      const data = (await res.json()) as { room_url: string; token: string };
      const roomUrl = data.room_url;
      const token = data.token;
      console.log("[AgentCallUI] session created", { roomUrl });

      const call = DailyIframe.createCallObject();
      callRef.current = call;
      console.log("[AgentCallUI] call object created");
      // Mount call UI immediately so participant/audio events are reflected without waiting
      // for the full Daily join lifecycle to settle.
      setSessionState({ roomUrl, token });

      call.on("joined-meeting", (event) => {
        console.log("[AgentCallUI] event joined-meeting", event);
        setIsConnected(true);
        updateParticipants();
      });
      call.on("left-meeting", (event) => {
        console.log("[AgentCallUI] event left-meeting", event);
        setIsConnected(false);
      });
      call.on("participant-joined", (event) => {
        console.log("[AgentCallUI] event participant-joined", event);
        updateParticipants();
      });
      call.on("participant-updated", (event) => {
        console.log("[AgentCallUI] event participant-updated", event);
        updateParticipants();
      });
      call.on("participant-left", (event) => {
        console.log("[AgentCallUI] event participant-left", event);
        updateParticipants();
      });
      call.on("app-message", (ev: { data?: { text?: string; message?: string } }) => {
        console.log("[AgentCallUI] event app-message", ev);
        const text = ev?.data?.text ?? ev?.data?.message;
        if (text) showToast(text);
      });

      console.log("[AgentCallUI] joining meeting", { roomUrl });
      await call.join({
        url: roomUrl,
        token,
        audioSource: true,
        videoSource: false,
      });
      console.log("[AgentCallUI] join complete");

      setMicEnabled(Boolean(call.localAudio()));
      updateParticipants();
    } catch (error) {
      console.error(error);
      await stopSession();
    } finally {
      console.log("[AgentCallUI] start call flow complete");
      setIsConnecting(false);
    }
  }, [isConnecting, showToast, stopSession, updateParticipants]);

  const handleToggleMic = useCallback(async () => {
    if (!callRef.current) return;
    console.log("[AgentCallUI] handleToggleMic", { current: micEnabled, next: !micEnabled });
    setMicPending(true);
    try {
      const nextValue = !micEnabled;
      await callRef.current.setLocalAudio(nextValue);
      setMicEnabled(nextValue);
    } catch (error) {
      console.error("Failed to toggle mic", error);
    } finally {
      setMicPending(false);
    }
  }, [micEnabled]);

  const handleSendMessage = useCallback(async () => {
    const text = message.trim();
    if (!text || !callRef.current) return;
    console.log("[AgentCallUI] handleSendMessage", { text });
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
  }, [message, showToast]);

  const activeWidth = customActiveWidth ?? activeSize.width;
  const activeHeight = customActiveHeight ?? activeSize.height;
  const placeholderVideo = placeholderVideoUrl ?? DEFAULT_PLACEHOLDER_VIDEO;
  const avatarJoined = participants.some((p) => !p.local && isAvatarParticipant(p));
  const compactLayout = !avatarJoined;
  const videoTrack = pickRemoteVideoTrack(participants);

  useEffect(() => {
    console.log("[AgentCallUI] state isConnecting", isConnecting);
  }, [isConnecting]);

  useEffect(() => {
    console.log("[AgentCallUI] state isConnected", isConnected);
  }, [isConnected]);

  useEffect(() => {
    console.log("[AgentCallUI] state sessionState", sessionState);
  }, [sessionState]);

  useEffect(() => {
    console.log("[AgentCallUI] state participants", {
      total: participants.length,
      avatarJoined,
    });
  }, [participants, avatarJoined]);

  useEffect(() => {
    console.log("[AgentCallUI] state compactLayout", compactLayout);
  }, [compactLayout]);

  useEffect(() => {
    console.log("[AgentCallUI] state videoTrack", videoTrack?.id ?? null);
  }, [videoTrack]);

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
