import { redirect, type LoaderFunctionArgs } from '@remix-run/node';

/** Legacy URL — redirect to `/job/:jobId`. */
export const loader = ({ params }: LoaderFunctionArgs) => {
  const jobId = params.jobId?.trim();

  if (!jobId) {
    throw redirect('/createJob');
  }

  throw redirect(`/job/${encodeURIComponent(jobId)}`);
};
