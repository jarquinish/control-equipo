import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { periodLabel } from '../../domain/investment/kpis';
import { PESO_LABELS } from '../../domain/investment/priorityIndex';
import type { Project } from '../../domain/types';
import { useCanEdit, useServices } from '../../state/app';
import { Link } from '../../state/router';
import { Section } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { money, RecordModal, toNum, toStr, useInvestment, VALIDACION_OPTIONS, valueWithUnit } from './shared';
import { KpiEstadoChip, SeverityChip } from './views/chips';

/** Detalle del proyecto · Inversión y KPIs: qué presupuesto usa, qué KPIs mueve y qué resultados tiene. */
export function ProjectInvestmentPanel({ project: p }: { project: Project }) {
  const data = useInvestment();
  const { db, kpis, projInv, prio, alerts } = data;
  const services = useServices();
  const canEdit = useCanEdit();
  const director = services.investment.canManageFinance();
  const { run, confirm } = useFeedback();
  const [dialog, setDialog] = useState<'kpi' | 'area' | 'asignacion' | null>(null);
  const inv = projInv.get(p.id);
  const links = db.projectKpis.filter((l) => l.projectId === p.id);
  const colaboran = db.projectAreas.filter((x) => x.projectId === p.id);
  const evalBy = new Map(kpis.map((k) => [k.kpi.id, k]));
  const directos = db.results.filter((r) => r.projectId === p.id);
  const idx = prio.get(p.id);
  const misAlertas = alerts.filter((a) => a.projectId === p.id);
  const kpiOptions = db.kpis.filter((k) => k.activo && !links.some((l) => l.kpiId === k.id)).map((k) => ({ value: k.id, label: `${k.clave} · ${k.nombre}` }));

  return (
    <Section title="Inversión, KPIs y resultados" className="inv-project-panel">
      <div className="inv-project-grid">
        <div>
          <h3>Presupuesto que utiliza</h3>
          {inv?.lineas.length ? (
            <ul className="inv-mini-list">
              {inv.lineas.map((l) => (
                <li key={l.lineaId}>
                  <Link to={`/inversion?vista=presupuesto&partida=${l.lineaId}`}>{db.budgetLines.find((x) => x.id === l.lineaId)?.nombre}</Link> · {money(l.monto)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Sin partida asignada.</p>
          )}
          <p className="small">
            Asignado <strong>{money(inv?.asignado ?? 0)}</strong> · comprometido {money(inv?.comprometido ?? 0)} · ejercido con detalle {money(inv?.ejercido ?? 0)}
          </p>
          {director && (
            <button className="btn btn-secondary btn-sm" onClick={() => setDialog('asignacion')}>
              <Plus size={14} aria-hidden /> Asignar partida
            </button>
          )}
          <h3>Gerencias que colaboran</h3>
          {colaboran.length ? (
            <ul className="inv-mini-list">
              {colaboran.map((c) => (
                <li key={c.id}>
                  {db.areas.find((a) => a.id === c.areaId)?.nombre} · {c.rol}
                  {canEdit && (
                    <button className="icon-btn" aria-label="Quitar gerencia colaboradora" onClick={() => run(() => services.investment.remove('projectAreas', c.id), 'Gerencia quitada')}>
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Sólo {db.areas.find((a) => a.id === p.areaId)?.nombre}.</p>
          )}
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDialog('area')}>
              <Plus size={14} aria-hidden /> Gerencia colaboradora
            </button>
          )}
        </div>

        <div>
          <h3>KPIs a los que contribuye</h3>
          {links.length ? (
            <div className="table-wrap">
              <table className="table table-compact">
                <tbody>
                  {links.map((l) => {
                    const e = evalBy.get(l.kpiId);
                    const k = db.kpis.find((x) => x.id === l.kpiId);
                    return (
                      <tr key={l.id}>
                        <td>
                          <Link to={`/inversion?vista=kpis&kpi=${l.kpiId}`}>
                            {k?.clave} · {k?.nombre}
                          </Link>
                          <span className="small muted block">Contribución {l.contribucion}</span>
                        </td>
                        <td className="num small">{e ? valueWithUnit(e.real, e.kpi.unidad) : '—'}</td>
                        <td>{e && <KpiEstadoChip e={e.estado} />}</td>
                        {canEdit && (
                          <td>
                            <button
                              className="icon-btn"
                              aria-label="Quitar vínculo con el KPI"
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: 'Quitar vínculo',
                                    message: `El proyecto dejará de contribuir a ${k?.clave}.`,
                                    confirmLabel: 'Quitar',
                                    danger: true,
                                  })
                                )
                                  run(() => services.investment.remove('projectKpis', l.id), 'Vínculo eliminado');
                              }}
                            >
                              <X size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small warn-text">Sin KPI vinculado: no se puede medir su contribución.</p>
          )}
          {canEdit && (
            <button className="btn btn-secondary btn-sm" onClick={() => setDialog('kpi')} data-testid="link-kpi">
              <Plus size={14} aria-hidden /> Vincular KPI
            </button>
          )}
          {directos.length > 0 && (
            <>
              <h3>Resultados atribuidos directamente</h3>
              <ul className="inv-mini-list">
                {directos.map((r) => (
                  <li key={r.id}>
                    {r.metrica}: {valueWithUnit(r.valor, r.unidad)} · {periodLabel(r.periodo)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div>
          <h3>Índice complementario de atención</h3>
          {idx && (
            <>
              <p className="inv-big">{idx.total}</p>
              <p className="small muted">Propuesta {data.cfg.aprobado ? 'aprobada' : 'pendiente de aprobación'}: no cambia la prioridad oficial.</p>
              <ul className="small inv-mini-list">
                {Object.entries(idx.partes)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <li key={k}>
                      {PESO_LABELS[k as keyof typeof PESO_LABELS]}: {v}
                    </li>
                  ))}
              </ul>
            </>
          )}
          {misAlertas.length > 0 && (
            <>
              <h3>Alertas</h3>
              <ul className="inv-mini-list">
                {misAlertas.map((a) => (
                  <li key={a.id}>
                    <SeverityChip s={a.severidad} /> {a.causa}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {dialog === 'kpi' && (
        <RecordModal
          title="Vincular KPI"
          subtitle={p.nombre}
          collection="projectKpis"
          fields={[
            {
              key: 'kpiId',
              label: 'KPI',
              type: 'select',
              options: kpiOptions,
              required: true,
              full: true,
            },
            {
              key: 'contribucion',
              label: 'Contribución',
              type: 'select',
              options: [
                {
                  value: 'directa',
                  label: 'Directa (el proyecto mueve el indicador)',
                },
                {
                  value: 'indirecta',
                  label: 'Indirecta (contribuye junto con otros)',
                },
              ],
            },
            { key: 'nota', label: 'Nota', type: 'text', optional: true },
          ]}
          initial={{
            kpiId: kpiOptions[0]?.value ?? '',
            contribucion: 'directa',
          }}
          toInput={(v) => ({
            projectId: p.id,
            kpiId: v.kpiId,
            contribucion: v.contribucion,
            nota: toStr(v.nota),
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'area' && (
        <RecordModal
          title="Gerencia colaboradora"
          subtitle={p.nombre}
          collection="projectAreas"
          fields={[
            {
              key: 'areaId',
              label: 'Gerencia',
              type: 'select',
              options: db.areas.filter((a) => a.id !== p.areaId).map((a) => ({ value: a.id, label: a.nombre })),
              required: true,
            },
            { key: 'rol', label: 'Qué aporta', type: 'text', required: true },
          ]}
          initial={{
            areaId: db.areas.find((a) => a.id !== p.areaId)?.id ?? '',
            rol: '',
          }}
          toInput={(v) => ({
            projectId: p.id,
            areaId: v.areaId,
            rol: String(v.rol ?? '').trim() || 'Colabora',
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'asignacion' && (
        <RecordModal
          title="Asignar partida al proyecto"
          subtitle={p.nombre}
          collection="budgetAllocations"
          fields={[
            {
              key: 'lineaId',
              label: 'Partida',
              type: 'select',
              options: data.budgetFull.lines.map((l) => ({
                value: l.line.id,
                label: `${l.line.clave} · ${l.line.nombre} (sin asignar ${money(l.sinAsignar)})`,
              })),
              required: true,
              full: true,
            },
            {
              key: 'monto',
              label: 'Monto (MXN)',
              type: 'number',
              required: true,
            },
            {
              key: 'estado',
              label: 'Estado',
              type: 'select',
              options: VALIDACION_OPTIONS,
            },
            { key: 'nota', label: 'Nota', type: 'text', optional: true },
          ]}
          initial={{
            lineaId: db.budgetLines[0]?.id ?? '',
            estado: 'CONFIRMADO',
          }}
          toInput={(v) => ({
            projectId: p.id,
            lineaId: v.lineaId,
            monto: toNum(v.monto),
            estado: v.estado,
            nota: toStr(v.nota),
          })}
          onClose={() => setDialog(null)}
        />
      )}
    </Section>
  );
}
