"use client";

import { cn } from "@/lib/utils";
import { BACKGROUND_VIDEO_URL } from "@/lib/constants";

/** Looping 16:9 background video behind the chroma-keyed avatar. */
export function LandscapeBackgroundVideo({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 z-0 overflow-hidden", className)} aria-hidden>
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={BACKGROUND_VIDEO_URL}
        autoPlay
        loop
        muted
        playsInline
      />
    </div>
  );
}
