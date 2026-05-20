/**
 * GlobalLoader.tsx
 *
 * A fixed-position top progress bar that shows during:
 *   - Remix route transitions (via useNavigation)
 *   - API calls tracked in globalLoader store
 *
 * The bar uses a two-phase animation:
 *   1. Determinate: slides in from 0 → 85% while loading
 *   2. Complete:    snaps to 100% then fades out
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigation } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { isGlobalLoading } from '~/lib/stores/globalLoader';

type Phase = 'idle' | 'loading' | 'completing' | 'done';

export function GlobalLoader() {
  const navigation = useNavigation();
  const isApiLoading = useStore(isGlobalLoading);

  const isActive = navigation.state !== 'idle' || isApiLoading;

  const [phase, setPhase] = useState<Phase>('idle');
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const growRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (growRef.current) clearInterval(growRef.current);
  };

  useEffect(() => {
    if (isActive && phase === 'idle') {
      // Start loading: animate from 0 → 82% in a slowing-down curve
      setWidth(0);
      setPhase('loading');

      let current = 0;

      growRef.current = setInterval(() => {
        current += (82 - current) * 0.06; // asymptotic growth → never reaches 82
        setWidth(Math.min(current, 81));
      }, 100);
    }

    if (!isActive && (phase === 'loading' || phase === 'completing')) {
      clearTimers();
      // Snap to 100% then fade
      setWidth(100);
      setPhase('completing');
      timerRef.current = setTimeout(() => {
        setPhase('done');
        timerRef.current = setTimeout(() => {
          setPhase('idle');
          setWidth(0);
        }, 300); // fade-out duration
      }, 200); // hold at 100% briefly
    }

    return clearTimers;
  }, [isActive, phase]);

  if (phase === 'idle') {
    return null;
  }

  return (
    <div
      id="global-loader-bar"
      aria-hidden
      style={{
        width: `${width}%`,
        opacity: phase === 'done' ? 0 : 1,
        transition:
          phase === 'completing'
            ? 'width 200ms ease, opacity 300ms ease 200ms'
            : phase === 'done'
            ? 'opacity 300ms ease'
            : 'width 100ms linear',
      }}
    />
  );
}
