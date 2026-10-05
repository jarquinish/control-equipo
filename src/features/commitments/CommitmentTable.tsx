import { ArrowUpCircle, Check, ExternalLink, MessageSquare, RefreshCw, X } from 'lucide-react';
import { fmtDate, fmtDeadline } from '../../domain/dates';
import { commitmentDisplayStatus, isBlockOpen, isOpenCommitment, personName } from '../../domain/selectors';
import type { Commitment } from '../../domain/types';
import { useApp, useDb, useServices } from '../../state/app';
import { Link } from '../../state/router';
import { CommitmentStatusChip, PriorityBadge } from '../../ui/badges';
import { useFeedback } from '../../ui/feedback';
import { useModals } from '../modals/ModalHost';

export function useCommitmentActions(sessionId?: string) {
  const db = useDb();
  const services = useServices();
  const modals = useModals();
  const { run } = useFeedback();
  return {
    complete(c: Commitment) {
      const block = db.blocks.find((b) => b.id === c.blockId && isBlockOpen(b));
      if (block) modals.open({ type: 'complete', commitmentId: c.id, sessionId });
      else run(() => services.commitments.complete(c.id, { sessionId }), 'Compromiso cumplido');
    },
    reschedule: (c: Commitment) => modals.open({ type: 'reschedule', commitmentId: c.id, sessionId }),
    escalate: (c: Commitment) => modals.open({ type: 'escalate', commitmentId: c.id, sessionId }),
    fail: (c: Commitment) => modals.open({ type: 'fail', commitmentId: c.id, sessionId }),
    comment: (c: Commitment) => modals.open({ type: 'comment', commitmentId: c.id }),
    reopen: (c: Commitment) => run(() => services.commitments.reopen(c.id, { sessionId }), 'Compromiso reabierto'),
  };
}

export function CommitmentActions({ c, sessionId, showFail, compact, showProjectLink = true }: { c: Commitment; sessionId?: string; showFail?: boolean; compact?: boolean; showProjectLink?: boolean }) {
  const a = useCommitmentActions(sessionId);
  const open = isOpenCommitment(c);
  const label = (s: string) => (compact ? <span className="sr-only">{s}</span> : <span>{s}</span>);
  return (
    <div className="row-actions" role="group" aria-label={`Acciones para ${c.accion}`}>
      {open ? (
        <>
          <button className="btn btn-sm btn-ok" onClick={() => a.complete(c)} title="Cumplido">
            <Check size={15} aria-hidden /> {label('Cumplir')}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={() => a.reschedule(c)} title="Reprogramar">
            <RefreshCw size={15} aria-hidden /> {label('Reprogramar')}
          </button>
          {showFail && (
            <button className="btn btn-sm btn-secondary" onClick={() => a.fail(c)} title="Incumplido">
              <X size={15} aria-hidden /> {label('Incumplido')}
            </button>
          )}
          {c.estado !== 'escalado' && (
            <button className="btn btn-sm btn-secondary" onClick={() => a.escalate(c)} title="Escalar">
              <ArrowUpCircle size={15} aria-hidden /> {label('Escalar')}
            </button>
          )}
        </>
      ) : (
        <button className="btn btn-sm btn-ghost" onClick={() => a.reopen(c)}>
          Reabrir
        </button>
      )}
      <button className="btn btn-sm btn-ghost" onClick={() => a.comment(c)} title="Comentar" aria-label={`Comentar ${c.accion}`}>
        <MessageSquare size={15} aria-hidden />
        {c.comentarios.length > 0 && <span className="count">{c.comentarios.length}</span>}
      </button>
      {showProjectLink && (
        <Link to={`/proyectos/${c.projectId}`} className="btn btn-sm btn-ghost" title="Ver proyecto" aria-label="Ver proyecto">
          <ExternalLink size={15} aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function CommitmentTable({
  rows,
  readOnly,
  sessionId,
  showProject = true,
  showFail,
  asOf,
}: {
  rows: Commitment[];
  readOnly?: boolean;
  sessionId?: string;
  showProject?: boolean;
  showFail?: boolean;
  asOf?: Date;
}) {
  const db = useDb();
  const { now } = useApp();
  const ref = asOf ?? now;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Compromiso</th>
            {showProject && <th scope="col">Proyecto</th>}
            {showProject && <th scope="col">Área</th>}
            <th scope="col">Responsable</th>
            <th scope="col">Apoyo</th>
            <th scope="col">Fecha · hora</th>
            <th scope="col">Estado</th>
            <th scope="col" className="num">Reprog.</th>
            {!readOnly && <th scope="col"><span className="sr-only">Acciones</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const p = db.projects.find((x) => x.id === c.projectId);
            const area = db.areas.find((a) => a.id === p?.areaId);
            const st = commitmentDisplayStatus(c, ref);
            return (
              <tr key={c.id} className={st === 'vencido' ? 'row-danger' : undefined} data-testid="commitment-row">
                <td>
                  <strong className="cell-title">{c.accion}</strong>
                  {c.blockId && <span className="small muted block">Destraba bloqueo</span>}
                  {c.motivoReprogramacion && c.reprogramaciones > 0 && <span className="small muted block">Motivo: {c.motivoReprogramacion}</span>}
                </td>
                {showProject && (
                  <td>
                    {p ? (
                      <Link to={`/proyectos/${p.id}`} className="cell-link">
                        <PriorityBadge p={p.prioridadFinal} /> {p.nombre}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                {showProject && <td>{area?.nombre ?? '—'}</td>}
                <td>{personName(db.people, c.responsable)}</td>
                <td>{c.apoyo || '—'}</td>
                <td className="nowrap">
                  {fmtDeadline(c.fecha, c.hora, ref)}
                  {(c.fecha !== c.fechaOriginal || c.hora !== c.horaOriginal) && (
                    <span className="small muted block">
                      Original: {fmtDate(c.fechaOriginal)} {c.horaOriginal}
                    </span>
                  )}
                </td>
                <td>
                  <CommitmentStatusChip status={st} />
                  {c.escaladoA && c.estado === 'escalado' && <span className="small muted block">→ {c.escaladoA}</span>}
                </td>
                <td className="num">{c.reprogramaciones || '—'}</td>
                {!readOnly && (
                  <td>
                    <CommitmentActions c={c} sessionId={sessionId} showFail={showFail} compact showProjectLink={showProject} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
