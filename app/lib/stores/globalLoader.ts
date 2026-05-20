/**
 * globalLoader.ts
 *
 * A lightweight nanostores-based global loading state.
 * Supports multiple concurrent loading keys — the bar shows while any are active.
 *
 * Usage:
 *   globalLoader.start('fetch-jobs');
 *   // ... await work
 *   globalLoader.stop('fetch-jobs');
 *
 *   // Or with a helper:
 *   const result = await globalLoader.wrap('fetch-jobs', fetchJobs());
 */

import { atom, computed } from 'nanostores';

/** Map of key → active count (>0 means loading). */
const _keys = atom<Record<string, number>>({});

/** True when any loader key is active. */
export const isGlobalLoading = computed(_keys, (keys) =>
  Object.values(keys).some((c) => c > 0),
);

function start(key: string) {
  _keys.set({ ..._keys.get(), [key]: (_keys.get()[key] ?? 0) + 1 });
}

function stop(key: string) {
  const current = { ..._keys.get() };
  const next = Math.max(0, (current[key] ?? 0) - 1);

  if (next === 0) {
    delete current[key];
  } else {
    current[key] = next;
  }

  _keys.set(current);
}

async function wrap<T>(key: string, promise: Promise<T>): Promise<T> {
  start(key);

  try {
    return await promise;
  } finally {
    stop(key);
  }
}

export const globalLoader = { start, stop, wrap, isLoading: isGlobalLoading };
