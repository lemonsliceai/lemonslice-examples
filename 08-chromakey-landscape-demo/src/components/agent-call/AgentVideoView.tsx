"use client";

import type { VideoTrack } from "livekit-client";
import { PlaceholderMedia } from "@/components/agent-call/PlaceholderMedia";
import { ChromaKeyVideo } from "@/components/agent-call/ChromaKeyVideo";
import { LandscapeBackgroundVideo } from "@/components/agent-call/LandscapeBackgroundVideo";
import { PLACEHOLDER_VIDEO_URL, AVATAR_ASPECT_RATIO } from "@/lib/constants";

const COMPACT_SIZE_PX = 250;

type AgentVideoViewProps = {
  /** Ringing: small circle. Active call: 16:9 landscape with centered portrait video. */
  compact: boolean;
  width: number;
  height: number;
  agentVideoTrack: VideoTrack | null;
};

/**
 * Active call: 16:9 background with chroma-keyed 2:3 portrait avatar composited on top.
 * Ringing: compact circle with optional placeholder (no chroma key).
 */
export function AgentVideoView({
  compact,
  width,
  height,
  agentVideoTrack,
}: AgentVideoViewProps) {
  const hasAgentVideo = agentVideoTrack != null;

  if (!compact) {
    const avatarHeight = height;
    const avatarWidth = Math.floor(avatarHeight * AVATAR_ASPECT_RATIO);

    return (
      <div
        className="relative overflow-hidden rounded-3xl"
        style={{ width, height }}
      >
        <LandscapeBackgroundVideo className="z-0" />
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
          <div
            className="relative shrink-0 overflow-hidden"
            style={{ width: avatarWidth, height: avatarHeight }}
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
      className="relative flex items-center justify-center overflow-visible"
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
        <PlaceholderMedia url={PLACEHOLDER_VIDEO_URL} />
      </div>
    </div>
  );
}
