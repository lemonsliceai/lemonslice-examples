"use client";

import { cn } from "@/lib/utils";

type PlaceholderMediaProps = {
  url: string;
  className?: string;
};

/** Looping video used before the agent publishes. */
export function PlaceholderMedia({ url, className }: PlaceholderMediaProps) {
  return (
    <video
      src={url}
      className={cn("absolute inset-0 w-full h-full object-cover", className)}
      playsInline
      autoPlay
      loop
      muted
    />
  );
}
