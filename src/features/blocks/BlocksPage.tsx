import { useMemo, useState, type DragEvent } from 'react';
import { AlertOctagon, Clock, Download, Plus, PartyPopper } from 'lucide-react';
import { BLOCK_STATUS_LABELS, BLOCK_STATUSES, PRIORITIES } from '../../domain/constants';
import { fmtDeadline } from '../../domain/dates';
import { blockIsManaged, blockIsOverdue, blockNextCommitment, dependencyLabel, personName } from '../../domain/selectors';
import type { Block, BlockStatus } from '../../domain/types';
import { useApp, useDb, useOpsData, useServices } from '../../state/app';
import { Link, useQuery } from '../../state/router';
import { BlockStatusChip, Chip, PriorityBadge } from '../../ui/badges';
import { downloadFile, EmptyState, PageHeader } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { blocksCsv } from '../../services/exportService';
import { useModals } from '../modals/ModalHost';
import { ValidationError } from '../../domain/validation';

export function BlocksPage() {
  const db = useDb();
  const data = useOpsData();
  const { now } = useApp();
  const services = useServices();
  const modals = useModals();
  const { toast, run } = useFeedback();
  const [q, setQ] = useQuery();
  const [over, setOver] = useState<BlockStatus | null>(null);
  const area = q.get('area') ?? '';
  const prio = q.get('prioridad') ?? '';
  const resp = q.get('responsable') ?? '';

  const blocks = useMemo(() => {
    if (!data) return [];
    return data.blocks.filter((b) => {
      const p = data.projects.find((x) => x.id === b.projectId) ?? db.projects.find((x) => x.id === b.projectId);
      if (area && p?.areaId !== area) return false;
      if (prio && p?.prioridadFinal !== prio) return false;
      if (resp && b.responsableGestion !== resp) return false;
      return true;
    });
  }, [data, db.projects, area, prio, resp]);

  if (!data) return null;
  const ref = data.manageable ? now : data.asOf;
  const readOnly = !data.manageable;

  const move = (b: Block, estado: BlockStatus) => {
    if (b.estado === estado) return;
    if (estado === 'escalado') return modals.open({ type: 'escalateBlock', blockId: b.id });
    try {
      services.blocks.move(b.id, estado);
      toast(`Bloqueo → ${BLOCK_STATUS_LABELS[estado]}`);
    } catch (err) {
      if (err instanceof ValidationError && estado === 'en_gestion') {
        toast('Para gestionarlo define acción, responsable, fecha y hora.', 'info');
        modals.open({ type: 'block', blockId: b.id });
      } else run(() => { throw err; });
    }
  };

  const onDrop = (estado: BlockStatus) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const b = blocks.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (b) move(b, estado);
  };

  const people = db.people.filter((p) => db.blocks.some((b) => b.responsableGestion === p.id));

  return (
    <div className="page">
      <PageHeader
        title="Centro de bloqueos"
        subtitle="Un bloqueo no identifica culpables; identifica dónde necesita ayuda el proyecto."
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => downloadFile('bloqueos.csv', blocksCsv(db), 'text/csv;charset=utf-8')}>
              <Download size={16} aria-hidden /> CSV
            </button>
            {!readOnly && (
              <button className="btn btn-primary" onClick={() => modals.open({ type: 'block' })}>
                <Plus size={16} aria-hidden /> Registrar bloqueo
              </button>
            )}
          </>
        }
      />
      <div className="filters card" aria-label="Filtros de bloqueos">
        <select className="input" aria-label="Área" value={area} onChange={(e) => setQ({ area: e.target.value })}>
          <option value="">Todas las áreas</option>
          {db.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Prioridad" value={prio} onChange={(e) => setQ({ prioridad: e.target.value })}>
          <option value="">Todas las prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="input" aria-label="Responsable de gestión" value={resp} onChange={(e) => setQ({ responsable: e.target.value })}>
          <option value="">Todos los responsables</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {blocks.filter((b) => b.estado !== 'resuelto').length === 0 && (
        <EmptyState icon={<PartyPopper size={32} />} title="No hay bloqueos abiertos.">
          Excelente. No existen proyectos bloqueados esta semana.
        </EmptyState>
      )}

      <div className="kanban">
        {BLOCK_STATUSES.map((estado) => {
          const col = blocks.filter((b) => b.estado === estado);
          return (
            <section
              key={estado}
              className={`kanban-col col-${estado} ${over === estado ? 'over' : ''}`}
              aria-label={BLOCK_STATUS_LABELS[estado]}
              data-testid={`kanban-${estado}`}
              onDragOver={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setOver(estado);
              }}
              onDragLeave={() => setOver((o) => (o === estado ? null : o))}
              onDrop={readOnly ? undefined : onDrop(estado)}
            >
              <header>
                <h2>{BLOCK_STATUS_LABELS[estado]}</h2>
                <span className="count-pill">{col.length}</span>
              </header>
              <ul>
                {col.map((b) => {
                  const p = data.projects.find((x) => x.id === b.projectId) ?? db.projects.find((x) => x.id === b.projectId);
                  const a = db.areas.find((x) => x.id === p?.areaId);
                  const next = blockNextCommitment(b, data.commitments);
                  const overdue = blockIsOverdue(b, data.commitments, ref);
                  const managed = blockIsManaged(b, data.commitments);
                  return (
                    <li
                      key={b.id}
                      className={`kcard ${overdue ? 'overdue' : ''}`}
                      draggable={!readOnly}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', b.id)}
                      data-testid="block-card"
                    >
                      <div className="kcard-top">
                        {p && <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />}
                        <Link to={`/proyectos/${b.projectId}`} className="kcard-title">
                          {p?.nombre ?? 'Proyecto'}
                        </Link>
                      </div>
                      <p className="kcard-desc">{b.descripcion}</p>
                      <dl className="kcard-meta">
                        {a && (
                          <div>
                            <dt>Área</dt>
                            <dd>{a.nombre}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Depende de</dt>
                          <dd>{[dependencyLabel(db, b.areaDependencia), b.dependeDe].filter((x) => x && x !== '—').join(' · ') || '—'}</dd>
                        </div>
                        <div>
                          <dt>Gestiona</dt>
                          <dd>{personName(db.people, b.responsableGestion)}</dd>
                        </div>
                        <div>
                          <dt>Deadline</dt>
                          <dd>{next ? fmtDeadline(next.fecha, next.hora, ref) : '—'}</dd>
                        </div>
                      </dl>
                      <div className="row gap wrap">
                        <BlockStatusChip status={b.estado} />
                        {overdue && (
                          <Chip tone="red" icon={<Clock size={14} aria-hidden />}>
                            Vencido
                          </Chip>
                        )}
                        {b.estado !== 'resuelto' && !managed && (
                          <Chip tone="yellow" icon={<AlertOctagon size={14} aria-hidden />}>
                            Sin compromiso
                          </Chip>
                        )}
                        {b.escaladoA && b.estado === 'escalado' && <span className="small muted">→ {b.escaladoA}</span>}
                      </div>
                      {!readOnly && (
                        <div className="kcard-actions">
                          {b.estado !== 'resuelto' && (
                            <button className="btn btn-sm btn-secondary" onClick={() => modals.open({ type: 'block', blockId: b.id })}>
                              Destrabar
                            </button>
                          )}
                          <label>
                            <span className="sr-only">Mover bloqueo a</span>
                            <select className="input input-xs" value={b.estado} onChange={(e) => move(b, e.target.value as BlockStatus)}>
                              {BLOCK_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {BLOCK_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </li>
                  );
                })}
                {col.length === 0 && <li className="kanban-empty">Sin bloqueos</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
