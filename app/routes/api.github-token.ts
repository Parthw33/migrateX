import { type ActionFunctionArgs, json } from '@remix-run/node';

/**
 * API route to manage GitHub token.
 * Stores the token in memory for the current session.
 * For persistence across restarts, add GITHUB_PERSONAL_ACCESS_TOKEN to .env.local.
 */

// GitHub API base URL (can be overridden via env for GitHub Enterprise)
const GITHUB_API_BASE =
  (typeof process !== 'undefined' ? process.env.GITHUB_API_BASE : null) || 'https://api.github.com';

/**
 * Get GitHub token from environment variables.
 * Checks: GITHUB_PERSONAL_ACCESS_TOKEN, GITHUB_TOKEN (fallback).
 */
function getEnvToken(): string | null {
  if (typeof process === 'undefined') {
    return null;
  }

  return process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || null;
}

// in-memory token storage (initialized from .env.local if available)
let inMemoryToken: string | null = getEnvToken();

export function getInMemoryToken(): string | null {
  // always check env first, then fall back to in-memory
  return inMemoryToken || getEnvToken();
}

export function setInMemoryToken(token: string | null): void {
  inMemoryToken = token;
}

async function validateGitHubToken(
  token: string,
): Promise<{ valid: boolean; user?: { login: string; avatar_url: string } }> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    const user = (await response.json()) as { login: string; avatar_url: string };

    return { valid: true, user };
  } catch {
    return { valid: false };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json<{ action: string; token?: string }>();

    switch (body.action) {
      case 'save': {
        const { token } = body;

        if (!token || typeof token !== 'string') {
          return json({ success: false, error: 'Token is required' }, { status: 400 });
        }

        // validate the token with GitHub
        const validation = await validateGitHubToken(token);

        if (!validation.valid) {
          return json({ success: false, error: 'Invalid GitHub token. Please check and try again.' }, { status: 400 });
        }

        // store in memory for current session
        inMemoryToken = token;

        return json({
          success: true,
          message: 'Token saved successfully for this session',
          user: validation.user,
          note: 'To persist the token across server restarts, add GITHUB_TOKEN to your .env.local file',
        });
      }

      case 'clear': {
        // clear in-memory token
        inMemoryToken = null;

        return json({ success: true, message: 'Token cleared' });
      }

      case 'validate': {
        const { token } = body;

        if (!token) {
          return json({ valid: false });
        }

        const validation = await validateGitHubToken(token);

        return json(validation);
      }

      default:
        return json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('GitHub token API error:', error);

    return json({ success: false, error: error instanceof Error ? error.message : 'Server error' }, { status: 500 });
  }
}
