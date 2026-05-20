/**
 * LazyAuthenticatedChatShell.tsx
 *
 * Code-splits the full chat/workbench shell so the dashboard and login
 * pages stay lean. Shows a skeleton layout while the chunk loads rather
 * than a blank flash.
 */

import { lazy, Suspense } from 'react';
import { Skeleton } from '~/components/ui/Skeleton';

const AuthenticatedChatShell = lazy(async () => {
  const m = await import('./AuthenticatedChatShell');
  return { default: m.AuthenticatedChatShell };
});

function ChatShellSkeleton() {
  return (
    <div className="flex h-full min-h-[100dvh] w-full flex-col bg-migratex-elements-background-depth-1">
      {/* Header bar */}
      <div className="h-14 shrink-0 border-b border-migratex-elements-borderColor bg-white flex items-center px-4 gap-3">
        <Skeleton.Base variant="shimmer" className="w-7 h-7 rounded-lg flex-shrink-0" />
        <Skeleton.Base variant="shimmer" className="w-24 h-4 rounded" />
        <div className="flex-1" />
        <Skeleton.Base variant="shimmer" className="w-8 h-8 rounded-full flex-shrink-0" />
      </div>

      {/* Main area — step card placeholder */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <Skeleton.StepCard variant="shimmer" />
        </div>
      </div>
    </div>
  );
}

export function LazyAuthenticatedChatShell() {
  return (
    <Suspense fallback={<ChatShellSkeleton />}>
      <AuthenticatedChatShell />
    </Suspense>
  );
}
