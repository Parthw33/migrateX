/**
 * WorkbenchIDEView.client.tsx
 *
 * Pure editor shell — activity bar + file tree + CodeMirror + terminal + status bar.
 * The header/toolbar lives in WorkbenchHeader (rendered by GenerateWebsiteView).
 * This component never renders Code/Preview/Sync/Build buttons itself.
 */

import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@remix-run/react';
import { toast } from 'react-toastify';
import { ClientOnly } from 'remix-utils/client-only';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { EditorPanel, type WorkbenchSidebarView } from '~/components/workbench/EditorPanel';
import { useOnDemandFileContent } from '~/lib/hooks/useOnDemandFileContent';
import { migrationStore } from '~/lib/stores/migration';
import { workbenchStore } from '~/lib/stores/workbench';
import { themeStore } from '~/lib/stores/theme';
import { authStore } from '~/lib/stores/auth';
import { getScrapeJobId } from '~/lib/scrapeJobSession';
import { classNames } from '~/utils/classNames';
import type { WebsiteGenerationStatus } from '~/lib/hooks/useWebsiteLiveGenerationPoll';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function langFromPath(filePath?: string): string {
  if (!filePath) return 'Plain Text';
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    tsx: 'TypeScript React', ts: 'TypeScript',
    jsx: 'JavaScript React', js: 'JavaScript',
    css: 'CSS', scss: 'SCSS', json: 'JSON',
    md: 'Markdown', html: 'HTML', env: 'ENV',
  };
  return map[ext] ?? 'Plain Text';
}

function shortPath(filePath?: string): string {
  if (!filePath) return '';
  return filePath.replace(/^\/home\/project\//, '').replace(/^\/home\/user\//, '');
}

/* ── Activity bar ────────────────────────────────────────────────────────── */

interface ActivityIconProps {
  active?: boolean;
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}

function ActivityIcon({ active, title, onClick, children }: ActivityIconProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={classNames(
        'ide-activity-icon relative w-8 h-8 flex items-center justify-center rounded-lg transition-all',
        active ? 'ide-activity-icon--active' : undefined,
        active
          ? 'before:absolute before:left-[-4px] before:top-1/2 before:-translate-y-1/2 before:w-0.5 before:h-[18px] before:rounded-r-sm'
          : undefined,
      )}
    >
      {children}
    </button>
  );
}

/* ── Status bar ──────────────────────────────────────────────────────────── */

function StatusBar({ lang, cursorPos, branch = 'main' }: { lang: string; cursorPos: string; branch?: string }) {
  return (
    <div className="ide-status-bar flex items-center h-[22px] px-2 gap-1 flex-shrink-0 text-[11px] select-none">
      <div className="ide-si flex items-center gap-1 px-1.5 h-full rounded-sm cursor-default hover:bg-white/20 transition-colors">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 5C7 3.346 5.654 2 4 2S1 3.346 1 5c0 1.302.839 2.401 2 2.815V16h2V7.815C6.161 7.401 7 6.302 7 5zm-2 0c0 .551-.449 1-1 1s-1-.449-1-1 .449-1 1-1 1 .449 1 1zm12 9.185V14c0-1.654-1.346-3-3-3h-3V9h5l-4-4-4 4h5v2H12c-2.757 0-5 2.243-5 5v.185C5.839 16.599 5 17.698 5 19c0 1.654 1.346 3 3 3s3-1.346 3-3c0-1.302-.839-2.401-2-2.815V14c0-1.103.897-2 2-2h3v2.185C12.839 14.599 12 15.698 12 17c0 1.654 1.346 3 3 3s3-1.346 3-3c0-1.302-.839-2.401-2-2.815zM8 19c0 .551-.449 1-1 1s-1-.449-1-1 .449-1 1-1 1 .449 1 1zm7 1c-.551 0-1-.449-1-1s.449-1 1-1 1 .449 1 1-.449 1-1 1z" />
        </svg>
        <span>{branch}</span>
      </div>
      <div className="ide-si flex items-center gap-1 px-1.5 h-full rounded-sm cursor-default hover:bg-white/20 transition-colors">
        0 ⚠ &nbsp; 0 ⊘
      </div>
      <div className="flex-1" />
      <div className="ide-si px-1.5 h-full flex items-center rounded-sm cursor-default">{lang}</div>
      <div className="ide-si px-1.5 h-full flex items-center rounded-sm cursor-default">UTF-8</div>
      <div className="ide-si px-1.5 h-full flex items-center rounded-sm cursor-default">{cursorPos}</div>
      <div className="ide-si px-1.5 h-full flex items-center rounded-sm cursor-default">Spaces: 2</div>
      <div className="ide-si px-1.5 h-full flex items-center rounded-sm cursor-default">Prettier</div>
    </div>
  );
}

/* ── Props ───────────────────────────────────────────────────────────────── */

export interface WorkbenchIDEViewProps {
  /** Generation status from parent (used for skeleton loading) */
  generationStatus?: WebsiteGenerationStatus | null;
  /** Expose derived values to parent for the unified header */
  onBreadcrumbChange?: (v: string) => void;
  onFileSelectChange?: (filePath: string | undefined) => void;
}

/* ── Main ────────────────────────────────────────────────────────────────── */

export const WorkbenchIDEView = memo(function WorkbenchIDEView({
  generationStatus,
  onBreadcrumbChange,
}: WorkbenchIDEViewProps) {
  const files = useStore(workbenchStore.files);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);
  const appToken = useStore(authStore).appToken;

  const scrapeJobId = getScrapeJobId();
  const { onFileSelect: onDemandFileSelect } = useOnDemandFileContent({ appToken, jobId: scrapeJobId });

  const [cursorPos] = useState('Ln 1, Col 1');
  const [sidebarView, setSidebarView] = useState<WorkbenchSidebarView>('files');

  // Note: `workbenchStore.ingestWebsiteFiles` already calls `setDocuments`
  // whenever the file count changes, so a per-`files` useEffect here would
  // re-build the editor's documents map (O(N)) on every reactive update —
  // including the per-file ingests the sync now performs to populate the
  // tree one row at a time. Skip it.

  const breadcrumb = useMemo(() => shortPath(currentDocument?.filePath), [currentDocument?.filePath]);
  const lang = useMemo(() => langFromPath(currentDocument?.filePath), [currentDocument?.filePath]);

  useEffect(() => {
    onBreadcrumbChange?.(breadcrumb);
  }, [breadcrumb, onBreadcrumbChange]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    if (!filePath) { workbenchStore.setSelectedFile(filePath); return; }
    void onDemandFileSelect(filePath);
  }, [onDemandFileSelect]);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => toast.error('Failed to update file content'));
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  const isLoadingFiles =
    generationStatus?.phase === 'fetching-s3' ||
    (generationStatus?.phase === 'polling' && Object.keys(files).length === 0);

  return (
    <div className={classNames(
      'flex flex-col h-full w-full overflow-hidden',
      theme === 'light' ? 'workbench-ide-light' : 'workbench-ide-dark',
    )}>
      {/* ── Body: activity bar + editor ──────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity bar */}
        <div className="ide-activity-bar flex flex-col items-center pt-2 gap-1 w-10 flex-shrink-0 border-r">
          <ActivityIcon title="Explorer" active={sidebarView === 'files'} onClick={() => setSidebarView('files')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
            </svg>
          </ActivityIcon>
          <ActivityIcon title="Search" active={sidebarView === 'search'} onClick={() => setSidebarView('search')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          </ActivityIcon>
          <ActivityIcon title="Source Control">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5C7 3.346 5.654 2 4 2S1 3.346 1 5c0 1.302.839 2.401 2 2.815V16h2V7.815C6.161 7.401 7 6.302 7 5zm-2 0c0 .551-.449 1-1 1s-1-.449-1-1 .449-1 1-1 1 .449 1 1zm12 9.185V14c0-1.654-1.346-3-3-3h-3V9h5l-4-4-4 4h5v2H12c-2.757 0-5 2.243-5 5v.185C5.839 16.599 5 17.698 5 19c0 1.654 1.346 3 3 3s3-1.346 3-3c0-1.302-.839-2.401-2-2.815V14c0-1.103.897-2 2-2h3v2.185C12.839 14.599 12 15.698 12 17c0 1.654 1.346 3 3 3s3-1.346 3-3c0-1.302-.839-2.401-2-2.815zM8 19c0 .551-.449 1-1 1s-1-.449-1-1 .449-1 1-1 1 .449 1 1zm7 1c-.551 0-1-.449-1-1s.449-1 1-1 1 .449 1 1-.449 1-1 1z" />
            </svg>
          </ActivityIcon>
          <div className="flex-1" />
          <ActivityIcon title="Extensions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 5h-2V3c0-1.103-.897-2-2-2H9c-1.103 0-2 .897-2 2v2H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2V7c0-1.103-.897-2-2-2zm-8-2h4v2H9V3zm8 18H5V7h2v2h2V7h4v2h2V7h2v14z" />
            </svg>
          </ActivityIcon>
        </div>

        {/* Editor panel */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <ClientOnly fallback={<div className="flex-1 bg-migratex-elements-background-depth-1 h-full" />}>
            {() => (
              <EditorPanel
                editorDocument={currentDocument}
                isStreaming={false}
                isLoadingFiles={isLoadingFiles}
                selectedFile={selectedFile}
                files={files}
                unsavedFiles={unsavedFiles}
                sidebarView={sidebarView}
                onSidebarViewChange={setSidebarView}
                onFileSelect={onFileSelect}
                onEditorScroll={onEditorScroll}
                onEditorChange={onEditorChange}
                onFileSave={onFileSave}
                onFileReset={onFileReset}
              />
            )}
          </ClientOnly>
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <StatusBar lang={lang} cursorPos={cursorPos} />
    </div>
  );
});
