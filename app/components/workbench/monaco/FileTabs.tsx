/**
 * VSCode-style file tabs strip.
 *
 *   • Active tab highlighted with a thin accent strip on top.
 *   • Preview tabs render their label in italics — same convention VSCode uses.
 *   • Dirty indicator: a filled dot replaces the close button until you hover.
 *   • Middle-click closes a tab, double-click pins it (promotes preview → real),
 *     right-click is reserved for a future context menu.
 *   • Mouse-wheel scrolls the tab strip horizontally.
 */

import { memo, useCallback, useRef, type MouseEvent } from 'react';
import { useStore } from '@nanostores/react';
import { X, Circle } from 'lucide-react';
import { editorTabs, editorTabsStore } from '~/lib/stores/editorTabs';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import { cn } from '~/lib/utils';

function basename(path: string): string {
  return path.split('/').pop() || path;
}

function relativeFolder(path: string): string {
  const stripped = path.startsWith(WORK_DIR + '/') ? path.slice(WORK_DIR.length + 1) : path;
  const parts = stripped.split('/');
  parts.pop();
  return parts.join('/') || '';
}

export const FileTabs = memo(function FileTabs() {
  const { tabs, activeFilePath } = useStore(editorTabsStore);
  const unsaved = useStore(workbenchStore.unsavedFiles);
  const stripRef = useRef<HTMLDivElement>(null);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && stripRef.current) {
      stripRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  if (tabs.length === 0) return null;

  const onClickTab = (filePath: string) => () => editorTabs.setActive(filePath);

  const onClose = (filePath: string) => (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    editorTabs.close(filePath);
  };

  const onMouseDown = (filePath: string) => (e: MouseEvent) => {
    // Middle-click closes (VSCode behaviour).
    if (e.button === 1) {
      e.preventDefault();
      editorTabs.close(filePath);
    }
  };

  const onDoubleClick = (filePath: string) => () => editorTabs.pin(filePath);

  return (
    <div
      ref={stripRef}
      onWheel={onWheel}
      role="tablist"
      aria-label="Open files"
      className="flex h-9 flex-shrink-0 items-stretch overflow-x-auto border-b border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 scrollbar-thin scrollbar-thumb-migratex-elements-borderColor/60"
    >
      {tabs.map((tab) => {
        const active = tab.filePath === activeFilePath;
        const dirty = unsaved.has(tab.filePath);
        const folder = relativeFolder(tab.filePath);
        return (
          <div
            key={tab.filePath}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={onClickTab(tab.filePath)}
            onDoubleClick={onDoubleClick(tab.filePath)}
            onMouseDown={onMouseDown(tab.filePath)}
            title={tab.filePath}
            className={cn(
              'group relative flex min-w-[120px] max-w-[220px] cursor-pointer select-none items-center gap-2 border-r border-migratex-elements-borderColor px-3 py-1.5 text-[12px] transition-colors',
              active
                ? 'bg-migratex-elements-background-depth-1 text-migratex-elements-textPrimary'
                : 'text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-1/60',
            )}
          >
            {active && (
              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-violet-500"
                aria-hidden
              />
            )}
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-medium',
                tab.preview && 'italic text-migratex-elements-textTertiary',
              )}
            >
              {basename(tab.filePath)}
              {folder && (
                <span className="ml-2 truncate text-[10px] font-normal text-migratex-elements-textTertiary">
                  {folder}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label={dirty ? `Discard changes to ${basename(tab.filePath)}` : `Close ${basename(tab.filePath)}`}
              onClick={onClose(tab.filePath)}
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded text-migratex-elements-textTertiary transition-colors hover:bg-migratex-elements-background-depth-3 hover:text-migratex-elements-textPrimary',
                dirty && 'opacity-100',
              )}
            >
              {dirty ? (
                <Circle className="size-2.5 fill-current group-hover:hidden" aria-hidden />
              ) : null}
              <X className={cn('size-3', dirty && 'hidden group-hover:inline')} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
});
