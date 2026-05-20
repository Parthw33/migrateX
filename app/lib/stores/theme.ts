import { atom } from 'nanostores';

export type Theme = 'dark' | 'light';

export const kTheme = 'migratex_theme';

/** Theme preference (localStorage) applies only on this route (website generator / IDE). */
export const GENERATE_WEBSITE_BASE_PATH = '/generate-website';

export function isGenerateWebsitePath(pathname: string): boolean {
  const p = pathname || '';

  // Static legacy path: /generate-website
  if (p === GENERATE_WEBSITE_BASE_PATH || p.startsWith(`${GENERATE_WEBSITE_BASE_PATH}/`)) {
    return true;
  }

  // Dynamic path: /:jobId/generate-website
  return /^\/[^/]+\/generate-website(\/.*)?$/.test(p);
}

export function themeIsDark() {
  return themeStore.get() === 'dark';
}

export const DEFAULT_THEME = 'light';

export const themeStore = atom<Theme>(initStore());

function initStore() {
  if (!import.meta.env.SSR && typeof window !== 'undefined') {
    if (!isGenerateWebsitePath(window.location.pathname)) {
      return DEFAULT_THEME;
    }

    const persistedTheme = localStorage.getItem(kTheme) as Theme | undefined;
    const themeAttribute = document.querySelector('html')?.getAttribute('data-theme');

    if (persistedTheme === 'dark' || persistedTheme === 'light') {
      return persistedTheme;
    }

    if (themeAttribute === 'dark' || themeAttribute === 'light') {
      return themeAttribute;
    }
  }

  return DEFAULT_THEME;
}

/**
 * Applies theme from localStorage on the generate-website route; otherwise forces app chrome to light.
 * Call when the route changes (e.g. root layout).
 */
export function syncThemeWithRoute(pathname: string) {
  if (import.meta.env.SSR || typeof window === 'undefined') {
    return;
  }

  if (isGenerateWebsitePath(pathname)) {
    const saved = localStorage.getItem(kTheme) as Theme | null;
    const t = saved === 'dark' || saved === 'light' ? saved : DEFAULT_THEME;

    themeStore.set(t);
    document.documentElement.setAttribute('data-theme', t);

    return;
  }

  themeStore.set(DEFAULT_THEME);
  document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
}

export function setTheme(theme: Theme) {
  if (import.meta.env.SSR) {
    themeStore.set(theme);

    return;
  }

  if (!isGenerateWebsitePath(window.location.pathname)) {
    themeStore.set(DEFAULT_THEME);
    document.documentElement.setAttribute('data-theme', DEFAULT_THEME);

    return;
  }

  themeStore.set(theme);
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(kTheme, theme);
}

export function toggleTheme() {
  if (!isGenerateWebsitePath(window.location.pathname)) {
    return;
  }

  const currentTheme = themeStore.get();
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  setTheme(newTheme);
}
