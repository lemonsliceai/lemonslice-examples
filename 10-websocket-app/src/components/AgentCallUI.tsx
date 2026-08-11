"use client";

/**
 * 1. `POST /api/session` mints the LiveKit room and a subscribe-only viewer token.
 * 2. `WS /api/bridge/:id` provisions the LemonSlice session, then carries microphone
 *    PCM16 up and conversation events down.
 * 3. LiveKit is subscribe-only — the avatar is the only thing published.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { BridgeEventLog, type LogEntry } from "@/components/agent-call/BridgeEventLog";
import { LiveKitCallView } from "@/components/agent-call/LiveKitCallView";
import { PanelResizeHandle } from "@/components/agent-call/PanelResizeHandle";
import { PreJoinPreview } from "@/components/agent-call/PreJoinPreview";
import { RingingView } from "@/components/agent-call/RingingView";
import { useActiveSize } from "@/hooks/useActiveSize";
import { useRingtone } from "@/hooks/useRingtone";
import {
  connectBridge,
  createSession,
  type BridgeConnection,
  type BridgeEvent,
  type SessionInfo,
} from "@/lib/bridge";
import { startMicCapture, type MicCapture } from "@/lib/mic";

const PLACEHOLDER_VIDEO = "/welcome.mp4";
const MIC_LEVEL_INTERVAL_MS = 100;
const TOAST_DURATION_MS = 3000;
const MAX_LOG_ENTRIES = 200;
const DEFAULT_PANEL_FRACTION = 0.3;
const MIN_PANEL_FRACTION = 0.2;
const MAX_PANEL_FRACTION = 0.5;

type CallPhase = "idle" | "ringing" | "live";

export default function AgentCallUI() {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [avatarReady, setAvatarReady] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [panelFraction, setPanelFraction] = useState(DEFAULT_PANEL_FRACTION);

  const bridgeRef = useRef<BridgeConnection | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextEventId = useRef(0);
  const callGeneration = useRef(0);
  const { width, height } = useActiveSize(1 - panelFraction);

  useRingtone(phase !== "idle" && !avatarReady);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(""), TOAST_DURATION_MS);
  }, []);

  const teardown = useCallback(async () => {
    callGeneration.current += 1;
    bridgeRef.current?.close();
    bridgeRef.current = null;

    const mic = micRef.current;
    micRef.current = null;
    await mic?.stop().catch(() => {});

    if (toastTimer.current) clearTimeout(toastTimer.current);
    setSession(null);
    setPhase("idle");
    setAvatarReady(false);
    setAvatarSpeaking(false);
    setMicLevel(0);
    setMuted(false);
    setMessage("");
    setToast("");
  }, []);

  useEffect(() => {
    return () => {
      callGeneration.current += 1;
      bridgeRef.current?.close();
      void micRef.current?.stop().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    const timer = window.setInterval(
      () => setMicLevel(micRef.current?.getLevel() ?? 0),
      MIC_LEVEL_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  const handleEvent = useCallback(
    (event: BridgeEvent) => {
      setEvents((entries) =>
        [...entries, { id: nextEventId.current++, at: Date.now(), event }].slice(-MAX_LOG_ENTRIES),
      );

      switch (event.type) {
        case "user_transcript":
          showToast(event.text);
          break;
        case "avatar_state":
          setAvatarSpeaking(event.speaking);
          break;
        case "agent_closed":
          showToast(`ElevenLabs closed: ${event.reason}`);
          break;
        case "tunnel_closed":
          void teardown();
          break;
        case "error":
          showToast(event.message);
          break;
        default:
          break;
      }
    },
    [showToast, teardown],
  );

  const handleStartCall = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("ringing");
    setEvents([]);

    try {
      const created = await createSession();
      bridgeRef.current = connectBridge(created.bridge_id, {
        onEvent: handleEvent,
        onClose: () => void teardown(),
        onError: () => console.error("Bridge socket error"),
      });
      setSession(created);
      setPhase("live");
    } catch (error) {
      console.error(error);
      await teardown();
    }
  }, [handleEvent, phase, teardown]);

  // The mic opens only once the avatar is on screen, so nothing is captured
  // while LemonSlice is still booting.
  const handleAvatarReady = useCallback(async () => {
    setAvatarReady(true);
    const bridge = bridgeRef.current;
    if (!bridge || micRef.current) return;
    const generation = callGeneration.current;
    try {
      const mic = await startMicCapture((pcm16) => bridge.sendAudio(pcm16));
      if (generation !== callGeneration.current) {
        await mic.stop().catch(() => {});
        return;
      }
      micRef.current = mic;
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      micRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleSendMessage = useCallback(() => {
    const text = message.trim();
    if (!text) return;
    bridgeRef.current?.sendUserMessage(text);
    setMessage("");
    showToast(text);
  }, [message, showToast]);

  const handleInterrupt = useCallback(() => bridgeRef.current?.sendInterrupt(), []);
  const handleHangUp = useCallback(() => void teardown(), [teardown]);

  const handleResize = useCallback((fraction: number) => {
    setPanelFraction(Math.min(MAX_PANEL_FRACTION, Math.max(MIN_PANEL_FRACTION, fraction)));
  }, []);

  return (
    <div
      // Only consumed at lg, where the two panes sit side by side.
      style={{ "--panel-width": `${panelFraction * 100}%` } as CSSProperties}
      className="flex min-h-screen w-full flex-col lg:h-screen lg:flex-row lg:overflow-hidden"
    >
      <div className="flex min-h-[50vh] w-full flex-1 flex-col items-center justify-center p-4 lg:h-full lg:min-h-0 lg:w-auto lg:min-w-0">
        {phase === "idle" ? (
          <PreJoinPreview placeholderVideo={PLACEHOLDER_VIDEO} onStartCall={handleStartCall} />
        ) : (
          <>
            {avatarReady ? null : <RingingView placeholderVideo={PLACEHOLDER_VIDEO} />}
            {session ? (
              <LiveKitCallView
                ready={avatarReady}
                serverUrl={session.livekit_url}
                token={session.livekit_token}
                width={width}
                height={height}
                placeholderVideo={PLACEHOLDER_VIDEO}
                muted={muted}
                micLevel={micLevel}
                avatarSpeaking={avatarSpeaking}
                message={message}
                toast={toast}
                onMessageChange={setMessage}
                onSendMessage={handleSendMessage}
                onToggleMute={handleToggleMute}
                onInterrupt={handleInterrupt}
                onAvatarReady={handleAvatarReady}
                onHangUp={handleHangUp}
              />
            ) : null}
          </>
        )}
      </div>

      <PanelResizeHandle onResize={handleResize} />

      <BridgeEventLog
        entries={events}
        className="min-h-[40vh] w-full border-t border-border lg:h-full lg:min-h-0 lg:w-[var(--panel-width)] lg:shrink-0 lg:border-t-0"
      />
    </div>
  );
}
