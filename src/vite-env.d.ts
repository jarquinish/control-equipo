/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE?: 'indexeddb' | 'rest';
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
