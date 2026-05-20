import { json, type MetaFunction } from '@remix-run/node';
import { useParams } from '@remix-run/react';
import { lazy, Suspense } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { Skeleton } from '~/components/ui/Skeleton';

export const meta: MetaFunction = () => [
  { title: 'Generate website | Migrate X' },
  { name: 'description', content: 'AI-powered website generation with live preview' },
];

export const loader = () => json({});

const GenerateWebsiteView = lazy(async () => {
  const m = await import('~/components/generate-website/GenerateWebsiteView.client');
  return { default: m.GenerateWebsiteView };
});

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
        <div className="w-[22%] flex-shrink-0 border-r border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 flex flex-col">
          <div className="px-4 py-2 border-b border-migratex-elements-borderColor/60 space-y-1.5">
            <div className="flex justify-between">
              <Skeleton.Base variant="shimmer" className="h-2.5 w-28 rounded" />
              <Skeleton.Base variant="shimmer" className="h-2.5 w-8 rounded" />
            </div>
            <Skeleton.Base variant="shimmer" className="h-1 w-full rounded-full" />
          </div>
          <div className="flex-1 p-4 space-y-3">
            {[80, 60, 90, 50, 75].map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <Skeleton.Base variant="shimmer" className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" />
                <Skeleton.Base variant="shimmer" className="h-3 rounded" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          <div className="border-t border-migratex-elements-borderColor p-3">
            <Skeleton.Base variant="shimmer" className="h-10 w-full rounded-xl" />
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="w-10 border-r border-migratex-elements-borderColor flex flex-col items-center pt-2 gap-2 flex-shrink-0">
              {[1, 2, 3].map((i) => (
                <Skeleton.Base key={i} variant="pulse" className="w-6 h-6 rounded-md" />
              ))}
            </div>
            <div className="w-52 border-r border-migratex-elements-borderColor flex-shrink-0">
              <Skeleton.FileTreePanel variant="pulse" />
            </div>
            <div className="flex-1">
              <Skeleton.EditorContent variant="pulse" />
            </div>
          </div>
          <div className="h-[22px] flex-shrink-0 bg-[#6c5ce7] dark:bg-gradient-to-b dark:from-[#1c2128] dark:to-[#12151c] dark:border-t dark:border-violet-500/40" />
        </div>
      </div>
    </div>
  );
}

export default function JobGenerateWebsiteRoute() {
  const { jobId } = useParams<{ jobId: string }>();

  return (
    <ClientOnly fallback={<BoltSkeleton />}>
      {() => (
        <AuthGuard>
          <Suspense fallback={<BoltSkeleton />}>
            <GenerateWebsiteView jobId={jobId} />
          </Suspense>
        </AuthGuard>
      )}
    </ClientOnly>
  );
}
