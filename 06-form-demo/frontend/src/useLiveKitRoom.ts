import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  Participant,
  ParticipantEvent,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  TranscriptionSegment,
} from "livekit-client";
import type {
  DemoStage,
  PipelineTimes,
  SidebarState,
  TranscriptInterim,
  TranscriptLine,
} from "./demoTypes";

/** Same topic LiveKit Agents RoomIO registers — see `TOPIC_CHAT` in Python SDK */
const CHAT_TOPIC = "lk.chat";
/** Agent + user captions from Agents RoomIO (`TOPIC_TRANSCRIPTION`); see multimodal text docs */
const TRANSCRIPTION_TOPIC = "lk.transcription";

function newLineId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEMO_TOPIC = "demo";
/** LemonSlice RPC topic — must match plugin / docs */
const LEMONSLICE_TOPIC = "lemonslice";

function assignFinite(prev: PipelineTimes, patch: Partial<PipelineTimes>): PipelineTimes {
  const next = { ...prev };
  (Object.keys(patch) as (keyof PipelineTimes)[]).forEach((k) => {
    const v = patch[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      (next as Record<string, unknown>)[k] = v;
    }
  });
  return next;
}

function applyPipelineMetrics(prev: PipelineTimes, msg: Record<string, unknown>): PipelineTimes {
  if (msg.type !== "metrics") return prev;
  let next = prev;
  const patch: Partial<PipelineTimes> = {};
  if (typeof msg.stt_ms === "number") patch.sttMs = msg.stt_ms;
  if (typeof msg.llm_ms === "number") patch.llmMs = msg.llm_ms;
  if (typeof msg.tts_ms === "number") patch.ttsMs = msg.tts_ms;
  if (typeof msg.video_ms === "number") patch.videoMs = msg.video_ms;
  if (typeof msg.gap_llm_ms === "number") patch.gapLlmMs = msg.gap_llm_ms;
  if (typeof msg.gap_tts_ms === "number") patch.gapTtsMs = msg.gap_tts_ms;
  if (typeof msg.gap_video_ms === "number") patch.gapVideoMs = msg.gap_video_ms;
  if (typeof msg.video_ttfb_ms === "number") patch.videoTtfbMs = msg.video_ttfb_ms;
  next = assignFinite(next, patch);
  return next;
}

/** Normalize a numeric latency from LemonSlice RPC (seconds as float vs ms int). */
function parseLemonsliceLatencyMs(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  if (!Number.isInteger(raw) && raw < 30) return Math.round(raw * 1000);
  return Math.round(raw);
}

/**
 * LemonSlice `metric` segment duration only (never persists `time_to_first_push` — that is TTFB, not bar length).
 * May use first/last push internally to derive a span when both are present.
 */
function parseLemonsliceVideoSegmentMs(payload: Record<string, unknown>): number | null {
  const firstPush = parseLemonsliceLatencyMs(payload.time_to_first_push ?? payload.timeToFirstPush);

  const explicitDuration =
    parseLemonsliceLatencyMs(payload.video_duration_ms) ??
    parseLemonsliceLatencyMs(payload.videoDurationMs) ??
    parseLemonsliceLatencyMs(payload.segment_duration_ms) ??
    parseLemonsliceLatencyMs(payload.segmentDurationMs) ??
    parseLemonsliceLatencyMs(payload.generation_duration_ms) ??
    parseLemonsliceLatencyMs(payload.generationDurationMs);

  const lastPush = parseLemonsliceLatencyMs(payload.time_to_last_push ?? payload.timeToLastPush);
  let segmentMs: number | null = explicitDuration ?? null;

  if (segmentMs == null && firstPush != null && lastPush != null && lastPush >= firstPush) {
    segmentMs = lastPush - firstPush;
  }

  return segmentMs != null && segmentMs > 0 ? segmentMs : null;
}

function parseLemonsliceVideoTtfbMs(payload: Record<string, unknown>): number | null {
  const firstPush = parseLemonsliceLatencyMs(payload.time_to_first_push ?? payload.timeToFirstPush);
  return firstPush != null && firstPush > 0 ? firstPush : null;
}

const emptySidebar = (): SidebarState => ({
  stage: "intro",
  email: null,
  selected_date: null,
  selected_slot: null,
  confirmed: false,
  ui_hint: null,
});

export function useLiveKitRoom(tokenUrl: string) {
  const roomRef = useRef<Room | null>(null);
  const connectBusyRef = useRef(false);
  const transcriptionReceivedCbRef = useRef<
    ((segments: TranscriptionSegment[], participant?: Participant) => void) | null
  >(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [sidebar, setSidebar] = useState<SidebarState>(emptySidebar);
  const [pipeline, setPipeline] = useState<PipelineTimes>({
    sttMs: null,
    llmMs: null,
    ttsMs: null,
    videoMs: null,
    gapLlmMs: null,
    gapTtsMs: null,
    gapVideoMs: null,
    videoTtfbMs: null,
  });
  /** LemonSlice avatar pipeline warm — same signal as lemonslice-examples `bot_ready` on topic `lemonslice`. */
  const [avatarJoined, setAvatarJoined] = useState(false);

  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [interim, setInterim] = useState<TranscriptInterim>({});
  const [micEnabled, setMicEnabled] = useState(false);

  useEffect(() => {
    if (!room) {
      setMicEnabled(false);
      return;
    }
    const syncMic = () => {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      setMicEnabled(Boolean(pub?.track && !pub.isMuted));
    };
    syncMic();
    const lp = room.localParticipant;
    lp.on(ParticipantEvent.TrackMuted, syncMic);
    lp.on(ParticipantEvent.TrackUnmuted, syncMic);
    lp.on(ParticipantEvent.LocalTrackPublished, syncMic);
    lp.on(ParticipantEvent.LocalTrackUnpublished, syncMic);
    return () => {
      lp.off(ParticipantEvent.TrackMuted, syncMic);
      lp.off(ParticipantEvent.TrackUnmuted, syncMic);
      lp.off(ParticipantEvent.LocalTrackPublished, syncMic);
      lp.off(ParticipantEvent.LocalTrackUnpublished, syncMic);
    };
  }, [room]);

  const disconnect = useCallback(async () => {
    setAvatarJoined(false);
    const r = roomRef.current;
    if (r) {
      if (transcriptionReceivedCbRef.current) {
        r.off(RoomEvent.TranscriptionReceived, transcriptionReceivedCbRef.current);
        transcriptionReceivedCbRef.current = null;
      }
      try {
        r.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
      } catch {
        /* no handler registered */
      }
    }
    roomRef.current = null;
    setRoom(null);
    setTranscript([]);
    setInterim({});
    if (r) await r.disconnect();
    setConnectionState(ConnectionState.Disconnected);
    setSidebar(emptySidebar());
    setPipeline({
      sttMs: null,
      llmMs: null,
      ttsMs: null,
      videoMs: null,
      gapLlmMs: null,
      gapTtsMs: null,
      gapVideoMs: null,
      videoTtfbMs: null,
    });
  }, []);

  const connect = useCallback(async (roomName: string) => {
    if (roomRef.current || connectBusyRef.current) return;
    connectBusyRef.current = true;
    try {
      const params = new URLSearchParams({
        room: roomName,
        identity: `web-${Math.random().toString(36).slice(2, 10)}`,
      });
      const base = tokenUrl.replace(/\/$/, "");
      const tokenEndpoint = base ? `${base}/api/token` : "/api/token";
      const res = await fetch(`${tokenEndpoint}?${params.toString()}`);
      if (!res.ok) throw new Error(`token ${res.status}`);
      const { token, url } = (await res.json()) as { token: string; url: string };

      const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = nextRoom;
      setRoom(nextRoom);

      const onData = (payload: Uint8Array, _participant: RemoteParticipant | undefined, _k: unknown, topic?: string) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(new TextDecoder().decode(payload));
        } catch {
          return;
        }

        // LemonSlice RPC — see https://lemonslice-jp-docs-4-27.mintlify.app/self-managed/integrations/livekit-agent-integration
        if (topic === LEMONSLICE_TOPIC) {
          const o = parsed as Record<string, unknown>;
          if (o.type === "bot_ready") {
            setAvatarJoined(true);
            return;
          }
          if (o.type === "metric") {
            const segmentMs = parseLemonsliceVideoSegmentMs(o);
            const ttfbMs = parseLemonsliceVideoTtfbMs(o);
            if (segmentMs != null || ttfbMs != null) {
              setPipeline((p) => assignFinite(p, { videoMs: segmentMs ?? undefined, videoTtfbMs: ttfbMs ?? undefined }));
            }
            return;
          }
          return;
        }

        if (topic !== DEMO_TOPIC) return;
        const msg = parsed as Record<string, unknown>;
        if (msg.type === "state") {
          setSidebar({
            stage: (msg.stage as DemoStage) || "intro",
            email: (msg.email as string) ?? null,
            selected_date: (msg.selected_date as string) ?? null,
            selected_slot: (msg.selected_slot as string) ?? null,
            confirmed: Boolean(msg.confirmed),
            ui_hint: (msg.ui_hint as string) ?? null,
          });
        }
        if (msg.type === "metrics") {
          setPipeline((prev) => applyPipelineMetrics(prev, msg));
        }
      };

      nextRoom.on(RoomEvent.DataReceived, onData);
      nextRoom.on(RoomEvent.ConnectionStateChanged, () => setConnectionState(nextRoom.state));

      // User STT: RoomIO forwards via legacy publish_transcription → TranscriptionReceived only.
      // Agent text: lk.transcription streams (avatar replaces mic so legacy agent captions often have no track_id).
      // Do not handle user on both TranscriptionReceived and text streams — RoomIO duplicates user text on both paths.
      const onTranscriptionReceived = (segments: TranscriptionSegment[], participant?: Participant) => {
        if (!participant) return;
        if (participant.identity.includes("lemonslice")) return;
        if (participant.identity !== nextRoom.localParticipant.identity) return;

        const text = segments.map((s) => s.text).join("").trim();
        if (!text) return;
        const anyFinal = segments.some((s) => s.final);
        const committed = segments
          .filter((s) => s.final)
          .map((s) => s.text)
          .join("")
          .trim();

        if (anyFinal && committed) {
          setTranscript((prev) => [...prev, { id: newLineId(), role: "user", text: committed }]);
          setInterim((prev) => {
            const next = { ...prev };
            delete next.user;
            return next;
          });
        } else {
          setInterim((prev) => ({ ...prev, user: text }));
        }
      };
      transcriptionReceivedCbRef.current = onTranscriptionReceived;
      nextRoom.on(RoomEvent.TranscriptionReceived, onTranscriptionReceived);

      nextRoom.registerTextStreamHandler(TRANSCRIPTION_TOPIC, async (reader, participantInfo) => {
        const sid = participantInfo.identity;
        if (sid.includes("lemonslice")) return;
        // User captions: handled above (RoomIO also mirrors user on lk.transcription — skip to avoid duplicates).
        if (sid === nextRoom.localParticipant.identity) return;

        let accumulated = "";
        try {
          for await (const chunk of reader) {
            accumulated += chunk;
            const t = accumulated.trim();
            if (t) setInterim((prev) => ({ ...prev, agent: t }));
          }
          const text = accumulated.trim();
          if (text) {
            setTranscript((prev) => [...prev, { id: newLineId(), role: "agent", text }]);
          }
          setInterim((prev) => {
            const next = { ...prev };
            delete next.agent;
            return next;
          });
        } catch {
          /* stream aborted or decode error */
        }
      });

      await nextRoom.connect(url, token);
      setConnectionState(nextRoom.state);

      await nextRoom.startAudio();

      const mic = await nextRoom.localParticipant.setMicrophoneEnabled(true);
      if (!mic) throw new Error("Microphone permission denied");
    } finally {
      connectBusyRef.current = false;
    }
  }, [tokenUrl]);

  const sendUiEvent = useCallback(async (payload: Record<string, unknown>) => {
    const r = roomRef.current;
    if (!r) return;
    const data = new TextEncoder().encode(JSON.stringify({ type: "ui_event", ...payload }));
    await r.localParticipant.publishData(data, { reliable: true, topic: DEMO_TOPIC });
  }, []);

  const toggleMicrophone = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const pub = r.localParticipant.getTrackPublication(Track.Source.Microphone);
    const on = Boolean(pub?.track && !pub.isMuted);
    await r.localParticipant.setMicrophoneEnabled(!on);
  }, []);

  const sendChat = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const r = roomRef.current;
    if (!r) return;
    let agentIdentity: string | undefined;
    for (const p of r.remoteParticipants.values()) {
      if (!p.identity.includes("lemonslice")) {
        agentIdentity = p.identity;
        break;
      }
    }
    if (!agentIdentity) {
      console.warn("No agent participant yet; cannot send chat text");
      return;
    }
    setTranscript((prev) => [...prev, { id: newLineId(), role: "user", text }]);
    await r.localParticipant.sendText(text, {
      topic: CHAT_TOPIC,
      destinationIdentities: [agentIdentity],
    });
  }, []);

  return {
    connect,
    disconnect,
    connectionState,
    sidebar,
    pipeline,
    avatarJoined,
    sendUiEvent,
    sendChat,
    transcript,
    interim,
    room,
    micEnabled,
    toggleMicrophone,
  };
}
