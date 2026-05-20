import { json, type MetaFunction } from '@remix-run/node';
import { ClientOnly } from 'remix-utils/client-only';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { ResumeJobFromQuery } from '~/components/migration/ResumeJobFromQuery';
import { LazyAuthenticatedChatShell } from '~/components/layout/LazyAuthenticatedChatShell';
import { Skeleton } from '~/components/ui/Skeleton';

export const meta: MetaFunction = () => {
  return [{ title: 'Create job | Migrate X' }, { name: 'description', content: 'Start a new website migration job' }];
};

export const loader = () => json({});

export default function CreateJobRoute() {
  return (
    <ClientOnly
      fallback={
        <div className="flex h-full min-h-[100dvh] w-full flex-col bg-migratex-elements-background-depth-1">
          <div className="h-14 shrink-0 border-b border-migratex-elements-borderColor bg-white" />
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
              <Skeleton.StepCard variant="shimmer" />
            </div>
          </div>
        </div>
      }
    >
      {() => (
        <AuthGuard>
          <ResumeJobFromQuery>
            <LazyAuthenticatedChatShell />
          </ResumeJobFromQuery>
        </AuthGuard>
      )}
    </ClientOnly>
  );
}
