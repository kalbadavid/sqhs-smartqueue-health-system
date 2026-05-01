import { useEffect, useRef, useState } from 'react';

/**
 * Returns true for ~700ms whenever `value` changes (after the first render).
 */
export default function useChangeFlash(value, durationMs = 700) {
  const [flashing, setFlashing] = useState(false);
  const prev = useRef(value);
  const timer = useRef(null);

  useEffect(() => {
    if (prev.current !== value) {
      // Skip the flash for the very first set (going from undefined to first value)
      if (prev.current !== undefined && prev.current !== null) {
        setFlashing(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setFlashing(false), durationMs);
      }
      prev.current = value;
    }
    return () => clearTimeout(timer.current);
  }, [value, durationMs]);

  return flashing;
}
