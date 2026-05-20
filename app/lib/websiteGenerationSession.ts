/** Session after POST /website/start `{ jobId }` — stores API job id plus migration metadata for the UI. */

import { atom } from 'nanostores';

export const WEBSITE_GEN_SESSION_KEY = 'migratex_website_gen_session';

/** Bumps when website gen session is written or cleared so poll hooks re-subscribe. */
export const websiteGenerationSessionRevision = atom(0);

/** Increment to run a one-shot full sync (GET /live + all known manifest paths). */
export const websiteLiveManualSyncRevision = atom(0);

export function requestWebsiteLiveFilesSync(): void {
  websiteLiveManualSyncRevision.set(websiteLiveManualSyncRevision.get() + 1);
}

export interface WebsiteGenerationSession {
  jobId: string;
  url: string;
  cs_stack_api_key: string;
  cs_org_id: string;
  cs_region: string;
  s3WebsitePrefix: string;
  startedAt: string;
}

export function getWebsiteGenerationSession(): WebsiteGenerationSession | null {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = globalThis.sessionStorage.getItem(WEBSITE_GEN_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<WebsiteGenerationSession>;
    const jobId = typeof parsed.jobId === 'string' ? parsed.jobId.trim() : '';

    if (!jobId) {
      return null;
    }

    return {
      jobId,
      url: typeof parsed.url === 'string' ? parsed.url : '',
      cs_stack_api_key: typeof parsed.cs_stack_api_key === 'string' ? parsed.cs_stack_api_key : '',
      cs_org_id: typeof parsed.cs_org_id === 'string' ? parsed.cs_org_id : '',
      cs_region: typeof parsed.cs_region === 'string' ? parsed.cs_region : '',
      s3WebsitePrefix: typeof parsed.s3WebsitePrefix === 'string' ? parsed.s3WebsitePrefix : '',
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
    };
  } catch {
    return null;
  }
}

export function setWebsiteGenerationSession(session: WebsiteGenerationSession): void {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return;
  }

  globalThis.sessionStorage.setItem(WEBSITE_GEN_SESSION_KEY, JSON.stringify(session));
  websiteLiveManualSyncRevision.set(0);
  websiteGenerationSessionRevision.set(websiteGenerationSessionRevision.get() + 1);
}

export function clearWebsiteGenerationSession(): void {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return;
  }

  globalThis.sessionStorage.removeItem(WEBSITE_GEN_SESSION_KEY);
  websiteLiveManualSyncRevision.set(0);
  websiteGenerationSessionRevision.set(websiteGenerationSessionRevision.get() + 1);
}
