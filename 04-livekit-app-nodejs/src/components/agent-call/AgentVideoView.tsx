"use client";

import { useEffect, useRef } from "react";
import type { VideoTrack } from "livekit-client";
import { cn } from "@/lib/utils";

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
        "relative overflow-hidden bg-muted flex items-center justify-center",
        compact ? "rounded-full" : "rounded-3xl",
        className,
      )}
      style={{
        width: compact ? 250 : width,
        height: compact ? 250 : height,
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
  );
}
