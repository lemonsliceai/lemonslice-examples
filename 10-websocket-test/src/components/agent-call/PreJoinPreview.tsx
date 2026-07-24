import { Button } from "@/components/ui/button";
import { VideoCameraIcon } from "@heroicons/react/16/solid";
import { cn } from "@/lib/utils";

const PREVIEW_SIZE_PX = 250;

/** Shown before we have a session: looping preview + “Start call”. */
export function PreJoinPreview({
  placeholderVideo,
  onStartCall,
  starting,
  className,
}: {
  placeholderVideo: string | null;
  onStartCall: () => void;
  starting?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        className="bg-muted flex items-center justify-center overflow-hidden rounded-full"
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
          <span className="text-muted-foreground text-sm">No call</span>
        )}
      </div>
      <Button
        onClick={onStartCall}
        size="default"
        className="gap-2"
        disabled={starting}
      >
        <VideoCameraIcon className="h-5 w-5" />
        {starting ? "Starting…" : "Start call"}
      </Button>
    </div>
  );
}
