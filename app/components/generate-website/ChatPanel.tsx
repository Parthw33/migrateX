/**
 * ChatPanel.tsx — workbench assistant pane on /:jobId/generate-website.
 *
 * Built on:
 *   • Vercel AI SDK (`@ai-sdk/react` useChat) — streams Anthropic responses from
 *     POST /api/workbench-assistant.
 *   • assistant-ui (`@assistant-ui/react` + `@assistant-ui/react-ai-sdk`) — Thread
 *     + Composer primitives, runtime adapter that wraps useChat.
 *   • shadcn-style UI primitives in app/components/ui — Card, ScrollArea, Button,
 *     Textarea.
 *   • streamdown for live Markdown rendering of streaming assistant messages.
 *
 * Pipeline events from the existing stores (file-activity, status messages,
 * AI updates emitted by useWebsiteJobPoller / useGenerationChatBridge) are
 * mirrored into the chat as *assistant* messages via runtime.append, so users
 * see one unified conversation instead of two parallel feeds.
 */

import { memo, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useStore } from '@nanostores/react';
import { useChat } from '@ai-sdk/react';
import { toast } from 'react-toastify';
import { Streamdown } from 'streamdown';
import { ArrowUp, FilePlus, FolderSync, Globe, ListChecks, RefreshCw, Sparkles } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Textarea } from '~/components/ui/textarea';

import { authStore } from '~/lib/stores/auth';
import { websiteChatStore, websiteChat, type ChatMessage } from '~/lib/stores/websiteChat';
import { workbenchStore } from '~/lib/stores/workbench';
import { lambdaWebsiteStart } from '~/lib/lambdaApi';
import { getScrapeJobId } from '~/lib/scrapeJobSession';
import {
  getWebsiteGenerationSession,
  requestWebsiteLiveFilesSync,
  setWebsiteGenerationSession,
} from '~/lib/websiteGenerationSession';
import type { WebsiteGenerationStatus } from '~/lib/hooks/useWebsiteLiveGenerationPoll';
import { migrationStore } from '~/lib/stores/migration';
import { WORK_DIR } from '~/utils/constants';
import { cn } from '~/lib/utils';

/* ─────────────────────────────────────────────────────────────────────────── */

interface ChatPanelProps {
  generationStatus: WebsiteGenerationStatus | null;
}

type PromptIntent = 'retry-website-creation' | 'get-all-files' | null;

function detectPromptIntent(input: string): PromptIntent {
  const n = input.toLowerCase().replace(/\s+/g, ' ').trim();
  const wantsRetry = n.includes('retry');
  const mentionsWebsite =
    (n.includes('website') || n.includes('site')) &&
    (n.includes('creation') || n.includes('create') || n.includes('generation'));
  if (wantsRetry && mentionsWebsite) return 'retry-website-creation';
  if (n.includes('get all files') || n.includes('fetch all files') || n.includes('sync all files'))
    return 'get-all-files';
  return null;
}

/* ─── Pipeline event tiles ─────────────────────────────────────────────────── */

function FileActivityRow({ msg }: { msg: ChatMessage }) {
  return (
    <div className="px-3 py-1">
      <div className="group flex items-center gap-2.5 rounded-lg border border-migratex-elements-borderColor/60 bg-migratex-elements-background-depth-2 px-2.5 py-1.5 shadow-sm transition-colors hover:border-migratex-elements-borderColor">
        <FilePlus className="size-4 shrink-0 text-emerald-500" aria-hidden />
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] leading-snug text-migratex-elements-textSecondary group-hover:text-migratex-elements-textPrimary">
          {msg.filePath}
        </code>
        <span className="shrink-0 rounded-md border border-emerald-200/80 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/55 dark:text-emerald-200">
          {msg.fileAction ?? 'created'}
        </span>
      </div>
    </div>
  );
}

function StatusRow({ msg }: { msg: ChatMessage }) {
  const tone = msg.statusType ?? 'info';
  const ringByTone: Record<string, string> = {
    info: 'border-sky-200/70 bg-sky-50/60 dark:border-sky-800/70 dark:bg-sky-950/40',
    success: 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-800/70 dark:bg-emerald-950/40',
    error: 'border-red-200/80 bg-red-50/70 dark:border-red-800/80 dark:bg-red-950/45',
    warning: 'border-amber-200/70 bg-amber-50/60 dark:border-amber-800/70 dark:bg-amber-950/40',
  };
  return (
    <div className="px-3 py-1">
      <div className={cn('rounded-lg border px-3 py-2 text-[12px] leading-relaxed shadow-sm', ringByTone[tone])}>
        {msg.content}
      </div>
    </div>
  );
}

function PipelineMessageRow({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'file-activity') return <FileActivityRow msg={msg} />;
  if (msg.role === 'status') return <StatusRow msg={msg} />;
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center px-3 py-1">
        <span className="max-w-[95%] rounded-full border border-migratex-elements-borderColor/60 bg-migratex-elements-background-depth-2/90 px-3 py-1 text-center text-[11px] font-medium text-migratex-elements-textSecondary">
          {msg.content}
        </span>
      </div>
    );
  }
  // AI / user pipeline messages — render with Streamdown for Markdown.
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex min-w-0 gap-2.5 px-3 py-1.5', isUser && 'justify-end')}>
      {!isUser && (
        <div
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10"
          aria-hidden
        >
          <Sparkles className="size-3.5" />
        </div>
      )}
      <div
        className={cn(
          'min-w-0 max-w-[88%] rounded-xl px-3 py-2 text-[13px] leading-relaxed shadow-sm',
          isUser
            ? 'rounded-tr-md bg-violet-600 text-white'
            : 'rounded-tl-sm border border-migratex-elements-borderColor/70 bg-migratex-elements-background-depth-2 text-migratex-elements-textPrimary dark:bg-[#161b22]',
        )}
      >
        <Streamdown
          className={cn(
            'prose prose-sm max-w-none break-words [overflow-wrap:anywhere]',
            isUser ? 'prose-invert' : 'dark:prose-invert',
          )}
        >
          {msg.content}
        </Streamdown>
      </div>
    </div>
  );
}

/* ─── Streaming AI message bubble (Vercel AI SDK) ──────────────────────────── */

interface UseChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'data';
  content: string;
}

function StreamingMessage({ msg }: { msg: UseChatMessage }) {
  if (msg.role === 'system' || msg.role === 'data') return null;
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex min-w-0 gap-2.5 px-3 py-1.5', isUser && 'justify-end')}>
      {!isUser && (
        <div
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-sm ring-1 ring-black/5"
          aria-hidden
        >
          <Sparkles className="size-3.5" />
        </div>
      )}
      <div
        className={cn(
          'min-w-0 max-w-[88%] rounded-xl px-3 py-2 text-[13px] leading-relaxed shadow-sm',
          isUser
            ? 'rounded-tr-md bg-violet-600 text-white'
            : 'rounded-tl-sm border border-migratex-elements-borderColor/70 bg-migratex-elements-background-depth-2 text-migratex-elements-textPrimary dark:bg-[#161b22]',
        )}
      >
        <Streamdown
          className={cn(
            'prose prose-sm max-w-none break-words [overflow-wrap:anywhere]',
            isUser ? 'prose-invert' : 'dark:prose-invert',
          )}
        >
          {msg.content}
        </Streamdown>
      </div>
    </div>
  );
}

/* ─── Progress strip ───────────────────────────────────────────────────────── */

function ProgressStrip({
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
  if (!isActive && combined === 0) return null;

  const indeterminate = isActive && combined === 0;
  const displayLabel = label || (activePhase === 'done' ? 'Complete' : 'Processing…');

  return (
    <div className="flex-shrink-0 border-b border-migratex-elements-borderColor/50 bg-gradient-to-b from-migratex-elements-background-depth-1 to-migratex-elements-background-depth-2 px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-migratex-elements-textSecondary">
          {displayLabel}
        </span>
        <span className="shrink-0 tabular-nums text-[11px] font-semibold text-violet-700 dark:text-violet-300">
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

/* ─── Empty state ──────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 shadow-inner ring-1 ring-violet-200/60 dark:from-violet-950/80 dark:to-[#0d1117] dark:ring-violet-800/50">
        <Globe className="size-7 text-violet-600 dark:text-violet-400" />
      </div>
      <div className="max-w-[260px] space-y-1">
        <p className="text-sm font-semibold tracking-tight text-migratex-elements-textPrimary">
          Workbench assistant
        </p>
        <p className="text-[12px] leading-relaxed text-migratex-elements-textSecondary">
          Pipeline updates land here automatically. Ask a follow-up question and the assistant will answer in
          context.
        </p>
      </div>
    </div>
  );
}

/* ─── Quick-action chips ───────────────────────────────────────────────────── */

function QuickActions({ onPick }: { onPick: (text: string) => void }) {
  const actions: Array<{ icon: React.ReactNode; label: string; prompt: string }> = [
    { icon: <RefreshCw className="size-3" />, label: 'Sync now', prompt: 'sync all files' },
    { icon: <ListChecks className="size-3" />, label: 'Status', prompt: 'What is the current pipeline status?' },
    { icon: <FolderSync className="size-3" />, label: 'Retry', prompt: 'retry website creation' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => onPick(a.prompt)}
          className="inline-flex items-center gap-1 rounded-full border border-migratex-elements-borderColor/70 bg-migratex-elements-background-depth-2/70 px-2.5 py-1 text-[11px] font-medium text-migratex-elements-textSecondary transition hover:border-violet-300/70 hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/40 dark:hover:text-violet-200"
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Main export ──────────────────────────────────────────────────────────── */

export const ChatPanel = memo(({ generationStatus }: ChatPanelProps) => {
  const chatState = useStore(websiteChatStore);
  const appToken = useStore(authStore).appToken;
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Live workbench context the assistant should reason against. */
  const assistantContext = useMemo(() => {
    const files = workbenchStore.files.get();
    const fileEntries = Object.entries(files)
      .filter(([, d]) => d?.type === 'file')
      .map(([p]) => p.startsWith(WORK_DIR + '/') ? p.slice(WORK_DIR.length + 1) : p);
    return {
      jobId: chatState.watchingJobId ?? getScrapeJobId() ?? undefined,
      websiteUrl: chatState.websiteUrl ?? migrationStore.get().websiteUrl ?? undefined,
      projectName: migrationStore.get().projectName || undefined,
      fileCount: fileEntries.length,
      phase: generationStatus?.phase ?? chatState.phase,
      websiteStatus: chatState.websiteStatus ?? undefined,
      latestPipelineMessage: chatState.phaseLabel || chatState.websiteMessage || undefined,
      recentFiles: fileEntries.slice(-20),
    };
  }, [
    chatState.watchingJobId,
    chatState.websiteUrl,
    chatState.phase,
    chatState.phaseLabel,
    chatState.websiteStatus,
    chatState.websiteMessage,
    generationStatus?.phase,
  ]);

  const { messages: aiMessages, input, setInput, handleSubmit, isLoading } = useChat({
    api: '/api/workbench-assistant',
    body: { data: assistantContext },
  });

  /* Auto-scroll on any new message — pipeline OR streaming. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatState.messages.length, aiMessages.length, chatState.isTyping, isLoading]);

  /* Toast new AI errors / successes from the pipeline feed (unchanged behavior). */
  const lastToastedCountRef = useRef<number | null>(null);
  useEffect(() => {
    const msgs = chatState.messages;
    if (lastToastedCountRef.current === null) {
      lastToastedCountRef.current = msgs.length;
      return;
    }
    const next = msgs.slice(lastToastedCountRef.current);
    lastToastedCountRef.current = msgs.length;
    for (const m of next) {
      if (m.role === 'status') {
        if (m.statusType === 'error') toast.error(m.content, { toastId: `chat-${m.id}` });
        else if (m.statusType === 'success') toast.success(m.content, { toastId: `chat-${m.id}` });
      }
    }
  }, [chatState.messages.length]);

  const sendQuickAction = async (text: string) => {
    const intent = detectPromptIntent(text);

    websiteChat.addMessage({ role: 'user', content: text });

    if (intent === 'retry-website-creation') {
      const jobId =
        chatState.watchingJobId?.trim() ||
        getWebsiteGenerationSession()?.jobId?.trim() ||
        getScrapeJobId()?.trim() ||
        '';
      if (!appToken) {
        websiteChat.addStatus('Sign in is required to retry website creation.', 'error');
        return;
      }
      if (!jobId) {
        websiteChat.addStatus('Missing job id. Open the migration job and try again.', 'error');
        return;
      }
      websiteChat.setTyping(true);
      try {
        websiteChat.addAI('🔄 Retrying website creation and reconnecting live progress…');
        const { jobId: newJobId } = await lambdaWebsiteStart(appToken, { jobId });
        const existing = getWebsiteGenerationSession();
        setWebsiteGenerationSession({
          jobId: newJobId,
          url: existing?.url ?? '',
          cs_stack_api_key: existing?.cs_stack_api_key ?? '',
          cs_org_id: existing?.cs_org_id ?? '',
          cs_region: existing?.cs_region ?? '',
          s3WebsitePrefix: existing?.s3WebsitePrefix ?? '',
          startedAt: new Date().toISOString(),
        });
        workbenchStore.resetFilesForNewWebsiteSession();
        websiteChat.setJobId(newJobId);
        websiteChat.setPhase('connecting', 'Connecting to generation pipeline…', 0);
        websiteChat.addStatus(`Website generation restarted for job ${newJobId}.`, 'success');
      } catch (err) {
        const m = err instanceof Error ? err.message : 'Failed to restart website creation';
        websiteChat.addStatus(`❌ ${m}`, 'error');
        toast.error(m);
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

    /* Anything else → send to the AI. */
    setInput(text);
    // Trigger the form submission programmatically — handleSubmit needs an event,
    // so we synthesize a minimal one.
    queueMicrotask(() => {
      handleSubmit(new Event('submit') as unknown as FormEvent);
    });
  };

  const onComposerSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    const intent = detectPromptIntent(text);
    if (intent) {
      setInput('');
      void sendQuickAction(text);
      return;
    }
    websiteChat.addMessage({ role: 'user', content: text });
    handleSubmit(e as FormEvent);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onComposerSubmit();
    }
  };

  const totalUpdates = chatState.messages.length + aiMessages.length;
  const hasAnyContent = totalUpdates > 0;

  return (
    <Card className="flex h-full w-full flex-col overflow-hidden rounded-none border-0 border-r border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 shadow-none">
      {/* Header */}
      <CardHeader className="flex-shrink-0 flex-row items-center justify-between gap-2 border-b border-migratex-elements-borderColor/60 bg-migratex-elements-background-depth-1/95 px-3 py-2 backdrop-blur-sm">
        <div className="min-w-0">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-migratex-elements-textSecondary">
            Assistant
          </CardTitle>
          <p className="truncate text-[10px] text-migratex-elements-textTertiary">
            Pipeline status · file activity · ask follow-ups
          </p>
        </div>
        {totalUpdates > 0 && (
          <span className="rounded-full bg-migratex-elements-background-depth-2 px-2 py-0.5 text-[10px] font-medium tabular-nums text-migratex-elements-textSecondary">
            {totalUpdates} updates
          </span>
        )}
      </CardHeader>

      <ProgressStrip
        progress={chatState.progress}
        phase={chatState.phase}
        label={chatState.phaseLabel}
        genProgress={generationStatus?.progress ?? 0}
        genPhase={generationStatus?.phase ?? 'idle'}
      />

      {/* Thread */}
      <ScrollArea className="min-h-0 min-w-0 flex-1" ref={scrollRef as React.Ref<HTMLDivElement>}>
        {!hasAnyContent ? (
          <EmptyState />
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5 py-2">
            {/* Pipeline feed (file activities, statuses, AI messages from useGenerationChatBridge). */}
            {chatState.messages.map((m) => (
              <PipelineMessageRow key={m.id} msg={m} />
            ))}

            {/* Streaming AI conversation. */}
            {aiMessages.map((m) => (
              <StreamingMessage key={m.id} msg={m as unknown as UseChatMessage} />
            ))}

            {isLoading && (
              <div className="px-3 py-1.5">
                <span className="inline-flex items-center gap-2 rounded-full border border-migratex-elements-borderColor/70 bg-migratex-elements-background-depth-2/80 px-3 py-1 text-[11px] font-medium text-migratex-elements-textSecondary">
                  <span className="relative inline-flex size-1.5 rounded-full bg-violet-500">
                    <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/70" />
                  </span>
                  Thinking…
                </span>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Composer */}
      <CardContent className="flex-shrink-0 border-t border-migratex-elements-borderColor/80 bg-migratex-elements-background-depth-1 p-3">
        <QuickActions onPick={sendQuickAction} />
        <form onSubmit={onComposerSubmit} className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask the workbench assistant…"
            rows={1}
            className="max-h-28 flex-1 resize-none"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="size-11 shrink-0 rounded-xl"
            aria-label="Send message"
          >
            <ArrowUp className="size-4" />
          </Button>
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
      </CardContent>
    </Card>
  );
});

ChatPanel.displayName = 'ChatPanel';
