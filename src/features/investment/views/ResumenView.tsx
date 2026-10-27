import { AlertTriangle, ArrowRight } from 'lucide-react';
import { KPI_ESTADO_LABELS } from '../../../domain/investment/kpis';
import { isActiveProject } from '../../../domain/selectors';
import { Link } from '../../../state/router';
import { Chip } from '../../../ui/badges';
import { KpiCard, Section } from '../../../ui/common';
import { Bar, money, moneyShort, num, pct, valueWithUnit, ValidChip, type InvestmentData, type PeriodOption } from '../shared';
import { KpiEstadoChip, SeverityChip } from './chips';

export function ResumenView({ data, areaId, periodo }: { data: InvestmentData; areaId: string; periodo: PeriodOption }) {
  const { db, budget, budgetFull, kpis, scopes, alerts } = data;
  const t = budget.totales;
  const vig = budgetFull.totales.vigente;
  const projects = db.projects.filter((p) => isActiveProject(p) && (!areaId || p.areaId === areaId));
  const p1 = projects.filter((p) => (p.clasif ? ['P1C', 'P1U', 'P1E'].includes(p.clasif.integrada) : p.prioridadFinal === 'P1'));
  const bloqueados = projects.filter((p) => p.bloqueado);
  const evals = kpis.filter((k) => !areaId || k.kpi.areaIds.includes(areaId));
  const cumplidos = evals.filter((k) => k.estado === 'cumplido');
  const riesgo = evals.filter((k) => k.estado === 'en_riesgo' || k.estado === 'debajo');
  const conMeta = evals.filter((k) => k.meta !== null);
  const conResultado = evals.filter((k) => k.real !== null);
  const metricas = scopes.filter((s) => !areaId || s.scope.areaId === areaId).flatMap((s) => s.metrics.filter((m) => m.valor !== null).map((m) => ({ s, m })));
  const top = [...alerts]
    .filter((a) => !areaId || a.areaId === areaId || !a.areaId)
    .sort((a, b) => ['alta', 'media', 'baja'].indexOf(a.severidad) - ['alta', 'media', 'baja'].indexOf(b.severidad))
    .slice(0, 6);

  return (
    <div className="stack">
      <div className="kpis kpis-6">
        <KpiCard
          label="Presupuesto anual vigente"
          value={moneyShort(vig)}
          hint={`${money(vig)} · inicial ${money(budgetFull.totales.original)} + ampliaciones ${money(budgetFull.totales.ampliaciones)}`}
          to="/inversion?vista=presupuesto"
        />
        <KpiCard
          label="Ejercido"
          value={moneyShort(t.ejercido)}
          hint={budget.corte ? `${money(t.ejercido, true)} · contable al ${budget.corte}` : 'Sin gasto registrado'}
          tone="brand"
          to="/inversion?vista=presupuesto"
        />
        <KpiCard label="Ejecución" value={pct(vig ? t.ejercido / vig : null)} hint={`Comprometido ${money(t.comprometido)}`} tone={vig && t.ejercido > vig ? 'red' : 'default'} />
        <KpiCard label="Proyectos activos" value={projects.length} to="/inversion?vista=proyectos" />
        <KpiCard label="Prioritarios (P1)" value={p1.length} tone={p1.length ? 'yellow' : 'default'} to="/proyectos?clasif=P1" />
        <KpiCard label="Bloqueados" value={bloqueados.length} tone={bloqueados.length ? 'red' : 'green'} to="/bloqueos" />
        <KpiCard
          label="KPIs cumplidos"
          value={`${cumplidos.length} / ${conMeta.length}`}
          hint={conMeta.length ? 'Con meta en el periodo' : 'Aún no hay metas registradas'}
          tone="green"
          to="/inversion?vista=kpis&estado=cumplido"
        />
        <KpiCard label="KPIs en riesgo o debajo" value={riesgo.length} tone={riesgo.length ? 'red' : 'default'} to="/inversion?vista=kpis&estado=riesgo" />
        <KpiCard label="KPIs con resultado" value={`${conResultado.length} / ${evals.length}`} hint="Del catálogo activo" to="/inversion?vista=kpis" />
        <KpiCard label="Indicadores de eficiencia calculables" value={metricas.length} hint="CPL, costo por MQL/SQL/cierre…" to="/inversion?vista=eficiencia" />
        <KpiCard
          label="Alertas altas"
          value={alerts.filter((a) => a.severidad === 'alta').length}
          tone={alerts.some((a) => a.severidad === 'alta') ? 'red' : 'green'}
          to="/inversion?vista=decisiones"
        />
        <KpiCard
          label="Partidas sobreejercidas"
          value={budgetFull.lines.filter((l) => l.semaforo === 'sobre').length}
          tone={budgetFull.lines.some((l) => l.semaforo === 'sobre') ? 'red' : 'green'}
          to="/inversion?vista=presupuesto"
        />
      </div>

      <div className="two-col">
        <Section
          title="Alertas para decidir"
          actions={
            <Link to="/inversion?vista=decisiones" className="btn btn-ghost btn-sm">
              Centro de decisiones <ArrowRight size={14} aria-hidden />
            </Link>
          }
        >
          {top.length ? (
            <ul className="inv-alert-list">
              {top.map((a) => (
                <li key={a.id}>
                  <SeverityChip s={a.severidad} />
                  <div>
                    {a.link ? <Link to={a.link}>{a.titulo}</Link> : <strong>{a.titulo}</strong>}
                    <span className="small muted block">{a.causa}</span>
                    <span className="small block">
                      <strong>Siguiente acción:</strong> {a.accion}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Sin alertas.</p>
          )}
        </Section>

        <Section title={`Resultados principales · ${periodo.label}`}>
          {conResultado.length ? (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th scope="col">KPI</th>
                    <th scope="col" className="num">
                      Resultado
                    </th>
                    <th scope="col">Periodo</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {conResultado.slice(0, 10).map((k) => (
                    <tr key={k.kpi.id}>
                      <td>
                        <Link to={`/inversion?vista=kpis&kpi=${k.kpi.id}`}>{k.kpi.nombre}</Link>
                      </td>
                      <td className="num">{valueWithUnit(k.real, k.kpi.unidad)}</td>
                      <td className="small">{k.periodo?.etiqueta ?? `${k.periodo?.inicio ?? ''} – ${k.periodo?.fin ?? ''}`}</td>
                      <td>{k.meta !== null ? <KpiEstadoChip e={k.estado} /> : k.pendienteValidacion ? <ValidChip estado="PENDIENTE" /> : <Chip>{KPI_ESTADO_LABELS[k.estado]}</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Sin resultados en el periodo.</p>
          )}
          {!conMeta.length && conResultado.length > 0 && (
            <p className="alert alert-yellow small">
              <AlertTriangle size={14} aria-hidden /> Hay resultados, pero aún no hay metas registradas: el sistema no califica cumplimiento hasta que Dirección defina metas por periodo.
            </p>
          )}
        </Section>
      </div>

      <Section title="Ejecución por partida (vigente vs. ejercido)">
        <div className="inv-exec-grid">
          {budget.lines
            .filter((l) => l.vigente > 0 || l.ejercido > 0)
            .map((l) => (
              <Link key={l.line.id} to={`/inversion?vista=presupuesto&partida=${l.line.id}`} className="inv-exec-row">
                <span className="inv-exec-name">{l.line.nombre}</span>
                <Bar
                  value={l.ejercido}
                  max={Math.max(l.vigente, l.ejercido)}
                  tone={l.semaforo === 'sobre' ? 'red' : l.semaforo === 'revolvente' ? 'yellow' : l.semaforo === 'sin_ejercer' ? 'gray' : 'brand'}
                />
                <span className="inv-exec-num small">
                  {money(l.ejercido)} / {money(l.vigente)} · {pct(l.ejecucion, 0)}
                </span>
              </Link>
            ))}
        </div>
        {budget.sinPartida.length > 0 && <p className="small warn-text">Gasto sin partida: {budget.sinPartida.map((s) => `${s.categoria} ${money(s.monto)}`).join(' · ')}</p>}
        <p className="small muted">
          {num(budget.meses.length)} mes(es) de gasto contable · el presupuesto es anual; el gasto, acumulado al corte. Las reclasificaciones pendientes no se aplican al gasto oficial.
        </p>
      </Section>
    </div>
  );
}
