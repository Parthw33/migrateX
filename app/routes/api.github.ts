import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { getInMemoryToken } from './api.github-token';

/**
 * Server-side GitHub API route.
 * Handles GitHub operations using a secure server-side token from environment variables.
 * The token is never exposed to the client.
 */

const GITHUB_API_BASE = 'https://api.github.com';

interface GitHubEnv {
  GITHUB_TOKEN?: string;
}

function getToken(env: GitHubEnv): string | null {
  // first check in-memory token (set after user saves token)
  const inMemoryToken = getInMemoryToken();

  if (inMemoryToken) {
    return inMemoryToken;
  }

  // fallback to environment variable
  return env.GITHUB_TOKEN || null;
}

async function githubRequest<T>(token: string, endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(errorData.message || `GitHub API error: ${response.status}`);
  }

  const text = await response.text();

  return text ? JSON.parse(text) : ({} as T);
}

// GET /api/github - Check authentication status and get user info
export async function loader({ context }: LoaderFunctionArgs) {
  const env = process.env as unknown as GitHubEnv;
  const token = getToken(env);

  if (!token) {
    return json({ authenticated: false, hasServerToken: false });
  }

  try {
    const user = await githubRequest<{
      login: string;
      id: number;
      avatar_url: string;
      name: string | null;
      email: string | null;
    }>(token, '/user');

    return json({
      authenticated: true,
      hasServerToken: true,
      user,
    });
  } catch (error) {
    console.error('GitHub authentication check failed:', error);
    return json({ authenticated: false, hasServerToken: true, error: 'Invalid token' });
  }
}

// POST /api/github - Handle various GitHub operations
export async function action({ context, request }: ActionFunctionArgs) {
  const env = process.env as unknown as GitHubEnv;
  const token = getToken(env);

  if (!token) {
    return json({ error: 'GitHub token not configured. Please add your token first.' }, { status: 401 });
  }

  try {
    const body = await request.json<{
      action: 'listRepos' | 'createRepo' | 'pushFiles' | 'getUser';
      payload?: Record<string, unknown>;
    }>();

    switch (body.action) {
      case 'getUser': {
        const user = await githubRequest(token, '/user');
        return json({ success: true, data: user });
      }

      case 'listRepos': {
        const perPage = (body.payload?.perPage as number) || 30;
        const page = (body.payload?.page as number) || 1;
        const repos = await githubRequest(
          token,
          `/user/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc`,
        );
        return json({ success: true, data: repos });
      }

      case 'createRepo': {
        const { name, description, isPrivate } = body.payload || {};
        const repo = await githubRequest(token, '/user/repos', {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: description || 'Created with MigrateX',
            private: isPrivate ?? false,
            auto_init: true,
          }),
        });
        return json({ success: true, data: repo });
      }

      case 'pushFiles': {
        const { owner, repo, files, commitMessage, branch } = body.payload || {};

        if (!owner || !repo || !files) {
          return json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const result = await pushFilesToGitHub(
          token,
          owner as string,
          repo as string,
          files as Array<{ path: string; content: string }>,
          (commitMessage as string) || 'Update from MigrateX',
          (branch as string) || 'main',
        );

        return json(result);
      }

      default:
        return json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('GitHub API error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'GitHub API error',
      },
      { status: 500 },
    );
  }
}

async function isRepoEmpty(token: string, owner: string, repo: string): Promise<boolean> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (response.status === 409) {
      return true;
    }

    if (!response.ok) {
      return true;
    }

    const commits = await response.json();
    return !Array.isArray(commits) || commits.length === 0;
  } catch {
    return true;
  }
}

async function pushFilesToGitHub(
  token: string,
  owner: string,
  repo: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string,
  branch: string,
): Promise<{ success: boolean; message: string; repoUrl?: string; commitSha?: string }> {
  try {
    const isEmpty = await isRepoEmpty(token, owner, repo);

    if (isEmpty) {
      // Push files one by one for empty repos
      let lastCommitSha = '';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = Buffer.from(file.content, 'utf-8').toString('base64');

        const response = await githubRequest<{ commit: { sha: string } }>(
          token,
          `/repos/${owner}/${repo}/contents/${file.path}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              message: i === 0 ? commitMessage : `Add ${file.path}`,
              content,
              branch,
            }),
          },
        );

        lastCommitSha = response.commit.sha;
      }

      return {
        success: true,
        message: `Successfully pushed ${files.length} files to ${owner}/${repo}`,
        repoUrl: `https://github.com/${owner}/${repo}`,
        commitSha: lastCommitSha,
      };
    }

    // For non-empty repos, use the Git Data API
    let baseSha: string;
    let baseTreeSha: string;
    let actualBranch = branch;

    try {
      const refData = await githubRequest<{ object: { sha: string } }>(
        token,
        `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
      );
      baseSha = refData.object.sha;

      const commitData = await githubRequest<{ tree: { sha: string } }>(
        token,
        `/repos/${owner}/${repo}/git/commits/${baseSha}`,
      );
      baseTreeSha = commitData.tree.sha;
    } catch {
      const repoInfo = await githubRequest<{ default_branch: string }>(token, `/repos/${owner}/${repo}`);
      actualBranch = repoInfo.default_branch || 'main';

      const refData = await githubRequest<{ object: { sha: string } }>(
        token,
        `/repos/${owner}/${repo}/git/ref/heads/${actualBranch}`,
      );
      baseSha = refData.object.sha;

      const commitData = await githubRequest<{ tree: { sha: string } }>(
        token,
        `/repos/${owner}/${repo}/git/commits/${baseSha}`,
      );
      baseTreeSha = commitData.tree.sha;
    }

    const treeItems = await Promise.all(
      files.map(async (file) => {
        const blobData = await githubRequest<{ sha: string }>(token, `/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({
            content: file.content,
            encoding: 'utf-8',
          }),
        });

        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blobData.sha,
        };
      }),
    );

    const treeData = await githubRequest<{ sha: string }>(token, `/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems,
      }),
    });

    const newCommit = await githubRequest<{ sha: string }>(token, `/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: commitMessage,
        tree: treeData.sha,
        parents: [baseSha],
      }),
    });

    if (actualBranch === branch) {
      await githubRequest(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sha: newCommit.sha,
          force: true,
        }),
      });
    } else {
      try {
        await githubRequest(token, `/repos/${owner}/${repo}/git/refs`, {
          method: 'POST',
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: newCommit.sha,
          }),
        });
      } catch {
        await githubRequest(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
          method: 'PATCH',
          body: JSON.stringify({
            sha: newCommit.sha,
            force: true,
          }),
        });
      }
    }

    return {
      success: true,
      message: `Successfully pushed ${files.length} files to ${owner}/${repo}`,
      repoUrl: `https://github.com/${owner}/${repo}`,
      commitSha: newCommit.sha,
    };
  } catch (error) {
    console.error('Push failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to push to GitHub',
    };
  }
}
