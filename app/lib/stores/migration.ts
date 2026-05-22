import { map } from 'nanostores';
import type { MigrationStep, ContentTypeSubStep } from '~/components/chat/types';

const MIGRATION_STATE_KEY = 'migratex-migration-state';

export interface MigrationState {
  currentStep: MigrationStep;
  websiteUrl: string;

  /** Human-readable project name entered alongside the URL on URL_INPUT. Sent to
   *  POST /scrape as `project_name` and surfaced in dashboard listings. */
  projectName: string;

  /** When set, POST /scrape includes these exact page URLs (see UrlInputChat). */
  selectUrls: string[];

  /** Max pages for POST /crawl (clamped server-side 1–500) */
  crawlMaxPages: number;

  /** Contentstack organization UID (for Lambda /scrape and stack APIs) */
  csOrganizationUid: string;
  /** Stack management / delivery API key (historical field name: stackUid). */
  stackUid: string;
  /** Contentstack stack UID for app.contentstack.com links (e.g. blt…). */
  contentstackStackUid: string;

  /** Stack API key was chosen in STACK_SETUP before scraping (affects MIGRATION back nav) */
  stackSelectedBeforeScrape: boolean;
  isScrapingComplete: boolean;
  currentSubStep: ContentTypeSubStep;
  analysisComplete: boolean;
  assetsComplete: boolean;
  entriesComplete: boolean;
  isTransitioningToWorkbench: boolean;
}

function loadPersistedState(): Partial<MigrationState> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const saved = localStorage.getItem(MIGRATION_STATE_KEY);

    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore parse errors
  }

  return {};
}

const persisted = loadPersistedState();

export const migrationStore = map<MigrationState>({
  currentStep: (persisted.currentStep as MigrationStep) ?? 'URL_INPUT',
  websiteUrl: persisted.websiteUrl ?? '',
  projectName: typeof persisted.projectName === 'string' ? persisted.projectName : '',
  selectUrls: Array.isArray(persisted.selectUrls)
    ? (persisted.selectUrls as string[]).filter((u) => typeof u === 'string' && u.trim())
    : [],
  crawlMaxPages:
    typeof persisted.crawlMaxPages === 'number' && persisted.crawlMaxPages > 0 ? persisted.crawlMaxPages : 20,
  csOrganizationUid: typeof persisted.csOrganizationUid === 'string' ? persisted.csOrganizationUid : '',
  stackUid: persisted.stackUid ?? '',
  contentstackStackUid:
    typeof persisted.contentstackStackUid === 'string' ? persisted.contentstackStackUid : '',
  stackSelectedBeforeScrape: persisted.stackSelectedBeforeScrape === true,
  isScrapingComplete: persisted.isScrapingComplete ?? false,
  currentSubStep: (persisted.currentSubStep as ContentTypeSubStep) ?? 'ANALYSIS',
  analysisComplete: persisted.analysisComplete ?? false,
  assetsComplete: persisted.assetsComplete ?? false,
  entriesComplete: persisted.entriesComplete ?? false,
  isTransitioningToWorkbench: false,
});

let persistQueued = false;

function persistState() {
  if (persistQueued) {
    return;
  }

  persistQueued = true;

  queueMicrotask(() => {
    persistQueued = false;

    if (typeof window === 'undefined') {
      return;
    }

    const state = migrationStore.get();

    try {
      localStorage.setItem(
        MIGRATION_STATE_KEY,
        JSON.stringify({
          currentStep: state.currentStep,
          websiteUrl: state.websiteUrl,
          projectName: state.projectName,
          selectUrls: state.selectUrls,
          crawlMaxPages: state.crawlMaxPages,
          csOrganizationUid: state.csOrganizationUid,
          stackUid: state.stackUid,
          contentstackStackUid: state.contentstackStackUid,
          stackSelectedBeforeScrape: state.stackSelectedBeforeScrape,
          isScrapingComplete: state.isScrapingComplete,
          currentSubStep: state.currentSubStep,
          analysisComplete: state.analysisComplete,
          assetsComplete: state.assetsComplete,
          entriesComplete: state.entriesComplete,
        }),
      );
    } catch {
      // ignore quota errors
    }
  });
}

migrationStore.listen(persistState);

export function resetMigrationStore() {
  migrationStore.set({
    currentStep: 'URL_INPUT',
    websiteUrl: '',
    projectName: '',
    selectUrls: [],
    crawlMaxPages: 20,
    csOrganizationUid: '',
    stackUid: '',
    contentstackStackUid: '',
    stackSelectedBeforeScrape: false,
    isScrapingComplete: false,
    currentSubStep: 'ANALYSIS',
    analysisComplete: false,
    assetsComplete: false,
    entriesComplete: false,
    isTransitioningToWorkbench: false,
  });

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(MIGRATION_STATE_KEY);
    } catch {
      // ignore
    }
  }
}
