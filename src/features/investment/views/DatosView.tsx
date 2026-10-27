import { useState, type ChangeEvent } from 'react';
import { Download, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { readXlsx } from '../../../data/xlsx';
import { parseContable } from '../../../domain/investment/contable';
import { KPI_GRUPOS, KPI_TIPOS, periodLabel } from '../../../domain/investment/kpis';
import { DEFAULT_INVESTMENT_PRIORITY, PESO_LABELS, priorityConfigErrors } from '../../../domain/investment/priorityIndex';
import { normText as normName } from '../../../domain/investment/contable';
import type { BudgetLine, ID, InvestmentPriorityConfig, Kpi, StrategicObjective } from '../../../domain/types';
import { useApp, useDb, useServices } from '../../../state/app';
import { Chip } from '../../../ui/badges';
import { downloadFile, Section } from '../../../ui/common';
import { useFeedback } from '../../../ui/feedback';
import { parsePackage, type ImportPlanStep, type InvestmentPackage, type SpendPlan } from '../../../services/investmentService';
import { COLLECTION_LABELS } from '../../../services/backupService';
import { money, RecordModal, toCsv, toNum, toStr, useAreaName, VALIDACION_OPTIONS, ValidChip, type InvestmentData } from '../shared';

type Dialog = { kind: 'kpi'; item?: Kpi } | { kind: 'objetivo'; item?: StrategicObjective } | { kind: 'partida'; item?: BudgetLine } | null;

export function DatosView({ data }: { data: InvestmentData }) {
  const { db } = data;
  const services = useServices();
  const director = services.investment.canManageFinance();
  const areaName = useAreaName();
  const [dialog, setDialog] = useState<Dialog>(null);

  if (!director)
    return (
      <p className="alert alert-blue">
        Los datos financieros, el catálogo de KPIs y las metas los administra Dirección. Las gerencias pueden registrar resultados (quedan «pendientes de validación») y vincular sus proyectos con KPIs
        desde el detalle de cada proyecto.
      </p>
    );

  return (
    <div className="stack">
      <PackageImport />
      <ContableImport />

      <Section
        title={`Catálogo de KPIs · ${db.kpis.length}`}
        actions={
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'objetivo' })}>
              <Plus size={14} aria-hidden /> Objetivo
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: 'kpi' })}>
              <Plus size={14} aria-hidden /> KPI
            </button>
          </>
        }
      >
        <p className="small muted">Objetivos: {db.objectives.map((o) => `${o.clave} ${o.nombre}`).join(' · ') || 'sin objetivos'}</p>
        <div className="table-wrap">
          <table className="table table-compact table-hover">
            <thead>
              <tr>
                <th scope="col">Clave</th>
                <th scope="col">KPI</th>
                <th scope="col">Grupo · tipo</th>
                <th scope="col">Gerencias</th>
                <th scope="col">Unidad · sentido</th>
                <th scope="col">Fuente</th>
                <th scope="col">Estado</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {[...db.kpis]
                .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.clave.localeCompare(b.clave))
                .map((k) => (
                  <tr key={k.id}>
                    <td>{k.clave}</td>
                    <td>
                      {k.nombre}
                      {!k.activo && <Chip>Inactivo</Chip>}
                    </td>
                    <td className="small">
                      {k.grupo} · {KPI_TIPOS[k.tipo]}
                    </td>
                    <td className="small">{k.areaIds.map(areaName).join(', ') || '—'}</td>
                    <td className="small">
                      {k.unidad} · {k.sentido}
                    </td>
                    <td className="small inv-clip">{k.fuente}</td>
                    <td>
                      <ValidChip estado={k.estado} />
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'kpi', item: k })}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Partidas presupuestales"
        actions={
          <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'partida' })}>
            <Plus size={14} aria-hidden /> Partida
          </button>
        }
      >
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th scope="col">Partida</th>
                <th scope="col" className="num">
                  Autorizado inicial
                </th>
                <th scope="col">Categorías contables</th>
                <th scope="col">Gerencia</th>
                <th scope="col">Trazabilidad</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {db.budgetLines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.clave} · {l.nombre}
                    {l.discrepancia && <span className="small warn-text block">⚠ {l.discrepancia}</span>}
                  </td>
                  <td className="num">{money(l.original)}</td>
                  <td className="small">{l.categoriasContables.join(', ') || '—'}</td>
                  <td className="small">{l.areaId ? areaName(l.areaId) : '—'}</td>
                  <td className="small">
                    {l.fuente} <ValidChip estado={l.estado} />
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'partida', item: l })}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          El presupuesto vigente se calcula con los movimientos autorizados (Control presupuestal). Para resolver una discrepancia, edita la partida y borra el texto de discrepancia.
        </p>
      </Section>

      <PriorityConfig />
      <LinkMatrix data={data} />

      {dialog?.kind === 'kpi' && (
        <RecordModal
          title={dialog.item ? `KPI ${dialog.item.clave}` : 'Nuevo KPI'}
          collection="kpis"
          fields={[
            { key: 'clave', label: 'Clave', type: 'text', required: true },
            { key: 'nombre', label: 'Nombre', type: 'text', required: true },
            {
              key: 'definicion',
              label: 'Definición',
              type: 'textarea',
              required: true,
            },
            {
              key: 'grupo',
              label: 'Grupo',
              type: 'select',
              options: Object.entries(KPI_GRUPOS).map(([value, label]) => ({
                value,
                label: `${value} · ${label}`,
              })),
            },
            {
              key: 'tipo',
              label: 'Tipo de indicador',
              type: 'select',
              options: Object.entries(KPI_TIPOS).map(([value, label]) => ({
                value,
                label,
              })),
            },
            {
              key: 'objetivoId',
              label: 'Objetivo estratégico',
              type: 'select',
              options: db.objectives.map((o) => ({
                value: o.id,
                label: `${o.clave} · ${o.nombre}`,
              })),
              optional: true,
            },
            {
              key: 'areaIds',
              label: 'Gerencias responsables',
              type: 'multiselect',
              options: db.areas.map((a) => ({ value: a.id, label: a.nombre })),
            },
            {
              key: 'unidad',
              label: 'Unidad de medida',
              type: 'text',
              required: true,
            },
            {
              key: 'sentido',
              label: 'Sentido',
              type: 'select',
              options: [
                { value: 'mayor', label: 'Mayor es mejor' },
                { value: 'menor', label: 'Menor es mejor' },
                { value: 'rango', label: 'Rango objetivo' },
              ],
            },
            {
              key: 'rangoMin',
              label: 'Rango: mínimo',
              type: 'number',
              optional: true,
            },
            {
              key: 'rangoMax',
              label: 'Rango: máximo',
              type: 'number',
              optional: true,
            },
            {
              key: 'agregacion',
              label: 'Cómo se acumulan periodos',
              type: 'select',
              options: [
                { value: 'suma', label: 'Se suman (conteos, montos)' },
                { value: 'ultimo', label: 'Último valor (tasas, saldos)' },
              ],
            },
            {
              key: 'fuente',
              label: 'Fuente',
              type: 'text',
              required: true,
              full: true,
            },
            {
              key: 'estado',
              label: 'Estado',
              type: 'select',
              options: VALIDACION_OPTIONS,
            },
            {
              key: 'activo',
              label: 'Activo',
              type: 'checkbox',
              hint: 'Activo',
            },
          ]}
          initial={{
            grupo: 'A',
            tipo: 'desempeno',
            sentido: 'mayor',
            agregacion: 'suma',
            estado: 'PROPUESTA',
            activo: true,
            areaIds: [],
            ...dialog.item,
          }}
          toInput={(v) => ({
            ...dialog.item,
            ...v,
            objetivoId: toStr(v.objetivoId),
            rangoMin: toNum(v.rangoMin) ?? undefined,
            rangoMax: toNum(v.rangoMax) ?? undefined,
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'objetivo' && (
        <RecordModal
          title="Objetivo estratégico"
          collection="objectives"
          fields={[
            { key: 'clave', label: 'Clave', type: 'text', required: true },
            { key: 'nombre', label: 'Objetivo', type: 'text', required: true },
            {
              key: 'descripcion',
              label: 'Descripción',
              type: 'textarea',
              optional: true,
            },
            {
              key: 'estado',
              label: 'Estado',
              type: 'select',
              options: VALIDACION_OPTIONS,
            },
          ]}
          initial={{ estado: 'PROPUESTA', ...dialog.item }}
          toInput={(v) => ({
            ...dialog.item,
            ...v,
            orden: dialog.item?.orden ?? db.objectives.length + 1,
            descripcion: toStr(v.descripcion),
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'partida' && (
        <RecordModal
          title={dialog.item ? `Partida ${dialog.item.clave}` : 'Nueva partida'}
          collection="budgetLines"
          note={dialog.item ? 'Cambiar el autorizado inicial altera la base del presupuesto: registra ampliaciones, reducciones o transferencias como movimientos.' : undefined}
          fields={[
            { key: 'clave', label: 'Clave', type: 'text', required: true },
            { key: 'nombre', label: 'Nombre', type: 'text', required: true },
            {
              key: 'original',
              label: 'Autorizado inicial (MXN)',
              type: 'number',
              required: true,
            },
            {
              key: 'categorias',
              label: 'Categorías contables (separadas por «;»)',
              type: 'text',
              full: true,
              hint: 'Como aparecen en la hoja RESUMEN del reporte contable',
            },
            {
              key: 'areaId',
              label: 'Gerencia responsable',
              type: 'select',
              options: db.areas.map((a) => ({ value: a.id, label: a.nombre })),
              optional: true,
            },
            {
              key: 'revolvente',
              label: 'Fondo revolvente',
              type: 'checkbox',
              hint: 'Se concilia contra ventas y reinversión',
            },
            { key: 'fuente', label: 'Fuente', type: 'text', required: true },
            {
              key: 'estado',
              label: 'Estado',
              type: 'select',
              options: VALIDACION_OPTIONS,
            },
            { key: 'nota', label: 'Nota', type: 'textarea', optional: true },
            {
              key: 'discrepancia',
              label: 'Discrepancia por resolver',
              type: 'textarea',
              optional: true,
              hint: 'Bórrala cuando Dirección la resuelva',
            },
          ]}
          initial={{
            estado: 'CONFIRMADO',
            fuente: '',
            ...dialog.item,
            categorias: dialog.item?.categoriasContables.join('; ') ?? '',
          }}
          toInput={(v) => {
            const { categorias, ...rest } = v;
            return {
              ...dialog.item,
              ...rest,
              original: toNum(v.original),
              categoriasContables: String(categorias ?? '')
                .split(';')
                .map((x) => x.trim())
                .filter(Boolean),
              areaId: toStr(v.areaId),
              nota: toStr(v.nota),
              discrepancia: toStr(v.discrepancia),
              orden: dialog.item?.orden ?? db.budgetLines.length + 1,
            };
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/* ───────────── Paquete de datos validados ───────────── */

function PackageImport() {
  const db = useDb();
  const services = useServices();
  const { toast, confirm } = useFeedback();
  const [pkg, setPkg] = useState<InvestmentPackage | null>(null);
  const [areaMap, setAreaMap] = useState<Record<string, ID | undefined>>({});
  const [done, setDone] = useState<number | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const r = parsePackage(await file.text());
    if (!r.ok) return toast(r.error, 'error');
    const keys = [...new Set((JSON.stringify(r.pkg.data).match(/area:[^"\]]+/g) ?? []).map((k) => k.slice(5)))];
    setAreaMap(Object.fromEntries(keys.map((k) => [k, db.areas.find((a) => normName(a.nombre) === normName(k))?.id])));
    setPkg(r.pkg);
    setDone(null);
  };

  const plan = pkg ? services.investment.planImport(pkg, areaMap) : null;
  const nuevos = plan ? plan.plan.reduce((s, p) => s + p.nuevos.length, 0) : 0;

  const apply = async () => {
    if (!plan) return;
    const ok = await confirm({
      title: 'Agregar datos validados',
      message: `Se agregarán ${nuevos} registros nuevos. No se modifica ni borra nada existente (proyectos, prioridades, bloqueos, compromisos ni registros previos de inversión).`,
      confirmLabel: 'Agregar',
    });
    if (!ok) return;
    try {
      setDone(services.investment.applyImport(plan.plan as ImportPlanStep[]));
      toast('Datos agregados');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cargar el paquete.', 'error');
    }
  };

  return (
    <Section title="Paquete de datos validados">
      <p className="small">
        Carga el archivo <code>paquete-inversion-SOC-2026.json</code>: presupuesto 2026, gasto contable, movimientos, catálogo de KPIs y resultados ya validados. Sólo <strong>agrega</strong> registros
        nuevos; si un registro ya existe, se conserva el existente. Se puede volver a cargar sin duplicar.
      </p>
      <label className="btn btn-secondary">
        <Upload size={16} aria-hidden /> Elegir paquete (.json)
        <input type="file" accept=".json,application/json" onChange={onFile} hidden data-testid="package-file" />
      </label>
      {pkg && plan && (
        <div className="inv-import">
          <p className="small muted">
            Generado {pkg.generado} · {pkg.descripcion}
          </p>
          {pkg.discrepancias.length > 0 && (
            <div className="alert alert-yellow small">
              <strong>Discrepancias detectadas contra la referencia (no se corrigieron):</strong>
              <ul>
                {pkg.discrepancias.map((d) => (
                  <li key={d.tema}>
                    {d.tema}: referencia «{d.referencia}» vs validado «{d.validado}». {d.tratamiento}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Object.keys(areaMap).length > 0 && (
            <div className="inv-area-map">
              <p className="small">
                <strong>Gerencias del paquete → gerencias de la herramienta</strong>
              </p>
              {Object.keys(areaMap).map((k) => (
                <label key={k} className="field">
                  <span className="field-label">{k}</span>
                  <select
                    className="input"
                    value={areaMap[k] ?? ''}
                    onChange={(e) =>
                      setAreaMap({
                        ...areaMap,
                        [k]: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Sin asignar</option>
                    {db.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col">Información</th>
                  <th scope="col" className="num">
                    Nuevos
                  </th>
                  <th scope="col" className="num">
                    Ya existen (iguales)
                  </th>
                  <th scope="col" className="num">
                    Ya existen con otro contenido (se conservan)
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.plan
                  .filter((p) => p.nuevos.length || p.iguales || p.distintos.length)
                  .map((p) => (
                    <tr key={p.collection}>
                      <td>{COLLECTION_LABELS[p.collection]}</td>
                      <td className="num">{p.nuevos.length}</td>
                      <td className="num">{p.iguales}</td>
                      <td className={`num ${p.distintos.length ? 'warn-text' : ''}`}>{p.distintos.length}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Fuentes: {pkg.fuentes.map((f) => `${f.archivo}${f.corte ? ` (${f.corte})` : ''}`).join(' · ')}</p>
          {done !== null ? (
            <p className="alert alert-green">Listo: se agregaron {done} registros.</p>
          ) : (
            <button className="btn btn-primary" disabled={!nuevos} onClick={apply} data-testid="apply-package">
              Agregar {nuevos} registros
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

/* ───────────── Gasto contable mensual ───────────── */

function ContableImport() {
  const services = useServices();
  const { now } = useApp();
  const { toast, confirm } = useFeedback();
  const [plan, setPlan] = useState<(SpendPlan & { archivo: string }) | null>(null);
  const [aplicarCambios, setAplicarCambios] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const report = parseContable(readXlsx(await file.arrayBuffer()), now.getFullYear());
      setPlan({
        ...services.investment.planSpend(report, file.name),
        archivo: file.name,
      });
      setAplicarCambios(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo leer el archivo.', 'error');
    }
  };
  const apply = async () => {
    if (!plan) return;
    if (
      !(await confirm({
        title: `Actualizar gasto al corte ${plan.corte}`,
        message: `Se agregan ${plan.nuevos.length} registros mensuales${aplicarCambios ? ` y se corrigen ${plan.cambios.length} (queda anotado el valor anterior)` : ''}.`,
        confirmLabel: 'Actualizar',
      }))
    )
      return;
    try {
      const n = services.investment.applySpend(plan, aplicarCambios);
      toast(`Gasto actualizado (${n} registros)`);
      setPlan(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    }
  };
  return (
    <Section title="Actualizar gasto contable (corte mensual)">
      <p className="small">Carga el Excel del ejercicio presupuestal (hoja RESUMEN). Se valida el cuadre de cada categoría y del total antes de usarlo.</p>
      <label className="btn btn-secondary">
        <FileSpreadsheet size={16} aria-hidden /> Elegir Excel contable
        <input type="file" accept=".xlsx" onChange={onFile} hidden data-testid="contable-file" />
      </label>
      {plan && (
        <div className="inv-import">
          <p>
            <strong>{plan.archivo}</strong> · corte {plan.corte} · total {money(plan.total, true)}
          </p>
          <ul className="small">
            <li>{plan.nuevos.length} registros nuevos</li>
            <li>{plan.iguales} sin cambio</li>
            <li className={plan.cambios.length ? 'warn-text' : undefined}>{plan.cambios.length} meses ya registrados con otro monto</li>
            {plan.sinPartida.length > 0 && <li className="warn-text">Categorías sin partida: {plan.sinPartida.join(', ')}</li>}
          </ul>
          {plan.cambios.length > 0 && (
            <>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th scope="col">Categoría</th>
                      <th scope="col">Mes</th>
                      <th scope="col" className="num">
                        Registrado
                      </th>
                      <th scope="col" className="num">
                        Nuevo reporte
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.cambios.map((c) => (
                      <tr key={c.actual.id}>
                        <td>{c.actual.categoria}</td>
                        <td>{c.actual.mes}</td>
                        <td className="num">{money(c.actual.monto, true)}</td>
                        <td className="num">{money(c.monto, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="check">
                <input type="checkbox" checked={aplicarCambios} onChange={(e) => setAplicarCambios(e.target.checked)} /> Aplicar las correcciones de Contabilidad (queda anotado el monto anterior)
              </label>
            </>
          )}
          <button className="btn btn-primary" onClick={apply} disabled={!plan.nuevos.length && !(aplicarCambios && plan.cambios.length)}>
            Actualizar gasto
          </button>
        </div>
      )}
    </Section>
  );
}

/* ───────────── Índice complementario ───────────── */

function PriorityConfig() {
  const services = useServices();
  const { run } = useFeedback();
  const [cfg, setCfg] = useState<InvestmentPriorityConfig>(services.investment.priorityConfig());
  const errs = priorityConfigErrors(cfg);
  const total = Object.values(cfg.pesos).reduce((s, x) => s + x, 0);
  return (
    <Section title="Índice complementario de atención (propuesta)">
      <p className="small">
        Complementa —no reemplaza— la prioridad oficial (P1 Crítico, Urgente, Estratégico, P2, P3). La inversión tiene tope y nunca puede pesar más que el impacto estratégico: un proyecto caro no se
        vuelve prioritario sólo por su presupuesto.
      </p>
      <div className="inv-weights">
        {(Object.keys(cfg.pesos) as (keyof InvestmentPriorityConfig['pesos'])[]).map((k) => (
          <label key={k} className="field">
            <span className="field-label">{PESO_LABELS[k]}</span>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={cfg.pesos[k]}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  pesos: { ...cfg.pesos, [k]: Number(e.target.value) },
                })
              }
            />
          </label>
        ))}
        <label className="field">
          <span className="field-label">Tope de la inversión</span>
          <input className="input" type="number" min={0} max={100} value={cfg.topeInversion} onChange={(e) => setCfg({ ...cfg, topeInversion: Number(e.target.value) })} />
        </label>
      </div>
      <p className={`small ${total === 100 ? 'muted' : 'warn-text'}`}>Suma de pesos: {total} / 100</p>
      {errs.length > 0 && <p className="field-error">{errs.join(' ')}</p>}
      <label className="check">
        <input type="checkbox" checked={cfg.aprobado} onChange={(e) => setCfg({ ...cfg, aprobado: e.target.checked })} /> Metodología aprobada por Dirección
      </label>
      <div className="row gap">
        <button className="btn btn-primary" disabled={errs.length > 0} onClick={() => run(() => services.investment.savePriorityConfig(cfg), 'Índice actualizado')}>
          Guardar
        </button>
        <button className="btn btn-ghost" onClick={() => setCfg(DEFAULT_INVESTMENT_PRIORITY)}>
          Propuesta original
        </button>
      </div>
    </Section>
  );
}

/* ───────────── Matriz de vinculación ───────────── */

function LinkMatrix({ data }: { data: InvestmentData }) {
  const { db } = data;
  const areaName = useAreaName();
  const kpi = (id?: ID) => db.kpis.find((k) => k.id === id);
  const project = (id?: ID) => db.projects.find((p) => p.id === id);
  const line = (id?: ID) => db.budgetLines.find((l) => l.id === id);
  const rows: (string | number | undefined)[][] = [
    ...db.budgetAllocations.map((a) => ['Partida → proyecto', line(a.lineaId)?.nombre, project(a.projectId)?.nombre, areaName(project(a.projectId)?.areaId), a.monto, a.estado]),
    ...db.projectKpis.map((l) => ['Proyecto → KPI', project(l.projectId)?.nombre, `${kpi(l.kpiId)?.clave} ${kpi(l.kpiId)?.nombre}`, areaName(project(l.projectId)?.areaId), l.contribucion, '']),
    ...db.projectAreas.map((l) => ['Proyecto → gerencia colaboradora', project(l.projectId)?.nombre, areaName(l.areaId), areaName(project(l.projectId)?.areaId), l.rol, '']),
    ...db.kpis.flatMap((k) => (k.areaIds.length ? k.areaIds : ['']).map((a) => ['KPI → gerencia', `${k.clave} ${k.nombre}`, a ? areaName(a) : 'Sin gerencia', '', k.estado, ''])),
    ...db.results.map((r) => ['Resultado → KPI', `${r.metrica} (${periodLabel(r.periodo)})`, r.kpiId ? `${kpi(r.kpiId)?.clave}` : 'Pendiente de vinculación', '', r.valor, r.estado]),
    ...db.budgetLines.flatMap((l) => l.categoriasContables.map((c) => ['Categoría contable → partida', c, l.nombre, l.areaId ? areaName(l.areaId) : '', '', l.estado])),
    ...db.efficiencyScopes.map((s) => [
      'Alcance de eficiencia',
      s.nombre,
      Object.entries(s.etapas)
        .filter(([, id]) => id)
        .map(([e, id]) => `${e}: ${kpi(id)?.clave}`)
        .join(' | '),
      areaName(s.areaId),
      s.inversion ?? '',
      s.estado,
    ]),
  ];
  return (
    <Section title="Matriz de vinculación">
      <p className="small">
        Relaciones registradas entre gerencias, proyectos, partidas, KPIs y resultados (por identificador): {db.budgetAllocations.length} partida→proyecto · {db.projectKpis.length} proyecto→KPI ·{' '}
        {db.projectAreas.length} gerencias colaboradoras · {db.results.filter((r) => !r.kpiId).length} resultados pendientes de vinculación.
      </p>
      <button
        className="btn btn-secondary"
        onClick={() => downloadFile('matriz-vinculacion.csv', toCsv(['Relación', 'Desde', 'Hacia', 'Gerencia', 'Valor', 'Estado'], rows), 'text/csv;charset=utf-8')}
      >
        <Download size={16} aria-hidden /> Descargar matriz (CSV)
      </button>
    </Section>
  );
}
