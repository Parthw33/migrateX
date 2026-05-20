import React, { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';

export type PipelineStageStatus = 'waiting' | 'running' | 'done';

export interface PipelineLogLine {
  id: string;
  time: string;
  message: string;
  tone?: 'info' | 'ok' | 'err';
}

export interface PipelineStageProps {
  title: string;
  subtitle: string;
  status: PipelineStageStatus;
  progressPct: number;
  barLabel: string;
  logs: PipelineLogLine[];
  barClass: 'scrape' | 'ai' | 'import';
  icon: 'scrape' | 'ai' | 'import';
  children?: React.ReactNode;
}

function StageIcon({ kind }: { kind: 'scrape' | 'ai' | 'import' }) {
  if (kind === 'scrape') {
    return (
      <svg viewBox="0 0 15 15" className="w-3.5 h-3.5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6" cy="6" r="4" stroke="#7c3aed" strokeWidth="1.5" />
        <path d="M9.5 9.5L13 13" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === 'ai') {
    return (
      <svg viewBox="0 0 15 15" className="w-3.5 h-3.5" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 7.5h11M7.5 2v11" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7.5" cy="7.5" r="5.5" stroke="#0ea5e9" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 15 15" className="w-3.5 h-3.5" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7.5 2v8M4 7l3.5 3.5L11 7"
        stroke="#059669"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2 12h11" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function barGradient(kind: 'scrape' | 'ai' | 'import') {
  if (kind === 'scrape') {
    return 'bg-gradient-to-r from-violet-600 to-violet-300';
  }

  if (kind === 'ai') {
    return 'bg-gradient-to-r from-sky-500 to-sky-300';
  }

  return 'bg-gradient-to-r from-emerald-600 to-emerald-300';
}

function iconBg(kind: 'scrape' | 'ai' | 'import') {
  if (kind === 'scrape') {
    return 'bg-violet-100';
  }

  if (kind === 'ai') {
    return 'bg-sky-100';
  }

  return 'bg-emerald-100';
}

export const PipelineStageCard: React.FC<PipelineStageProps> = ({
  title,
  subtitle,
  status,
  progressPct,
  barLabel,
  logs,
  barClass,
  icon,
  children,
}) => {
  const showLogs = status === 'running' || status === 'done' || logs.length > 0;

  // ✅ Auto scroll ref
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // ✅ Auto scroll jab bhi naya log aaye
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [logs]);

  return (
    <div
      className={classNames(
        'rounded-2xl border px-5 py-4 sm:px-6 sm:py-5 transition-all duration-300 bg-migratex-elements-background-depth-1 shadow-sm shadow-black/[0.03]',
        status === 'running'
          ? 'border-violet-400/45 ring-1 ring-violet-500/10'
          : status === 'done'
            ? 'border-emerald-300/50 ring-1 ring-emerald-500/5'
            : 'border-migratex-elements-borderColor',
      )}
    >
      <div className="flex items-center gap-3.5 mb-4">
        <div className={classNames('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', iconBg(icon))}>
          <StageIcon kind={icon} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-migratex-elements-textPrimary leading-snug">{title}</div>
          <div className="text-xs text-migratex-elements-textSecondary mt-1 leading-relaxed">{subtitle}</div>
        </div>
        <span
          className={classNames(
            'text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0',
            status === 'waiting'
              ? 'bg-migratex-elements-background-depth-2 text-migratex-elements-textTertiary'
              : undefined,
            status === 'running' ? 'bg-violet-100 text-violet-800' : undefined,
            status === 'done' ? 'bg-emerald-100 text-emerald-800' : undefined,
          )}
        >
          {status === 'waiting' ? 'Waiting' : status === 'running' ? 'Running' : 'Done'}
        </span>
      </div>

      <div className="h-2 rounded-full bg-migratex-elements-background-depth-2 overflow-hidden">
        <div
          className={classNames('h-full rounded-full transition-[width] duration-500 ease-out', barGradient(barClass))}
          style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
        />
      </div>
      <div className="flex justify-between items-start gap-3 mt-2.5">
        <span className="text-xs text-migratex-elements-textSecondary leading-relaxed truncate pr-2 min-w-0">
          {barLabel}
        </span>
        <span className="text-xs font-medium text-migratex-elements-textSecondary tabular-nums">
          {Math.round(progressPct)}%
        </span>
      </div>

      {showLogs && logs.length > 0 && (
        <div
          ref={logsContainerRef}
          className="mt-4 pt-4 border-t border-migratex-elements-borderColor/80 max-h-44 overflow-y-auto space-y-2"
        >
          {logs.map((line) => (
            <div key={line.id} className="flex gap-3 text-[11px] font-mono leading-relaxed">
              <span className="text-migratex-elements-textTertiary shrink-0">{line.time}</span>
              <span
                className={classNames(
                  'break-all',
                  line.tone === 'ok' ? 'text-emerald-700' : undefined,
                  line.tone === 'err' ? 'text-red-600' : undefined,
                  !line.tone || line.tone === 'info' ? 'text-migratex-elements-textSecondary' : undefined,
                )}
              >
                {line.message}
              </span>
            </div>
          ))}
          {/* ✅ Auto scroll anchor */}
          <div ref={logsEndRef} />
        </div>
      )}

      {children ? <div className="mt-4 border-t border-migratex-elements-borderColor/80 pt-4">{children}</div> : null}
    </div>
  );
};

export interface MigrationPipelineShellProps {
  websiteUrl: string;

  /** Optional job id for context (header stays product-agnostic; brand lives in the app chrome). */
  jobId?: string | null;
  stage1: PipelineStageProps;
  stage2: PipelineStageProps;

  /** When set, rendered after stage2 (e.g. Contentstack import). */
  stage3?: PipelineStageProps;
  onRestart?: () => void;
}

function formatTargetForHeader(url: string): string {
  const t = url.trim();

  if (!t) {
    return '—';
  }

  return t.replace(/^https?:\/\//i, '').replace(/\/$/, '') || t;
}

function StageConnector() {
  return (
    <div className="flex justify-center py-1" aria-hidden>
      <div className="w-px h-8 bg-gradient-to-b from-migratex-elements-borderColor via-violet-300/40 to-migratex-elements-borderColor rounded-full" />
    </div>
  );
}

export const MigrationPipelineShell: React.FC<MigrationPipelineShellProps> = ({
  websiteUrl,
  jobId,
  stage1,
  stage2,
  stage3,
  onRestart,
}) => {
  const target = formatTargetForHeader(websiteUrl);
  const id = jobId?.trim() || '';

  return (
    <div className="px-5 sm:px-8 py-8 max-w-[720px] mx-auto w-full">
      <header className="mb-8 pb-6 border-b border-migratex-elements-borderColor/70">
        <div className="flex flex-col gap-3 min-w-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-migratex-elements-textTertiary">
              Migration pipeline
            </p>
            <div className="mt-3 space-y-1.5 min-w-0">
              <p className="text-sm font-medium text-migratex-elements-textSecondary">Site to be migrated</p>
              <p className="text-lg sm:text-[1.35rem] font-semibold text-migratex-elements-textPrimary leading-snug tracking-tight">
                <span className="font-mono text-[0.92em] sm:text-[1.02em] font-medium break-all [overflow-wrap:anywhere]">
                  {target}
                </span>
              </p>
            </div>
          </div>

          {id ? (
            <div className="rounded-lg border border-migratex-elements-borderColor/70 bg-migratex-elements-background-depth-1 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-migratex-elements-textTertiary">
                    Job ID
                  </p>
                  <code className="mt-1.5 block font-mono text-xs sm:text-sm text-migratex-elements-textPrimary leading-relaxed break-all [overflow-wrap:anywhere]">
                    {id}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(id).then(
                      () => toast.success('Job ID copied'),
                      () => toast.error('Could not copy'),
                    );
                  }}
                  className="shrink-0 mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-migratex-elements-borderColor bg-white text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-2 hover:text-migratex-elements-textPrimary hover:border-violet-300/80 transition-colors"
                  aria-label="Copy job ID"
                  title="Copy job ID"
                >
                  <span className="i-ph:copy text-lg" aria-hidden />
                </button>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-migratex-elements-textSecondary leading-relaxed max-w-[48ch]">
            Crawl, entry generation, and import run in sequence below.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-0">
        <PipelineStageCard {...stage1} />
        <StageConnector />
        <PipelineStageCard {...stage2} />
        {stage3 ? (
          <>
            <StageConnector />
            <PipelineStageCard {...stage3} />
          </>
        ) : null}
      </div>

      {onRestart ? (
        <div className="flex justify-center mt-10 pt-6 border-t border-migratex-elements-borderColor/60">
          <button
            type="button"
            onClick={onRestart}
            className="text-sm px-6 py-2.5 rounded-lg border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-2 hover:border-migratex-elements-textTertiary/30 transition-colors"
          >
            Run again
          </button>
        </div>
      ) : null}
    </div>
  );
};
