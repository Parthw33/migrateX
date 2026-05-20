/**
 * websiteChat.ts
 *
 * Nanostores-based chat store for the Bolt-style generate-website UI.
 * Tracks AI messages, file activity events, job status, and the
 * website preview URL — all derived from the Lambda + Supabase APIs.
 */

import { atom, map } from 'nanostores';

/* ── Message types ──────────────────────────────────────────────────────── */

export type ChatMessageRole = 'system' | 'ai' | 'user' | 'file-activity' | 'status';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: Date;
  /** For file-activity messages */
  filePath?: string;
  fileAction?: 'created' | 'updated' | 'downloaded' | 'deleted';
  /** For status messages */
  statusType?: 'info' | 'success' | 'error' | 'warning';
  /** Show animated typing indicator before this message is complete */
  isStreaming?: boolean;
}

export interface WebsiteChatState {
  messages: ChatMessage[];
  isTyping: boolean;
  /** 0-100 overall progress */
  progress: number;
  /** Human-readable phase label */
  phaseLabel: string;
  /** Raw phase key */
  phase: 'idle' | 'connecting' | 'generating' | 'fetching-files' | 'deploying' | 'done' | 'error';
  /** website_url from Supabase — when set, show iframe preview */
  websiteUrl: string | null;
  /** launch_project_uid from Supabase */
  launchProjectUid: string | null;
  /** launch_env_uid from Supabase */
  launchEnvUid: string | null;
  /** website_status from Supabase */
  websiteStatus: string | null;
  /** website_message from Supabase */
  websiteMessage: string | null;
  /** Supabase job id being watched */
  watchingJobId: string | null;
  /** True while preview panel is visible */
  showPreview: boolean;
  /** True while IDE panel is visible */
  showIDE: boolean;
}

/* ── Store ──────────────────────────────────────────────────────────────── */

function initialState(): WebsiteChatState {
  return {
    messages: [],
    isTyping: false,
    progress: 0,
    phaseLabel: '',
    phase: 'idle',
    websiteUrl: null,
    launchProjectUid: null,
    launchEnvUid: null,
    websiteStatus: null,
    websiteMessage: null,
    watchingJobId: null,
    showPreview: false,
    showIDE: true,
  };
}

export const websiteChatStore = map<WebsiteChatState>(initialState());

/* ── Helpers ────────────────────────────────────────────────────────────── */

let _msgCounter = 0;
function nextId() {
  return `msg-${Date.now()}-${++_msgCounter}`;
}

export const websiteChat = {
  reset() {
    websiteChatStore.set(initialState());
  },

  setJobId(jobId: string) {
    websiteChatStore.setKey('watchingJobId', jobId);
  },

  addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>) {
    const full: ChatMessage = { ...msg, id: nextId(), timestamp: new Date() };
    const prev = websiteChatStore.get().messages;
    websiteChatStore.setKey('messages', [...prev, full]);
    return full.id;
  },

  addAI(content: string, streaming = false) {
    return websiteChat.addMessage({ role: 'ai', content, isStreaming: streaming });
  },

  addSystem(content: string) {
    return websiteChat.addMessage({ role: 'system', content });
  },

  addStatus(content: string, statusType: ChatMessage['statusType'] = 'info') {
    return websiteChat.addMessage({ role: 'status', content, statusType });
  },

  addFileActivity(filePath: string, action: ChatMessage['fileAction'] = 'created') {
    return websiteChat.addMessage({
      role: 'file-activity',
      content: filePath,
      filePath,
      fileAction: action,
    });
  },

  /** Update the content of the last streaming AI message */
  updateLastAIMessage(content: string, done = false) {
    const msgs = [...websiteChatStore.get().messages];
    const idx = msgs.findLastIndex((m) => m.role === 'ai' && m.isStreaming);
    if (idx >= 0) {
      msgs[idx] = { ...msgs[idx], content, isStreaming: !done };
      websiteChatStore.setKey('messages', msgs);
    }
  },

  setTyping(v: boolean) {
    websiteChatStore.setKey('isTyping', v);
  },

  setPhase(
    phase: WebsiteChatState['phase'],
    label: string,
    progress = websiteChatStore.get().progress,
  ) {
    websiteChatStore.setKey('phase', phase);
    websiteChatStore.setKey('phaseLabel', label);
    websiteChatStore.setKey('progress', progress);
  },

  setProgress(n: number) {
    websiteChatStore.setKey('progress', Math.max(0, Math.min(100, n)));
  },

  setWebsiteUrl(url: string | null) {
    websiteChatStore.setKey('websiteUrl', url);
    if (url) {
      websiteChatStore.setKey('showPreview', true);
    }
  },

  setJobRow(row: {
    website_url?: string | null;
    website_launch_project_uid?: string | null;
    website_launch_env_uid?: string | null;
    website_status?: string | null;
    website_message?: string | null;
  }) {
    if (row.website_url !== undefined)
      websiteChatStore.setKey('websiteUrl', row.website_url ?? null);
    if (row.website_launch_project_uid !== undefined)
      websiteChatStore.setKey('launchProjectUid', row.website_launch_project_uid ?? null);
    if (row.website_launch_env_uid !== undefined)
      websiteChatStore.setKey('launchEnvUid', row.website_launch_env_uid ?? null);
    if (row.website_status !== undefined)
      websiteChatStore.setKey('websiteStatus', row.website_status ?? null);
    if (row.website_message !== undefined)
      websiteChatStore.setKey('websiteMessage', row.website_message ?? null);
  },

  togglePreview() {
    websiteChatStore.setKey('showPreview', !websiteChatStore.get().showPreview);
  },

  toggleIDE() {
    websiteChatStore.setKey('showIDE', !websiteChatStore.get().showIDE);
  },
};
