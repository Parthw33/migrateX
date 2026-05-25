/**
 * VSCode-style "Find in files" side panel.
 *
 * Runs a literal (or regex) search across every text file in
 * workbenchStore.files and groups matches by file. Clicking a match opens the
 * file in a new tab and jumps to the matched line in the editor.
 *
 * Backed entirely by client-side in-memory file content — there's no server
 * round-trip. For large manifests the search is debounced.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Search, X, ChevronDown, ChevronRight, Regex, CaseSensitive } from 'lucide-react';
import { workbenchStore } from '~/lib/stores/workbench';
import { editorTabs } from '~/lib/stores/editorTabs';
import { WORK_DIR } from '~/utils/constants';
import { useDebounce } from '~/lib/hooks/useDebounce';
import { cn } from '~/lib/utils';

interface Match {
  filePath: string;
  line: number;
  column: number;
  text: string;
}

const MAX_RESULTS = 500;
const MAX_FILES = 5000;

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
  const [useRegex, setUseRegex] = useState(false);
  const query = useDebounce(rawQuery, 180);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results: Match[] = useMemo(() => {
    const q = query;
    if (!q) return [];
    let pattern: RegExp;
    try {
      pattern = useRegex
        ? new RegExp(q, caseSensitive ? 'g' : 'gi')
        : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
    } catch {
      return [];
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
          out.push({ filePath: path, line: i + 1, column: m.index + 1, text: line });
          if (m.index === pattern.lastIndex) pattern.lastIndex++;
          if (out.length >= MAX_RESULTS) return out;
        }
      }
    }
    return out;
  }, [files, query, caseSensitive, useRegex]);

  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of results) {
      const arr = map.get(m.filePath);
      if (arr) arr.push(m);
      else map.set(m.filePath, [m]);
    }
    return [...map.entries()];
  }, [results]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const openMatch = (m: Match) => {
    editorTabs.open(m.filePath);
    editorTabs.setViewState(m.filePath, { line: m.line, column: m.column });
    workbenchStore.setSelectedFile(m.filePath);
  };

  const rel = (p: string) => (p.startsWith(WORK_DIR + '/') ? p.slice(WORK_DIR.length + 1) : p);

  return (
    <div className={cn('flex h-full w-72 flex-col border-r border-migratex-elements-borderColor bg-migratex-elements-background-depth-2', className)}>
      <div className="flex flex-shrink-0 items-center justify-between border-b border-migratex-elements-borderColor px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-migratex-elements-textSecondary">
        <span>Search</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search panel"
          className="rounded p-0.5 hover:bg-migratex-elements-background-depth-3 hover:text-migratex-elements-textPrimary"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-shrink-0 flex-col gap-1.5 px-3 py-2">
        <div className="flex items-center gap-1 rounded border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 px-2 py-1.5 focus-within:border-violet-400/80 focus-within:ring-1 focus-within:ring-violet-500/30">
          <Search className="size-3.5 shrink-0 text-migratex-elements-textTertiary" aria-hidden />
          <input
            ref={inputRef}
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-[12px] text-migratex-elements-textPrimary placeholder:text-migratex-elements-textTertiary focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <Toggle on={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title="Match case (Aa)">
            <CaseSensitive className="size-3" />
          </Toggle>
          <Toggle on={useRegex} onClick={() => setUseRegex((v) => !v)} title="Use regular expression (.*)">
            <Regex className="size-3" />
          </Toggle>
          {query && (
            <span className="ml-auto text-[10px] text-migratex-elements-textTertiary tabular-nums">
              {results.length} {results.length === 1 ? 'result' : 'results'}
              {results.length === MAX_RESULTS ? '+' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {!query ? (
          <p className="px-3 py-4 text-[11px] text-migratex-elements-textTertiary">
            Type to search across all open project files.
          </p>
        ) : grouped.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-migratex-elements-textTertiary">No results.</p>
        ) : (
          grouped.map(([path, matches]) => {
            const isCollapsed = collapsed.has(path);
            return (
              <div key={path}>
                <button
                  type="button"
                  onClick={() => toggleCollapsed(path)}
                  className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[12px] font-medium text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-3"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3 shrink-0" />
                  ) : (
                    <ChevronDown className="size-3 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{rel(path)}</span>
                  <span className="shrink-0 rounded bg-migratex-elements-background-depth-3 px-1.5 py-px text-[10px] tabular-nums text-migratex-elements-textTertiary">
                    {matches.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="ml-3 border-l border-migratex-elements-borderColor/60 pl-2">
                    {matches.map((m, idx) => (
                      <button
                        type="button"
                        key={`${path}:${m.line}:${m.column}:${idx}`}
                        onClick={() => openMatch(m)}
                        className="flex w-full items-baseline gap-2 rounded px-1.5 py-0.5 text-left font-mono text-[11px] text-migratex-elements-textPrimary hover:bg-migratex-elements-background-depth-3"
                      >
                        <span className="shrink-0 tabular-nums text-migratex-elements-textTertiary">{m.line}</span>
                        <span className="min-w-0 flex-1 truncate">{m.text.trim()}</span>
                      </button>
                    ))}
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

function Toggle({
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
      onClick={onClick}
      className={cn(
        'flex size-6 items-center justify-center rounded border text-[11px] transition-colors',
        on
          ? 'border-violet-400 bg-violet-100 text-violet-700 dark:bg-violet-900/40'
          : 'border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 text-migratex-elements-textSecondary hover:border-violet-300',
      )}
    >
      {children}
    </button>
  );
}
