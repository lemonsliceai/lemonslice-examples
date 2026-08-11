"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

/** Drags the divider between the call pane and the event panel. */
export function PanelResizeHandle({ onResize }: { onResize: (fraction: number) => void }) {
  const [dragging, setDragging] = useState(false);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onResize((window.innerWidth - event.clientX) / window.innerWidth);
    },
    [dragging, onResize],
  );

  const stopDragging = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn(
        "hidden w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-foreground/30 lg:block",
        dragging && "bg-foreground/30",
      )}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onLostPointerCapture={stopDragging}
    />
  );
}
