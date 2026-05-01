import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number value smoothly from its previous value to the new value.
 * Falls back to instant update for users with prefers-reduced-motion.
 * `format` lets the caller customize how the number is rendered (e.g. for "2h 18m").
 */
export default function AnimatedNumber({ value, durationMs = 600, format = (v) => Math.round(v).toString() }) {
  const [display, setDisplay] = useState(value);
  const startVal = useRef(value);
  const startTime = useRef(null);
  const rafId = useRef(null);

  useEffect(() => {
    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }

    // If value didn't actually change (or we're on first render), set instantly
    if (startVal.current === value) {
      setDisplay(value);
      return;
    }

    startTime.current = null;
    const from = display;
    const to = value;

    const step = (ts) => {
      if (startTime.current === null) startTime.current = ts;
      const elapsed = ts - startTime.current;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) rafId.current = requestAnimationFrame(step);
      else startVal.current = to;
    };
    rafId.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId.current);
  }, [value, durationMs]);

  return <>{format(display)}</>;
}
