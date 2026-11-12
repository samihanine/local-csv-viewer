import { useEffect, useRef, useState } from "react";

/** Windowing for fixed-height rows: only the rows near the viewport are rendered. */
export function useVirtual(count: number, rowHeight: number, overscan = 10) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const start = Math.max(0, Math.floor(viewport.top / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((viewport.top + viewport.height) / rowHeight) + overscan);
  return { ref, start, end };
}
