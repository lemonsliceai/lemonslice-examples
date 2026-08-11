"use client";

import { useEffect, useState } from "react";

const WIDGET_ASPECT_RATIO = 2 / 3;

/** `paneFraction` is how much of the window the call pane gets on desktop. */
export function useActiveSize(paneFraction: number) {
  const [size, setSize] = useState({ width: 280, height: 420 });

  useEffect(() => {
    const calc = () => {
      const isMobile = window.innerWidth < 1024;
      const paneWidth = isMobile
        ? window.innerWidth - 32
        : Math.floor(window.innerWidth * paneFraction) - 32;
      const paneHeight = isMobile
        ? Math.floor(window.innerHeight * 0.5) - 48
        : window.innerHeight - 48;
      const maxWidth = Math.max(200, paneWidth);
      const maxHeight = Math.max(240, paneHeight - (isMobile ? 72 : 96));

      let height = maxHeight;
      let width = Math.floor(height * WIDGET_ASPECT_RATIO);
      if (width > maxWidth) {
        width = maxWidth;
        height = Math.floor(width / WIDGET_ASPECT_RATIO);
      }
      setSize({ width, height });
    };

    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [paneFraction]);

  return size;
}
