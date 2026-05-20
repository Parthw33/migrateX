/** Contentstack web app — existing stack dashboard (do not create a new stack). */
export function buildContentstackStackDashboardUrl(
  stackApiKey: string,
  branch = 'main',
): string | null {
  const id = stackApiKey.trim();

  if (!id) {
    return null;
  }

  const branchParam = branch.trim() || 'main';

  return `https://app.contentstack.com/#!/stack/${encodeURIComponent(id)}/dashboard?branch=${encodeURIComponent(branchParam)}`;
}
