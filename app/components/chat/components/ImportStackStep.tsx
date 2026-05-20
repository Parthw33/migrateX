import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { getScrapeJobId } from '~/lib/scrapeJobSession';
import { authStore } from '~/lib/stores/auth';
import { classNames } from '~/utils/classNames';
import { MigrationPipelineShell } from './MigrationPipelineShell';
import type { PipelineStageStatus } from './MigrationPipelineShell';
import { useSupabaseJobProgress } from '~/lib/useSupabaseJobProgress';

export interface ImportStackStepProps {
  websiteUrl: string;
  onCreateWebsite: () => void | Promise<void>;
  onStartImport: () => void | Promise<void>;
  importLoading: boolean;
  importSucceeded: boolean;
}

const IMPORT_PROGRESS_RE = /(?:progress\s*)?(\d{1,3})%/i;

function deriveImportProgressFromLogs(logs: Array<{ message: string }>, importStatus: string | null): number {
  let highest = 0;

  for (const log of logs) {
    const message = log.message.trim();
    const lower = message.toLowerCase();
    const pctMatch = message.match(IMPORT_PROGRESS_RE);

    if (pctMatch) {
      const parsed = Number.parseInt(pctMatch[1], 10);
      if (!Number.isNaN(parsed)) {
        highest = Math.max(highest, Math.min(100, parsed));
      }
      continue;
    }

    if (lower.includes('import started')) highest = Math.max(highest, 8);
    else if (lower.includes('downloading schema')) highest = Math.max(highest, 20);
    else if (lower.includes('configuring contentstack cli')) highest = Math.max(highest, 38);
    else if (lower.includes('running cs cli import')) highest = Math.max(highest, 62);
    else if (lower.includes('import complete')) highest = Math.max(highest, 100);
  }

  if (importStatus === 'imported') return 100;
  if (importStatus === 'importing') return Math.max(highest, 12);
  if (importStatus === 'queued') return Math.max(highest, 6);

  return highest;
}

export const ImportStackStep: React.FC<ImportStackStepProps> = ({
  websiteUrl,
  onCreateWebsite,
  onStartImport,
  importLoading,
  importSucceeded,
}) => {
  const auth = useStore(authStore);
  const jobId = getScrapeJobId();

  const {
    status: jobStatus,
    progressMessage: crawlProgressMessage,
    importStatus: hookImportStatus,
    entriesStatus,
    entriesProgress,
    entriesMessage,
    scrapeProgressMessageLogs,
    entriesLogs,
    importLogs,
    supabaseReady,
    polling,
  } = useSupabaseJobProgress(jobId, { scrapeApiToken: auth.appToken });

  const [websiteLoading, setWebsiteLoading] = useState(false);
  const [importWavyPct, setImportWavyPct] = useState(28);

  const importComplete = hookImportStatus === 'imported';
  const importFailed = hookImportStatus === 'failed';
  const entriesComplete = entriesStatus === 'generated';

  /** POST /import returned OK; Lambda may still be running. */
  const importRunningBackend = importSucceeded && !importComplete && !importFailed;
  const importBusyUi = importLoading || importRunningBackend;
  const importButtonDisabled = importLoading || importRunningBackend || !entriesComplete;

  const importButtonTitle = useMemo(() => {
    if (!entriesComplete) {
      return 'Wait until entries creation finishes';
    }

    if (!importLoading && !importRunningBackend) {
      return 'Entries creation complete — you can start the Contentstack import';
    }

    return undefined;
  }, [entriesComplete, importLoading, importRunningBackend]);

  useEffect(() => {
    let id: number | undefined;

    if (importBusyUi) {
      id = window.setInterval(() => {
        setImportWavyPct((p) => {
          const jitter = Math.random() * 16 - 8;

          return Math.round(Math.min(91, Math.max(14, p + jitter)));
        });
      }, 520);
    }

    return () => {
      if (id != null) {
        window.clearInterval(id);
      }
    };
  }, [importBusyUi]);

  const handleWebsiteBuilder = async () => {
    setWebsiteLoading(true);
    try {
      await onCreateWebsite();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start website generation');
    } finally {
      setWebsiteLoading(false);
    }
  };

  const importStageStatus: PipelineStageStatus = importComplete
    ? 'done'
    : importFailed || importBusyUi
      ? 'running'
      : 'waiting';

  const latestImportLogMessage = useMemo(
    () =>
      [...importLogs]
        .reverse()
        .find((line) => Boolean(line.message.trim()))
        ?.message.trim() ?? '',
    [importLogs],
  );

  const derivedImportProgressPct = useMemo(
    () => deriveImportProgressFromLogs(importLogs, hookImportStatus),
    [importLogs, hookImportStatus],
  );

  const importBarLabel = useMemo(() => {
    if (importComplete) {
      return 'Import finished — you can generate your website.';
    }

    if (importFailed) {
      return 'Import failed — see logs below.';
    }

    if (importLoading) {
      return 'Sending import request…';
    }

    if (importRunningBackend) {
      if (latestImportLogMessage) {
        return latestImportLogMessage;
      }

      const byStatus: Record<string, string> = {
        pending: 'Import pending — waiting for worker…',
        queued: 'Import queued — waiting for Lambda…',
        importing: 'Importing content types to Contentstack…',
      };

      return (hookImportStatus && byStatus[hookImportStatus]) || 'Import in progress…';
    }

    return jobId ? 'Run POST /import/{jobId} with your session when you are ready' : 'Missing scrape job id';
  }, [
    importComplete,
    importFailed,
    importLoading,
    importRunningBackend,
    hookImportStatus,
    jobId,
    latestImportLogMessage,
  ]);

  const importProgressPct = importComplete
    ? 100
    : importFailed
      ? Math.max(derivedImportProgressPct, 1)
      : derivedImportProgressPct > 0
        ? derivedImportProgressPct
        : importBusyUi
          ? importWavyPct
          : 0;

  const entriesStage = useMemo(() => {
    const scrapeDone = jobStatus === 'completed';
    let st: PipelineStageStatus = 'waiting';

    if (entriesStatus === 'failed') {
      st = 'running';
    } else if (entriesStatus === 'generated') {
      st = 'done';
    } else if (entriesStatus === 'generating' || (scrapeDone && entriesStatus === 'pending')) {
      st = 'running';
    } else if (scrapeDone && supabaseReady && polling && (entriesStatus == null || entriesStatus === 'pending')) {
      st = 'running';
    }

    const pct =
      entriesStatus === 'generated'
        ? 100
        : entriesProgress > 0
          ? entriesProgress
          : entriesStatus === 'generating'
            ? Math.max(15, entriesProgress)
            : 0;

    const barLabel =
      entriesMessage ||
      (entriesStatus === 'generating'
        ? 'Creating entries…'
        : entriesStatus === 'generated'
          ? 'Entries ready for Contentstack import'
          : entriesStatus === 'failed'
            ? 'Entries step failed — see logs'
            : scrapeDone
              ? polling
                ? 'Watching Supabase + S3 for entries progress…'
                : 'Waiting for entries…'
              : 'Complete the crawl step first');

    return {
      title: 'Entries creation',
      subtitle: 'AI-generated entries and S3 export (polled with Contentstack job row)',
      status: st,
      progressPct: pct,
      barLabel,
      logs: entriesLogs,
      barClass: 'ai' as const,
      icon: 'ai' as const,
    };
  }, [jobStatus, entriesStatus, entriesProgress, entriesMessage, entriesLogs, supabaseReady, polling]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-migratex-elements-background-depth-2/30">
      <MigrationPipelineShell
        websiteUrl={websiteUrl}
        jobId={jobId}
        stage1={{
          title: 'Website crawl & scraping',
          subtitle: 'Scrape finished · job synced',
          status: 'done',
          progressPct: 100,
          barLabel: crawlProgressMessage.trim() || 'Complete',
          logs: scrapeProgressMessageLogs,
          barClass: 'scrape',
          icon: 'scrape',
        }}
        stage2={entriesStage}
        stage3={{
          title: 'Contentstack import',
          subtitle: jobId
            ? `Job ${jobId.slice(0, 8)}…${hookImportStatus ? ` · ${hookImportStatus}` : ''}`
            : 'No job id',
          status: importStageStatus,
          progressPct: importProgressPct,
          barLabel: importBarLabel,
          logs: importLogs,
          barClass: 'import',
          icon: 'import',
          children: (
            <div className="space-y-4">
              {jobId ? (
                <div className="flex items-stretch gap-2">
                  <p className="flex-1 min-w-0 text-xs font-mono text-migratex-elements-textSecondary break-all leading-relaxed bg-migratex-elements-background-depth-2/50 rounded-lg px-3 py-2 border border-migratex-elements-borderColor/60">
                    {jobId}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(jobId).then(
                        () => toast.success('Job ID copied'),
                        () => toast.error('Could not copy'),
                      );
                    }}
                    className="shrink-0 self-start px-3 py-2 text-xs font-medium rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-2 hover:text-migratex-elements-textPrimary transition"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <p className="text-sm text-red-600 leading-relaxed">
                  Cannot import without a job id from the scrape step.
                </p>
              )}

              {jobId && !importComplete && (!importRunningBackend || importLoading) ? (
                <div className="space-y-2">
                  <span
                    className={classNames('block', importButtonDisabled && 'cursor-not-allowed')}
                    title={importButtonTitle}
                  >
                    <button
                      type="button"
                      onClick={() => void onStartImport()}
                      disabled={importButtonDisabled}
                      title={importButtonTitle}
                      className={classNames(
                        'w-full py-3 px-6 rounded-xl font-medium text-white text-sm transition-all',
                        importButtonDisabled
                          ? 'bg-violet-400 cursor-not-allowed pointer-events-none'
                          : 'bg-violet-600 hover:bg-violet-700 shadow-sm hover:shadow-md',
                      )}
                    >
                      {importLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="i-svg-spinners:90-ring-with-bg text-lg" />
                          Starting import…
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <span className="i-ph:cloud-arrow-up text-lg" />
                          Start Contentstack import
                        </span>
                      )}
                    </button>
                  </span>
                  {entriesComplete && !importButtonDisabled ? (
                    <p className="text-xs text-center text-emerald-700 leading-relaxed">
                      Entries creation complete — you can start the import.
                    </p>
                  ) : !entriesComplete ? (
                    <p className="text-xs text-center text-migratex-elements-textSecondary leading-relaxed">
                      Import enables when entries creation completes.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {importComplete ? (
                <>
                  <button
                    type="button"
                    onClick={handleWebsiteBuilder}
                    disabled={websiteLoading}
                    className={classNames(
                      'w-full py-3 px-6 rounded-xl font-medium text-white text-sm transition-all',
                      websiteLoading
                        ? 'bg-purple-400 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 shadow-sm hover:shadow-md',
                    )}
                  >
                    {websiteLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="i-svg-spinners:90-ring-with-bg text-lg" />
                        Starting website generation…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <span className="i-ph:rocket-launch text-lg" />
                        Generate website
                      </span>
                    )}
                  </button>
                  <p className="text-xs text-migratex-elements-textSecondary text-center leading-relaxed">
                    Opens the builder so you can preview and customize your site.
                  </p>
                </>
              ) : null}
            </div>
          ),
        }}
      />
    </div>
  );
};
