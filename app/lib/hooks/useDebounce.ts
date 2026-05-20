/**
 * useDebounce.ts
 *
 * Returns a debounced value that only updates after `delay` ms of inactivity.
 * Used for search inputs to avoid firing on every keystroke.
 */

import { useEffect, useRef, useState } from 'react';

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

/**
 * useThrottle
 *
 * Returns a throttled value — updates at most once every `interval` ms.
 * Useful for scroll/resize handlers.
 */
export function useThrottle<T>(value: T, interval = 200): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastFired = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    const remaining = interval - (now - lastFired.current);

    if (remaining <= 0) {
      lastFired.current = now;
      setThrottled(value);
    } else {
      const id = setTimeout(() => {
        lastFired.current = Date.now();
        setThrottled(value);
      }, remaining);
      return () => clearTimeout(id);
    }
  }, [value, interval]);

  return throttled;
}

/**
 * useDebouncedCallback
 *
 * Returns a stable, debounced callback reference.
 */
export function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay = 300,
): (...args: Parameters<T>) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return (...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  };
}
