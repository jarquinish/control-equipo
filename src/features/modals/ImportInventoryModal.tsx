import { AlertTriangle, Download, FileSpreadsheet, Info } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { readXlsx, XlsxError } from '../../data/xlsx';
import { IMPACT_LABELS, LEVELS } from '../../domain/constants';
import { toISODate } from '../../domain/dates';
import {
  buildPlan,
  defaultChoices,
  destinationOptions,
  isIncluded,
  parseInventory,
  type ImportOptions,
  type Inventory,
  type InventoryRow,
  type RowChoice,
} from '../../domain/inventory';
import { can } from '../../domain/permissions';
import { computePriority } from '../../domain/scoring';
import type { Level, UpdateOrigin } from '../../domain/types';
import { buildInventoryTemplate } from '../../services/importService';
import { useCurrentUser, useDb, useServices, useSettings } from '../../state/app';
import { PriorityBadge } from '../../ui/badges';
import { downloadFile } from '../../ui/common';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { Modal } from '../../ui/Modal';

type Filter = 'todas' | 'avisos' | 'incluidas' | 'excluidas';

/**
 * Importar el inventario de proyectos desde Excel: lee el archivo, muestra una
 * vista previa editable (qué se crea, avisos por fila) y lo carga en un lote.
 */
export function ImportInventoryModal({ areaId, origen = 'area', onClose }: { areaId?: string; origen?: UpdateOrigin; onClose: () => void }) {
  const db = useDb();
  const services = useServices();
  const settings = useSettings();
  const user = useCurrentUser();
  const { toast } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [inv, setInv] = useState<Inventory | null>(null);
  const [choices, setChoices] = useState<Record<string, RowChoice>>({});
  const [filter, setFilter] = useState<Filter>('todas');
  const today = toISODate(services.ctx.now());
  const [opts, setOpts] = useState<ImportOptions>({ includePending: false, defaultHora: '18:00', sheetAreas: {}, today });
  const area = db.areas.find((a) => a.id === areaId);
  const allowed = can(user, 'project.edit');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const wb = readXlsx(await file.arrayBuffer());
      const parsed = parseInventory(wb, db, today);
      if (!parsed.sheets.length) {
        setError('No encontré una tabla de proyectos. La hoja debe tener encabezados como «Proyecto / iniciativa / pendiente», «Impacto», «Urgencia» y «Dependencia». Descarga la plantilla para ver el formato.');
        return;
      }
      const sheetAreas: Record<string, string> = {};
      for (const s of parsed.sheets) sheetAreas[s.name] = areaId ? (s.areaId === areaId ? areaId : '') : s.areaId;
      if (areaId && !Object.values(sheetAreas).some(Boolean) && parsed.sheets.length === 1) sheetAreas[parsed.sheets[0].name] = areaId;
      setFileName(file.name);
      setInv(parsed);
      setChoices(defaultChoices(parsed, db));
      setOpts((o) => ({ ...o, sheetAreas }));
    } catch (err) {
      setError(err instanceof XlsxError ? err.message : `No se pudo leer el archivo: ${friendlyError(err)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const plan = useMemo(() => (inv ? buildPlan(inv, choices, opts, db) : null), [inv, choices, opts, db]);
  const pending = inv ? inv.sheets.flatMap((s) => s.rows).filter((r) => r.validacion === 'pendiente' && opts.sheetAreas[r.sheet]).length : 0;

  const setChoice = (key: string, patch: Partial<RowChoice>) => setChoices((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  const people = useMemo(() => {
    const names = new Set<string>(db.people.filter((p) => p.activo).map((p) => p.nombre));
    if (inv) {
      for (const n of Object.keys(inv.people)) names.add(n);
      for (const s of inv.sheets) for (const r of s.rows) for (const n of [...r.personas.owner, ...r.personas.accion, ...r.personas.solucion]) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [db.people, inv]);

  const doImport = () => {
    if (!plan) return;
    try {
      const r = services.imports.apply(plan, origen);
      toast(`Importado: ${r.proyectos} proyectos, ${r.compromisos} compromisos y ${r.bloqueos} bloqueos${r.personas ? ` · ${r.personas} personas nuevas` : ''}`);
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  const template = () => {
    downloadFile('Plantilla_Inventario_Alignment_Unblock.xlsx', buildInventoryTemplate(db.areas.filter((a) => a.activo).map((a) => a.nombre)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const visible = (row: InventoryRow) => {
    const inc = plan?.included[row.key];
    const warns = plan?.issues[row.key]?.some((i) => i.level === 'warn');
    if (filter === 'avisos') return inc && warns;
    if (filter === 'incluidas') return inc;
    if (filter === 'excluidas') return !inc;
    return true;
  };

  const s = plan?.stats;
  const toCreate = s ? s.proyectos + s.frentes : 0;
  const counts = plan
    ? {
        todas: Object.keys(plan.included).length,
        incluidas: Object.values(plan.included).filter(Boolean).length,
        avisos: Object.entries(plan.issues).filter(([k, l]) => plan.included[k] && l.some((i) => i.level === 'warn')).length,
      }
    : { todas: 0, incluidas: 0, avisos: 0 };

  return (
    <Modal
      title="Importar inventario desde Excel"
      subtitle={area ? `Proyectos de ${area.nombre}` : 'Una hoja por área: Contenido, Diseño, Marketing Digital, SOC Store'}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          {plan && (
            <button type="button" className="btn btn-primary" onClick={doImport} disabled={!plan.projects.length} data-testid="import-confirm">
              Importar {toCreate} proyectos · {s!.compromisos} compromisos
            </button>
          )}
        </>
      }
    >
      {!allowed ? (
        <p className="alert alert-yellow">Tu rol no permite crear proyectos. Pide a un gerente o a Dirección que haga la importación.</p>
      ) : (
        <div className="import" data-testid="import-modal">
          <div className="import-file row gap wrap">
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} data-testid="import-pick">
              <FileSpreadsheet size={18} aria-hidden /> {inv ? 'Cambiar archivo' : 'Elegir archivo Excel (.xlsx)'}
            </button>
            {fileName && <strong className="small">{fileName}</strong>}
            <button type="button" className="btn btn-secondary" onClick={template} data-testid="import-template">
              <Download size={18} aria-hidden /> Descargar plantilla
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file" />
          </div>
          {error && (
            <p className="alert alert-red" role="alert" data-testid="import-error">
              <AlertTriangle size={18} aria-hidden /> {error}
            </p>
          )}
          {!inv && !error && (
            <ul className="import-help small muted">
              <li>Se lee cada hoja cuyo nombre coincide con un área; las demás (p. ej. un resumen) se ignoran.</li>
              <li>Antes de guardar verás qué se crea y los avisos de cada fila, y podrás corregir tipo, responsable, impacto y fecha.</li>
              <li>Sólo se importan las filas validadas por la gerencia (puedes incluir las pendientes).</li>
            </ul>
          )}

          {inv && plan && s && (
            <>
              <fieldset className="import-options card">
                <legend className="sr-only">Opciones de importación</legend>
                {inv.sheets.map((sh) => (
                  <label key={sh.name} className="import-opt">
                    <span className="field-label">Hoja «{sh.name}» ({sh.rows.length} filas) →</span>
                    <select
                      className="input"
                      value={opts.sheetAreas[sh.name] ?? ''}
                      onChange={(e) => setOpts({ ...opts, sheetAreas: { ...opts.sheetAreas, [sh.name]: e.target.value } })}
                      aria-label={`Área de la hoja ${sh.name}`}
                    >
                      <option value="">No importar</option>
                      {db.areas
                        .filter((a) => a.activo && (!areaId || a.id === areaId))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                <label className="import-opt check">
                  <input type="checkbox" checked={opts.includePending} onChange={(e) => setOpts({ ...opts, includePending: e.target.checked })} data-testid="import-pending" />
                  <span>
                    Incluir filas <strong>pendientes de validación</strong> ({pending})
                  </span>
                </label>
                <label className="import-opt">
                  <span className="field-label">Hora para compromisos sin hora</span>
                  <input type="time" className="input" value={opts.defaultHora} onChange={(e) => setOpts({ ...opts, defaultHora: e.target.value })} aria-label="Hora para compromisos sin hora" />
                </label>
                {inv.ignored.length > 0 && <p className="small muted import-ignored">Hojas sin tabla de proyectos (se ignoran): {inv.ignored.join(', ')}.</p>}
              </fieldset>

              <div className="import-kpis" data-testid="import-stats">
                {[
                  ['Proyectos nuevos', s.proyectos],
                  ['Frentes (agrupan actividades)', s.frentes],
                  ['Actividades agrupadas', s.actividades],
                  ['Compromisos', s.compromisos],
                  ['Bloqueos', s.bloqueos],
                  ['Personas nuevas', s.personas],
                  ['Avisos', s.avisos],
                ].map(([l, v]) => (
                  <div key={l} className={`import-kpi ${l === 'Avisos' && Number(v) > 0 ? 'warn' : ''}`}>
                    <strong>{v}</strong>
                    <span className="small">{l}</span>
                  </div>
                ))}
              </div>

              {db.areas.map((a) => {
                const st = s.porArea[a.id];
                if (!st?.nuevos) return null;
                const total = st.nuevos + st.activos;
                return total > settings.criteria.maxProyectosPorArea ? (
                  <p key={a.id} className="alert alert-yellow">
                    <AlertTriangle size={18} aria-hidden /> {a.nombre} quedaría con {total} proyectos (recomendado ≤ {settings.criteria.maxProyectosPorArea}). Agrupa actividades o descarta lo que no necesita foco.
                  </p>
                ) : null;
              })}
              {s.p1 > settings.criteria.maxP1 && (
                <p className="alert alert-yellow">
                  <AlertTriangle size={18} aria-hidden /> Quedarían {s.p1} P1 (recomendado ≤ {settings.criteria.maxP1}). No todo puede ser P1: ajústalo en el Paso 4 · Priorizar.
                </p>
              )}
              {s.personas > 0 && (
                <p className="small muted">
                  Personas que se darán de alta: {plan.newPeople.map((p) => p.nombre).join(', ')}.
                </p>
              )}

              <div className="row gap wrap import-filter" role="group" aria-label="Filtrar filas">
                {(
                  [
                    ['todas', `Todas (${counts.todas})`],
                    ['avisos', `Con avisos (${counts.avisos})`],
                    ['incluidas', `Se importan (${counts.incluidas})`],
                    ['excluidas', `No se importan (${counts.todas - counts.incluidas})`],
                  ] as [Filter, string][]
                ).map(([f, label]) => (
                  <button key={f} type="button" className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {label}
                  </button>
                ))}
              </div>

              {inv.sheets.map((sh) => {
                const shArea = opts.sheetAreas[sh.name] ?? '';
                const rows = sh.rows.filter(visible);
                if (!rows.length) return null;
                return (
                  <section key={sh.name} className="import-sheet">
                    <h3>
                      {sh.name} <span className="count-pill">{rows.length}</span>
                    </h3>
                    <div className="table-wrap card">
                      <table className="table import-table">
                        <thead>
                          <tr>
                            <th scope="col">ID</th>
                            <th scope="col">Registro</th>
                            <th scope="col">Importar como</th>
                            <th scope="col">Responsable</th>
                            <th scope="col">Impacto</th>
                            <th scope="col">Compromiso</th>
                            <th scope="col">Avisos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const c = choices[row.key];
                            const inc = plan.included[row.key];
                            const pr = computePriority({ impacto: c.impacto, urgencia: row.urgencia, dependencia: row.dependencia });
                            const list = plan.issues[row.key] ?? [];
                            const dis = !shArea || !isIncluded(row, opts);
                            return (
                              <tr key={row.key} className={inc ? '' : 'import-off'} data-testid="import-row" data-ref={row.ref}>
                                <td className="small">{row.ref}</td>
                                <td>
                                  <strong>{row.nombre}</strong>
                                  <span className="small muted block">
                                    {row.raw.tipo ?? 'Proyecto'} · {row.raw.estado ? `${row.raw.estado} → ` : ''}
                                    {settings.statusLabels[row.estado]}
                                    {row.bloqueado && ' · bloqueado'}
                                  </span>
                                  <span className="row gap import-prio">
                                    <PriorityBadge p={row.prioridadValidada ?? pr.prioridadCalculada} override={!!row.prioridadValidada && row.prioridadValidada !== pr.prioridadCalculada} />
                                    <span className="small muted">
                                      {c.impacto}+{row.urgencia}+{row.dependencia} = {pr.score}
                                    </span>
                                  </span>
                                </td>
                                <td>
                                  <select className="input input-sm" value={c.destino} disabled={dis} onChange={(e) => setChoice(row.key, { destino: e.target.value })} aria-label={`Importar ${row.ref} como`}>
                                    {destinationOptions(sh, row, db, shArea, choices).map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <select className="input input-sm" value={c.responsable} disabled={dis} onChange={(e) => setChoice(row.key, { responsable: e.target.value })} aria-label={`Responsable de ${row.ref}`}>
                                    <option value="">Sin responsable</option>
                                    {people.map((n) => (
                                      <option key={n} value={n}>
                                        {n}
                                      </option>
                                    ))}
                                  </select>
                                  {row.raw.owner && <span className="small muted block">Archivo: {row.raw.owner}</span>}
                                </td>
                                <td>
                                  <select
                                    className="input input-sm"
                                    value={c.impacto}
                                    disabled={dis}
                                    onChange={(e) => setChoice(row.key, { impacto: Number(e.target.value) as Level, impactoOk: true })}
                                    aria-label={`Impacto de ${row.ref}`}
                                  >
                                    {LEVELS.map((l) => (
                                      <option key={l} value={l}>
                                        {l} · {IMPACT_LABELS[l]}
                                      </option>
                                    ))}
                                  </select>
                                  {row.raw.impacto && <span className="small muted block">Archivo: {row.raw.impacto}</span>}
                                </td>
                                <td>
                                  {row.raw.accion ? (
                                    <>
                                      <span className="small block import-action">{row.raw.accion}</span>
                                      <span className="row gap import-when">
                                        <input type="date" className="input input-sm" value={c.fecha} disabled={dis} onChange={(e) => setChoice(row.key, { fecha: e.target.value })} aria-label={`Fecha del compromiso de ${row.ref}`} />
                                        <input type="time" className="input input-sm" value={c.hora} placeholder={opts.defaultHora} disabled={dis} onChange={(e) => setChoice(row.key, { hora: e.target.value })} aria-label={`Hora del compromiso de ${row.ref}`} />
                                      </span>
                                      {!c.hora && c.fecha && opts.defaultHora && <span className="small muted block">Sin hora en el archivo → {opts.defaultHora}</span>}
                                    </>
                                  ) : (
                                    <span className="small muted">Sin siguiente acción</span>
                                  )}
                                </td>
                                <td>
                                  {list.length ? (
                                    <ul className="import-issues">
                                      {list.map((i, n) => (
                                        <li key={n} className={i.level}>
                                          {i.level === 'warn' ? <AlertTriangle size={14} aria-hidden /> : <Info size={14} aria-hidden />} {i.msg}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="small ok">✓ Listo</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
