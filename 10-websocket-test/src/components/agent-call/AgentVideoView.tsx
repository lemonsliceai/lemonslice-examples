import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const COMPACT_SIZE_PX = 250;

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
            className="border-foreground/45 animate-ring-ripple pointer-events-none absolute inset-0 origin-center rounded-full border-[3px]"
          />
          <span
            aria-hidden
            className="border-foreground/38 animate-ring-ripple pointer-events-none absolute inset-0 origin-center rounded-full border-[3px] [animation-delay:500ms]"
          />
          <span
            aria-hidden
            className="border-foreground/30 animate-ring-ripple pointer-events-none absolute inset-0 origin-center rounded-full border-[3px] [animation-delay:1000ms]"
          />
          <span
            aria-hidden
            className="border-foreground/22 animate-ring-ripple pointer-events-none absolute inset-0 origin-center rounded-full border-[3px] [animation-delay:1500ms]"
          />
        </>
      ) : null}
      <div
        className={cn(
          "bg-muted relative flex items-center justify-center overflow-hidden",
          compact ? "rounded-full" : "rounded-3xl",
          compact && "animate-ring-pulse z-[1] origin-center will-change-transform",
        )}
        style={{
          width: compact ? COMPACT_SIZE_PX : width,
          height: compact ? COMPACT_SIZE_PX : height,
        }}
      >
        {placeholderVideoUrl ? (
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
            ref={videoElRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={compact ? {} : { aspectRatio: `${width} / ${height}` }}
            playsInline
          />
        ) : (
          !placeholderVideoUrl && (
            <div className="text-muted-foreground z-[1] text-sm">
              Waiting for agent…
            </div>
          )
        )}
      </div>
    </div>
  );
}
