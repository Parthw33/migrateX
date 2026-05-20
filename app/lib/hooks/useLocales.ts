import { useCallback, useEffect, useRef, useState } from 'react';
import { type LocaleOption, fetchLocales } from '~/services/localeService';

export type LocaleStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseLocalesResult {
  options: LocaleOption[];
  status: LocaleStatus;
  error: string | null;
  retry: () => void;
}

/**
 * Fetches Contentstack locale options as soon as `token` is available.
 * Subsequent calls with the same token hit the in-memory / session cache.
 *
 * @param token - MigrateX app token; pass null/undefined to stay idle.
 */
export function useLocales(token: string | null | undefined): UseLocalesResult {
  const [options, setOptions] = useState<LocaleOption[]>([]);
  const [status, setStatus] = useState<LocaleStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  const load = useCallback(async (tok: string) => {
    const run = ++runRef.current;

    setStatus('loading');
    setError(null);

    try {
      const locales = await fetchLocales(tok);

      if (run !== runRef.current) {
        return; // Stale — a newer call is in flight
      }

      setOptions(locales);
      setStatus('ready');
    } catch (err) {
      if (run !== runRef.current) {
        return;
      }

      setError(err instanceof Error ? err.message : 'Failed to load locales');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (token) {
      void load(token);
    } else {
      // Token gone (sign-out) — reset
      runRef.current++;
      setStatus('idle');
      setOptions([]);
      setError(null);
    }
  }, [token, load]);

  const retry = useCallback(() => {
    if (token) {
      void load(token);
    }
  }, [token, load]);

  return { options, status, error, retry };
}
