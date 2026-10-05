import { useRef, useState } from 'react';
import { Database, Download, FlaskConical, Plus, RotateCcw, Trash2, Upload, X, CalendarPlus, ShieldCheck } from 'lucide-react';
import { PERMISSION_MATRIX, type Action } from '../../domain/permissions';
import { PROJECT_STATUSES, ROLE_LABELS, ROLES } from '../../domain/constants';
import { fmtDate, fmtDateTime, fmtShort } from '../../domain/dates';
import type { Criteria, Role } from '../../domain/types';
import { COLLECTION_LABELS, type BackupFile, type ParseResult } from '../../services/backupService';
import { blocksCsv, commitmentsCsv, projectsCsv } from '../../services/exportService';
import { useActiveWeek, useApp, useCurrentUser, useDb, useServices, useSettings } from '../../state/app';
import { downloadFile, PageHeader, Section } from '../../ui/common';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { Modal } from '../../ui/Modal';
import { can } from '../../domain/permissions';
import { bootstrapEmpty } from '../../services';

const ACTION_LABELS: Record<Action, string> = {
  'project.edit': 'Editar proyectos',
  'project.override': 'Ajustar prioridad',
  'weekly.run': 'Conducir Weekly',
  'weekly.close': 'Cerrar Weekly',
  'week.open': 'Abrir semana',
  'commitment.manage': 'Gestionar compromisos',
  'config.manage': 'Configuración',
  'data.restore': 'Restaurar datos',
};

export function SettingsPage() {
  const db = useDb();
  const settings = useSettings();
  const user = useCurrentUser();
  const services = useServices();
  const active = useActiveWeek();
  const { workspace, storageKind, switchWorkspace, resetDemo, now, store, setViewWeekId } = useApp();
  const { run, toast, confirm, runAsync } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ mode: 'restore' | 'import'; result: ParseResult; name: string } | null>(null);
  const [newArea, setNewArea] = useState('');
  const [newPerson, setNewPerson] = useState({ nombre: '', rol: 'COLABORADOR' as Role, areaId: '' });
  const [newDep, setNewDep] = useState('');
  const allowed = can(user, 'config.manage');

  const backup = () => {
    const file = services.backup.exportBackup(workspace);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadFile(`alignment-unblock-respaldo-${stamp}.json`, JSON.stringify(file, null, 2), 'application/json');
    toast('Respaldo generado');
  };

  const pick = (mode: 'restore' | 'import') => {
    if (!fileRef.current) return;
    fileRef.current.dataset.mode = mode;
    fileRef.current.value = '';
    fileRef.current.click();
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const mode = (fileRef.current?.dataset.mode as 'restore' | 'import') ?? 'restore';
    try {
      const text = await f.text();
      setPending({ mode, result: services.backup.parse(text), name: f.name });
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  const applyPending = async (file: BackupFile) => {
    if (!pending) return;
    if (pending.mode === 'restore') {
      await runAsync(() => services.backup.restore(file), 'Respaldo restaurado');
      setViewWeekId(undefined);
    } else {
      run(() => services.backup.importMerge(file), 'Información importada');
      await store.flush();
    }
    setPending(null);
  };

  const setCriteria = (k: keyof Criteria, v: string) => run(() => services.settings.setCriteria({ [k]: Number(v) }));

  const openNext = async () => {
    const next = services.weeks.nextWeekPreview();
    const ok = await confirm({
      title: `Abrir Semana ${next.numero}`,
      message: active?.estado === 'abierta' ? `La Semana ${active.numero} sigue abierta: se cerrará y se guardará su fotografía. Lo recomendable es cerrarla desde la Weekly.` : `Se abrirá la Semana ${next.numero} (${fmtShort(next.fechaInicio)} — ${fmtDate(next.fechaFin)}).`,
      confirmLabel: `Abrir Semana ${next.numero}`,
      danger: active?.estado === 'abierta',
    });
    if (ok) {
      run(() => services.weeks.openNextWeek(), `Semana ${next.numero} abierta`);
      setViewWeekId(undefined);
    }
  };

  const wipe = async () => {
    const ok = await confirm({
      title: workspace === 'demo' ? 'Vaciar espacio demo' : 'Borrar toda la información',
      message: 'Se eliminará toda la información de este espacio en este navegador. Genera un respaldo antes. Esta acción no se puede deshacer.',
      confirmLabel: 'Borrar todo',
      danger: true,
    });
    if (!ok) return;
    await runAsync(async () => {
      await store.clear();
      bootstrapEmpty(services);
    }, 'Información borrada');
    setViewWeekId(undefined);
  };

  return (
    <div className="page settings">
      <PageHeader title="Configuración" subtitle="Áreas, responsables, estados, semana activa, criterios y datos." />
      {!allowed && <p className="alert alert-yellow">Tu rol ({user ? ROLE_LABELS[user.rol] : '—'}) no administra la configuración. Puedes consultarla, pero los cambios los realiza Dirección o Administración.</p>}

      <fieldset disabled={!allowed} className="settings-fieldset">
        <Section title="Semana activa" id="cfg-week">
          <p>
            <strong>Semana {active?.numero}</strong> · {active && `${fmtShort(active.fechaInicio)} — ${fmtDate(active.fechaFin)}`} · {active?.estado === 'abierta' ? 'abierta' : 'cerrada'}
          </p>
          <button className="btn btn-secondary" onClick={openNext}>
            <CalendarPlus size={16} aria-hidden /> Abrir semana siguiente
          </button>
          <p className="small muted">Abrir una semana nunca sobrescribe la anterior: se conserva su fotografía histórica.</p>
        </Section>

        <Section title="Áreas" id="cfg-areas">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Área</th>
                  <th scope="col">Responsable</th>
                  <th scope="col">Color</th>
                  <th scope="col">Activa</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {[...db.areas].sort((a, b) => a.orden - b.orden).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input className="input" aria-label="Nombre del área" defaultValue={a.nombre} onBlur={(e) => e.target.value !== a.nombre && run(() => services.areas.update(a.id, { nombre: e.target.value }), 'Área actualizada')} />
                    </td>
                    <td>
                      <select className="input" aria-label={`Responsable de ${a.nombre}`} value={a.responsable ?? ''} onChange={(e) => run(() => services.areas.update(a.id, { responsable: e.target.value || undefined }), 'Responsable actualizado')}>
                        <option value="">Sin asignar</option>
                        {db.people.filter((p) => p.activo).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="color" aria-label={`Color de ${a.nombre}`} value={a.color} onChange={(e) => services.areas.update(a.id, { color: e.target.value })} />
                    </td>
                    <td>
                      <input type="checkbox" aria-label={`${a.nombre} activa`} checked={a.activo} onChange={(e) => run(() => services.areas.update(a.id, { activo: e.target.checked }))} />
                    </td>
                    <td>
                      <button className="icon-btn" aria-label={`Eliminar ${a.nombre}`} onClick={() => run(() => services.areas.remove(a.id), 'Área eliminada')}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (run(() => services.areas.create({ nombre: newArea }), 'Área creada')) setNewArea('');
            }}
          >
            <input className="input" placeholder="Nueva área (p. ej. Eventos)" aria-label="Nueva área" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
            <button className="btn btn-secondary" type="submit">
              <Plus size={16} aria-hidden /> Agregar área
            </button>
          </form>
        </Section>

        <Section title="Responsables" id="cfg-people">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Área</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Activo</th>
                </tr>
              </thead>
              <tbody>
                {[...db.people].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input className="input" aria-label="Nombre" defaultValue={p.nombre} onBlur={(e) => e.target.value !== p.nombre && run(() => services.people.update(p.id, { nombre: e.target.value }), 'Persona actualizada')} />
                    </td>
                    <td>
                      <select className="input" aria-label={`Rol de ${p.nombre}`} value={p.rol} onChange={(e) => run(() => services.people.update(p.id, { rol: e.target.value as Role }))}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="input" aria-label={`Área de ${p.nombre}`} value={p.areaId ?? ''} onChange={(e) => run(() => services.people.update(p.id, { areaId: e.target.value || undefined }))}>
                        <option value="">—</option>
                        {db.areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" type="email" aria-label={`Correo de ${p.nombre}`} defaultValue={p.email ?? ''} placeholder="(futuro: notificaciones)" onBlur={(e) => e.target.value !== (p.email ?? '') && run(() => services.people.update(p.id, { email: e.target.value }))} />
                    </td>
                    <td>
                      <input type="checkbox" aria-label={`${p.nombre} activo`} checked={p.activo} onChange={(e) => run(() => services.people.setActive(p.id, e.target.checked))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (run(() => services.people.create({ ...newPerson, areaId: newPerson.areaId || undefined }), 'Persona agregada')) setNewPerson({ nombre: '', rol: 'COLABORADOR', areaId: '' });
            }}
          >
            <input className="input" placeholder="Nombre y apellido" aria-label="Nombre de la persona" value={newPerson.nombre} onChange={(e) => setNewPerson({ ...newPerson, nombre: e.target.value })} />
            <select className="input" aria-label="Rol" value={newPerson.rol} onChange={(e) => setNewPerson({ ...newPerson, rol: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <select className="input" aria-label="Área" value={newPerson.areaId} onChange={(e) => setNewPerson({ ...newPerson, areaId: e.target.value })}>
              <option value="">Área…</option>
              {db.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary" type="submit">
              <Plus size={16} aria-hidden /> Agregar
            </button>
          </form>
        </Section>

        <div className="two-col">
          <Section title="Áreas externas / dependencias" id="cfg-deps">
            <ul className="tag-list">
              {settings.externalDependencies.map((d) => (
                <li key={d} className="tag">
                  {d}
                  <button type="button" aria-label={`Quitar ${d}`} onClick={() => services.settings.removeExternalDependency(d)}>
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (run(() => services.settings.addExternalDependency(newDep))) setNewDep('');
              }}
            >
              <input className="input" placeholder="Ej. Recursos Humanos" aria-label="Nueva dependencia externa" value={newDep} onChange={(e) => setNewDep(e.target.value)} />
              <button className="btn btn-secondary" type="submit">
                Agregar dependencia
              </button>
            </form>
          </Section>

          <Section title="Estados de proyecto" id="cfg-status">
            <div className="status-labels">
              {PROJECT_STATUSES.map((s) => (
                <label key={s}>
                  <span className="small muted">{s}</span>
                  <input className="input" defaultValue={settings.statusLabels[s]} onBlur={(e) => e.target.value !== settings.statusLabels[s] && run(() => services.settings.setStatusLabel(s, e.target.value), 'Estado actualizado')} />
                </label>
              ))}
            </div>
          </Section>
        </div>

        <Section title="Criterios" id="cfg-criteria">
          <div className="criteria-grid">
            {(
              [
                ['maxProyectosPorArea', 'Proyectos relevantes por área (Visibilizar)'],
                ['maxP1', 'Máximo recomendado de P1'],
                ['horasVencePronto', 'Horas para «vence pronto»'],
                ['umbralReprogramaciones', 'Alertar a partir de N reprogramaciones'],
                ['semanasProyectoLargo', 'Semanas para «proyecto abierto demasiado tiempo»'],
              ] as [keyof Criteria, string][]
            ).map(([k, label]) => (
              <label key={k}>
                <span className="field-label">{label}</span>
                <input className="input" type="number" min={1} defaultValue={settings.criteria[k]} onBlur={(e) => Number(e.target.value) !== settings.criteria[k] && setCriteria(k, e.target.value)} />
              </label>
            ))}
            <label>
              <span className="field-label">Nombre de la organización</span>
              <input className="input" defaultValue={settings.orgName} onBlur={(e) => e.target.value !== settings.orgName && run(() => services.settings.update({ orgName: e.target.value }), 'Guardado')} />
            </label>
          </div>
          <p className="small muted">Ponderación fija: Score = Impacto + Urgencia + Dependencia (1–3 c/u). 8–9 → P1 · 6–7 → P2 · 3–5 → P3.</p>
        </Section>
      </fieldset>

      <Section title="Datos, exportación y respaldo" id="cfg-data">
        <div className="data-actions">
          <div>
            <h3>Respaldo completo</h3>
            <div className="row gap wrap">
              <button className="btn btn-primary" onClick={backup}>
                <Download size={16} aria-hidden /> Generar respaldo
              </button>
              <button className="btn btn-secondary" onClick={() => pick('restore')} disabled={!can(user, 'data.restore')}>
                <RotateCcw size={16} aria-hidden /> Restaurar respaldo
              </button>
            </div>
          </div>
          <div>
            <h3>JSON</h3>
            <div className="row gap wrap">
              <button className="btn btn-secondary" onClick={backup}>
                <Download size={16} aria-hidden /> Exportar JSON
              </button>
              <button className="btn btn-secondary" onClick={() => pick('import')} disabled={!can(user, 'data.restore')}>
                <Upload size={16} aria-hidden /> Importar JSON
              </button>
            </div>
            <p className="small muted">Importar combina registros (agrega y actualiza por id). Restaurar reemplaza todo.</p>
          </div>
          <div>
            <h3>CSV (Excel)</h3>
            <div className="row gap wrap">
              <button className="btn btn-secondary" onClick={() => downloadFile('proyectos.csv', projectsCsv(db), 'text/csv;charset=utf-8')}>
                Proyectos CSV
              </button>
              <button className="btn btn-secondary" onClick={() => downloadFile('compromisos.csv', commitmentsCsv(db, now), 'text/csv;charset=utf-8')}>
                Compromisos CSV
              </button>
              <button className="btn btn-secondary" onClick={() => downloadFile('bloqueos.csv', blocksCsv(db), 'text/csv;charset=utf-8')}>
                Bloqueos CSV
              </button>
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="file-input" />
      </Section>

      <div className="two-col">
        <Section title="Demo guiada" id="cfg-demo">
          <p className="small muted">La demo vive en un espacio separado: probarla no afecta tu información real.</p>
          <div className="row gap wrap">
            {workspace === 'demo' ? (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={async () => {
                    if (await confirm({ title: 'Reiniciar demo', message: 'Se borrarán los cambios hechos en la demo y se cargarán los datos de ejemplo de nuevo.', confirmLabel: 'Reiniciar demo', danger: true })) {
                      await resetDemo();
                      toast('Demo reiniciada');
                    }
                  }}
                >
                  <RotateCcw size={16} aria-hidden /> Reiniciar demo
                </button>
                <button className="btn btn-primary" onClick={() => switchWorkspace('principal')}>
                  Volver a mi espacio
                </button>
              </>
            ) : (
              <button className="btn btn-secondary" onClick={() => switchWorkspace('demo')} data-testid="load-demo">
                <FlaskConical size={16} aria-hidden /> Cargar datos demo
              </button>
            )}
          </div>
        </Section>
        <Section title="Almacenamiento" id="cfg-storage">
          <p className="small">
            <Database size={14} aria-hidden /> Espacio: <strong>{workspace === 'demo' ? 'Demo' : 'Principal'}</strong> · motor: <strong>{storageKind}</strong> · {db.projects.length} proyectos · {db.commitments.length} compromisos · {db.weeks.length} semanas
          </p>
          <p className="small muted">La información se guarda en este navegador. Genera respaldos periódicos; para trabajo multiusuario, ver README → Backend.</p>
          <button className="btn btn-ghost-danger" onClick={wipe} disabled={!allowed}>
            <Trash2 size={16} aria-hidden /> Borrar toda la información de este espacio
          </button>
        </Section>
      </div>

      <Section title="Roles y permisos (preparado para multiusuario)" id="cfg-roles">
        <div className="table-wrap">
          <table className="table perm-table">
            <thead>
              <tr>
                <th scope="col">Acción</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(ACTION_LABELS) as Action[]).map((a) => (
                <tr key={a}>
                  <td>{ACTION_LABELS[a]}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="center">
                      {PERMISSION_MATRIX[r].includes(a) ? <ShieldCheck size={16} className="ok" aria-label="permitido" /> : <span aria-label="no permitido">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">En V1 el usuario se elige en la barra superior (sin contraseña). Con backend, la autenticación (p. ej. Microsoft Entra ID) aplicará esta misma matriz.</p>
      </Section>

      {pending && <ImportDialog pending={pending} onCancel={() => setPending(null)} onApply={applyPending} onBackup={backup} />}
    </div>
  );
}

function ImportDialog({
  pending,
  onCancel,
  onApply,
  onBackup,
}: {
  pending: { mode: 'restore' | 'import'; result: ParseResult; name: string };
  onCancel: () => void;
  onApply: (f: BackupFile) => void;
  onBackup: () => void;
}) {
  const { result, mode, name } = pending;
  if (!result.ok) {
    return (
      <Modal title="Archivo no válido" subtitle={name} onClose={onCancel} footer={<button className="btn btn-primary" onClick={onCancel}>Entendido</button>}>
        <p>No se modificó ninguna información. Problemas encontrados:</p>
        <ul className="error-list" data-testid="import-errors">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </Modal>
    );
  }
  return (
    <Modal
      title={mode === 'restore' ? 'Restaurar respaldo' : 'Importar JSON'}
      subtitle={`${name}${result.file.exportedAt ? ` · generado ${fmtDateTime(result.file.exportedAt)}` : ''}`}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn-secondary" onClick={onBackup}>
            Respaldar lo actual primero
          </button>
          <button className={`btn ${mode === 'restore' ? 'btn-danger' : 'btn-primary'}`} onClick={() => onApply(result.file)} data-testid="confirm-import">
            {mode === 'restore' ? 'Reemplazar todo con este respaldo' : 'Importar y combinar'}
          </button>
        </>
      }
    >
      <p className="alert alert-green">✓ Archivo válido.</p>
      {mode === 'restore' && <p><strong>La información actual de este espacio será reemplazada.</strong></p>}
      <ul className="counts">
        {Object.entries(result.counts)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => (
            <li key={k}>
              <strong>{n}</strong> {COLLECTION_LABELS[k as keyof typeof COLLECTION_LABELS]}
            </li>
          ))}
      </ul>
      {result.warnings.length > 0 && (
        <details>
          <summary className="small">{result.warnings.length} avisos</summary>
          <ul className="small">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}
