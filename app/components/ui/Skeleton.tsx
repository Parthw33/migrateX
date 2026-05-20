/**
 * Skeleton.tsx
 *
 * Composable skeleton loading components used throughout MigrateX.
 * All variants use CSS animations defined in skeleton.scss and respect the
 * design-token colour system (dark / light themes).
 *
 * Usage:
 *   <Skeleton.Text lines={3} />
 *   <Skeleton.Card />
 *   <Skeleton.JobCard />
 *   <Skeleton.FileTreeRow depth={1} />
 *   <Skeleton.Avatar />
 */

import { classNames } from '~/utils/classNames';

/* ── Base building block ────────────────────────────────────────────────── */

interface BaseProps {
  className?: string;
  /** Animation style – shimmer (default) or pulse */
  variant?: 'shimmer' | 'pulse';
  style?: React.CSSProperties;
}

function Base({ className, variant = 'shimmer', style }: BaseProps) {
  return (
    <div
      aria-hidden
      style={style}
      className={classNames(
        variant === 'shimmer' ? 'skeleton-shimmer' : 'skeleton-pulse',
        className,
      )}
    />
  );
}

/* ── Text lines ─────────────────────────────────────────────────────────── */

interface TextProps extends BaseProps {
  lines?: number;
  /** Last line shorter (looks more natural for paragraph text) */
  lastShort?: boolean;
}

function Text({ lines = 1, lastShort = true, variant, className }: TextProps) {
  return (
    <div className={classNames('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Base
          key={i}
          variant={variant}
          className={classNames(
            'h-3.5 rounded',
            lastShort && i === lines - 1 ? 'w-3/5' : 'w-full',
          )}
        />
      ))}
    </div>
  );
}

/* ── Avatar / icon circle ───────────────────────────────────────────────── */

interface AvatarProps extends BaseProps {
  size?: number;
}

function Avatar({ size = 36, variant, className }: AvatarProps) {
  return (
    <Base
      variant={variant}
      className={classNames('rounded-full flex-shrink-0', className)}
      style={{ width: size, height: size }}
    />
  );
}

/* ── Pill / badge ───────────────────────────────────────────────────────── */

function Pill({ variant, className }: BaseProps) {
  return (
    <Base
      variant={variant}
      className={classNames('h-5 w-16 rounded-full', className)}
    />
  );
}

/* ── Dashboard Job Card ─────────────────────────────────────────────────── */

function JobCard({ variant }: { variant?: 'shimmer' | 'pulse' }) {
  return (
    <div
      aria-hidden
      className="rounded-xl border border-migratex-elements-borderColor bg-white flex flex-col min-h-[200px] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-migratex-elements-borderColor/60 flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Base variant={variant} className="h-4 w-4/5 rounded" />
          <Base variant={variant} className="h-3 w-2/5 rounded" />
        </div>
        <Base variant={variant} className="h-6 w-6 rounded-lg flex-shrink-0" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 px-4 py-4 border-b border-migratex-elements-borderColor/40">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Base variant={variant} className="h-5 w-10 rounded" />
            <Base variant={variant} className="h-2.5 w-14 rounded" />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto px-5 py-3 flex items-center justify-between">
        <Base variant={variant} className="h-3 w-20 rounded" />
        <Base variant={variant} className="h-3 w-24 rounded" />
      </div>

      {/* URL row */}
      <div className="px-5 pb-3">
        <Base variant={variant} className="h-2.5 w-3/4 rounded" />
      </div>
    </div>
  );
}

/* ── Dashboard grid ─────────────────────────────────────────────────────── */

function JobGrid({ count = 8, variant }: { count?: number; variant?: 'shimmer' | 'pulse' }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <JobCard key={i} variant={variant} />
      ))}
    </div>
  );
}

/* ── File-tree row ──────────────────────────────────────────────────────── */

interface FileTreeRowProps {
  depth?: number;
  variant?: 'shimmer' | 'pulse';
  isFolder?: boolean;
  width?: string;
}

function FileTreeRow({ depth = 0, variant = 'pulse', isFolder = false, width = '60%' }: FileTreeRowProps) {
  const paddingLeft = 6 + depth * 8;
  return (
    <div
      aria-hidden
      className="file-tree-skeleton-row"
      style={{ paddingLeft }}
    >
      {/* Icon placeholder */}
      <Base
        variant={variant}
        className={classNames('flex-shrink-0', isFolder ? 'w-3.5 h-3.5 rounded-sm' : 'w-3.5 h-3.5 rounded-sm')}
      />
      {/* Name placeholder */}
      <Base variant={variant} className="h-2.5 rounded" style={{ width }} />
    </div>
  );
}

/* ── File-tree skeleton (full panel) ────────────────────────────────────── */

const FILE_TREE_ROWS: FileTreeRowProps[] = [
  { depth: 0, isFolder: true,  width: '55%' },
  { depth: 1, isFolder: false, width: '65%' },
  { depth: 1, isFolder: false, width: '48%' },
  { depth: 1, isFolder: true,  width: '40%' },
  { depth: 2, isFolder: false, width: '70%' },
  { depth: 2, isFolder: false, width: '58%' },
  { depth: 0, isFolder: true,  width: '45%' },
  { depth: 1, isFolder: false, width: '60%' },
  { depth: 0, isFolder: false, width: '38%' },
  { depth: 0, isFolder: false, width: '52%' },
];

function FileTreePanel({ variant }: { variant?: 'shimmer' | 'pulse' }) {
  return (
    <div aria-label="Loading file tree…" className="pt-2">
      {FILE_TREE_ROWS.map((props, i) => (
        <FileTreeRow key={i} {...props} variant={variant} />
      ))}
    </div>
  );
}

/* ── Editor content area ────────────────────────────────────────────────── */

function EditorContent({ variant }: { variant?: 'shimmer' | 'pulse' }) {
  const LINE_WIDTHS = ['75%', '90%', '55%', '80%', '0%', '68%', '88%', '45%', '72%', '0%', '60%', '83%'];
  return (
    <div aria-hidden className="p-4 space-y-2.5 font-mono">
      {LINE_WIDTHS.map((w, i) => (
        w === '0%'
          ? <div key={i} className="h-3" />
          : <Base key={i} variant={variant} className="h-2.5 rounded-sm" style={{ width: w, marginLeft: i > 1 && i < 4 ? '16px' : undefined }} />
      ))}
    </div>
  );
}

/* ── Step card (pipeline step) ──────────────────────────────────────────── */

function StepCard({ variant }: { variant?: 'shimmer' | 'pulse' }) {
  return (
    <div aria-hidden className="bg-white rounded-xl border border-migratex-elements-borderColor p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Base variant={variant} className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Base variant={variant} className="h-4 w-2/5 rounded" />
          <Base variant={variant} className="h-3 w-1/3 rounded" />
        </div>
      </div>
      <Text lines={3} variant={variant} />
      <Base variant={variant} className="h-9 w-full rounded-lg" />
    </div>
  );
}

/* ── Log line rows ──────────────────────────────────────────────────────── */

function LogLines({ count = 6, variant }: { count?: number; variant?: 'shimmer' | 'pulse' }) {
  const WIDTHS = ['85%', '70%', '90%', '60%', '78%', '65%', '88%', '55%'];
  return (
    <div aria-hidden className="space-y-2 px-3 py-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Base variant={variant} className="h-2 w-12 rounded flex-shrink-0" />
          <Base variant={variant} className="h-2 rounded" style={{ width: WIDTHS[i % WIDTHS.length] }} />
        </div>
      ))}
    </div>
  );
}

/* ── Named export namespace ─────────────────────────────────────────────── */

export const Skeleton = {
  Base,
  Text,
  Avatar,
  Pill,
  JobCard,
  JobGrid,
  FileTreeRow,
  FileTreePanel,
  EditorContent,
  StepCard,
  LogLines,
};

export default Skeleton;
