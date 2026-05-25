/**
 * Monaco-powered editor panel for the workbench.
 *
 * Layout (left → right):
 *   [ FileTree   |   FindInFilesPanel (optional)   |   Tabs + Monaco / DiffViewer ]
 *
 * Wired up:
 *   • `editorTabsStore` for multi-tab state (with sessionStorage persistence
 *     and per-tab cursor / scroll restore).
 *   • `pendingDiffStore` for AI-generated edits — when populated, the editor
 *     swaps to Monaco's DiffEditor and shows Apply / Discard.
 *   • `themeStore` follows the existing light/dark toggle.
 *   • Cmd/Ctrl+P → file quick-open, Cmd/Ctrl+Shift+P → command palette,
 *     Cmd/Ctrl+Shift+F → find-in-files side panel, Cmd/Ctrl+S → save.
 *
 * The legacy `CodeMirrorEditor` props (`onEditorChange`, `onEditorScroll`,
 * `onFileSave`, `onFileReset`) are still accepted so `WorkbenchIDEView` and
 * `Workbench.client` don't need to change their wiring.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { Folder, Search as SearchIcon, RotateCcw, Save } from 'lucide-react';
import type { editor as MonacoEditorNS } from 'monaco-editor';

import type {
  EditorDocument,
  OnChangeCallback as OnEditorChange,
  OnSaveCallback as OnEditorSave,
  OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { Button } from '~/components/ui/button';
import { shortcutEventEmitter } from '~/lib/hooks';
import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import { editorTabs, editorTabsStore, pendingDiffStore } from '~/lib/stores/editorTabs';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { Terminal, type TerminalRef } from './terminal/Terminal';
import { MonacoEditor } from './monaco/MonacoEditor';
import { FileTabs } from './monaco/FileTabs';
import { DiffViewer } from './monaco/DiffViewer';
import { QuickOpen, type QuickOpenMode } from './monaco/QuickOpen';
import { FindInFilesPanel } from './monaco/FindInFilesPanel';

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  isLoadingFiles?: boolean;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
}

const MAX_TERMINALS = 3;
const DEFAULT_TERMINAL_SIZE = 25;
const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;

const isMacPlatform = () => {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
};

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    isLoadingFiles,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const showTerminal = useStore(workbenchStore.showTerminal);
    const tabsState = useStore(editorTabsStore);
    const pendingDiff = useStore(pendingDiffStore);

    const terminalRefs = useRef<Array<TerminalRef | null>>([]);
    const terminalPanelRef = useRef<ImperativePanelHandle>(null);
    const terminalToggledByShortcut = useRef(false);
    const monacoRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);

    const [activeTerminal, setActiveTerminal] = useState(0);
    const [terminalCount, setTerminalCount] = useState(1);
    const [quickOpen, setQuickOpen] = useState<QuickOpenMode | null>(null);
    const [findInFilesOpen, setFindInFilesOpen] = useState(false);

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) return undefined;
      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    /* Bridge: selectedFile (from parent / file tree) → editorTabs.open */
    useEffect(() => {
      if (selectedFile) {
        editorTabs.open(selectedFile, { preview: true });
      }
    }, [selectedFile]);

    /* Bridge: active tab → parent's onFileSelect */
    useEffect(() => {
      if (tabsState.activeFilePath && tabsState.activeFilePath !== selectedFile) {
        onFileSelect?.(tabsState.activeFilePath);
      }
      // Deliberately only triggers on tab switch (not on selectedFile prop change)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabsState.activeFilePath]);

    /* Command palette / quick open hotkeys (registered globally) */
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const meta = isMacPlatform() ? e.metaKey : e.ctrlKey;
        if (!meta) return;
        // Cmd/Ctrl + Shift + P → command palette
        if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
          e.preventDefault();
          setQuickOpen('command');
          return;
        }
        // Cmd/Ctrl + P → quick open files
        if (!e.shiftKey && (e.key === 'p' || e.key === 'P')) {
          e.preventDefault();
          setQuickOpen('file');
          return;
        }
        // Cmd/Ctrl + Shift + F → find in files
        if (e.shiftKey && (e.key === 'f' || e.key === 'F')) {
          e.preventDefault();
          setFindInFilesOpen((v) => !v);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    /* Imperative palette commands. Kept minimal — the foundation is in place
     * so we can register more from anywhere with editor + workbench access. */
    const commands = useMemo(
      () => [
        {
          id: 'workbench.action.files.save',
          label: 'File: Save',
          shortcut: isMacPlatform() ? '⌘ S' : 'Ctrl+S',
          action: () => onFileSave?.(),
        },
        {
          id: 'workbench.action.findInFiles',
          label: 'Search: Find in Files',
          shortcut: isMacPlatform() ? '⌘ ⇧ F' : 'Ctrl+Shift+F',
          action: () => setFindInFilesOpen(true),
        },
        {
          id: 'workbench.action.quickOpen',
          label: 'Go to File…',
          shortcut: isMacPlatform() ? '⌘ P' : 'Ctrl+P',
          action: () => setQuickOpen('file'),
        },
        {
          id: 'editor.action.formatDocument',
          label: 'Format Document',
          shortcut: isMacPlatform() ? '⌥ ⇧ F' : 'Shift+Alt+F',
          action: () => monacoRef.current?.getAction('editor.action.formatDocument')?.run(),
        },
        {
          id: 'editor.action.startFindReplaceAction',
          label: 'Find and Replace in Current Editor',
          shortcut: isMacPlatform() ? '⌘ ⌥ F' : 'Ctrl+H',
          action: () => monacoRef.current?.getAction('editor.action.startFindReplaceAction')?.run(),
        },
        {
          id: 'workbench.action.closeTab',
          label: 'Close Editor',
          shortcut: isMacPlatform() ? '⌘ W' : 'Ctrl+W',
          action: () => {
            const active = editorTabsStore.get().activeFilePath;
            if (active) editorTabs.close(active);
          },
        },
        {
          id: 'workbench.action.toggleTerminal',
          label: 'View: Toggle Terminal',
          shortcut: '⌃ `',
          action: () => workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get()),
        },
      ],
      [onFileSave],
    );

    useEffect(() => {
      const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
        terminalToggledByShortcut.current = true;
      });

      return () => {
        unsubscribeFromEventEmitter();
      };
    }, []);

    useEffect(() => {
      const { current: terminal } = terminalPanelRef;
      if (!terminal) return;

      const isCollapsed = terminal.isCollapsed();

      if (!showTerminal && !isCollapsed) {
        terminal.collapse();
      } else if (showTerminal && isCollapsed) {
        terminal.resize(DEFAULT_TERMINAL_SIZE);
      }

      terminalToggledByShortcut.current = false;
    }, [showTerminal]);

    const addTerminal = () => {
      if (terminalCount < MAX_TERMINALS) {
        setTerminalCount(terminalCount + 1);
        setActiveTerminal(terminalCount);
      }
    };

    const onMonacoChange = useCallback(
      (next: string) => {
        if (!editorDocument) return;
        // Reuse the existing CodeMirror onChange signature so callers don't change.
        onEditorChange?.({
          // The CodeMirror callback also includes a `selection` field, but the
          // workbench only reads `content`.
          content: next,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      },
      [editorDocument, onEditorChange],
    );

    return (
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={18} minSize={10} collapsible className="min-h-0">
              <div className="flex flex-col border-r border-migratex-elements-borderColor h-full min-h-0 overflow-hidden">
                <PanelHeader className="shrink-0 justify-between">
                  <span className="flex items-center gap-1.5">
                    <Folder className="size-3.5" />
                    Files
                  </span>
                  <IconButton
                    icon="i-ph:magnifying-glass"
                    title="Search in files (Ctrl/Cmd+Shift+F)"
                    size="md"
                    onClick={() => setFindInFilesOpen((v) => !v)}
                    className={findInFilesOpen ? 'text-violet-600' : undefined}
                  />
                </PanelHeader>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                  <FileTree
                    className="min-h-min pb-2"
                    files={files}
                    hideRoot
                    unsavedFiles={unsavedFiles}
                    rootFolder={WORK_DIR}
                    selectedFile={selectedFile}
                    onFileSelect={onFileSelect}
                    isLoading={isLoadingFiles}
                  />
                </div>
              </div>
            </Panel>
            <PanelResizeHandle />

            {findInFilesOpen && (
              <>
                <Panel defaultSize={20} minSize={14} maxSize={40} className="min-h-0">
                  <FindInFilesPanel onClose={() => setFindInFilesOpen(false)} className="h-full w-full" />
                </Panel>
                <PanelResizeHandle />
              </>
            )}

            <Panel className="flex flex-col" defaultSize={findInFilesOpen ? 62 : 82} minSize={20}>
              <FileTabs />
              <PanelHeader className="overflow-x-auto">
                {activeFileSegments?.length && (
                  <div className="flex items-center flex-1 text-sm">
                    <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />
                    {activeFileUnsaved && (
                      <div className="flex gap-1 ml-auto -mr-1.5">
                        <PanelHeaderButton onClick={onFileSave}>
                          <Save className="size-3.5" />
                          Save
                        </PanelHeaderButton>
                        <PanelHeaderButton onClick={onFileReset}>
                          <RotateCcw className="size-3.5" />
                          Reset
                        </PanelHeaderButton>
                      </div>
                    )}
                  </div>
                )}
              </PanelHeader>
              <div className="h-full flex-1 overflow-hidden">
                {pendingDiff ? (
                  <DiffViewer diff={pendingDiff} />
                ) : editorDocument ? (
                  <MonacoEditor
                    filePath={editorDocument.filePath}
                    value={editorDocument.value}
                    readOnly={isStreaming === true}
                    onChange={onMonacoChange}
                    onSave={() => onFileSave?.()}
                    onMount={(editor) => {
                      monacoRef.current = editor;

                      // Wire Monaco's onDidScrollChange back through the
                      // legacy onEditorScroll callback so the workbench
                      // store's scroll-position tracking keeps working.
                      editor.onDidScrollChange((e) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onEditorScroll?.({ top: e.scrollTop, left: e.scrollLeft } as any);
                      });
                    }}
                  />
                ) : (
                  <EmptyEditor onPickFile={() => setQuickOpen('file')} />
                )}
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle />

        <Panel
          ref={terminalPanelRef}
          defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
          minSize={10}
          collapsible
          onExpand={() => {
            if (!terminalToggledByShortcut.current) workbenchStore.toggleTerminal(true);
          }}
          onCollapse={() => {
            if (!terminalToggledByShortcut.current) workbenchStore.toggleTerminal(false);
          }}
        >
          <div className="h-full">
            <div className="bg-migratex-elements-terminals-background h-full flex flex-col">
              <div className="flex items-center bg-migratex-elements-background-depth-2 border-y border-migratex-elements-borderColor gap-1.5 min-h-[34px] p-2">
                {Array.from({ length: terminalCount }, (_, index) => {
                  const isActive = activeTerminal === index;
                  return (
                    <button
                      key={index}
                      className={classNames(
                        'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                        {
                          'bg-migratex-elements-terminals-buttonBackground text-migratex-elements-textPrimary':
                            isActive,
                          'bg-migratex-elements-background-depth-2 text-migratex-elements-textSecondary hover:bg-migratex-elements-terminals-buttonBackground':
                            !isActive,
                        },
                      )}
                      onClick={() => setActiveTerminal(index)}
                    >
                      <div className="i-ph:terminal-window-duotone text-lg" />
                      Terminal {terminalCount > 1 && index + 1}
                    </button>
                  );
                })}
                {terminalCount < MAX_TERMINALS && <IconButton icon="i-ph:plus" size="md" onClick={addTerminal} />}
                <IconButton
                  className="ml-auto"
                  icon="i-ph:caret-down"
                  title="Close"
                  size="md"
                  onClick={() => workbenchStore.toggleTerminal(false)}
                />
              </div>
              {/* Terminals are intentionally left disabled in this build —
               *  the WebContainer terminal integration is wired up elsewhere
               *  and brought back when the workbench gains shell execution. */}
            </div>
          </div>
        </Panel>

        {quickOpen && <QuickOpen mode={quickOpen} commands={commands} onClose={() => setQuickOpen(null)} />}
      </PanelGroup>
    );
  },
);

function EmptyEditor({ onPickFile }: { onPickFile: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-migratex-elements-textTertiary">
      <SearchIcon className="size-8 opacity-60" />
      <div className="text-sm font-medium text-migratex-elements-textSecondary">No file open</div>
      <div className="max-w-xs text-[12px]">
        Pick a file from the explorer, or press{' '}
        <kbd className="rounded border border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 px-1.5 py-0.5 font-mono text-[10px]">
          {isMacPlatform() ? '⌘' : 'Ctrl'} P
        </kbd>{' '}
        to search.
      </div>
      <Button size="sm" variant="outline" onClick={onPickFile}>
        Go to file
      </Button>
    </div>
  );
}
