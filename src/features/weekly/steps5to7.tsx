import { useState } from 'react';
import { AlertOctagon, AlertTriangle, ArrowRight, Check, CheckCircle2, HelpCircle, Lock, Plus, Unlock, Trash2 } from 'lucide-react';
import { fmtDeadline } from '../../domain/dates';
import {
  blockIsManaged,
  commitmentDisplayStatus,
  dependencyLabel,
  isActiveProject,
  isBlockOpen,
  isOpenCommitment,
  personName,
  sortByDeadline,
  sortProjectsByPriority,
  type WeekData,
} from '../../domain/selectors';
import { closingIssues, detectQueue, type ClosingIssue } from '../../domain/weekly';
import type { DetectOutcome, Session } from '../../domain/types';
import { useApp, useDb, useServices } from '../../state/app';
import { navigate } from '../../state/router';
import { AreaDot, BlockedChip, BlockStatusChip, Chip, CommitmentStatusChip, PriorityBadge, ProjectStatusChip } from '../../ui/badges';
import { EmptyState, Question } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { useModals } from '../modals/ModalHost';

interface StepProps {
  session: Session;
  data: WeekData;
}

const OUTCOME_LABEL: Record<DetectOutcome, string> = { avanza: 'Avanza', bloqueado: 'Bloqueado', decision: 'Requiere decisión', resuelto: 'Resuelto' };
const OUTCOME_TONE = { avanza: 'green', bloqueado: 'red', decision: 'blue', resuelto: 'green' } as const;

/* ───────── PASO 5 · DETECTAR ───────── */
export function Step5Detect({ session, data, includeAllP3 }: StepProps & { includeAllP3?: boolean }) {
  const db = useDb();
  const { now } = useApp();
  const services = useServices();
  const modals = useModals();
  const { run } = useFeedback();
  const queue = detectQueue(data, now, { includeAllP3 });
  const firstPending = queue.findIndex((p) => !session.deteccion[p.id]);
  const [idx, setIdx] = useState(firstPending === -1 ? 0 : firstPending);

  if (queue.length === 0) {
    return <EmptyState icon={<CheckCircle2 size={40} />} title={includeAllP3 ? 'Esta área no tiene proyectos activos para revisar' : 'Sin proyectos P1/P2 activos para revisar'} />;
  }
  const i = Math.min(idx, queue.length - 1);
  const p = queue[i];
  const area = db.areas.find((a) => a.id === p.areaId);
  const blocks = data.blocks.filter((b) => b.projectId === p.id && isBlockOpen(b));
  const commitments = data.commitments.filter((c) => c.projectId === p.id && isOpenCommitment(c)).sort(sortByDeadline);
  const outcome = session.deteccion[p.id];
  const lastComment = data.weeklyUpdates.find((u) => u.projectId === p.id)?.comentario;
  const reviewed = Object.keys(session.deteccion).filter((id) => queue.some((q) => q.id === id)).length;

  const decide = (o: DetectOutcome) => {
    const ok = run(() => services.sessions.detect(session.id, p.id, o));
    if (!ok) return;
    if (o === 'bloqueado' && blocks.length === 0) modals.open({ type: 'block', projectId: p.id, sessionId: session.id, origen: 'junta' });
    else if (o === 'decision') modals.open({ type: 'decision', projectId: p.id, sessionId: session.id });
    else if (i < queue.length - 1) setIdx(i + 1);
  };

  return (
    <div className="step detect">
      <div className="detect-main">
        <p className="step-lead">
          Proyecto <strong>{i + 1}</strong> de <strong>{queue.length}</strong> · {reviewed} revisados · orden: P1 bloqueados → P1 → P2 bloqueados → P2 → P3 que requieren atención
        </p>
        <article className="detect-card card" data-testid="detect-card">
          <div className="row gap wrap">
            <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} size="lg" />
            <ProjectStatusChip status={p.estado} />
            {p.bloqueado && <BlockedChip />}
            {outcome && <Chip tone={OUTCOME_TONE[outcome]}>{OUTCOME_LABEL[outcome]}</Chip>}
          </div>
          <h2 className="detect-name">{p.nombre}</h2>
          <p className="detect-meta">
            {area && <AreaDot color={area.color} name={area.nombre} />} · {personName(db.people, p.responsable)} · score {p.score}
            {p.dependeDe && ` · depende de ${dependencyLabel(db, p.dependeDe)}`}
          </p>
          {lastComment && <p className="detect-comment">«{lastComment}»</p>}
          {blocks.length > 0 && (
            <ul className="detect-blocks">
              {blocks.map((b) => (
                <li key={b.id}>
                  <Lock size={16} aria-hidden /> <strong>{b.descripcion}</strong>
                  {b.necesidad && <span> · necesita {b.necesidad}</span>}
                  {!blockIsManaged(b, data.commitments) && <Chip tone="yellow">Sin compromiso</Chip>}
                </li>
              ))}
            </ul>
          )}
          {commitments.length > 0 && (
            <ul className="detect-commitments">
              {commitments.map((c) => (
                <li key={c.id}>
                  <CommitmentStatusChip status={commitmentDisplayStatus(c, now)} /> {c.accion} · {personName(db.people, c.responsable)} · {fmtDeadline(c.fecha, c.hora, now)}
                </li>
              ))}
            </ul>
          )}
          <Question>¿Puede avanzar?</Question>
          <div className="detect-buttons">
            <button className={`btn btn-xl btn-ok ${outcome === 'avanza' ? 'selected' : ''}`} onClick={() => decide('avanza')}>
              <Check size={22} aria-hidden /> Avanza
            </button>
            <button className={`btn btn-xl btn-danger-soft ${outcome === 'bloqueado' ? 'selected' : ''}`} onClick={() => decide('bloqueado')}>
              <AlertTriangle size={22} aria-hidden /> Bloqueado
            </button>
            <button className={`btn btn-xl btn-info-soft ${outcome === 'decision' ? 'selected' : ''}`} onClick={() => decide('decision')}>
              <HelpCircle size={22} aria-hidden /> Requiere decisión
            </button>
            {(p.bloqueado || blocks.length > 0) && (
              <button className={`btn btn-xl btn-ok-soft ${outcome === 'resuelto' ? 'selected' : ''}`} onClick={() => decide('resuelto')}>
                <Unlock size={22} aria-hidden /> Resuelto
              </button>
            )}
          </div>
        </article>
        <div className="row gap between">
          <button className="btn btn-ghost" disabled={i === 0} onClick={() => setIdx(i - 1)}>
            ← Proyecto anterior
          </button>
          <button className="btn btn-ghost" disabled={i === queue.length - 1} onClick={() => setIdx(i + 1)}>
            Siguiente proyecto →
          </button>
        </div>
      </div>
      <aside className="detect-queue card" aria-label="Orden de revisión">
        <h3>Orden de revisión</h3>
        <ol>
          {queue.map((q, n) => {
            const o = session.deteccion[q.id];
            return (
              <li key={q.id}>
                <button className={`queue-item ${n === i ? 'on' : ''}`} onClick={() => setIdx(n)}>
                  <PriorityBadge p={q.prioridadFinal} />
                  <span className="queue-name">{q.nombre}</span>
                  {q.bloqueado && <Lock size={13} aria-label="bloqueado" />}
                  {o && <Chip tone={OUTCOME_TONE[o]}>{OUTCOME_LABEL[o]}</Chip>}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

/* ───────── PASO 6 · DESTRABAR Y COMPROMETER ───────── */
export function Step6Unblock({ session, data }: StepProps) {
  const db = useDb();
  const { now } = useApp();
  const modals = useModals();
  const blocks = data.blocks
    .filter(isBlockOpen)
    .map((b) => ({ b, p: data.projects.find((x) => x.id === b.projectId) }))
    .sort((x, y) => (x.p && y.p ? sortProjectsByPriority(x.p, y.p) : 0));
  const unmanaged = blocks.filter(({ b }) => !blockIsManaged(b, data.commitments)).length;

  return (
    <div className="step">
      <div className="row gap between wrap">
        <p className="step-lead">
          Todo bloqueo debe terminar en una acción con <strong>responsable + fecha + hora</strong>.
          {unmanaged > 0 ? (
            <span className="chip chip-red ml-1">
              <AlertOctagon size={14} aria-hidden /> {unmanaged} bloqueo{unmanaged === 1 ? '' : 's'} sin compromiso
            </span>
          ) : (
            blocks.length > 0 && (
              <span className="chip chip-green ml-1">
                <CheckCircle2 size={14} aria-hidden /> Todos los bloqueos tienen compromiso
              </span>
            )
          )}
        </p>
        <button className="btn btn-secondary" onClick={() => modals.open({ type: 'block', sessionId: session.id, origen: 'junta' })}>
          <Plus size={16} aria-hidden /> Registrar bloqueo
        </button>
      </div>
      {blocks.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={40} />} title="No hay bloqueos abiertos">
          Excelente. No existen proyectos bloqueados esta semana.
        </EmptyState>
      ) : (
        <ul className="unblock-list">
          {blocks.map(({ b, p }) => {
            const managed = blockIsManaged(b, data.commitments);
            const cs = data.commitments.filter((c) => c.blockId === b.id).sort(sortByDeadline);
            return (
              <li key={b.id} className={`unblock-card card ${managed ? 'managed' : 'unmanaged'}`} data-testid="unblock-card">
                <header>
                  <div className="row gap wrap">
                    {p && <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />}
                    <strong className="unblock-project">{p?.nombre}</strong>
                    <BlockStatusChip status={b.estado} />
                    {managed ? (
                      <Chip tone="green" icon={<CheckCircle2 size={14} aria-hidden />}>
                        Gestionado
                      </Chip>
                    ) : (
                      <Chip tone="red" icon={<AlertOctagon size={14} aria-hidden />}>
                        ⚠ Bloqueo sin compromiso
                      </Chip>
                    )}
                  </div>
                  <button className="btn btn-primary" onClick={() => modals.open({ type: 'block', blockId: b.id, sessionId: session.id, origen: 'junta' })}>
                    {managed ? 'Editar / agregar compromiso' : 'Destrabar y comprometer'} <ArrowRight size={16} aria-hidden />
                  </button>
                </header>
                <dl className="five-q">
                  <div>
                    <dt>¿Qué está bloqueando?</dt>
                    <dd>{b.descripcion}</dd>
                  </div>
                  <div>
                    <dt>¿Qué necesitamos?</dt>
                    <dd>{b.necesidad || <em className="missing">Por definir</em>}</dd>
                  </div>
                  <div>
                    <dt>¿De quién depende?</dt>
                    <dd>{[dependencyLabel(db, b.areaDependencia), b.dependeDe].filter((x) => x && x !== '—').join(' · ') || <em className="missing">Por definir</em>}</dd>
                  </div>
                  <div>
                    <dt>¿Quién puede ayudar?</dt>
                    <dd>{b.quienPuedeAyudar || '—'}</dd>
                  </div>
                  <div>
                    <dt>¿Quién gestiona el desbloqueo?</dt>
                    <dd>{b.responsableGestion ? personName(db.people, b.responsableGestion) : <em className="missing">Por definir</em>}</dd>
                  </div>
                </dl>
                {cs.length > 0 && (
                  <ul className="unblock-commitments">
                    {cs.map((c) => (
                      <li key={c.id}>
                        <CommitmentStatusChip status={commitmentDisplayStatus(c, now)} />
                        <strong>{c.accion}</strong> · {personName(db.people, c.responsable)}
                        {c.apoyo && ` (apoyo: ${c.apoyo})`} · {fmtDeadline(c.fecha, c.hora, now)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────── PASO 7 · CERRAR ───────── */
export function Step7Close({ session, data }: StepProps) {
  const label = session.tipo === 'arranque' ? 'Cerrar Sesión 1' : 'Cerrar Weekly';
  const db = useDb();
  const { now } = useApp();
  const services = useServices();
  const modals = useModals();
  const { confirm, run } = useFeedback();
  const issues = closingIssues(db, data, session);
  const p1 = data.projects.filter((p) => isActiveProject(p) && p.prioridadFinal === 'P1').sort(sortProjectsByPriority);
  const blocks = data.blocks.filter(isBlockOpen);
  const commitments = data.commitments.filter(isOpenCommitment).sort(sortByDeadline);
  const escalated = [...data.commitments.filter((c) => c.estado === 'escalado'), ...[]];
  const escalatedBlocks = data.blocks.filter((b) => b.estado === 'escalado');
  const projName = (id: string) => db.projects.find((p) => p.id === id)?.nombre ?? '';

  const fix = (i: ClosingIssue) => {
    if (i.kind === 'bloqueo_sin_accion' && i.blockId) modals.open({ type: 'block', blockId: i.blockId, sessionId: session.id, origen: 'junta' });
    else if (i.kind === 'tema_sin_decision') modals.open({ type: 'decision', projectId: i.projectId, sessionId: session.id });
    else if (i.kind === 'p1_sin_responsable' && i.projectId) modals.open({ type: 'project', projectId: i.projectId, origen: 'junta' });
    else if (i.commitmentId) modals.open({ type: 'commitment', commitmentId: i.commitmentId });
  };

  const close = async () => {
    if (issues.length) {
      const ok = await confirm({
        title: `${issues.length} temas requieren definición`,
        message: 'Lo recomendable es resolverlos antes de cerrar. ¿Cerrar la Weekly de todos modos? Los temas quedarán visibles como alertas.',
        confirmLabel: 'Cerrar de todos modos',
        danger: true,
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: label,
        message: 'Se guardará la fotografía de la semana (prioridades, bloqueos, compromisos y decisiones) y se generará el resumen ejecutivo.',
        confirmLabel: label,
      });
      if (!ok) return;
    }
    const r = run(() => services.sessions.close(session.id), 'Weekly cerrada');
    if (r) {
      navigate('/weekly');
      modals.open({ type: 'summary', weekId: session.weekId, justClosed: true });
    }
  };

  return (
    <div className="step close-step">
      <div className={`closing-status ${issues.length ? 'warn' : 'ok'}`} data-testid="closing-status">
        {issues.length === 0 ? (
          <>
            <CheckCircle2 size={28} aria-hidden /> <strong>✓ TODO CLARO</strong>
          </>
        ) : (
          <>
            <AlertTriangle size={28} aria-hidden /> <strong>⚠ {issues.length} TEMA{issues.length === 1 ? '' : 'S'} REQUIERE{issues.length === 1 ? '' : 'N'} DEFINICIÓN</strong>
          </>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i, n) => (
            <li key={n}>
              <AlertTriangle size={16} aria-hidden /> <span>{i.message}</span>
              <button className="btn btn-sm btn-secondary" onClick={() => fix(i)}>
                Resolver
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="close-grid">
        <section className="card section">
          <h2>Prioridades P1 ({p1.length})</h2>
          <ul className="plain-list">
            {p1.map((p) => (
              <li key={p.id}>
                <strong>{p.nombre}</strong> <span className="small muted">· {personName(db.people, p.responsable)}</span> {p.bloqueado && <BlockedChip />}
              </li>
            ))}
          </ul>
        </section>
        <section className="card section">
          <h2>Bloqueos abiertos ({blocks.length})</h2>
          <ul className="plain-list">
            {blocks.map((b) => (
              <li key={b.id}>
                <strong>{projName(b.projectId)}</strong> — {b.descripcion}
                {!blockIsManaged(b, data.commitments) && <Chip tone="red">sin compromiso</Chip>}
              </li>
            ))}
            {blocks.length === 0 && <li className="muted">Sin bloqueos abiertos.</li>}
          </ul>
        </section>
        <section className="card section">
          <div className="section-head">
            <h2>Decisiones ({data.decisions.length})</h2>
            <button className="btn btn-sm btn-secondary" onClick={() => modals.open({ type: 'decision', sessionId: session.id })}>
              <Plus size={14} aria-hidden /> Decisión
            </button>
          </div>
          <ul className="plain-list">
            {data.decisions.map((d) => (
              <li key={d.id} className="row gap between">
                <span>
                  {d.descripcion}
                  {d.projectId && <span className="small muted block">{projName(d.projectId)}</span>}
                </span>
                <button className="icon-btn" aria-label="Eliminar decisión" onClick={() => run(() => services.sessions.removeDecision(session.id, d.id))}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
            {data.decisions.length === 0 && <li className="muted">Sin decisiones registradas.</li>}
          </ul>
        </section>
        <section className="card section">
          <h2>Escalamientos ({escalated.length + escalatedBlocks.length})</h2>
          <ul className="plain-list">
            {escalated.map((c) => (
              <li key={c.id}>
                <strong>{projName(c.projectId)}</strong> — {c.accion} → {c.escaladoA}
              </li>
            ))}
            {escalatedBlocks.filter((b) => !escalated.some((c) => c.blockId === b.id)).map((b) => (
              <li key={b.id}>
                <strong>{projName(b.projectId)}</strong> — {b.descripcion} → {b.escaladoA}
              </li>
            ))}
            {escalated.length + escalatedBlocks.length === 0 && <li className="muted">Sin escalamientos.</li>}
          </ul>
        </section>
      </div>

      <section className="card section">
        <h2>¿Con qué salimos? · Compromisos ({commitments.length})</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Proyecto</th>
                <th scope="col">Acción</th>
                <th scope="col">Responsable</th>
                <th scope="col">Depende de</th>
                <th scope="col">Fecha</th>
                <th scope="col">Hora</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {commitments.map((c) => {
                const block = db.blocks.find((b) => b.id === c.blockId);
                const p = db.projects.find((x) => x.id === c.projectId);
                return (
                  <tr key={c.id} data-testid="final-row">
                    <td>{p?.nombre}</td>
                    <td>
                      <strong>{c.accion}</strong>
                    </td>
                    <td>{personName(db.people, c.responsable)}</td>
                    <td>{dependencyLabel(db, block?.areaDependencia || p?.dependeDe)}</td>
                    <td>{c.fecha}</td>
                    <td>{c.hora}</td>
                    <td>
                      <CommitmentStatusChip status={commitmentDisplayStatus(c, now)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="close-actions">
        <button className="btn btn-secondary btn-lg" onClick={() => modals.open({ type: 'summary', weekId: session.weekId })}>
          Vista previa del resumen
        </button>
        <button className="btn btn-primary btn-xl" onClick={close} data-testid="close-weekly">
          <CheckCircle2 size={22} aria-hidden /> {label}
        </button>
      </div>
    </div>
  );
}
