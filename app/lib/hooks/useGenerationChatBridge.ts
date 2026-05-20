/**
 * useGenerationChatBridge.ts
 *
 * Watches the WebsiteGenerationStatus from useWebsiteLiveGenerationPoll
 * and emits human-readable chat messages into the websiteChatStore
 * whenever the phase or file changes.
 *
 * Also watches the workbench file store to emit file-activity events
 * as files are added by the S3 ingestion process.
 */

import { useEffect, useRef } from 'react';
import type { WebsiteGenerationStatus } from '~/lib/hooks/useWebsiteLiveGenerationPoll';
import { websiteChat } from '~/lib/stores/websiteChat';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';

const PHASE_INTRO: Record<string, string> = {
  polling: '🔄 Connecting to the generation pipeline and polling for updates…',
  'fetching-s3': '📦 Fetching generated website files from S3 storage…',
  syncing: '🔃 Syncing latest file updates from the server…',
  done: '✅ All files loaded successfully! Your website is ready in the editor.',
  error: '❌ An error occurred during website generation.',
};

const MAX_FILE_ACTIVITY_MESSAGES = 100;

export function useGenerationChatBridge(status: WebsiteGenerationStatus | null) {
  const lastPhaseRef = useRef<string>('idle');
  const lastFileRef = useRef<string>('');
  const lastProgressRef = useRef<number>(0);
  const seenFilesRef = useRef<Set<string>>(new Set());

  // Phase changes → AI messages
  useEffect(() => {
    if (!status) return;
    const { phase, message, progress } = status;

    // Emit intro message on phase transition
    if (phase !== lastPhaseRef.current && phase !== 'idle') {
      const intro = PHASE_INTRO[phase];
      if (intro) {
        websiteChat.addAI(intro);
      }
      lastPhaseRef.current = phase;

      // Update store phase
      const storePhase =
        phase === 'fetching-s3'
          ? 'fetching-files'
          : phase === 'polling'
          ? 'connecting'
          : (phase as 'idle' | 'generating' | 'done' | 'error');

      websiteChat.setPhase(storePhase as any, message || '', progress);
    }

    // Progress updates
    if (progress > lastProgressRef.current + 10) {
      lastProgressRef.current = progress;
      websiteChat.setProgress(progress);
    }
  }, [status?.phase, status?.progress]);

  // File-level changes → file-activity messages
  useEffect(() => {
    if (!status || (status.phase !== 'fetching-s3' && status.phase !== 'syncing')) return;
    const { currentFile } = status;
    if (!currentFile || currentFile === lastFileRef.current) return;

    lastFileRef.current = currentFile;
    websiteChat.addFileActivity(currentFile, 'created');
  }, [status?.currentFile, status?.phase]);

  // Watch file store for new files — use direct store subscription so this
  // does NOT cause React re-renders on every file ingestion.
  useEffect(() => {
    return workbenchStore.files.subscribe((files) => {
      for (const filePath of Object.keys(files)) {
        if (seenFilesRef.current.has(filePath)) continue;
        seenFilesRef.current.add(filePath);

        // Only emit for project files, not folders
        const dirent = files[filePath];
        if (dirent?.type !== 'file') continue;

        // Cap total file-activity messages to avoid unbounded chat growth
        const currentMsgCount = seenFilesRef.current.size;
        if (currentMsgCount > MAX_FILE_ACTIVITY_MESSAGES) continue;

        const displayPath = filePath.startsWith(WORK_DIR + '/')
          ? filePath.slice(WORK_DIR.length + 1)
          : filePath;

        websiteChat.addFileActivity(displayPath, 'created');
      }
    });
  }, []);
}
