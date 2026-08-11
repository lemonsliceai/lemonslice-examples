"use client";

import { useStickyScroll } from "@/hooks/useStickyScroll";
import type { BridgeEvent } from "@/lib/bridge";
import { cn } from "@/lib/utils";

export type LogEntry = {
  id: number;
  at: number;
  event: BridgeEvent;
};

const TYPE_STYLES: Partial<Record<BridgeEvent["type"], string>> = {
  response_committed: "text-emerald-500",
  interrupted: "text-amber-500",
  agent_closed: "text-red-500",
  error: "text-red-500",
};

type TunnelMessageEvent = Extract<BridgeEvent, { type: "tunnel_message" }>;

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

/** Everything on the event apart from its type, as `key=value` pairs. */
function formatFields(event: BridgeEvent): string {
  return Object.entries(event)
    .filter(([key, value]) => key !== "type" && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("  ");
}

export function BridgeEventLog({
  entries,
  className,
}: {
  entries: LogEntry[];
  className?: string;
}) {
  const bridgeEntries = entries.filter((entry) => entry.event.type !== "tunnel_message");
  const tunnelEntries = entries.filter(
    (entry): entry is LogEntry & { event: TunnelMessageEvent } =>
      entry.event.type === "tunnel_message",
  );
  const { scrollRef: bridgeScrollRef, onScroll: onBridgeScroll } =
    useStickyScroll(bridgeEntries);
  const { scrollRef: tunnelScrollRef, onScroll: onTunnelScroll } =
    useStickyScroll(tunnelEntries);

  return (
    <div className={cn("flex flex-col overflow-hidden bg-muted/30", className)}>
      <div className="flex min-h-0 flex-1 flex-col border-b border-border">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">Bridge events</div>
        <div
          ref={bridgeScrollRef}
          onScroll={onBridgeScroll}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs"
        >
          {bridgeEntries.length === 0 ? (
            <p className="text-muted-foreground">Waiting for the first event…</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {bridgeEntries.map((entry) => (
                <li key={entry.id} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground">{formatTime(entry.at)}</span>
                  <span className={cn("shrink-0", TYPE_STYLES[entry.event.type])}>
                    {entry.event.type}
                  </span>
                  <span className="min-w-0 break-all text-muted-foreground">
                    {formatFields(entry.event)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          LemonSlice WebSocket
        </div>
        <div
          ref={tunnelScrollRef}
          onScroll={onTunnelScroll}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs"
        >
          {tunnelEntries.length === 0 ? (
            <p className="text-muted-foreground">Waiting for WebSocket traffic…</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tunnelEntries.map((entry) => (
                <li key={entry.id} className="grid grid-cols-[auto_auto_1fr] gap-2">
                  <span className="text-muted-foreground">{formatTime(entry.at)}</span>
                  <span
                    className={entry.event.direction === "out" ? "text-blue-500" : "text-violet-500"}
                  >
                    {entry.event.direction === "out" ? "OUT →" : "IN ←"}
                  </span>
                  <pre className="min-w-0 whitespace-pre-wrap break-all text-muted-foreground">
                    {JSON.stringify(entry.event.message)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
