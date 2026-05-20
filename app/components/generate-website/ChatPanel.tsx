/**
 * ChatPanel.tsx
 *
 * Pure chat panel — NO header, NO view-toggle buttons (those live in WorkbenchHeader).
 * Shows: progress bar · messages · typing indicator · text input.
 */

import { memo, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { websiteChatStore, websiteChat, type ChatMessage } from '~/lib/stores/websiteChat';
import type { WebsiteGenerationStatus } from '~/lib/hooks/useWebsiteLiveGenerationPoll';
import { authStore } from '~/lib/stores/auth';
import { lambdaWebsiteStart } from '~/lib/lambdaApi';
import {
  getWebsiteGenerationSession,
  requestWebsiteLiveFilesSync,
  setWebsiteGenerationSession,
} from '~/lib/websiteGenerationSession';
import { getScrapeJobId } from '~/lib/scrapeJobSession';
import { workbenchStore } from '~/lib/stores/workbench';

/* ── Content classifiers (for AI bubble highlighting + toast gating) ─────── */

function hasErrorKeyword(content: string) {
  return /\b(error|failed|failure)\b/i.test(content) || content.includes('❌');
}

function hasSuccessKeyword(content: string) {
  return (
    /\b(success(?:fully)?|complete(?:d|ly)?|deployed|ready|generated|done)\b/i.test(content) ||
    content.includes('✅') ||
    content.includes('🎉')
  );
}

/* ── Typing dots ─────────────────────────────────────────────────────────── */

function TypingIndicator() {
  return (
    <div className="px-3 pb-2 chat-message-enter" aria-label="AI is typing">
      <div className="inline-flex items-center gap-2 rounded-full border border-migratex-elements-borderColor/70 bg-migratex-elements-background-depth-2/80 px-3 py-1.5 shadow-sm">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 w-1 rounded-full bg-violet-500/80"
              style={{ animation: `typing-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <span className="text-[11px] font-medium text-migratex-elements-textSecondary">Thinking…</span>
      </div>
    </div>
  );
}

/* ── File action icon map ────────────────────────────────────────────────── */

const FILE_ACTION_ICONS: Record<string, string> = {
  created: 'i-ph:file-plus-duotone text-emerald-600 dark:text-emerald-400',
  updated: 'i-ph:pencil-simple text-sky-600 dark:text-sky-400',
  downloaded: 'i-ph:download-simple-duotone text-violet-600 dark:text-violet-400',
  deleted: 'i-ph:trash-duotone text-red-500 dark:text-red-400',
};

const FILE_ACTION_BADGE: Record<string, string> = {
  created:
    'bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/55 dark:text-emerald-200 dark:border-emerald-800/80',
  updated: 'bg-sky-50 text-sky-800 border-sky-200/80 dark:bg-sky-950/55 dark:text-sky-200 dark:border-sky-800/80',
  downloaded:
    'bg-violet-50 text-violet-800 border-violet-200/80 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800/80',
  deleted: 'bg-red-50 text-red-800 border-red-200/80 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800/80',
};

const STATUS_ICONS: Record<string, string> = {
  info: 'i-ph:info-duotone text-sky-600 dark:text-sky-400',
  success: 'i-ph:check-circle-duotone text-emerald-600 dark:text-emerald-400',
  error: 'i-ph:warning-circle-duotone text-red-600 dark:text-red-400',
  warning: 'i-ph:warning-duotone text-amber-600 dark:text-amber-400',
};

const STATUS_SURFACE: Record<string, string> = {
  info: 'border-sky-200/70 bg-sky-50/50 dark:border-sky-800/70 dark:bg-sky-950/40',
  success: 'border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-800/70 dark:bg-emerald-950/40',
  error: 'border-red-200/80 bg-red-50/70 dark:border-red-800/80 dark:bg-red-950/45',
  warning: 'border-amber-200/70 bg-amber-50/50 dark:border-amber-800/70 dark:bg-amber-950/40',
};

/** Long JSON / URLs in the assistant sidebar must wrap inside the panel. */
const CHAT_TEXT_WRAP = 'min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]';

/* ── Message bubble ──────────────────────────────────────────────────────── */

const MessageBubble = memo(({ msg }: { msg: ChatMessage }) => {
  if (msg.role === 'file-activity') {
    const action = msg.fileAction ?? 'created';
    const iconClass = FILE_ACTION_ICONS[action] ?? FILE_ACTION_ICONS.created;
    const badgeClass = FILE_ACTION_BADGE[action] ?? FILE_ACTION_BADGE.created;

    return (
      <div className="chat-message-enter px-3 py-0.5">
        <div className="group flex items-center gap-2.5 rounded-lg border border-migratex-elements-borderColor/60 bg-migratex-elements-background-depth-2 px-2.5 py-1.5 shadow-sm transition-colors hover:border-migratex-elements-borderColor hover:bg-migratex-elements-background-depth-3 dark:shadow-none">
          <span className={classNames('text-[15px] flex-shrink-0 opacity-90', iconClass)} aria-hidden />
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] leading-snug text-migratex-elements-textSecondary group-hover:text-migratex-elements-textPrimary">
            {msg.filePath}
          </code>
          <span
            className={classNames(
              'flex-shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
              badgeClass,
            )}
          >
            {action}
          </span>
        </div>
      </div>
    );
  }

  if (msg.role === 'status') {
    const st = msg.statusType ?? 'info';
    const iconClass = STATUS_ICONS[st] ?? STATUS_ICONS.info;
    const surface = STATUS_SURFACE[st] ?? STATUS_SURFACE.info;

    return (
      <div className="chat-message-enter min-w-0 px-3 py-1">
        <div
          className={classNames(
            'flex min-w-0 gap-2.5 rounded-lg border px-3 py-2 shadow-sm',
            surface,
            st === 'error' ? 'ring-1 ring-red-200/60 dark:ring-red-800/60' : '',
          )}
        >
          <span className={classNames('mt-0.5 flex-shrink-0 text-base', iconClass)} aria-hidden />
          <p
            className={classNames(
              'flex-1 text-[12px] leading-relaxed text-migratex-elements-textPrimary',
              CHAT_TEXT_WRAP,
            )}
          >
            {msg.content}
          </p>
        </div>
      </div>
    );
  }

  if (msg.role === 'user') {
    return (
      <div className="chat-message-enter flex min-w-0 justify-end px-3 py-1">
        <div
          className={classNames(
            'max-w-[min(92%,20rem)] rounded-2xl rounded-tr-md bg-[#5b4bcf] px-3.5 py-2 text-[13px] leading-relaxed text-white shadow-md shadow-violet-900/10',
            CHAT_TEXT_WRAP,
          )}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.role === 'system') {
    return (
      <div className="chat-message-enter flex min-w-0 justify-center px-3 py-1">
        <span
          className={classNames(
            'max-w-[95%] rounded-full border border-migratex-elements-borderColor/60 bg-migratex-elements-background-depth-2/90 px-3 py-1 text-center text-[11px] font-medium text-migratex-elements-textSecondary',
            CHAT_TEXT_WRAP,
          )}
        >
          {msg.content}
        </span>
      </div>
    );
  }

  // AI message — with optional error / success highlight
  const isErrMsg = !msg.isStreaming && hasErrorKeyword(msg.content);
  const isOkMsg = !msg.isStreaming && !isErrMsg && hasSuccessKeyword(msg.content);

  return (
    <div className="chat-message-enter flex min-w-0 gap-2.5 px-3 py-1">
      <div
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-migratex-primary to-migratex-secondary shadow-sm ring-1 ring-black/5 dark:ring-white/10"
        style={{
          backgroundImage:
            'linear-gradient(to bottom right, var(--migratex-primary, #6C5CE7), var(--migratex-secondary, #6C5CE7))',
        }}
        aria-hidden
      >
        <svg width="10" height="12" viewBox="0 0 20 24" fill="white">
          <path d="M19.715 9.945v4.107l-9.878 1.37L0 14.052V9.945l9.837-1.37 9.878 1.37zM0 19.529v-4.107l5.75 3.08 13.965-3.08v4.107L5.75 23.979 0 19.53z" />
          <path d="M19.715 4.47v4.107l-5.75-3.08L0 8.577V4.47L13.965.02l5.75 4.45z" />
        </svg>
      </div>
      <div
        className={classNames(
          'min-w-0 flex-1 rounded-xl rounded-tl-sm border px-3 py-2 shadow-sm',
          isErrMsg
            ? 'border-red-300/80 bg-red-50/70 ring-1 ring-red-200/60 dark:border-red-800/70 dark:bg-red-950/30 dark:ring-red-800/40'
            : isOkMsg
              ? 'border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:shadow-none'
              : 'border-migratex-elements-borderColor/70 bg-migratex-elements-background-depth-2 dark:bg-[#161b22] dark:shadow-none',
        )}
      >
        {isErrMsg && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="i-ph:warning-circle-fill text-sm text-red-500" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              Error
            </span>
          </div>
        )}
        <p
          className={classNames(
            'text-[13px] leading-relaxed',
            CHAT_TEXT_WRAP,
            isErrMsg ? 'text-red-800 dark:text-red-200' : 'text-migratex-elements-textPrimary',
            msg.isStreaming
              ? 'after:ml-0.5 after:inline-block after:animate-pulse after:text-violet-500 after:content-["▋"] dark:after:text-violet-400'
              : '',
          )}
        >
          {msg.content}
        </p>
      </div>
    </div>
  );
});

/* ── Progress bar ────────────────────────────────────────────────────────── */

function ProgressBar({
  progress,
  phase,
  label,
  genProgress,
  genPhase,
}: {
  progress: number;
  phase: string;
  label: string;
  genProgress: number;
  genPhase: string;
}) {
  const combined = Math.max(progress, genProgress);
  const activePhase = phase !== 'idle' ? phase : genPhase;
  const isActive = !['idle', 'done', 'error'].includes(activePhase);

  if (!isActive && combined === 0) {
    return null;
  }

  const displayLabel = label || (activePhase === 'done' ? 'Complete' : 'Processing…');
  const indeterminate = isActive && combined === 0;

  return (
    <div className="flex-shrink-0 border-b border-migratex-elements-borderColor/50 bg-gradient-to-b from-migratex-elements-background-depth-1 to-migratex-elements-background-depth-2 px-3 py-2.5 dark:border-migratex-elements-borderColor">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-migratex-elements-textSecondary">
          {displayLabel}
        </span>
        <span className="flex-shrink-0 tabular-nums text-[11px] font-semibold text-violet-700 dark:text-violet-300">
          {indeterminate ? '—' : `${Math.round(combined)}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-migratex-elements-background-depth-3 ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.08]">
        {indeterminate ? (
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-violet-400 to-violet-600 indeterminate-progress-bar" />
        ) : (
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-600 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(combined, 2)}%` }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 shadow-inner ring-1 ring-violet-200/60 dark:from-violet-950/80 dark:to-[#0d1117] dark:ring-violet-800/50">
        <span className="i-ph:globe-duotone text-3xl text-violet-600 dark:text-violet-400" />
      </div>
      <div className="max-w-[240px] space-y-1">
        <p className="text-sm font-semibold tracking-tight text-migratex-elements-textPrimary">Ready when you are</p>
        <p className="text-[12px] leading-relaxed text-migratex-elements-textSecondary">
          Start or resume generation — progress, files, and assistant messages will stream in here.
        </p>
      </div>
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────── */

interface ChatPanelProps {
  generationStatus: WebsiteGenerationStatus | null;
}

type PromptIntent = 'retry-website-creation' | 'get-all-files' | null;

function detectPromptIntent(input: string): PromptIntent {
  const normalized = input.toLowerCase().replace(/\s+/g, ' ').trim();

  const wantsRetry = normalized.includes('retry') || normalized.includes('retry &');
  const mentionsWebsiteAction =
    (normalized.includes('website') || normalized.includes('site')) &&
    (normalized.includes('creation') || normalized.includes('create') || normalized.includes('generation'));

  if (wantsRetry && mentionsWebsiteAction) {
    return 'retry-website-creation';
  }

  if (
    normalized.includes('get all files') ||
    normalized.includes('fetch all files') ||
    normalized.includes('sync all files')
  ) {
    return 'get-all-files';
  }

  return null;
}

export const ChatPanel = memo(({ generationStatus }: ChatPanelProps) => {
  const chatState = useStore(websiteChatStore);
  const appToken = useStore(authStore).appToken;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  /*
   * Tracks how many messages have already been toasted so we only fire on NEW ones.
   * null means "not initialised yet" — skip existing messages on first render.
   */
  const lastToastedCountRef = useRef<number | null>(null);

  // auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;

    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatState.messages.length, chatState.isTyping]);

  // Toast notifications for new error / success messages
  useEffect(() => {
    const msgs = chatState.messages;

    // First render: record baseline count, don't toast existing messages.
    if (lastToastedCountRef.current === null) {
      lastToastedCountRef.current = msgs.length;
      return;
    }

    const newMsgs = msgs.slice(lastToastedCountRef.current);
    lastToastedCountRef.current = msgs.length;

    for (const msg of newMsgs) {
      // Status messages carry an explicit type — trust it directly.
      if (msg.role === 'status') {
        if (msg.statusType === 'error') {
          toast.error(msg.content, { toastId: `chat-${msg.id}` });
        } else if (msg.statusType === 'success') {
          toast.success(msg.content, { toastId: `chat-${msg.id}` });
        }

        continue;
      }

      // AI messages: only toast once streaming is finished.
      if (msg.role === 'ai' && !msg.isStreaming) {
        const short = msg.content.length > 120 ? `${msg.content.slice(0, 120)}…` : msg.content;

        if (hasErrorKeyword(msg.content)) {
          toast.error(short, { toastId: `chat-${msg.id}` });
        } else if (hasSuccessKeyword(msg.content)) {
          toast.success(short, { toastId: `chat-${msg.id}` });
        }
      }
    }
  }, [chatState.messages.length]);

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();

    const text = inputValue.trim();

    if (!text) {
      return;
    }

    websiteChat.addMessage({ role: 'user', content: text });
    setInputValue('');

    const intent = detectPromptIntent(text);

    if (intent === 'retry-website-creation') {
      const jobId =
        chatState.watchingJobId?.trim() ||
        getWebsiteGenerationSession()?.jobId?.trim() ||
        getScrapeJobId()?.trim() ||
        '';

      if (!appToken) {
        websiteChat.addStatus('Sign in is required to retry website creation.', 'error');
        toast.error('Missing authentication token.');

        return;
      }

      if (!jobId) {
        websiteChat.addStatus('Missing job id. Open the migration job and try again.', 'error');
        toast.error('No job id found for website restart.');

        return;
      }

      websiteChat.setTyping(true);

      try {
        websiteChat.addAI('🔄 Retrying website creation and reconnecting live progress…');

        const { jobId: newJobId } = await lambdaWebsiteStart(appToken, { jobId });

        const existingSession = getWebsiteGenerationSession();
        setWebsiteGenerationSession({
          jobId: newJobId,
          url: existingSession?.url ?? '',
          cs_stack_api_key: existingSession?.cs_stack_api_key ?? '',
          cs_org_id: existingSession?.cs_org_id ?? '',
          cs_region: existingSession?.cs_region ?? '',
          s3WebsitePrefix: existingSession?.s3WebsitePrefix ?? '',
          startedAt: new Date().toISOString(),
        });

        workbenchStore.resetFilesForNewWebsiteSession();
        websiteChat.setJobId(newJobId);
        websiteChat.setPhase('connecting', 'Connecting to generation pipeline…', 0);
        websiteChat.addStatus(`Website generation restarted for job ${newJobId}.`, 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to restart website creation';
        websiteChat.addStatus(`❌ ${message}`, 'error');
        toast.error(message);
      } finally {
        websiteChat.setTyping(false);
      }

      return;
    }

    if (intent === 'get-all-files') {
      requestWebsiteLiveFilesSync();
      websiteChat.addAI('📁 Fetching the latest files snapshot and syncing it into the editor…');

      return;
    }

    setTimeout(() => {
      websiteChat.addAI("Got it! I'm monitoring the generation pipeline and will update you as files arrive…");
    }, 500);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-migratex-elements-background-depth-1">
      {/* ── Panel chrome ─────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-migratex-elements-borderColor/60 bg-migratex-elements-background-depth-1/90 px-3 py-2 backdrop-blur-sm dark:bg-migratex-elements-background-depth-1/95">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-migratex-elements-textSecondary">
            Assistant
          </h2>
          <p className="truncate text-[10px] text-migratex-elements-textTertiary">Pipeline status · file activity</p>
        </div>
        {chatState.messages.length > 0 && (
          <span className="rounded-full bg-migratex-elements-background-depth-2 px-2 py-0.5 text-[10px] font-medium tabular-nums text-migratex-elements-textSecondary">
            {chatState.messages.length} updates
          </span>
        )}
      </div>

      <ProgressBar
        progress={chatState.progress}
        phase={chatState.phase}
        label={chatState.phaseLabel}
        genProgress={generationStatus?.progress ?? 0}
        genPhase={generationStatus?.phase ?? 'idle'}
      />

      <div
        ref={scrollRef}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto py-2"
        style={{ overscrollBehavior: 'contain' }}
      >
        {chatState.messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5">
            {chatState.messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </div>
        )}
        {chatState.isTyping && <TypingIndicator />}
      </div>

      <div className="flex-shrink-0 border-t border-migratex-elements-borderColor/80 bg-migratex-elements-background-depth-1 px-3 py-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)] dark:shadow-[0_-10px_28px_-8px_rgba(1,4,9,0.65)]">
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the assistant…"
            rows={1}
            className={classNames(
              'max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-migratex-elements-borderColor/80',
              'bg-migratex-elements-background-depth-1 px-3 py-2.5 text-[13px] text-migratex-elements-textPrimary',
              'leading-relaxed placeholder:text-migratex-elements-textTertiary',
              'shadow-sm outline-none transition-shadow',
              'focus:border-violet-400/80 focus:ring-2 focus:ring-violet-500/15 dark:focus:border-violet-500/50 dark:focus:ring-violet-500/20',
            )}
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className={classNames(
              'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-all',
              inputValue.trim()
                ? 'bg-violet-600 text-white shadow-md shadow-violet-900/15 hover:bg-violet-700 active:scale-[0.98]'
                : 'cursor-not-allowed bg-migratex-elements-background-depth-3 text-migratex-elements-textTertiary',
            )}
            aria-label="Send message"
          >
            <span className="i-ph:paper-plane-tilt text-lg" />
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-migratex-elements-textTertiary">
          <kbd className="rounded border border-migratex-elements-borderColor/60 bg-migratex-elements-background-depth-2 px-1 py-px font-mono text-[9px]">
            Enter
          </kbd>{' '}
          send ·{' '}
          <kbd className="rounded border border-migratex-elements-borderColor/60 bg-migratex-elements-background-depth-2 px-1 py-px font-mono text-[9px]">
            Shift+Enter
          </kbd>{' '}
          newline
        </p>
      </div>
    </div>
  );
});
