/**
 * Minimal POSIX path helpers for the browser (replaces `node:path` in client bundles).
 * WebContainer uses POSIX-style absolute paths under `workdir`.
 */

function normalizeAbs(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

/** Like `path.relative` for absolute POSIX paths. */
export function posixRelative(from: string, to: string): string {
  const fromAbs = normalizeAbs(from);
  const toAbs = normalizeAbs(to);

  if (fromAbs === toAbs) {
    return '';
  }

  const fromParts = fromAbs.split('/').filter(Boolean);
  const toParts = toAbs.split('/').filter(Boolean);

  let common = 0;
  const minLen = Math.min(fromParts.length, toParts.length);
  while (common < minLen && fromParts[common] === toParts[common]) {
    common += 1;
  }

  const up = fromParts.length - common;
  const down = toParts.slice(common);
  const result = [...Array(up).fill('..'), ...down].join('/');

  return result || '.';
}

/** Like `path.dirname` for POSIX relative or absolute paths (WebContainer-relative segments). */
export function posixDirname(p: string): string {
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized || normalized === '.') {
    return '.';
  }

  const i = normalized.lastIndexOf('/');
  if (i === -1) {
    return '.';
  }
  if (i === 0) {
    return '/';
  }

  return normalized.slice(0, i) || '.';
}
