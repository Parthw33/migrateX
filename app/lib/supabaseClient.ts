import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
let cachedSig = '';

function resolveSupabaseUrl(): string {
  return String(import.meta.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '').trim();
}

function resolveSupabaseKey(): string {
  return String(
    import.meta.env.SUPABASE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.VITE_SUPABASE_KEY ||
      '',
  ).trim();
}

export function getSupabaseClient(): SupabaseClient | null {
  const url = resolveSupabaseUrl();
  const key = resolveSupabaseKey();
  if (!url || !key) {
    return null;
  }
  const sig = `${url}|${key}`;
  if (!cached || cachedSig !== sig) {
    cached = createClient(url, key);
    cachedSig = sig;
  }
  return cached;
}
