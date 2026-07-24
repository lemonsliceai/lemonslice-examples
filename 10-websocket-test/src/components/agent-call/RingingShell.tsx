import { PhoneIcon } from "@heroicons/react/16/solid";
import { Button } from "@/components/ui/button";
import { AgentVideoView } from "@/components/agent-call/AgentVideoView";
import { useActiveSize } from "@/hooks/useActiveSize";

/** Compact ringing UI before RTC join credentials are ready. */
export function RingingShell({
  placeholderVideo,
  onHangUp,
}: {
  placeholderVideo: string;
  onHangUp: () => void;
}) {
  const activeSize = useActiveSize();

  return (
    <div className="flex flex-col items-center gap-4">
      <AgentVideoView
        compact
        width={activeSize.width}
        height={activeSize.height}
        placeholderVideoUrl={placeholderVideo}
        agentVideoTrack={null}
      />
      <div className="flex items-center gap-2">
        <Button size="default" disabled variant="secondary">
          Calling…
        </Button>
        <Button
          onClick={onHangUp}
          variant="destructive"
          size="icon"
          className="h-11 w-11 flex-shrink-0 rounded-full bg-red-500"
          title="Hang up"
        >
          <PhoneIcon className="h-5 w-5 translate-y-0.5 rotate-[135deg]" />
        </Button>
      </div>
    </div>
  );
}
