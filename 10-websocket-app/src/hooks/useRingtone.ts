"use client";

import { useEffect } from "react";

const RING_INTERVAL_MS = 2000;

/**
 * Loops the ringtone while `active`. Owned above the views that come and go
 * during connection so the ring is not restarted by a remount.
 */
export function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const audio = new Audio("/sounds/ring.m4a");
    audio.volume = 0.5;
    const play = () => {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    };

    play();
    const id = setInterval(play, RING_INTERVAL_MS);
    return () => {
      clearInterval(id);
      audio.pause();
    };
  }, [active]);
}
