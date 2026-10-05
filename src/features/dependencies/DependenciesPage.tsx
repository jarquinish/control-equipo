import { useMemo } from 'react';
import { ArrowRight, GitFork } from 'lucide-react';
import { BLOCK_STATUS_LABELS, BLOCK_STATUSES, PRIORITIES } from '../../domain/constants';
import { fmtDeadline, fmtDate } from '../../domain/dates';
import { blockNextCommitment, dependencyLabel, getWeekData, isBlockOpen, personName, sortWeeks } from '../../domain/selectors';
import { useApp, useDb, useWeekData } from '../../state/app';
import { Link, useQuery } from '../../state/router';
import { AreaDot, BlockStatusChip, PriorityBadge } from '../../ui/badges';
import { EmptyState, PageHeader, Section } from '../../ui/common';

/** QUIÉN NECESITA → QUÉ NECESITA → DE QUIÉN → PARA CUÁNDO */
export function DependenciesPage() {
  const db = useDb();
  const current = useWeekData();
  const { now } = useApp();
  const [q, setQ] = useQuery();
  const f = {
    solicitante: q.get('solicitante') ?? '',
    requerida: q.get('requerida') ?? '',
    semana: q.get('semana') ?? '',
    estado: q.get('estado') ?? 'abiertos',
    prioridad: q.get('prioridad') ?? '',
  };
  const data = f.semana ? getWeekData(db, f.semana, now) : current;
  const ref = data?.live ? now : (data?.asOf ?? now);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.blocks
      .filter((b) => b.areaDependencia || b.dependeDe)
      .map((b) => {
        const p = data.projects.find((x) => x.id === b.projectId) ?? db.projects.find((x) => x.id === b.projectId);
        return { b, p, next: blockNextCommitment(b, data.commitments) };
      })
      .filter(({ b, p }) => {
        if (f.solicitante && p?.areaId !== f.solicitante) return false;
        if (f.requerida && b.areaDependencia !== f.requerida) return false;
        if (f.estado === 'abiertos' && !isBlockOpen(b)) return false;
        if (f.estado !== 'abiertos' && f.estado !== 'todos' && b.estado !== f.estado) return false;
        if (f.prioridad && p?.prioridadFinal !== f.prioridad) return false;
        return true;
      })
      .sort((a, b) => (a.next ? `${a.next.fecha}${a.next.hora}` : 'z').localeCompare(b.next ? `${b.next.fecha}${b.next.hora}` : 'z'));
  }, [data, db.projects, f.solicitante, f.requerida, f.estado, f.prioridad]);

  const bottlenecks = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.b.areaDependencia) m.set(r.b.areaDependencia, (m.get(r.b.areaDependencia) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (!data) return null;
  const requiredKeys = [...new Set(db.blocks.map((b) => b.areaDependencia).filter(Boolean))];

  return (
    <div className="page">
      <PageHeader title="Dependencias" subtitle="Quién necesita → qué necesita → de quién → para cuándo. Para detectar cuellos de botella organizacionales." />
      <div className="filters card" aria-label="Filtros de dependencias">
        <select className="input" aria-label="Área solicitante" value={f.solicitante} onChange={(e) => setQ({ solicitante: e.target.value })}>
          <option value="">Área solicitante: todas</option>
          {db.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Área requerida" value={f.requerida} onChange={(e) => setQ({ requerida: e.target.value })}>
          <option value="">Área requerida: todas</option>
          {requiredKeys.map((k) => (
            <option key={k} value={k}>
              {dependencyLabel(db, k)}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Semana" value={f.semana} onChange={(e) => setQ({ semana: e.target.value })}>
          <option value="">Semana en vista</option>
          {sortWeeks(db.weeks).map((w) => (
            <option key={w.id} value={w.id}>
              Semana {w.numero}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Estado" value={f.estado} onChange={(e) => setQ({ estado: e.target.value === 'abiertos' ? undefined : e.target.value })}>
          <option value="abiertos">Abiertas</option>
          <option value="todos">Todas</option>
          {BLOCK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {BLOCK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Prioridad" value={f.prioridad} onChange={(e) => setQ({ prioridad: e.target.value })}>
          <option value="">Todas las prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      {bottlenecks.length > 0 && (
        <Section title="Cuellos de botella">
          <ul className="bottlenecks">
            {bottlenecks.map(([k, n]) => (
              <li key={k}>
                <button className={`bn ${f.requerida === k ? 'on' : ''}`} onClick={() => setQ({ requerida: f.requerida === k ? undefined : k })}>
                  <strong>{dependencyLabel(db, k)}</strong>
                  <span>
                    {n} dependencia{n === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<GitFork size={32} />} title="Sin dependencias para estos filtros">
          Cuando un bloqueo depende de otra área o de un tercero, aparecerá aquí.
        </EmptyState>
      ) : (
        <ul className="dep-list">
          {rows.map(({ b, p, next }) => {
            const area = db.areas.find((a) => a.id === p?.areaId);
            return (
              <li key={b.id} className="dep-row card" data-testid="dependency-row">
                <div className="dep-cell">
                  <span className="dep-label">Quién necesita</span>
                  {area && <AreaDot color={area.color} name={area.nombre} />}
                  <Link to={`/proyectos/${b.projectId}`} className="small">
                    {p && <PriorityBadge p={p.prioridadFinal} />} {p?.nombre}
                  </Link>
                </div>
                <ArrowRight className="dep-arrow" size={18} aria-hidden />
                <div className="dep-cell">
                  <span className="dep-label">Qué necesita</span>
                  <strong>{b.necesidad || b.descripcion}</strong>
                </div>
                <ArrowRight className="dep-arrow" size={18} aria-hidden />
                <div className="dep-cell">
                  <span className="dep-label">De quién</span>
                  <strong>{dependencyLabel(db, b.areaDependencia)}</strong>
                  {b.dependeDe && <span className="small muted">{b.dependeDe}</span>}
                </div>
                <ArrowRight className="dep-arrow" size={18} aria-hidden />
                <div className="dep-cell">
                  <span className="dep-label">Para cuándo</span>
                  <strong>{next ? fmtDeadline(next.fecha, next.hora, ref) : p?.fechaObjetivo ? fmtDate(p.fechaObjetivo) : 'Sin fecha'}</strong>
                  <span className="small muted">Gestiona: {personName(db.people, b.responsableGestion)}</span>
                </div>
                <div className="dep-status">
                  <BlockStatusChip status={b.estado} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
