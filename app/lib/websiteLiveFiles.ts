import type { FileMap } from '~/lib/stores/files';
import type { ManifestFile } from '~/lib/lambdaApi';
import { WORK_DIR } from '~/utils/constants';

export interface ParsedWebsiteLive {
  fileMap: FileMap;
  /** When true, stop polling (job finished or failed). */
  terminal: boolean;
  status: string;
  /** S3 prefix from the response, used for fetching individual files. */
  s3Prefix: string;
  /** Files listed in the manifest that need to be fetched from S3. */
  pendingS3Files: ManifestFile[];
  /** Progress 0-100 from the API. */
  progress: number;
  /** Human-readable status message from the API. */
  message: string;
  /** Path the backend is currently writing (for targeted GET .../live?file= polls). */
  writingFile: string | null;
  /** `manifest.status` when the payload includes a manifest object. */
  manifestStatus: string | null;
}

export function normalizeWorkbenchPath(rel: string): string {
  const p = rel.replace(/^\.\?\//, '').replace(/\\/g, '/').trim();
  if (!p) {
    return '';
  }

  if (p.startsWith('/home/')) {
    return p;
  }

  const segments = p.split('/').filter(Boolean);
  return `${WORK_DIR}/${segments.join('/')}`;
}

function coercePreviewContent(v: unknown): string | null {
  if (typeof v === 'string') {
    return v;
  }

  if (!v || typeof v !== 'object') {
    return null;
  }

  const r = v as Record<string, unknown>;
  const c = r.content ?? r.body ?? r.text ?? r.preview ?? r.data ?? r.source;

  return typeof c === 'string' ? c : null;
}

/** File body from `{ path, content, source: "file" }` previews — never use `source` as text. */
function fileBodyFromPreviewRecord(rec: Record<string, unknown>): string | null {
  const c = rec.content ?? rec.body ?? rec.text ?? rec.preview ?? rec.data;
  return typeof c === 'string' && c.length > 0 ? c : null;
}

/**
 * Merge `filePreviews`, `filePreview` from one JSON object into fileMap.
 * Supports:
 * - `filePreviews`: map path → string | object, or **array** of `{ path, content }`
 * - `filePreview`: **object** `{ path, content }` or legacy string with `writingFile`
 */
export function mergeFilePreviewsFromRecord(source: Record<string, unknown>, fileMap: FileMap): void {
  const fp = source.filePreviews;

  if (Array.isArray(fp)) {
    for (const item of fp) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const rec = item as Record<string, unknown>;
      const rel = String(rec.path ?? '').trim();
      const content = fileBodyFromPreviewRecord(rec);
      if (rel && content) {
        const full = normalizeWorkbenchPath(rel);
        if (full) {
          fileMap[full] = { type: 'file', content, isBinary: false };
        }
      }
    }
  } else if (fp && typeof fp === 'object') {
    for (const [k, v] of Object.entries(fp as Record<string, unknown>)) {
      const key = k.trim();
      if (!key) {
        continue;
      }

      const content = coercePreviewContent(v);
      if (!content) {
        continue;
      }

      const full = normalizeWorkbenchPath(key);
      if (full) {
        fileMap[full] = { type: 'file', content, isBinary: false };
      }
    }
  }

  const preview = source.filePreview;
  if (preview && typeof preview === 'object' && !Array.isArray(preview)) {
    const rec = preview as Record<string, unknown>;
    const rel = String(rec.path ?? '').trim();
    const content = fileBodyFromPreviewRecord(rec);
    if (rel && content) {
      const full = normalizeWorkbenchPath(rel);
      if (full) {
        fileMap[full] = { type: 'file', content, isBinary: false };
      }
    }
  }

  const wf = source.writingFile;
  if (typeof wf === 'string' && wf.trim() && preview !== undefined && typeof preview !== 'object') {
    const content = coercePreviewContent(preview);
    if (content) {
      const full = normalizeWorkbenchPath(wf.trim());
      if (full) {
        fileMap[full] = { type: 'file', content, isBinary: false };
      }
    }
  }
}

/**
 * Best-effort parse of GET /jobs/{id}/website/live JSON into a {@link ParsedWebsiteLive}.
 * Handles two response shapes:
 *   1. Inline file-content map  →  `files: { "path": "content" }`
 *   2. Manifest-only (S3-backed) →  `manifest: { files: [{path, status, chunks}] }`
 */
export function parseWebsiteLivePayload(data: unknown): ParsedWebsiteLive {
  const fileMap: FileMap = {};
  let terminal = false;
  let status = '';
  let s3Prefix = '';
  let pendingS3Files: ManifestFile[] = [];
  let progress = 0;
  let message = '';
  let manifestStatus: string | null = null;

  if (!data || typeof data !== 'object') {
    return {
      fileMap,
      terminal: false,
      status,
      s3Prefix,
      pendingS3Files,
      progress,
      message,
      writingFile: null,
      manifestStatus: null,
    };
  }

  const o = data as Record<string, unknown>;

  // ── Status / terminal detection ────────────────────────────────────────────

  // Support both top-level `status` and the nested `website_status` field
  status = String(o.website_status ?? o.status ?? o.state ?? o.phase ?? '');
  progress = typeof o.website_progress === 'number' ? o.website_progress : 0;
  message = String(o.website_message ?? o.message ?? '');
  s3Prefix = String(o.s3Prefix ?? o.s3_prefix ?? '');
  const writingFile =
    typeof o.writingFile === 'string' && o.writingFile.trim() ? o.writingFile.trim() : null;

  const st = status.toLowerCase();
  if (
    ['complete', 'completed', 'succeeded', 'success', 'failed', 'error', 'cancelled', 'canceled', 'deployed'].includes(st)
  ) {
    terminal = true;
  }

  if (o.terminal === true || o.done === true) {
    terminal = true;
  }

  const nested = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : null;

  // ── Shape 1: inline file-content map ──────────────────────────────────────
  const rawFiles =
    o.files ??
    o.fileMap ??
    o.file_map ??
    o.file_contents ??
    o.fileContents ??
    nested?.files ??
    nested?.fileMap;

  if (rawFiles && typeof rawFiles === 'object' && !Array.isArray(rawFiles)) {
    for (const [k, v] of Object.entries(rawFiles as Record<string, unknown>)) {
      const full = normalizeWorkbenchPath(k);
      if (!full) {
        continue;
      }

      if (typeof v === 'string') {
        fileMap[full] = { type: 'file', content: v, isBinary: false };
      } else if (v && typeof v === 'object') {
        const rec = v as Record<string, unknown>;
        const content = rec.content ?? rec.body ?? rec.text ?? rec.source;
        if (typeof content === 'string') {
          fileMap[full] = { type: 'file', content, isBinary: false };
        }
      }
    }
  }

  // ── Shape 2: file list (path + content pairs) ──────────────────────────────
  const list = (o.fileList ?? o.items ?? o.changes ?? nested?.items) as unknown;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const rec = item as Record<string, unknown>;
      const path = String(rec.path ?? rec.file ?? rec.filename ?? rec.name ?? '').trim();
      const content = rec.content ?? rec.body ?? rec.text;
      if (path && typeof content === 'string') {
        const full = normalizeWorkbenchPath(path);
        if (full) {
          fileMap[full] = { type: 'file', content, isBinary: false };
        }
      }
    }
  }

  // ── Shape 3: manifest-based (S3 backed) ───────────────────────────────────
  if (o.manifest && typeof o.manifest === 'object') {
    const manifest = o.manifest as Record<string, unknown>;
    if (typeof manifest.status === 'string' && manifest.status.trim()) {
      manifestStatus = manifest.status.trim();
    }

    const manifestFiles = manifest.files;

    if (Array.isArray(manifestFiles)) {
      pendingS3Files = (manifestFiles as Array<Record<string, unknown>>)
        .map((f) => ({
          path: String(f.path ?? '').trim(),
          status: String(f.status ?? 'unknown').trim(),
          chunks: typeof f.chunks === 'number' ? f.chunks : 1,
        }))
        .filter((f) => f.path.length > 0);

      // Deduplicate by path (keep last occurrence, as manifest may have duplicate entries)
      const seen = new Set<string>();
      pendingS3Files = pendingS3Files
        .reverse()
        .filter((f) => {
          if (seen.has(f.path)) {
            return false;
          }
          seen.add(f.path);
          return true;
        })
        .reverse();

      const manifestStatusLower = String(manifest.status ?? '').toLowerCase();
      if (['complete', 'succeeded', 'done', 'collect-results'].includes(manifestStatusLower)) {
        if (Object.keys(fileMap).length === 0 && pendingS3Files.length > 0) {
          terminal = false;
        }
      }
    }

    mergeFilePreviewsFromRecord(manifest, fileMap);
  }

  if (nested) {
    mergeFilePreviewsFromRecord(nested, fileMap);
  }

  // Top-level streaming previews (often present on GET .../live?file= even when manifest is minimal)
  mergeFilePreviewsFromRecord(o, fileMap);

  return { fileMap, terminal, status, s3Prefix, pendingS3Files, progress, message, writingFile, manifestStatus };
}

/**
 * Relative paths the website/live JSON returned with ACTUAL CONTENT
 * (inline `files`, `filePreviews`, `filePreview`). Manifest-only listings are
 * intentionally excluded — they describe what exists, not what arrived.
 *
 * Use this when tracking which files have been loaded into the workbench. Use
 * {@link extractRelPathsFromLiveResponse} when you want every path the
 * response references (including the manifest), e.g. to drive a follow-up
 * `?file=` fetch loop.
 */
export function extractContentBearingRelPaths(data: unknown): string[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const o = data as Record<string, unknown>;
  const out: string[] = [];

  const files = o.files;
  if (files && typeof files === 'object' && !Array.isArray(files)) {
    for (const [k, v] of Object.entries(files as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) {
        out.push(k);
      } else if (v && typeof v === 'object') {
        const rec = v as Record<string, unknown>;
        const c = rec.content ?? rec.body ?? rec.text ?? rec.source;
        if (typeof c === 'string' && c.length > 0) {
          out.push(k);
        }
      }
    }
  }

  const fp = o.filePreviews;
  if (Array.isArray(fp)) {
    for (const item of fp) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const p = String(rec.path ?? '').trim();
        const c = rec.content ?? rec.body ?? rec.text ?? rec.preview ?? rec.data;
        if (p && typeof c === 'string' && c.length > 0) {
          out.push(p);
        }
      }
    }
  } else if (fp && typeof fp === 'object') {
    for (const [k, v] of Object.entries(fp as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) {
        out.push(k);
      } else if (v && typeof v === 'object') {
        const rec = v as Record<string, unknown>;
        const c = rec.content ?? rec.body ?? rec.text ?? rec.preview ?? rec.data ?? rec.source;
        if (typeof c === 'string' && c.length > 0) {
          out.push(k);
        }
      }
    }
  }

  const single = o.filePreview;
  if (single && typeof single === 'object' && !Array.isArray(single)) {
    const rec = single as Record<string, unknown>;
    const p = String(rec.path ?? '').trim();
    const c = rec.content ?? rec.body ?? rec.text ?? rec.preview ?? rec.data;
    if (p && typeof c === 'string' && c.length > 0) {
      out.push(p);
    }
  }

  if (
    typeof o.writingFile === 'string' &&
    o.writingFile.trim() &&
    typeof o.filePreview === 'string' &&
    o.filePreview.length > 0
  ) {
    out.push(o.writingFile.trim());
  }

  return [...new Set(out.map((p) => p.trim()).filter(Boolean))];
}

/** Relative paths the website/live JSON already names (global GET or nested previews/manifest). */
export function extractRelPathsFromLiveResponse(data: unknown): string[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const o = data as Record<string, unknown>;
  const out: string[] = [];
  const files = o.files;

  if (files && typeof files === 'object' && !Array.isArray(files)) {
    out.push(...Object.keys(files as Record<string, unknown>));
  }

  const fp = o.filePreviews;

  if (Array.isArray(fp)) {
    for (const item of fp) {
      if (item && typeof item === 'object') {
        const p = String((item as Record<string, unknown>).path ?? '').trim();
        if (p) {
          out.push(p);
        }
      }
    }
  } else if (fp && typeof fp === 'object') {
    out.push(...Object.keys(fp as Record<string, unknown>));
  }

  const singlePreview = o.filePreview;
  if (singlePreview && typeof singlePreview === 'object' && !Array.isArray(singlePreview)) {
    const p = String((singlePreview as Record<string, unknown>).path ?? '').trim();
    if (p) {
      out.push(p);
    }
  }

  if (typeof o.writingFile === 'string' && o.writingFile.trim() && typeof o.filePreview === 'string') {
    out.push(o.writingFile);
  }

  const manifest = o.manifest;
  if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
    const mf = (manifest as Record<string, unknown>).files;
    if (Array.isArray(mf)) {
      for (const row of mf) {
        if (row && typeof row === 'object') {
          const p = String((row as Record<string, unknown>).path ?? '').trim();
          if (p) {
            out.push(p);
          }
        }
      }
    }
  }

  return [...new Set(out.map((p) => p.trim()).filter(Boolean))];
}
