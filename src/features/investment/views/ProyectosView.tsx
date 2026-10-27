import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { CLASIFICACION_LABELS, CLASIFICACIONES } from '../../../domain/priority';
import { isActiveProject, isOpenCommitment, personName, sortByDeadline, sortProjectsByPriority } from '../../../domain/selectors';
import { useSettings } from '../../../state/app';
import { Link, useQuery } from '../../../state/router';
import { ClassBadge, PriorityBadge, ProjectStatusChip } from '../../../ui/badges';
import { downloadFile, Section } from '../../../ui/common';
import { money, num, toCsv, type InvestmentData } from '../shared';
import { PESO_LABELS } from '../../../domain/investment/priorityIndex';

export function ProyectosView({ data, areaId }: { data: InvestmentData; areaId: string }) {
  const { db, projInv, prio, alerts, kpis, cfg } = data;
  const settings = useSettings();
  const [q, setQ] = useQuery();
  const f = {
    texto: q.get('q') ?? '',
    clasif: q.get('clasif') ?? '',
    sinkpi: q.get('sinkpi') === '1',
    inv: q.get('inv') ?? '',
    orden: q.get('orden') ?? 'prioridad',
    estado: q.get('estado') ?? 'activos',
  };
  const evalByKpi = new Map(kpis.map((k) => [k.kpi.id, k]));
  const kpiName = new Map(db.kpis.map((k) => [k.id, k]));

  const rows = useMemo(() => {
    const t = f.texto.toLowerCase();
    return db.projects
      .filter((p) => (f.estado === 'activos' ? isActiveProject(p) : f.estado === 'todos' ? true : p.estado === f.estado))
      .filter((p) => !areaId || p.areaId === areaId || db.projectAreas.some((x) => x.projectId === p.id && x.areaId === areaId))
      .filter((p) => !t || p.nombre.toLowerCase().includes(t) || (p.ref ?? '').toLowerCase().includes(t))
      .filter((p) => !f.clasif || (f.clasif === 'P1' ? ['P1C', 'P1U', 'P1E'].includes(p.clasif?.integrada ?? '') : p.clasif?.integrada === f.clasif))
      .filter((p) => !f.sinkpi || !db.projectKpis.some((l) => l.projectId === p.id))
      .filter((p) => (f.inv === 'con' ? (projInv.get(p.id)?.asignado ?? 0) > 0 : f.inv === 'sin' ? !(projInv.get(p.id)?.asignado ?? 0) : true))
      .map((p) => {
        const links = db.projectKpis.filter((l) => l.projectId === p.id);
        const commits = db.commitments.filter((c) => c.projectId === p.id);
        const cerrados = commits.filter((c) => c.estado === 'cumplido').length;
        const next = commits.filter(isOpenCommitment).sort(sortByDeadline)[0];
        const inv = projInv.get(p.id);
        const resultados = links.reduce((s, l) => s + db.results.filter((r) => r.kpiId === l.kpiId).length, 0);
        return {
          p,
          links,
          avance: commits.length ? `${cerrados}/${commits.length}` : '—',
          next,
          inv,
          resultados,
          alertas: alerts.filter((a) => a.projectId === p.id).length,
          kpiEstados: links.map((l) => evalByKpi.get(l.kpiId)?.estado).filter(Boolean),
          indice: prio.get(p.id),
        };
      })
      .sort((a, b) =>
        f.orden === 'indice' ? (b.indice?.total ?? 0) - (a.indice?.total ?? 0) : f.orden === 'inversion' ? (b.inv?.asignado ?? 0) - (a.inv?.asignado ?? 0) : sortProjectsByPriority(a.p, b.p),
      );
  }, [db, areaId, f.texto, f.clasif, f.sinkpi, f.inv, f.orden, f.estado, projInv, alerts, prio, evalByKpi]);

  const exportCsv = () =>
    downloadFile(
      'matriz-vinculacion-proyectos.csv',
      toCsv(
        [
          'Proyecto',
          'ID origen',
          'Gerencia',
          'Gerencias colaboradoras',
          'Responsable',
          'Clasificación',
          'Estado',
          'Partidas (monto asignado)',
          'Asignado',
          'Comprometido',
          'Ejercido (con detalle)',
          'KPIs vinculados',
          'Resultados de sus KPIs',
          'Índice complementario',
        ],
        rows.map((r) => [
          r.p.nombre,
          r.p.ref,
          db.areas.find((a) => a.id === r.p.areaId)?.nombre,
          db.projectAreas
            .filter((x) => x.projectId === r.p.id)
            .map((x) => db.areas.find((a) => a.id === x.areaId)?.nombre)
            .join(' | '),
          personName(db.people, r.p.responsable, ''),
          r.p.clasif ? CLASIFICACION_LABELS[r.p.clasif.integrada] : r.p.prioridadFinal,
          settings.statusLabels[r.p.estado],
          (r.inv?.lineas ?? []).map((l) => `${db.budgetLines.find((x) => x.id === l.lineaId)?.nombre} ${l.monto}`).join(' | '),
          r.inv?.asignado ?? 0,
          r.inv?.comprometido ?? 0,
          r.inv?.ejercido ?? 0,
          r.links.map((l) => kpiName.get(l.kpiId)?.clave).join(' | '),
          r.resultados,
          r.indice?.total,
        ]),
      ),
      'text/csv;charset=utf-8',
    );

  return (
    <div className="stack">
      <div className="filters card" aria-label="Filtros de proyectos">
        <input className="input" type="search" placeholder="Buscar proyecto…" aria-label="Buscar proyecto" value={f.texto} onChange={(e) => setQ({ q: e.target.value })} />
        <select className="input" aria-label="Clasificación" value={f.clasif} onChange={(e) => setQ({ clasif: e.target.value })}>
          <option value="">Clasificación: todas</option>
          <option value="P1">Todos los P1</option>
          {CLASIFICACIONES.map((c) => (
            <option key={c} value={c}>
              {CLASIFICACION_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Estado"
          value={f.estado}
          onChange={(e) =>
            setQ({
              estado: e.target.value === 'activos' ? undefined : e.target.value,
            })
          }
        >
          <option value="activos">Activos</option>
          <option value="todos">Todos</option>
          <option value="completado">Completados</option>
        </select>
        <select className="input" aria-label="Inversión" value={f.inv} onChange={(e) => setQ({ inv: e.target.value })}>
          <option value="">Inversión: todos</option>
          <option value="con">Con presupuesto asignado</option>
          <option value="sin">Sin presupuesto asignado</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={f.sinkpi} onChange={(e) => setQ({ sinkpi: e.target.checked ? '1' : undefined })} /> Sólo sin KPI
        </label>
        <select
          className="input"
          aria-label="Orden"
          value={f.orden}
          onChange={(e) =>
            setQ({
              orden: e.target.value === 'prioridad' ? undefined : e.target.value,
            })
          }
        >
          <option value="prioridad">Orden: prioridad oficial</option>
          <option value="indice">Orden: índice complementario (propuesta)</option>
          <option value="inversion">Orden: presupuesto asignado</option>
        </select>
        <button className="btn btn-secondary" onClick={exportCsv}>
          <Download size={16} aria-hidden /> Matriz CSV
        </button>
      </div>

      <Section title={`Proyectos e inversión · ${rows.length}`}>
        <div className="table-wrap">
          <table className="table table-hover table-compact">
            <thead>
              <tr>
                <th scope="col">Proyecto</th>
                <th scope="col">Gerencia · responsable</th>
                <th scope="col">Prioridad</th>
                <th scope="col">Estado</th>
                <th scope="col" title="Compromisos cumplidos / total">
                  Avance
                </th>
                <th scope="col" className="num">
                  Presupuesto asignado
                </th>
                <th scope="col" className="num">
                  Gasto registrado
                </th>
                <th scope="col">KPIs</th>
                <th scope="col" className="num">
                  Resultados
                </th>
                <th scope="col" className="num">
                  Alertas
                </th>
                <th
                  scope="col"
                  className="num"
                  title={`Índice complementario (propuesta${cfg.aprobado ? ' aprobada' : ' sin aprobar'}): ${Object.entries(cfg.pesos)
                    .map(([k, w]) => `${PESO_LABELS[k as keyof typeof PESO_LABELS]} ${w}`)
                    .join(' · ')}`}
                >
                  Índice
                </th>
                <th scope="col">Próximo compromiso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id} data-testid="inv-project-row">
                  <td>
                    <Link to={`/proyectos/${r.p.id}`} className="cell-title">
                      {r.p.nombre}
                    </Link>
                    {r.p.descripcion && <span className="small muted block inv-clip">{r.p.descripcion}</span>}
                  </td>
                  <td className="small">
                    {db.areas.find((a) => a.id === r.p.areaId)?.nombre}
                    <span className="block muted">{personName(db.people, r.p.responsable)}</span>
                  </td>
                  <td>{r.p.clasif ? <ClassBadge c={r.p.clasif.integrada} /> : <PriorityBadge p={r.p.prioridadFinal} />}</td>
                  <td>
                    <ProjectStatusChip status={r.p.estado} />
                    {r.p.bloqueado && <span className="small warn-text block">Bloqueado</span>}
                  </td>
                  <td className="small">{r.avance}</td>
                  <td className="num">{r.inv?.asignado ? money(r.inv.asignado) : <span className="muted">—</span>}</td>
                  <td className="num small">
                    {r.inv && (r.inv.comprometido || r.inv.ejercido) ? (
                      `${money(r.inv.ejercido)} ejercido · ${money(r.inv.comprometido)} comprometido`
                    ) : (
                      <span className="muted">Sin gasto vinculado</span>
                    )}
                  </td>
                  <td className="small">
                    {r.links.length ? (
                      r.links.map((l) => (
                        <Link key={l.id} to={`/inversion?vista=kpis&kpi=${l.kpiId}`} className="block">
                          {kpiName.get(l.kpiId)?.clave}
                        </Link>
                      ))
                    ) : (
                      <span className="warn-text">Sin KPI</span>
                    )}
                  </td>
                  <td className="num">{num(r.resultados)}</td>
                  <td className="num">{r.alertas ? <Link to={`/inversion?vista=decisiones`}>{r.alertas}</Link> : '—'}</td>
                  <td className="num">{r.indice?.total ?? '—'}</td>
                  <td className="small">{r.next ? `${r.next.accion} · ${r.next.fecha}` : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          «Gasto registrado» sólo cuenta compromisos de gasto con proyecto identificado: el reporte contable es por categoría y no se reparte entre proyectos por estimación. El índice complementario
          es una propuesta {cfg.aprobado ? 'aprobada por Dirección' : 'pendiente de aprobación'}; no cambia la prioridad oficial.
        </p>
      </Section>
    </div>
  );
}
