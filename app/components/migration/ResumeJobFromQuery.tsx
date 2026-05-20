import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { authStore } from '~/lib/stores/auth';
import { fetchScrapeJobDetail } from '~/lib/lambdaApi';
import { applyScrapeJobDetailToMigration } from '~/lib/migrationResume';

type Props = { children: React.ReactNode };

export function ResumeJobFromQuery({ children }: Props) {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useStore(authStore);
  const jidFromPath = params.jobId?.trim() ?? '';
  const jidFromQuery = searchParams.get('jobId')?.trim() ?? '';
  const jid = jidFromPath || jidFromQuery;
  const [ready, setReady] = useState(!jid);

  useEffect(() => {
    let cancelled = false;

    if (!jid) {
      setReady(true);
      return () => { cancelled = true; };
    }

    // Hide children while loading a new or different job (guards same-route navigation between jobs)
    setReady(false);

    if (!auth.appToken) {
      return () => { cancelled = true; };
    }

    const token = auth.appToken;

    void (async () => {
      const result = await fetchScrapeJobDetail(token, jid);

      if (cancelled) {
        return;
      }

      if (result.ok) {
        applyScrapeJobDetailToMigration(result.data);
      } else {
        toast.error(result.error);
      }

      if (jidFromQuery && !jidFromPath) {
        navigate(`/job/${encodeURIComponent(jid)}`, { replace: true });
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('jobId');
            return next;
          },
          { replace: true },
        );
      }

      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [jid, jidFromPath, jidFromQuery, auth.appToken, navigate, setSearchParams]);

  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#f4f5f7] text-migratex-elements-textSecondary">
        <span className="i-ph:circle-notch animate-spin text-3xl text-violet-600" aria-hidden />
        <p className="text-sm font-medium text-migratex-elements-textPrimary">Loading job…</p>
      </div>
    );
  }

  return <>{children}</>;
}
