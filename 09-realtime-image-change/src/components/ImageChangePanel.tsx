"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ImageChangeState } from "@/lib/agent-messages";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<ImageChangeState["phase"], string> = {
  idle: "idle",
  sending: "sending…",
  editing: "editing…",
  accepted: "accepted",
  transitioning: "transitioning…",
  complete: "complete",
  error: "error",
};

const TOOL_EXAMPLES = [
  { say: "“change your outfit”", tool: "change_outfit" },
  { say: "“let’s go outside”", tool: "go_outside" },
  { say: "“put on sunglasses”", tool: "add_sunglasses" },
] as const;

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
  const busy =
    state.phase === "sending" ||
    state.phase === "editing" ||
    state.phase === "accepted" ||
    state.phase === "transitioning";

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col gap-6 overflow-y-auto border-l border-border bg-muted/30 p-5 sm:p-6",
        className,
      )}
    >
      <header className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Real-time image change</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Swap the avatar’s reference image mid-call with the LemonSlice{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://lemonslice.com/docs/api-reference/control-self-managed-session"
            target="_blank"
            rel="noreferrer"
          >
            <code className="text-xs">update-image</code>
          </a>
          {" "}
          event. The UI listens for <code className="text-xs">image_change_complete</code> on{" "}
          <code className="text-xs">lemonslice</code> (iridescent edge ring while waiting).
          Tool replies wait until the transition finishes.
        </p>
      </header>

      <div className="space-y-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="text-muted-foreground">status</span>
          <span
            className={cn(
              "font-mono text-xs",
              state.phase === "error" && "text-red-600",
              state.phase === "complete" && "text-emerald-700",
              busy && "text-amber-800",
            )}
          >
            {PHASE_LABEL[state.phase]}
            {state.lastEvent ? ` · ${state.lastEvent}` : ""}
          </span>
        </div>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      </div>

      <div className="space-y-5">
        <h2 className="text-sm font-semibold tracking-tight">Ways to trigger an image update</h2>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">1. Via tool call</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Talk or chat with the avatar. The LLM picks a tool from context; the agent then POSTs{" "}
            <code className="text-xs">update-image</code> with a hardcoded public image URL.
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
          <h3 className="text-sm font-medium">2. Via image URL</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Paste any publicly reachable HTTPS image. The client sends a LiveKit data message on{" "}
            <code className="text-xs">agent/set_image</code>; the agent applies it with LemonSlice{" "}
            <code className="text-xs">update-image</code>.
          </p>
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
          <h3 className="text-sm font-medium">3. Via Nano Banana edit</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Describe a change from the current image. The client sends{" "}
            <code className="text-xs">agent/image_edit</code>; the agent runs Fal{" "}
            <code className="text-xs">google/nano-banana-2-lite/edit</code>, then applies the result
            with LemonSlice <code className="text-xs">update-image</code>.
          </p>
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
