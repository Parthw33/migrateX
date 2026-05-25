/**
 * Multi-tab editor state for the Monaco workbench editor.
 *
 * Tab "identity" is the workbench file path (e.g. `/home/project/app/page.tsx`).
 * Each open tab also caches the most recent cursor position + scroll offset so
 * switching back restores the user's place.
 */

import { atom, map } from 'nanostores';
import type { ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';

export interface EditorViewState {
  /** 1-indexed line number for the cursor (Monaco convention). */
  line?: number;
  /** 1-indexed column number for the cursor. */
  column?: number;
  scroll?: ScrollPosition;
  /** Whether the tab was opened in "diff" mode (vs. plain text). */
  mode?: 'edit' | 'diff';
}

export interface EditorTab {
  filePath: string;
  /** True until the user explicitly pins this tab (e.g. double-click or keep-open). */
  preview: boolean;
  viewState?: EditorViewState;
}

export interface EditorTabsState {
  /** Open tabs, ordered left-to-right. */
  tabs: EditorTab[];
  /** Currently focused file path, or null when nothing is open. */
  activeFilePath: string | null;
}

const PERSIST_KEY = 'migratex_editor_tabs_v1';

function loadPersisted(): EditorTabsState {
  if (typeof window === 'undefined') {
    return { tabs: [], activeFilePath: null };
  }
  try {
    const raw = window.sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return { tabs: [], activeFilePath: null };
    const parsed = JSON.parse(raw) as Partial<EditorTabsState>;
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs.filter((t): t is EditorTab => !!t && typeof t.filePath === 'string')
      : [];
    return {
      tabs,
      activeFilePath:
        typeof parsed.activeFilePath === 'string' && tabs.some((t) => t.filePath === parsed.activeFilePath)
          ? parsed.activeFilePath
          : tabs[0]?.filePath ?? null,
    };
  } catch {
    return { tabs: [], activeFilePath: null };
  }
}

export const editorTabsStore = map<EditorTabsState>(loadPersisted());

function persist() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PERSIST_KEY, JSON.stringify(editorTabsStore.get()));
  } catch {
    // quota or privacy mode — ignore
  }
}

editorTabsStore.listen(persist);

/* ── Pending diff state (AI-generated edits awaiting review) ──────────────── */

export interface PendingDiff {
  filePath: string;
  /** Original document content (left side of the diff). */
  original: string;
  /** Proposed content (right side). */
  modified: string;
  /** Short label shown in the diff title bar. */
  label?: string;
}

/** When set, the workbench renders Monaco's DiffEditor for this file. */
export const pendingDiffStore = atom<PendingDiff | null>(null);

/* ── Helpers ──────────────────────────────────────────────────────────────── */

export const editorTabs = {
  /** Open (or focus) a tab in normal edit mode. */
  open(filePath: string, opts: { preview?: boolean } = {}) {
    const state = editorTabsStore.get();
    const existing = state.tabs.find((t) => t.filePath === filePath);

    if (existing) {
      // Promote a preview tab to a regular tab when opened explicitly.
      if (!opts.preview && existing.preview) {
        editorTabsStore.setKey(
          'tabs',
          state.tabs.map((t) => (t.filePath === filePath ? { ...t, preview: false } : t)),
        );
      }
      editorTabsStore.setKey('activeFilePath', filePath);
      return;
    }

    // VSCode behaviour: only one "preview" tab at a time — clicking a different
    // file in the explorer replaces the existing preview tab.
    const previewIndex = state.tabs.findIndex((t) => t.preview);
    const next: EditorTab = { filePath, preview: opts.preview ?? false };
    const tabs =
      previewIndex >= 0 && opts.preview !== false
        ? state.tabs.map((t, i) => (i === previewIndex ? next : t))
        : [...state.tabs, next];

    editorTabsStore.set({ tabs, activeFilePath: filePath });
  },

  /** Pin a tab so it survives the next preview-open. */
  pin(filePath: string) {
    const tabs = editorTabsStore.get().tabs.map((t) => (t.filePath === filePath ? { ...t, preview: false } : t));
    editorTabsStore.setKey('tabs', tabs);
  },

  /** Close a tab and pick a reasonable next-active tab. */
  close(filePath: string) {
    const state = editorTabsStore.get();
    const index = state.tabs.findIndex((t) => t.filePath === filePath);
    if (index < 0) return;
    const tabs = state.tabs.filter((t) => t.filePath !== filePath);
    let activeFilePath = state.activeFilePath;
    if (state.activeFilePath === filePath) {
      activeFilePath = tabs[Math.min(index, tabs.length - 1)]?.filePath ?? null;
    }
    editorTabsStore.set({ tabs, activeFilePath });
  },

  closeOthers(filePath: string) {
    const state = editorTabsStore.get();
    const keep = state.tabs.find((t) => t.filePath === filePath);
    editorTabsStore.set({ tabs: keep ? [keep] : [], activeFilePath: keep?.filePath ?? null });
  },

  closeAll() {
    editorTabsStore.set({ tabs: [], activeFilePath: null });
  },

  setActive(filePath: string | null) {
    editorTabsStore.setKey('activeFilePath', filePath);
  },

  /** Update the cached view state for a tab — called on cursor / scroll change. */
  setViewState(filePath: string, partial: EditorViewState) {
    const tabs = editorTabsStore.get().tabs;
    const idx = tabs.findIndex((t) => t.filePath === filePath);
    if (idx < 0) return;
    const next = [...tabs];
    next[idx] = { ...next[idx], viewState: { ...next[idx].viewState, ...partial } };
    editorTabsStore.setKey('tabs', next);
  },

  reorder(from: number, to: number) {
    const state = editorTabsStore.get();
    if (from === to || from < 0 || to < 0 || from >= state.tabs.length || to >= state.tabs.length) return;
    const next = [...state.tabs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    editorTabsStore.setKey('tabs', next);
  },
};

/* ── Pending-diff helpers ─────────────────────────────────────────────────── */

export const pendingDiff = {
  show(diff: PendingDiff) {
    pendingDiffStore.set(diff);
    editorTabs.open(diff.filePath);
  },

  clear() {
    pendingDiffStore.set(null);
  },
};
