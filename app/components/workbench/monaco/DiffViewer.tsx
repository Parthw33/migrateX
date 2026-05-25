/**
 * Monaco DiffEditor wrapped for the workbench.
 *
 * Used to preview AI-generated edits before they're applied:
 * `pendingDiffStore` holds an `{ original, modified, filePath }` and this
 * component renders the diff with two action buttons (Apply / Discard).
 */

import { useCallback } from 'react';
import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import { useStore } from '@nanostores/react';
import { Check, X } from 'lucide-react';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { pendingDiff, type PendingDiff } from '~/lib/stores/editorTabs';
import { languageForPath } from '~/lib/editor/monacoLanguage';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

interface DiffViewerProps {
  diff: PendingDiff;
  className?: string;
}

export function DiffViewer({ diff, className }: DiffViewerProps) {
  const theme = useStore(themeStore);

  const onMount: DiffOnMount = (editor) => {
    // Focus the modified side so the user can review.
    editor.getModifiedEditor().focus();
  };

  const onApply = useCallback(() => {
    void workbenchStore
      .ingestWebsiteFiles({
        [diff.filePath]: { type: 'file', content: diff.modified, isBinary: false },
      })
      .finally(() => pendingDiff.clear());
  }, [diff]);

  const onDiscard = useCallback(() => pendingDiff.clear(), []);

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 px-3 py-2">
        <div className="min-w-0 truncate text-[12px] font-medium text-migratex-elements-textPrimary">
          {diff.label || 'Proposed change'}
          <span className="ml-2 truncate font-mono text-[11px] text-migratex-elements-textTertiary">
            {diff.filePath}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            <X className="size-3" />
            Discard
          </Button>
          <Button size="sm" onClick={onApply}>
            <Check className="size-3" />
            Apply change
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <DiffEditor
          original={diff.original}
          modified={diff.modified}
          language={languageForPath(diff.filePath)}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          onMount={onMount}
          options={{
            renderSideBySide: true,
            readOnly: false,
            originalEditable: false,
            automaticLayout: true,
            fontSize: 13,
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            wordWrap: 'on',
            diffWordWrap: 'on',
            ignoreTrimWhitespace: false,
          }}
        />
      </div>
    </div>
  );
}
