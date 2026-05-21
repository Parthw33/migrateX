/**
 * useWebsiteJobPoller.ts
 *
 * Polls the Supabase `jobs` table for the given jobId and:
 *  1. Updates the websiteChatStore with website_url, status, message, etc.
 *  2. Feeds progress messages into the Bolt-style chat as AI messages.
 *  3. Stops polling when website_url is populated or status is terminal.
 */

import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '~/lib/supabaseClient';
import { websiteChat } from '~/lib/stores/websiteChat';
import { requestWebsiteLiveFilesSync } from '~/lib/websiteGenerationSession';

const POLL_MS = 3000;
const MAX_POLLS = 200;

type JobRow = Record<string, unknown>;

function str(v: unknown): string {
  return v != null ? String(v).trim() : '';
}

let _lastStatus = '';
let _lastMessage = '';
let _lastWebsiteUrl = '';

function extractJobRow(row: JobRow) {
  return {
    website_url: str(row.website_url ?? row.websiteUrl ?? ''),
    website_status: str(row.website_status ?? row.websiteStatus ?? ''),
    website_message: str(row.website_message ?? row.websiteMessage ?? ''),
    website_launch_project_uid: str(row.website_launch_project_uid ?? row.websiteLaunchProjectUid ?? ''),
    website_launch_env_uid: str(row.website_launch_env_uid ?? row.websiteLaunchEnvUid ?? ''),
    progress: typeof row.progress === 'number' ? row.progress : 0,
  };
}

function isTerminalStatus(status: string): boolean {
  const s = status.toLowerCase();
  return ['done', 'complete', 'failed', 'error', 'cancelled', 'deployed'].includes(s);
}

/**
 * Kicks off Supabase polling for a job row. Feeds messages into the chat store.
 */
export function useWebsiteJobPoller(jobId: string | null) {
  const pollsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fire a one-shot full sync the first time the backend signals it has
  // moved past file generation (build attempt / deploying / deployed). The
  // live poll's per-tick picker isn't aggressive enough to pull every file
  // before the user sees the "Done" badge; the manual sync iterates the
  // full manifest and is what actually populates the workbench tree.
  const postGenerationSyncRef = useRef(false);
  // Throttle for the "files ready" trigger — while generation is still
  // streaming, request an incremental sync each time the server reports a
  // new batch of ready files, but not more than once every ~3 seconds so
  // we don't queue overlapping syncs.
  const lastFilesReadySyncAtRef = useRef(0);
  const lastFilesReadyCountRef = useRef(0);

  useEffect(() => {
    if (!jobId) return;

    _lastStatus = '';
    _lastMessage = '';
    _lastWebsiteUrl = '';
    pollsRef.current = 0;
    postGenerationSyncRef.current = false;
    lastFilesReadySyncAtRef.current = 0;
    lastFilesReadyCountRef.current = 0;

    const sb = getSupabaseClient();
    if (!sb) {
      websiteChat.addStatus('Supabase not configured — website_url tracking unavailable.', 'warning');
      return;
    }

    async function poll() {
      if (pollsRef.current >= MAX_POLLS) {
        websiteChat.addStatus('Job monitoring timed out. Wait for the generation to complete.', 'warning');
        return;
      }
      pollsRef.current += 1;

      const { data, error } = await sb!.from('jobs').select('*').eq('id', jobId).maybeSingle();

      if (error) {
        console.warn('[JobPoller]', error.message);
        scheduleNext();
        return;
      }

      if (!data) {
        scheduleNext();
        return;
      }

      const row = data as JobRow;
      const {
        website_url,
        website_status,
        website_message,
        website_launch_project_uid,
        website_launch_env_uid,
        progress,
      } = extractJobRow(row);

      // Always update the store
      websiteChat.setJobRow({
        website_url: website_url || null,
        website_status: website_status || null,
        website_message: website_message || null,
        website_launch_project_uid: website_launch_project_uid || null,
        website_launch_env_uid: website_launch_env_uid || null,
      });

      if (progress > 0) {
        websiteChat.setProgress(progress);
      }

      // Emit chat message when status changes
      if (website_status && website_status !== _lastStatus) {
        _lastStatus = website_status;
        const statusLower = website_status.toLowerCase();

        if (statusLower === 'deploying' || statusLower === 'generating' || statusLower === 'failed') {
          websiteChat.setPhase('generating', 'Generating website…', progress);
          websiteChat.addAI('⚙️ Website generation is in progress — fetching your files and building the preview…');
        } else if (statusLower === 'deployed' || statusLower === 'done' || statusLower === 'complete') {
          websiteChat.setPhase('done', 'Website ready!', 100);
          websiteChat.addAI('🎉 Your website is ready! The preview is now live below.');
        } else if (statusLower === 'failed' || statusLower === 'error') {
          websiteChat.setPhase('error', 'Generation failed');
          websiteChat.addStatus(`❌ Website generation failed: ${website_message || website_status}`, 'error');
        }
      }

      // Emit message when progress message changes
      if (website_message && website_message !== _lastMessage) {
        _lastMessage = website_message;
        websiteChat.addAI(`📋 ${website_message}`);

        // Backend has moved from file generation into the build phase
        // (e.g. "Build attempt 1/3…", "Deploying…"). Files are written
        // and available — request a one-shot full sync so the workbench
        // tree gets populated. Fires once per session.
        if (!postGenerationSyncRef.current) {
          const ml = website_message.toLowerCase();
          if (ml.includes('build attempt') || ml.includes('deploying')) {
            postGenerationSyncRef.current = true;
            requestWebsiteLiveFilesSync();
          }
        }

        // Incremental sync while generation is still streaming. Each time
        // the server reports a higher "X files ready" count, request a
        // sync — throttled to once every ~3s — so the workbench tree
        // keeps up with the chat instead of lagging behind by 20+ files.
        const readyMatch = website_message.match(/(\d+)\s+files?\s+ready/i);
        if (readyMatch) {
          const readyCount = parseInt(readyMatch[1], 10);
          const now = Date.now();
          const grewSinceLast = readyCount > lastFilesReadyCountRef.current;
          const throttleOk = now - lastFilesReadySyncAtRef.current >= 3000;
          if (grewSinceLast && throttleOk) {
            lastFilesReadyCountRef.current = readyCount;
            lastFilesReadySyncAtRef.current = now;
            requestWebsiteLiveFilesSync();
          }
        }
      }

      const statusLowerForSync = website_status.toLowerCase();
      if (
        !postGenerationSyncRef.current &&
        (statusLowerForSync === 'building' ||
          statusLowerForSync === 'built' ||
          statusLowerForSync === 'deploying' ||
          statusLowerForSync === 'deployed' ||
          statusLowerForSync === 'success' ||
          statusLowerForSync === 'complete' ||
          statusLowerForSync === 'completed' ||
          statusLowerForSync === 'done')
      ) {
        postGenerationSyncRef.current = true;
        requestWebsiteLiveFilesSync();
      }

      // Emit when website_url appears for the first time
      if (website_url && website_url !== _lastWebsiteUrl) {
        _lastWebsiteUrl = website_url;
        websiteChat.setWebsiteUrl(website_url);
        websiteChat.addAI(`🌐 Live preview is ready at ${website_url}`);
      }

      // Stop when terminal or URL is set and status is done
      const terminal = isTerminalStatus(website_status) || Boolean(website_url);
      if (!terminal) {
        scheduleNext();
      }
    }

    function scheduleNext() {
      timerRef.current = setTimeout(() => void poll(), POLL_MS);
    }

    // Initial delay then first poll
    timerRef.current = setTimeout(() => void poll(), 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId]);
}
