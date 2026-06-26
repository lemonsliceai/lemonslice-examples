"use client";

import { cn } from "@/lib/utils";

/** Pillarbox color — set to match your reference image background. */
export const LANDSCAPE_FRAME_BG = "#001029";

const VIDEO_ASPECT = 1; // 1:1 square

type PortraitLandscapeFrameProps = {
  width: number;
  height: number;
  rounded?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** 16:9 landscape container with a centered 1:1 square video slot. */
export function PortraitLandscapeFrame({
  width,
  height,
  rounded = true,
  className,
  children,
}: PortraitLandscapeFrameProps) {
  const innerWidth = height * VIDEO_ASPECT;

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

export function videoSlotSize(frameHeight: number) {
  return { width: frameHeight * VIDEO_ASPECT, height: frameHeight };
}
