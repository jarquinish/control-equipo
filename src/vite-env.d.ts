/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE?: 'indexeddb' | 'rest' | 'supabase';
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_MICROSOFT?: string;
  readonly VITE_SUPABASE_EMAIL_CODE?: string;
  readonly VITE_ROUTER?: 'history' | 'hash';
  readonly VITE_PREVIEW?: string;
  readonly VITE_NO_DEMO?: string;
  readonly VITE_DB_PREFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
