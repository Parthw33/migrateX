import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { toast } from 'react-toastify';
import { authStore } from '~/lib/stores/auth';
import { HeaderProfileMenu } from '~/components/header/HeaderProfileMenu.client';
import { lambdaListScrapes, type MigrateXScrapeJob } from '~/lib/lambdaApi';
import { Skeleton } from '~/components/ui/Skeleton';
import { useDebounce } from '~/lib/hooks/useDebounce';
import { globalLoader } from '~/lib/stores/globalLoader';
import {
  parseContentTypesCountFromProgressMessage,
  parseEntriesCountFromEntriesMessage,
} from '~/lib/parseJobDashboardMessages';
import { clearDashboardJobContext, primeDashboardJobContextFromCard } from '~/lib/dashboardJobContext';
import { extractJobRowWebsiteCredentials } from '~/lib/jobsRowWebsiteCredentials';
import { resetMigrationStore, migrationStore } from '~/lib/stores/migration';
import { clearScrapeJobId, setScrapeJobId } from '~/lib/scrapeJobSession';
import { getSupabaseClient } from '~/lib/supabaseClient';
import { requestWebsiteLiveFilesSync, setWebsiteGenerationSession } from '~/lib/websiteGenerationSession';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

const PAGE_SIZE = 20;

/* ── Utilities ────────────────────────────────────────────────────────────── */

function formatDisplayDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Seed all session stores with data from the job row so the workbench
 * has everything it needs immediately on arrival.
 */
function setupWorkbenchSession(job: MigrateXScrapeJob, row: Record<string, unknown>) {
  const creds = extractJobRowWebsiteCredentials(row);
  const st = migrationStore.get();
  const region = authStore.get().region || 'NA';

  let url = (creds.url || job.url || st.websiteUrl).trim();
  if (url && !/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  primeDashboardJobContextFromCard(job);
  setScrapeJobId(job.id);
  setWebsiteGenerationSession({
    jobId: job.id,
    url: url || job.url || '',
    cs_stack_api_key: creds.stackApiKey || st.stackUid.trim(),
    cs_org_id: creds.orgId || st.csOrganizationUid.trim(),
    cs_region: (creds.region || region).trim() || region,
    s3WebsitePrefix: creds.s3WebsitePrefix.trim(),
    startedAt: new Date().toISOString(),
  });

  workbenchStore.resetFilesForNewWebsiteSession();
  clearDashboardJobContext();
  migrationStore.setKey('currentStep', 'WORKBENCH');
}

function MigrateLogo({ className }: { className?: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 20 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M19.715 9.945v4.107l-9.878 1.37L0 14.052V9.945l9.837-1.37 9.878 1.37zM0 19.529v-4.107l5.75 3.08 13.965-3.08v4.107L5.75 23.979 0 19.53z"
        fill="#7c3aed"
      />
      <path d="M19.715 4.47v4.107l-5.75-3.08L0 8.577V4.47L13.965.02l5.75 4.45z" fill="#7c3aed" />
    </svg>
  );
}

/* ── Job card ─────────────────────────────────────────────────────────────── */

type JobDashboardCounts = { contentTypes?: number; entries?: number; assets?: number };

function parseSupabaseCount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

interface JobCardProps {
  job: MigrateXScrapeJob;
  supabaseCounts?: JobDashboardCounts;
}

const JobCard = memo(function JobCard({ job, supabaseCounts }: JobCardProps) {
  const navigate = useNavigate();
  const contentTypes = supabaseCounts?.contentTypes ?? job.contentTypes;
  const entries = supabaseCounts?.entries ?? job.entries;
  const assets = supabaseCounts?.assets ?? job.assets;
  const [isLoading, setIsLoading] = useState(false);

  async function handleOpenJob(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);

    const fallback = `/job/${encodeURIComponent(job.id)}`;
    const sb = getSupabaseClient();

    if (!sb) {
      clearScrapeJobId();
      navigate(fallback);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await sb.from('jobs').select('*').eq('id', job.id).maybeSingle();

      if (error) {
        toast.error(error.message);
        clearScrapeJobId();
        navigate(fallback);
        return;
      }

      if (!data || typeof data !== 'object') {
        clearScrapeJobId();
        navigate(fallback);
        return;
      }

      const row = data as Record<string, unknown>;
      const websiteStatus = String(row.website_status ?? '').trim().toLowerCase();

      // No website generation started yet — go to the pipeline view
      if (!websiteStatus) {
        clearScrapeJobId();
        navigate(fallback);
        return;
      }

      // Website generation queued / not started yet — continue on create-job flow (shows status there)
      if (websiteStatus === 'pending') {
        clearScrapeJobId();
        navigate(fallback);
        return;
      }

      // Any other status (generating, deploying, deployed, done, failed, etc.) — open workbench
      setupWorkbenchSession(job, row);
      navigate(`/${job.id}/generate-website`);
      queueMicrotask(() => requestWebsiteLiveFilesSync());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load job details');
      clearScrapeJobId();
      navigate(fallback);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Link
      to={`/job/${encodeURIComponent(job.id)}`}
      prefetch="intent"
      onClick={(e) => void handleOpenJob(e)}
      className={classNames(
        'relative rounded-xl border border-migratex-elements-borderColor bg-white shadow-sm',
        'hover:border-violet-300/80 hover:shadow-md transition-all duration-200',
        'flex flex-col text-left no-underline text-inherit',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2',
        isLoading ? 'pointer-events-none' : '',
      )}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-10 rounded-xl bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
          <span className="i-svg-spinners:ring-resize text-3xl text-violet-600" />
          <span className="text-xs text-migratex-elements-textSecondary font-medium">Opening…</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2 px-5 pt-4 pb-3 border-b border-migratex-elements-borderColor/60">
        <div className="min-w-0 pr-2">
          <h3 className="text-[15px] font-semibold text-migratex-elements-textPrimary leading-snug line-clamp-2">
            {job.projectName || job.title}
          </h3>
          {job.projectName && job.url ? (
            <p
              className="mt-0.5 text-[11px] font-mono text-migratex-elements-textTertiary truncate"
              title={job.url}
            >
              {job.url}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 p-1 text-migratex-elements-textTertiary" aria-hidden>
          <span className="i-ph:star text-lg" />
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 py-4 text-center border-b border-migratex-elements-borderColor/40">
        <div>
          <div className="text-lg font-semibold text-migratex-elements-textPrimary tabular-nums">{contentTypes}</div>
          <div className="text-[11px] text-migratex-elements-textSecondary mt-0.5 uppercase tracking-wide">
            Content types
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold text-migratex-elements-textPrimary tabular-nums">{entries}</div>
          <div className="text-[11px] text-migratex-elements-textSecondary mt-0.5 uppercase tracking-wide">Entries</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-migratex-elements-textPrimary tabular-nums">{assets}</div>
          <div className="text-[11px] text-migratex-elements-textSecondary mt-0.5 uppercase tracking-wide">Assets</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-5 py-3 text-xs text-migratex-elements-textSecondary">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="i-ph:users text-base shrink-0 text-migratex-elements-textTertiary" />
          <span className="truncate">{job.users > 0 ? `${job.users} Users` : '—'}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0 tabular-nums">
          <span className="i-ph:clock text-base text-migratex-elements-textTertiary" />
          {formatDisplayDate(job.updatedAt)}
        </span>
      </div>

      {job.projectName ? null : job.url ? (
        <p className="px-5 pb-3 text-[11px] font-mono text-migratex-elements-textTertiary truncate" title={job.url}>
          {job.url}
        </p>
      ) : (
        <p className="px-5 pb-3 text-[11px] text-migratex-elements-textTertiary">ID: {job.id}</p>
      )}

      {job.status !== '—' || job.progress > 0 ? (
        <div className="px-5 pb-3 flex items-center gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 font-medium capitalize">
            {job.status}
          </span>
          {job.progress > 0 ? (
            <span className="text-migratex-elements-textTertiary tabular-nums">{job.progress}%</span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
});

/* ── Dashboard page ───────────────────────────────────────────────────────── */

export function DashboardPage() {
  const navigate = useNavigate();
  const auth = useStore(authStore);
  const [jobs, setJobs] = useState<MigrateXScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchRaw, setSearch] = useState('');
  const search = useDebounce(searchRaw, 250);
  const [supabaseJobCounts, setSupabaseJobCounts] = useState<Record<string, JobDashboardCounts>>({});

  // Enrich job cards with Supabase counts once list loads
  useEffect(() => {
    let cancelled = false;

    if (!jobs.length) {
      setSupabaseJobCounts({});
      return () => { cancelled = true; };
    }

    const ids = jobs.map((j) => j.id);
    const sb = getSupabaseClient();

    if (!sb) return () => { cancelled = true; };

    void (async () => {
      const { data, error: sbErr } = await sb
        .from('jobs')
        .select('id, ct_count, asset_count, progress_message, entries_message')
        .in('id', ids);

      if (cancelled || sbErr || !data) return;

      const next: Record<string, JobDashboardCounts> = {};

      for (const row of data as {
        id: string;
        ct_count?: unknown;
        asset_count?: unknown;
        progress_message?: string | null;
        entries_message?: string | null;
      }[]) {
        const id = String(row.id);
        const ct =
          parseSupabaseCount(row.ct_count) ??
          parseContentTypesCountFromProgressMessage(row.progress_message);
        const ent = parseEntriesCountFromEntriesMessage(row.entries_message);
        const ast = parseSupabaseCount(row.asset_count);

        if (ct != null || ent != null || ast != null) {
          next[id] = {
            ...(ct != null ? { contentTypes: ct } : {}),
            ...(ent != null ? { entries: ent } : {}),
            ...(ast != null ? { assets: ast } : {}),
          };
        }
      }

      setSupabaseJobCounts((prev) => {
        const merged = { ...prev };
        for (const id of ids) {
          if (next[id]) merged[id] = { ...merged[id], ...next[id] };
        }
        return merged;
      });
    })();

    return () => { cancelled = true; };
  }, [jobs]);

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      const token = auth.appToken;
      if (!token) return;

      if (append) setLoadingMore(true);
      else setLoading(true);

      setError(null);

      const loaderKey = append ? 'dashboard-load-more' : 'dashboard-initial';
      const { jobs: page, ok, error: err } = await globalLoader.wrap(
        loaderKey,
        lambdaListScrapes(token, { limit: PAGE_SIZE, offset: nextOffset }),
      );

      if (!ok) {
        setError(err || 'Failed to load jobs');
        if (!append) setJobs([]);
      } else {
        setHasMore(page.length >= PAGE_SIZE);
        setJobs((prev) => (append ? [...prev, ...page] : page));
        setOffset(nextOffset);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [auth.appToken],
  );

  useEffect(() => {
    if (auth.appToken) void loadPage(0, false);
  }, [auth.appToken, loadPage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.projectName.toLowerCase().includes(q) ||
        j.title.toLowerCase().includes(q) ||
        j.url.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  function handleCreateJob() {
    resetMigrationStore();
    clearScrapeJobId();
    clearDashboardJobContext();
    navigate('/createJob');
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] flex flex-col">
      <header className="sticky top-0 z-20 bg-white border-b border-migratex-elements-borderColor shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link
            to="/dashboard"
            prefetch="intent"
            className="flex items-center gap-2.5 text-migratex-elements-textPrimary hover:opacity-90 transition-opacity"
          >
            <MigrateLogo />
            <span className="text-lg font-semibold tracking-tight">Migrate X</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ClientOnly fallback={null}>{() => <HeaderProfileMenu />}</ClientOnly>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <h1 className="text-2xl font-semibold text-migratex-elements-textPrimary tracking-tight">Projects</h1>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 sm:justify-end sm:max-w-2xl">
            <input
              type="search"
              placeholder="Search projects"
              value={searchRaw}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:flex-1 sm:max-w-md px-4 py-2.5 rounded-lg border border-migratex-elements-borderColor bg-white text-sm text-migratex-elements-textPrimary placeholder:text-migratex-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-violet-500/35 focus:border-violet-500"
            />
            <button
              type="button"
              onClick={handleCreateJob}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 shadow-sm transition-colors"
            >
              <span className="i-ph:plus-bold text-base" />
              Create Project
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        {loading ? (
          <Skeleton.JobGrid count={8} variant="shimmer" />
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-migratex-elements-borderColor bg-white/80 py-16 text-center">
            <p className="text-migratex-elements-textSecondary mb-4">
              No jobs match your search, or the list is empty.
            </p>
            <button
              type="button"
              onClick={handleCreateJob}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
            >
              <span className="i-ph:plus-bold" />
              Create Job
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((job) => (
                <JobCard key={job.id} job={job} supabaseCounts={supabaseJobCounts[job.id]} />
              ))}
            </div>

            {hasMore && !search.trim() ? (
              <div className="flex flex-col items-center gap-4 mt-10">
                {loadingMore && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 w-full">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton.JobCard key={i} variant="shimmer" />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadPage(offset + PAGE_SIZE, true)}
                  className="px-6 py-2.5 rounded-lg border border-migratex-elements-borderColor bg-white text-sm font-medium text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-2 disabled:opacity-50 transition-opacity"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <span className="i-svg-spinners:ring-resize text-base" />
                      Loading…
                    </span>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
