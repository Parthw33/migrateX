import { lambdaFetchWebsiteLive } from '~/lib/lambdaApi';
import { extractRelPathsFromLiveResponse, parseWebsiteLivePayload } from '~/lib/websiteLiveFiles';
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

  const res = await lambdaFetchWebsiteLive(token, id);
  const { data } = await parseLiveResponseBody(res);
  const parsed = parseWebsiteLivePayload(data);

  // Ingest the initial /live response's inline content first so the
  // workbench gets at least one file as soon as the sync starts.
  if (Object.keys(parsed.fileMap).length > 0) {
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
  for (const relPath of paths) {
    options?.onPath?.(relPath);

    try {
      const fres = await lambdaFetchWebsiteLive(token, id, { file: relPath });
      const { data: fdata } = await parseLiveResponseBody(fres);
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

  workbenchStore.setDocuments(workbenchStore.files.get());

  return { mergedManifestPaths: paths, syncedPathCount: paths.length };
}
