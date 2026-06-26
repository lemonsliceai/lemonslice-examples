"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { PlaceholderMedia } from "@/components/agent-call/PlaceholderMedia";
import { ChromaKeyVideo } from "@/components/agent-call/ChromaKeyVideo";
import { LandscapeAnimatedBackground } from "@/components/agent-call/LandscapeAnimatedBackground";

const COMPACT_SIZE_PX = 250;

type AgentVideoViewProps = {
  /** Ringing: small circle. Active call: 16:9 landscape with centered 1:1 square video. */
  compact: boolean;
  width: number;
  height: number;
  placeholderVideoUrl?: string | null;
  agentVideoTrack: MediaStreamTrack | null;
  className?: string;
};

/**
 * Active call: animated 16:9 background with chroma-keyed 1:1 avatar composited on top.
 * Ringing: compact circle with optional placeholder (no chroma key).
 */
export function AgentVideoView({
  compact,
  width,
  height,
  placeholderVideoUrl,
  agentVideoTrack,
  className,
}: AgentVideoViewProps) {
  const videoElRef = useRef<HTMLVideoElement>(null);
  const hasAgentVideo = agentVideoTrack != null;
  const showPlaceholder = compact && !hasAgentVideo && !!placeholderVideoUrl;
  const squareSize = compact ? COMPACT_SIZE_PX : height;

  // Ringing / compact: plain video (no chroma key)
  useEffect(() => {
    if (!compact) return;
    const el = videoElRef.current;
    if (!el || !agentVideoTrack) return;
    const stream = new MediaStream([agentVideoTrack]);
    el.srcObject = stream;
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [compact, agentVideoTrack]);

  if (!compact) {
    return (
      <div
        className={cn("relative overflow-hidden rounded-3xl", className)}
        style={{ width, height }}
      >
        <LandscapeAnimatedBackground className="z-0" />
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
          <div
            className="relative shrink-0 overflow-hidden"
            style={{ width: squareSize, height: squareSize }}
          >
            {hasAgentVideo ? (
              <ChromaKeyVideo track={agentVideoTrack} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                Waiting for agent…
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("relative flex items-center justify-center overflow-visible", className)}
      style={{ width: COMPACT_SIZE_PX, height: COMPACT_SIZE_PX }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full border-2 border-foreground/25 origin-center animate-ring-ripple"
      />
      <div
        className="relative z-[1] overflow-hidden rounded-full bg-muted"
        style={{ width: COMPACT_SIZE_PX, height: COMPACT_SIZE_PX }}
      >
        {showPlaceholder ? <PlaceholderMedia url={placeholderVideoUrl!} /> : null}
        <video
          ref={videoElRef}
          className={cn(
            "absolute inset-0 z-10 h-full w-full object-cover",
            !hasAgentVideo && "invisible",
          )}
          playsInline
          autoPlay
        />
        {!hasAgentVideo && !showPlaceholder ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
            Waiting for agent…
          </div>
        ) : null}
      </div>
    </div>
  );
}
