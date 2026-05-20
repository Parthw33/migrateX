import { lambdaFetchWebsiteLive } from '~/lib/lambdaApi';
import { extractRelPathsFromLiveResponse, parseWebsiteLivePayload } from '~/lib/websiteLiveFiles';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileMap } from '~/lib/stores/files';

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

  // Accumulate everything into a single fileMap and do ONE ingest at the end.
  // Per-file ingest cascades through every reactive subscriber (file tree,
  // editor document map, chat file-activity feed) — for large manifests that
  // O(N²) work pins the main thread and freezes the UI.
  const aggregateFileMap: FileMap = { ...parsed.fileMap };

  const fromManifest = parsed.pendingS3Files.map((f) => f.path.trim()).filter(Boolean);
  if (fromManifest.length > 0) {
    manifestPaths = [...new Set([...manifestPaths, ...fromManifest])];
  }

  const pathSet = new Set<string>([...manifestPaths, ...extractRelPathsFromLiveResponse(data)]);
  const paths = [...pathSet].filter(Boolean);

  for (const relPath of paths) {
    options?.onPath?.(relPath);

    try {
      const fres = await lambdaFetchWebsiteLive(token, id, { file: relPath });
      const { data: fdata } = await parseLiveResponseBody(fres);
      const fparsed = parseWebsiteLivePayload(fdata);

      for (const [k, v] of Object.entries(fparsed.fileMap)) {
        if (v) {
          aggregateFileMap[k] = v;
        }
      }
    } catch (err) {
      // Skip individual file failures — keep syncing the rest.
      console.warn('runWebsiteLiveFullSync file fetch failed', relPath, err);
    }
  }

  if (Object.keys(aggregateFileMap).length > 0) {
    await workbenchStore.ingestWebsiteFiles(aggregateFileMap);
  }

  workbenchStore.setDocuments(workbenchStore.files.get());

  return { mergedManifestPaths: paths, syncedPathCount: paths.length };
}
