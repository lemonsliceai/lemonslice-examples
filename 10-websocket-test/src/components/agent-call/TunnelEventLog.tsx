import { useEffect, useRef } from "react";
import type { TunnelLogEntry } from "@/lib/tunnel";
import { cn } from "@/lib/utils";

function formatTime(at: number) {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function TunnelEventLog({
  entries,
  className,
}: {
  entries: TunnelLogEntry[];
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div
      className={cn(
        "border-border bg-card flex h-80 flex-col overflow-hidden rounded-2xl border",
        className,
      )}
    >
      <div className="border-border shrink-0 border-b px-4 py-3">
        <p className="text-sm font-medium">WebSocket log</p>
      </div>
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-snug"
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground py-2">No events yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex gap-2">
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {formatTime(entry.at)}
              </span>
              <span
                className={cn(
                  "shrink-0 font-semibold uppercase",
                  entry.direction === "out" ? "text-foreground" : "text-emerald-700",
                )}
              >
                {entry.direction}
              </span>
              <span className="text-foreground/90 break-all">{entry.summary}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
