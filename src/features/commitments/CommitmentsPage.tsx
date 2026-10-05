import { useMemo } from 'react';
import { ClipboardList, Download, Plus } from 'lucide-react';
import { COMMITMENT_FILTER_STATUSES, COMMITMENT_STATUS_LABELS, PRIORITIES } from '../../domain/constants';
import { fmtDeadline } from '../../domain/dates';
import { commitmentDisplayStatus, dependencyLabel, isOpenCommitment, sortByDeadline, sortWeeks } from '../../domain/selectors';
import type { Commitment } from '../../domain/types';
import { useApp, useCurrentUser, useDb, useOpsData } from '../../state/app';
import { Link, navigate, useQuery } from '../../state/router';
import { CommitmentStatusChip, PriorityBadge } from '../../ui/badges';
import { downloadFile, EmptyState, PageHeader } from '../../ui/common';
import { commitmentsCsv } from '../../services/exportService';
import { useModals } from '../modals/ModalHost';
import { CommitmentActions, CommitmentTable } from './CommitmentTable';

export function CommitmentsPage() {
  const db = useDb();
  const data = useOpsData();
  const user = useCurrentUser();
  const { now } = useApp();
  const modals = useModals();
  const [q, setQ] = useQuery();
  const vista = q.get('vista') === 'mis' ? 'mis' : 'todos';
  const f = {
    texto: q.get('q') ?? '',
    area: q.get('area') ?? '',
    persona: q.get('persona') ?? (vista === 'mis' ? (user?.id ?? '') : ''),
    estado: q.get('estado') ?? '',
    prioridad: q.get('prioridad') ?? '',
    semana: q.get('semana') ?? '',
  };

  const ref = data?.manageable ? now : (data?.asOf ?? now);
  const rows = useMemo(() => {
    if (!data) return [];
    const t = f.texto.toLowerCase();
    return data.commitments
      .filter((c) => {
        const p = db.projects.find((x) => x.id === c.projectId);
        if (t && !`${c.accion} ${p?.nombre ?? ''}`.toLowerCase().includes(t)) return false;
        if (f.area && p?.areaId !== f.area) return false;
        if (f.persona && c.responsable !== f.persona) return false;
        if (f.prioridad && p?.prioridadFinal !== f.prioridad) return false;
        if (f.semana && c.weekId !== f.semana) return false;
        if (f.estado === 'abiertos' && !isOpenCommitment(c)) return false;
        if (f.estado && f.estado !== 'abiertos' && commitmentDisplayStatus(c, ref) !== f.estado) return false;
        return true;
      })
      .sort((a, b) => Number(!isOpenCommitment(a)) - Number(!isOpenCommitment(b)) || sortByDeadline(a, b));
  }, [data, db.projects, ref, f.texto, f.area, f.persona, f.estado, f.prioridad, f.semana]);

  if (!data) return null;
  const people = db.people.filter((p) => db.commitments.some((c) => c.responsable === p.id));
  const filtersOn = !!(f.texto || f.area || f.estado || f.prioridad || f.semana || (vista === 'todos' && f.persona));

  return (
    <div className="page">
      <PageHeader
        title={vista === 'mis' ? 'Mis compromisos' : 'Compromisos'}
        subtitle="Toda acción debe tener responsable + fecha + hora."
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => downloadFile('compromisos.csv', commitmentsCsv(db, now), 'text/csv;charset=utf-8')}>
              <Download size={16} aria-hidden /> CSV
            </button>
            {data.live && (
              <button className="btn btn-primary" onClick={() => modals.open({ type: 'commitment' })}>
                <Plus size={16} aria-hidden /> Nuevo compromiso
              </button>
            )}
          </>
        }
      />
      <div className="tabs" role="tablist" aria-label="Vista de compromisos">
        <button role="tab" aria-selected={vista === 'todos'} className={`tab ${vista === 'todos' ? 'on' : ''}`} onClick={() => setQ({ vista: undefined, persona: undefined })}>
          Todos
        </button>
        <button role="tab" aria-selected={vista === 'mis'} className={`tab ${vista === 'mis' ? 'on' : ''}`} onClick={() => setQ({ vista: 'mis', persona: f.persona || user?.id })}>
          Mis compromisos
        </button>
      </div>

      <div className="filters card" aria-label="Filtros de compromisos">
        <input className="input" type="search" placeholder="Buscar…" aria-label="Buscar compromiso" value={f.texto} onChange={(e) => setQ({ q: e.target.value })} />
        <select className="input" aria-label="Responsable" value={f.persona} onChange={(e) => setQ({ persona: e.target.value })}>
          <option value="">{vista === 'mis' ? 'Selecciona responsable…' : 'Todos los responsables'}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Área" value={f.area} onChange={(e) => setQ({ area: e.target.value })}>
          <option value="">Todas las áreas</option>
          {db.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Estado" value={f.estado} onChange={(e) => setQ({ estado: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="abiertos">Abiertos</option>
          {COMMITMENT_FILTER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {COMMITMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Prioridad" value={f.prioridad} onChange={(e) => setQ({ prioridad: e.target.value })}>
          <option value="">Todas las prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="input" aria-label="Semana de origen" value={f.semana} onChange={(e) => setQ({ semana: e.target.value })}>
          <option value="">Todas las semanas</option>
          {sortWeeks(db.weeks).map((w) => (
            <option key={w.id} value={w.id}>
              Semana {w.numero}
            </option>
          ))}
        </select>
        {filtersOn && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(vista === 'mis' ? `/compromisos?vista=mis&persona=${f.persona}` : '/compromisos', { replace: true })}>
            Limpiar filtros
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardList size={32} />} title={vista === 'mis' && !f.persona ? 'Selecciona un responsable' : 'Sin compromisos para estos filtros'}>
          {f.estado === 'vencido' ? 'Excelente: no hay compromisos vencidos.' : 'Los compromisos nacen de los bloqueos y de la Weekly.'}
        </EmptyState>
      ) : vista === 'mis' ? (
        <MyCommitments rows={rows} readOnly={!data.manageable} />
      ) : (
        <div className="card">
          <CommitmentTable rows={rows} readOnly={!data.manageable} showFail asOf={ref} />
        </div>
      )}
    </div>
  );
}

function MyCommitments({ rows, readOnly }: { rows: Commitment[]; readOnly: boolean }) {
  const db = useDb();
  const { now } = useApp();
  const open = rows.filter(isOpenCommitment);
  return (
    <>
      <p className="my-count">
        <strong>{open.length}</strong> por gestionar
      </p>
      <ul className="my-cards">
        {rows.map((c) => {
          const p = db.projects.find((x) => x.id === c.projectId);
          const block = db.blocks.find((b) => b.id === c.blockId);
          return (
            <li key={c.id} className={`my-card card ${commitmentDisplayStatus(c, now) === 'vencido' ? 'overdue' : ''}`}>
              <div className="row gap wrap">
                {p && <PriorityBadge p={p.prioridadFinal} />}
                <Link to={`/proyectos/${c.projectId}`} className="my-project">
                  {p?.nombre}
                </Link>
                <CommitmentStatusChip status={commitmentDisplayStatus(c, now)} />
              </div>
              <p className="my-action">{c.accion}</p>
              <dl className="my-meta">
                {block?.necesidad && (
                  <div>
                    <dt>Necesito</dt>
                    <dd>{block.necesidad}</dd>
                  </div>
                )}
                {block?.areaDependencia && (
                  <div>
                    <dt>Dependencia</dt>
                    <dd>{dependencyLabel(db, block.areaDependencia)}</dd>
                  </div>
                )}
                <div>
                  <dt>Deadline</dt>
                  <dd>{fmtDeadline(c.fecha, c.hora, now)}</dd>
                </div>
                {c.apoyo && (
                  <div>
                    <dt>Apoyo</dt>
                    <dd>{c.apoyo}</dd>
                  </div>
                )}
              </dl>
              {!readOnly && <CommitmentActions c={c} showFail />}
            </li>
          );
        })}
      </ul>
    </>
  );
}
