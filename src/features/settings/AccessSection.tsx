import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, KeyRound, Plus, RefreshCw, UserCheck } from 'lucide-react';
import { ROLE_LABELS, ROLES } from '../../domain/constants';
import type { Role } from '../../domain/types';
import type { AuthInfo, Member } from '../../state/auth';
import { useDb } from '../../state/app';
import { Section } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type MemberRow = Member & { nombre?: string | null; user_id?: string | null };

/** Configuración → Accesos: quién puede entrar al espacio compartido y con qué rol. */
export function AccessSection({ auth }: { auth: AuthInfo }) {
  const db = useDb();
  const { toast, confirm } = useFeedback();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [issued, setIssued] = useState<{ email: string; code: string } | null>(null);
  const [form, setForm] = useState({ email: '', rol: 'GERENTE' as Role, person_id: '' });
  const isAdmin = auth.member.rol === 'ADMIN' || auth.member.rol === 'DIRECTOR';

  const refresh = useCallback(async () => {
    const { data, error } = await auth.client.from('au_members').select('*').order('email');
    if (error) return toast('No se pudieron cargar los accesos.', 'error');
    setMembers((data ?? []) as MemberRow[]);
    // Altas con código sin completar (requiere 0003; sin ella, la lista queda vacía).
    const altas = await auth.client.rpc('au_altas_pendientes');
    setPending(new Set(altas.error ? [] : ((altas.data ?? []) as { email: string }[]).map((a) => a.email)));
  }, [auth.client, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (m: Partial<MemberRow> & { email: string }, success: string): Promise<boolean> => {
    const { error } = await auth.client.from('au_members').upsert(m, { onConflict: 'email' });
    if (error) {
      toast(error.code === '42501' ? 'Sólo Dirección o Administración administran accesos.' : 'No se pudo guardar el acceso.', 'error');
      return false;
    }
    toast(success);
    void refresh();
    return true;
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return toast('Escribe un correo válido.', 'error');
    const isNew = !members?.some((m) => m.email === email);
    if (!(await save({ email, rol: form.rol, person_id: form.person_id || null, activo: true }, `Acceso otorgado a ${email}`))) return;
    setForm({ email: '', rol: 'GERENTE', person_id: '' });
    // Persona nueva: su código de alta para crear su contraseña (requiere 0003; sin ella, se omite).
    if (isNew) {
      const { data, error } = await auth.client.rpc('au_generar_alta', { p_email: email });
      if (!error) setIssued({ email, code: String(data) });
      void refresh();
    }
  };

  const toggle = async (m: Member) => {
    if (m.email === auth.email && m.activo) {
      const ok = await confirm({ title: 'Quitar tu propio acceso', message: 'Perderás el acceso al guardar. ¿Continuar?', confirmLabel: 'Quitar acceso', danger: true });
      if (!ok) return;
    }
    await save({ ...m, activo: !m.activo }, m.activo ? `Acceso suspendido: ${m.email}` : `Acceso reactivado: ${m.email}`);
  };

  const issueCode = async (m: MemberRow) => {
    if (m.user_id || m.email === auth.email) {
      const ok = await confirm({
        title: 'Generar código de alta',
        message: `${m.email} ya tiene contraseña. Un código nuevo la restablece: su contraseña actual deja de funcionar hasta que cree otra con el código. ¿Continuar?`,
        confirmLabel: 'Generar código',
        danger: true,
      });
      if (!ok) return;
    }
    const { data, error } = await auth.client.rpc('au_generar_alta', { p_email: m.email });
    if (error) {
      return toast(
        error.code === 'PGRST202' ? 'Falta ejecutar 0003_acceso_consulta.sql en Supabase.' : error.code === '42501' ? 'Sólo Dirección o Administración generan códigos.' : 'No se pudo generar el código.',
        'error',
      );
    }
    setIssued({ email: m.email, code: String(data) });
    void refresh();
  };

  const copyCode = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      toast('Código copiado');
    } catch {
      toast('Selecciona el código y cópialo.', 'error');
    }
  };

  const people = [...db.people].filter((p) => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <Section
      title="Accesos (multiusuario)"
      id="cfg-access"
      actions={
        <button className="btn btn-ghost btn-sm" onClick={() => void refresh()} aria-label="Actualizar lista de accesos">
          <RefreshCw size={15} aria-hidden />
        </button>
      }
    >
      <p className="small muted">
        Sesión: <strong>{auth.email}</strong> · {ROLE_LABELS[auth.member.rol]}. Sólo los correos de esta lista pueden entrar; el rol define qué pueden modificar.
      </p>
      {!isAdmin ? (
        <p className="alert alert-blue">Los accesos los administra Dirección o Administración.</p>
      ) : (
        <>
          {issued && (
            <div className="alert alert-green" role="status" data-testid="issued-code">
              <p>
                Código de alta de <strong>{issued.email}</strong>: <code className="alta-code">{issued.code}</code>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => void copyCode()} aria-label="Copiar código">
                  <Copy size={14} aria-hidden />
                </button>
              </p>
              <p className="small">
                Entrégaselo en persona o por un canal privado; no se vuelve a mostrar. Vence en 30 días. La persona abre la herramienta → «Primera vez: crear mi contraseña» → correo, código y su
                contraseña.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => setIssued(null)}>
                Listo
              </button>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Persona del directorio</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Contraseña</th>
                </tr>
              </thead>
              <tbody>
                {members === null && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Cargando…
                    </td>
                  </tr>
                )}
                {members?.map((m) => (
                  <tr key={m.email} data-testid="member-row">
                    <td>
                      {m.nombre && <span className="block">{m.nombre}</span>}
                      <span className={m.nombre ? 'small muted' : undefined}>{m.email}</span> {m.email === auth.email && <span className="chip chip-brand">tú</span>}
                    </td>
                    <td>
                      <select className="input" aria-label={`Rol de ${m.email}`} value={m.rol} onChange={(e) => void save({ ...m, rol: e.target.value as Role }, 'Rol actualizado')}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="input" aria-label={`Persona de ${m.email}`} value={m.person_id ?? ''} onChange={(e) => void save({ ...m, person_id: e.target.value || null }, 'Vínculo actualizado')}>
                        <option value="">Automático (por correo)</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className={`btn btn-sm ${m.activo ? 'btn-ok' : 'btn-secondary'}`} onClick={() => void toggle(m)}>
                        {m.activo ? (
                          <>
                            <UserCheck size={14} aria-hidden /> Activo
                          </>
                        ) : (
                          'Suspendido'
                        )}
                      </button>
                    </td>
                    <td>
                      {pending.has(m.email) ? (
                        <span className="chip chip-yellow" data-testid="alta-pending">Código pendiente</span>
                      ) : m.user_id ? (
                        <span className="chip chip-green">Creada</span>
                      ) : null}{' '}
                      <button className="btn btn-ghost btn-sm" onClick={() => void issueCode(m)} aria-label={`Generar código de alta para ${m.email}`}>
                        <KeyRound size={14} aria-hidden /> Código
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="inline-form" onSubmit={add}>
            <input className="input" type="email" placeholder="correo@socasesores.com.mx" aria-label="Correo para dar acceso" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select className="input" aria-label="Rol del nuevo acceso" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <select className="input" aria-label="Persona del nuevo acceso" value={form.person_id} onChange={(e) => setForm({ ...form, person_id: e.target.value })}>
              <option value="">Vincular por correo</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit">
              <Plus size={16} aria-hidden /> Dar acceso
            </button>
          </form>
          <p className="small muted">
            Al dar acceso aparece el código de alta de la persona: con él crea su propia contraseña. «Código» genera uno nuevo (también sirve para restablecer una contraseña
            olvidada). Quien tenga rol «Consulta» ve toda la información pero no puede modificar nada.
          </p>
        </>
      )}
    </Section>
  );
}
