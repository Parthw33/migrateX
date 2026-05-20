import type { ScrapeJobDetail } from '~/lib/lambdaApi';
import { setDashboardJobContext } from '~/lib/dashboardJobContext';
import { authStore } from '~/lib/stores/auth';
import { migrationStore } from '~/lib/stores/migration';
import { AUTO_IMPORT_OK_SESSION_KEY, setScrapeJobId } from '~/lib/scrapeJobSession';

function syncDashboardJobContextFromStores(detail: ScrapeJobDetail): void {
  const st = migrationStore.get();
  const region = authStore.get().region || 'NA';

  const s3FromDetail = detail.s3_key?.trim() ?? '';

  const stackApiKey = detail.cs_stack_api_key?.trim() || st.stackUid.trim();

  setDashboardJobContext({
    scrapeJobId: detail.id,
    websiteUrl: (detail.url?.trim() || st.websiteUrl).trim(),
    cs_stack_api_key: stackApiKey,
    cs_org_id: st.csOrganizationUid.trim(),
    cs_region: region,
    s3WebsitePrefix: s3FromDetail,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Align local migration + session with GET /scrape/{jobId} when resuming from the dashboard.
 */
export function applyScrapeJobDetailToMigration(detail: ScrapeJobDetail): void {
  setScrapeJobId(detail.id);
  migrationStore.setKey('websiteUrl', detail.url?.trim() || '');
  migrationStore.setKey('selectUrls', []);

  const stackFromApi = detail.cs_stack_api_key?.trim();
  if (stackFromApi) {
    migrationStore.setKey('stackUid', stackFromApi);
  }

  if (typeof globalThis.sessionStorage !== 'undefined') {
    const prevOk = globalThis.sessionStorage.getItem(AUTO_IMPORT_OK_SESSION_KEY);
    if (prevOk && prevOk !== detail.id) {
      globalThis.sessionStorage.removeItem(AUTO_IMPORT_OK_SESSION_KEY);
    }
  }

  try {
    const err = detail.error?.trim();
    const status = (detail.status || '').toLowerCase();
    const progress = typeof detail.progress === 'number' && !Number.isNaN(detail.progress) ? detail.progress : 0;
    const hasStack = migrationStore.get().stackUid.trim().length > 0;

    if (err) {
      migrationStore.setKey('currentStep', 'SCRAPING');
      migrationStore.setKey('isScrapingComplete', false);
      return;
    }

    if (status === 'failed' || status === 'error') {
      migrationStore.setKey('currentStep', 'SCRAPING');
      migrationStore.setKey('isScrapingComplete', false);
      return;
    }

    if (status === 'completed' && progress >= 100) {
      migrationStore.setKey('currentStep', 'IMPORT_STACK');
      migrationStore.setKey('isScrapingComplete', true);
      migrationStore.setKey('stackSelectedBeforeScrape', hasStack);
      return;
    }

    if (!hasStack) {
      migrationStore.setKey('currentStep', 'STACK_SETUP');
    } else {
      migrationStore.setKey('currentStep', 'SCRAPING');
    }
    migrationStore.setKey('isScrapingComplete', false);
  } finally {
    syncDashboardJobContextFromStores(detail);
  }
}
