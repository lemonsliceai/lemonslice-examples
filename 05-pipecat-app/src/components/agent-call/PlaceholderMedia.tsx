"use client";

import { cn } from "@/lib/utils";

function isImageUrl(url: string) {
  return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
}

type PlaceholderMediaProps = {
  url: string;
  className?: string;
  aspectRatio?: string;
};

/** Looping video or still image used before the agent publishes. */
export function PlaceholderMedia({ url, className, aspectRatio }: PlaceholderMediaProps) {
  if (isImageUrl(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        fetchPriority="high"
        className={cn("absolute inset-0 w-full h-full object-cover", className)}
        style={aspectRatio ? { aspectRatio } : undefined}
      />
    );
  }

  return (
    <video
      src={url}
      className={cn("absolute inset-0 w-full h-full object-cover", className)}
      style={aspectRatio ? { aspectRatio } : undefined}
      playsInline
      autoPlay
      loop
      muted
    />
  );
}
