/**
 * Temporary snapshot of scrape job + Contentstack fields when opening a job from the dashboard
 * or after GET /scrape/{id} resume. Used for session metadata; POST /website/start sends `{ jobId }` only.
 */

import { authStore } from '~/lib/stores/auth';
import { migrationStore } from '~/lib/stores/migration';
import type { MigrateXScrapeJob } from '~/lib/lambdaApi';

export const DASHBOARD_JOB_CONTEXT_KEY = 'migratex_dashboard_job_context';

export interface DashboardJobContext {
  scrapeJobId: string;
  websiteUrl: string;
  cs_stack_api_key: string;
  cs_org_id: string;
  cs_region: string;
  s3WebsitePrefix: string;
  updatedAt: string;
}

export function getDashboardJobContext(): DashboardJobContext | null {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = globalThis.sessionStorage.getItem(DASHBOARD_JOB_CONTEXT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<DashboardJobContext>;
    const scrapeJobId = typeof parsed.scrapeJobId === 'string' ? parsed.scrapeJobId.trim() : '';

    if (!scrapeJobId) {
      return null;
    }

    return {
      scrapeJobId,
      websiteUrl: typeof parsed.websiteUrl === 'string' ? parsed.websiteUrl : '',
      cs_stack_api_key: typeof parsed.cs_stack_api_key === 'string' ? parsed.cs_stack_api_key : '',
      cs_org_id: typeof parsed.cs_org_id === 'string' ? parsed.cs_org_id : '',
      cs_region: typeof parsed.cs_region === 'string' ? parsed.cs_region : '',
      s3WebsitePrefix: typeof parsed.s3WebsitePrefix === 'string' ? parsed.s3WebsitePrefix : '',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

export function setDashboardJobContext(ctx: DashboardJobContext): void {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return;
  }

  globalThis.sessionStorage.setItem(DASHBOARD_JOB_CONTEXT_KEY, JSON.stringify(ctx));
}

export function clearDashboardJobContext(): void {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return;
  }

  globalThis.sessionStorage.removeItem(DASHBOARD_JOB_CONTEXT_KEY);
}

/** Call when user clicks a job card on the dashboard (before navigation). */
export function primeDashboardJobContextFromCard(job: MigrateXScrapeJob): void {
  const st = migrationStore.get();
  const region = authStore.get().region || 'NA';

  setDashboardJobContext({
    scrapeJobId: job.id,
    websiteUrl: (job.url || st.websiteUrl).trim(),
    cs_stack_api_key: st.stackUid.trim(),
    cs_org_id: st.csOrganizationUid.trim(),
    cs_region: region,
    s3WebsitePrefix: '',
    updatedAt: new Date().toISOString(),
  });
}
