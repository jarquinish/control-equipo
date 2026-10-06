import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { LogIn, Mail, ShieldAlert } from 'lucide-react';
import { getSupabase, SUPABASE_MICROSOFT, supabaseEnabled, supabaseRequired } from '../data/supabase';
import type { Role } from '../domain/types';

export interface Member {
  email: string;
  rol: Role;
  person_id: string | null;
  activo: boolean;
}

/** Sesión multiusuario (sólo cuando la app usa Supabase). */
export interface AuthInfo {
  client: SupabaseClient;
  email: string;
  name?: string;
  member: Member;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthInfo | null>(null);

/** `null` en modo local (sin Supabase). */
export function useAuth(): AuthInfo | null {
  return useContext(AuthContext);
}

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut'; client: SupabaseClient }
  | { kind: 'noAccess'; client: SupabaseClient; email: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; auth: AuthInfo };

/** Vuelve a la misma página (en modo hash, p. ej. una página de HubSpot, la ruta real es la del documento). */
const redirectTo = () =>
  import.meta.env.VITE_ROUTER === 'hash' ? window.location.origin + window.location.pathname : window.location.origin + (import.meta.env.BASE_URL ?? '/');

/**
 * Puerta de acceso: en modo local no hace nada; con Supabase exige sesión y que
 * el correo esté dado de alta y activo en `au_members`.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  if (supabaseRequired() && !supabaseEnabled()) {
    // Versión de producción sin conexión configurada: mejor avisar que trabajar en local sin saberlo.
    return (
      <AuthScreen>
        <ShieldAlert size={36} className="warn" aria-hidden />
        <h2>Falta conectar la base de datos</h2>
        <p className="muted" data-testid="config-missing">
          Esta es la versión en línea, pero aún no tiene la conexión a Supabase. Quien administra el sitio debe llenar <strong>supabaseUrl</strong> y{' '}
          <strong>supabaseAnonKey</strong> en el bloque <code>AU_CONFIG</code> (al inicio de la plantilla de HubSpot, o en <code>config.js</code> junto a index.html) y recargar.
        </p>
      </AuthScreen>
    );
  }
  if (!supabaseEnabled()) return <>{children}</>;
  return <SupabaseGate>{children}</SupabaseGate>;
}

function SupabaseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    const resolve = async (client: SupabaseClient, session: Session | null) => {
      if (!session?.user?.email) return alive && setState({ kind: 'signedOut', client });
      const email = session.user.email.toLowerCase();
      const { data, error } = await client.from('au_members').select('email,rol,person_id,activo').eq('email', email).maybeSingle();
      if (!alive) return;
      if (error) return setState({ kind: 'error', message: 'No fue posible verificar tu acceso. Revisa tu conexión e intenta de nuevo.' });
      if (!data || !data.activo) return setState({ kind: 'noAccess', client, email });
      const meta = session.user.user_metadata ?? {};
      setState({
        kind: 'ready',
        auth: {
          client,
          email,
          name: (meta.full_name as string) || (meta.name as string) || undefined,
          member: data as Member,
          signOut: async () => {
            await client.auth.signOut();
          },
        },
      });
    };
    getSupabase()
      .then(async (client) => {
        const { data } = await client.auth.getSession();
        await resolve(client, data.session);
        const sub = client.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void resolve(client, session);
        });
        unsub = () => sub.data.subscription.unsubscribe();
      })
      .catch((err) => {
        console.error('[Alignment & Unblock] Supabase', err);
        if (alive) setState({ kind: 'error', message: 'No fue posible conectar con el servidor.' });
      });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <div className="loading" role="status">
        <span className="brand-mark" aria-hidden>A<span>&amp;</span>U</span>
        <span>Verificando acceso…</span>
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <AuthScreen>
        <p className="alert alert-yellow">{state.message}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
      </AuthScreen>
    );
  }
  if (state.kind === 'signedOut') return <LoginScreen client={state.client} />;
  if (state.kind === 'noAccess') {
    return (
      <AuthScreen>
        <ShieldAlert size={36} className="warn" aria-hidden />
        <h2>Tu correo aún no tiene acceso</h2>
        <p className="muted">
          <strong>{state.email}</strong> inició sesión, pero no está dado de alta. Pide a Dirección que te agregue en <strong>Configuración → Accesos</strong>.
        </p>
        <button className="btn btn-secondary" onClick={() => state.client.auth.signOut()}>
          Usar otra cuenta
        </button>
      </AuthScreen>
    );
  }
  return <AuthContext.Provider value={state.auth}>{children}</AuthContext.Provider>;
}

function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden>A<span>&amp;</span>U</span>
          <div>
            <strong>Alignment &amp; Unblock</strong>
            <span className="small muted block">Dirección de Posicionamiento · SOC</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoginScreen({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return setMsg('Escribe un correo válido.');
    setBusy(true);
    setMsg(null);
    const { error } = await client.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (error) return setMsg('No se pudo enviar el código. Intenta de nuevo en un minuto.');
    setSent(true);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setMsg('El código no es válido o ya expiró. Solicita uno nuevo.');
  };

  const microsoft = async () => {
    const { error } = await client.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email openid profile', redirectTo: redirectTo() } });
    if (error) setMsg('No se pudo iniciar sesión con Microsoft.');
  };

  return (
    <AuthScreen>
      <h1 className="auth-title">Iniciar sesión</h1>
      {SUPABASE_MICROSOFT && (
        <>
          <button className="btn btn-primary btn-lg auth-full" onClick={microsoft}>
            <LogIn size={18} aria-hidden /> Entrar con cuenta Microsoft (SOC)
          </button>
          <p className="auth-or">o con un código por correo</p>
        </>
      )}
      {!sent ? (
        <form onSubmit={sendCode} className="auth-form">
          <label className="field">
            <span className="field-label">Correo</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@socasesores.com.mx" autoFocus />
          </label>
          <button className="btn btn-secondary btn-lg auth-full" disabled={busy}>
            <Mail size={18} aria-hidden /> Enviarme un código de acceso
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="auth-form">
          <p className="small muted">
            Enviamos un código a <strong>{email}</strong>. Escríbelo aquí (o abre el enlace del correo en este navegador).
          </p>
          <label className="field">
            <span className="field-label">Código</span>
            <input className="input auth-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus maxLength={10} />
          </label>
          <button className="btn btn-primary btn-lg auth-full" disabled={busy || code.trim().length < 6}>
            Entrar
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSent(false)}>
            Usar otro correo
          </button>
        </form>
      )}
      {msg && (
        <p className="field-error" role="alert">
          {msg}
        </p>
      )}
    </AuthScreen>
  );
}
