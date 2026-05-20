import { type ActionFunctionArgs, json } from '@remix-run/node';

/**
 * Proxies Contentstack app login (same contract as browser POST to user-session).
 * 294 = 2FA required (@contentstack/management NON_AUTH_401_ERROR_CODES).
 */
const CONTENTSTACK_USER_SESSION = 'https://app.contentstack.com/api/v3/user-session';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error_message: 'Method not allowed' }, { status: 405 });
  }

  let body: { email?: string; password?: string };

  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return json({ error_message: 'Invalid JSON body' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');

  if (!email || !password) {
    return json({ error_message: 'Email and password are required' }, { status: 400 });
  }

  const qs = new URLSearchParams({
    include_orgs_roles: 'true',
    include_orgs: 'true',
    include_branches_rule: 'true',
    r: String(Math.random()),
  });
  const url = `${CONTENTSTACK_USER_SESSION}?${qs}`;

  let csRes: Response;

  try {
    csRes = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        origin: 'https://app.contentstack.com',
        referer: 'https://app.contentstack.com/',
      },
      body: JSON.stringify({ user: { email, password } }),
    });
  } catch {
    return json({ error_message: 'Unable to reach Contentstack. Check your network and try again.' }, { status: 502 });
  }

  const text = await csRes.text();
  let data: Record<string, unknown> = {};

  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return json(
      {
        password_verified: false,
        error_message: `Contentstack returned an unexpected response (${csRes.status}).`,
      },
      { status: 200 },
    );
  }

  const errorCode = Number(data.error_code ?? 0);

  if (errorCode === 294) {
    return json({ password_verified: true, tfa_required: true }, { status: 200 });
  }

  const user = data.user;
  if (user && typeof user === 'object') {
    const u = user as Record<string, unknown>;
    if (typeof u.authtoken === 'string' && u.authtoken.length > 0) {
      return json({ password_verified: true, tfa_required: false }, { status: 200 });
    }
  }

  const errMsg = String(data.error_message ?? data.message ?? 'Could not verify credentials.').trim();

  return json({ password_verified: false, error_message: errMsg || 'Could not verify credentials.' }, { status: 200 });
}
