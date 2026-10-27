import { useState } from 'react';
import { Download, Link2, Plus } from 'lucide-react';
import { KPI_ESTADO_LABELS, KPI_GRUPOS, KPI_TIPOS, kpiProjects, kpiSeries, periodLabel, type KpiEval } from '../../../domain/investment/kpis';
import { isActiveProject, sortProjectsByPriority } from '../../../domain/selectors';
import type { ID, Kpi, KpiTarget, ResultRecord } from '../../../domain/types';
import { useApp, useCanEdit, useServices } from '../../../state/app';
import { Link, useQuery } from '../../../state/router';
import { Chip } from '../../../ui/badges';
import { downloadFile, Section } from '../../../ui/common';
import { Modal } from '../../../ui/Modal';
import { useFeedback } from '../../../ui/feedback';
import { toISODate } from '../../../domain/dates';
import { num, pct, RecordModal, SeriesBars, toCsv, toNum, toStr, useAreaName, VALIDACION_OPTIONS, ValidChip, valueWithUnit, type FieldSpec, type InvestmentData, type PeriodOption } from '../shared';
import { KpiEstadoChip } from './chips';

type Dialog = { kind: 'meta'; kpiId: ID; item?: KpiTarget } | { kind: 'resultado'; kpiId?: ID; item?: ResultRecord } | null;

export function KpisView({ data, areaId, periodo }: { data: InvestmentData; areaId: string; periodo: PeriodOption }) {
  const { db, kpis, operational } = data;
  const [q, setQ] = useQuery();
  const canEdit = useCanEdit();
  const services = useServices();
  const director = services.investment.canManageFinance();
  const areaName = useAreaName();
  const [dialog, setDialog] = useState<Dialog>(null);
  const f = {
    grupo: q.get('grupo') ?? '',
    estado: q.get('estado') ?? '',
    tipo: q.get('tipo') ?? '',
    vinculo: q.get('vinculo') ?? '',
    texto: q.get('q') ?? '',
  };
  const selected = q.get('kpi');

  const rows = kpis
    .filter((k) => !areaId || k.kpi.areaIds.includes(areaId))
    .filter((k) => !f.grupo || k.kpi.grupo === f.grupo)
    .filter((k) => !f.tipo || k.kpi.tipo === f.tipo)
    .filter((k) => !f.estado || (f.estado === 'riesgo' ? k.estado === 'en_riesgo' || k.estado === 'debajo' : k.estado === f.estado))
    .filter((k) => !f.texto || `${k.kpi.clave} ${k.kpi.nombre}`.toLowerCase().includes(f.texto.toLowerCase()))
    .sort((a, b) => a.kpi.grupo.localeCompare(b.kpi.grupo) || a.kpi.clave.localeCompare(b.kpi.clave));
  const sinVinculo = db.results.filter((r) => !r.kpiId);
  const sel = selected ? kpis.find((k) => k.kpi.id === selected) : undefined;

  const exportCsv = () =>
    downloadFile(
      'kpis-y-resultados.csv',
      toCsv(
        [
          'Clave',
          'KPI',
          'Definición',
          'Grupo',
          'Tipo',
          'Objetivo',
          'Gerencias',
          'Unidad',
          'Sentido',
          'Meta',
          'Resultado',
          'Cumplimiento %',
          'Estado',
          'Periodo',
          'Fuente',
          'Validación',
          'Proyectos vinculados',
        ],
        rows.map((k) => [
          k.kpi.clave,
          k.kpi.nombre,
          k.kpi.definicion,
          KPI_GRUPOS[k.kpi.grupo],
          KPI_TIPOS[k.kpi.tipo],
          db.objectives.find((o) => o.id === k.kpi.objetivoId)?.nombre,
          k.kpi.areaIds.map(areaName).join(' | '),
          k.kpi.unidad,
          k.kpi.sentido,
          k.meta,
          k.real,
          k.cumplimiento === null ? '' : Math.round(k.cumplimiento * 1000) / 10,
          KPI_ESTADO_LABELS[k.estado],
          periodLabel(k.periodo),
          k.kpi.fuente,
          k.kpi.estado,
          kpiProjects(db, k.kpi.id).length,
        ]),
      ),
      'text/csv;charset=utf-8',
    );

  return (
    <div className="stack">
      <div className="filters card" aria-label="Filtros de KPIs">
        <input className="input" type="search" placeholder="Buscar KPI…" aria-label="Buscar KPI" value={f.texto} onChange={(e) => setQ({ q: e.target.value })} />
        <select className="input" aria-label="Grupo" value={f.grupo} onChange={(e) => setQ({ grupo: e.target.value })}>
          <option value="">Todos los grupos</option>
          {Object.entries(KPI_GRUPOS).map(([k, v]) => (
            <option key={k} value={k}>
              {k} · {v}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Tipo de indicador" value={f.tipo} onChange={(e) => setQ({ tipo: e.target.value })}>
          <option value="">Todos los tipos</option>
          {Object.entries(KPI_TIPOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Estado" value={f.estado} onChange={(e) => setQ({ estado: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="riesgo">En riesgo o debajo de meta</option>
          {Object.entries(KPI_ESTADO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setDialog({ kind: 'resultado' })}>
            <Plus size={16} aria-hidden /> Registrar resultado
          </button>
        )}
        <button className="btn btn-secondary" onClick={exportCsv}>
          <Download size={16} aria-hidden /> CSV
        </button>
      </div>

      <Section title={`KPIs · ${periodo.label} · ${rows.length}`}>
        <div className="table-wrap">
          <table className="table table-hover table-compact">
            <thead>
              <tr>
                <th scope="col">KPI</th>
                <th scope="col">Gerencia</th>
                <th scope="col" className="num">
                  Meta
                </th>
                <th scope="col" className="num">
                  Resultado
                </th>
                <th scope="col" className="num">
                  Cumplimiento
                </th>
                <th scope="col">Estado</th>
                <th scope="col">Periodo</th>
                <th scope="col">Fuente · validación</th>
                <th scope="col" className="num">
                  Proyectos
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.kpi.id} onClick={() => setQ({ kpi: k.kpi.id })} style={{ cursor: 'pointer' }} data-testid="kpi-row">
                  <td>
                    <button className="link-btn cell-title">
                      {k.kpi.clave} · {k.kpi.nombre}
                    </button>
                    <span className="small muted block">
                      {KPI_GRUPOS[k.kpi.grupo]} · {KPI_TIPOS[k.kpi.tipo]}
                    </span>
                  </td>
                  <td className="small">{k.kpi.areaIds.map(areaName).join(', ') || '—'}</td>
                  <td className="num">{k.meta === null ? <span className="muted">Sin meta</span> : valueWithUnit(k.metaProporcional ?? k.meta, k.kpi.unidad)}</td>
                  <td className="num">{valueWithUnit(k.real, k.kpi.unidad)}</td>
                  <td className="num">{pct(k.cumplimiento, 0)}</td>
                  <td>
                    <KpiEstadoChip e={k.estado} />
                  </td>
                  <td className="small">{periodLabel(k.periodo)}</td>
                  <td className="small">
                    <span className="inv-clip block">{k.kpi.fuente}</span>
                    {k.pendienteValidacion ? <ValidChip estado="PENDIENTE" /> : <ValidChip estado={k.kpi.estado} />}
                  </td>
                  <td className="num">{kpiProjects(db, k.kpi.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Cumplimiento: «mayor es mejor» = resultado / meta; «menor es mejor» = meta / resultado; «rango» = dentro del rango. Con resultados parciales del periodo se compara contra la meta
          proporcional. En riesgo: por debajo del 90 %.
        </p>
      </Section>

      <div className="two-col">
        <Section title="Eficiencia operativa (calculado por la herramienta)">
          <div className="table-wrap">
            <table className="table table-compact">
              <tbody>
                {operational.map((o) => (
                  <tr key={o.clave}>
                    <td className="small">
                      {o.nombre}
                      <span className="block muted">{o.definicion}</span>
                    </td>
                    <td className="num">
                      <strong>{o.valor === null ? '—' : `${num(o.valor, 1)}${o.unidad === '%' ? '%' : ` ${o.unidad}`}`}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Fuente: proyectos, bloqueos y compromisos de Alignment &amp; Unblock (siempre al día).</p>
        </Section>
        <Section title={`Resultados pendientes de vinculación · ${sinVinculo.length}`}>
          {sinVinculo.length ? (
            <ul className="inv-mini-list">
              {sinVinculo.map((r) => (
                <li key={r.id}>
                  <strong>{r.metrica}</strong> · {valueWithUnit(r.valor, r.unidad)} · {periodLabel(r.periodo)}
                  <span className="small muted"> · {r.fuente}</span>
                  {canEdit && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'resultado', item: r })}>
                      <Link2 size={14} aria-hidden /> Vincular
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Todos los resultados están vinculados a un KPI.</p>
          )}
        </Section>
      </div>

      {sel && (
        <KpiDetail
          ev={sel}
          data={data}
          onClose={() => setQ({ kpi: undefined })}
          onMeta={(item) => setDialog({ kind: 'meta', kpiId: sel.kpi.id, item })}
          onResultado={(item) => setDialog({ kind: 'resultado', kpiId: sel.kpi.id, item })}
          canEdit={canEdit}
          director={director}
        />
      )}

      {dialog?.kind === 'meta' && (
        <RecordModal
          title={dialog.item ? 'Editar meta' : 'Nueva meta'}
          subtitle={db.kpis.find((k) => k.id === dialog.kpiId)?.nombre}
          collection="kpiTargets"
          fields={[
            {
              key: 'inicio',
              label: 'Periodo: inicio',
              type: 'date',
              required: true,
            },
            { key: 'fin', label: 'Periodo: fin', type: 'date', required: true },
            {
              key: 'etiqueta',
              label: 'Etiqueta del periodo',
              type: 'text',
              optional: true,
              hint: 'p. ej. T4 2026',
            },
            { key: 'meta', label: 'Meta', type: 'number', required: true },
            {
              key: 'fuente',
              label: 'Fuente de la meta',
              type: 'text',
              required: true,
              hint: 'p. ej. Plan anual autorizado',
            },
            {
              key: 'estado',
              label: 'Estado',
              type: 'select',
              options: VALIDACION_OPTIONS,
            },
          ]}
          initial={{
            inicio: dialog.item?.periodo.inicio ?? periodo.periodo?.inicio ?? '',
            fin: dialog.item?.periodo.fin ?? periodo.periodo?.fin ?? '',
            etiqueta: dialog.item?.periodo.etiqueta ?? periodo.periodo?.etiqueta ?? '',
            meta: dialog.item?.meta ?? '',
            fuente: dialog.item?.fuente ?? '',
            estado: dialog.item?.estado ?? 'CONFIRMADO',
          }}
          toInput={(v) => ({
            id: dialog.item?.id,
            kpiId: dialog.kpiId,
            periodo: {
              inicio: v.inicio,
              fin: v.fin,
              etiqueta: toStr(v.etiqueta),
            },
            meta: toNum(v.meta),
            fuente: v.fuente,
            estado: v.estado,
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'resultado' && <ResultadoModal data={data} kpiId={dialog.kpiId} item={dialog.item} director={director} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ResultadoModal({ data, kpiId, item, director, onClose }: { data: InvestmentData; kpiId?: ID; item?: ResultRecord; director: boolean; onClose: () => void }) {
  const { db } = data;
  const { now } = useApp();
  const kpiOptions = db.kpis.filter((k) => k.activo).map((k) => ({ value: k.id, label: `${k.clave} · ${k.nombre}` }));
  const projectOptions = db.projects
    .filter(isActiveProject)
    .sort(sortProjectsByPriority)
    .map((p) => ({ value: p.id, label: p.nombre }));
  const kpi = db.kpis.find((k) => k.id === (item?.kpiId ?? kpiId));
  const fields: FieldSpec[] = [
    {
      key: 'kpiId',
      label: 'KPI',
      type: 'select',
      options: kpiOptions,
      optional: true,
      hint: 'Vacío = pendiente de vinculación',
      full: true,
    },
    {
      key: 'metrica',
      label: 'Qué se midió (como viene en la fuente)',
      type: 'text',
      required: true,
      full: true,
    },
    { key: 'valor', label: 'Valor', type: 'number', required: true },
    { key: 'unidad', label: 'Unidad', type: 'text', required: true },
    { key: 'inicio', label: 'Periodo: inicio', type: 'date', required: true },
    { key: 'fin', label: 'Periodo: fin', type: 'date', required: true },
    {
      key: 'fuente',
      label: 'Fuente',
      type: 'text',
      required: true,
      hint: 'Archivo o sistema de donde sale el dato',
    },
    {
      key: 'actualizado',
      label: 'Fecha de actualización',
      type: 'date',
      optional: true,
    },
    {
      key: 'projectId',
      label: 'Atribuido directamente al proyecto',
      type: 'select',
      options: projectOptions,
      optional: true,
    },
    {
      key: 'estado',
      label: 'Estado',
      type: 'select',
      options: director ? VALIDACION_OPTIONS : VALIDACION_OPTIONS.filter((o) => o.value !== 'CONFIRMADO'),
    },
    { key: 'nota', label: 'Nota', type: 'textarea', optional: true },
  ];
  return (
    <RecordModal
      title={item ? 'Editar resultado' : 'Registrar resultado'}
      collection="results"
      note={director ? 'Un resultado por KPI y periodo: si ya existe, edítalo en lugar de duplicarlo.' : 'Se guarda como «Pendiente de validación»; Dirección lo confirma.'}
      fields={fields}
      initial={{
        kpiId: item?.kpiId ?? kpiId ?? '',
        metrica: item?.metrica ?? kpi?.nombre ?? '',
        valor: item?.valor ?? '',
        unidad: item?.unidad ?? kpi?.unidad ?? '',
        inicio: item?.periodo.inicio ?? '',
        fin: item?.periodo.fin ?? '',
        fuente: item?.fuente ?? kpi?.fuente ?? '',
        actualizado: item?.actualizado ?? toISODate(now),
        projectId: item?.projectId ?? '',
        estado: item?.estado ?? 'PENDIENTE',
        nota: item?.nota ?? '',
      }}
      toInput={(v) => ({
        ...item,
        id: item?.id,
        kpiId: toStr(v.kpiId),
        metrica: v.metrica,
        valor: toNum(v.valor),
        unidad: v.unidad,
        periodo: { ...item?.periodo, inicio: v.inicio, fin: v.fin },
        fuente: v.fuente,
        actualizado: toStr(v.actualizado),
        projectId: toStr(v.projectId),
        estado: v.estado,
        nota: toStr(v.nota),
      })}
      onClose={onClose}
    />
  );
}

function KpiDetail({
  ev,
  data,
  onClose,
  onMeta,
  onResultado,
  canEdit,
  director,
}: {
  ev: KpiEval;
  data: InvestmentData;
  onClose: () => void;
  onMeta: (t?: KpiTarget) => void;
  onResultado: (r?: ResultRecord) => void;
  canEdit: boolean;
  director: boolean;
}) {
  const { db } = data;
  const k: Kpi = ev.kpi;
  const areaName = useAreaName();
  const services = useServices();
  const { run, confirm } = useFeedback();
  const series = kpiSeries(k.id, db.results);
  const targets = db.kpiTargets.filter((t) => t.kpiId === k.id).sort((a, b) => a.periodo.inicio.localeCompare(b.periodo.inicio));
  const projects = kpiProjects(db, k.id)
    .map((id) => db.projects.find((p) => p.id === id))
    .filter(Boolean);
  const scopes = db.efficiencyScopes.filter((s) => Object.values(s.etapas).includes(k.id));
  const objetivo = db.objectives.find((o) => o.id === k.objetivoId);
  return (
    <Modal title={`${k.clave} · ${k.nombre}`} subtitle={k.definicion} onClose={onClose} size="xl">
      <div className="inv-kpi-head">
        <KpiEstadoChip e={ev.estado} />
        <ValidChip estado={k.estado} />
        <Chip>{KPI_TIPOS[k.tipo]}</Chip>
        <Chip>{k.sentido === 'mayor' ? 'Mayor es mejor' : k.sentido === 'menor' ? 'Menor es mejor' : `Rango ${k.rangoMin}–${k.rangoMax}`}</Chip>
      </div>
      <dl className="inv-dl">
        <dt>Objetivo estratégico</dt>
        <dd>{objetivo ? `${objetivo.clave} · ${objetivo.nombre}` : '—'}</dd>
        <dt>Gerencia responsable</dt>
        <dd>{k.areaIds.map(areaName).join(', ') || '—'}</dd>
        <dt>Unidad</dt>
        <dd>{k.unidad}</dd>
        <dt>Fuente</dt>
        <dd>{k.fuente}</dd>
        <dt>Meta / resultado ({periodLabel(ev.periodo)})</dt>
        <dd>
          {ev.meta === null ? 'Sin meta' : valueWithUnit(ev.meta, k.unidad)} / {valueWithUnit(ev.real, k.unidad)} · cumplimiento {pct(ev.cumplimiento, 0)}
        </dd>
      </dl>
      {ev.avisos.length > 0 && (
        <ul className="alert alert-yellow small">
          {ev.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <h3>Tendencia</h3>
      <SeriesBars
        items={series.map((r) => ({
          label: r.periodo.etiqueta ?? (r.periodo.inicio.slice(0, 7) === r.periodo.fin.slice(0, 7) ? r.periodo.inicio.slice(0, 7) : `${r.periodo.inicio.slice(2, 7)}→${r.periodo.fin.slice(2, 7)}`),
          value: r.valor,
          pending: r.estado !== 'CONFIRMADO',
        }))}
        unidad={k.unidad}
      />
      <div className="two-col">
        <div>
          <h3>Metas</h3>
          {targets.length ? (
            <ul className="inv-mini-list">
              {targets.map((t) => (
                <li key={t.id}>
                  {periodLabel(t.periodo)}: <strong>{valueWithUnit(t.meta, k.unidad)}</strong> <ValidChip estado={t.estado} />
                  {director && (
                    <button className="btn btn-ghost btn-sm" onClick={() => onMeta(t)}>
                      Editar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Sin metas. {director ? '' : 'Las define Dirección.'}</p>
          )}
          {director && (
            <button className="btn btn-secondary btn-sm" onClick={() => onMeta()}>
              <Plus size={14} aria-hidden /> Meta por periodo
            </button>
          )}
          <h3>Proyectos que contribuyen</h3>
          {projects.length ? (
            <ul className="inv-mini-list">
              {projects.map((p) => (
                <li key={p!.id}>
                  <Link to={`/proyectos/${p!.id}`}>{p!.nombre}</Link> · {db.projectKpis.find((l) => l.projectId === p!.id && l.kpiId === k.id)?.contribucion}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Ningún proyecto vinculado. Se vinculan desde el detalle de cada proyecto.</p>
          )}
          {scopes.length > 0 && <p className="small">Usado en eficiencia: {scopes.map((s) => s.nombre).join(', ')}</p>}
        </div>
        <div>
          <h3>Resultados ({series.length})</h3>
          <div className="table-wrap">
            <table className="table table-compact">
              <tbody>
                {series.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{periodLabel(r.periodo)}</td>
                    <td className="num">{valueWithUnit(r.valor, r.unidad)}</td>
                    <td>
                      <ValidChip estado={r.estado} />
                      {r.nota && <span className="small muted block">{r.nota}</span>}
                    </td>
                    <td className="row-actions">
                      {canEdit && (r.estado !== 'CONFIRMADO' || director) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => onResultado(r)}>
                          Editar
                        </button>
                      )}
                      {director && r.estado !== 'CONFIRMADO' && (
                        <button
                          className="btn btn-ok-soft btn-sm"
                          onClick={() =>
                            run(
                              () =>
                                services.investment.save('results', {
                                  ...r,
                                  estado: 'CONFIRMADO',
                                }),
                              'Resultado confirmado',
                            )
                          }
                        >
                          Confirmar
                        </button>
                      )}
                      {director && (
                        <button
                          className="btn btn-ghost-danger btn-sm"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: 'Eliminar resultado',
                                message: `${r.metrica} · ${periodLabel(r.periodo)}`,
                                confirmLabel: 'Eliminar',
                                danger: true,
                              })
                            )
                              run(() => services.investment.remove('results', r.id), 'Resultado eliminado');
                          }}
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <button className="btn btn-secondary btn-sm" onClick={() => onResultado()}>
              <Plus size={14} aria-hidden /> Registrar resultado
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
