import { memo, useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { Skeleton } from '~/components/ui/Skeleton';

interface WebsitePreviewPanelProps {
  websiteUrl: string | null;
  websiteStatus: string | null;
  websiteMessage: string | null;
  launchProjectUid: string | null;
  launchEnvUid: string | null;
  phase: string;
  className?: string;
}

function WebsitePreviewPanelComponent({
  websiteUrl,
  websiteStatus,
  websiteMessage,
  launchProjectUid,
  launchEnvUid,
  phase,
  className,
}: WebsitePreviewPanelProps) {
  const [url, setUrl] = useState(websiteUrl ?? '');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [srcDoc, setSrcDoc] = useState<string>('');
  const effectiveUrl = (url || websiteUrl || '').trim();
  const normalizedUrl =
    effectiveUrl && /^https?:\/\//i.test(effectiveUrl) ? effectiveUrl : effectiveUrl ? `https://${effectiveUrl}` : '';

  useEffect(() => {
    setUrl(websiteUrl ?? '');
    setLoading(true);
    setFailed(false);
    setSrcDoc('');
  }, [websiteUrl]);

  // Listen for navigation messages from within the srcdoc iframe.
  // The injected interceptor script sends postMessage({type:'migratex:navigate', href})
  // instead of letting the iframe navigate (which would trigger the WebContainer
  // service worker and produce the "localhost refused to connect" error).
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'migratex:navigate') return;
      const href = event.data.href as string;
      if (!href) return;

      // The href is an absolute proxy URL like ".../api/preview?url=ENCODED".
      // Extract the real target URL so the address bar shows it correctly.
      let targetUrl = href;
      try {
        const proxyUrl = new URL(href);
        const extracted = proxyUrl.searchParams.get('url');
        if (extracted) targetUrl = extracted;
      } catch {
        // not a valid absolute URL — use as-is
      }

      setUrl(targetUrl);
      setLoading(true);
      setFailed(false);
      setSrcDoc('');
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Fetch the HTML through our proxy and inject as srcdoc.
  //
  // We deliberately do NOT use <iframe src="/api/preview?url=…">.  The parent
  // page hosts a StackBlitz WebContainer (BOLT chat panel) whose service
  // worker / WebContainer runtime intercepts requests in its scope and
  // redirects them to localhost:PORT — which is what causes Chrome's
  // "localhost refused to connect" error inside the preview iframe.
  //
  // By fetching the HTML via fetch() in this component and injecting it as
  // srcdoc, the iframe never performs a URL navigation that the WebContainer
  // can intercept.  The content is inlined directly into the iframe document.
  useEffect(() => {
    if (!normalizedUrl) {
      setSrcDoc('');
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    fetch(`/api/preview?url=${encodeURIComponent(normalizedUrl)}`, {
      signal: controller.signal,
      // Use cache: 'no-store' so the WebContainer service worker has no cached
      // response to serve from — every refresh goes straight to our proxy.
      cache: 'no-store',
      credentials: 'omit',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
        return res.text();
      })
      .then((html) => {
        setSrcDoc(html);
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setFailed(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [normalizedUrl, refreshKey]);

  const reloadPreview = () => {
    setRefreshKey((prev) => prev + 1);
    setLoading(true);
    setFailed(false);
    setSrcDoc('');
  };

  return (
    <div
      className={classNames('flex flex-col h-full overflow-hidden bg-migratex-elements-background-depth-1', className)}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="i-ph:eye text-sm text-migratex-elements-textSecondary" />

          <span className="text-xs font-semibold uppercase tracking-wide text-migratex-elements-textSecondary">
            Preview
          </span>
        </div>

        {websiteUrl ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-green-500/20 bg-green-500/10 text-green-500">
            Live
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-migratex-elements-borderColor text-migratex-elements-textTertiary">
            Pending
          </span>
        )}
      </div>

      {/* CONTENT */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {websiteUrl ? (
          <div className="relative h-full w-full overflow-hidden">
            {/* Browser Header */}
            <div className="h-11 border-b border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 flex items-center gap-2 px-3">
              {/* Traffic lights */}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>

              {/* Reload */}
              <button
                type="button"
                onClick={reloadPreview}
                className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-migratex-elements-background-depth-3 transition-colors"
              >
                <span className="i-ph:arrow-clockwise text-sm text-migratex-elements-textSecondary" />
              </button>

              {/* URL BAR */}
              <div className="flex-1 h-8 rounded-lg border border-migratex-elements-borderColor bg-migratex-elements-preview-addressBar-background flex items-center px-3 gap-2 min-w-0">
                <span className="i-ph:lock text-green-500 text-xs flex-shrink-0" />

                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      reloadPreview();
                      event.currentTarget.blur();
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-migratex-elements-textSecondary outline-none"
                />
              </div>

              {/* Open */}
              <a
                href={normalizedUrl || url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-migratex-elements-background-depth-3 transition-colors"
              >
                <span className="i-ph:arrow-square-out text-sm text-migratex-elements-textSecondary" />
              </a>
            </div>

            {/* Preview Body */}
            <div className="relative h-[calc(100%-44px)] bg-white overflow-hidden">
              {/* LOADER */}
              {loading && !failed && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-migratex-elements-background-depth-1">
                  <span className="i-svg-spinners:ring-resize text-4xl text-primary" />

                  <p className="mt-4 text-sm text-migratex-elements-textSecondary">Loading website preview...</p>

                  <div className="w-64 mt-6 space-y-2 opacity-40">
                    <Skeleton.Base variant="shimmer" className="h-3 w-full rounded" />
                    <Skeleton.Base variant="shimmer" className="h-3 w-4/5 rounded" />
                    <Skeleton.Base variant="shimmer" className="h-3 w-3/5 rounded" />
                  </div>
                </div>
              )}

              {/* ERROR */}
              {failed && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-migratex-elements-background-depth-1 px-6 text-center">
                  <span className="i-ph:warning-circle text-5xl text-amber-400" />

                  <h3 className="mt-4 text-base font-semibold text-migratex-elements-textPrimary">
                    Preview unavailable
                  </h3>

                  <p className="mt-2 text-sm max-w-sm text-migratex-elements-textSecondary">
                    This website refused iframe embedding. Open it directly to view it.
                  </p>

                  <div className="flex items-center gap-3 mt-6">
                    <button
                      type="button"
                      onClick={reloadPreview}
                      className="px-4 py-2 rounded-lg border border-migratex-elements-borderColor text-sm hover:bg-migratex-elements-background-depth-3 transition-colors"
                    >
                      Retry
                    </button>

                    <a
                      href={normalizedUrl || url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Open Website
                    </a>
                  </div>
                </div>
              )}

              {/* IFRAME — srcdoc-based (bypasses WebContainer service worker) */}
              {normalizedUrl ? (
                <iframe
                  key={`${refreshKey}-${normalizedUrl}`}
                  srcDoc={srcDoc || '<!doctype html><html><body style="margin:0;background:#fff"></body></html>'}
                  title="Website Preview"
                  onLoad={() => {
                    if (srcDoc) setLoading(false);
                  }}
                  onError={() => {
                    setFailed(true);
                    setLoading(false);
                  }}
                  // No sandbox — the proxy already stripped all <script> tags,
                  // so there's nothing dangerous to run.  Omitting sandbox lets
                  // the iframe behave like a normal browser tab.
                  className={classNames(
                    'absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-300',
                    loading ? 'opacity-0' : 'opacity-100',
                  )}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
              <span className="i-svg-spinners:ring-resize text-4xl text-violet-500" />
            </div>

            <h3 className="mt-5 text-lg font-semibold text-migratex-elements-textPrimary">Website is generating...</h3>

            <p className="mt-2 text-sm text-migratex-elements-textSecondary max-w-sm">
              Preview will automatically appear here once the deployment finishes.
            </p>

            <div className="mt-8 w-full max-w-md space-y-3">
              <StatusItem label="Status" value={websiteStatus || phase || 'Pending'} />

              <StatusItem label="Message" value={websiteMessage || 'Waiting for deployment to finish'} />

              <StatusItem label="Launch Project UID" value={launchProjectUid} mono />

              <StatusItem label="Launch Env UID" value={launchEnvUid} mono />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const WebsitePreviewPanel = memo(WebsitePreviewPanelComponent);

function StatusItem({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="bg-migratex-elements-background-depth-2 rounded-lg p-3 text-left">
      <p className="text-[10px] uppercase tracking-wide text-migratex-elements-textTertiary mb-1">{label}</p>

      {value ? (
        <p className={classNames('text-sm text-migratex-elements-textPrimary truncate', mono ? 'font-mono' : '')}>
          {value}
        </p>
      ) : (
        <Skeleton.Base variant="pulse" className="h-3 w-3/4 rounded" />
      )}
    </div>
  );
}
