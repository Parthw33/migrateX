/**
 * api.preview.ts — Full-page reverse proxy for website previews.
 *
 * Strategy: fetch the target page server-side, strip ALL JavaScript (kills
 * StackBlitz / WebContainer and the "localhost refused to connect" redirect),
 * route every remaining sub-resource (CSS, images, fonts) through this same
 * endpoint so the iframe sees everything as same-origin.  The SSR/static HTML
 * plus its CSS is enough to render a faithful visual preview.
 */

import type { LoaderFunctionArgs } from '@remix-run/node';

/* ── Private-network guard ────────────────────────────────────────────────── */

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function isAllowedProtocol(p: string) {
  return p === 'http:' || p === 'https:';
}

function isBlockedHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.has(h)) return true;
  if (
    h.startsWith('10.') ||
    h.startsWith('127.') ||
    h.startsWith('169.254.') ||
    h.startsWith('192.168.')
  )
    return true;
  const m = /^172\.(\d+)\./.exec(h);
  return m ? Number(m[1]) >= 16 && Number(m[1]) <= 31 : false;
}

/* ── HTML helpers ─────────────────────────────────────────────────────────── */

function esc(v: string) {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function errorPage(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{margin:0;display:grid;place-items:center;min-height:100vh;font-family:system-ui;
       background:#0f172a;color:#cbd5e1}
  .c{max-width:480px;padding:24px;border:1px solid #334155;border-radius:12px;
     background:#111827;text-align:center}
  h1{margin:0 0 8px;font-size:17px;color:#f1f5f9}
  p{margin:0;font-size:13px;line-height:1.6}
</style>
</head><body><div class="c"><h1>${esc(title)}</h1><p>${esc(body)}</p></div></body></html>`;
}

/* ── URL rewriter ─────────────────────────────────────────────────────────── */

/**
 * Unwrap Next.js image-optimizer URLs to their underlying source URL.
 *
 * Next.js generates `<img src="/_next/image?url=ENCODED&w=640&q=75">` for
 * <Image> components. When that URL is fetched via the deployed origin, Next's
 * server rejects sources whose hostname isn't in `remotePatterns` (HTTP 400),
 * which is why images appear broken in the preview. We don't need Next's
 * optimization for a static preview — just serve the original image directly.
 *
 * Accepts both an absolute `/_next/image?url=...` URL and a relative path.
 * Returns the decoded source URL if recognizable, otherwise null.
 */
function unwrapNextImageUrl(target: URL): URL | null {
  if (!/\/_next\/image\/?$/.test(target.pathname)) return null;
  const inner = target.searchParams.get('url');
  if (!inner) return null;
  try {
    // The inner URL may be absolute or root-relative to the same origin.
    const abs = new URL(inner, target);
    return isAllowedProtocol(abs.protocol) ? abs : null;
  } catch {
    return null;
  }
}

/**
 * Route any absolute or relative URL through /api/preview?url=…
 *
 * Returns an ABSOLUTE URL using `proxyOrigin`.  This is essential when the
 * HTML is rendered inside an iframe via `srcdoc` — the iframe document URL is
 * `about:srcdoc`, so root-relative URLs like `/api/preview?…` would resolve
 * against `about:srcdoc` and fail.  Absolute URLs work regardless of the
 * iframe's base URL.
 *
 * If the URL points at Next.js's image optimizer (`/_next/image?url=...`), we
 * unwrap it to the underlying source so the preview never depends on the
 * deployed site's `remotePatterns` config.
 */
function toProxyUrl(raw: string, base: URL, proxyOrigin: string): string {
  const t = raw.trim();
  if (
    !t ||
    t.startsWith('#') ||
    t.startsWith(proxyOrigin + '/api/preview?url=') ||
    t.startsWith('/api/preview?url=') ||
    /^(data:|blob:|mailto:|tel:|javascript:)/i.test(t)
  )
    return raw;
  try {
    const abs = new URL(t, base);
    if (!isAllowedProtocol(abs.protocol)) return raw;
    const unwrapped = unwrapNextImageUrl(abs) ?? abs;
    return `${proxyOrigin}/api/preview?url=${encodeURIComponent(unwrapped.href)}`;
  } catch {
    return raw;
  }
}

/* ── Server-side image inlining ───────────────────────────────────────────── */

/**
 * Images referenced from the iframe via `/api/preview?url=…` are intercepted
 * on the deployed origin (migratex-ui.contentstackapps.com) by the WebContainer
 * service worker that the BOLT chat panel registers. Same root cause as the
 * stylesheets fix — sub-resource requests on the parent origin are caught by
 * the SW and rewritten to localhost, so images never load on the deployed app
 * (localhost works because no SW is active).
 *
 * Fix mirrors `inlineStylesheets`: fetch each image server-side (bypassing the
 * client SW) and replace the URL with a base64 `data:` URI so the iframe makes
 * zero sub-resource requests for images.
 */

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?)(?:[?#]|$)/i;

/** Max bytes inlined per image. Above this, fall back to the proxy URL. */
const MAX_INLINE_BYTES_PER_IMAGE = 2_500_000;

/** Total cap across all inlined images per HTML response. */
const MAX_INLINE_TOTAL_BYTES = 30_000_000;

function looksLikeImageUrl(u: URL): boolean {
  return IMAGE_EXT_RE.test(u.pathname);
}

type ImageCache = {
  pending: Map<string, Promise<string | null>>;
  resolved: Map<string, string | null>;
};
type InlineBudget = { used: number };

function createImageCache(): ImageCache {
  return { pending: new Map(), resolved: new Map() };
}

function fetchImageAsDataUri(absUrl: string, budget: InlineBudget): Promise<string | null> {
  return (async () => {
    if (budget.used >= MAX_INLINE_TOTAL_BYTES) return null;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      try {
        const res = await fetch(absUrl, {
          signal: ac.signal,
          redirect: 'follow',
          headers: {
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        if (!res.ok) return null;
        const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (ct && !ct.startsWith('image/')) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength === 0 || buf.byteLength > MAX_INLINE_BYTES_PER_IMAGE) return null;
        if (budget.used + buf.byteLength > MAX_INLINE_TOTAL_BYTES) return null;
        budget.used += buf.byteLength;
        const mime = ct || 'image/png';
        return `data:${mime};base64,${buf.toString('base64')}`;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  })();
}

function queueImage(cache: ImageCache, budget: InlineBudget, absUrl: string): void {
  if (cache.pending.has(absUrl)) return;
  const p = fetchImageAsDataUri(absUrl, budget);
  cache.pending.set(absUrl, p);
  void p.then((v) => {
    cache.resolved.set(absUrl, v);
  });
}

async function drainImageCache(cache: ImageCache): Promise<void> {
  await Promise.all(Array.from(cache.pending.values()));
}

/* ── HTML transforms ──────────────────────────────────────────────────────── */

/** Remove security headers that block iframe embedding. */
function stripSecurity(html: string): string {
  return html
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']?x-frame-options["']?[^>]*>/gi, '')
    // Strip meta-refresh — prevents any auto-redirect (including to localhost)
    .replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '')
    .replace(/\s+crossorigin(?:=["'][^"']*["']|=[^\s>]+)?/gi, '')
    .replace(/\s+integrity=["'][^"']*["']/gi, '');
}

/**
 * Strip ALL JavaScript from the page.
 *
 * This is the key step.  Contentstack Launch embeds a StackBlitz WebContainer
 * that boots a localhost dev-server and then redirects window.location to it.
 * No amount of JS-level patching has proved reliable because the redirect
 * lives inside minified external chunks we can't surgically modify.
 * Removing every <script> tag kills the redirect entirely.
 *
 * The Next.js SSR output already contains the fully-rendered HTML, so the
 * page looks correct with only HTML + CSS — no hydration needed for a preview.
 *
 * <noscript> blocks are inlined so their fallback content is visible.
 */
function stripScripts(html: string): string {
  return html
    // External scripts  (<script src="…"> … </script>  or  <script src="…" />)
    .replace(/<script\b[^>]*src=["'][^"']*["'][^>]*(?:\/>|>[\s\S]*?<\/script>)/gi, '')
    // Inline scripts
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove <noscript> blocks entirely — DO NOT expand them.
    // Contentstack Launch / StackBlitz pages put a <meta http-equiv="refresh"
    // content="0;url=http://localhost:PORT"> inside <noscript> as a no-JS
    // fallback.  Expanding the block would inject that redirect into the live
    // DOM and cause "localhost refused to connect" even with scripts stripped.
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
}

/**
 * Resolve a raw URL string (possibly Next.js-wrapped) to the absolute upstream
 * URL the image actually lives at. Returns null if it's not an HTTP/HTTPS URL.
 */
function resolveUpstream(raw: string, base: URL): URL | null {
  const t = raw.trim();
  if (
    !t ||
    t.startsWith('#') ||
    /^(data:|blob:|mailto:|tel:|javascript:|about:)/i.test(t)
  )
    return null;
  try {
    const abs = new URL(t, base);
    if (!isAllowedProtocol(abs.protocol)) return null;
    return unwrapNextImageUrl(abs) ?? abs;
  } catch {
    return null;
  }
}

/** Rewrite every src / href / action / srcset to go through our proxy. */
async function routeHtmlUrls(
  html: string,
  base: URL,
  proxyOrigin: string,
  imageCache: ImageCache,
  budget: InlineBudget,
): Promise<string> {
  /**
   * First, schedule image fetches for any `<img src>`, `<source srcset>`,
   * `<link rel=icon href>`, or `<… poster>` whose URL looks like an image.
   * We don't await each match inline — we kick off all fetches in parallel
   * and resolve via the shared imageCache below.
   */
  const imgAttrRe = /(\s(?:src|poster))=("([^"]*)"|'([^']*)')/gi;
  for (const m of html.matchAll(imgAttrRe)) {
    const val = m[3] ?? m[4] ?? '';
    const abs = resolveUpstream(val, base);
    if (abs && looksLikeImageUrl(abs)) {
      queueImage(imageCache, budget, abs.href);
    }
  }

  const srcsetPrescan = /(\ssrcset)=("([^"]*)"|'([^']*)')/gi;
  for (const m of html.matchAll(srcsetPrescan)) {
    const val = m[3] ?? m[4] ?? '';
    for (const candidate of val.split(',')) {
      const url = candidate.trim().split(/\s+/)[0] ?? '';
      const abs = resolveUpstream(url, base);
      if (abs && looksLikeImageUrl(abs)) {
        queueImage(imageCache, budget, abs.href);
      }
    }
  }

  // Also pre-scan <link rel="icon"/"shortcut icon"/"apple-touch-icon"> hrefs.
  const linkIconRe = /<link\b[^>]*\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))[^>]*>/gi;
  for (const m of html.matchAll(linkIconRe)) {
    const rel = (m[1] ?? m[2] ?? m[3] ?? '').toLowerCase();
    if (!/\bicon\b/.test(rel)) continue;
    const hrefMatch = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(m[0]);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '';
    const abs = resolveUpstream(href, base);
    if (abs && looksLikeImageUrl(abs)) {
      queueImage(imageCache, budget, abs.href);
    }
  }

  await drainImageCache(imageCache);

  const inlineIfImage = (raw: string): string => {
    const abs = resolveUpstream(raw, base);
    if (!abs || !looksLikeImageUrl(abs)) return toProxyUrl(raw, base, proxyOrigin);
    const dataUri = imageCache.resolved.get(abs.href);
    return dataUri ?? toProxyUrl(raw, base, proxyOrigin);
  };

  return html
    .replace(
      /(\s(?:src|href|action|poster))=("([^"]*)"|'([^']*)')/gi,
      (_, attr, quoted, dv, sv) => {
        const val = typeof dv === 'string' ? dv : sv;
        const q = quoted[0] === "'" ? "'" : '"';
        /*
         * For src/poster: try inline-as-data-URI first (for image URLs).
         * For href/action: only meaningful as navigation — keep proxy URL.
         * But <link rel=icon href=...> is an image — handle by inlining if
         * the URL looks like an image extension regardless of attr name.
         */
        const useInline = attr === ' src' || attr === ' poster' || attr === ' href';
        const rewritten = useInline ? inlineIfImage(val) : toProxyUrl(val, base, proxyOrigin);
        return `${attr}=${q}${rewritten}${q}`;
      },
    )
    .replace(/(\ssrcset)=("([^"]*)"|'([^']*)')/gi, (_, attr, quoted, dv, sv) => {
      const val = typeof dv === 'string' ? dv : sv;
      const q = quoted[0] === "'" ? "'" : '"';
      const rewritten = (val as string)
        .split(',')
        .map((c: string) => {
          const parts = c.trim().split(/\s+/);
          parts[0] = inlineIfImage(parts[0]);
          return parts.join(' ');
        })
        .join(', ');
      return `${attr}=${q}${rewritten}${q}`;
    });
}

/**
 * Inject a tiny inline <style> that ensures the page fills the iframe viewport.
 *
 * We deliberately do NOT inject a <base> tag.  Every src/href/srcset and CSS
 * url() has already been rewritten to an ABSOLUTE proxy URL, so no <base> is
 * needed — and when this HTML is rendered via `srcdoc`, a <base> pointing to
 * any specific origin would break.
 */
function injectViewportStyle(html: string): string {
  const style = `<style>html,body{margin:0;padding:0;width:100%;min-height:100vh;background:#fff}</style>`;

  if (/<head\b[^>]*>/i.test(html))
    return html.replace(/<head\b([^>]*)>/i, `<head$1>${style}`);
  return style + html;
}

/**
 * Inject a navigation-interceptor script so that link clicks inside the
 * srcdoc iframe send a postMessage to the parent instead of navigating the
 * iframe.  Without this, clicking any link causes the iframe to perform a
 * real URL navigation which the WebContainer service worker intercepts and
 * redirects to localhost — producing the "localhost refused to connect" error.
 *
 * The script is the ONLY JavaScript we inject; all scripts from the original
 * page were already stripped by stripScripts().
 */
function injectNavInterceptor(html: string): string {
  const script = `<script>
(function(){
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a'):null;
    if(!a)return;
    var href=a.href||'';
    if(!href||/^(mailto:|tel:|javascript:|#)/.test(href))return;
    if(a.target==='_blank')return;
    e.preventDefault();
    e.stopPropagation();
    try{window.parent.postMessage({type:'migratex:navigate',href:href},'*');}catch(ex){}
  },true);
})();
</script>`;

  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${script}</head>`);
  if (/<body\b/i.test(html)) return html.replace(/<body\b([^>]*)>/i, `<body$1>${script}`);
  return script + html;
}

/* ── CSS transform ────────────────────────────────────────────────────────── */

/**
 * Rewrite url() inside CSS so fonts / background-images also proxy through us.
 *
 * For image URLs (where extension matches IMAGE_EXT_RE), kick off a fetch into
 * `imageCache` so they can be inlined as data: URIs once resolved. Fonts and
 * other resources continue to use proxy URLs.
 */
async function routeCssUrls(
  css: string,
  cssBase: URL,
  proxyOrigin: string,
  imageCache: ImageCache,
  budget: InlineBudget,
): Promise<string> {
  // First pass: queue image fetches for any image url() refs.
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")\s]*)\1\s*\)/gi)) {
    const v = (m[2] ?? '').trim();
    if (!v || /^(data:|blob:|#)/.test(v)) continue;
    try {
      const abs = new URL(v, cssBase);
      if (!isAllowedProtocol(abs.protocol)) continue;
      if (looksLikeImageUrl(abs)) {
        queueImage(imageCache, budget, abs.href);
      }
    } catch {
      /* ignore */
    }
  }

  await drainImageCache(imageCache);

  return css.replace(/url\(\s*(['"]?)([^'")\s]*)\1\s*\)/gi, (match, q, v) => {
    const t = (v as string).trim();
    if (!t || /^(data:|blob:|#)/.test(t)) return match;
    try {
      const abs = new URL(t, cssBase);
      if (!isAllowedProtocol(abs.protocol)) return match;
      if (looksLikeImageUrl(abs)) {
        const dataUri = imageCache.resolved.get(abs.href);
        if (dataUri) {
          return `url(${q}${dataUri}${q})`;
        }
      }
      return `url(${q}${proxyOrigin}/api/preview?url=${encodeURIComponent(abs.href)}${q})`;
    } catch {
      return match;
    }
  });
}

/**
 * Inline every <link rel="stylesheet"> by fetching its CSS server-side and
 * replacing the <link> tag with a <style> block.
 *
 * Why: when the proxied HTML is rendered via srcdoc on the deployed app, the
 * iframe makes sub-resource requests for each stylesheet through the parent
 * origin.  The Contentstack Launch WebContainer service worker on that origin
 * intercepts those requests and redirects them — so on the deployed site CSS
 * never loads (localhost is fine because no SW is registered there).  By
 * inlining the CSS server-side we remove the sub-requests entirely, so there's
 * nothing left for the service worker to intercept.
 *
 * This server-side fetch uses Node's fetch which bypasses any client-side
 * service worker, so the CSS is retrieved cleanly regardless of host.
 */
async function inlineStylesheets(
  html: string,
  base: URL,
  proxyOrigin: string,
  imageCache: ImageCache,
  budget: InlineBudget,
): Promise<string> {
  type Task = { start: number; end: number; promise: Promise<string | null> };
  const tasks: Task[] = [];

  const linkRe = /<link\b[^>]*>/gi;
  for (const m of html.matchAll(linkRe)) {
    const tag = m[0];

    // rel must contain "stylesheet" (case-insensitive, may be space-separated)
    const relMatch = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(tag);
    if (!relMatch) continue;
    const rel = (relMatch[1] ?? relMatch[2] ?? relMatch[3] ?? '').toLowerCase();
    if (!/\bstylesheet\b/.test(rel)) continue;

    const hrefMatch = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(tag);
    if (!hrefMatch) continue;
    const href = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3];
    if (!href) continue;

    const start = m.index!;
    const end = start + tag.length;

    const promise: Promise<string | null> = (async () => {
      try {
        const abs = new URL(href, base);
        if (!isAllowedProtocol(abs.protocol) || isBlockedHost(abs.hostname)) return null;

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 5000);
        try {
          const res = await fetch(abs.href, {
            signal: ac.signal,
            redirect: 'follow',
            headers: {
              Accept: 'text/css,*/*;q=0.1',
              'Accept-Language': 'en-US,en;q=0.9',
              Referer: base.origin + '/',
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
          });
          if (!res.ok) return null;
          const cssText = await res.text();
          // Rewrite url() refs (fonts/images) relative to the CSS file's URL.
          return await routeCssUrls(cssText, abs, proxyOrigin, imageCache, budget);
        } finally {
          clearTimeout(timer);
        }
      } catch {
        return null;
      }
    })();

    tasks.push({ start, end, promise });
  }

  if (tasks.length === 0) return html;

  const results = await Promise.all(tasks.map((t) => t.promise));

  // Splice replacements at known positions. Tasks are in document order.
  let out = '';
  let lastIndex = 0;
  for (let i = 0; i < tasks.length; i++) {
    const { start, end } = tasks[i];
    const css = results[i];
    out += html.slice(lastIndex, start);
    if (css !== null) {
      // Escape </style> sequences in CSS to avoid prematurely closing the block.
      const safe = css.replace(/<\/style/gi, '<\\/style');
      out += `<style>${safe}</style>`;
    }
    // If fetch failed, drop the <link> tag — nothing useful to keep.
    lastIndex = end;
  }
  out += html.slice(lastIndex);
  return out;
}

/* ── Shared response headers ──────────────────────────────────────────────── */

function permissiveHeaders(contentType: string, maxAge = 0): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Cache-Control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cross-Origin-Embedder-Policy': 'unsafe-none',
    'X-Frame-Options': 'ALLOWALL',
    'Content-Security-Policy':
      "frame-ancestors *; default-src * data: blob: 'unsafe-inline' 'unsafe-eval';",
  };
}

/* ── Loader ───────────────────────────────────────────────────────────────── */

export async function loader({ request }: LoaderFunctionArgs) {
  const reqUrl = new URL(request.url);
  const proxyOrigin = reqUrl.origin; // e.g. http://localhost:5173
  const rawTarget = reqUrl.searchParams.get('url')?.trim();

  if (!rawTarget)
    return new Response(errorPage('Missing URL', 'No preview URL provided.'), {
      status: 400,
      headers: permissiveHeaders('text/html; charset=utf-8'),
    });

  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    return new Response(errorPage('Invalid URL', 'The preview URL is not valid.'), {
      status: 400,
      headers: permissiveHeaders('text/html; charset=utf-8'),
    });
  }

  // Bypass Next.js image optimization: fetch the underlying image source
  // directly so the preview doesn't depend on the deployed site's
  // `images.remotePatterns` config (which would 400 unknown hostnames).
  const unwrapped = unwrapNextImageUrl(target);
  if (unwrapped) target = unwrapped;

  if (!isAllowedProtocol(target.protocol) || isBlockedHost(target.hostname))
    return new Response(errorPage('Blocked', 'Only public HTTP/HTTPS URLs can be previewed.'), {
      status: 400,
      headers: permissiveHeaders('text/html; charset=utf-8'),
    });

  try {
    const upstream = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: target.origin + '/',
      },
    });

    const rawCT = upstream.headers.get('content-type') || 'application/octet-stream';
    const ct = rawCT.toLowerCase();

    /* ── HTML: strip JS, route remaining URLs through proxy ── */
    if (ct.includes('text/html')) {
      const imageCache = createImageCache();
      const budget: InlineBudget = { used: 0 };
      let html = await upstream.text();
      html = stripSecurity(html);
      html = stripScripts(html);
      // Inline stylesheets BEFORE rewriting URLs so we fetch the original
      // CSS files (not proxy URLs that would loop back through this handler).
      html = await inlineStylesheets(html, target, proxyOrigin, imageCache, budget);
      html = await routeHtmlUrls(html, target, proxyOrigin, imageCache, budget);
      html = injectViewportStyle(html);
      html = injectNavInterceptor(html);
      return new Response(html, {
        status: upstream.status,
        headers: permissiveHeaders('text/html; charset=utf-8'),
      });
    }

    /* ── CSS: rewrite url() so fonts/images also go through our proxy ── */
    if (ct.includes('text/css')) {
      const imageCache = createImageCache();
      const budget: InlineBudget = { used: 0 };
      const css = await routeCssUrls(await upstream.text(), target, proxyOrigin, imageCache, budget);
      return new Response(css, {
        status: upstream.status,
        headers: permissiveHeaders('text/css; charset=utf-8', 3600),
      });
    }

    /* ── Everything else (fonts, images, JSON, …) — pass through ── */
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: upstream.status,
      headers: permissiveHeaders(rawCT, 86400),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error.';
    return new Response(errorPage('Preview failed', msg), {
      status: 502,
      headers: permissiveHeaders('text/html; charset=utf-8'),
    });
  }
}
