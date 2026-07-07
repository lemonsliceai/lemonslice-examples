"use client";

import { useEffect, useRef } from "react";
import type { VideoTrack } from "livekit-client";
import { cn } from "@/lib/utils";

const COMPACT_SIZE_PX = 250;

type AgentVideoViewProps = {
  /** When false, the frame is a small circle; when true, a large rounded rectangle. */
  compact: boolean;
  width: number;
  height: number;
  placeholderVideoUrl?: string | null;
  /** Remote agent video track, or null until the agent publishes. */
  agentVideoTrack: VideoTrack | null;
  className?: string;
};

/**
 * Video area: optional looping placeholder underneath, agent video on top when available.
 * The parent passes `agentVideoTrack` so we only subscribe to agent video once (in the parent).
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

  useEffect(() => {
    const el = videoElRef.current;
    const track = agentVideoTrack;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [agentVideoTrack]);

  const hasAgentVideo = agentVideoTrack != null;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        compact && "overflow-visible",
        className,
      )}
      style={{
        width: compact ? COMPACT_SIZE_PX : width,
        height: compact ? COMPACT_SIZE_PX : height,
      }}
    >
      {compact ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-foreground/45 origin-center animate-ring-ripple"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-foreground/38 origin-center animate-ring-ripple [animation-delay:500ms]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-foreground/30 origin-center animate-ring-ripple [animation-delay:1000ms]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-foreground/22 origin-center animate-ring-ripple [animation-delay:1500ms]"
          />
        </>
      ) : null}
      <div
        className={cn(
          "relative overflow-hidden bg-muted flex items-center justify-center",
          compact ? "rounded-full" : "rounded-3xl",
          compact && "z-[1] origin-center animate-ring-pulse will-change-transform",
        )}
        style={{
          width: compact ? COMPACT_SIZE_PX : width,
          height: compact ? COMPACT_SIZE_PX : height,
        }}
      >
      {placeholderVideoUrl ? (
        <video
          src={placeholderVideoUrl}
          className="absolute inset-0 w-full h-full object-cover"
          style={compact ? {} : { aspectRatio: `${width} / ${height}` }}
          playsInline
          autoPlay
          loop
          muted
        />
      ) : null}
      {hasAgentVideo ? (
        <video
          ref={videoElRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={compact ? {} : { aspectRatio: `${width} / ${height}` }}
          playsInline
        />
      ) : (
        !placeholderVideoUrl && (
          <div className="text-muted-foreground text-sm z-[1]">Waiting for agent…</div>
        )
      )}
      </div>
    </div>
  );
}
