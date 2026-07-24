import { useEffect, useState } from "react";

const WIDGET_ASPECT_RATIO = 2 / 3;

export function useActiveSize() {
  const [activeSize, setActiveSize] = useState({ width: 320, height: 480 });

  useEffect(() => {
    const calc = () => {
      const headerHeight = 24;
      const isMobile = window.innerWidth < 640;
      const bottomPadding = isMobile ? 140 : 72;
      const available = window.innerHeight - headerHeight - bottomPadding;
      const maxHeight = Math.floor(available * 0.96);
      const width = Math.floor(maxHeight * WIDGET_ASPECT_RATIO);
      setActiveSize({ width, height: maxHeight });
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return activeSize;
}
