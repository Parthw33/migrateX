import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { PortDropdown } from './PortDropdown';

export const Preview = memo(() => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const hasSelectedPreview = useRef(false);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];

  const [url, setUrl] = useState('');
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!activePreview) {
      setUrl('');
      setIframeUrl(undefined);
      setLoading(false);
      setFailed(false);

      return;
    }

    const { baseUrl } = activePreview;

    setUrl(baseUrl);
    setIframeUrl(baseUrl);
    setLoading(true);
    setFailed(false);
  }, [activePreview]);

  const findMinPortIndex = useCallback(
    (minIndex: number, preview: { port: number }, index: number, array: { port: number }[]) => {
      return preview.port < array[minIndex].port ? index : minIndex;
    },
    [],
  );

  // when previews change, display the lowest port if user hasn't selected a preview
  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview.current) {
      const minPortIndex = previews.reduce(findMinPortIndex, 0);

      setActivePreviewIndex(minPortIndex);
    }
  }, [previews]);

  const reloadPreview = () => {
    setLoading(true);
    setFailed(false);
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="w-full h-full flex flex-col">
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <div className="bg-migratex-elements-background-depth-2 p-2 flex items-center gap-1.5">
        <IconButton icon="i-ph:arrow-clockwise" onClick={reloadPreview} />
        <div
          className="flex items-center gap-1 flex-grow bg-migratex-elements-preview-addressBar-background border border-migratex-elements-borderColor text-migratex-elements-preview-addressBar-text rounded-full px-3 py-1 text-sm hover:bg-migratex-elements-preview-addressBar-backgroundHover hover:focus-within:bg-migratex-elements-preview-addressBar-backgroundActive focus-within:bg-migratex-elements-preview-addressBar-backgroundActive
        focus-within-border-migratex-elements-borderColorActive focus-within:text-migratex-elements-preview-addressBar-textActive"
        >
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none"
            type="text"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setIframeUrl(url);
                setLoading(true);
                setFailed(false);
                setRefreshKey((prev) => prev + 1);

                if (inputRef.current) {
                  inputRef.current.blur();
                }
              }
            }}
          />
        </div>
        {previews.length > 1 && (
          <PortDropdown
            activePreviewIndex={activePreviewIndex}
            setActivePreviewIndex={setActivePreviewIndex}
            isDropdownOpen={isPortDropdownOpen}
            setHasSelectedPreview={(value) => (hasSelectedPreview.current = value)}
            setIsDropdownOpen={setIsPortDropdownOpen}
            previews={previews}
          />
        )}
      </div>
      <div className="relative flex-1 border-t border-migratex-elements-borderColor overflow-hidden">
        {activePreview ? (
          <>
            {loading && !failed && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-migratex-elements-background-depth-1 text-migratex-elements-textSecondary">
                Loading website preview...
              </div>
            )}

            {failed && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-migratex-elements-background-depth-1 px-6 text-center">
                <p className="text-sm font-semibold text-migratex-elements-textPrimary">
                  This website refused iframe embedding.
                </p>
                <p className="max-w-sm text-xs text-migratex-elements-textSecondary">
                  The target website is blocking iframe rendering using browser security headers.
                </p>
                <button
                  type="button"
                  onClick={() => iframeUrl && globalThis.open(iframeUrl, '_blank', 'noopener,noreferrer')}
                  className="rounded-lg bg-[#6C5CE7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b4bcf]"
                >
                  Open Website in New Tab
                </button>
              </div>
            )}

            <iframe
              key={refreshKey}
              ref={iframeRef}
              className="border-none w-full h-full bg-white"
              src={iframeUrl}
              title="Website Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              onLoad={() => {
                setLoading(false);
              }}
              onError={() => {
                setFailed(true);
                setLoading(false);
              }}
            />
          </>
        ) : (
          <div className="flex w-full h-full justify-center items-center bg-white">No preview available</div>
        )}
      </div>
    </div>
  );
});
