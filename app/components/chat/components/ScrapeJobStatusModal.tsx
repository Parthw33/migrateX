import React, { useMemo } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';

const HIGHLIGHT_KEYS = [
  'status',
  'state',
  'job_status',
  'progress',
  'progress_message',
  'percent',
  'message',
  'error',
  'error_message',
  'url',
  'website_url',
  'created_at',
  'updated_at',
  'started_at',
  'completed_at',
  'finished_at',
];

function normalizeStatusLabel(raw: string): { label: string; tone: 'neutral' | 'ok' | 'warn' | 'err' | 'run' } {
  const s = raw.toLowerCase();

  if (s.includes('complete') || s.includes('success') || s === 'done' || s === 'succeeded') {
    return { label: raw, tone: 'ok' };
  }

  if (s.includes('fail') || s.includes('error') || s === 'cancelled' || s === 'canceled') {
    return { label: raw, tone: 'err' };
  }

  if (s.includes('pending') || s.includes('queue') || s.includes('wait')) {
    return { label: raw, tone: 'warn' };
  }

  if (s.includes('run') || s.includes('progress') || s.includes('active') || s.includes('scraping')) {
    return { label: raw, tone: 'run' };
  }

  return { label: raw, tone: 'neutral' };
}

function valueToDisplayString(v: unknown): string {
  if (v == null) {
    return '';
  }

  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  return String(v);
}

function badgeClass(tone: 'neutral' | 'ok' | 'warn' | 'err' | 'run') {
  switch (tone) {
    case 'ok': {
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    }
    case 'err': {
      return 'bg-red-50 text-red-800 ring-red-200';
    }
    case 'warn': {
      return 'bg-amber-50 text-amber-900 ring-amber-200';
    }
    case 'run': {
      return 'bg-violet-50 text-violet-800 ring-violet-200';
    }
    default: {
      return 'bg-gray-50 text-gray-800 ring-gray-200';
    }
  }
}

export interface ScrapeJobStatusModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string | null;
  loading: boolean;
  error: string | null;
  payload: unknown;
}

export const ScrapeJobStatusModal: React.FC<ScrapeJobStatusModalProps> = ({
  open,
  onClose,
  jobId,
  loading,
  error,
  payload,
}) => {
  const { rows, statusBadge, rawJson } = useMemo(() => {
    if (payload == null || typeof payload !== 'object') {
      return {
        rows: [] as { key: string; value: string }[],
        statusBadge: null as { label: string; tone: 'neutral' | 'ok' | 'warn' | 'err' | 'run' } | null,
        rawJson: payload == null ? '' : String(payload),
      };
    }

    const o = payload as Record<string, unknown>;
    const rows: { key: string; value: string }[] = [];
    const seen = new Set<string>();

    for (const k of HIGHLIGHT_KEYS) {
      if (k in o && o[k] != null && valueToDisplayString(o[k]) !== '') {
        rows.push({ key: k, value: valueToDisplayString(o[k]) });
        seen.add(k);
      }
    }

    for (const [k, v] of Object.entries(o)) {
      if (seen.has(k)) {
        continue;
      }

      if (v == null) {
        continue;
      }

      const value = valueToDisplayString(v);

      if (value === '') {
        continue;
      }

      rows.push({ key: k, value });
    }

    const statusRaw =
      (o.status as string) ||
      (o.state as string) ||
      (o.job_status as string) ||
      (typeof o.job === 'object' && o.job && (o.job as Record<string, unknown>).status != null
        ? String((o.job as Record<string, unknown>).status)
        : '');
    const statusBadge = statusRaw ? normalizeStatusLabel(statusRaw) : null;

    let rawJson = '';

    try {
      rawJson = JSON.stringify(payload, null, 2);
    } catch {
      rawJson = String(payload);
    }

    return { rows, statusBadge, rawJson };
  }, [payload]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scrape-job-status-title"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-migratex-elements-borderColor">
          <div>
            <h2 id="scrape-job-status-title" className="text-lg font-semibold text-migratex-elements-textPrimary">
              Job row
            </h2>
            {jobId && <p className="mt-1 text-xs font-mono text-migratex-elements-textTertiary break-all">{jobId}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-migratex-elements-textTertiary hover:bg-migratex-elements-background-depth-2 hover:text-migratex-elements-textPrimary transition"
            aria-label="Close"
          >
            <div className="i-ph:x text-xl" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-3 text-sm text-migratex-elements-textSecondary">
              <div className="i-svg-spinners:90-ring-with-bg text-xl text-purple-600" />
              Fetching status…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          )}

          {!loading && !error && payload != null && (
            <>
              {statusBadge && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-migratex-elements-textSecondary">
                    Status
                  </span>
                  <span
                    className={classNames(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset',
                      badgeClass(statusBadge.tone),
                    )}
                  >
                    {statusBadge.label}
                  </span>
                </div>
              )}

              {rows.length > 0 && (
                <dl className="space-y-2">
                  {rows.map(({ key, value }) => (
                    <div
                      key={key}
                      className="grid grid-cols-1 sm:grid-cols-[minmax(7.5rem,34%)_minmax(0,1fr)] gap-x-3 gap-y-1 items-start text-sm border-b border-migratex-elements-borderColor/60 pb-2 last:border-0"
                    >
                      <dt className="font-medium text-migratex-elements-textSecondary capitalize min-w-0 shrink-0">
                        {key.replaceAll('_', ' ')}
                      </dt>
                      <dd className="min-w-0 text-migratex-elements-textPrimary font-mono text-xs sm:text-sm break-all [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <details className="group rounded-lg border border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 overflow-hidden">
                <summary className="flex list-none cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-migratex-elements-textSecondary hover:text-migratex-elements-textPrimary [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 min-w-0">Raw response</span>
                  {rawJson ? (
                    <button
                      type="button"
                      className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 text-migratex-elements-textSecondary hover:bg-white hover:text-migratex-elements-textPrimary hover:border-violet-300/70 transition-colors"
                      aria-label="Copy raw JSON"
                      title="Copy raw JSON"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void navigator.clipboard.writeText(rawJson).then(
                          () => toast.success('Raw JSON copied'),
                          () => toast.error('Could not copy'),
                        );
                      }}
                    >
                      <span className="i-ph:copy text-base" aria-hidden />
                    </button>
                  ) : null}
                </summary>
                <pre className="px-3 pb-3 pt-1 text-[11px] leading-relaxed text-migratex-elements-textPrimary overflow-x-auto max-h-48 border-t border-migratex-elements-borderColor/50">
                  {rawJson}
                </pre>
              </details>
            </>
          )}

          {!loading && !error && payload == null && (
            <p className="text-sm text-migratex-elements-textSecondary">No data returned.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-migratex-elements-borderColor bg-migratex-elements-background-depth-2">
          {jobId && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(jobId);
              }}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-white transition"
            >
              Copy job ID
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
