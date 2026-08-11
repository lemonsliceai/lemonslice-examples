"use client";

import { VideoCameraIcon } from "@heroicons/react/16/solid";
import { Button } from "@/components/ui/button";
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
        className="flex items-center justify-center overflow-hidden rounded-full bg-muted"
        style={{ width: PREVIEW_SIZE_PX, height: PREVIEW_SIZE_PX }}
      >
        {placeholderVideo ? (
          <video
            src={placeholderVideo}
            className="h-full w-full object-cover"
            playsInline
            autoPlay
            loop
            muted
          />
        ) : (
          <span className="text-sm text-muted-foreground">No call</span>
        )}
      </div>
      <Button onClick={onStartCall} size="default" className="gap-2">
        <VideoCameraIcon className="h-5 w-5" />
        Start call
      </Button>
    </div>
  );
}
