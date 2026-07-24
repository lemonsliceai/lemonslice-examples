import { Button } from "@/components/ui/button";
import { PhoneIcon } from "@heroicons/react/16/solid";

/** Hang up — shown in the expanded in-call layout. */
export function CallControlsBar({ onHangUp }: { onHangUp: () => void }) {
  return (
    <div
      className="mx-auto flex items-center justify-center gap-2 self-stretch px-3"
      style={{ width: "min(100%, 600px)", minWidth: 0 }}
    >
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
  );
}
