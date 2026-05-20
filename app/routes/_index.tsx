import { useEffect } from 'react';
import { json, type MetaFunction } from '@remix-run/node';
import { useNavigate } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { checkAuthOnLoad } from '~/lib/stores/auth';

export const meta: MetaFunction = () => {
  return [
    { title: 'MigrateX | AI migration tool' },
    { name: 'description', content: 'MigrateX - Your AI-powered migration assistant' },
  ];
};

export const loader = () => json({});

/** Authenticated users land on the dashboard; others go to login. Migration UI lives at `/createJob`. */
function HomeRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    if (checkAuthOnLoad()) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return null;
}

export default function Index() {
  return <ClientOnly fallback={null}>{() => <HomeRedirect />}</ClientOnly>;
}
