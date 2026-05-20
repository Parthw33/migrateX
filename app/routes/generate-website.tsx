/**
 * /generate-website  →  redirects to /:jobId/generate-website
 *
 * This route exists purely as a fallback catch-all. Any code that still
 * navigates to the bare path (bookmarks, legacy links) is bounced to the
 * correct dynamic route so the jobId is always in the URL.
 *
 * If no session exists (no job in progress) the user is sent to /dashboard.
 */
import { json, type MetaFunction } from '@remix-run/node';
import { useNavigate } from '@remix-run/react';
import { useEffect } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Skeleton } from '~/components/ui/Skeleton';
import { getWebsiteGenerationSession } from '~/lib/websiteGenerationSession';
import { getScrapeJobId } from '~/lib/scrapeJobSession';

export const meta: MetaFunction = () => [
  { title: 'Generate website | Migrate X' },
  { name: 'description', content: 'AI-powered website generation with live preview' },
];

export const loader = () => json({});

function BoltSkeleton() {
  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-migratex-elements-background-depth-1">
      <div className="h-12 border-b border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 flex items-center px-3 gap-2 flex-shrink-0">
        <Skeleton.Base variant="shimmer" className="w-6 h-6 rounded-lg flex-shrink-0" />
        <Skeleton.Base variant="shimmer" className="w-20 h-3.5 rounded hidden sm:block" />
        <div className="w-px h-6 bg-migratex-elements-borderColor mx-1" />
        <Skeleton.Base variant="shimmer" className="w-14 h-6 rounded-full" />
        <div className="flex gap-1">
          {['Chat', 'Code', 'Preview'].map((l) => (
            <Skeleton.Base key={l} variant="shimmer" className="w-14 h-6 rounded-md" />
          ))}
        </div>
        <div className="flex-1" />
        {['Sync', 'Build', 'Terminal', 'Pipeline'].map((l) => (
          <Skeleton.Base key={l} variant="shimmer" className="w-16 h-7 rounded-md" />
        ))}
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-[22%] flex-shrink-0 border-r border-migratex-elements-borderColor flex flex-col">
          <div className="flex-1 p-4 space-y-3">
            {[80, 60, 90, 50, 75].map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <Skeleton.Base variant="shimmer" className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" />
                <Skeleton.Base variant="shimmer" className="h-3 rounded" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <Skeleton.EditorContent variant="pulse" />
        </div>
      </div>
    </div>
  );
}

function GenerateWebsiteRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const jobId =
      getWebsiteGenerationSession()?.jobId?.trim() || getScrapeJobId()?.trim() || null;

    if (jobId) {
      navigate(`/${jobId}/generate-website`, { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  return <BoltSkeleton />;
}

export default function GenerateWebsiteRoute() {
  return (
    <ClientOnly fallback={<BoltSkeleton />}>
      {() => <GenerateWebsiteRedirect />}
    </ClientOnly>
  );
}
