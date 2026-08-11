"use client";

import { useEffect, useRef } from "react";
import type { VideoTrack } from "livekit-client";
import { cn } from "@/lib/utils";

const COMPACT_SIZE_PX = 250;

type AgentVideoViewProps = {
  /** When true, the frame is a ringing circle; when false, the full call frame. */
  compact: boolean;
  /** Ignored while compact, which is always a fixed-size circle. */
  width?: number;
  height?: number;
  placeholderVideoUrl?: string | null;
  agentVideoTrack: VideoTrack | null;
  className?: string;
};

export function AgentVideoView({
  compact,
  width = COMPACT_SIZE_PX,
  height = COMPACT_SIZE_PX,
  placeholderVideoUrl,
  agentVideoTrack,
  className,
}: AgentVideoViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    const track = agentVideoTrack;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [agentVideoTrack]);

  const hasAgentVideo = agentVideoTrack != null;
  const frameSize = {
    width: compact ? COMPACT_SIZE_PX : width,
    height: compact ? COMPACT_SIZE_PX : height,
  };

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={frameSize}
    >
      {compact
        ? [0, 500, 1000, 1500].map((delay, index) => (
            <span
              key={delay}
              aria-hidden
              className="pointer-events-none absolute inset-0 origin-center animate-ring-ripple rounded-full border-[3px]"
              style={{
                animationDelay: `${delay}ms`,
                borderColor: `hsl(var(--foreground) / ${0.45 - index * 0.08})`,
              }}
            />
          ))
        : null}

      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden bg-muted",
          compact ? "rounded-full" : "rounded-3xl",
          compact && "z-[1] origin-center animate-ring-pulse will-change-transform",
        )}
        style={frameSize}
      >
        {placeholderVideoUrl && !hasAgentVideo ? (
          <video
            src={placeholderVideoUrl}
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            autoPlay
            loop
            muted
          />
        ) : null}

        {hasAgentVideo ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={compact ? undefined : { aspectRatio: `${width} / ${height}` }}
            playsInline
            autoPlay
            muted
          />
        ) : (
          !placeholderVideoUrl && (
            <div className="z-[1] px-4 text-center text-sm text-muted-foreground">
              {compact ? "Connecting…" : "Waiting for the avatar…"}
            </div>
          )
        )}
      </div>
    </div>
  );
}
