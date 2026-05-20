import { getSupabaseClient } from '~/lib/supabaseClient';

export interface JobRowWebsiteCredentials {
  stackApiKey: string;
  orgId: string;
  url: string;
  region: string;
  s3WebsitePrefix: string;
}

const STACK_KEYS = [
  'stack_api_key',
  'stackApiKey',
  'cs_stack_api_key',
  'contentstack_stack_api_key',
  'api_key',
  'stack_key',
  'stack_uid',
];

const ORG_KEYS = [
  'org_id',
  'organization_uid',
  'cs_org_id',
  'org_uid',
  'organization_id',
  'contentstack_org_id',
];

const URL_KEYS = ['url', 'website_url', 'websiteUrl', 'source_url', 'site_url', 'crawl_url'];

const REGION_KEYS = ['cs_region', 'region', 'contentstack_region'];

const S3_PREFIX_KEYS = ['s3_website_prefix', 's3WebsitePrefix', 'website_s3_prefix'];

/** Full object key from crawl/import — sent as `s3WebsitePrefix` to POST /website/start when no explicit prefix. */
const S3_OBJECT_KEY_KEYS = ['s3_key', 's3Key', 'entries_s3_key', 'bundle_s3_key', 'export_s3_key'];

/** Columns that may hold a JSON object or JSON string with nested creds. */
const NESTED_JSON_KEYS = [
  'metadata',
  'config',
  'params',
  'payload',
  'job_config',
  'request',
  'scrape_params',
  'input',
  'options',
  'credentials',
  'stack_details',
  'contentstack',
];

function pickString(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    if (!(k in o)) {
      continue;
    }

    const v = o[k];

    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }

    if (typeof v === 'number' && !Number.isNaN(v)) {
      return String(v);
    }
  }

  return '';
}

function parseJsonRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null) {
    return null;
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) {
      return null;
    }

    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function mergeFromRecord(target: JobRowWebsiteCredentials, rec: Record<string, unknown>): void {
  if (!target.stackApiKey) {
    const v = pickString(rec, STACK_KEYS);
    if (v) {
      target.stackApiKey = v;
    }
  }

  if (!target.orgId) {
    const v = pickString(rec, ORG_KEYS);
    if (v) {
      target.orgId = v;
    }
  }

  if (!target.url) {
    const v = pickString(rec, URL_KEYS);
    if (v) {
      target.url = v;
    }
  }

  if (!target.region) {
    const v = pickString(rec, REGION_KEYS);
    if (v) {
      target.region = v;
    }
  }

  if (!target.s3WebsitePrefix) {
    const v = pickString(rec, S3_PREFIX_KEYS);
    if (v) {
      target.s3WebsitePrefix = v;
    }
  }

  if (!target.s3WebsitePrefix) {
    const key = pickString(rec, S3_OBJECT_KEY_KEYS);
    if (key) {
      target.s3WebsitePrefix = key;
    }
  }
}

export function extractJobRowWebsiteCredentials(row: Record<string, unknown>): JobRowWebsiteCredentials {
  const out: JobRowWebsiteCredentials = {
    stackApiKey: '',
    orgId: '',
    url: '',
    region: '',
    s3WebsitePrefix: '',
  };

  mergeFromRecord(out, row);

  for (const nk of NESTED_JSON_KEYS) {
    const nested = parseJsonRecord(row[nk]);
    if (nested) {
      mergeFromRecord(out, nested);
    }
  }

  if (typeof globalThis.sessionStorage !== 'undefined') {
    const sk = globalThis.sessionStorage.getItem('contentstack_api_key')?.trim();
    if (sk && !out.stackApiKey) {
      out.stackApiKey = sk;
    }
  }

  return out;
}

/**
 * Load `public.jobs` by id (same as REST `?select=*&id=eq.{jobId}`) and extract
 * Contentstack / URL fields for POST /website/start.
 */
export async function fetchWebsiteCredentialsFromSupabaseJob(
  jobId: string,
): Promise<{ ok: true; creds: JobRowWebsiteCredentials } | { ok: false; error: string }> {
  const id = jobId.trim();

  if (!id) {
    return { ok: false, error: 'Missing job id' };
  }

  const sb = getSupabaseClient();

  if (!sb) {
    return {
      ok: false,
      error: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load job credentials.',
    };
  }

  const { data, error } = await sb.from('jobs').select('*').eq('id', id).maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Job row not found' };
  }

  const creds = extractJobRowWebsiteCredentials(data as Record<string, unknown>);

  return { ok: true, creds };
}
