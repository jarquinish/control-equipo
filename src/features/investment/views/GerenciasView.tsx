import { operationalKpis } from '../../../domain/investment/kpis';
import { isActiveProject, personName } from '../../../domain/selectors';
import { useApp } from '../../../state/app';
import { Link } from '../../../state/router';
import { AreaDot } from '../../../ui/badges';
import { Section } from '../../../ui/common';
import { money, num, type InvestmentData } from '../shared';

/**
 * Desempeño por gerencia. Cada gerencia tiene funciones distintas: se muestran
 * varias dimensiones lado a lado, sin un índice único ni un ranking.
 */
export function GerenciasView({ data, areaId }: { data: InvestmentData; areaId: string }) {
  const { db, kpis, projInv, alerts, budgetFull } = data;
  const { now } = useApp();
  const areas = db.areas.filter((a) => a.activo && (!areaId || a.id === areaId)).sort((a, b) => a.orden - b.orden);

  const rows = areas.map((a) => {
    const projects = db.projects.filter((p) => p.areaId === a.id);
    const colabora = db.projectAreas.filter((x) => x.areaId === a.id).map((x) => x.projectId);
    const active = projects.filter(isActiveProject);
    const cls = (c: string) => active.filter((p) => p.clasif?.integrada === c).length;
    const op = operationalKpis(db, now, a.id);
    const v = (clave: string) => op.find((o) => o.clave === clave)?.valor ?? null;
    const evals = kpis.filter((k) => k.kpi.areaIds.includes(a.id));
    const invProyectos = active.reduce((s, p) => s + (projInv.get(p.id)?.asignado ?? 0), 0);
    const lineas = budgetFull.lines.filter((l) => l.line.areaId === a.id);
    return {
      a,
      responsable: personName(db.people, a.responsable, 'Sin responsable'),
      activos: active.length,
      colabora: colabora.length,
      p1c: cls('P1C'),
      p1u: cls('P1U'),
      p1e: cls('P1E'),
      bloqueados: active.filter((p) => p.bloqueado).length,
      retrasados: v('F-RETR'),
      cumplimiento: v('F-CUMP'),
      bloqueosAbiertos: v('F-BLOQ'),
      kpis: evals.length,
      conResultado: evals.filter((k) => k.real !== null).length,
      conMeta: evals.filter((k) => k.meta !== null).length,
      cumplidos: evals.filter((k) => k.estado === 'cumplido').length,
      riesgo: evals.filter((k) => k.estado === 'en_riesgo' || k.estado === 'debajo').length,
      invProyectos,
      lineasVigente: lineas.reduce((s, l) => s + l.vigente, 0),
      lineasEjercido: lineas.reduce((s, l) => s + l.ejercido, 0),
      alertas: alerts.filter((x) => x.areaId === a.id),
      sinKpi: active.filter((p) => !db.projectKpis.some((l) => l.projectId === p.id)).length,
    };
  });

  return (
    <div className="stack">
      <p className="alert alert-blue small">
        Cada gerencia tiene funciones distintas (contenido, diseño, demanda digital, tienda): se comparan dimensiones por separado, sin un índice único ni un ranking. El volumen de pendientes no
        califica el desempeño individual.
      </p>
      <Section title="Comparativo por gerencia">
        <div className="table-wrap">
          <table className="table table-compact inv-compare">
            <thead>
              <tr>
                <th scope="col">Dimensión</th>
                {rows.map((r) => (
                  <th key={r.a.id} scope="col">
                    <Link to={`/areas/${r.a.id}`}>
                      <AreaDot color={r.a.color} name={r.a.nombre} />
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Responsable" rows={rows} f={(r) => r.responsable} />
              <Group label="Operación y prioridades" n={rows.length} />
              <Row label="Proyectos activos" rows={rows} f={(r) => `${r.activos}${r.colabora ? ` (+${r.colabora} en colaboración)` : ''}`} />
              <Row label="P1 Crítico / Urgente / Estratégico" rows={rows} f={(r) => `${r.p1c} / ${r.p1u} / ${r.p1e}`} />
              <Row label="Proyectos bloqueados" rows={rows} f={(r) => r.bloqueados} warn={(r) => r.bloqueados > 0} />
              <Row label="Proyectos retrasados" rows={rows} f={(r) => num(r.retrasados)} warn={(r) => (r.retrasados ?? 0) > 0} />
              <Row label="Cumplimiento de compromisos" rows={rows} f={(r) => (r.cumplimiento === null ? 'Sin compromisos cerrados' : `${num(r.cumplimiento, 1)}%`)} />
              <Group label="KPIs y resultados" n={rows.length} />
              <Row label="KPIs a su cargo" rows={rows} f={(r) => r.kpis} />
              <Row label="Con resultado / con meta" rows={rows} f={(r) => `${r.conResultado} / ${r.conMeta}`} />
              <Row label="Cumplidos / en riesgo o debajo" rows={rows} f={(r) => `${r.cumplidos} / ${r.riesgo}`} warn={(r) => r.riesgo > 0} />
              <Row label="Proyectos activos sin KPI" rows={rows} f={(r) => r.sinKpi} warn={(r) => r.sinKpi > 0} link={(r) => `/inversion?vista=proyectos&area=${r.a.id}&sinkpi=1`} />
              <Group label="Inversión" n={rows.length} />
              <Row label="Presupuesto asignado a sus proyectos" rows={rows} f={(r) => money(r.invProyectos)} />
              <Row label="Partidas a su cargo (vigente / ejercido)" rows={rows} f={(r) => (r.lineasVigente ? `${money(r.lineasVigente)} / ${money(r.lineasEjercido)}` : 'Sin partidas asignadas')} />
              <Group label="Riesgos" n={rows.length} />
              <Row
                label="Alertas (alta / media / baja)"
                rows={rows}
                f={(r) =>
                  `${r.alertas.filter((x) => x.severidad === 'alta').length} / ${r.alertas.filter((x) => x.severidad === 'media').length} / ${r.alertas.filter((x) => x.severidad === 'baja').length}`
                }
                link={(r) => `/inversion?vista=decisiones&area=${r.a.id}`}
              />
              <Row label="Bloqueos abiertos" rows={rows} f={(r) => num(r.bloqueosAbiertos)} />
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

type R = { a: { id: string } };
function Row<T extends R>({ label, rows, f, warn, link }: { label: string; rows: T[]; f: (r: T) => string | number; warn?: (r: T) => boolean; link?: (r: T) => string }) {
  return (
    <tr>
      <th scope="row" className="small">
        {label}
      </th>
      {rows.map((r) => (
        <td key={r.a.id} className={warn?.(r) ? 'warn-text' : undefined}>
          {link ? <Link to={link(r)}>{f(r)}</Link> : f(r)}
        </td>
      ))}
    </tr>
  );
}
function Group({ label, n }: { label: string; n: number }) {
  return (
    <tr className="inv-group">
      <th scope="rowgroup" colSpan={n + 1}>
        {label}
      </th>
    </tr>
  );
}
