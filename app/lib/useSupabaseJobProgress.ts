import { useEffect, useRef, useState } from 'react';
import { fetchScrapeJobDetail } from '~/lib/lambdaApi';
import { getSupabaseClient } from '~/lib/supabaseClient';

export interface JobProgressLogLine {
  id: string;
  time: string;
  message: string;
  tone?: 'info' | 'ok' | 'err';
}

export interface UseSupabaseJobProgressOptions {
  /** When set, GET /scrape/{jobId} is polled in parallel to detect S3 entry bundles (`s3_key`). */
  scrapeApiToken?: string | null;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ImportStatus = 'pending' | 'queued' | 'importing' | 'imported' | 'failed';
export type EntriesStatus = 'pending' | 'generating' | 'generated' | 'failed';

const POLL_MS = 2000;

function formatTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');

  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function parseProgress(val: unknown): number | null {
  if (typeof val === 'number' && !Number.isNaN(val)) {
    return Math.min(100, Math.max(0, val));
  }

  if (typeof val === 'string') {
    const n = Number.parseFloat(val);

    if (!Number.isNaN(n)) {
      return Math.min(100, Math.max(0, n));
    }
  }

  return null;
}

function shortS3Key(key: string): string {
  const k = key.trim();

  if (k.length <= 48) {
    return k;
  }

  return `${k.slice(0, 24)}…${k.slice(-12)}`;
}

export function useSupabaseJobProgress(
  jobId: string | null,
  options?: UseSupabaseJobProgressOptions,
): {
  progress: number;
  progressMessage: string;
  status: JobStatus | null;
  importStatus: ImportStatus | null;
  entriesStatus: EntriesStatus | null;
  entriesProgress: number;
  entriesMessage: string;

  /** Logs for crawl / scrape (stage 1): realtime, errors, and progress lines. */
  supabaseLogs: JobProgressLogLine[];

  /** `jobs.progress_message` (+ optional %) only — for crawl step log panels. */
  scrapeProgressMessageLogs: JobProgressLogLine[];

  /** Logs for entries creation + S3 polling (stage 2). */
  entriesLogs: JobProgressLogLine[];

  /** Logs for Contentstack import (stage 3). */
  importLogs: JobProgressLogLine[];
  supabaseReady: boolean;
  polling: boolean;
} {
  const scrapeApiToken = options?.scrapeApiToken?.trim() || null;

  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [entriesStatus, setEntriesStatus] = useState<EntriesStatus | null>(null);
  const [entriesProgress, setEntriesProgress] = useState(0);
  const [entriesMessage, setEntriesMessage] = useState('');
  const [supabaseLogs, setSupabaseLogs] = useState<JobProgressLogLine[]>([]);
  const [scrapeProgressMessageLogs, setScrapeProgressMessageLogs] = useState<JobProgressLogLine[]>([]);
  const [entriesLogs, setEntriesLogs] = useState<JobProgressLogLine[]>([]);
  const [importLogs, setImportLogs] = useState<JobProgressLogLine[]>([]);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [polling, setPolling] = useState(false);

  const lastProgressLogKeyRef = useRef<string>('');
  const lastImportStatusRef = useRef<string>('');
  const lastEntriesStatusRef = useRef<string>('');
  const lastErrorRef = useRef<string>('');
  const lastS3KeyRef = useRef<string>('');
  const s3WaitLoggedRef = useRef(false);
  const s3PollStartedRef = useRef(false);

  useEffect(() => {
    const sb = getSupabaseClient();
    let teardown: (() => void) | undefined;

    if (!sb || !jobId?.trim()) {
      setSupabaseReady(false);
      setPolling(false);
      setProgress(0);
      setProgressMessage('');
      setStatus(null);
      setImportStatus(null);
      setEntriesStatus(null);
      setEntriesProgress(0);
      setEntriesMessage('');
      setSupabaseLogs([]);
      setScrapeProgressMessageLogs([]);
      setEntriesLogs([]);
      setImportLogs([]);
      lastProgressLogKeyRef.current = '';
      lastImportStatusRef.current = '';
      lastEntriesStatusRef.current = '';
      lastErrorRef.current = '';
      lastS3KeyRef.current = '';
      s3WaitLoggedRef.current = false;
      s3PollStartedRef.current = false;
    } else {
      const id = jobId.trim();
      setSupabaseReady(true);
      setPolling(true);
      setProgress(0);
      setProgressMessage('');
      setStatus(null);
      setImportStatus(null);
      setEntriesStatus(null);
      setEntriesProgress(0);
      setEntriesMessage('');
      setSupabaseLogs([]);
      setScrapeProgressMessageLogs([]);
      setEntriesLogs([]);
      setImportLogs([]);
      lastProgressLogKeyRef.current = '';
      lastImportStatusRef.current = '';
      lastEntriesStatusRef.current = '';
      lastErrorRef.current = '';
      lastS3KeyRef.current = '';
      s3WaitLoggedRef.current = false;
      s3PollStartedRef.current = false;

      let cancelled = false;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      const appendScrapeLog = (message: string, tone: JobProgressLogLine['tone'] = 'info') => {
        setSupabaseLogs((prev) => [
          ...prev,
          {
            id: `sb-scrape-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            time: formatTime(),
            message,
            tone,
          },
        ]);
      };

      const appendScrapeProgressMessageLog = (message: string, tone: JobProgressLogLine['tone'] = 'info') => {
        setScrapeProgressMessageLogs((prev) => [
          ...prev,
          {
            id: `sb-crawl-pm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            time: formatTime(),
            message,
            tone,
          },
        ]);
      };

      const appendEntriesLog = (message: string, tone: JobProgressLogLine['tone'] = 'info') => {
        setEntriesLogs((prev) => [
          ...prev,
          {
            id: `sb-entries-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            time: formatTime(),
            message,
            tone,
          },
        ]);
      };

      const appendImportLog = (message: string, tone: JobProgressLogLine['tone'] = 'info') => {
        setImportLogs((prev) => [
          ...prev,
          {
            id: `sb-import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            time: formatTime(),
            message,
            tone,
          },
        ]);
      };

      const logProgressLine = (row: Record<string, unknown>) => {
        const p = parseProgress(row.progress);
        const msg = row.progress_message != null ? String(row.progress_message).trim() : '';
        const pctPart = p != null ? Math.round(p) : null;
        const key = `${pctPart ?? 'null'}|${msg}`;

        if (key === lastProgressLogKeyRef.current) {
          return;
        }

        lastProgressLogKeyRef.current = key;

        let line: string;

        if (pctPart != null && msg) {
          line = `Progress ${pctPart}% · ${msg}`;
        } else if (pctPart != null) {
          line = `Progress ${pctPart}%`;
        } else if (msg) {
          line = msg;
        } else {
          return;
        }

        const tone: JobProgressLogLine['tone'] = pctPart === 100 ? 'ok' : 'info';

        const jobStatus = String(row.status ?? '');
        const imp = row.import_status != null ? String(row.import_status) : '';
        const ent = row.entries_status != null ? String(row.entries_status) : '';
        const msgLower = msg.toLowerCase();

        /** After crawl `status` is `completed`, `progress_message` often tracks entries/import — not stage 1. */
        const importPhaseFromMsg =
          jobStatus === 'completed' &&
          (msgLower.includes('import') ||
            msgLower.includes('contentstack') ||
            msgLower.includes('cli output'));
        const importPhase =
          imp === 'queued' || imp === 'importing' || imp === 'failed' || importPhaseFromMsg;

        const entriesPhase =
          !importPhase &&
          (ent === 'generating' ||
            ent === 'failed' ||
            (jobStatus === 'completed' && (ent === 'pending' || row.entries_status == null)));

        const crawlPhase = jobStatus === 'queued' || jobStatus === 'processing';
        const scrapeFailure = jobStatus === 'failed' && (!imp || imp === 'pending');

        if (importPhase) {
          appendImportLog(line, tone);
          return;
        }

        if (entriesPhase) {
          appendEntriesLog(line, tone);
          return;
        }

        if (crawlPhase || scrapeFailure) {
          appendScrapeLog(line, tone);
          appendScrapeProgressMessageLog(line, tone);
        }
      };

      const logImportStatusChange = (newStatus: string) => {
        if (!newStatus || newStatus === lastImportStatusRef.current) {
          return;
        }

        lastImportStatusRef.current = newStatus;

        const messages: Record<string, [string, JobProgressLogLine['tone']]> = {
          queued: ['Import queued — waiting for Lambda', 'info'],
          importing: ['Importing content types to Contentstack...', 'info'],
          imported: ['Import complete — content types live in Contentstack', 'ok'],
          failed: ['Import failed — check logs', 'err'],
          pending: ['Import pending', 'info'],
        };
        const [msg, tone] = messages[newStatus] ?? [`Import status: ${newStatus}`, 'info'];
        appendImportLog(msg, tone);
      };

      const logEntriesStatusChange = (newStatus: string, message?: string) => {
        if (!newStatus || newStatus === lastEntriesStatusRef.current) {
          return;
        }

        lastEntriesStatusRef.current = newStatus;

        const messages: Record<string, [string, JobProgressLogLine['tone']]> = {
          pending: ['Entries generation pending', 'info'],
          generating: ['Generating entries with AI...', 'info'],
          generated: [message || 'Entries generated successfully', 'ok'],
          failed: ['Entries generation failed', 'err'],
        };
        const [msg, tone] = messages[newStatus] ?? [`Entries status: ${newStatus}`, 'info'];
        appendEntriesLog(message && newStatus === 'generated' ? message : msg, tone);
      };

      const applyRow = (row: Record<string, unknown>) => {
        const p = parseProgress(row.progress);

        if (p != null) {
          setProgress(p);
        }

        if (row.progress_message != null) {
          const text = String(row.progress_message).trim();

          if (text) {
            setProgressMessage(text);
          }
        }

        if (row.status) {
          setStatus(row.status as JobStatus);
        }

        if (row.import_status != null) {
          setImportStatus(row.import_status as ImportStatus);
          logImportStatusChange(row.import_status as string);
        }

        if (row.entries_status != null) {
          setEntriesStatus(row.entries_status as EntriesStatus);
          logEntriesStatusChange(row.entries_status as string, row.entries_message as string | undefined);
        }

        if (row.entries_progress != null) {
          const ep = parseProgress(row.entries_progress);

          if (ep != null) {
            setEntriesProgress(ep);
          }
        }

        if (row.entries_message != null) {
          setEntriesMessage(String(row.entries_message).trim());
        }

        if (row.error != null) {
          const errText = String(row.error).trim();

          if (errText && errText !== lastErrorRef.current) {
            lastErrorRef.current = errText;
            const impE = row.import_status != null ? String(row.import_status) : '';
            const errLower = errText.toLowerCase();
            const importErr =
              impE === 'queued' ||
              impE === 'importing' ||
              impE === 'failed' ||
              (String(row.status ?? '') === 'completed' &&
                (errLower.includes('import') || errLower.includes('contentstack')));
            if (importErr) {
              appendImportLog(errText, 'err');
            } else {
              appendScrapeLog(errText, 'err');
            }
          }
        }

        logProgressLine(row);
      };

      const isDone = (row: Record<string, unknown>): boolean => {
        const imp = row.import_status as string | null | undefined;
        return row.status === 'failed' || imp === 'imported' || imp === 'failed';
      };

      const logPollingStopped = (row: Record<string, unknown>) => {
        const imp = row.import_status as string | null | undefined;

        if (imp === 'imported' || imp === 'failed') {
          appendImportLog(
            imp === 'imported' ? 'Job-Complete — polling stopped.' : 'Job ended — polling stopped.',
            imp === 'imported' ? 'ok' : 'err',
          );
        } else {
          appendScrapeLog(
            row.status === 'failed' ? 'Job failed — polling stopped.' : 'Job ended — polling stopped.',
            'err',
          );
        }
      };

      const stopPolling = () => {
        if (intervalId != null) {
          clearInterval(intervalId);
          intervalId = null;
        }

        setPolling(false);
      };

      const applyScrapeApiForS3 = async (row: Record<string, unknown> | null) => {
        if (!scrapeApiToken || cancelled) {
          return;
        }

        const scrapeDone =
          row?.status === 'completed' ||
          (typeof row?.progress === 'number' && (row.progress as number) >= 100) ||
          (typeof row?.progress === 'string' && Number.parseFloat(row.progress as string) >= 100);

        if (scrapeDone && !s3PollStartedRef.current) {
          s3PollStartedRef.current = true;
          appendEntriesLog('Polling S3 (via GET /scrape) for entries export status…', 'info');
        }

        const result = await fetchScrapeJobDetail(scrapeApiToken, id);

        if (cancelled || !result.ok) {
          return;
        }

        const { s3_key: s3Key, status: apiStatus } = result.data;
        const key = s3Key?.trim() ?? '';

        if (key && key !== lastS3KeyRef.current) {
          lastS3KeyRef.current = key;
          appendEntriesLog(`S3: entry bundle available — ${shortS3Key(key)}`, 'ok');
        }

        const apiComplete =
          apiStatus === 'completed' || apiStatus === 'complete' || apiStatus === 'succeeded' || apiStatus === 'success';

        if (!key && apiComplete && !s3WaitLoggedRef.current) {
          s3WaitLoggedRef.current = true;
          appendEntriesLog('Scrape job finished API-side — waiting for entries bundle in S3…', 'info');
        }
      };

      const tick = async () => {
        if (cancelled) {
          return;
        }

        const { data, error } = await sb
          .from('jobs')
          .select(
            'progress, progress_message, status, error, import_status, entries_status, entries_progress, entries_message',
          )
          .eq('id', id)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (error) {
          return;
        }

        if (!data) {
          return;
        }

        const row = data as Record<string, unknown>;

        applyRow(row);
        await applyScrapeApiForS3(row);

        if (cancelled) {
          return;
        }

        if (isDone(row)) {
          logPollingStopped(row);
          stopPolling();
        }
      };

      void tick();
      intervalId = setInterval(() => void tick(), POLL_MS);

      const channel = sb
        .channel(`job-progress-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, (payload) => {
          const row = payload.new as Record<string, unknown>;

          if (row.id !== id) {
            return;
          }

          applyRow(row);
          void applyScrapeApiForS3(row);

          if (isDone(row)) {
            logPollingStopped(row);
            stopPolling();
            sb.removeChannel(channel);
          }
        })
        .subscribe((state) => {
          if (state === 'SUBSCRIBED') {
            appendScrapeLog('Connected to realtime — receiving live updates', 'info');
          }
        });

      teardown = () => {
        cancelled = true;
        stopPolling();
        sb.removeChannel(channel);
      };
    }

    return () => {
      teardown?.();
    };
  }, [jobId, scrapeApiToken]);

  return {
    progress,
    progressMessage,
    status,
    importStatus,
    entriesStatus,
    entriesProgress,
    entriesMessage,
    supabaseLogs,
    scrapeProgressMessageLogs,
    entriesLogs,
    importLogs,
    supabaseReady,
    polling,
  };
}
