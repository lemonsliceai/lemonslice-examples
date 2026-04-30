import { useMemo } from "react";
import type { PipelineTimes } from "../demoTypes";
import { LemonSliceLogo } from "./LemonSliceLogo";

type GanttSeg = { label: string; startMs: number; durMs: number | null; ttfbMs: number | null };

/** Bar length: LemonSlice segment duration when present; else TTS duration (lip-sync). */
function videoBarDurationMs(p: PipelineTimes): number | null {
  if (p.videoMs != null && p.videoMs > 0) return p.videoMs;
  if (p.ttsMs != null && p.ttsMs > 0) return p.ttsMs;
  return null;
}

function buildSegments(p: PipelineTimes): { segments: GanttSeg[]; spanMs: number } {
  const gapLlm = p.gapLlmMs ?? 0;
  const gapTts = p.gapTtsMs ?? 0;
  const gapVid = p.gapVideoMs ?? 0;

  const startLlm = gapLlm;
  const startTts = gapLlm + gapTts;
  const startVideo = gapLlm + gapTts + gapVid;

  const videoDur = videoBarDurationMs(p);

  const segments: GanttSeg[] = [
    { label: "STT", startMs: 0, durMs: p.sttMs, ttfbMs: null },
    { label: "LLM", startMs: startLlm, durMs: p.llmMs, ttfbMs: p.gapTtsMs },
    { label: "TTS", startMs: startTts, durMs: p.ttsMs, ttfbMs: p.gapVideoMs },
    { label: "Video", startMs: startVideo, durMs: videoDur, ttfbMs: p.videoTtfbMs },
  ];

  const ends = segments.map((s) => s.startMs + (s.durMs ?? 0));
  const spanMs = Math.max(1, ...ends);

  return { segments, spanMs };
}

function GanttRow({
  label,
  startMs,
  durMs,
  ttfbMs,
  spanMs,
}: {
  label: string;
  startMs: number;
  durMs: number | null;
  ttfbMs: number | null;
  spanMs: number;
}) {
  const hasData = durMs != null && durMs > 0;
  const leftPct = spanMs > 0 ? (startMs / spanMs) * 100 : 0;
  const widthPct = hasData && spanMs > 0 ? (durMs! / spanMs) * 100 : 0;
  const isStt = label === "STT";
  const ttfbValue =
    !isStt && ttfbMs != null && ttfbMs > 0 ? ttfbMs : !isStt && durMs != null && durMs > 0 ? durMs : null;
  const ttfbHoverText = !isStt && ttfbValue != null && ttfbValue > 0 ? `${ttfbValue}ms TTFB` : "";
  const sttDurationText = isStt && hasData ? `${durMs}ms` : "";

  return (
    <div className="mb-2 grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[11px] text-white/100">{label}</span>
      <div className="group/bar relative h-5 min-h-[20px] overflow-visible rounded bg-white/10">
        {hasData ? (
          <div
            className="absolute bottom-0 top-0 min-w-[3px] rounded-[3px] bg-white/[0.14]"
            style={{
              left: `${leftPct}%`,
              width: `${Math.max(widthPct, 0.35)}%`,
            }}
          />
        ) : null}
        {hasData && isStt ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums text-white/100 opacity-0 transition-opacity duration-150 group-hover/bar:opacity-100">
            {sttDurationText}
          </span>
        ) : hasData && ttfbHoverText ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums text-white/100 opacity-0 transition-opacity duration-150 group-hover/bar:opacity-100">
            {ttfbHoverText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PipelineHud({ pipeline }: { pipeline: PipelineTimes }) {
  const { segments, spanMs } = useMemo(() => buildSegments(pipeline), [pipeline]);
  const anyData = segments.some((s) => s.durMs != null && s.durMs > 0);

  return (
    <aside className="w-full min-w-0 rounded-[10px] border border-white/25 bg-black p-3 font-geist-mono text-[11px] text-white/50">
      <div className="mb-2 min-w-0">
        <LemonSliceLogo forceShowText fill="#fafafa" className="!justify-start" />
      </div>
      <header className="mb-3">
        This agent can dynamically fill out forms for you. Try asking the agent to schedule a demo. 
      </header>
      <div className="w-full min-w-0">
        {anyData && (
          segments.map((s) => (
            <GanttRow key={s.label} label={s.label} startMs={s.startMs} durMs={s.durMs} ttfbMs={s.ttfbMs} spanMs={spanMs} />
          ))
        )}
      </div>
    </aside>
  );
}
