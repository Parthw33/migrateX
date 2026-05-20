/**
 * WorkbenchHeader.tsx
 *
 * The ONE and ONLY top bar for the generate-website workbench.
 * Renders across the full width above all three panels.
 *
 * Contains:
 *  - MigrateX logo + title (links → /dashboard)
 *  - Generation phase badge
 *  - Panel visibility toggles (Chat | Code | Preview)
 *  - File breadcrumb
 *  - Action buttons (Sync · Build · Terminal · Theme · Pipeline)
 */

import { memo } from 'react';
import { Link } from '@remix-run/react';
import { classNames } from '~/utils/classNames';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import type { WebsiteGenerationStatus } from '~/lib/hooks/useWebsiteLiveGenerationPoll';

/* ── MigrateX logo SVG ──────────────────────────────────────────────────── */

function MXLogo({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="26"
      viewBox="0 0 20 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M19.715 9.945v4.107l-9.878 1.37L0 14.052V9.945l9.837-1.37 9.878 1.37zM0 19.529v-4.107l5.75 3.08 13.965-3.08v4.107L5.75 23.979 0 19.53z"
        fill="#7c3aed"
      />
      <path d="M19.715 4.47v4.107l-5.75-3.08L0 8.577V4.47L13.965.02l5.75 4.45z" fill="#7c3aed" />
    </svg>
  );
}

/* ── Phase badge ────────────────────────────────────────────────────────── */

const PHASE_STYLE: Record<string, { dot: string; text: string; bg: string }> = {
  connecting: {
    dot: 'bg-blue-400 dark:bg-blue-400',
    text: 'text-blue-700 dark:text-blue-200',
    bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/55 dark:border-blue-800/80',
  },
  generating: {
    dot: 'bg-violet-400 dark:bg-violet-400',
    text: 'text-violet-700 dark:text-violet-200',
    bg: 'bg-violet-50 border-violet-200 dark:bg-violet-950/50 dark:border-violet-800/70',
  },
  'fetching-files': {
    dot: 'bg-indigo-400 dark:bg-indigo-400',
    text: 'text-indigo-700 dark:text-indigo-200',
    bg: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-800/70',
  },
  'fetching-s3': {
    dot: 'bg-indigo-400 dark:bg-indigo-400',
    text: 'text-indigo-700 dark:text-indigo-200',
    bg: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-800/70',
  },
  polling: {
    dot: 'bg-violet-400 dark:bg-violet-400',
    text: 'text-violet-700 dark:text-violet-200',
    bg: 'bg-violet-50 border-violet-200 dark:bg-violet-950/50 dark:border-violet-800/70',
  },
  syncing: {
    dot: 'bg-sky-400 dark:bg-sky-400',
    text: 'text-sky-700 dark:text-sky-200',
    bg: 'bg-sky-50 border-sky-200 dark:bg-sky-950/50 dark:border-sky-800/70',
  },
  deploying: {
    dot: 'bg-amber-400 dark:bg-amber-400',
    text: 'text-amber-800 dark:text-amber-200',
    bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/45 dark:border-amber-800/70',
  },
  paused: {
    dot: 'bg-gray-400 dark:bg-gray-500',
    text: 'text-gray-600 dark:text-gray-300',
    bg: 'bg-gray-50 border-gray-200 dark:bg-gray-900/60 dark:border-gray-700',
  },
  done: {
    dot: 'bg-green-400 dark:bg-green-400',
    text: 'text-green-700 dark:text-green-200',
    bg: 'bg-green-50 border-green-200 dark:bg-green-950/45 dark:border-green-800/70',
  },
  error: {
    dot: 'bg-red-400 dark:bg-red-400',
    text: 'text-red-700 dark:text-red-200',
    bg: 'bg-red-50 border-red-200 dark:bg-red-950/45 dark:border-red-800/70',
  },
};

function PhaseBadge({ phase, genPhase }: { phase: string; genPhase: string }) {
  const active = (phase !== 'idle' ? phase : genPhase) || 'idle';
  if (active === 'idle') return null;

  const style = PHASE_STYLE[active] ?? {
    dot: 'bg-gray-400 dark:bg-gray-500',
    text: 'text-gray-600 dark:text-gray-300',
    bg: 'bg-gray-50 border-gray-200 dark:bg-gray-900/60 dark:border-gray-700',
  };
  const label = active.replace(/-/g, ' ');
  const isPulsing = !['done', 'error', 'paused', 'idle'].includes(active);

  return (
    <span
      className={classNames(
        'flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap',
        style.text,
        style.bg,
      )}
    >
      <span
        className={classNames('w-1.5 h-1.5 rounded-full flex-shrink-0', style.dot)}
        style={isPulsing ? { animation: 'pulse 1.4s ease-in-out infinite' } : undefined}
      />
      {label}
    </span>
  );
}

/* ── Panel toggle button ────────────────────────────────────────────────── */

function PanelToggle({
  label,
  icon,
  primary = false,
  active,
  disabled,
  onClick,
  title,
}: {
  label: string;
  icon: string;
  primary?: boolean;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={classNames(
        'flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all',
        primary
          ? 'bg-[#6C5CE7] border-[#6C5CE7] text-white hover:bg-[#5b4bcf]'
          : active
            ? 'bg-[#6C5CE7] border-[#6C5CE7] text-white'
            : 'bg-migratex-elements-background-depth-2 border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-3 hover:text-migratex-elements-textPrimary',
        { 'opacity-50 cursor-not-allowed': Boolean(disabled) },
      )}
    >
      <span className={classNames(icon, 'text-sm')} />
      {label}
    </button>
  );
}

/* ── Action button ──────────────────────────────────────────────────────── */

function ActionBtn({
  label,
  icon,
  onClick,
  active,
  primary,
  disabled,
  title,
}: {
  label: string;
  icon?: string;
  onClick?: () => void;
  active?: boolean;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={classNames(
        'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap',
        primary
          ? 'bg-[#6C5CE7] border-[#6C5CE7] text-white hover:bg-[#5b4bcf]'
          : active
            ? 'bg-[#6C5CE7] border-[#6C5CE7] text-white'
            : 'bg-migratex-elements-background-depth-2 border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-3 hover:text-migratex-elements-textPrimary',
        { 'opacity-50 cursor-not-allowed': Boolean(disabled) },
      )}
    >
      {icon && <span className={classNames(icon, 'text-sm')} />}
      {label}
    </button>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */

export interface WorkbenchHeaderProps {
  /** Current file path for breadcrumb */
  breadcrumb?: string;
  /** Generation status from poll hook */
  generationStatus?: WebsiteGenerationStatus | null;
  /** Chat store phase */
  chatPhase?: string;
  /** Panel visibility */
  showChat: boolean;
  showIDE: boolean;
  showPreview: boolean;
  onToggleChat: () => void;
  onToggleIDE: () => void;
  onTogglePreview: () => void;
  /** Actions */
  showTerminal: boolean;
  onToggleTerminal: () => void;
  onSyncFiles: () => void;
  syncDisabled?: boolean;
  onBuild: () => void;
  onBack: () => void;
  /** True while a file is fetched on-demand */
  isFetchingFile?: boolean;
  fetchingPath?: string | null;
  /** Has live preview URL */
  hasPreviewUrl?: boolean;
}

export const WorkbenchHeader = memo(function WorkbenchHeader({
  breadcrumb,
  generationStatus,
  chatPhase = 'idle',
  showChat,
  showIDE,
  showPreview,
  onToggleChat,
  onToggleIDE,
  onTogglePreview,
  showTerminal,
  onToggleTerminal,
  onSyncFiles,
  syncDisabled,
  onBuild,
  onBack,
  isFetchingFile,
  fetchingPath,
  hasPreviewUrl,
}: WorkbenchHeaderProps) {
  const genPhase = generationStatus?.phase ?? 'idle';
  const genProgress = generationStatus?.progress ?? 0;
  const isLoadingBar = genPhase === 'fetching-s3' || genPhase === 'polling' || genPhase === 'syncing' || isFetchingFile;

  const fileLabel =
    isFetchingFile && fetchingPath
      ? `Loading: ${fetchingPath.split('/').pop()}`
      : generationStatus?.message && genPhase !== 'idle' && genPhase !== 'done'
        ? generationStatus.message
        : null;

  return (
    <header className="ide-toolbar flex flex-col flex-shrink-0 border-b border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 z-10 shadow-sm dark:shadow-[0_1px_0_0_rgba(1,4,9,0.85)]">
      <div className="flex items-center h-12 px-3 gap-2">
        {/* ── Logo → Dashboard ──────────────────────────────────────── */}
        <Link
          to="/dashboard"
          prefetch="intent"
          className="flex items-center gap-2 pr-3 border-r border-migratex-elements-borderColor mr-1 hover:opacity-80 transition-opacity flex-shrink-0"
          title="Back to Dashboard"
        >
          <MXLogo />
          <span className="text-sm font-semibold text-migratex-elements-textPrimary hidden sm:block">Migrate X</span>
        </Link>

        {/* ── Phase badge ───────────────────────────────────────────── */}
        <PhaseBadge phase={chatPhase} genPhase={genPhase} />

        {/* ── Panel toggles ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1 ml-1">
          <PanelToggle
            label="Chat"
            icon="i-ph:chat-circle-dots"
            active={showChat}
            onClick={onToggleChat}
            title="Toggle chat panel"
          />
          <PanelToggle
            label="Code"
            icon="i-ph:code"
            active={showIDE}
            onClick={onToggleIDE}
            title="Toggle code editor"
          />
          <PanelToggle
            label="Preview"
            icon="i-ph:eye"
            active={showPreview}
            disabled={!hasPreviewUrl}
            onClick={onTogglePreview}
            title={hasPreviewUrl ? 'Toggle website preview' : 'Preview available once site is deployed'}
          />
        </div>

        {/* ── Breadcrumb (centre) ───────────────────────────────────── */}
        <div className="flex-1 text-center text-[11px] text-migratex-elements-textTertiary truncate px-4 min-w-0">
          {fileLabel ?? breadcrumb ?? ''}
        </div>

        {/* ── Action buttons ────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ActionBtn
            label="Sync"
            icon="i-ph:arrows-clockwise"
            onClick={onSyncFiles}
            disabled={syncDisabled}
            title="Pull latest files from the server"
          />
          <ActionBtn label="Build" icon="i-ph:play" primary onClick={onBuild} />
          {/* <ActionBtn label="Terminal" icon="i-ph:terminal" active={showTerminal} onClick={onToggleTerminal} /> */}
          <ThemeSwitch className="text-migratex-elements-textSecondary hover:text-migratex-elements-textPrimary" />
          <ActionBtn label="Pipeline" icon="i-ph:caret-left" onClick={onBack} title="Back to migration pipeline" />
        </div>
      </div>

      {/* ── Loading progress bar ─────────────────────────────────────── */}
      {isLoadingBar && (
        <div className="w-full h-[2px] bg-migratex-elements-borderColor overflow-hidden flex-shrink-0">
          <div
            className="h-full bg-[#6C5CE7] transition-all duration-300"
            style={{
              width: genProgress > 0 ? `${genProgress}%` : '100%',
              animation: genProgress === 0 ? 'pulse 1.5s ease-in-out infinite' : undefined,
            }}
          />
        </div>
      )}
    </header>
  );
});
