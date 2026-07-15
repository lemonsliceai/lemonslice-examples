"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoTrack } from "livekit-client";
import { cn } from "@/lib/utils";
import {
  isLivekitWebGLAvailable,
  LivekitVideoWebGLCanvas,
} from "@/components/livekit-video-webgl-canvas";

const COMPACT_SIZE_PX = 250;

/** Match `rounded-3xl` in this example. */
const CALL_CORNER_RADIUS_PX = 24;

type AgentVideoViewProps = {
  /** When false, the frame is a small circle; when true, a large rounded rectangle. */
  compact: boolean;
  width: number;
  height: number;
  placeholderVideoUrl?: string | null;
  /** Remote agent video track, or null until the agent publishes. */
  agentVideoTrack: VideoTrack | null;
  /** Drives `transitionLoading` → edgeLoading iridescent ring on the video canvas. */
  imageTransitioning?: boolean;
  className?: string;
};

/**
 * Video area: optional looping placeholder underneath, agent video on top when available.
 * Expanded call uses `LivekitVideoWebGLCanvas` for the iridescent edge ring.
 */
export function AgentVideoView({
  compact,
  width,
  height,
  placeholderVideoUrl,
  agentVideoTrack,
  imageTransitioning = false,
  className,
}: AgentVideoViewProps) {
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [webglOk, setWebglOk] = useState(false);

  useEffect(() => {
    setWebglOk(isLivekitWebGLAvailable());
  }, []);

  useEffect(() => {
    const el = liveVideoRef.current;
    const track = agentVideoTrack;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [agentVideoTrack]);

  const hasAgentVideo = agentVideoTrack != null;
  const useWebGl = webglOk && hasAgentVideo && !compact;

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
          "relative flex items-center justify-center bg-muted",
          compact ? "overflow-hidden rounded-full" : useWebGl ? "overflow-visible" : "overflow-hidden rounded-3xl",
          compact && "z-[1] origin-center animate-ring-pulse will-change-transform",
        )}
        style={{
          width: compact ? COMPACT_SIZE_PX : width,
          height: compact ? COMPACT_SIZE_PX : height,
        }}
      >
        {placeholderVideoUrl && !hasAgentVideo ? (
          <video
            src={placeholderVideoUrl}
            className="absolute inset-0 h-full w-full object-cover"
            style={compact ? {} : { aspectRatio: `${width} / ${height}` }}
            playsInline
            autoPlay
            loop
            muted
          />
        ) : null}

        {hasAgentVideo ? (
          <video
            ref={liveVideoRef}
            className={cn(
              "absolute inset-0 h-full w-full object-cover",
              useWebGl
                ? "pointer-events-none h-px w-px opacity-0"
                : null,
            )}
            style={compact ? {} : { aspectRatio: `${width} / ${height}` }}
            playsInline
            muted
            autoPlay
          />
        ) : (
          !placeholderVideoUrl && (
            <div className="z-[1] text-sm text-muted-foreground">Waiting for agent…</div>
          )
        )}

        {useWebGl ? (
          <LivekitVideoWebGLCanvas
            liveVideoRef={liveVideoRef}
            callExpanded
            transitionLoading={imageTransitioning}
            layoutCssWidth={width}
            layoutCssHeight={height}
            shaderParams={{
              expanded: {
                cornerRadiusPx: CALL_CORNER_RADIUS_PX,
              } as never,
              edgeLoading: {
                cornerRadiusPx: CALL_CORNER_RADIUS_PX,
              } as never,
            }}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        ) : null}
      </div>
    </div>
  );
}
