"use client";

import { Button } from "@/components/ui/button";
import { VideoCameraIcon } from "@heroicons/react/16/solid";
import { cn } from "@/lib/utils";
import { PlaceholderMedia } from "@/components/agent-call/PlaceholderMedia";
import { PLACEHOLDER_VIDEO_URL } from "@/lib/constants";

const PREVIEW_SIZE_PX = 250;

export function PreJoinPreview({
  onStartCall,
  className,
}: {
  onStartCall: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        className="relative overflow-hidden rounded-full bg-muted"
        style={{ width: PREVIEW_SIZE_PX, height: PREVIEW_SIZE_PX }}
      >
        <PlaceholderMedia url={PLACEHOLDER_VIDEO_URL} />
      </div>
      <Button onClick={onStartCall} size="default" className="gap-2">
        <VideoCameraIcon className="w-5 h-5" />
        Start call
      </Button>
    </div>
  );
}
