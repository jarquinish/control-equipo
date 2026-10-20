import { useMemo } from 'react';
import { Download, Layers, Plus } from 'lucide-react';
import { attentionItems, computeAlerts } from '../../domain/alerts';
import { PRIORITIES, PROJECT_STATUSES, QUADRANT_LABELS, QUADRANTS } from '../../domain/constants';
import { fmtDate, toISODate } from '../../domain/dates';
import { attentionOrder, CLASIFICACION_LABELS, CLASIFICACIONES } from '../../domain/priority';
import { dependencyLabel, isActiveProject, isOverdue, personName, sortProjectsByPriority } from '../../domain/selectors';
import type { Clasificacion, Project } from '../../domain/types';
import { useApp, useCanEdit, useDb, useSettings, useWeekData } from '../../state/app';
import { Link, navigate, useQuery } from '../../state/router';
import { AreaDot, AxisBadge, BlockedChip, ClassBadge, LockBadge, PriorityBadge, ProjectStatusChip, QuadrantChip } from '../../ui/badges';
import { downloadFile, EmptyState, PageHeader } from '../../ui/common';
import { projectsCsv } from '../../services/exportService';
import { useModals } from '../modals/ModalHost';

export function ProjectsPage() {
  const db = useDb();
  const canEdit = useCanEdit();
  const data = useWeekData();
  const settings = useSettings();
  const { now } = useApp();
  const modals = useModals();
  const [q, setQ] = useQuery();

  const f = {
    texto: q.get('q') ?? '',
    area: q.get('area') ?? '',
    responsable: q.get('responsable') ?? '',
    prioridad: q.get('prioridad') ?? '',
    clasif: q.get('clasif') ?? '',
    est: q.get('est') ?? '',
    op: q.get('op') ?? '',
    estado: q.get('estado') ?? 'activos',
    bloqueado: q.get('bloqueado') ?? '',
    eisenhower: q.get('eisenhower') ?? '',
    dependencia: q.get('dependencia') ?? '',
    vencido: q.get('vencido') ?? '',
    atencion: q.get('atencion') ?? '',
  };
  const filtersOn = Object.entries(f).some(([k, v]) => (k === 'estado' ? v !== 'activos' : !!v));

  const { rows, order } = useMemo(() => {
    if (!data) return { rows: [] as Project[], order: new Map<string, { posicion: number; nivel: number; desatendido: boolean }>() };
    const ref = data.live ? now : data.asOf;
    const base: Project[] = data.live && (f.estado === 'archivado' || f.estado === 'todos') ? db.projects : data.projects;
    const attention = f.atencion ? new Set(attentionItems(data, computeAlerts(db, data, ref)).map((i) => i.project.id)) : null;
    const t = f.texto.toLowerCase();
    const order = attentionOrder(db, base.filter(isActiveProject), toISODate(ref), settings.criteria.diasDesatendido);
    const cls = (p: Project): Clasificacion | undefined => p.clasif?.integrada;
    const rows = base
      .filter((p) => {
        if (t && !`${p.nombre} ${p.descripcion}`.toLowerCase().includes(t)) return false;
        if (f.area && p.areaId !== f.area) return false;
        if (f.responsable && p.responsable !== f.responsable) return false;
        if (f.prioridad && p.prioridadFinal !== f.prioridad) return false;
        if (f.clasif && (f.clasif === 'P1' ? !cls(p)?.startsWith('P1') : cls(p) !== f.clasif)) return false;
        if (f.est && p.clasif?.estrategica !== f.est) return false;
        if (f.op && p.clasif?.operativa !== f.op) return false;
        if (f.estado === 'activos' && !isActiveProject(p)) return false;
        if (f.estado !== 'activos' && f.estado !== 'todos' && p.estado !== f.estado) return false;
        if (f.bloqueado === '1' && !p.bloqueado) return false;
        if (f.bloqueado === '0' && p.bloqueado) return false;
        if (f.eisenhower && p.eisenhower !== f.eisenhower) return false;
        if (f.dependencia && (f.dependencia.length === 1 ? String(p.dependencia) !== f.dependencia : p.dependeDe !== f.dependencia)) return false;
        if (f.vencido && !data.commitments.some((c) => c.projectId === p.id && isOverdue(c, ref))) return false;
        if (attention && !attention.has(p.id)) return false;
        return true;
      })
      .sort((a, b) => (order.get(a.id)?.posicion ?? 1e9) - (order.get(b.id)?.posicion ?? 1e9) || sortProjectsByPriority(a, b));
    return { rows, order };
  }, [db, data, now, settings.criteria.diasDesatendido, f.texto, f.area, f.responsable, f.prioridad, f.clasif, f.est, f.op, f.estado, f.bloqueado, f.eisenhower, f.dependencia, f.vencido, f.atencion]);

  if (!data) return null;
  const responsables = db.people.filter((p) => db.projects.some((x) => x.responsable === p.id));
  const depKeys = [...new Set(db.projects.map((p) => p.dependeDe).filter(Boolean) as string[])];

  return (
    <div className="page">
      <PageHeader
        title="Proyectos"
        subtitle="No reportamos actividades. Trabajamos sobre proyectos."
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => downloadFile('proyectos.csv', projectsCsv(db, now), 'text/csv;charset=utf-8')}>
              <Download size={16} aria-hidden /> CSV
            </button>
            {!data.readOnly && canEdit && (
              <button className="btn btn-primary" onClick={() => modals.open({ type: 'project', areaId: f.area || undefined })}>
                <Plus size={16} aria-hidden /> Nuevo proyecto
              </button>
            )}
          </>
        }
      />

      <div className="filters card" role="search" aria-label="Filtros de proyectos">
        <input className="input" type="search" placeholder="Buscar proyecto…" aria-label="Buscar proyecto" value={f.texto} onChange={(e) => setQ({ q: e.target.value })} />
        <select className="input" aria-label="Área" value={f.area} onChange={(e) => setQ({ area: e.target.value })}>
          <option value="">Todas las áreas</option>
          {db.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Responsable" value={f.responsable} onChange={(e) => setQ({ responsable: e.target.value })}>
          <option value="">Todos los responsables</option>
          {responsables.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Clasificación" value={f.clasif} onChange={(e) => setQ({ clasif: e.target.value })}>
          <option value="">Clasificación: todas</option>
          <option value="P1">Todos los P1</option>
          {CLASIFICACIONES.map((c) => (
            <option key={c} value={c}>
              {CLASIFICACION_LABELS[c]}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Prioridad estratégica" value={f.est} onChange={(e) => setQ({ est: e.target.value })}>
          <option value="">Estratégica: todas</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              Estratégica {p}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Prioridad operativa" value={f.op} onChange={(e) => setQ({ op: e.target.value })}>
          <option value="">Operativa: todas</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              Operativa {p}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Estado" value={f.estado} onChange={(e) => setQ({ estado: e.target.value === 'activos' ? undefined : e.target.value })}>
          <option value="activos">Activos</option>
          <option value="todos">Todos</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {settings.statusLabels[s]}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Bloqueado" value={f.bloqueado} onChange={(e) => setQ({ bloqueado: e.target.value })}>
          <option value="">Bloqueado: todos</option>
          <option value="1">Sólo bloqueados</option>
          <option value="0">Sin bloqueo</option>
        </select>
        <select className="input" aria-label="Eisenhower" value={f.eisenhower} onChange={(e) => setQ({ eisenhower: e.target.value })}>
          <option value="">Eisenhower: todos</option>
          {QUADRANTS.map((x) => (
            <option key={x} value={x}>
              {QUADRANT_LABELS[x]}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Dependencia" value={f.dependencia} onChange={(e) => setQ({ dependencia: e.target.value })}>
          <option value="">Dependencia: todas</option>
          <option value="1">Nivel 1 · autónomo</option>
          <option value="2">Nivel 2 · otra área</option>
          <option value="3">Nivel 3 · varias / Dirección / tercero</option>
          {depKeys.map((k) => (
            <option key={k} value={k}>
              Depende de {dependencyLabel(db, k)}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={!!f.vencido} onChange={(e) => setQ({ vencido: e.target.checked ? '1' : undefined })} /> Con vencidos
        </label>
        {filtersOn && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/proyectos', { replace: true })}>
            Limpiar filtros
          </button>
        )}
      </div>

      <p className="result-count" aria-live="polite">
        {rows.length} proyecto{rows.length === 1 ? '' : 's'}
        {f.atencion && ' que requieren atención'}
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={<Layers size={32} />} title={filtersOn ? 'Ningún proyecto coincide con los filtros' : 'Aún no hay proyectos'}>
          {filtersOn ? 'Ajusta o limpia los filtros.' : 'Cada área registra aquí sus proyectos principales.'}
        </EmptyState>
      ) : (
        <div className="table-wrap card">
          <table className="table table-hover">
            <thead>
              <tr>
                <th scope="col" className="num" title="Orden de atención recomendado">
                  Orden
                </th>
                <th scope="col">Clasificación</th>
                <th scope="col" title="Prioridad estratégica">
                  E
                </th>
                <th scope="col" title="Prioridad operativa (urgente)">
                  O
                </th>
                <th scope="col">Proyecto</th>
                <th scope="col">Área</th>
                <th scope="col">Responsable</th>
                <th scope="col" className="num">Score</th>
                <th scope="col">Eisenhower</th>
                <th scope="col">Estado</th>
                <th scope="col">Depende de</th>
                <th scope="col">Fecha objetivo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const area = db.areas.find((a) => a.id === p.areaId);
                const c = p.clasif;
                const o = order.get(p.id);
                return (
                  <tr key={p.id} onClick={() => navigate(`/proyectos/${p.id}`)} className={`clickable ${c?.integrada === 'P1C' ? 'row-critico' : ''}`} data-testid="project-row" data-clasif={c?.integrada}>
                    <td className="num" title={o ? `Nivel ${o.nivel}${o.desatendido ? ' · P1 Estratégico desatendido' : ''}` : undefined}>
                      {o ? <strong>{o.posicion}</strong> : '—'}
                      {o?.desatendido && <span className="small block warn-text">desatendido</span>}
                    </td>
                    <td>{c ? <ClassBadge c={c.integrada} /> : <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />}</td>
                    <td>{c && <AxisBadge eje="estrategica" p={c.estrategica} direccion={c.fuenteEstrategica === 'direccion'} />}</td>
                    <td>{c && <AxisBadge eje="operativa" p={c.operativa} direccion={c.fuenteOperativa === 'direccion'} />}</td>
                    <td>
                      <Link to={`/proyectos/${p.id}`} className="cell-title" onClick={(e) => e.stopPropagation()}>
                        {p.nombre}
                      </Link>
                      {p.bloqueado && (
                        <span className="ml-1">
                          <BlockedChip />
                        </span>
                      )}
                      {p.acuerdo?.bloqueado && (
                        <span className="ml-1">
                          <LockBadge />
                        </span>
                      )}
                      {c && (c.candidatoP1 || c.porValidar.length > 0 || p.notaRevalidar) && (
                        <span className="small warn-text block" title={c.avisos.join(' ')}>
                          {[c.candidatoP1 && !p.prioridadDireccion?.estrategica ? 'Candidato a P1' : '', c.porValidar.length ? 'Vínculo por validar' : '', p.notaRevalidar ? 'Por revalidar' : ''].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {p.descripcion && <span className="small muted block clamp-1">{p.descripcion}</span>}
                    </td>
                    <td>{area && <AreaDot color={area.color} name={area.nombre} />}</td>
                    <td>{personName(db.people, p.responsable)}</td>
                    <td className="num" title={`Impacto ${p.impacto} + Urgencia ${p.urgencia} + Dependencia ${p.dependencia}`}>
                      <strong>{p.score}</strong>
                      <span className="small muted block">
                        {p.impacto}+{p.urgencia}+{p.dependencia}
                      </span>
                    </td>
                    <td>
                      <QuadrantChip q={p.eisenhower} />
                    </td>
                    <td>
                      <ProjectStatusChip status={p.estado} />
                    </td>
                    <td>{p.dependeDe ? dependencyLabel(db, p.dependeDe) : '—'}</td>
                    <td className="nowrap">{fmtDate(p.fechaObjetivo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
