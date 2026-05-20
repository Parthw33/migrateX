/**
 * useOnDemandFileContent.ts
 *
 * Lazy-loads individual file content from the Lambda S3 proxy only when
 * a file is selected in the explorer — not upfront for all files.
 *
 * Strategy:
 *   1. The file tree is populated with skeleton entries (path only, no content).
 *   2. When the user clicks a file, this hook fetches the content via
 *      GET /jobs/{jobId}/website/file?path={relativePath}
 *   3. Content is written into the workbench FileStore.
 *   4. Already-fetched files are cached and never re-fetched.
 */

import { useCallback, useRef, useState } from 'react';
import { lambdaFetchS3FileContent } from '~/lib/lambdaApi';
import { workbenchStore } from '~/lib/stores/workbench';
import { globalLoader } from '~/lib/stores/globalLoader';

interface UseOnDemandFileContentOptions {
  /** App JWT token for Lambda auth. */
  appToken: string | null;
  /** Website generation job ID — used to form the Lambda URL. */
  jobId: string | null;
  /**
   * The workbench path prefix to strip when building the S3 relative path.
   * Usually '/home/project'.
   */
  workDir?: string;
}

interface UseOnDemandFileContentResult {
  /** Call when the user selects a file in the tree. */
  onFileSelect: (filePath: string) => Promise<void>;
  /** True while a file fetch is in progress. */
  isFetchingFile: boolean;
  /** The path currently being fetched (for UI feedback). */
  fetchingPath: string | null;
  /** Paths that have already been fetched successfully. */
  fetchedPaths: Set<string>;
  /** Paths that failed to fetch (so we don't retry endlessly). */
  failedPaths: Set<string>;
}

export function useOnDemandFileContent({
  appToken,
  jobId,
  workDir = '/home/project',
}: UseOnDemandFileContentOptions): UseOnDemandFileContentResult {
  const fetchedRef = useRef(new Set<string>());
  const failedRef = useRef(new Set<string>());
  const [isFetchingFile, setIsFetchingFile] = useState(false);
  const [fetchingPath, setFetchingPath] = useState<string | null>(null);

  // Force re-render when sets change (we use refs for sets to avoid stale closures)
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const onFileSelect = useCallback(
    async (filePath: string) => {
      // Always update the editor selection
      workbenchStore.setSelectedFile(filePath);

      // Already have content — nothing to do
      if (fetchedRef.current.has(filePath)) return;

      // Already tried and failed — skip
      if (failedRef.current.has(filePath)) return;

      // No credentials — skip silent
      if (!appToken || !jobId) return;

      // Check if the file already has non-empty content in the store
      const existingFile = workbenchStore.files.get()[filePath];
      if (
        existingFile?.type === 'file' &&
        existingFile.content &&
        existingFile.content.length > 0
      ) {
        fetchedRef.current.add(filePath);
        return;
      }

      // Build relative path by stripping the workDir prefix
      const relativePath = filePath.startsWith(workDir + '/')
        ? filePath.slice(workDir.length + 1)
        : filePath.replace(/^\/+/, '');

      if (!relativePath) return;

      setIsFetchingFile(true);
      setFetchingPath(filePath);

      try {
        const content = await globalLoader.wrap(
          `file:${relativePath}`,
          lambdaFetchS3FileContent(appToken, jobId, relativePath),
        );

        if (content !== null) {
          // Inject content into workbench store
          await workbenchStore.ingestWebsiteFiles({
            [filePath]: { type: 'file', content, isBinary: false },
          });
          fetchedRef.current.add(filePath);
        } else {
          failedRef.current.add(filePath);
        }
      } catch {
        failedRef.current.add(filePath);
      } finally {
        setIsFetchingFile(false);
        setFetchingPath(null);
        bump();
      }
    },
    [appToken, jobId, workDir],
  );

  return {
    onFileSelect,
    isFetchingFile,
    fetchingPath,
    fetchedPaths: fetchedRef.current,
    failedPaths: failedRef.current,
  };
}
