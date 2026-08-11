"use client";

import React, { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface TextComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

export default function TextComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Message",
  maxLength = 500,
  disabled = false,
  className = "",
}: TextComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (value) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    } else {
      ta.style.height = "40px";
    }
  }, [value]);

  const hasText = value.trim().length > 0;
  const canSubmit = hasText && !disabled;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  return (
    <div className={cn("flex w-full min-w-0 items-end gap-2", className)}>
      <div className="relative min-w-0 flex-1">
        <div className="relative flex min-h-11 w-full items-center rounded-[22px] border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            rows={1}
            className={cn(
              "max-h-36 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent px-4 py-2 text-base leading-[1.5] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              hasText && "pr-14",
            )}
          />
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 flex items-end p-2">
            <button
              type="button"
              onClick={() => canSubmit && onSubmit()}
              disabled={!canSubmit}
              className={cn(
                "pointer-events-auto flex h-[28px] items-center justify-center rounded-3xl px-3 py-1 transition-colors",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-secondary text-secondary-foreground opacity-50",
              )}
              aria-label="Send"
            >
              <ArrowUp strokeWidth={2} size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
