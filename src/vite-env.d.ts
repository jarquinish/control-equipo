/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE?: 'indexeddb' | 'rest' | 'supabase';
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_MICROSOFT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
