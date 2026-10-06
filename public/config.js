/*
 * Alignment & Unblock · configuración de producción.
 * Es el ÚNICO archivo que se edita al publicar. Se lee al abrir la app (no hay que recompilar).
 *
 * Supabase → Project Settings → API:
 *   supabaseUrl      = "Project URL"      (https://xxxx.supabase.co)
 *   supabaseAnonKey  = "anon public key"  (es pública por diseño; la seguridad la aplica la RLS del servidor)
 *
 * Si ambos quedan vacíos, la app funciona en modo local (cada navegador guarda sus propios datos).
 */
window.AU_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // true muestra «Entrar con cuenta Microsoft» (requiere configurar el proveedor Azure en Supabase)
  microsoft: false,
};
