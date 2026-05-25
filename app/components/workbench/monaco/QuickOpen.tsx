/**
 * VSCode-style Quick Open palette. Two modes share the same shell:
 *
 *   • file mode (Cmd/Ctrl+P): fuzzy-search file paths in workbenchStore.files
 *   • command mode (Cmd/Ctrl+Shift+P): a tiny registry of named commands
 *
 * The palette is portal-mounted to document.body, lives above any overlays,
 * and dismisses on Esc / outside-click. Keyboard nav: ↑/↓ to move, Enter to
 * pick.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import { File as FileIcon, Search, Command as CommandIcon } from 'lucide-react';
import { workbenchStore } from '~/lib/stores/workbench';
import { editorTabs } from '~/lib/stores/editorTabs';
import { WORK_DIR } from '~/utils/constants';
import { cn } from '~/lib/utils';

export type QuickOpenMode = 'file' | 'command';

interface QuickOpenCommand {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  action: () => void;
}

interface QuickOpenProps {
  mode: QuickOpenMode;
  onClose: () => void;
  commands?: QuickOpenCommand[];
}

function basename(path: string): string {
  return path.split('/').pop() || path;
}

function relativeFolder(path: string): string {
  const stripped = path.startsWith(WORK_DIR + '/') ? path.slice(WORK_DIR.length + 1) : path;
  const parts = stripped.split('/');
  parts.pop();
  return parts.join('/') || '';
}

/** Cheap fuzzy: every character of `q` must appear in `t` in order. */
function fuzzyMatch(q: string, t: string): boolean {
  if (!q) return true;
  let i = 0;
  for (const ch of t.toLowerCase()) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export const QuickOpen = memo(function QuickOpen({ mode, onClose, commands = [] }: QuickOpenProps) {
  const files = useStore(workbenchStore.files);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus the search input on open.
  useEffect(() => {
    inputRef.current?.focus();
    setActive(0);
  }, [mode]);

  // Close on Esc / outside click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* ── File mode ───────────────────────────────────────────────────────── */

  const filePaths = useMemo(() => {
    const out: string[] = [];
    for (const [p, d] of Object.entries(files)) {
      if (d?.type === 'file') out.push(p);
    }
    return out;
  }, [files]);

  const fileMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filePaths.slice(0, 50);
    return filePaths
      .filter((p) => {
        const rel = p.startsWith(WORK_DIR + '/') ? p.slice(WORK_DIR.length + 1) : p;
        return fuzzyMatch(q, rel) || rel.toLowerCase().includes(q);
      })
      .slice(0, 50);
  }, [filePaths, query]);

  /* ── Command mode ────────────────────────────────────────────────────── */

  const cmdMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [commands, query]);

  /* ── Active item navigation ──────────────────────────────────────────── */

  const items = mode === 'file' ? fileMatches : cmdMatches;
  const itemCount = items.length;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (itemCount === 0 ? 0 : (i + 1) % itemCount));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (itemCount === 0 ? 0 : (i - 1 + itemCount) % itemCount));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (itemCount === 0) return;
      if (mode === 'file') {
        const path = fileMatches[active];
        if (path) {
          editorTabs.open(path);
          workbenchStore.setSelectedFile(path);
        }
      } else {
        cmdMatches[active]?.action();
      }
      onClose();
    }
  };

  useEffect(() => {
    // Keep the selected row in view when arrow-keying through.
    const el = listRef.current?.querySelector<HTMLElement>(`[data-quickopen-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center bg-black/30 backdrop-blur-[2px] pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 shadow-2xl ring-1 ring-black/5"
      >
        <div className="flex items-center gap-2 border-b border-migratex-elements-borderColor px-3 py-2.5">
          {mode === 'file' ? (
            <Search className="size-4 text-migratex-elements-textTertiary" aria-hidden />
          ) : (
            <CommandIcon className="size-4 text-migratex-elements-textTertiary" aria-hidden />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={mode === 'file' ? 'Go to file…' : 'Type a command…'}
            className="flex-1 bg-transparent text-sm text-migratex-elements-textPrimary placeholder:text-migratex-elements-textTertiary focus:outline-none"
          />
          <span className="rounded-md border border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 px-1.5 py-0.5 font-mono text-[10px] text-migratex-elements-textTertiary">
            Esc
          </span>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {mode === 'file'
            ? fileMatches.map((path, i) => {
                const isActive = i === active;
                return (
                  <button
                    type="button"
                    key={path}
                    data-quickopen-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => {
                      editorTabs.open(path);
                      workbenchStore.setSelectedFile(path);
                      onClose();
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors',
                      isActive
                        ? 'bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100'
                        : 'text-migratex-elements-textPrimary hover:bg-migratex-elements-background-depth-2',
                    )}
                  >
                    <FileIcon className="size-3.5 shrink-0 text-migratex-elements-textTertiary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{basename(path)}</span>
                    <span className="truncate text-[11px] text-migratex-elements-textTertiary">
                      {relativeFolder(path)}
                    </span>
                  </button>
                );
              })
            : cmdMatches.map((cmd, i) => {
                const isActive = i === active;
                return (
                  <button
                    type="button"
                    key={cmd.id}
                    data-quickopen-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => {
                      cmd.action();
                      onClose();
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors',
                      isActive
                        ? 'bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100'
                        : 'text-migratex-elements-textPrimary hover:bg-migratex-elements-background-depth-2',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                    {cmd.shortcut && (
                      <span className="font-mono text-[11px] text-migratex-elements-textTertiary">{cmd.shortcut}</span>
                    )}
                  </button>
                );
              })}

          {itemCount === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-migratex-elements-textTertiary">
              No {mode === 'file' ? 'files' : 'commands'} match <em>"{query}"</em>
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 px-3 py-1.5 text-[10px] text-migratex-elements-textTertiary">
          <span>
            <span className="font-mono">↑ ↓</span> to navigate · <span className="font-mono">Enter</span> to {mode === 'file' ? 'open' : 'run'}
          </span>
          <span>
            {itemCount} {itemCount === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
});
