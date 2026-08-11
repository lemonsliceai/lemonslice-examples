"use client";

import { useCallback, useEffect, useRef } from "react";

const BOTTOM_THRESHOLD_PX = 32;

/** Pins a scroll container to the bottom until the user scrolls away from it. */
export function useStickyScroll(dependency: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [dependency]);

  return { scrollRef, onScroll };
}
