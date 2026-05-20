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

  useEffect(() => {
    if (!jobId) return;

    _lastStatus = '';
    _lastMessage = '';
    _lastWebsiteUrl = '';
    pollsRef.current = 0;

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
