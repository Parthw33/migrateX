/**
 * Locale service — fetches Contentstack locales through the MigrateX Lambda
 * proxy, with two-tier caching (memory + sessionStorage) and a comprehensive
 * offline fallback so the "Create stack" modal always has options.
 */

import { lambdaListLocales } from '~/lib/lambdaApi';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocaleOption {
  /** Contentstack locale code, e.g. "en-us" */
  value: string;
  /** Human-readable label, e.g. "English - United States" */
  label: string;
}

// ── Offline fallback ──────────────────────────────────────────────────────────
// Covers the full set of locales Contentstack ships with out-of-the-box.

export const FALLBACK_LOCALES: LocaleOption[] = [
  { value: 'en-us', label: 'English - United States' },
  { value: 'en-gb', label: 'English - United Kingdom' },
  { value: 'en-au', label: 'English - Australia' },
  { value: 'en-ca', label: 'English - Canada' },
  { value: 'en-nz', label: 'English - New Zealand' },
  { value: 'en-in', label: 'English - India' },
  { value: 'en-ie', label: 'English - Ireland' },
  { value: 'en-sg', label: 'English - Singapore' },
  { value: 'de-de', label: 'German - Germany' },
  { value: 'de-at', label: 'German - Austria' },
  { value: 'de-ch', label: 'German - Switzerland' },
  { value: 'fr-fr', label: 'French - France' },
  { value: 'fr-ca', label: 'French - Canada' },
  { value: 'fr-be', label: 'French - Belgium' },
  { value: 'fr-ch', label: 'French - Switzerland' },
  { value: 'es-es', label: 'Spanish - Spain' },
  { value: 'es-mx', label: 'Spanish - Mexico' },
  { value: 'es-ar', label: 'Spanish - Argentina' },
  { value: 'es-co', label: 'Spanish - Colombia' },
  { value: 'es-cl', label: 'Spanish - Chile' },
  { value: 'es-pe', label: 'Spanish - Peru' },
  { value: 'es-us', label: 'Spanish - United States' },
  { value: 'pt-br', label: 'Portuguese - Brazil' },
  { value: 'pt-pt', label: 'Portuguese - Portugal' },
  { value: 'it-it', label: 'Italian - Italy' },
  { value: 'nl-nl', label: 'Dutch - Netherlands' },
  { value: 'nl-be', label: 'Dutch - Belgium' },
  { value: 'sv-se', label: 'Swedish - Sweden' },
  { value: 'da-dk', label: 'Danish - Denmark' },
  { value: 'nb-no', label: 'Norwegian Bokmål - Norway' },
  { value: 'nn-no', label: 'Norwegian Nynorsk - Norway' },
  { value: 'fi-fi', label: 'Finnish - Finland' },
  { value: 'pl-pl', label: 'Polish - Poland' },
  { value: 'cs-cz', label: 'Czech - Czech Republic' },
  { value: 'sk-sk', label: 'Slovak - Slovakia' },
  { value: 'hu-hu', label: 'Hungarian - Hungary' },
  { value: 'ro-ro', label: 'Romanian - Romania' },
  { value: 'bg-bg', label: 'Bulgarian - Bulgaria' },
  { value: 'hr-hr', label: 'Croatian - Croatia' },
  { value: 'sl-si', label: 'Slovenian - Slovenia' },
  { value: 'lt-lt', label: 'Lithuanian - Lithuania' },
  { value: 'lv-lv', label: 'Latvian - Latvia' },
  { value: 'et-ee', label: 'Estonian - Estonia' },
  { value: 'ru-ru', label: 'Russian - Russia' },
  { value: 'uk-ua', label: 'Ukrainian - Ukraine' },
  { value: 'el-gr', label: 'Greek - Greece' },
  { value: 'tr-tr', label: 'Turkish - Turkey' },
  { value: 'ar-eg', label: 'Arabic - Egypt' },
  { value: 'ar-sa', label: 'Arabic - Saudi Arabia' },
  { value: 'ar-ae', label: 'Arabic - United Arab Emirates' },
  { value: 'he-il', label: 'Hebrew - Israel' },
  { value: 'fa-ir', label: 'Persian - Iran' },
  { value: 'zh-cn', label: 'Chinese (Simplified) - China' },
  { value: 'zh-tw', label: 'Chinese (Traditional) - Taiwan' },
  { value: 'zh-hk', label: 'Chinese - Hong Kong' },
  { value: 'ja-jp', label: 'Japanese - Japan' },
  { value: 'ko-kr', label: 'Korean - South Korea' },
  { value: 'th-th', label: 'Thai - Thailand' },
  { value: 'vi-vn', label: 'Vietnamese - Vietnam' },
  { value: 'id-id', label: 'Indonesian - Indonesia' },
  { value: 'ms-my', label: 'Malay - Malaysia' },
  { value: 'hi-in', label: 'Hindi - India' },
  { value: 'bn-in', label: 'Bengali - India' },
  { value: 'ta-in', label: 'Tamil - India' },
  { value: 'te-in', label: 'Telugu - India' },
  { value: 'mr-in', label: 'Marathi - India' },
  { value: 'gu-in', label: 'Gujarati - India' },
  { value: 'kn-in', label: 'Kannada - India' },
  { value: 'ml-in', label: 'Malayalam - India' },
  { value: 'ur-pk', label: 'Urdu - Pakistan' },
  { value: 'pa-in', label: 'Punjabi - India' },
  { value: 'af-za', label: 'Afrikaans - South Africa' },
  { value: 'sw-ke', label: 'Swahili - Kenya' },
  { value: 'zu-za', label: 'Zulu - South Africa' },
  { value: 'ca-es', label: 'Catalan - Spain' },
  { value: 'eu-es', label: 'Basque - Spain' },
  { value: 'gl-es', label: 'Galician - Spain' },
  { value: 'is-is', label: 'Icelandic - Iceland' },
  { value: 'mt-mt', label: 'Maltese - Malta' },
  { value: 'cy-gb', label: 'Welsh - United Kingdom' },
  { value: 'ga-ie', label: 'Irish - Ireland' },
  { value: 'sq-al', label: 'Albanian - Albania' },
  { value: 'mk-mk', label: 'Macedonian - North Macedonia' },
  { value: 'sr-rs', label: 'Serbian - Serbia' },
  { value: 'bs-ba', label: 'Bosnian - Bosnia and Herzegovina' },
  { value: 'az-az', label: 'Azerbaijani - Azerbaijan' },
  { value: 'ka-ge', label: 'Georgian - Georgia' },
  { value: 'hy-am', label: 'Armenian - Armenia' },
  { value: 'kk-kz', label: 'Kazakh - Kazakhstan' },
  { value: 'uz-uz', label: 'Uzbek - Uzbekistan' },
  { value: 'mn-mn', label: 'Mongolian - Mongolia' },
  { value: 'ms-bn', label: 'Malay - Brunei' },
  { value: 'km-kh', label: 'Khmer - Cambodia' },
  { value: 'lo-la', label: 'Lao - Laos' },
  { value: 'my-mm', label: 'Burmese - Myanmar' },
  { value: 'si-lk', label: 'Sinhala - Sri Lanka' },
  { value: 'ne-np', label: 'Nepali - Nepal' },
];

// ── Cache ─────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'migratex_locales_v1';
const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  data: LocaleOption[];
  ts: number;
}

/** Module-level memory cache — survives route navigations, cleared on reload. */
let memCache: CacheEntry | null = null;

function readSession(): LocaleOption[] | null {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = globalThis.sessionStorage.getItem(SESSION_KEY);

    if (!raw) {
      return null;
    }

    const entry = JSON.parse(raw) as CacheEntry;

    if (Date.now() - entry.ts > TTL_MS) {
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

function writeSession(data: LocaleOption[]): void {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return;
  }

  try {
    const entry: CacheEntry = { data, ts: Date.now() };
    globalThis.sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry));
  } catch {
    // Quota exceeded — ignore
  }
}

export function clearLocaleCache(): void {
  memCache = null;

  if (typeof globalThis.sessionStorage !== 'undefined') {
    try {
      globalThis.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns locale options, checking memory → sessionStorage → Lambda API in
 * that order.  Falls back to FALLBACK_LOCALES if the API is unreachable.
 * Always resolves (never rejects).
 */
export async function fetchLocales(token: string): Promise<LocaleOption[]> {
  // 1. Memory cache
  if (memCache && Date.now() - memCache.ts < TTL_MS) {
    return memCache.data;
  }

  // 2. Session cache
  const session = readSession();

  if (session) {
    memCache = { data: session, ts: Date.now() };
    return session;
  }

  // 3. Lambda API
  try {
    const raw = await lambdaListLocales(token);

    let result: LocaleOption[];

    if (raw.length > 0) {
      result = raw.map((l) => ({ value: l.code, label: l.name || l.code }));

      // Guarantee en-us is always available as the first option
      if (!result.some((l) => l.value === 'en-us')) {
        result.unshift({ value: 'en-us', label: 'English - United States' });
      }
    } else {
      result = FALLBACK_LOCALES;
    }

    memCache = { data: result, ts: Date.now() };
    writeSession(result);
    return result;
  } catch {
    return FALLBACK_LOCALES;
  }
}
