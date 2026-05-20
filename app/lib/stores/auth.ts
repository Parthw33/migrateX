import { map } from 'nanostores';

/** JWT from Migrate-X Lambda login — stored in localStorage so it persists across tabs/windows. */
const TOKEN_KEY = 'migratex_lambda_token';
const CS_USER_ID_KEY = 'migratex_cs_user_id';
const AUTH_META_KEY = 'migratex_auth_meta';

const AUTH_KEYS = [TOKEN_KEY, CS_USER_ID_KEY, AUTH_META_KEY];

export interface AuthState {
  appToken: string | null;
  isAuthenticated: boolean;
  region: string | null;
  email: string | null;
  csUserId: string | null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replaceAll('-', '+').replaceAll('_', '/'));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp < Date.now() / 1000;
}

function clearAuthStorage() {
  if (globalThis.window === undefined) return;
  try {
    for (const key of AUTH_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/**
 * Migrate any legacy sessionStorage values into localStorage so tabs that
 * upgraded mid-session don't lose their login.
 */
function migrateLegacySessionStorage() {
  if (globalThis.window === undefined) return;
  try {
    for (const key of AUTH_KEYS) {
      const legacy = sessionStorage.getItem(key);
      if (legacy && !localStorage.getItem(key)) {
        localStorage.setItem(key, legacy);
      }
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function loadAuthState(): AuthState {
  if (globalThis.window === undefined) {
    return { appToken: null, isAuthenticated: false, region: null, email: null, csUserId: null };
  }

  migrateLegacySessionStorage();

  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && !isTokenExpired(token)) {
      const metaRaw = localStorage.getItem(AUTH_META_KEY);
      const parsed = metaRaw ? JSON.parse(metaRaw) : {};
      const csUserId = localStorage.getItem(CS_USER_ID_KEY);
      return {
        appToken: token,
        isAuthenticated: true,
        region: parsed.region ?? null,
        email: parsed.email ?? null,
        csUserId: typeof csUserId === 'string' && csUserId.length > 0 ? csUserId : null,
      };
    }

    clearAuthStorage();
  } catch {
    // ignore
  }

  return { appToken: null, isAuthenticated: false, region: null, email: null, csUserId: null };
}

const initial = loadAuthState();

export const authStore = map<AuthState>(initial);

if (globalThis.window !== undefined) {
  // Sync auth state across tabs — login/logout in one tab updates the others.
  globalThis.window.addEventListener('storage', (event: StorageEvent) => {
    if (!event.key || !AUTH_KEYS.includes(event.key)) return;
    authStore.set(loadAuthState());
  });
}

export function loginAuth(appToken: string, region: string, email: string, csUserId: string | null = null) {
  if (globalThis.window !== undefined) {
    localStorage.setItem(TOKEN_KEY, appToken);
    localStorage.setItem(AUTH_META_KEY, JSON.stringify({ region, email }));
    if (csUserId) {
      localStorage.setItem(CS_USER_ID_KEY, csUserId);
    } else {
      localStorage.removeItem(CS_USER_ID_KEY);
    }
  }

  authStore.set({
    appToken,
    isAuthenticated: true,
    region,
    email,
    csUserId: csUserId || null,
  });
}

export function logoutAuth() {
  clearAuthStorage();

  authStore.set({
    appToken: null,
    isAuthenticated: false,
    region: null,
    email: null,
    csUserId: null,
  });
}

/** Re-read session into `authStore` and return whether the user has a valid token. */
export function checkAuthOnLoad(): boolean {
  if (globalThis.window === undefined) {
    return false;
  }

  const state = loadAuthState();
  authStore.set(state);

  return state.isAuthenticated;
}
