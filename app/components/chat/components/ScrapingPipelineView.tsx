import React, { useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import type { ScrapingLog } from '~/components/chat/types';
import { MigrationPipelineShell, type PipelineLogLine, type PipelineStageStatus } from './MigrationPipelineShell';
import { useSupabaseJobProgress } from '~/lib/useSupabaseJobProgress';
import { getSupabaseClient } from '~/lib/supabaseClient';
import { getScrapeJobId } from '~/lib/scrapeJobSession';
import { authStore } from '~/lib/stores/auth';
import { Skeleton } from '~/components/ui/Skeleton';

function formatTimeFromDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function logTone(t: ScrapingLog['type']): PipelineLogLine['tone'] {
  if (t === 'success') {
    return 'ok';
  }

  if (t === 'error') {
    return 'err';
  }

  return 'info';
}

export interface ScrapingPipelineViewProps {
  websiteUrl: string;
  jobId: string | null;
  scrapingLogs: ScrapingLog[];
  isScrapingComplete: boolean;
  hasScrapeError: boolean;
  onRetry: () => void;
  onSupabaseScrapeComplete?: () => void;
}

export const ScrapingPipelineView: React.FC<ScrapingPipelineViewProps> = ({
  websiteUrl,
  jobId: jobIdProp,
  scrapingLogs,
  isScrapingComplete,
  hasScrapeError,
  onRetry,
  onSupabaseScrapeComplete,
}) => {
  const auth = useStore(authStore);
  const effectiveJobId = (jobIdProp?.trim() || getScrapeJobId()?.trim() || null) as string | null;

  const {
    progress: sbProgress,
    progressMessage: sbMessage,
    status,
    entriesStatus,
    entriesProgress,
    entriesMessage,
    entriesLogs,
    scrapeProgressMessageLogs,
    supabaseReady,
    polling,
  } = useSupabaseJobProgress(effectiveJobId, { scrapeApiToken: auth.appToken });

  const completeNotifiedRef = useRef(false);
  const onCompleteRef = useRef(onSupabaseScrapeComplete);
  onCompleteRef.current = onSupabaseScrapeComplete;

  useEffect(() => {
    if (!supabaseReady || !effectiveJobId) {
      return;
    }

    if (status === 'completed' && onCompleteRef.current && !completeNotifiedRef.current) {
      completeNotifiedRef.current = true;
      onCompleteRef.current();
    }
  }, [supabaseReady, effectiveJobId, status]);

  useEffect(() => {
    completeNotifiedRef.current = false;
  }, [effectiveJobId]);

  const supabaseConfigured = getSupabaseClient() != null;
  const useDbBar = Boolean(supabaseConfigured && effectiveJobId);

  const fallbackLogs = useMemo((): PipelineLogLine[] => {
    return scrapingLogs.map((l) => ({
      id: l.id,
      time: formatTimeFromDate(l.timestamp),
      message: l.message,
      tone: logTone(l.type),
    }));
  }, [scrapingLogs]);

  const displayLogs: PipelineLogLine[] = useDbBar ? scrapeProgressMessageLogs : fallbackLogs;
  const stage1Pct = useDbBar ? sbProgress : isScrapingComplete ? 100 : scrapingLogs.length > 0 ? 6 : 0;
  const scrapeDoneByDb = useDbBar && status === 'completed';
  const stage1Done = isScrapingComplete || scrapeDoneByDb;

  const stage1Status: PipelineStageStatus = hasScrapeError
    ? 'running'
    : stage1Done
      ? 'done'
      : scrapingLogs.length > 0 || polling || (effectiveJobId && supabaseReady)
        ? 'running'
        : 'waiting';

  const stage1Title =
    status === 'completed'
      ? 'Scrape & AI analysis'
      : sbProgress > 50
        ? 'AI content analysis'
        : 'Website crawl & scraping';

  const stage1Label = useDbBar
    ? sbMessage || (polling ? `Supabase · ${Math.round(sbProgress)}%` : `${Math.round(sbProgress)}%`)
    : hasScrapeError
      ? 'Scrape error — use Retry or go back'
      : effectiveJobId && supabaseReady
        ? 'Waiting for first `jobs` row…'
        : supabaseConfigured
          ? 'Start crawl to receive a job id, then progress loads from Supabase.'
          : 'Configure Supabase — progress is not read from GET /scrape/{id} or crawler SSE.';

  const entriesStage = useMemo(() => {
    let st: PipelineStageStatus = 'waiting';

    if (!stage1Done) {
      st = 'waiting';
    } else if (entriesStatus === 'failed') {
      st = 'running';
    } else if (entriesStatus === 'generated') {
      st = 'done';
    } else if (entriesStatus === 'generating' || entriesStatus === 'pending' || (supabaseReady && polling)) {
      st = 'running';
    }

    const pct =
      entriesStatus === 'generated'
        ? 100
        : entriesProgress > 0
          ? entriesProgress
          : entriesStatus === 'generating'
            ? Math.max(12, entriesProgress)
            : 0;

    const barLabel =
      entriesMessage ||
      (!stage1Done
        ? 'Starts after crawl completes'
        : entriesStatus === 'generating'
          ? 'Creating entries…'
          : entriesStatus === 'generated'
            ? 'Entries ready'
            : polling
              ? 'Watching Supabase + S3 for entries…'
              : 'Waiting for entries…');

    return {
      title: 'Entries creation',
      subtitle: 'AI entries + S3 export (updates while the job row changes)',
      status: st,
      progressPct: pct,
      barLabel,
      logs: entriesLogs,
      barClass: 'ai' as const,
      icon: 'ai' as const,
    };
  }, [stage1Done, entriesStatus, entriesProgress, entriesMessage, entriesLogs, supabaseReady, polling]);

  const stage3Label = scrapeDoneByDb
    ? 'Scrape complete — continue to run Contentstack import on the next step.'
    : 'After the job completes, you can run Contentstack import from the import step.';

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-migratex-elements-background-depth-2/30">
      {/* Initial connecting skeleton — shown before logs arrive or supabase connects */}
      {!supabaseReady && scrapingLogs.length === 0 && !hasScrapeError && (
        <div className="flex-1 flex flex-col gap-4 p-6">
          <Skeleton.StepCard variant="shimmer" />
          <div className="bg-white rounded-xl border border-migratex-elements-borderColor p-4">
            <Skeleton.Base variant="shimmer" className="h-3 w-32 rounded mb-3" />
            <Skeleton.LogLines count={5} variant="shimmer" />
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-3 px-5 sm:px-8 py-3.5 border-b border-migratex-elements-borderColor/80 bg-migratex-elements-background-depth-1 shrink-0">
        <div className="flex items-center gap-2">
          {useDbBar ? (
            <span className="text-xs font-medium text-migratex-elements-textSecondary tabular-nums">
              DB {Math.round(sbProgress)}%{polling ? ' · polling' : ''}
            </span>
          ) : null}
          {hasScrapeError ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 shadow-sm transition-colors"
            >
              Retry scrape
            </button>
          ) : null}
        </div>
      </div>

      <MigrationPipelineShell
        websiteUrl={websiteUrl}
        jobId={effectiveJobId}
        stage1={{
          title: stage1Title,
          subtitle: useDbBar
            ? 'Crawling site + AI content analysis'
            : 'Crawler stream for logs only — bar updates from Supabase once job id is known',
          status: stage1Status,
          progressPct: stage1Pct,
          barLabel: stage1Label,
          logs: displayLogs,
          barClass: 'scrape',
          icon: 'scrape',
        }}
        stage2={entriesStage}
        stage3={{
          title: 'Contentstack import',
          subtitle: 'POST /import/{jobId} from the import step after entries are ready',
          status: 'waiting',
          progressPct: 0,
          barLabel: stage3Label,
          logs: [],
          barClass: 'import',
          icon: 'import',
        }}
      />
    </div>
  );
};
