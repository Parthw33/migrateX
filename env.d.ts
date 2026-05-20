/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MIGRATEX_API_BASE_URL?: string;
  readonly VITE_LAMBDA_API_URL?: string;
  readonly LAMBDA_API_URL?: string;
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
