import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Select } from '~/components/ui/Select';
import { classNames } from '~/utils/classNames';
import type { ChatMessageData, UrlSubmitPayload } from '~/components/chat/types';
import { ChatMessage } from './ChatMessage';

const PAGE_LIMIT_OPTIONS = [5, 10] as const;
const MIN_SPECIFIC = 1;
const MAX_SPECIFIC = 10;

interface UrlInputChatProps {
  onSubmit: (payload: UrlSubmitPayload) => void;
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();

  if (!t) {
    return '';
  }

  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function validateUrl(url: string): boolean {
  try {
    new URL(url);

    return true;
  } catch {
    return false;
  }
}

export const UrlInputChat: React.FC<UrlInputChatProps> = ({ onSubmit }) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([
    {
      role: 'assistant',
      content:
        "Welcome. Enter your site's **main URL** below, then choose whether we should **discover pages automatically** or **only crawl URLs you list**.",
      timestamp: new Date(),
      animate: true,
    },
  ]);
  const [urlInput, setUrlInput] = useState('');
  const [projectName, setProjectName] = useState('');
  const [maxPages, setMaxPages] = useState<number>(10);
  const [scopeMode, setScopeMode] = useState<'full' | 'specific'>('full');
  const [specificCount, setSpecificCount] = useState(3);
  const [specificUrls, setSpecificUrls] = useState<string[]>(['', '', '']);
  const [isValidPrimary, setIsValidPrimary] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const firstSpecificRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (scopeMode !== 'specific') {
      return;
    }

    setSpecificUrls((prev) => {
      const next = [...prev];

      while (next.length < specificCount) {
        next.push('');
      }

      return next.slice(0, specificCount);
    });
  }, [specificCount, scopeMode]);

  useEffect(() => {
    if (scopeMode === 'specific') {
      queueMicrotask(() => firstSpecificRef.current?.focus());
    }
  }, [scopeMode]);

  const handleAnimationComplete = (index: number) => {
    setMessages((prev) => prev.map((msg, i) => (i === index ? { ...msg, animate: false } : msg)));
  };

  const setSpecificSlot = useCallback((index: number, value: string) => {
    setSpecificUrls((prev) => {
      const next = [...prev];
      next[index] = value;

      return next;
    });
    setFormError(null);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const primary = normalizeUrl(urlInput);

    if (!primary) {
      setIsValidPrimary(false);

      return;
    }

    if (!validateUrl(primary)) {
      setIsValidPrimary(false);

      return;
    }

    setIsValidPrimary(true);

    const trimmedProjectName = projectName.trim();
    if (!trimmedProjectName) {
      setFormError('Enter a project name so this migration is easy to find later.');

      return;
    }

    let selectUrls: string[] = [];

    if (scopeMode === 'specific') {
      const normalizedList = specificUrls.slice(0, specificCount).map((s) => normalizeUrl(s));

      if (normalizedList.some((u) => !u.trim())) {
        setFormError('Enter every URL, or reduce the number of slots.');

        return;
      }

      if (normalizedList.some((u) => !validateUrl(u))) {
        setFormError('One or more URLs are invalid. Include a valid path (e.g. https://example.com/page).');

        return;
      }

      selectUrls = normalizedList;
    }

    const specificPagesWord = selectUrls.length === 1 ? 'page' : 'pages';
    const summary =
      scopeMode === 'specific'
        ? `Perfect. I'll queue **${selectUrls.length}** specific ${specificPagesWord} for **${primary}**, then continue to stack setup.`
        : `Great! I'll crawl **${primary}** (up to **${maxPages}** linked pages). Next, you'll connect your Contentstack stack.`;

    setMessages((prev) => [...prev, { role: 'user', content: primary, timestamp: new Date() }]);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: summary,
          timestamp: new Date(),
          animate: true,
        },
      ]);

      setTimeout(() => {
        onSubmit({
          url: primary,
          projectName: trimmedProjectName,
          maxPages,
          selectUrls,
        });
      }, 2200);
    }, 400);
  };

  const canSubmit =
    urlInput.trim() &&
    projectName.trim() &&
    (scopeMode === 'full' ||
      (specificUrls.slice(0, specificCount).every((s) => s.trim()) && specificCount >= MIN_SPECIFIC));

  return (
    <div className="flex h-full min-h-0 w-full flex-col md:flex-row">
      {/* Left: chat */}
      <aside className="flex min-h-[200px] flex-col border-slate-200/80 bg-[#e8ecf2] md:min-h-0 md:flex-[0_0_40%] md:max-w-none md:shrink-0 md:border-r">
        <div className="flex-shrink-0 border-b border-slate-200/70 bg-[#e0e5ee]/80 px-4 py-3 md:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assistant</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5 md:py-5">
          <div className="space-y-5">
            {messages.map((msg, index) => (
              <ChatMessage
                key={`msg-${msg.role}-${index}`}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                animate={msg.animate && msg.role === 'assistant'}
                onAnimationComplete={() => handleAnimationComplete(index)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </aside>

      {/* Right: form — scrolls independently; URL list uses remaining height */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f0f2f6] md:flex-[0_0_60%]">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col p-4 pb-5 md:p-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-migratex-elements-borderColor bg-white shadow-sm">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
                  <div className="flex-shrink-0">
                    <h2 className="text-sm font-semibold text-migratex-elements-textPrimary tracking-tight">
                      Website & crawl scope
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-migratex-elements-textSecondary">
                      The main URL is your site entry point. Optional: restrict crawling to an explicit list of pages.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="migratex-project-name"
                      className="text-xs font-medium text-migratex-elements-textSecondary"
                    >
                      Project name
                    </label>
                    <div
                      className={classNames(
                        'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 transition-colors shadow-sm',
                        'bg-migratex-elements-background-depth-1/50',
                        'border-migratex-elements-borderColor focus-within:border-violet-400/80 focus-within:ring-2 focus-within:ring-violet-500/20',
                      )}
                    >
                      <span
                        className="i-ph:folder-simple text-lg text-migratex-elements-textTertiary shrink-0"
                        aria-hidden
                      />
                      <input
                        id="migratex-project-name"
                        type="text"
                        value={projectName}
                        onChange={(e) => {
                          setProjectName(e.target.value);
                          setFormError(null);
                        }}
                        placeholder="My migration"
                        maxLength={120}
                        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-migratex-elements-textPrimary placeholder:text-migratex-elements-textTertiary"
                        autoComplete="off"
                      />
                    </div>
                    <p className="text-[11px] text-migratex-elements-textTertiary">
                      A short label for this migration — saved with the job for easy reference.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="migratex-primary-url"
                      className="text-xs font-medium text-migratex-elements-textSecondary"
                    >
                      Main site URL
                    </label>
                    <div
                      className={classNames(
                        'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 transition-colors shadow-sm',
                        'bg-migratex-elements-background-depth-1/50',
                        !isValidPrimary && urlInput.trim()
                          ? 'border-red-300 focus-within:border-red-400'
                          : 'border-migratex-elements-borderColor focus-within:border-violet-400/80 focus-within:ring-2 focus-within:ring-violet-500/20',
                      )}
                    >
                      <span className="i-ph:link text-lg text-migratex-elements-textTertiary shrink-0" aria-hidden />
                      <input
                        id="migratex-primary-url"
                        type="text"
                        value={urlInput}
                        onChange={(e) => {
                          setUrlInput(e.target.value);
                          setIsValidPrimary(true);
                          setFormError(null);
                        }}
                        placeholder="https://www.example.com"
                        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-migratex-elements-textPrimary placeholder:text-migratex-elements-textTertiary"
                        autoComplete="url"
                        autoFocus
                      />
                    </div>
                    {!isValidPrimary && urlInput.trim() ? (
                      <p className="text-xs text-red-600">Enter a valid URL (include domain).</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-medium text-migratex-elements-textSecondary">Crawl scope</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setScopeMode('full');
                          setFormError(null);
                        }}
                        className={classNames(
                          'rounded-xl border px-4 py-3 text-left transition-all text-sm',
                          scopeMode === 'full'
                            ? 'border-violet-500 bg-violet-50/90 text-migratex-elements-textPrimary ring-1 ring-violet-500/25'
                            : 'border-migratex-elements-borderColor bg-white hover:border-violet-200 text-migratex-elements-textSecondary',
                        )}
                      >
                        <span className="font-semibold text-migratex-elements-textPrimary block">Full site</span>
                        <span className="text-xs text-migratex-elements-textSecondary mt-0.5 block leading-snug">
                          Follow links up to your page limit
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setScopeMode('specific');
                          setFormError(null);
                        }}
                        className={classNames(
                          'rounded-xl border px-4 py-3 text-left transition-all text-sm',
                          scopeMode === 'specific'
                            ? 'border-violet-500 bg-violet-50/90 text-migratex-elements-textPrimary ring-1 ring-violet-500/25'
                            : 'border-migratex-elements-borderColor bg-white hover:border-violet-200 text-migratex-elements-textSecondary',
                        )}
                      >
                        <span className="font-semibold text-migratex-elements-textPrimary block">Specific URLs</span>
                        <span className="text-xs text-migratex-elements-textSecondary mt-0.5 block leading-snug">
                          Only the pages you list below
                        </span>
                      </button>
                    </div>
                  </div>

                  {scopeMode === 'full' ? (
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
                      <label
                        htmlFor="migratex-page-limit"
                        className="text-xs font-medium text-migratex-elements-textSecondary"
                      >
                        Max pages to discover
                      </label>
                      <Select
                        id="migratex-page-limit"
                        value={String(maxPages)}
                        onChange={(e) => setMaxPages(Number(e.target.value))}
                        fullWidth={false}
                        className="min-w-[7.5rem] shrink-0"
                        options={PAGE_LIMIT_OPTIONS.map((n) => ({ value: String(n), label: `${n} pages` }))}
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-[180px] min-w-0 flex-1 flex-col gap-3 border-t border-migratex-elements-borderColor/50 pt-4 md:min-h-[220px]">
                      <div className="flex flex-shrink-0 flex-wrap items-end gap-4">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="migratex-url-count"
                            className="text-xs font-medium text-migratex-elements-textSecondary mr-2 mb-2"
                          >
                            How many URLs?
                          </label>
                          <input
                            id="migratex-url-count"
                            type="number"
                            min={MIN_SPECIFIC}
                            max={MAX_SPECIFIC}
                            value={specificCount}
                            onChange={(e) => {
                              const n = Number.parseInt(e.target.value, 10);

                              if (Number.isNaN(n)) {
                                return;
                              }

                              setSpecificCount(Math.min(MAX_SPECIFIC, Math.max(MIN_SPECIFIC, n)));
                              setFormError(null);
                            }}
                            className="w-24 rounded-lg border border-migratex-elements-borderColor bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/35"
                          />
                        </div>
                        <p className="max-w-md pb-1 text-[11px] leading-relaxed text-migratex-elements-textTertiary">
                          Use full page addresses (https and path). Only these pages will be queued for migration.
                        </p>
                      </div>

                      <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1">
                        {Array.from({ length: specificCount }, (_, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="w-8 shrink-0 pt-2.5 text-[11px] font-medium tabular-nums text-migratex-elements-textTertiary">
                              {i + 1}.
                            </span>
                            <input
                              ref={i === 0 ? firstSpecificRef : undefined}
                              type="text"
                              value={specificUrls[i] ?? ''}
                              onChange={(e) => setSpecificSlot(i, e.target.value)}
                              placeholder={`Page URL ${i + 1}`}
                              className="min-w-0 flex-1 rounded-lg border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1/30 px-3 py-2 text-sm text-migratex-elements-textPrimary placeholder:text-migratex-elements-textTertiary focus:border-violet-400/60 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                              autoComplete="off"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
                </div>
              </div>

              <div className="flex-shrink-0 border-t border-migratex-elements-borderColor/70 bg-migratex-elements-background-depth-1/40 p-4 sm:p-5">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={classNames(
                    'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
                    canSubmit
                      ? 'bg-violet-600 text-white shadow-sm hover:bg-violet-700'
                      : 'cursor-not-allowed bg-migratex-elements-background-depth-2 text-migratex-elements-textTertiary',
                  )}
                >
                  Continue to stack setup
                  <span className="i-ph:arrow-right-bold text-base" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
