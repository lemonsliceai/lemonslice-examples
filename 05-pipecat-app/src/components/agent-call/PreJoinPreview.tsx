"use client";

import { Button } from "@/components/ui/button";
import { VideoCameraIcon } from "@heroicons/react/16/solid";
import { cn } from "@/lib/utils";

const PREVIEW_SIZE_PX = 250;

export function PreJoinPreview({
  placeholderVideo,
  onStartCall,
  className,
}: {
  placeholderVideo: string | null;
  onStartCall: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        className="rounded-full overflow-hidden bg-muted flex items-center justify-center"
        style={{ width: PREVIEW_SIZE_PX, height: PREVIEW_SIZE_PX }}
      >
        {placeholderVideo ? (
          <video
            src={placeholderVideo}
            className="w-full h-full object-cover"
            playsInline
            autoPlay
            loop
            muted
          />
        ) : (
          <span className="text-muted-foreground text-sm">No call</span>
        )}
      </div>
      <Button onClick={onStartCall} size="default" className="gap-2">
        <VideoCameraIcon className="w-5 h-5" />
        Start call
      </Button>
    </div>
  );
}
