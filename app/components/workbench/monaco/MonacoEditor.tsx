/**
 * Thin wrapper around @monaco-editor/react's Editor.
 *
 *   • Forwards a Monaco editor instance to the parent via `onMount` so
 *     the parent can imperatively run commands (focus, find, etc.).
 *   • Tracks language from filePath via `languageForPath`.
 *   • Restores cursor + scroll from EditorTab.viewState on mount.
 *   • Emits cursor / scroll changes back to the tabs store so the next
 *     time the user switches to this file their place is preserved.
 *   • Theme follows the existing themeStore (light → 'vs', dark → 'vs-dark').
 */

import { useRef } from 'react';
import { Editor, type Monaco, type OnMount, type OnChange } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';
import { useStore } from '@nanostores/react';
import { themeStore } from '~/lib/stores/theme';
import { editorTabs, editorTabsStore } from '~/lib/stores/editorTabs';
import { languageForPath } from '~/lib/editor/monacoLanguage';
import { cn } from '~/lib/utils';

interface MonacoEditorProps {
  filePath: string;
  value: string;
  readOnly?: boolean;
  className?: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  onMount?: (editor: MonacoEditorNS.IStandaloneCodeEditor, monaco: Monaco) => void;
}

export function MonacoEditor({ filePath, value, readOnly, className, onChange, onSave, onMount }: MonacoEditorProps) {
  const theme = useStore(themeStore);
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Restore cached view state for this tab.
    const tab = editorTabsStore.get().tabs.find((t) => t.filePath === filePath);
    if (tab?.viewState?.line) {
      editor.setPosition({ lineNumber: tab.viewState.line, column: tab.viewState.column ?? 1 });
      editor.revealLineInCenter(tab.viewState.line);
    } else if (tab?.viewState?.scroll) {
      editor.setScrollPosition({ scrollTop: tab.viewState.scroll.top, scrollLeft: tab.viewState.scroll.left });
    }

    editor.onDidChangeCursorPosition((e) => {
      editorTabs.setViewState(filePath, { line: e.position.lineNumber, column: e.position.column });
    });

    editor.onDidScrollChange((e) => {
      editorTabs.setViewState(filePath, { scroll: { top: e.scrollTop, left: e.scrollLeft } });
    });

    // Ctrl/Cmd+S → onSave (parent decides what to do)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    onMount?.(editor, monaco);
  };

  const handleChange: OnChange = (next) => {
    if (typeof next === 'string') onChange?.(next);
  };

  // VSCode-ish editor defaults.
  const options: MonacoEditorNS.IStandaloneEditorConstructionOptions = {
    automaticLayout: true,
    fontSize: 13,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineNumbers: 'on',
    minimap: { enabled: true, scale: 1, renderCharacters: false },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    fixedOverflowWidgets: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: 'active', indentation: true },
    inlineSuggest: { enabled: true },
    suggest: { showWords: true, preview: true },
    folding: true,
    foldingStrategy: 'indentation',
    formatOnPaste: false,
    formatOnType: false,
    renderWhitespace: 'selection',
    renderLineHighlight: 'all',
    wordWrap: 'off',
    padding: { top: 12, bottom: 12 },
    tabSize: 2,
    insertSpaces: true,
    readOnly,
  };

  return (
    <div className={cn('h-full w-full', className)}>
      <Editor
        path={filePath}
        defaultLanguage={languageForPath(filePath)}
        language={languageForPath(filePath)}
        value={value}
        theme={theme === 'dark' ? 'vs-dark' : 'vs'}
        options={options}
        onMount={handleMount}
        onChange={handleChange}
      />
    </div>
  );
}
