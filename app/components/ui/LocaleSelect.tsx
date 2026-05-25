/**
 * LocaleSelect — a searchable, accessible locale picker for the
 * "Create stack" modal.
 *
 * Architecture:
 *   LocaleSelect (this file)  — pure presentation
 *   useLocales hook           — data / loading state
 *   localeService             — fetch + two-tier cache
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '~/utils/classNames';
import type { UseLocalesResult } from '~/lib/hooks/useLocales';

// ── Shared style primitives (mirrors Select.tsx) ──────────────────────────────

const triggerBase =
  'inline-flex w-full items-center justify-between gap-2 rounded-lg border text-left ' +
  'text-migratex-elements-textPrimary transition focus:outline-none focus:ring-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 px-3 py-2 text-sm';

const triggerDefault =
  'border-migratex-elements-borderColor bg-white ' + 'focus:ring-violet-500/40 focus:border-violet-500/80';

const triggerError = 'border-red-300 bg-red-50 text-red-700';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocaleSelectProps {
  /** Currently selected locale code, e.g. "en-us". */
  value: string;
  onChange: (value: string) => void;
  /** Pass the same `UseLocalesResult` returned by `useLocales()`. */
  localesResult: UseLocalesResult;
  disabled?: boolean;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LocaleSelect({ value, onChange, localesResult, disabled, className }: LocaleSelectProps) {
  const { options, status, error, retry } = localesResult;

  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isDisabled = disabled || isLoading;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const listId = useId();

  // ── Display label ───────────────────────────────────────────────────────────

  const selected = options.find((o) => o.value === value);
  const displayLabel = isLoading
    ? 'Loading locales…'
    : isError
      ? 'Could not load locales'
      : (selected?.label ?? (value || 'Select master locale'));

  // ── Filtered options ────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
    : options;

  // ── Open / close helpers ────────────────────────────────────────────────────

  const measureButton = useCallback(() => {
    const btn = buttonRef.current;

    if (!btn) {
      return;
    }

    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const preferredHeight = 300;

    setRect({
      top: spaceBelow > preferredHeight + 8 ? r.bottom + 4 : r.top - preferredHeight - 4,
      left: r.left,
      width: r.width,
    });
  }, []);

  const openMenu = useCallback(() => {
    if (isDisabled) {
      return;
    }

    measureButton();
    setOpen(true);
    // Defer so the portal renders before we try to focus the input
    setTimeout(() => searchRef.current?.focus(), 30);
  }, [isDisabled, measureButton]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
    setRect(null);
  }, []);

  // ── Keep dropdown anchored while open ───────────────────────────────────────

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const update = () => measureButton();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, measureButton]);

  // ── Close on outside click / Escape ────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      return;
    }

    const onMouse = (e: MouseEvent) => {
      const t = e.target as Node;

      if (!rootRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        close();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} className={classNames('relative w-full', className)}>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={isDisabled && !isError}
        onClick={() => (open ? close() : openMenu())}
        className={classNames(triggerBase, isError ? triggerError : triggerDefault)}
      >
        {/* Left content */}
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {isLoading && (
            <span
              className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-violet-500 border-t-transparent"
              aria-hidden
            />
          )}
          {isError && <span className="i-ph:warning-circle shrink-0 text-base text-red-500" aria-hidden />}
          <span className={classNames('truncate', isLoading && 'text-migratex-elements-textTertiary')}>
            {displayLabel}
          </span>
        </span>

        {/* Right: retry or caret */}
        {isError ? (
          <span
            role="button"
            tabIndex={0}
            className="ml-1 shrink-0 text-xs font-medium text-violet-600 underline focus:outline-none"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              retry();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') retry();
            }}
          >
            Retry
          </span>
        ) : (
          <span
            className={classNames(
              'i-ph:caret-down shrink-0 text-base text-migratex-elements-textTertiary transition-transform duration-200',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        )}
      </button>

      {/* Portal dropdown */}
      {open && rect && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={dropRef}
              // Tagged so a surrounding Radix Dialog can recognise pointer
              // events that happen inside this portal and skip its
              // "click outside → close dialog" behaviour. Without this the
              // dialog closes the moment the user clicks an option and the
              // option's onClick never gets a chance to fire.
              data-locale-dropdown=""
              // Belt-and-braces: stop pointer/mouse events from bubbling out
              // of the dropdown's portal. Radix DismissableLayer listens at
              // document level, so React's stopPropagation alone isn't enough
              // — we also stopImmediatePropagation on the native event so
              // any document-level capture listeners get bypassed.
              onPointerDownCapture={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              onMouseDownCapture={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              style={{
                position: 'fixed',
                top: rect.top,
                left: rect.left,
                width: rect.width,
                zIndex: 320,
                pointerEvents: 'auto',
              }}
              className="flex flex-col overflow-hidden rounded-xl border border-migratex-elements-borderColor bg-white shadow-xl shadow-black/10 ring-1 ring-black/5"
            >
              {/* Search bar */}
              <div className="flex items-center gap-2 border-b border-migratex-elements-borderColor/60 px-3 py-2.5">
                <span
                  className="i-ph:magnifying-glass shrink-0 text-sm text-migratex-elements-textTertiary"
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search locales…"
                  aria-label="Search locales"
                  className="flex-1 bg-transparent text-sm text-migratex-elements-textPrimary placeholder:text-migratex-elements-textTertiary focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                    className="shrink-0 text-migratex-elements-textTertiary transition-colors hover:text-migratex-elements-textPrimary"
                  >
                    <span className="i-ph:x text-sm" aria-hidden />
                  </button>
                )}
              </div>

              {/* Option list */}
              <ul id={listId} role="listbox" aria-label="Locales" className="max-h-56 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-center text-sm text-migratex-elements-textTertiary">
                    No locales match <em>"{search}"</em>
                  </li>
                ) : (
                  filtered.map((opt) => {
                    const isSel = opt.value === value;

                    return (
                      <li
                        key={opt.value}
                        role="option"
                        aria-selected={isSel}
                        className={classNames(
                          'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm transition-colors',
                          isSel
                            ? 'bg-violet-50 font-medium text-violet-900'
                            : 'text-migratex-elements-textPrimary hover:bg-migratex-elements-background-depth-2',
                        )}
                        // Run the selection on mousedown rather than click.
                        // When this dropdown lives inside a Radix Dialog (modal),
                        // Radix's DismissableLayer intercepts pointerdown to
                        // detect outside clicks — the dialog can close fast
                        // enough that the synthesised pointerdown → click
                        // sequence never reaches this <li>. Acting on mousedown
                        // sidesteps the race entirely.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onChange(opt.value);
                          close();
                        }}
                        // Click is a safety net for keyboard / assistive
                        // technologies that synthesise click without firing
                        // mousedown first.
                        onClick={(e) => {
                          e.preventDefault();
                          if (opt.value !== value) {
                            onChange(opt.value);
                          }
                          close();
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                        <span className="shrink-0 font-mono text-[11px] text-migratex-elements-textTertiary">
                          {opt.value}
                        </span>
                        {isSel && <span className="i-ph:check shrink-0 text-sm text-violet-600" aria-hidden />}
                      </li>
                    );
                  })
                )}
              </ul>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-migratex-elements-borderColor/60 px-3 py-1.5">
                <span className="text-[11px] text-migratex-elements-textTertiary">
                  {filtered.length} {filtered.length === 1 ? 'locale' : 'locales'}
                  {search && ` for "${search}"`}
                </span>
                {value && (
                  <span className="text-[11px] text-migratex-elements-textTertiary">
                    Selected: <span className="font-mono font-medium text-violet-600">{value}</span>
                  </span>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
