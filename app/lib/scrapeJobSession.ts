/** Session storage key for the last Lambda scrape job id (after POST /scrape). */
export const SCRAPE_JOB_ID_SESSION_KEY = 'migratex_scrape_job_id';

/** Set after POST /import succeeds for the current job id; cleared when job id changes. */
export const AUTO_IMPORT_OK_SESSION_KEY = 'migratex_auto_import_ok';

const jobIdListeners = new Set<() => void>();

export function subscribeScrapeJobId(listener: () => void): () => void {
  jobIdListeners.add(listener);
  return () => {
    jobIdListeners.delete(listener);
  };
}

function notifyJobIdListeners() {
  for (const fn of jobIdListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function getScrapeJobId(): string | null {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return null;
  }
  const v = globalThis.sessionStorage.getItem(SCRAPE_JOB_ID_SESSION_KEY);
  return v?.trim() || null;
}

export function setScrapeJobId(jobId: string): void {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return;
  }
  const id = jobId.trim();
  if (id) {
    globalThis.sessionStorage.setItem(SCRAPE_JOB_ID_SESSION_KEY, id);
    notifyJobIdListeners();
  }
}

export function clearScrapeJobId(): void {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return;
  }
  globalThis.sessionStorage.removeItem(SCRAPE_JOB_ID_SESSION_KEY);
  globalThis.sessionStorage.removeItem(AUTO_IMPORT_OK_SESSION_KEY);
  notifyJobIdListeners();
}

/** Pull job id from Lambda JSON payloads (SSE `data:` lines or JSON body). */
export function tryPersistScrapeJobIdFromPayload(data: unknown): void {
  if (data == null || typeof data !== 'object') {
    return;
  }
  const o = data as Record<string, unknown>;
  const nestedJob = o.job && typeof o.job === 'object' ? (o.job as Record<string, unknown>) : null;

  const candidates: unknown[] = [
    o.job_id,
    o.jobId,
    o.scrape_job_id,
    o.scrapeJobId,
    nestedJob?.id,
    nestedJob?.uid,
    o.id,
  ];

  for (const c of candidates) {
    if (typeof c === 'string') {
      const id = c.trim();
      if (id.length >= 8) {
        setScrapeJobId(id);
        return;
      }
    }
  }
}
