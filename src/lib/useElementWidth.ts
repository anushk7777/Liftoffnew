import { useEffect, useRef, useState } from 'react';

/**
 * Measures an element's content width via ResizeObserver so SVGs/charts can be
 * drawn at real pixel dimensions (no `preserveAspectRatio="none"` distortion).
 * Returns a ref to attach and the current width (px); `fallback` until measured.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(fallback = 320): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
