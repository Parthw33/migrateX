/**
 * VSCode-style "Find in files" side panel.
 *
 * Runs a literal (or regex) search across every text file in
 * workbenchStore.files and groups matches by file. Clicking a match opens the
 * file in a new tab and jumps to the matched line in the editor.
 *
 * Visual style mirrors VSCode's primary sidebar search:
 *   • Quiet search input with inline modifier toggles (Aa / whole-word / .*)
 *   • File group: chevron · filename + folder hint · count chip
 *   • Match row: line number · trimmed preview with the matched substring
 *     highlighted in violet
 *   • Active match (last clicked) is persistently highlighted
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Regex,
  Search,
  WholeWord,
  X,
} from 'lucide-react';
import { workbenchStore } from '~/lib/stores/workbench';
import { editorTabs } from '~/lib/stores/editorTabs';
import { WORK_DIR } from '~/utils/constants';
import { useDebounce } from '~/lib/hooks/useDebounce';
import { cn } from '~/lib/utils';

interface Match {
  filePath: string;
  line: number;
  column: number;
  /** Length of the matched substring in `text` starting at `column-1`. */
  length: number;
  /** Raw line text — preserved verbatim so the highlight indices are valid. */
  text: string;
}

interface MatchGroup {
  filePath: string;
  matches: Match[];
}

const MAX_RESULTS = 500;
const MAX_FILES = 5000;
const PREVIEW_MAX_LEAD = 40; // chars of context before the match in the preview

function basename(path: string): string {
  return path.split('/').pop() || path;
}

function relativeFolder(path: string): string {
  const stripped = path.startsWith(WORK_DIR + '/') ? path.slice(WORK_DIR.length + 1) : path;
  const parts = stripped.split('/');
  parts.pop();
  return parts.join('/') || '';
}

function relativePath(path: string): string {
  return path.startsWith(WORK_DIR + '/') ? path.slice(WORK_DIR.length + 1) : path;
}

/** Renders the line preview, highlighting the matched substring. */
function MatchPreview({ text, column, length }: { text: string; column: number; length: number }) {
  // VSCode trims long leading whitespace and shows '…' so the match isn't
  // pushed off-screen.
  const matchStart = Math.max(0, column - 1);
  const matchEnd = matchStart + length;

  let displayStart = 0;
  let prefix = '';
  if (matchStart > PREVIEW_MAX_LEAD) {
    displayStart = matchStart - PREVIEW_MAX_LEAD;
    prefix = '…';
  }

  // Trim leading whitespace only when we didn't already truncate.
  const visibleSegment = displayStart === 0 ? text.replace(/^\s+/, (m) => (m.length > 4 ? '' : m)) : text.slice(displayStart);
  const trimmedOffset = displayStart === 0 ? text.length - visibleSegment.length : displayStart;

  const before = visibleSegment.slice(0, Math.max(0, matchStart - trimmedOffset));
  const matched = visibleSegment.slice(Math.max(0, matchStart - trimmedOffset), Math.max(0, matchEnd - trimmedOffset));
  const after = visibleSegment.slice(Math.max(0, matchEnd - trimmedOffset));

  return (
    <span className="block min-w-0 truncate font-mono text-[11.5px] leading-snug">
      {prefix && <span className="text-migratex-elements-textTertiary">{prefix}</span>}
      <span className="text-migratex-elements-textSecondary">{before}</span>
      <span className="rounded-[3px] bg-violet-500/25 px-[1px] text-violet-900 dark:text-violet-100">
        {matched}
      </span>
      <span className="text-migratex-elements-textSecondary">{after}</span>
    </span>
  );
}

export const FindInFilesPanel = memo(function FindInFilesPanel({
  onClose,
  className,
}: {
  onClose: () => void;
  className?: string;
}) {
  const files = useStore(workbenchStore.files);

  const [rawQuery, setRawQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const query = useDebounce(rawQuery, 180);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { results, regexError } = useMemo<{ results: Match[]; regexError: string | null }>(() => {
    const q = query;
    if (!q) return { results: [], regexError: null };

    let pattern: RegExp;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const escaped = useRegex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wrapped = wholeWord ? `\\b(?:${escaped})\\b` : escaped;
      pattern = new RegExp(wrapped, flags);
    } catch (err) {
      return { results: [], regexError: err instanceof Error ? err.message : 'Invalid regular expression' };
    }

    const out: Match[] = [];
    let scanned = 0;
    for (const [path, dirent] of Object.entries(files)) {
      if (scanned > MAX_FILES) break;
      if (dirent?.type !== 'file' || dirent.isBinary) continue;
      scanned++;

      const lines = dirent.content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(line))) {
          out.push({
            filePath: path,
            line: i + 1,
            column: m.index + 1,
            length: m[0].length || 1,
            text: line,
          });
          if (m.index === pattern.lastIndex) pattern.lastIndex++;
          if (out.length >= MAX_RESULTS) return { results: out, regexError: null };
        }
      }
    }
    return { results: out, regexError: null };
  }, [files, query, caseSensitive, wholeWord, useRegex]);

  const groups: MatchGroup[] = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of results) {
      const arr = map.get(m.filePath);
      if (arr) arr.push(m);
      else map.set(m.filePath, [m]);
    }
    return [...map.entries()].map(([filePath, matches]) => ({ filePath, matches }));
  }, [results]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeMatch, setActiveMatch] = useState<string | null>(null);

  const toggleCollapsed = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const openMatch = (m: Match) => {
    setActiveMatch(`${m.filePath}:${m.line}:${m.column}`);
    editorTabs.open(m.filePath);
    editorTabs.setViewState(m.filePath, { line: m.line, column: m.column });
    workbenchStore.setSelectedFile(m.filePath);
  };

  const fileCount = groups.length;
  const resultCount = results.length;

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col bg-migratex-elements-background-depth-2',
        className,
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-migratex-elements-borderColor px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-migratex-elements-textSecondary">
        <span className="flex items-center gap-1.5">
          <Search className="size-3.5" aria-hidden />
          Search
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search panel"
          className="flex size-5 items-center justify-center rounded text-migratex-elements-textTertiary transition-colors hover:bg-migratex-elements-background-depth-3 hover:text-migratex-elements-textPrimary"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── Search input row ───────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 flex-col gap-1.5 px-3 py-2.5">
        <div
          className={cn(
            'group flex items-center gap-1.5 rounded-md border bg-migratex-elements-background-depth-1 px-2 py-1.5 transition-colors',
            regexError
              ? 'border-red-300 focus-within:border-red-400'
              : 'border-migratex-elements-borderColor focus-within:border-violet-400/80 focus-within:ring-1 focus-within:ring-violet-500/30',
          )}
        >
          <input
            ref={inputRef}
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-migratex-elements-textPrimary placeholder:text-migratex-elements-textTertiary focus:outline-none"
          />
          <div className="ml-auto flex items-center gap-0.5">
            <ModifierToggle on={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title="Match case (Aa)">
              <CaseSensitive className="size-3" />
            </ModifierToggle>
            <ModifierToggle on={wholeWord} onClick={() => setWholeWord((v) => !v)} title="Match whole word">
              <WholeWord className="size-3" />
            </ModifierToggle>
            <ModifierToggle on={useRegex} onClick={() => setUseRegex((v) => !v)} title="Use regular expression (.*)">
              <Regex className="size-3" />
            </ModifierToggle>
          </div>
        </div>
        {regexError && (
          <p className="px-0.5 text-[10.5px] text-red-600 dark:text-red-300">{regexError}</p>
        )}
      </div>

      {/* ── Results summary ────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-migratex-elements-borderColor px-3 pb-2 text-[10.5px] text-migratex-elements-textTertiary">
        {query.trim() && !regexError ? (
          resultCount === 0 ? (
            <span>No results</span>
          ) : (
            <span>
              <strong className="text-migratex-elements-textSecondary">{resultCount}</strong>
              {resultCount === MAX_RESULTS ? '+' : ''}{' '}
              {resultCount === 1 ? 'result' : 'results'} in{' '}
              <strong className="text-migratex-elements-textSecondary">{fileCount}</strong>{' '}
              {fileCount === 1 ? 'file' : 'files'}
            </span>
          )
        ) : (
          <span className="opacity-0">.</span>
        )}
      </div>

      {/* ── Results list ───────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {!query.trim() ? (
          <p className="px-3 py-6 text-center text-[11.5px] leading-relaxed text-migratex-elements-textTertiary">
            Type to search across every text file in the workbench.
          </p>
        ) : groups.length === 0 && !regexError ? (
          <p className="px-3 py-6 text-center text-[11.5px] text-migratex-elements-textTertiary">
            No matches for <span className="font-mono text-migratex-elements-textSecondary">"{query}"</span>
          </p>
        ) : (
          groups.map(({ filePath, matches }) => {
            const isCollapsed = collapsed.has(filePath);
            return (
              <div key={filePath} className="select-none">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(filePath)}
                  title={filePath}
                  className="group flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-migratex-elements-background-depth-3"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3 shrink-0 text-migratex-elements-textTertiary" aria-hidden />
                  ) : (
                    <ChevronDown className="size-3 shrink-0 text-migratex-elements-textTertiary" aria-hidden />
                  )}
                  <FileIcon className="size-3 shrink-0 text-migratex-elements-textTertiary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-[12px] font-medium text-migratex-elements-textPrimary">
                      {basename(filePath)}
                    </span>
                    {relativeFolder(filePath) && (
                      <span className="ml-1.5 truncate text-[10.5px] text-migratex-elements-textTertiary">
                        {relativeFolder(filePath)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-migratex-elements-background-depth-3 px-1.5 py-px text-[10px] font-medium tabular-nums text-migratex-elements-textSecondary">
                    {matches.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="mb-0.5 ml-2 border-l border-migratex-elements-borderColor/70 pl-2">
                    {matches.map((m) => {
                      const key = `${m.filePath}:${m.line}:${m.column}`;
                      const isActive = activeMatch === key;
                      return (
                        <button
                          type="button"
                          key={key}
                          onClick={() => openMatch(m)}
                          title={`${relativePath(m.filePath)}:${m.line}:${m.column}`}
                          className={cn(
                            'flex w-full items-baseline gap-2 rounded px-1.5 py-[3px] text-left transition-colors',
                            isActive
                              ? 'bg-violet-100 dark:bg-violet-900/30'
                              : 'hover:bg-migratex-elements-background-depth-3',
                          )}
                        >
                          <span className="w-7 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-migratex-elements-textTertiary">
                            {m.line}
                          </span>
                          <MatchPreview text={m.text} column={m.column} length={m.length} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

/* ── Modifier toggle button ───────────────────────────────────────────────── */

function ModifierToggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex size-5 items-center justify-center rounded text-[11px] transition-colors',
        on
          ? 'bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/40 dark:bg-violet-500/25 dark:text-violet-200 dark:ring-violet-400/50'
          : 'text-migratex-elements-textTertiary hover:bg-migratex-elements-background-depth-3 hover:text-migratex-elements-textSecondary',
      )}
    >
      {children}
    </button>
  );
}
