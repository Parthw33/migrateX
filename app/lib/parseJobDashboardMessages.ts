/**
 * Parse human-readable job messages from Supabase `jobs` rows for dashboard stats.
 * Examples: "Complete — 3 content types generated" → 3, "7 entries generated" → 7.
 */
export function parseContentTypesCountFromProgressMessage(message: string | null | undefined): number | null {
  if (message == null || !String(message).trim()) {
    return null;
  }

  const m = String(message).match(/(\d+)\s+content types?\b/i);

  if (!m) {
    return null;
  }

  const n = Number.parseInt(m[1], 10);

  return Number.isNaN(n) ? null : n;
}

export function parseEntriesCountFromEntriesMessage(message: string | null | undefined): number | null {
  if (message == null || !String(message).trim()) {
    return null;
  }

  const m = String(message).match(/(\d+)\s+entries\b/i);

  if (!m) {
    return null;
  }

  const n = Number.parseInt(m[1], 10);

  return Number.isNaN(n) ? null : n;
}
