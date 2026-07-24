import type { EgressProvider } from "@/api";
import { cn } from "@/lib/utils";

const OPTIONS: {
  value: EgressProvider;
  label: string;
  envVars: string[];
}[] = [
  {
    value: "livekit",
    label: "LiveKit",
    envVars: [
      "LEMONSLICE_API_KEY",
      "LIVEKIT_URL",
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
    ],
  },
  {
    value: "daily",
    label: "Daily",
    envVars: ["LEMONSLICE_API_KEY", "DAILY_API_KEY"],
  },
];

export function EgressSideMenu({
  value,
  onChange,
  disabled,
  className,
}: {
  value: EgressProvider;
  onChange: (value: EgressProvider) => void;
  disabled?: boolean;
  className?: string;
}) {
  const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  return (
    <div className={cn("flex w-full flex-col gap-5", className)}>
      <div>
        <p className="text-sm font-semibold tracking-tight">Transport Provider</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Choose which provider you wish to use for A/V egress. Your selection
          determines which client-side libraries / SDKs will be used to stream
          the avatar video.
        </p>
      </div>

      <div
        className="flex flex-col gap-2"
        role="radiogroup"
        aria-label="Transport Provider"
      >
        {OPTIONS.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "border-border flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors",
                checked ? "border-foreground bg-muted/40" : "hover:bg-muted/30",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="transport"
                value={option.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span className="text-sm font-medium">{option.label}</span>
            </label>
          );
        })}
      </div>

      <div>
        <p className="text-xs font-medium">Required env vars</p>
        <ul className="text-muted-foreground mt-2 space-y-1 font-mono text-[11px]">
          {selected.envVars.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
