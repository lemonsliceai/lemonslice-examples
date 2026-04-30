export type DemoStage = "intro" | "schedule" | "done";

export type SidebarState = {
  stage: DemoStage;
  email?: string | null;
  selected_date?: string | null;
  selected_slot?: string | null;
  confirmed?: boolean;
  ui_hint?: string | null;
};

export type PipelineTimes = {
  sttMs: number | null;
  llmMs: number | null;
  ttsMs: number | null;
  /**
   * Avatar video segment length (first → last frame) when LemonSlice sends an explicit duration.
   * If absent, the HUD falls back to `ttsMs` for bar length (lip-sync tracks synthesized speech).
   */
  videoMs: number | null;
  /** ms offset from STT start → LLM start (streaming stagger / “TTFB” between stages). */
  gapLlmMs: number | null;
  /** ms offset from LLM start → TTS start (typically ≈ LLM TTFT). */
  gapTtsMs: number | null;
  /** ms offset from TTS start → Video start (typically ≈ TTS TTFB into avatar). */
  gapVideoMs: number | null;
  /** ms from avatar/video step start → first rendered video chunk (LemonSlice first push). */
  videoTtfbMs: number | null;
};

/** One committed line in the sidebar transcript (voice STT + typed chat). */
export type TranscriptLine = {
  id: string;
  role: "user" | "agent";
  text: string;
};

export type TranscriptInterim = {
  user?: string;
  agent?: string;
};
