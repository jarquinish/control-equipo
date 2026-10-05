import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Configuración de Supabase (en tiempo de build, ver .env.example).
 * La "anon key" es pública por diseño: la seguridad la aplica la RLS del servidor.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const SUPABASE_MICROSOFT = import.meta.env.VITE_SUPABASE_MICROSOFT === 'true';

export function supabaseEnabled(): boolean {
  return import.meta.env.VITE_STORAGE === 'supabase' && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
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
