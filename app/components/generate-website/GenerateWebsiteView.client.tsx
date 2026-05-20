import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { useNavigate } from '@remix-run/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ClientOnly } from 'remix-utils/client-only';
import { toast } from 'react-toastify';

import { migrationStore } from '~/lib/stores/migration';
import { authStore } from '~/lib/stores/auth';
import { workbenchStore } from '~/lib/stores/workbench';
import { websiteChatStore, websiteChat } from '~/lib/stores/websiteChat';
import {
  getWebsiteGenerationSession,
  setWebsiteGenerationSession,
  requestWebsiteLiveFilesSync,
} from '~/lib/websiteGenerationSession';
import { getScrapeJobId, setScrapeJobId } from '~/lib/scrapeJobSession';
import { useWebsiteLiveGenerationPoll } from '~/lib/hooks/useWebsiteLiveGenerationPoll';
import { useWebsiteJobPoller } from '~/lib/hooks/useWebsiteJobPoller';
import { useGenerationChatBridge } from '~/lib/hooks/useGenerationChatBridge';
import { buildContentstackStackDashboardUrl } from '~/lib/contentstackStackUrl';
import { fetchScrapeJobDetail } from '~/lib/lambdaApi';
import { fetchWebsiteCredentialsFromSupabaseJob } from '~/lib/jobsRowWebsiteCredentials';
import { getDashboardJobContext } from '~/lib/dashboardJobContext';

import { WorkbenchHeader } from '~/components/workbench/WorkbenchHeader';
import { ChatPanel } from '~/components/generate-website/ChatPanel';
import { WebsitePreviewPanel } from '~/components/generate-website/WebsitePreviewPanel';
import { WorkbenchIDEView } from '~/components/workbench/WorkbenchIDEView.client';
import { classNames } from '~/utils/classNames';

/* ── Drag handle ─────────────────────────────────────────────────────────── */

function ResizeHandle({ vertical = false }: { vertical?: boolean }) {
  return (
    <PanelResizeHandle
      className={classNames(
        'relative flex-shrink-0 group transition-colors duration-150',
        vertical
          ? 'h-1.5 w-full cursor-row-resize hover:bg-violet-500/30'
          : 'w-1.5 h-full cursor-col-resize hover:bg-violet-500/30',
        'bg-migratex-elements-borderColor',
      )}
    >
      {/* Grab grip dots */}
      <div
        className={classNames(
          'absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
        )}
      >
        {vertical ? (
          <div className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-4 h-0.5 rounded-full bg-violet-500" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 w-0.5 rounded-full bg-violet-500" />
            ))}
          </div>
        )}
      </div>
    </PanelResizeHandle>
  );
}

/* ── Inner component (browser only) ─────────────────────────────────────── */

function GenerateWebsiteInner({ jobId: routeJobId }: { jobId?: string }) {
  const navigate = useNavigate();
  const appToken = useStore(authStore).appToken;
  const chatState = useStore(websiteChatStore);
  const showTerminal = useStore(workbenchStore.showTerminal);

  const initRef = useRef(false);
  const autoSyncRef = useRef(false);
  const [breadcrumb, setBreadcrumb] = useState('');

  // Panel visibility state
  const [showChat, setShowChat] = useState(true);
  const [showIDE, setShowIDE] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  // ── Hooks ──────────────────────────────────────────────────────────────
  const { status: generationStatus, isSyncing } = useWebsiteLiveGenerationPoll(appToken);
  const scrapeJobId = getScrapeJobId();
  // Route param takes precedence over session storage for the Supabase poller
  const effectiveJobId = routeJobId ?? scrapeJobId;
  useWebsiteJobPoller(effectiveJobId);
  useGenerationChatBridge(generationStatus);

  // Auto-sync files only once the live poll has decided the job is in a
  // terminal state — 'done' (already deployed / completed) or 'paused'
  // (Contentstack Launch deploying). For mid-stream generations the live
  // poll drives the file delivery; firing a parallel full-sync there would
  // race with the poll and produce file-activity chat bubbles AFTER the
  // "✅ All files loaded" success message.
  useEffect(() => {
    if (autoSyncRef.current || !appToken || !effectiveJobId) return;

    const ready =
      generationStatus.phase === 'paused' || generationStatus.phase === 'done';

    if (!ready) return;

    autoSyncRef.current = true;
    const t = setTimeout(() => {
      requestWebsiteLiveFilesSync();
      toast.info('Syncing latest files…', { autoClose: 2500 });
    }, 400);
    return () => clearTimeout(t);
  }, [appToken, effectiveJobId, generationStatus.phase]);

  // Open preview panel automatically when website_url appears
  useEffect(() => {
    if (chatState.websiteUrl && !showPreview) {
      setShowPreview(true);
    }
  }, [chatState.websiteUrl]);

  // One-time init — bootstrap session from route param if provided
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    migrationStore.setKey('currentStep', 'WORKBENCH');
    websiteChat.reset();

    // If a jobId came in via the URL, seed both session stores so that all
    // polling hooks (which read from sessionStorage) pick it up immediately.
    if (routeJobId) {
      setScrapeJobId(routeJobId);
      const existing = getWebsiteGenerationSession();
      if (!existing || existing.jobId !== routeJobId) {
        setWebsiteGenerationSession({
          jobId: routeJobId,
          url: '',
          cs_stack_api_key: '',
          cs_org_id: '',
          cs_region: '',
          s3WebsitePrefix: '',
          startedAt: new Date().toISOString(),
        });
      }
    }

    const session = getWebsiteGenerationSession();
    const jobId = routeJobId ?? session?.jobId ?? scrapeJobId ?? null;

    if (jobId) {
      websiteChat.setJobId(jobId);
      websiteChat.setPhase('connecting', 'Connecting to generation pipeline…', 0);
      websiteChat.addAI(
        '🚀 Website generation is live! Watch the code editor on the right populate as files arrive. ' +
          "I'll keep you updated on every step.",
      );
    } else {
      websiteChat.addSystem('No active generation session — open a job from the Dashboard.');
    }
  }, [routeJobId]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleToggleChat = useCallback(() => setShowChat((v) => !v), []);
  const handleToggleIDE = useCallback(() => setShowIDE((v) => !v), []);
  const handleTogglePreview = useCallback(() => setShowPreview((v) => !v), []);

  const handleToggleTerminal = useCallback(() => {
    workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
  }, []);

  const handleSyncFiles = useCallback(() => {
    if (!appToken) {
      toast.error('Sign in to sync files.');
      return;
    }
    requestWebsiteLiveFilesSync();
  }, [appToken]);

  const handleOpenStack = useCallback(async () => {
    // Pull the stack api key from whichever source is freshest on this route:
    // the active website-generation session is the most direct, but fall back
    // through the dashboard context, the migration store, and finally the
    // backend job row so the button works regardless of how the user got here.
    const session = getWebsiteGenerationSession();
    const dash = getDashboardJobContext();
    const migration = migrationStore.get();

    let stackKey =
      session?.cs_stack_api_key?.trim() ||
      dash?.cs_stack_api_key?.trim() ||
      migration.stackUid?.trim() ||
      migration.contentstackStackUid?.trim() ||
      '';

    const jobId = (routeJobId ?? getScrapeJobId() ?? '').trim();

    if (!stackKey && jobId && appToken) {
      try {
        const result = await fetchScrapeJobDetail(appToken, jobId);
        if (result.ok && result.data.cs_stack_api_key?.trim()) {
          stackKey = result.data.cs_stack_api_key.trim();
        }
      } catch (err) {
        console.warn('Open Stack: fetchScrapeJobDetail failed', err);
      }
    }

    if (!stackKey && jobId) {
      try {
        const rowCreds = await fetchWebsiteCredentialsFromSupabaseJob(jobId);
        if (rowCreds.ok && rowCreds.creds.stackApiKey.trim()) {
          stackKey = rowCreds.creds.stackApiKey.trim();
        }
      } catch (err) {
        console.warn('Open Stack: fetchWebsiteCredentialsFromSupabaseJob failed', err);
      }
    }

    const url = buildContentstackStackDashboardUrl(stackKey);
    if (!url) {
      toast.error('No stack linked to this job yet. Select or configure a stack first.');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }, [appToken, routeJobId]);

  const handleBuild = useCallback(() => toast.info('Build triggered'), []);

  const handleBack = useCallback(() => {
    migrationStore.setKey('currentStep', 'IMPORT_STACK');
    workbenchStore.showWorkbench.set(false);
    const jid = getScrapeJobId()?.trim();
    navigate(jid ? `/job/${encodeURIComponent(jid)}` : '/createJob');
  }, [navigate]);

  // Guard: at least one right panel must be visible
  const effectiveShowIDE = showIDE || (!showIDE && !showPreview);
  const effectiveShowPreview = showPreview;

  const { websiteUrl, websiteStatus, websiteMessage, launchProjectUid, launchEnvUid, phase } = chatState;

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-migratex-elements-background-depth-1">
      {/* ── Single unified header ─────────────────────────────────────── */}
      <WorkbenchHeader
        breadcrumb={breadcrumb}
        generationStatus={generationStatus}
        chatPhase={phase}
        showChat={showChat}
        showIDE={effectiveShowIDE}
        showPreview={effectiveShowPreview}
        onToggleChat={handleToggleChat}
        onToggleIDE={handleToggleIDE}
        onTogglePreview={handleTogglePreview}
        showTerminal={showTerminal}
        onToggleTerminal={handleToggleTerminal}
        onSyncFiles={handleSyncFiles}
        syncDisabled={!appToken || isSyncing}
        onOpenStack={() => void handleOpenStack()}
        onBuild={handleBuild}
        onBack={handleBack}
        hasPreviewUrl={Boolean(websiteUrl)}
      />

      {/* ── Three-panel resizable body ────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="migratex-workbench">
          {/* ── Chat panel ─────────────────────────────────────────── */}
          {showChat && (
            <>
              <Panel
                id="chat"
                order={1}
                defaultSize={22}
                minSize={15}
                maxSize={40}
                collapsible
                onCollapse={() => setShowChat(false)}
                className="min-w-0"
              >
                <div className="flex flex-col h-full border-r border-migratex-elements-borderColor">
                  <ChatPanel generationStatus={generationStatus} />
                </div>
              </Panel>
              <ResizeHandle />
            </>
          )}

          {/* ── IDE panel ──────────────────────────────────────────── */}
          {effectiveShowIDE && (
            <>
              <Panel
                id="ide"
                order={2}
                defaultSize={showPreview ? 44 : 78}
                minSize={20}
                collapsible
                onCollapse={() => setShowIDE(false)}
                className="min-w-0"
              >
                <WorkbenchIDEView generationStatus={generationStatus} onBreadcrumbChange={setBreadcrumb} />
              </Panel>
              {effectiveShowPreview && <ResizeHandle />}
            </>
          )}

          {/* ── Preview panel ───────────────────────────────────────── */}
          {effectiveShowPreview && (
            <Panel
              id="preview"
              order={3}
              defaultSize={34}
              minSize={20}
              maxSize={65}
              collapsible
              onCollapse={() => setShowPreview(false)}
              className="min-w-0"
            >
              <WebsitePreviewPanel
                websiteUrl={websiteUrl}
                websiteStatus={websiteStatus}
                websiteMessage={websiteMessage}
                launchProjectUid={launchProjectUid}
                launchEnvUid={launchEnvUid}
                phase={phase}
                className="h-full border-l border-migratex-elements-borderColor"
              />
            </Panel>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}

/* ── Public export ───────────────────────────────────────────────────────── */

export function GenerateWebsiteView({ jobId }: { jobId?: string } = {}) {
  return (
    <ClientOnly
      fallback={<div className="h-[100dvh] w-full bg-migratex-elements-background-depth-1 animate-pulse" aria-hidden />}
    >
      {() => <GenerateWebsiteInner jobId={jobId} />}
    </ClientOnly>
  );
}
