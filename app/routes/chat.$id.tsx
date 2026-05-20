import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { ClientOnly } from 'remix-utils/client-only';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { LazyAuthenticatedChatShell } from '~/components/layout/LazyAuthenticatedChatShell';

export const meta: MetaFunction = () => {
  return [
    { title: 'MigrateX | AI migration tool' },
    { name: 'description', content: 'MigrateX - Your AI-powered migration assistant' },
  ];
};

export async function loader(args: LoaderFunctionArgs) {
  return json({ id: args.params.id });
}

export default function ChatByIdRoute() {
  return (
    <ClientOnly fallback={null}>
      {() => (
        <AuthGuard>
          <LazyAuthenticatedChatShell />
        </AuthGuard>
      )}
    </ClientOnly>
  );
}
