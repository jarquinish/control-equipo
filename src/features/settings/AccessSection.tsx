import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, RefreshCw, UserCheck } from 'lucide-react';
import { ROLE_LABELS, ROLES } from '../../domain/constants';
import type { Role } from '../../domain/types';
import type { AuthInfo, Member } from '../../state/auth';
import { useDb } from '../../state/app';
import { Section } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Configuración → Accesos: quién puede entrar al espacio compartido y con qué rol. */
export function AccessSection({ auth }: { auth: AuthInfo }) {
  const db = useDb();
  const { toast, confirm } = useFeedback();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [form, setForm] = useState({ email: '', rol: 'GERENTE' as Role, person_id: '' });
  const isAdmin = auth.member.rol === 'ADMIN' || auth.member.rol === 'DIRECTOR';

  const refresh = useCallback(async () => {
    const { data, error } = await auth.client.from('au_members').select('email,rol,person_id,activo').order('email');
    if (error) return toast('No se pudieron cargar los accesos.', 'error');
    setMembers((data ?? []) as Member[]);
  }, [auth.client, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (m: Partial<Member> & { email: string }, success: string) => {
    const { error } = await auth.client.from('au_members').upsert(m, { onConflict: 'email' });
    if (error) return toast(error.code === '42501' ? 'Sólo Dirección o Administración administran accesos.' : 'No se pudo guardar el acceso.', 'error');
    toast(success);
    void refresh();
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return toast('Escribe un correo válido.', 'error');
    await save({ email, rol: form.rol, person_id: form.person_id || null, activo: true }, `Acceso otorgado a ${email}`);
    setForm({ email: '', rol: 'GERENTE', person_id: '' });
  };

  const toggle = async (m: Member) => {
    if (m.email === auth.email && m.activo) {
      const ok = await confirm({ title: 'Quitar tu propio acceso', message: 'Perderás el acceso al guardar. ¿Continuar?', confirmLabel: 'Quitar acceso', danger: true });
      if (!ok) return;
    }
    await save({ ...m, activo: !m.activo }, m.activo ? `Acceso suspendido: ${m.email}` : `Acceso reactivado: ${m.email}`);
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
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Persona del directorio</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {members === null && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Cargando…
                    </td>
                  </tr>
                )}
                {members?.map((m) => (
                  <tr key={m.email} data-testid="member-row">
                    <td>
                      {m.email} {m.email === auth.email && <span className="chip chip-brand">tú</span>}
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
          <p className="small muted">La persona recibe acceso al iniciar sesión con ese correo (cuenta Microsoft o código por correo).</p>
        </>
      )}
    </Section>
  );
}
