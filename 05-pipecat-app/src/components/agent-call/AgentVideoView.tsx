"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type AgentVideoViewProps = {
  compact: boolean;
  width: number;
  height: number;
  placeholderVideoUrl?: string | null;
  agentVideoTrack: MediaStreamTrack | null;
  className?: string;
};

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
    if (!el || !agentVideoTrack) return;
    const stream = new MediaStream([agentVideoTrack]);
    el.srcObject = stream;
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
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
          <div className="text-muted-foreground text-sm z-[1]">Waiting for agent...</div>
        )
      )}
    </div>
  );
}
