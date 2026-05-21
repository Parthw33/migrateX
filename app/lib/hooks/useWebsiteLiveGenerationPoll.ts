import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { lambdaFetchWebsiteLive, lambdaFetchAllS3Files } from '~/lib/lambdaApi';
import type { ManifestFile } from '~/lib/lambdaApi';
import {
  getWebsiteGenerationSession,
  websiteGenerationSessionRevision,
  websiteLiveManualSyncRevision,
} from '~/lib/websiteGenerationSession';
import {
  extractContentBearingRelPaths,
  normalizeWorkbenchPath,
  parseWebsiteLivePayload,
} from '~/lib/websiteLiveFiles';
import { runWebsiteLiveFullSync } from '~/lib/websiteLiveFullSync';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileMap } from '~/lib/stores/files';

const POLL_MS = 2000;
const MAX_POLLS = 450;
// Pull every done-manifest file the server reports each tick, not just three.
// At 3-per-tick a manifest of 20+ files takes 7+ ticks (14s+) to drain — long
// enough that the server can flip to terminal status with most files still
// unfetched, leaving the workbench nearly empty.
const MAX_FILE_QUERY_POLLS_PER_TICK = 50;

export interface WebsiteGenerationStatus {
  isLoading: boolean;
  progress: number;
  message: string;
  phase: 'idle' | 'polling' | 'fetching-s3' | 'done' | 'error' | 'paused' | 'syncing';
  currentFile: string;
}

function isDoneManifestStatus(status: string): boolean {
  const s = status.toLowerCase().trim();

  return ['done', 'complete', 'ready', 'success', 'written'].includes(s);
}

async function parseLiveResponse(res: Response): Promise<{ data: unknown; text: string }> {
  const text = await res.text();
  let data: unknown = {};

  if (text.trim()) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { raw: text };
    }
  }

  return { data, text };
}

export interface UseWebsiteLiveGenerationPollResult {
  status: WebsiteGenerationStatus;
  isSyncing: boolean;
}

/**
 * While the workbench is open, poll GET /jobs/{jobId}/website/live and merge any
 * returned files into the FileTree / editor.
 *
 * Stops automatic polling when `manifest.status === "deploying"`. Use
 * {@link requestWebsiteLiveFilesSync} (Sync button) to pull files manually.
 */
export function useWebsiteLiveGenerationPoll(appToken: string | null): UseWebsiteLiveGenerationPollResult {
  const sessionRev = useStore(websiteGenerationSessionRevision);
  const syncRev = useStore(websiteLiveManualSyncRevision);

  const toastShownRef = useRef(false);
  const s3FetchingRef = useRef(false);
  const liveFilePollIndexRef = useRef(0);
  const pathsWithContentRef = useRef<Set<string>>(new Set());
  const s3FallbackStartedRef = useRef(false);
  const lastManifestPathsRef = useRef<string[]>([]);
  const contentstackLaunchPreSyncDoneRef = useRef(false);
  // Set by the polling effect; the manual sync uses this to stop the interval
  // once a sync proves the workbench is fully populated.
  const pollStopperRef = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState<WebsiteGenerationStatus>({
    isLoading: false,
    progress: 0,
    message: '',
    phase: 'idle',
    currentFile: '',
  });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    toastShownRef.current = false;
    s3FetchingRef.current = false;
    liveFilePollIndexRef.current = 0;
    pathsWithContentRef.current = new Set();
    s3FallbackStartedRef.current = false;
    lastManifestPathsRef.current = [];
    contentstackLaunchPreSyncDoneRef.current = false;
    setStatus({ isLoading: false, progress: 0, message: '', phase: 'idle', currentFile: '' });
  }, [sessionRev]);

  useEffect(() => {
    if (!appToken) {
      return;
    }

    const session = getWebsiteGenerationSession();
    if (!session?.jobId) {
      return;
    }

    const websiteJobId = session.jobId;
    let cancelled = false;
    let polls = 0;
    let intervalId: number | undefined;
    let stopped = false;
    let running = false;

    const stopInterval = () => {
      if (intervalId != null && typeof globalThis.window !== 'undefined') {
        globalThis.window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    pollStopperRef.current = () => {
      stopped = true;
      stopInterval();
    };

    setStatus((prev) => ({ ...prev, isLoading: true, phase: 'polling' }));

    const runS3Fallback = async (pendingS3Files: ManifestFile[]) => {
      if (s3FetchingRef.current || cancelled) {
        return;
      }

      s3FetchingRef.current = true;
      stopped = true;
      stopInterval();

      setStatus((prev) => ({
        ...prev,
        phase: 'fetching-s3',
        progress: 0,
        message: `Loading ${pendingS3Files.length} files from S3 (fallback)…`,
      }));

      toast.info(`Fetching ${pendingS3Files.length} website files from S3…`);

      try {
        const fileContents = await lambdaFetchAllS3Files(
          appToken,
          websiteJobId,
          pendingS3Files,
          (done, total, currentPath) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            setStatus((prev) => ({
              ...prev,
              progress: pct,
              currentFile: currentPath,
              message: `Fetching files (${done}/${total}): ${currentPath}`,
            }));
          },
        );

        if (Object.keys(fileContents).length > 0) {
          const s3FileMap: FileMap = {};
          for (const [relativePath, content] of Object.entries(fileContents)) {
            const workbenchPath = normalizeWorkbenchPath(relativePath);
            if (workbenchPath) {
              s3FileMap[workbenchPath] = { type: 'file', content, isBinary: false };
            }
          }

          await workbenchStore.ingestWebsiteFiles(s3FileMap);
          setStatus({ isLoading: false, progress: 100, message: 'Files loaded!', phase: 'done', currentFile: '' });

          if (!toastShownRef.current) {
            toastShownRef.current = true;
            toast.success(`Website loaded — ${Object.keys(fileContents).length} files ready.`);
          }
        } else {
          setStatus({ isLoading: false, progress: 0, message: 'No files returned from S3.', phase: 'error', currentFile: '' });
          if (!toastShownRef.current) {
            toastShownRef.current = true;
            toast.warn('S3 fallback returned no file content.');
          }
        }
      } catch (fetchErr) {
        console.error('S3 file fetch error', fetchErr);
        setStatus({ isLoading: false, progress: 0, message: 'Failed to fetch files from S3.', phase: 'error', currentFile: '' });
        if (!toastShownRef.current) {
          toastShownRef.current = true;
          toast.error('Failed to load files from S3.');
        }
      }
    };

    const run = async () => {
      if (cancelled || stopped) {
        return;
      }

      // Guard against concurrent invocations. If the previous tick is still in
      // flight (e.g. slow API), skip this tick rather than piling up requests
      // and state updates that can freeze the main thread.
      if (running) {
        return;
      }
      running = true;

      polls += 1;
      if (polls > MAX_POLLS) {
        stopInterval();
        setStatus((prev) => ({ ...prev, isLoading: false, phase: 'idle' }));
        if (!toastShownRef.current) {
          toastShownRef.current = true;
          toast.info('Website status polling stopped after maximum wait. Refresh or check the job in the API.');
        }
        running = false;
        return;
      }

      try {
        const res = await lambdaFetchWebsiteLive(appToken, websiteJobId);
        // Early bail-out: if the manual sync (or unmount) marked the poll
        // stopped while this tick was mid-await, do NOT proceed to ingest
        // anything. Otherwise a late ingest fires file-activity chat
        // messages AFTER the "✅ All files loaded" success message.
        if (cancelled || stopped) {
          return;
        }
        const { data } = await parseLiveResponse(res);
        if (cancelled || stopped) {
          return;
        }

        const parsed = parseWebsiteLivePayload(data);
        const {
          fileMap,
          pendingS3Files,
          terminal,
          status: jobStatus,
          progress,
          message,
          writingFile,
          manifestStatus,
        } = parsed;

        const statusLower = jobStatus.toLowerCase();
        const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(statusLower);

        const msgLower = (message || '').toLowerCase();
        const shouldContentstackLaunchPresync =
          !failed &&
          !contentstackLaunchPreSyncDoneRef.current &&
          (msgLower.includes('deploying to contentstack launch') ||
            (statusLower === 'deploying' && msgLower.includes('contentstack launch')));

        if (shouldContentstackLaunchPresync) {
          contentstackLaunchPreSyncDoneRef.current = true;
          setStatus((prev) => ({
            ...prev,
            progress,
            phase: 'syncing',
            message: 'Syncing files from API…',
            currentFile: '',
          }));

          try {
            const { mergedManifestPaths } = await runWebsiteLiveFullSync(appToken, websiteJobId, {
              seedManifestPaths: [...lastManifestPathsRef.current],
              onPath: (relPath) =>
                setStatus((prev) => ({ ...prev, currentFile: relPath, message: `Sync: ${relPath}` })),
            });
            lastManifestPathsRef.current = mergedManifestPaths;
          } catch (syncErr) {
            console.error('Contentstack Launch pre-sync', syncErr);
            toast.error(syncErr instanceof Error ? syncErr.message : 'Sync failed');
          }
        }

        // Only track paths whose CONTENT actually arrived in this response —
        // manifest listings just describe what exists. Counting manifest-only
        // entries here previously caused premature phase: 'done' (e.g. when
        // re-opening an already-deployed job the first poll lists 28 done
        // files but ships none of their bodies).
        for (const p of extractContentBearingRelPaths(data)) {
          pathsWithContentRef.current.add(p);
        }

        setStatus((prev) => ({
          ...prev,
          progress,
          message: message || prev.message,
          phase: prev.phase === 'syncing' ? 'polling' : prev.phase,
        }));

        if (Object.keys(fileMap).length > 0) {
          if (cancelled || stopped) {
            return;
          }
          await workbenchStore.ingestWebsiteFiles(fileMap);
        }

        const manifestPaths = [...new Set(pendingS3Files.map((f) => f.path.trim()).filter(Boolean))];
        if (manifestPaths.length > 0) {
          lastManifestPathsRef.current = manifestPaths;
        }

        if (manifestStatus?.toLowerCase() === 'deploying' && !failed) {
          stopped = true;
          stopInterval();
          setStatus({
            isLoading: false,
            progress,
            message: message || 'Manifest deploying — auto-poll paused. Use Sync to refresh files.',
            phase: 'paused',
            currentFile: '',
          });
          workbenchStore.setDocuments(workbenchStore.files.get());
          return;
        }

        // Only fetch paths the server has actually finished writing. During a
        // fresh generation, the manifest grows but most entries sit in
        // 'pending' / 'writing' for a while — issuing `?file=X` against those
        // returns empty bodies and just burns 3 HTTP calls per 2s tick. We
        // also skip paths we've already pulled content for, so the picker
        // doesn't loop forever on the same files once the manifest stabilises.
        const fetchablePaths = pendingS3Files
          .filter((f) => isDoneManifestStatus(f.status) && f.path && !pathsWithContentRef.current.has(f.path))
          .map((f) => f.path);

        if (fetchablePaths.length > 0 || (writingFile && writingFile.trim())) {
          const picks: string[] = [];
          if (writingFile && writingFile.trim()) {
            picks.push(writingFile.trim());
          }

          while (picks.length < MAX_FILE_QUERY_POLLS_PER_TICK && fetchablePaths.length > 0) {
            const i = liveFilePollIndexRef.current % fetchablePaths.length;
            liveFilePollIndexRef.current += 1;
            const p = fetchablePaths[i];
            if (p && !picks.includes(p)) {
              picks.push(p);
            }
            // Once we've cycled through every fetchable path once this tick,
            // stop — re-picking the same paths within a single tick wastes
            // requests without changing the outcome.
            if (liveFilePollIndexRef.current % fetchablePaths.length === 0) {
              break;
            }
          }

          for (const relPath of picks) {
            if (cancelled || stopped) {
              break;
            }

            setStatus((prev) => ({ ...prev, currentFile: relPath, message: `Loading ${relPath}…` }));

            const fres = await lambdaFetchWebsiteLive(appToken, websiteJobId, { file: relPath });
            if (cancelled || stopped) {
              break;
            }
            const { data: fdata } = await parseLiveResponse(fres);
            if (cancelled || stopped) {
              break;
            }
            const fparsed = parseWebsiteLivePayload(fdata);

            if (Object.keys(fparsed.fileMap).length > 0) {
              pathsWithContentRef.current.add(relPath);
              await workbenchStore.ingestWebsiteFiles(fparsed.fileMap);
              // Yield so the file tree + chat feed paint between ingests —
              // gives the "files appearing one-by-one" UX during a single
              // tick instead of all 22 landing in one frame at the end.
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }

            for (const p of extractContentBearingRelPaths(fdata)) {
              pathsWithContentRef.current.add(p);
            }
          }
        }

        const pendingHttp =
          res.status === 404 || res.status === 425 || res.status === 202 || res.status === 204;
        if (!res.ok && !pendingHttp && !toastShownRef.current) {
          toastShownRef.current = true;
          const msg =
            data &&
            typeof data === 'object' &&
            typeof (data as { message?: string }).message === 'string'
              ? (data as { message: string }).message
              : `Website status request failed (${res.status})`;
          toast.error(msg);
        }

        if (failed && !toastShownRef.current) {
          toastShownRef.current = true;
          const detail = message.trim() || 'Website generation failed.';
          setStatus({ isLoading: false, progress: 0, message: detail, phase: 'error', currentFile: '' });
          toast.error(detail);
        }

        const doneFiles = pendingS3Files.filter((f) => isDoneManifestStatus(f.status));
        const missingDone = doneFiles.filter((f) => !pathsWithContentRef.current.has(f.path));

        if (terminal && !failed && missingDone.length > 0 && !s3FallbackStartedRef.current) {
          s3FallbackStartedRef.current = true;
          await runS3Fallback(missingDone.map((f) => ({ ...f, status: 'done' })));
          return;
        }

        // Stop as soon as every file in the manifest has a "done" status AND every
        // one of those files has been loaded into the workbench — even if the API
        // hasn't explicitly returned terminal=true yet.
        const allManifestFilesDone =
          pendingS3Files.length > 0 &&
          pendingS3Files.every((f) => isDoneManifestStatus(f.status));

        if (
          !failed &&
          !stopped &&
          !s3FallbackStartedRef.current &&
          allManifestFilesDone &&
          missingDone.length === 0
        ) {
          stopped = true;
          stopInterval();
          setStatus({ isLoading: false, progress: 100, message: 'All files loaded!', phase: 'done', currentFile: '' });
          workbenchStore.setDocuments(workbenchStore.files.get());
          if (!toastShownRef.current) {
            toastShownRef.current = true;
            toast.success('Website generation finished.');
          }
          return;
        }

        if (terminal || failed) {
          stopped = true;
          stopInterval();
          if (!failed) {
            // Only transition to 'done' if the workbench is actually populated.
            // For a re-opened deployed job the first poll returns terminal=true
            // with an empty workbench — emitting phase='done' here causes the
            // chat bridge to add "✅ All files loaded successfully!" *before*
            // any file has been ingested. Use 'paused' instead so the auto-sync
            // still kicks in (it gates on paused/done) but the success message
            // waits until the sync genuinely finishes loading every file.
            const hasFiles = Object.keys(workbenchStore.files.get()).length > 0;
            if (hasFiles) {
              setStatus({ isLoading: false, progress: 100, message: 'Done!', phase: 'done', currentFile: '' });
            } else {
              setStatus({
                isLoading: false,
                progress: 100,
                message: message || 'Generation finished — syncing files…',
                phase: 'paused',
                currentFile: '',
              });
            }
          }
        }

        if (terminal && !failed && !toastShownRef.current) {
          // Hold the toast too — the sync will surface its own "Synced N
          // paths" toast once the workbench is actually populated.
          const hasFiles = Object.keys(workbenchStore.files.get()).length > 0;
          if (hasFiles) {
            toastShownRef.current = true;
            toast.success('Website generation finished.');
          }
        }
      } catch (e) {
        console.error('website/live poll', e);
      } finally {
        running = false;
      }
    };

    void run();
    if (typeof globalThis.window !== 'undefined') {
      intervalId = globalThis.window.setInterval(() => void run(), POLL_MS);
    }

    return () => {
      cancelled = true;
      stopInterval();
      pollStopperRef.current = null;
    };
  }, [appToken, sessionRev]);

  useEffect(() => {
    if (!appToken || syncRev === 0) {
      return;
    }

    const session = getWebsiteGenerationSession();
    if (!session?.jobId) {
      toast.warn('No active website job — run Generate website from the pipeline first.');
      return;
    }

    let cancelled = false;
    const jobId = session.jobId;

    const runSync = async () => {
      // Don't stop the live poll here. With the incremental
      // "files ready"-triggered syncs from `useWebsiteJobPoller`,
      // multiple runs of this fire during a single generation; killing
      // the poll on the first one would lose its safety-net per-tick
      // fetching for everything that follows. Both paths now use the
      // same "skip already loaded" guard, so they coexist without
      // duplicate ingests, and the all-loaded branch below stops the
      // poll explicitly once the workbench is truly complete.
      setIsSyncing(true);
      setStatus((prev) => ({ ...prev, phase: 'syncing', message: 'Syncing files from API…' }));

      try {
        const { mergedManifestPaths, syncedPathCount } = await runWebsiteLiveFullSync(appToken, jobId, {
          seedManifestPaths: [...lastManifestPathsRef.current],
          onPath: (relPath) => {
            if (!cancelled) {
              setStatus((prev) => ({ ...prev, currentFile: relPath, message: `Sync: ${relPath}` }));
            }
          },
        });

        lastManifestPathsRef.current = mergedManifestPaths;

        // The sync just wrote every manifest path's content to the workbench,
        // so mark them as loaded. Without this, the live-poll loop keeps
        // re-fetching each file individually (3/tick) before it'll emit
        // phase: 'done' — and the "All files loaded" chat message lags many
        // seconds behind the actual sync completion.
        for (const p of mergedManifestPaths) {
          if (p) pathsWithContentRef.current.add(p);
        }

        if (!cancelled) {
          toast.success(syncedPathCount ? `Synced ${syncedPathCount} paths from API` : 'Synced latest snapshot from API');

          // If we have a real manifest and every path is now loaded, transition
          // straight to 'done' so the chat-bridge can emit the success message
          // *after* the sync completes (which is the correct ordering — without
          // this the bridge has no way to know the workbench is now coherent).
          const filesNow = workbenchStore.files.get();
          const allManifestPathsLoaded =
            mergedManifestPaths.length > 0 &&
            mergedManifestPaths.every((rel) => {
              const wb = normalizeWorkbenchPath(rel);
              const dirent = wb ? filesNow[wb] : undefined;
              return dirent?.type === 'file';
            });

          if (allManifestPathsLoaded) {
            // Workbench is fully coherent — stop the live poll's redundant
            // per-file fetches and emit 'done' so the chat-bridge runs the
            // success message right after this sync (not 20s later).
            pollStopperRef.current?.();
            setStatus({
              isLoading: false,
              progress: 100,
              message: 'All files loaded!',
              phase: 'done',
              currentFile: '',
            });
            workbenchStore.setDocuments(filesNow);
          } else {
            setStatus((prev) => ({
              ...prev,
              isLoading: false,
              phase: prev.phase === 'paused' ? 'paused' : 'idle',
              currentFile: '',
              message: prev.phase === 'paused' ? prev.message : 'Sync complete',
            }));
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error('website live sync', e);
          toast.error(e instanceof Error ? e.message : 'Sync failed');
          setStatus((prev) => ({ ...prev, phase: prev.phase === 'paused' ? 'paused' : 'idle' }));
        }
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    };

    void runSync();

    return () => {
      cancelled = true;
    };
  }, [syncRev, appToken, sessionRev]);

  return { status, isSyncing };
}
