import { lambdaFetchWebsiteLive } from '~/lib/lambdaApi';
import {
  extractRelPathsFromLiveResponse,
  normalizeWorkbenchPath,
  parseWebsiteLivePayload,
} from '~/lib/websiteLiveFiles';
import { workbenchStore } from '~/lib/stores/workbench';

async function parseLiveResponseBody(res: Response): Promise<{ data: unknown }> {
  const text = await res.text();
  let data: unknown = {};

  if (text.trim()) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { raw: text };
    }
  }

  return { data };
}

export interface WebsiteLiveFullSyncOptions {
  seedManifestPaths?: string[];
  onPath?: (relPath: string) => void;
  /**
   * Polled between every per-file iteration. Return true to abort the sync
   * mid-loop — the caller (typically a React effect cleanup) uses this to
   * stop the dozens of `?file=` requests that would otherwise keep firing
   * after the user navigates away from the workbench.
   */
  isCancelled?: () => boolean;
}

/**
 * One full pass: GET /website/live, ingest inline files, then GET each discovered manifest path.
 * Used by the workbench Sync button and by the Contentstack Launch deploying pre-sync.
 */
export async function runWebsiteLiveFullSync(
  token: string,
  jobId: string,
  options?: WebsiteLiveFullSyncOptions,
): Promise<{ mergedManifestPaths: string[]; syncedPathCount: number }> {
  const id = jobId.trim();
  if (!id) {
    const seed = [...(options?.seedManifestPaths ?? [])];
    return { mergedManifestPaths: seed, syncedPathCount: 0 };
  }

  let manifestPaths = [...(options?.seedManifestPaths ?? [])];

  const isCancelled = () => options?.isCancelled?.() === true;

  const res = await lambdaFetchWebsiteLive(token, id);
  if (isCancelled()) {
    return { mergedManifestPaths: manifestPaths, syncedPathCount: 0 };
  }
  const { data } = await parseLiveResponseBody(res);
  if (isCancelled()) {
    return { mergedManifestPaths: manifestPaths, syncedPathCount: 0 };
  }
  const parsed = parseWebsiteLivePayload(data);

  // Ingest the initial /live response's inline content first so the
  // workbench gets at least one file as soon as the sync starts.
  if (Object.keys(parsed.fileMap).length > 0 && !isCancelled()) {
    await workbenchStore.ingestWebsiteFiles(parsed.fileMap);
  }

  const fromManifest = parsed.pendingS3Files.map((f) => f.path.trim()).filter(Boolean);
  if (fromManifest.length > 0) {
    manifestPaths = [...new Set([...manifestPaths, ...fromManifest])];
  }

  const pathSet = new Set<string>([...manifestPaths, ...extractRelPathsFromLiveResponse(data)]);
  const paths = [...pathSet].filter(Boolean);

  // Ingest each file individually as it arrives so the workbench tree fills
  // in one row at a time. A yield to the event loop between ingests lets
  // React paint each new file before the next fetch starts, which is the
  // "files showing one-by-one" UX users expect during a sync.
  //
  // Skip paths the workbench already has content for — this keeps the
  // incremental syncs (fired by `useWebsiteJobPoller` on each new
  // "files ready" message) cheap: each call only fetches what's actually
  // new since the last sync.
  const isAlreadyLoaded = (relPath: string): boolean => {
    const wb = normalizeWorkbenchPath(relPath);
    if (!wb) return false;
    const dirent = workbenchStore.files.get()[wb];
    return (
      !!dirent &&
      dirent.type === 'file' &&
      typeof dirent.content === 'string' &&
      dirent.content.length > 0
    );
  };

  for (const relPath of paths) {
    if (isCancelled()) {
      break;
    }
    if (isAlreadyLoaded(relPath)) {
      continue;
    }

    options?.onPath?.(relPath);

    try {
      const fres = await lambdaFetchWebsiteLive(token, id, { file: relPath });
      if (isCancelled()) {
        break;
      }
      const { data: fdata } = await parseLiveResponseBody(fres);
      if (isCancelled()) {
        break;
      }
      const fparsed = parseWebsiteLivePayload(fdata);

      if (Object.keys(fparsed.fileMap).length > 0) {
        await workbenchStore.ingestWebsiteFiles(fparsed.fileMap);
        // Yield to the event loop so the file tree / chat re-render between
        // ingests rather than batching them all into one frame at the end.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } catch (err) {
      // Skip individual file failures — keep syncing the rest.
      console.warn('runWebsiteLiveFullSync file fetch failed', relPath, err);
    }
  }

  if (!isCancelled()) {
    workbenchStore.setDocuments(workbenchStore.files.get());
  }

  return { mergedManifestPaths: paths, syncedPathCount: paths.length };
}
