"use client";

import { Button } from "@/components/ui/button";
import { VideoCameraIcon } from "@heroicons/react/16/solid";
import { cn } from "@/lib/utils";
import { PlaceholderMedia } from "@/components/agent-call/PlaceholderMedia";

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
        className="relative overflow-hidden rounded-full bg-muted"
        style={{ width: PREVIEW_SIZE_PX, height: PREVIEW_SIZE_PX }}
      >
        {placeholderVideo ? (
          <PlaceholderMedia url={placeholderVideo} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            No call
          </span>
        )}
      </div>
      <Button onClick={onStartCall} size="default" className="gap-2">
        <VideoCameraIcon className="w-5 h-5" />
        Start call
      </Button>
    </div>
  );
}
