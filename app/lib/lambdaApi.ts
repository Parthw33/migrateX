/**
 * Migrate-X Lambda API — all routes use `VITE_MIGRATEX_API_BASE_URL`.
 */

const DEFAULT_MIGRATEX_API_BASE = 'https://urvxl6wfdczucr5bromr4ro4cy0hnmpe.lambda-url.us-east-2.on.aws';

export function migratexApiBase(): string {
  const raw =
    import.meta.env.VITE_MIGRATEX_API_BASE_URL ||
    import.meta.env.VITE_LAMBDA_API_URL ||
    import.meta.env.LAMBDA_API_URL ||
    DEFAULT_MIGRATEX_API_BASE;
  return String(raw).trim().replace(/\/+$/, '');
}

export function migratexApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${migratexApiBase()}${p}`;
}

/** @deprecated Prefer migratexApiBase */
export function lambdaApiBase(): string {
  return migratexApiBase();
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface LambdaLoginResponse {
  token: string;
  cs_user_id: string;
  cs_region: string;
}

export async function lambdaLogin(body: Record<string, string>): Promise<LambdaLoginResponse> {
  const res = await fetch(migratexApiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as LambdaLoginResponse & {
    error_message?: string;
    message?: string;
    tfa_required?: boolean;
  };

  if (!res.ok) {
    throw new Error(data.error_message || data.message || `Login failed (${res.status})`);
  }

  if (!data.token) {
    throw new Error('Login response missing token');
  }

  return {
    token: data.token,
    cs_user_id: data.cs_user_id,
    cs_region: data.cs_region,
  };
}

export interface LambdaOrg {
  uid: string;
  name: string;
}

function parseOrgList(data: unknown): LambdaOrg[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const o = data as Record<string, unknown>;
  const raw = o.organizations ?? o.orgs ?? o.data ?? [];
  const list = Array.isArray(raw) ? raw : [];

  return list
    .map((item) => {
      const x = item as Record<string, unknown>;
      const uid = String(x.uid ?? x.organization_uid ?? x.org_uid ?? x.id ?? '').trim();

      if (!uid) {
        return null;
      }

      const name = String(x.name ?? x.organization_name ?? x.display_name ?? uid);

      return { uid, name };
    })
    .filter((x): x is LambdaOrg => x != null);
}

/** GET /orgs */
export async function lambdaListOrganizations(token: string): Promise<LambdaOrg[]> {
  try {
    const res = await fetch(migratexApiUrl('/orgs'), {
      headers: authHeaders(token),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return [];
    }

    return parseOrgList(data);
  } catch {
    return [];
  }
}

export interface LambdaStack {
  uid?: string;
  name?: string;
  api_key: string;
}

function parseStackList(data: unknown): LambdaStack[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const o = data as Record<string, unknown>;
  const raw = o.stacks ?? o.stack ?? o.data ?? [];
  const list = Array.isArray(raw) ? raw : [];

  return list.flatMap((item) => {
    const x = item as Record<string, unknown>;
    const apiKey = String(x.api_key ?? x.apiKey ?? '').trim();

    if (!apiKey) {
      return [];
    }

    const s: LambdaStack = { api_key: apiKey };

    if (x.uid != null) {
      s.uid = String(x.uid);
    }

    if (x.name != null) {
      s.name = String(x.name);
    }

    return [s];
  });
}

/** GET /stacks?organization_uid= */
export async function lambdaListStacks(token: string, organizationUid: string): Promise<LambdaStack[]> {
  const q = new URLSearchParams({ organization_uid: organizationUid });
  const res = await fetch(`${migratexApiUrl('/stacks')}?${q}`, {
    headers: authHeaders(token),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      (data as { error_message?: string }).error_message ||
      (data as { message?: string }).message ||
      `Stacks request failed (${res.status})`;
    throw new Error(msg);
  }

  return parseStackList(data);
}

/** POST /stacks — body: { name, description, master_locale, org_uid } */
export async function lambdaCreateStack(
  token: string,
  orgUid: string,
  stack: { name: string; description: string; master_locale: string },
): Promise<{ api_key?: string; uid?: string; stack?: { api_key?: string; uid?: string } }> {
  const res = await fetch(migratexApiUrl('/stacks'), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      name: stack.name,
      description: stack.description,
      master_locale: stack.master_locale,
      org_uid: orgUid,
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err =
      (data as { error_message?: string }).error_message ||
      (data as { message?: string }).message ||
      `Create stack failed (${res.status})`;
    throw new Error(err);
  }

  return data as { api_key?: string; uid?: string; stack?: { api_key?: string; uid?: string } };
}

export interface LambdaLocale {
  /** e.g. "en-us" */
  code: string;
  /** e.g. "English - United States" */
  name: string;
  fallback_locale?: string | null;
}

/** GET /locales — returns all Contentstack locales available to the authed user. */
export async function lambdaListLocales(token: string): Promise<LambdaLocale[]> {
  try {
    const res = await fetch(migratexApiUrl('/locales'), {
      headers: authHeaders(token),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return [];
    }

    const o = data as Record<string, unknown>;
    const raw = o.locales ?? o.data ?? [];
    const list = Array.isArray(raw) ? raw : [];

    return list
      .map((item) => {
        const x = item as Record<string, unknown>;
        const code = String(x.code ?? x.locale_uid ?? x.uid ?? '')
          .trim()
          .toLowerCase();
        const name = String(x.name ?? x.locale_name ?? code);

        if (!code) {
          return null;
        }

        return { code, name, fallback_locale: (x.fallback_locale as string | null) ?? null };
      })
      .filter((x): x is LambdaLocale => x != null);
  } catch {
    return [];
  }
}

export interface LambdaScrapeBody {
  url: string;
  cs_stack_api_key: string;
  cs_org_id: string;
  cs_region: string;
  maxPages?: number;
  maxDepth?: number;

  /** Exact pages to crawl when limiting scope (sent as `selectUrls` in JSON). */
  selectUrls?: string[];
}

export async function lambdaScrape(token: string, body: LambdaScrapeBody): Promise<Response> {
  const payload: Record<string, string | number | string[]> = {
    url: body.url,
    cs_stack_api_key: body.cs_stack_api_key,
    cs_org_id: body.cs_org_id ?? '',
    cs_region: body.cs_region,
  };

  if (body.maxPages != null) {
    payload.max_pages = body.maxPages;
  }

  if (body.maxDepth != null) {
    payload.max_depth = body.maxDepth;
  }

  if (body.selectUrls?.length) {
    payload.selectUrls = body.selectUrls.map((u) => u.trim()).filter(Boolean);
  }

  return fetch(migratexApiUrl('/scrape'), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

/** Raw GET /scrape/{jobId} (use {@link fetchScrapeJobDetail} for typed JSON). */
export async function lambdaGetScrapeJobStatus(token: string, jobId: string): Promise<Response> {
  const id = encodeURIComponent(jobId.trim());
  return fetch(migratexApiUrl(`/scrape/${id}`), {
    method: 'GET',
    headers: authHeaders(token),
  });
}

/** Response shape from GET /scrape/{jobId} (resume job / dashboard drill-down). */
export interface ScrapeJobDetail {
  id: string;
  url: string;
  status: string;
  progress: number;
  progress_message: string | null;
  error: string | null;
  cs_stack_api_key?: string | null;
  s3_key?: string | null;
  created_at?: string;
  updated_at?: string;
  content_types?: unknown[];
}

export async function fetchScrapeJobDetail(
  token: string,
  jobId: string,
): Promise<{ ok: true; data: ScrapeJobDetail } | { ok: false; error: string }> {
  try {
    const res = await lambdaGetScrapeJobStatus(token, jobId);
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const msg = (raw.error_message as string) || (raw.message as string) || `Failed to load job (${res.status})`;
      return { ok: false, error: msg };
    }

    const id = str(raw.id, jobId.trim());
    const stackApiKey = str(
      raw.cs_stack_api_key ?? raw.stack_api_key ?? raw.stackApiKey ?? raw.stack_uid ?? raw.stackUid,
    );

    const data: ScrapeJobDetail = {
      id,
      url: str(raw.url),
      status: str(raw.status, 'unknown'),
      progress: num(raw.progress, 0),
      progress_message: raw.progress_message != null ? String(raw.progress_message) : null,
      error: raw.error != null ? String(raw.error) : null,
      cs_stack_api_key: stackApiKey || null,
      s3_key: raw.s3_key != null ? String(raw.s3_key) : null,
      created_at: raw.created_at != null ? String(raw.created_at) : undefined,
      updated_at: raw.updated_at != null ? String(raw.updated_at) : undefined,
      content_types: Array.isArray(raw.content_types) ? raw.content_types : undefined,
    };

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** POST /import/{jobId} */
export async function lambdaImportStack(
  token: string,
  jobId: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  const id = encodeURIComponent(jobId.trim());
  return fetch(migratexApiUrl(`/import/${id}`), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export interface MigrateXScrapeJob {
  id: string;
  title: string;
  url: string;
  status: string;
  progress: number;
  contentTypes: number;
  entries: number;
  assets: number;
  users: number;
  updatedAt: string;
}

function num(x: unknown, fallback = 0): number {
  if (typeof x === 'number' && !Number.isNaN(x)) {
    return x;
  }

  if (typeof x === 'string') {
    const n = Number.parseInt(x, 10);
    return Number.isNaN(n) ? fallback : n;
  }

  return fallback;
}

function str(x: unknown, fallback = ''): string {
  return x != null && String(x).trim() ? String(x).trim() : fallback;
}

function parseScrapeRow(raw: Record<string, unknown>): MigrateXScrapeJob | null {
  const id = str(raw.id ?? raw.job_id ?? raw.jobId ?? raw.scrape_id ?? raw.uuid);

  if (!id) {
    return null;
  }

  const url = str(raw.url ?? raw.website_url ?? raw.websiteUrl ?? raw.source_url ?? raw.site_url);
  const title =
    str(raw.name ?? raw.title ?? raw.stack_name) ||
    (url ? url.replace(/^https?:\/\//i, '').split('/')[0] || url : 'Untitled job');
  const nested = raw.counts && typeof raw.counts === 'object' ? (raw.counts as Record<string, unknown>) : null;
  const ct = num(
    raw.ct_count ??
      raw.content_types ??
      raw.contentTypes ??
      raw.content_types_count ??
      raw.content_type_count ??
      nested?.ct_count ??
      nested?.content_types ??
      nested?.content_types_count,
  );
  const ent = num(
    raw.entries ?? raw.entries_count ?? raw.entry_count ?? raw.entryCount ?? nested?.entries ?? nested?.entries_count,
  );
  const ast = num(
    raw.assets ?? raw.assets_count ?? raw.asset_count ?? raw.assetCount ?? nested?.assets ?? nested?.assets_count,
  );
  const users = num(raw.users ?? raw.user_count ?? raw.collaborators ?? raw.users_count, 0);
  const progress = num(raw.progress ?? raw.percent ?? raw.percent_complete, 0);
  const status = str(raw.status ?? raw.state ?? raw.job_status, '—');
  const updatedAt = str(raw.updated_at ?? raw.updatedAt ?? raw.modified_at ?? raw.created_at ?? raw.createdAt, '');

  return {
    id,
    title,
    url,
    status,
    progress,
    contentTypes: ct,
    entries: ent,
    assets: ast,
    users,
    updatedAt,
  };
}

function parseScrapesResponse(data: unknown): MigrateXScrapeJob[] {
  if (data == null) {
    return [];
  }

  if (Array.isArray(data)) {
    return data.flatMap((item) => {
      const row = parseScrapeRow(item as Record<string, unknown>);
      return row ? [row] : [];
    });
  }

  if (typeof data !== 'object') {
    return [];
  }

  const o = data as Record<string, unknown>;
  const rawList = o.scrapes ?? o.data ?? o.jobs ?? o.items ?? o.results ?? [];

  if (!Array.isArray(rawList)) {
    return [];
  }

  return rawList.flatMap((item) => {
    const row = parseScrapeRow(item as Record<string, unknown>);
    return row ? [row] : [];
  });
}

/** GET /scrapes?limit=&offset= */
export async function lambdaListScrapes(
  token: string,
  options?: { limit?: number; offset?: number },
): Promise<{ jobs: MigrateXScrapeJob[]; ok: boolean; error?: string }> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const q = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  try {
    const res = await fetch(`${migratexApiUrl('/scrapes')}?${q}`, {
      method: 'GET',
      headers: authHeaders(token),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        (data as { error_message?: string }).error_message ||
        (data as { message?: string }).message ||
        `Request failed (${res.status})`;
      return { jobs: [], ok: false, error: msg };
    }

    return { jobs: parseScrapesResponse(data), ok: true };
  } catch (e) {
    return {
      jobs: [],
      ok: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

/** POST /website/start — body ties website generation to an existing scrape/migration job. */
export interface WebsiteStartBody {
  jobId: string;
}

/** POST /website/start — returns website generation job id (often same as input jobId). */
export async function lambdaWebsiteStart(
  token: string,
  body: WebsiteStartBody,
): Promise<{ jobId: string; raw: unknown }> {
  const res = await fetch(migratexApiUrl('/website/start'), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      jobId: body.jobId.trim(),
    }),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const msg = (raw.error_message as string) || (raw.message as string) || `Website start failed (${res.status})`;
    throw new Error(msg);
  }

  const nestedJob = raw.job && typeof raw.job === 'object' ? (raw.job as Record<string, unknown>) : null;
  const jobId = String(raw.jobId ?? raw.job_id ?? raw.id ?? nestedJob?.id ?? nestedJob?.jobId ?? '').trim();

  if (!jobId) {
    throw new Error('Website start response missing job id');
  }

  return { jobId, raw };
}

export interface LambdaFetchWebsiteLiveOptions {
  /** Relative project path, e.g. `app/page.tsx` → `?file=app%2Fpage.tsx` */
  file?: string | null;
}

/** GET /jobs/{jobId}/website/live — poll status/manifest, or a single file with ?file= */
export async function lambdaFetchWebsiteLive(
  token: string,
  jobId: string,
  options?: LambdaFetchWebsiteLiveOptions,
): Promise<Response> {
  const id = encodeURIComponent(jobId.trim());
  const file = options?.file?.trim();
  const qs = file ? `?file=${encodeURIComponent(file)}` : '';
  return fetch(migratexApiUrl(`/jobs/${id}/website/live${qs}`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
}

// ─── Website Live / S3 File Fetching ─────────────────────────────────────────

export interface ManifestFile {
  path: string;
  status: string;
  chunks: number;
}

export interface WebsiteLiveManifest {
  status: string;
  phase: string;
  files: ManifestFile[];
  updatedAt?: string;
}

export interface WebsiteLiveResponse {
  jobId: string;
  s3Prefix: string;
  manifestSource?: string;
  website_status: string;
  website_progress: number;
  website_message: string;
  manifest: WebsiteLiveManifest | null;
  writingFile?: string | null;
  filePreview?: string | null;
  filePreviews?: Record<string, string> | null;
  /** Direct file-content map (when server returns inline content). */
  files?: Record<string, string>;
}

/**
 * GET /jobs/{jobId}/website/live
 * Triggers / polls website generation for an existing scrape job.
 * Returns parsed JSON response including manifest and any inline file contents.
 */
export async function lambdaGetWebsiteLive(
  token: string,
  jobId: string,
  options?: LambdaFetchWebsiteLiveOptions,
): Promise<{ ok: boolean; status: number; data: WebsiteLiveResponse | null; error?: string }> {
  try {
    const id = encodeURIComponent(jobId.trim());
    const file = options?.file?.trim();
    const qs = file ? `?file=${encodeURIComponent(file)}` : '';
    const res = await fetch(migratexApiUrl(`/jobs/${id}/website/live${qs}`), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const text = await res.text();
    let data: WebsiteLiveResponse | null = null;

    if (text.trim()) {
      try {
        data = JSON.parse(text) as WebsiteLiveResponse;
      } catch {
        return { ok: res.ok, status: res.status, data: null, error: `Invalid JSON: ${text.slice(0, 100)}` };
      }
    }

    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/**
 * Fetch individual file content from S3 via Lambda proxy.
 * Tries: GET /jobs/{jobId}/website/file?path={filePath}
 */
export async function lambdaFetchS3FileContent(token: string, jobId: string, filePath: string): Promise<string | null> {
  try {
    const id = encodeURIComponent(jobId.trim());
    const encodedPath = encodeURIComponent(filePath);
    const res = await fetch(migratexApiUrl(`/jobs/${id}/website/file?path=${encodedPath}`), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/plain, application/json, */*',
      },
    });

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get('content-type') ?? '';

    // If it's JSON, try to extract the content field
    if (contentType.includes('application/json')) {
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (json?.content && typeof json.content === 'string') {
        return json.content;
      }
      if (json?.body && typeof json.body === 'string') {
        return json.body;
      }
      if (json?.text && typeof json.text === 'string') {
        return json.text;
      }
      return JSON.stringify(json, null, 2);
    }

    return res.text();
  } catch {
    return null;
  }
}

/**
 * Fetch all files from the manifest via the Lambda.
 * Returns a map of relative path → file content string.
 */
export async function lambdaFetchAllS3Files(
  token: string,
  jobId: string,
  manifestFiles: ManifestFile[],
  onProgress?: (done: number, total: number, currentPath: string) => void,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const total = manifestFiles.filter((f) => f.status === 'done').length;
  let done = 0;

  // Fetch in batches of 5 to avoid overwhelming the API
  const BATCH = 5;
  const pending = manifestFiles.filter((f) => f.status === 'done');

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (file) => {
        onProgress?.(done, total, file.path);
        const content = await lambdaFetchS3FileContent(token, jobId, file.path);
        if (content !== null) {
          result[file.path] = content;
        }
        done += 1;
        onProgress?.(done, total, file.path);
      }),
    );
  }

  return result;
}
