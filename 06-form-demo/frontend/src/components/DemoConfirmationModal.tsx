import { X } from "lucide-react";
import { useId } from "react";
import avatarImage from "../assets/avatar.png";
export type DemoConfirmation = {
  email: string;
  selected_date: string;
  selected_slot: string;
};

function ordinalDay(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatConfirmationParts(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const day = d.getDate();
  const weekdayLong = d.toLocaleDateString("en-US", { weekday: "long" });
  const weekdayShort = d.toLocaleDateString("en-US", { weekday: "short" });
  return {
    titleLine: `${month} ${ordinalDay(day)}, ${weekdayLong}`,
    dayNum: String(day),
    shortDow: weekdayShort,
  };
}

type Props = {
  confirmation: DemoConfirmation;
  onDismiss: () => void;
};

export function DemoConfirmationModal({ confirmation, onDismiss }: Props) {
  const inviteSentClipId = `invite-sent-${useId().replace(/:/g, "")}`;
  const parts = formatConfirmationParts(confirmation.selected_date);
  const slot = confirmation.selected_slot.trim();

  return (
    <div
      className="demo-confirm-backdrop-enter fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-confirm-title"
    >
      <div
        className="demo-confirm-card-enter h-[500px] w-full max-w-[500px] rounded-[24px] bg-white p-5 shadow-lg"
      >
        <div className="flex w-full items-start gap-1">
          <h2 id="demo-confirm-title" className="m-0 flex-1 text-[20px] font-semibold leading-normal tracking-tight text-black">
            We&apos;ve scheduled a demo.
          </h2>
          <button
            type="button"
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 text-black hover:opacity-70"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            <X className="size-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="flex h-full w-full flex-col items-center justify-center gap-3 pb-10">
          <div className="flex w-[300px] max-w-full items-center gap-4 whitespace-nowrap leading-[1.4]">
            <div className="flex size-[60px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-[14px] border-2 border-black/10 pb-3 pt-2 px-3 ">
              <span className="text-[24px] font-semibold leading-[1.4] tracking-tight text-black -mb-1">{parts.dayNum}</span>
              <span className="text-[12px] font-bold leading-[1.4] tracking-tight text-rose-500">{parts.shortDow}</span>
            </div>
            <div className="min-w-0 text-[16px] font-medium tracking-tight text-black">
              <p className="m-0">{parts.titleLine}</p>
              <p className="m-0">{slot}</p>
            </div>
          </div>

          <div className="h-px w-[300px] max-w-full shrink-0 bg-black/10" />

          <div className="flex w-[300px] max-w-full items-center gap-4">
            <div className="relative size-[60px] shrink-0 overflow-hidden rounded-full">
              {/* <UserRound className="absolute inset-0 m-auto size-9 text-neutral-400" strokeWidth={1.25} aria-hidden /> */}
              <img src={avatarImage.src} alt="Matt" className="absolute inset-0 m-auto size-full" />
            </div>
            <p className="m-0 flex-1 text-[16px] font-medium leading-[1.4] tracking-tight text-black">
              You&apos;ll meet with Matt, our human sales rep.
            </p>
          </div>

          <div className="h-px w-[300px] max-w-full shrink-0 bg-black/10" />

          <div className="flex w-[300px] max-w-full items-center gap-4">
            <div className="relative size-[60px] shrink-0">
              <svg
                viewBox="0 0 60 60"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="block size-full max-h-none max-w-none"
                aria-hidden
              >
                <g>
                  <g clipPath={`url(#${inviteSentClipId})`}>
                    <path
                      d="M30.4167 22.9167L-0.833333 48.75V62.9167H61.6667V48.75L30.4167 22.9167Z"
                      fill="white"
                      stroke="#E5E5E5"
                      strokeWidth={2}
                    />
                    <path
                      d="M30.4167 37.9167L-0.833333 12.0833V-2.08333H61.6667V12.0833L30.4167 37.9167Z"
                      fill="white"
                      stroke="#E5E5E5"
                      strokeWidth={2}
                    />
                  </g>
                  <rect x="1" y="1" width="58" height="58" rx="13" stroke="#E5E5E5" strokeWidth={2} />
                </g>
                <defs>
                  <clipPath id={inviteSentClipId}>
                    <rect width="60" height="60" rx="14" fill="white" />
                  </clipPath>
                </defs>
              </svg>
            </div>
            <div className="min-w-0 text-[16px] font-medium tracking-tight text-black">
              <p className="m-0 leading-[1.4]">Invite sent to</p>
              <p className="m-0 break-all leading-[1.4]">{confirmation.email}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
