"use client";

import { cn } from "@/lib/utils";

/** Pillarbox color — set to match your portrait reference image background. */
export const LANDSCAPE_FRAME_BG = "#111827";

const PORTRAIT_ASPECT = 2 / 3;

type PortraitLandscapeFrameProps = {
  width: number;
  height: number;
  rounded?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** 16:9 landscape container with a centered 2:3 portrait slot. */
export function PortraitLandscapeFrame({
  width,
  height,
  rounded = true,
  className,
  children,
}: PortraitLandscapeFrameProps) {
  const innerWidth = height * PORTRAIT_ASPECT;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        rounded && "rounded-3xl",
        className,
      )}
      style={{ width, height, backgroundColor: LANDSCAPE_FRAME_BG }}
    >
      <div className="relative h-full overflow-hidden" style={{ width: innerWidth }}>
        {children}
      </div>
    </div>
  );
}

export function portraitSlotSize(frameHeight: number) {
  return { width: frameHeight * PORTRAIT_ASPECT, height: frameHeight };
}
