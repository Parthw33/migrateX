import { lazy, Suspense } from 'react';
import { json, type MetaFunction } from '@remix-run/node';
import { ClientOnly } from 'remix-utils/client-only';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { Skeleton } from '~/components/ui/Skeleton';

const DashboardPage = lazy(async () => {
  const m = await import('~/components/dashboard/DashboardPage');
  return { default: m.DashboardPage };
});

/** Full-page skeleton that matches the real Dashboard layout exactly. */
function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-[#f4f5f7] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-migratex-elements-borderColor shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Skeleton.Base variant="shimmer" className="w-7 h-7 rounded-lg" />
            <Skeleton.Base variant="shimmer" className="w-20 h-4 rounded" />
          </div>
          <Skeleton.Avatar size={32} variant="shimmer" />
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        {/* Title + toolbar row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <Skeleton.Base variant="shimmer" className="h-7 w-28 rounded" />
          <div className="flex gap-3">
            <Skeleton.Base variant="shimmer" className="h-10 w-56 rounded-lg" />
            <Skeleton.Base variant="shimmer" className="h-10 w-36 rounded-lg" />
          </div>
        </div>

        {/* Card grid */}
        <Skeleton.JobGrid count={8} variant="shimmer" />
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [{ title: 'Jobs | Migrate X' }, { name: 'description', content: 'Your Migrate X scrape jobs' }];
};

export const loader = () => json({});

export default function DashboardRoute() {
  return (
    <ClientOnly fallback={<DashboardSkeleton />}>
      {() => (
        <AuthGuard>
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardPage />
          </Suspense>
        </AuthGuard>
      )}
    </ClientOnly>
  );
}
