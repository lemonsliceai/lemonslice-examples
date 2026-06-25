"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { PlaceholderMedia } from "@/components/agent-call/PlaceholderMedia";
import { LANDSCAPE_FRAME_BG } from "@/components/agent-call/PortraitLandscapeFrame";

const PORTRAIT_ASPECT = 2 / 3;
const COMPACT_SIZE_PX = 250;

type AgentVideoViewProps = {
  /** Ringing: small circle. Active call: 16:9 landscape with centered 2:3 portrait. */
  compact: boolean;
  width: number;
  height: number;
  placeholderVideoUrl?: string | null;
  agentVideoTrack: MediaStreamTrack | null;
  className?: string;
};

/**
 * Single persistent video element; the outer frame morphs from ringing circle to 16:9
 * so the live track is not detached/remounted (avoids flash on bot_ready).
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
  const portraitSlotWidth = compact ? COMPACT_SIZE_PX : height * PORTRAIT_ASPECT;

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

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        compact ? "overflow-visible" : "overflow-hidden rounded-3xl",
        className,
      )}
      style={{
        width: compact ? COMPACT_SIZE_PX : width,
        height: compact ? COMPACT_SIZE_PX : height,
        backgroundColor: compact ? undefined : LANDSCAPE_FRAME_BG,
      }}
    >
      {compact ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-foreground/25 origin-center animate-ring-ripple"
        />
      ) : null}
      <div
        className={cn(
          "relative overflow-hidden",
          compact && "z-[1] rounded-full bg-muted",
        )}
        style={{
          width: portraitSlotWidth,
          height: compact ? COMPACT_SIZE_PX : "100%",
        }}
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
          <div
            className={cn(
              "absolute inset-0 z-10 flex items-center justify-center text-sm",
              compact ? "text-muted-foreground" : "text-white/70",
            )}
          >
            Waiting for agent…
          </div>
        ) : null}
      </div>
    </div>
  );
}
