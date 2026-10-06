import type { SupabaseClient } from '@supabase/supabase-js';

/** Configuración en tiempo de ejecución (`config.js` junto a index.html). */
interface RuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  microsoft?: boolean;
}
const runtime: RuntimeConfig = (globalThis as { AU_CONFIG?: RuntimeConfig }).AU_CONFIG ?? {};

/**
 * Configuración de Supabase: primero `config.js` (se edita al publicar, sin
 * recompilar); si no, las variables de build (ver .env.example).
 * La "anon key" es pública por diseño: la seguridad la aplica la RLS del servidor.
 */
export const SUPABASE_URL = runtime.supabaseUrl?.trim() || import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = runtime.supabaseAnonKey?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const SUPABASE_MICROSOFT = runtime.microsoft ?? import.meta.env.VITE_SUPABASE_MICROSOFT === 'true';

/** El build de producción pide Supabase (`VITE_STORAGE=supabase`). */
export function supabaseRequired(): boolean {
  return import.meta.env.VITE_STORAGE === 'supabase';
}

export function supabaseEnabled(): boolean {
  return (supabaseRequired() || !!runtime.supabaseUrl?.trim()) && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

let clientPromise: Promise<SupabaseClient> | undefined;

/** Cliente único; la librería se carga sólo si se usa Supabase (no pesa en modo local). */
export function getSupabase(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    }),
  );
  return clientPromise;
}
