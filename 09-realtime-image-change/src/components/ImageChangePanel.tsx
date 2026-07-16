"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ImageChangeLogEntry, ImageChangeState } from "@/lib/agent-messages";
import { cn } from "@/lib/utils";

const TOOL_EXAMPLES = [
  { say: "“change your outfit”", tool: "change_outfit" },
  { say: "“let’s go outside”", tool: "go_outside" },
  { say: "“put on sunglasses”", tool: "add_sunglasses" },
  { say: "“reset” / “go back”", tool: "reset_appearance" },
] as const;

const LOG_LABEL: Record<ImageChangeLogEntry["kind"], string> = {
  image_accepted: "image_accepted",
  image_change_complete: "image_change_complete",
  image_change_error: "image_change_error",
  image_update_failed: "image_update_failed",
};

function formatLogTime(at: number): string {
  const d = new Date(at);
  const base = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${base}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function ImageChangePanel({
  state,
  connected,
  onApplyUrl,
  onGenerateEdit,
  className,
}: {
  state: ImageChangeState;
  connected: boolean;
  onApplyUrl: (url: string) => void;
  onGenerateEdit: (prompt: string) => void;
  className?: string;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [editPrompt, setEditPrompt] = useState("add a stylish hat");
  const logEndRef = useRef<HTMLDivElement>(null);
  const busy = state.phase === "sending" || state.phase === "editing";

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.events.length]);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col gap-5 overflow-y-auto border-l border-border bg-muted/30 p-5 sm:p-6",
        className,
      )}
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h1 className="text-base font-semibold tracking-tight">Real-time image change</h1>
          <span
            className={cn(
              "text-xs font-medium",
              connected ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            {connected ? "In call" : "Not connected"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Swap the avatar’s reference image mid-call with the LemonSlice{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://lemonslice.com/docs/api-reference/control-self-managed-session"
            target="_blank"
            rel="noreferrer"
          >
            <code className="text-xs">update-image</code>
          </a>{" "}
          event.
        </p>
      </header>

      <div className="flex min-h-[9rem] flex-col overflow-hidden rounded-2xl border border-border bg-background">
        <div className="border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Event log
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed">
          {state.events.length === 0 ? (
            <p className="text-muted-foreground">
              Events appear here when an image update is accepted or completes.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {state.events.map((ev) => (
                <li key={ev.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="shrink-0 text-muted-foreground">{formatLogTime(ev.at)}</span>
                  <span
                    className={cn(
                      "font-medium",
                      ev.kind === "image_accepted" && "text-sky-700",
                      ev.kind === "image_change_complete" && "text-emerald-700",
                      (ev.kind === "image_change_error" ||
                        ev.kind === "image_update_failed") &&
                        "text-red-700",
                    )}
                  >
                    {LOG_LABEL[ev.kind]}
                  </span>
                  {ev.message ? (
                    <span className="min-w-0 break-all text-muted-foreground">{ev.message}</span>
                  ) : null}
                </li>
              ))}
              <div ref={logEndRef} />
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <h2 className="text-sm font-semibold tracking-tight">Ways to trigger an image update</h2>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">1. Via tool call</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Talk or chat with the avatar. The LLM picks a tool from context; the agent then POSTs{" "}
            <code className="text-xs">update-image</code> with a hardcoded public image URL.
            Presets replace the full look (they do not stack).
          </p>
          <ul className="space-y-1.5 text-sm">
            {TOOL_EXAMPLES.map((ex) => (
              <li key={ex.tool} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-foreground">Try {ex.say}</span>
                <span className="font-mono text-xs text-muted-foreground">→ {ex.tool}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="shrink-0 text-sm font-medium">2. Via image URL</h3>
            <p className="text-sm text-muted-foreground">
              Paste any publicly reachable HTTPS image.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              disabled={!connected || busy}
              className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              className="shrink-0"
              disabled={!connected || busy || !imageUrl.trim()}
              onClick={() => onApplyUrl(imageUrl.trim())}
            >
              Apply
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="shrink-0 text-sm font-medium">3. Via Nano Banana edit</h3>
            <p className="text-sm text-muted-foreground">
              Describe a change from the base image.
            </p>
          </div>
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={2}
            disabled={!connected || busy}
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Describe the edit…"
          />
          <Button
            size="sm"
            disabled={!connected || busy || !editPrompt.trim()}
            onClick={() => onGenerateEdit(editPrompt.trim())}
          >
            Generate & apply
          </Button>
        </section>
      </div>
    </aside>
  );
}
