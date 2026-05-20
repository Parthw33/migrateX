import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import styles from './BaseChat.module.scss';
import { migrationStore } from '~/lib/stores/migration';

import type { ScrapingLog, BaseChatProps, UrlSubmitPayload } from './types';

import { getLogTypeFromMessage, mapSSELogType } from './utils';

import {
  UrlInputChat,
  StackUidInputChat,
  MigrationProgressChat,
  CreateWebsiteStep,
  StackSetupStep,
  ScrapeJobStatusModal,
  ScrapingPipelineView,
  ImportStackStep,
} from './components';
import { fetchScrapeJobDetail, lambdaImportStack, lambdaScrape, lambdaWebsiteStart } from '~/lib/lambdaApi';
import { buildContentstackStackDashboardUrl } from '~/lib/contentstackStackUrl';
import { authStore } from '~/lib/stores/auth';
import { getSupabaseClient } from '~/lib/supabaseClient';
import {
  AUTO_IMPORT_OK_SESSION_KEY,
  getScrapeJobId,
  tryPersistScrapeJobIdFromPayload,
  setScrapeJobId,
  subscribeScrapeJobId,
} from '~/lib/scrapeJobSession';
import { clearDashboardJobContext, getDashboardJobContext } from '~/lib/dashboardJobContext';
import { fetchWebsiteCredentialsFromSupabaseJob } from '~/lib/jobsRowWebsiteCredentials';
import { setWebsiteGenerationSession } from '~/lib/websiteGenerationSession';
import { workbenchStore } from '~/lib/stores/workbench';
import { isGenerateWebsitePath } from '~/lib/stores/theme';

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      onUrlSubmit,
      scrapingLogs: externalScrapingLogs,
      isScrapingComplete: externalIsScrapingComplete,
      onScrapingComplete,
    },
    ref,
  ) => {
    const navigate = useNavigate();
    const location = useLocation();

    const migration = useStore(migrationStore);

    const [internalScrapingLogs, setInternalScrapingLogs] = useState<ScrapingLog[]>([]);
    const [hasScrapingError, setHasScrapingError] = useState(false);
    const [jobStatusOpen, setJobStatusOpen] = useState(false);
    const [jobStatusLoading, setJobStatusLoading] = useState(false);
    const [jobStatusError, setJobStatusError] = useState<string | null>(null);
    const [jobStatusPayload, setJobStatusPayload] = useState<unknown>(null);
    const isTransitioningToWorkbenchRef = useRef(false);
    const hasRunInitRef = useRef(false);

    const [activeJobId, setActiveJobId] = useState<string | null>(() =>
      typeof globalThis.window !== 'undefined' ? getScrapeJobId() : null,
    );

    const [importLoading, setImportLoading] = useState(false);
    const [importSucceeded, setImportSucceeded] = useState(false);

    useEffect(() => subscribeScrapeJobId(() => setActiveJobId(getScrapeJobId())), []);

    useEffect(() => {
      if (migration.currentStep !== 'IMPORT_STACK') {
        setImportSucceeded(false);

        return;
      }

      const jid = getScrapeJobId()?.trim();
      const fromSession =
        Boolean(jid) &&
        typeof globalThis.sessionStorage !== 'undefined' &&
        globalThis.sessionStorage.getItem(AUTO_IMPORT_OK_SESSION_KEY) === jid;

      setImportSucceeded(fromSession);
    }, [migration.currentStep, activeJobId]);

    useEffect(() => {
      const id = getScrapeJobId()?.trim();

      if (!id) {
        return;
      }

      const path = location.pathname;
      const onJob = path.startsWith('/job/') || path === '/job';
      const onCreateJob = path === '/createJob' || path === '/createjob' || path.startsWith('/createJob/') || path.startsWith('/createjob/');

      if (!onJob && !onCreateJob) {
        return;
      }

      const expected = `/job/${encodeURIComponent(id)}`;

      if (path !== expected) {
        navigate(expected, { replace: true });
      }
    }, [activeJobId, location.pathname, navigate]);

    const scrapingLogs = externalScrapingLogs ?? internalScrapingLogs;
    const isScrapingComplete =
      externalIsScrapingComplete !== undefined ? externalIsScrapingComplete : migration.isScrapingComplete;

    useEffect(() => {
      if (hasRunInitRef.current) {
        return;
      }

      hasRunInitRef.current = true;

      if (migration.currentStep === 'CREATE_CONTENT_TYPES') {
        migrationStore.setKey('currentStep', 'SCRAPING');
      }
    }, []);

    useEffect(() => {
      if (migration.currentStep !== 'WORKBENCH') {
        return;
      }

      if (isGenerateWebsitePath(location.pathname)) {
        return;
      }

      const jobId = getScrapeJobId()?.trim();
      navigate(jobId ? `/${jobId}/generate-website` : '/generate-website', { replace: true });
    }, [migration.currentStep, location.pathname, navigate]);

    const addLog = (message: string, type: ScrapingLog['type']) => {
      setInternalScrapingLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-${Math.random()}`,
          message,
          type,
          timestamp: new Date(),
        },
      ]);
    };

    const startScraping = async (url: string, pageLimit?: number) => {
      setHasScrapingError(false);

      const maxPages = pageLimit ?? migrationStore.get().crawlMaxPages ?? 20;
      const { stackUid, csOrganizationUid } = migrationStore.get();
      const token = authStore.get().appToken;
      const csRegion = authStore.get().region || 'NA';

      let crawlUrl = url.trim();

      if (!crawlUrl) {
        addLog('No URL to crawl', 'error');
        setHasScrapingError(true);

        return;
      }

      if (!/^https?:\/\//i.test(crawlUrl)) {
        crawlUrl = `https://${crawlUrl}`;
      }

      if (!token) {
        addLog('You need to sign in before scraping.', 'error');
        setHasScrapingError(true);

        return;
      }

      if (!stackUid.trim()) {
        addLog('Stack API key is missing. Finish stack setup first.', 'error');
        setHasScrapingError(true);

        return;
      }

      try {
        const { selectUrls } = migrationStore.get();
        const response = await lambdaScrape(token, {
          url: crawlUrl,
          cs_stack_api_key: stackUid.trim(),
          cs_org_id: csOrganizationUid.trim(),
          cs_region: csRegion,
          maxPages,
          maxDepth: 4,
          ...(selectUrls?.length ? { selectUrls } : {}),
        });

        if (!response.ok) {
          throw new Error(`Crawler returned status ${response.status}`);
        }

        for (const name of ['x-job-id', 'X-Job-Id', 'x-scrape-job-id', 'X-Scrape-Job-Id']) {
          const v = response.headers.get(name);

          if (v?.trim()) {
            setScrapeJobId(v.trim());
            break;
          }
        }

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let currentEventType = '';

          addLog('Connected to crawler, receiving logs...', 'success');

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();

              if (!trimmedLine) {
                currentEventType = '';

                continue;
              }

              if (trimmedLine.startsWith('event:')) {
                currentEventType = trimmedLine.slice(6).trim();

                continue;
              }

              if (trimmedLine.startsWith('data:')) {
                const dataStr = trimmedLine.slice(5).trim();

                try {
                  const data = JSON.parse(dataStr) as Record<string, unknown>;
                  tryPersistScrapeJobIdFromPayload(data);

                  /* progress % comes only from Supabase `jobs.progress`; ignore SSE progress and GET /scrape/{id} */
                  if (currentEventType === 'progress') {
                    continue;
                  }

                  if (currentEventType === 'log' || !currentEventType) {
                    const msg = (data.msg || data.message || '') as string;
                    const logType = mapSSELogType((data.type as string) || 'INFO');

                    if (msg) {
                      addLog(msg, logType);
                    }
                  }
                } catch {
                  if (dataStr) {
                    addLog(dataStr, getLogTypeFromMessage(dataStr));
                  }
                }
              } else {
                // raw line (NDJSON or non-SSE JSON) — extract job id, then log
                try {
                  const raw = JSON.parse(trimmedLine) as Record<string, unknown>;
                  tryPersistScrapeJobIdFromPayload(raw);

                  const msg = (raw.msg || raw.message || '') as string;

                  if (msg) {
                    addLog(msg, mapSSELogType((raw.type as string) || 'INFO'));
                  } else {
                    addLog(trimmedLine, getLogTypeFromMessage(trimmedLine));
                  }
                } catch {
                  addLog(trimmedLine, getLogTypeFromMessage(trimmedLine));
                }
              }
            }
          }

          if (buffer.trim()) {
            // buffer remainder — extract job id before logging
            try {
              const raw = JSON.parse(buffer.trim()) as Record<string, unknown>;
              tryPersistScrapeJobIdFromPayload(raw);
            } catch {
              /* not JSON — no job ID to extract */
            }

            addLog(buffer.trim(), getLogTypeFromMessage(buffer.trim()));
          }

          addLog(
            'Crawler stream ended. Job progress is shown from Supabase `jobs` only (not GET /scrape/{id}).',
            'info',
          );
        } else {
          const data = (await response.json().catch(() => ({}))) as {
            logs?: Array<string | { message?: string }>;
            job_id?: string;
            jobId?: string;
          };
          tryPersistScrapeJobIdFromPayload(data);

          addLog('Received crawler response', 'info');

          if (data.logs && Array.isArray(data.logs)) {
            for (const log of data.logs) {
              const msg = typeof log === 'string' ? log : (log as { message?: string }).message || JSON.stringify(log);
              addLog(msg, getLogTypeFromMessage(msg));
            }
          }

          addLog('Response received. Track progress in Supabase `jobs` (not Lambda GET /scrape/{id}).', 'info');
        }
      } catch (error) {
        console.error('Crawl error:', error);
        addLog(`Error: ${error instanceof Error ? error.message : 'Failed to connect to scraper'}`, 'error');
        setHasScrapingError(true);
      }
    };

    const handleStackSetupContinue = (payload: {
      stackApiKey: string;
      organizationUid: string;
      contentstackStackUid?: string;
    }) => {
      migrationStore.setKey('stackUid', payload.stackApiKey);
      migrationStore.setKey('csOrganizationUid', payload.organizationUid);
      migrationStore.setKey('contentstackStackUid', payload.contentstackStackUid?.trim() || '');
      migrationStore.setKey('stackSelectedBeforeScrape', true);
      migrationStore.setKey('currentStep', 'SCRAPING');
      migrationStore.setKey('isScrapingComplete', false);
      setInternalScrapingLogs([]);
      void startScraping(migrationStore.get().websiteUrl, migrationStore.get().crawlMaxPages);
    };

    const handleRetryScraping = () => {
      setInternalScrapingLogs([]);
      migrationStore.setKey('isScrapingComplete', false);
      setHasScrapingError(false);
      startScraping(migration.websiteUrl, migration.crawlMaxPages);
    };

    const handleUrlSubmit = (payload: UrlSubmitPayload) => {
      const { url, maxPages, selectUrls } = payload;

      migrationStore.setKey('websiteUrl', url);
      migrationStore.setKey('crawlMaxPages', maxPages > 0 ? maxPages : migrationStore.get().crawlMaxPages);
      migrationStore.setKey('selectUrls', selectUrls);

      migrationStore.setKey('currentStep', 'STACK_SETUP');
      setInternalScrapingLogs([]);

      if (onUrlSubmit) {
        onUrlSubmit(url, { maxPages, selectUrls });
      }
    };

    const handleSupabaseScrapeComplete = useCallback(() => {
      migrationStore.setKey('isScrapingComplete', true);
      migrationStore.setKey('currentStep', 'IMPORT_STACK');
      onScrapingComplete?.();
    }, [onScrapingComplete]);

    const handleStartImport = useCallback(async () => {
      const token = authStore.get().appToken;
      const jid = getScrapeJobId();

      if (!token || !jid) {
        toast.error('Missing sign-in or job id.');

        return;
      }

      setImportLoading(true);

      try {
        const res = await lambdaImportStack(token, jid, {});
        const data = (await res.json().catch(() => ({}))) as { error_message?: string; message?: string };

        if (!res.ok) {
          toast.error(data.error_message || data.message || `Import failed (${res.status})`);

          if (typeof globalThis.sessionStorage !== 'undefined') {
            globalThis.sessionStorage.removeItem(AUTO_IMPORT_OK_SESSION_KEY);
          }

          setImportSucceeded(false);
        } else {
          toast.success(data.message || 'Stack import request sent.');

          if (typeof globalThis.sessionStorage !== 'undefined') {
            globalThis.sessionStorage.setItem(AUTO_IMPORT_OK_SESSION_KEY, jid);
          }

          setImportSucceeded(true);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Import request failed');

        if (typeof globalThis.sessionStorage !== 'undefined') {
          globalThis.sessionStorage.removeItem(AUTO_IMPORT_OK_SESSION_KEY);
        }

        setImportSucceeded(false);
      } finally {
        setImportLoading(false);
      }
    }, []);

    const handleStackUidSubmit = (uid: string, contentstackStackUid?: string) => {
      migrationStore.setKey('stackUid', uid);
      migrationStore.setKey('contentstackStackUid', contentstackStackUid?.trim() || '');
      migrationStore.setKey('stackSelectedBeforeScrape', false);
      migrationStore.setKey('currentStep', 'MIGRATING');
    };

    const handleMigrationComplete = () => {
      migrationStore.setKey('currentStep', 'CREATE_WEBSITE');
    };

    const handleMigrationPrevious = () => {
      const st = migrationStore.get();

      if (st.stackSelectedBeforeScrape) {
        migrationStore.setKey('currentStep', 'IMPORT_STACK');
      } else {
        migrationStore.setKey('currentStep', 'STACK_UID_INPUT');
      }
    };

    const handleCreateWebsite = useCallback(async () => {
      isTransitioningToWorkbenchRef.current = true;
      migrationStore.setKey('isTransitioningToWorkbench', true);

      const token = authStore.get().appToken;
      const migration = migrationStore.get();

      const scrapeId = getScrapeJobId()?.trim() ?? '';
      const dash = getDashboardJobContext();
      const dashCredsActive = Boolean(dash?.scrapeJobId && (!scrapeId || dash.scrapeJobId === scrapeId));

      let websiteUrl = dashCredsActive ? dash!.websiteUrl : migration.websiteUrl;
      let stackUid = dashCredsActive ? dash!.cs_stack_api_key : migration.stackUid;
      let csOrganizationUid = dashCredsActive ? dash!.cs_org_id : migration.csOrganizationUid;
      let csRegion = dashCredsActive
        ? dash!.cs_region || authStore.get().region || 'NA'
        : authStore.get().region || 'NA';
      let s3WebsitePrefix = dashCredsActive ? dash!.s3WebsitePrefix : '';

      const finishTransition = () => {
        setTimeout(() => {
          isTransitioningToWorkbenchRef.current = false;
          migrationStore.setKey('isTransitioningToWorkbench', false);
        }, 500);
      };

      if (!token) {
        toast.error('Sign in to generate a website.');
        finishTransition();

        return;
      }

      const existingJobId = scrapeId || (dashCredsActive ? dash!.scrapeJobId : '');

      if (!existingJobId) {
        toast.error('No migration job id. Run a crawl first, or open this job from the dashboard.');
        finishTransition();

        return;
      }

      // Enrich session metadata from Supabase when helpful (not sent to POST /website/start).
      const needsSupabaseCreds = !stackUid.trim() || !websiteUrl.trim() || !csOrganizationUid.trim();

      if (needsSupabaseCreds && existingJobId) {
        const rowCreds = await fetchWebsiteCredentialsFromSupabaseJob(existingJobId);

        if (rowCreds.ok) {
          const c = rowCreds.creds;

          if (!stackUid.trim() && c.stackApiKey) {
            stackUid = c.stackApiKey;
          }

          if (!csOrganizationUid.trim() && c.orgId) {
            csOrganizationUid = c.orgId;
          }

          if (!websiteUrl.trim() && c.url) {
            websiteUrl = c.url;
          }

          if (c.region.trim()) {
            csRegion = c.region;
          }

          if (!s3WebsitePrefix.trim() && c.s3WebsitePrefix) {
            s3WebsitePrefix = c.s3WebsitePrefix;
          }
        }
      }

      let url = websiteUrl.trim();

      if (url && !/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }

      try {
        // POST /website/start { jobId } — workbench polls GET /jobs/{jobId}/website/live.
        toast.info('Starting website generation…');

        const { jobId } = await lambdaWebsiteStart(token, {
          jobId: existingJobId,
        });

        setWebsiteGenerationSession({
          jobId,
          url: url || websiteUrl,
          cs_stack_api_key: stackUid.trim(),
          cs_org_id: csOrganizationUid.trim(),
          cs_region: csRegion,
          s3WebsitePrefix: s3WebsitePrefix ?? '',
          startedAt: new Date().toISOString(),
        });

        workbenchStore.resetFilesForNewWebsiteSession();

        clearDashboardJobContext();
        migrationStore.setKey('currentStep', 'WORKBENCH');
        navigate(`/${jobId}/generate-website`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to start website generation');
      } finally {
        finishTransition();
      }
    }, [navigate]);

    const resolveStackApiKeyForContentstack = useCallback(async (): Promise<string> => {
      const st = migrationStore.get();
      const dash = getDashboardJobContext();
      const scrapeId = getScrapeJobId()?.trim() ?? '';
      const dashActive = Boolean(dash?.scrapeJobId && (!scrapeId || dash.scrapeJobId === scrapeId));

      let stackKey = (dashActive ? dash!.cs_stack_api_key : st.stackUid).trim();

      if (!stackKey) {
        stackKey = st.contentstackStackUid.trim();
      }

      const onJobRoute = location.pathname.startsWith('/job/');
      const jobId =
        scrapeId ||
        (onJobRoute
          ? location.pathname
              .replace(/^\/job\//, '')
              .split('/')[0]
              ?.trim()
          : '');

      if (!stackKey && jobId) {
        const token = authStore.get().appToken;

        if (token) {
          const result = await fetchScrapeJobDetail(token, jobId);

          if (result.ok && result.data.cs_stack_api_key?.trim()) {
            stackKey = result.data.cs_stack_api_key.trim();
            migrationStore.setKey('stackUid', stackKey);
          }
        }

        if (!stackKey) {
          const rowCreds = await fetchWebsiteCredentialsFromSupabaseJob(jobId);

          if (rowCreds.ok && rowCreds.creds.stackApiKey.trim()) {
            stackKey = rowCreds.creds.stackApiKey.trim();
            migrationStore.setKey('stackUid', stackKey);
          }
        }
      }

      return stackKey;
    }, [location.pathname]);

    const handleOpenContentstackStack = useCallback(async () => {
      const stackKey = await resolveStackApiKeyForContentstack();
      const url = buildContentstackStackDashboardUrl(stackKey);

      if (!url) {
        toast.error('No stack linked to this job yet. Select or configure a stack first.');
        return;
      }

      window.open(url, '_blank', 'noopener,noreferrer');
    }, [resolveStackApiKeyForContentstack]);

    const handleCheckJobStatus = async () => {
      const jobId = getScrapeJobId();

      if (!jobId) {
        toast.info('No scrape job ID yet. Run a crawl first; the job id is saved when the API returns it.');

        return;
      }

      const sb = getSupabaseClient();

      if (!sb) {
        toast.error(
          'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to read `public.jobs` (we do not use GET /scrape/{id} for status).',
        );

        return;
      }

      setJobStatusOpen(true);
      setJobStatusLoading(true);
      setJobStatusError(null);
      setJobStatusPayload(null);

      try {
        const { data, error } = await sb.from('jobs').select('*').eq('id', jobId).maybeSingle();

        if (error) {
          setJobStatusError(error.message);

          return;
        }

        setJobStatusPayload(data ?? null);
      } catch (e) {
        setJobStatusError(e instanceof Error ? e.message : 'Failed to load job row');
      } finally {
        setJobStatusLoading(false);
      }
    };

    const renderHeader = (showReset: boolean = false) => (
      <div className="flex items-center justify-end gap-2 flex-wrap px-5 py-3">
        {showReset && (
          <>
            <button
              type="button"
              onClick={() => void handleCheckJobStatus()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm transition-all duration-200 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 hover:shadow-md active:scale-[0.97]"
            >
              <div className="i-ph:clipboard-text text-base" />
              Job Status
            </button>
            <button
              type="button"
              onClick={() => void handleOpenContentstackStack()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm transition-all duration-200 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 hover:shadow-md active:scale-[0.97]"
            >
              <div className="i-ph:stack text-base" aria-hidden />
              Open Stack
            </button>
          </>
        )}
      </div>
    );

    const renderStepContent = () => {
      switch (migration.currentStep) {
        case 'URL_INPUT': {
          return <UrlInputChat onSubmit={handleUrlSubmit} />;
        }

        case 'STACK_SETUP': {
          return (
            <StackSetupStep
              websiteUrl={migration.websiteUrl}
              onBack={() => migrationStore.setKey('currentStep', 'URL_INPUT')}
              onContinue={handleStackSetupContinue}
            />
          );
        }

        case 'SCRAPING': {
          return (
            <ScrapingPipelineView
              websiteUrl={migration.websiteUrl}
              jobId={activeJobId}
              scrapingLogs={scrapingLogs}
              isScrapingComplete={isScrapingComplete}
              hasScrapeError={hasScrapingError}
              onRetry={handleRetryScraping}
              onSupabaseScrapeComplete={handleSupabaseScrapeComplete}
            />
          );
        }

        case 'IMPORT_STACK': {
          return (
            <ImportStackStep
              websiteUrl={migration.websiteUrl}
              onCreateWebsite={handleCreateWebsite}
              onStartImport={handleStartImport}
              importLoading={importLoading}
              importSucceeded={importSucceeded}
            />
          );
        }

        case 'MIGRATING': {
          return (
            <MigrationProgressChat
              stackUid={migration.stackUid}
              websiteUrl={migration.websiteUrl}
              onComplete={handleMigrationComplete}
              onPrevious={handleMigrationPrevious}
            />
          );
        }
        case 'STACK_UID_INPUT': {
          return <StackUidInputChat onSubmit={handleStackUidSubmit} websiteUrl={migration.websiteUrl} />;
        }

        case 'CREATE_WEBSITE': {
          return <CreateWebsiteStep websiteUrl={migration.websiteUrl} onCreateWebsite={handleCreateWebsite} />;
        }

        default: {
          return null;
        }
      }
    };

    return (
      <div
        ref={ref}
        className={classNames(
          styles.BaseChat,
          'relative flex h-full w-full overflow-hidden bg-migratex-elements-background-depth-1',
        )}
      >
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {renderHeader(migration.currentStep !== 'URL_INPUT')}
          <div className="flex-1 overflow-hidden">{renderStepContent()}</div>
        </div>
        <ScrapeJobStatusModal
          open={jobStatusOpen}
          onClose={() => {
            setJobStatusOpen(false);
            setJobStatusError(null);
          }}
          jobId={getScrapeJobId()}
          loading={jobStatusLoading}
          error={jobStatusError}
          payload={jobStatusPayload}
        />
      </div>
    );
  },
);
