import { useMemo } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw } from 'lucide-react';
import { fmtDateTime } from '../../domain/dates';
import { computeKpis } from '../../domain/metrics';
import { areaUpdateFor, dependencyLabel, isActiveProject, isBlockOpen, isOpenCommitment, personName, sortByDeadline, sortProjectsByPriority, type WeekData } from '../../domain/selectors';
import { useApp, useDb, useWeekData } from '../../state/app';
import { Link, navigate } from '../../state/router';
import { BlockedChip, BlockStatusChip, PriorityBadge, ProjectStatusChip } from '../../ui/badges';
import { EmptyState, KpiCard, PageHeader, Section } from '../../ui/common';
import { CommitmentTable } from '../commitments/CommitmentTable';

function areaSlice(data: WeekData, areaId: string) {
  const projects = data.projects.filter((p) => p.areaId === areaId);
  const ids = new Set(projects.map((p) => p.id));
  return {
    ...data,
    projects,
    blocks: data.blocks.filter((b) => ids.has(b.projectId)),
    commitments: data.commitments.filter((c) => ids.has(c.projectId)),
  };
}

export function AreasPage() {
  const db = useDb();
  const data = useWeekData();
  const { now } = useApp();
  if (!data) return null;
  const ref = data.live ? now : data.asOf;
  const areas = [...db.areas].sort((a, b) => a.orden - b.orden);
  return (
    <div className="page">
      <PageHeader title="Áreas" subtitle="Cada área tiene su propio tablero. Contenido · Diseño · Marketing Digital · SOC Store." />
      <div className="area-grid">
        {areas.map((a) => {
          const slice = areaSlice(data, a.id);
          const k = computeKpis(slice, ref);
          const up = areaUpdateFor(data, a.id);
          return (
            <Link key={a.id} to={`/areas/${a.id}`} className={`area-card card ${a.activo ? '' : 'inactive'}`} data-testid="area-card">
              <div className="area-card-head">
                <span className="area-swatch" style={{ background: a.color }} aria-hidden />
                <div>
                  <h2>{a.nombre}</h2>
                  <span className="small muted">{personName(db.people, a.responsable, 'Sin responsable')}</span>
                </div>
                {!a.activo && <span className="chip chip-gray">Inactiva</span>}
              </div>
              <dl className="area-kpis">
                <div>
                  <dt>Proyectos</dt>
                  <dd>{k.proyectosActivos}</dd>
                </div>
                <div>
                  <dt>P1</dt>
                  <dd>{k.p1}</dd>
                </div>
                <div>
                  <dt>Bloqueados</dt>
                  <dd className={k.bloqueados ? 'red' : ''}>{k.bloqueados}</dd>
                </div>
                <div>
                  <dt>Compromisos</dt>
                  <dd>{k.compromisosAbiertos}</dd>
                </div>
                <div>
                  <dt>Vencidos</dt>
                  <dd className={k.vencidos ? 'red' : ''}>{k.vencidos}</dd>
                </div>
              </dl>
              <p className={`area-up ${up ? 'ok' : 'warn'}`}>
                {up ? <CheckCircle2 size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
                {up ? `Actualizada ${fmtDateTime(up.completedAt)}` : 'Actualización pendiente'}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AreaDashboard({ id }: { id: string }) {
  const db = useDb();
  const data = useWeekData();
  const { now } = useApp();
  const area = db.areas.find((a) => a.id === id);
  const slice = useMemo(() => (data ? areaSlice(data, id) : null), [data, id]);
  if (!data || !slice) return null;
  if (!area) return <EmptyState title="Área no encontrada" />;
  const ref = data.live ? now : data.asOf;
  const k = computeKpis(slice, ref);
  const up = areaUpdateFor(data, id);
  const projects = slice.projects.filter(isActiveProject).sort(sortProjectsByPriority);
  const commitments = slice.commitments.filter(isOpenCommitment).sort(sortByDeadline);
  const needs = slice.blocks.filter((b) => isBlockOpen(b) && b.areaDependencia);
  const othersNeed = data.blocks.filter((b) => isBlockOpen(b) && b.areaDependencia === id);

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm back" onClick={() => navigate('/areas')}>
        <ArrowLeft size={16} aria-hidden /> Áreas
      </button>
      <PageHeader
        eyebrow={`Semana ${data.week.numero}`}
        title={area.nombre}
        subtitle={`Responsable: ${personName(db.people, area.responsable, 'sin asignar')} · ${up ? `actualizada ${fmtDateTime(up.completedAt)}` : 'actualización pendiente'}`}
        actions={
          data.live && (
            <Link to={`/actualizar?area=${id}`} className="btn btn-primary">
              <RefreshCw size={16} aria-hidden /> Actualizar mi área
            </Link>
          )
        }
      />
      <section className="kpis kpis-6">
        <KpiCard label="Proyectos" value={k.proyectosActivos} to={`/proyectos?area=${id}`} tone="brand" />
        <KpiCard label="P1" value={k.p1} to={`/proyectos?area=${id}&prioridad=P1`} />
        <KpiCard label="Bloqueados" value={k.bloqueados} to={`/bloqueos?area=${id}`} tone={k.bloqueados ? 'red' : 'green'} />
        <KpiCard label="Compromisos" value={k.compromisosAbiertos} to={`/compromisos?area=${id}`} tone="blue" />
        <KpiCard label="Vencidos" value={k.vencidos} to={`/compromisos?area=${id}&estado=vencido`} tone={k.vencidos ? 'red' : 'green'} />
        <KpiCard label="Dependencias" value={needs.length + othersNeed.length} to={`/dependencias?solicitante=${id}`} />
      </section>

      <Section title="Proyectos">
        {projects.length === 0 ? (
          <p className="muted">Sin proyectos activos.</p>
        ) : (
          <ul className="compact-projects">
            {projects.map((p) => (
              <li key={p.id}>
                <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />
                <Link to={`/proyectos/${p.id}`}>{p.nombre}</Link>
                <span className="small muted">score {p.score}</span>
                {p.bloqueado && <BlockedChip />}
                <ProjectStatusChip status={p.estado} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="two-col">
        <Section title="Lo que necesitamos de otros">
          {needs.length === 0 ? (
            <p className="muted">Sin dependencias abiertas.</p>
          ) : (
            <ul className="plain-list">
              {needs.map((b) => (
                <li key={b.id}>
                  <strong>{b.necesidad || b.descripcion}</strong> → {dependencyLabel(db, b.areaDependencia)} <BlockStatusChip status={b.estado} />
                  <span className="small muted block">{db.projects.find((p) => p.id === b.projectId)?.nombre}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Lo que otras áreas necesitan de nosotros">
          {othersNeed.length === 0 ? (
            <p className="muted">Nadie está esperando a {area.nombre}.</p>
          ) : (
            <ul className="plain-list">
              {othersNeed.map((b) => {
                const p = db.projects.find((x) => x.id === b.projectId);
                return (
                  <li key={b.id}>
                    <strong>{b.necesidad || b.descripcion}</strong> · para {db.areas.find((a) => a.id === p?.areaId)?.nombre}
                    <span className="small muted block">{p?.nombre}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Compromisos abiertos">
        {commitments.length === 0 ? <p className="muted">Sin compromisos abiertos.</p> : <CommitmentTable rows={commitments} readOnly={!data.live} asOf={ref} />}
      </Section>
    </div>
  );
}
