import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { KeyRound, LogIn, Mail, ShieldAlert } from 'lucide-react';
import { getSupabase, SUPABASE_EMAIL_CODE, SUPABASE_MICROSOFT, supabaseEnabled, supabaseRequired } from '../data/supabase';
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
  | { kind: 'pending'; client: SupabaseClient; email: string; retry: () => Promise<void>; message?: string }
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

/** Código de alta capturado en «Crear mi contraseña»: se canjea en cuanto hay sesión. */
let altaPendiente: { email: string; codigo: string } | null = null;

type Acceso = Member & { pendiente?: boolean };

/** Acceso del usuario con sesión. Usa au_mi_acceso (0003) y, si la base aún no lo tiene, la consulta anterior. */
async function leerAcceso(client: SupabaseClient, email: string): Promise<{ data: Acceso | null; error: boolean }> {
  const rpc = await client.rpc('au_mi_acceso');
  if (!rpc.error) return { data: (rpc.data as Acceso | null) ?? null, error: false };
  if (rpc.error.code !== 'PGRST202' && rpc.error.code !== '42883') return { data: null, error: true };
  const { data, error } = await client.from('au_members').select('email,rol,person_id,activo').eq('email', email).maybeSingle();
  return { data: (data as Acceso | null) ?? null, error: !!error };
}

/** Misma persona con el mismo rol, vínculo y estado: no hace falta reabrir la información. */
export function sameAccess(prev: Pick<AuthInfo, 'email' | 'member'>, email: string, member: Member): boolean {
  return prev.email === email && prev.member.rol === member.rol && prev.member.person_id === member.person_id && prev.member.activo === member.activo;
}

function SupabaseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    const resolve = async (client: SupabaseClient, session: Session | null): Promise<void> => {
      if (!session?.user?.email) {
        if (alive) setState({ kind: 'signedOut', client });
        return;
      }
      const email = session.user.email.toLowerCase();
      let { data, error } = await leerAcceso(client, email);
      let message: string | undefined;
      // Primera vez: canjea el código de alta con la cuenta recién creada.
      if (!error && data?.pendiente && altaPendiente?.email === email) {
        const claim = await client.rpc('au_completar_alta', { p_codigo: altaPendiente.codigo });
        altaPendiente = null;
        if (claim.error) message = 'No se pudo completar tu alta: ' + (claim.error.message || 'intenta de nuevo.');
        else ({ data, error } = await leerAcceso(client, email));
      }
      if (!alive) return;
      if (error) return setState({ kind: 'error', message: 'No fue posible verificar tu acceso. Revisa tu conexión e intenta de nuevo.' });
      if (!data || !data.activo) return setState({ kind: 'noAccess', client, email });
      if (data.pendiente) return setState({ kind: 'pending', client, email, message, retry: () => resolve(client, session) });
      const meta = session.user.user_metadata ?? {};
      // Al volver a la pestaña, Supabase renueva la sesión y avisa «SIGNED_IN» otra vez:
      // si es la misma persona con el mismo acceso, se conserva el estado (no se reabre la base).
      setState((prev) =>
        prev.kind === 'ready' && sameAccess(prev.auth, email, data as Member)
          ? prev
          : {
        kind: 'ready',
        auth: {
          client,
          email,
          name: (meta.full_name as string) || (meta.name as string) || undefined,
          member: { email: data.email, rol: data.rol, person_id: data.person_id, activo: data.activo },
          signOut: async () => {
            await client.auth.signOut();
          },
        },
      },
      );
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
  if (state.kind === 'pending') return <ClaimScreen key={state.message ?? ''} {...state} />;
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

/** Correo dado de alta que aún no completa su alta (o cuenta creada por alguien más con ese correo). */
function ClaimScreen({ client, email, retry, message }: { client: SupabaseClient; email: string; retry: () => Promise<void>; message?: string }) {
  const [codigo, setCodigo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(message ?? null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await client.rpc('au_completar_alta', { p_codigo: codigo });
    if (error) {
      setBusy(false);
      return setMsg('El código no corresponde a tu correo o ya expiró. Pide uno nuevo a Dirección.');
    }
    await retry();
  };
  return (
    <AuthScreen>
      <KeyRound size={32} className="warn" aria-hidden />
      <h2>Completa tu alta</h2>
      <p className="muted">
        <strong>{email}</strong> tiene acceso, pero falta confirmar que eres tú. Escribe el código de alta que te dio Dirección (si no lo tienes, pídeselo).
      </p>
      <form onSubmit={submit} className="auth-form">
        <label className="field">
          <span className="field-label">Código de alta</span>
          <input className="input auth-code" autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoFocus />
        </label>
        <button className="btn btn-primary btn-lg auth-full" disabled={busy || codigo.replace(/[^a-z0-9]/gi, '').length < 12}>
          Confirmar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => client.auth.signOut()}>
          Usar otra cuenta
        </button>
      </form>
      {msg && (
        <p className="field-error" role="alert">
          {msg}
        </p>
      )}
    </AuthScreen>
  );
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
  const [mode, setMode] = useState<'password' | 'code' | 'alta'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [altaCode, setAltaCode] = useState('');
  const [password2, setPassword2] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const clean = () => email.trim().toLowerCase();
  const validEmail = () => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean());

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!validEmail()) return setMsg('Escribe un correo válido.');
    if (!password) return setMsg('Escribe tu contraseña.');
    setBusy(true);
    setMsg(null);
    const { error } = await client.auth.signInWithPassword({ email: clean(), password });
    setBusy(false);
    if (error) setMsg('Correo o contraseña incorrectos. Si es tu primera vez, entra en «Crear mi contraseña».');
  };

  /** Primera vez: correo + código de alta → la persona crea su contraseña. */
  const createPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!validEmail()) return setMsg('Escribe un correo válido.');
    if (altaCode.replace(/[^a-z0-9]/gi, '').length < 12) return setMsg('Escribe el código de alta completo (12 caracteres).');
    if (password.length < 8) return setMsg('La contraseña debe tener al menos 8 caracteres.');
    if (password !== password2) return setMsg('Las contraseñas no coinciden.');
    setBusy(true);
    setMsg(null);
    const valid = await client.rpc('au_alta_valida', { p_email: clean(), p_codigo: altaCode });
    if (valid.error || valid.data !== true) {
      setBusy(false);
      return setMsg(valid.error ? 'No fue posible validar el código. Intenta de nuevo.' : 'El código no corresponde a ese correo o ya expiró. Pide uno nuevo a Dirección.');
    }
    altaPendiente = { email: clean(), codigo: altaCode };
    const up = await client.auth.signUp({ email: clean(), password });
    if (up.error) {
      // Ya creó su cuenta antes pero no terminó el alta: entra con esa contraseña.
      const exists = up.error.code === 'user_already_exists' || /already registered/i.test(up.error.message);
      const retry = exists ? await client.auth.signInWithPassword({ email: clean(), password }) : null;
      if (!retry || retry.error) {
        altaPendiente = null;
        setBusy(false);
        return setMsg(
          exists
            ? 'Ese correo ya tiene una contraseña. Entra con ella o pide a Dirección un código nuevo para restablecerla.'
            : /signups? not allowed|disabled/i.test(up.error.message)
              ? 'El registro está desactivado en Supabase. Dirección debe activar «Allow new users to sign up».'
              : 'No se pudo crear tu contraseña: ' + up.error.message,
        );
      }
      return;
    }
    if (!up.data.session) {
      altaPendiente = null;
      setBusy(false);
      return setMsg('Supabase pidió confirmar el correo. Dirección debe desactivar «Confirm email» y generarte un código nuevo.');
    }
  };

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!validEmail()) return setMsg('Escribe un correo válido.');
    setBusy(true);
    setMsg(null);
    const { error } = await client.auth.signInWithOtp({ email: clean(), options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (error) return setMsg('No se pudo enviar el código. Intenta de nuevo en un minuto.');
    setSent(true);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await client.auth.verifyOtp({ email: clean(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setMsg('El código no es válido o ya expiró. Solicita uno nuevo.');
  };

  const microsoft = async () => {
    const { error } = await client.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email openid profile', redirectTo: redirectTo() } });
    if (error) setMsg('No se pudo iniciar sesión con Microsoft.');
  };

  const switchMode = (m: 'password' | 'code' | 'alta') => {
    setMode(m);
    setSent(false);
    setMsg(null);
    setPassword('');
    setPassword2('');
  };

  const emailField = (
    <label className="field">
      <span className="field-label">Correo</span>
      <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@socasesores.com.mx" autoFocus />
    </label>
  );

  return (
    <AuthScreen>
      <h1 className="auth-title">{mode === 'alta' ? 'Crear mi contraseña' : 'Iniciar sesión'}</h1>
      {SUPABASE_MICROSOFT && mode !== 'alta' && (
        <>
          <button className="btn btn-primary btn-lg auth-full" onClick={microsoft}>
            <LogIn size={18} aria-hidden /> Entrar con cuenta Microsoft (SOC)
          </button>
          <p className="auth-or">o con tu correo</p>
        </>
      )}
      {mode === 'alta' ? (
        <form onSubmit={createPassword} className="auth-form">
          <p className="small muted">Primera vez: usa tu correo registrado y el código de alta que te dio Dirección.</p>
          {emailField}
          <label className="field">
            <span className="field-label">Código de alta</span>
            <input className="input auth-code" autoComplete="off" value={altaCode} onChange={(e) => setAltaCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" />
          </label>
          <label className="field">
            <span className="field-label">Nueva contraseña</span>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="field-hint">Mínimo 8 caracteres.</span>
          </label>
          <label className="field">
            <span className="field-label">Confirmar contraseña</span>
            <input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-lg auth-full" disabled={busy}>
            <KeyRound size={18} aria-hidden /> Crear contraseña y entrar
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode('password')}>
            Ya tengo contraseña
          </button>
        </form>
      ) : mode === 'password' ? (
        <form onSubmit={signIn} className="auth-form">
          {emailField}
          <label className="field">
            <span className="field-label">Contraseña</span>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-lg auth-full" disabled={busy}>
            <LogIn size={18} aria-hidden /> Entrar
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode('alta')}>
            Primera vez: crear mi contraseña
          </button>
          {SUPABASE_EMAIL_CODE && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode('code')}>
              No tengo contraseña: recibir un código por correo
            </button>
          )}
        </form>
      ) : !sent ? (
        <form onSubmit={sendCode} className="auth-form">
          {emailField}
          <button className="btn btn-secondary btn-lg auth-full" disabled={busy}>
            <Mail size={18} aria-hidden /> Enviarme un código de acceso
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode('password')}>
            Entrar con contraseña
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
