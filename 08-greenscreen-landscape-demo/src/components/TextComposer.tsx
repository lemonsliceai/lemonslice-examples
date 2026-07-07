"use client";

import React, { useRef, useEffect } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TextComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isGenerating?: boolean;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

export default function TextComposer({
  value,
  onChange,
  onSubmit,
  isGenerating = false,
  placeholder = "Message",
  maxLength = 500,
  disabled = false,
  className = "",
}: TextComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      const ta = textareaRef.current;
      if (value) {
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
      } else {
        ta.style.height = "40px";
      }
    }
  }, [value]);

  const canSubmit = !isGenerating && !disabled && value.trim().length > 0;
  const hasText = value.trim().length > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  return (
    <div className={cn("flex items-end gap-2 w-full min-w-0", className)}>
      <div className="flex-1 relative min-w-0">
        <div className="relative flex gap-0 items-center w-full min-h-11 rounded-[22px] border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
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
              "w-full flex-1 resize-none border-0 bg-transparent py-2 pl-4 pr-4 text-base leading-[1.5] max-h-36 overflow-y-auto outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              hasText && "pr-14",
            )}
          />
          <div className="absolute right-0 bottom-0 top-0 flex items-end p-2 pointer-events-none">
            <button
              type="button"
              onClick={() => canSubmit && onSubmit()}
              disabled={!canSubmit}
              className={cn(
                "py-1 px-3 rounded-3xl h-[28px] flex items-center justify-center pointer-events-auto transition-colors",
                hasText && !disabled && !isGenerating
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-secondary text-secondary-foreground opacity-50 cursor-not-allowed",
              )}
              aria-label="Send"
            >
              {isGenerating ? (
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} />
              ) : (
                <ArrowUp strokeWidth={2} size={20} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
