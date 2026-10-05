import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpCircle, Check, CheckCircle2, RefreshCw, Scale, X, ArrowDownUp } from 'lucide-react';
import { DEPENDENCY_LABELS, IMPACT_LABELS, URGENCY_LABELS } from '../../domain/constants';
import { fmtDate, fmtDeadline } from '../../domain/dates';
import { areaUpdateFor, commitmentDisplayStatus, isActiveProject, isOpenCommitment, personName, sortProjectsByPriority, type WeekData } from '../../domain/selectors';
import { reviewCommitments } from '../../domain/weekly';
import type { Level, Session } from '../../domain/types';
import { useApp, useDb, useServices, useSettings } from '../../state/app';
import { AreaDot, BlockedChip, CommitmentStatusChip, PriorityBadge, ProjectStatusChip } from '../../ui/badges';
import { EmptyState, Question } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { LevelPicker } from '../../ui/forms';
import { EisenhowerBoard } from '../eisenhower/EisenhowerBoard';
import { useCommitmentActions } from '../commitments/CommitmentTable';
import { useModals } from '../modals/ModalHost';

interface StepProps {
  session: Session;
  data: WeekData;
}

/* ───────── PASO 1 · REVISAR ───────── */
export function Step1Review({ session }: StepProps) {
  const db = useDb();
  const { now } = useApp();
  const actions = useCommitmentActions(session.id);
  const rows = reviewCommitments(db, session.weekId, session);
  const pending = rows.filter((c) => isOpenCommitment(c) && !c.historial.some((e) => e.sessionId === session.id));

  if (rows.length === 0) {
    return (
      <EmptyState icon={<CheckCircle2 size={40} />} title="No hay compromisos anteriores abiertos">
        Buen arranque: no quedó nada pendiente de la Weekly anterior.
      </EmptyState>
    );
  }
  return (
    <div className="step">
      <p className="step-lead">
        La Weekly comienza revisando lo acordado. <strong>{rows.length - pending.length}</strong> de <strong>{rows.length}</strong> revisados.
      </p>
      <ul className="review-list">
        {rows.map((c) => {
          const p = db.projects.find((x) => x.id === c.projectId);
          const st = commitmentDisplayStatus(c, now);
          const reviewed = c.historial.some((e) => e.sessionId === session.id);
          return (
            <li key={c.id} className={`review-card card ${reviewed ? 'reviewed' : ''} ${st === 'vencido' ? 'overdue' : ''}`} data-testid="review-card">
              <div className="review-main">
                <div className="row gap wrap">
                  {p && <PriorityBadge p={p.prioridadFinal} />}
                  <span className="review-project">{p?.nombre}</span>
                  <CommitmentStatusChip status={st} />
                  {c.reprogramaciones > 0 && <span className="chip chip-yellow">×{c.reprogramaciones} reprogramaciones</span>}
                </div>
                <p className="review-action">{c.accion}</p>
                <p className="small muted">
                  {personName(db.people, c.responsable)}
                  {c.apoyo && ` · apoyo: ${c.apoyo}`} · {fmtDeadline(c.fecha, c.hora, now)}
                  {(c.fecha !== c.fechaOriginal || c.hora !== c.horaOriginal) && ` · original ${fmtDate(c.fechaOriginal)} ${c.horaOriginal}`}
                </p>
              </div>
              {isOpenCommitment(c) ? (
                <div className="review-buttons">
                  <button className="btn btn-ok btn-lg" onClick={() => actions.complete(c)}>
                    <Check size={18} aria-hidden /> Cumplido
                  </button>
                  <button className="btn btn-secondary btn-lg" onClick={() => actions.reschedule(c)}>
                    <RefreshCw size={18} aria-hidden /> Reprogramar
                  </button>
                  <button className="btn btn-secondary btn-lg" onClick={() => actions.fail(c)}>
                    <X size={18} aria-hidden /> Incumplido
                  </button>
                  {c.estado !== 'escalado' && (
                    <button className="btn btn-secondary btn-lg" onClick={() => actions.escalate(c)}>
                      <ArrowUpCircle size={18} aria-hidden /> Escalar
                    </button>
                  )}
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => actions.reopen(c)}>
                  Deshacer
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────── PASO 2 · VISIBILIZAR ───────── */
export function Step2Visibilize({ session, data, areaId }: StepProps & { areaId?: string }) {
  const db = useDb();
  const settings = useSettings();
  const modals = useModals();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const max = settings.criteria.maxProyectosPorArea;
  const areas = db.areas.filter((a) => a.activo && (!areaId || a.id === areaId)).sort((a, b) => a.orden - b.orden);
  const tooMany = areas.some((a) => data.projects.filter((p) => p.areaId === a.id && isActiveProject(p)).length > max);

  return (
    <div className="step">
      {tooMany && (
        <p className="alert alert-yellow big" role="note">
          <AlertTriangle size={20} aria-hidden /> Tenemos demasiados proyectos activos. ¿Todos necesitan foco esta semana?
        </p>
      )}
      <div className={`visibilize ${areaId ? 'single' : ''}`}>
        {areas.map((a) => {
          const list = data.projects.filter((p) => p.areaId === a.id && isActiveProject(p)).sort(sortProjectsByPriority);
          const shown = expanded[a.id] || areaId ? list : list.slice(0, max);
          const up = areaUpdateFor(data, a.id);
          return (
            <section key={a.id} className="vis-col card" aria-label={a.nombre}>
              <header>
                <AreaDot color={a.color} name={a.nombre} />
                <span className={`small ${up ? 'ok' : 'warn'}`}>{up ? '✓ actualizada' : '⚠ sin actualizar'}</span>
              </header>
              <p className={`vis-count ${list.length > max ? 'warn' : ''}`}>
                {list.length} proyecto{list.length === 1 ? '' : 's'} activos{list.length > max && ` · recomendado ≤ ${max}`}
              </p>
              <ul>
                {shown.map((p) => (
                  <li key={p.id} className={`vis-item ${session.proyectosRevisados.includes(p.id) ? 'seen' : ''}`}>
                    <button className="vis-btn" onClick={() => modals.open({ type: 'project', projectId: p.id, origen: 'junta' })}>
                      <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />
                      <span className="vis-name">{p.nombre}</span>
                    </button>
                    <div className="vis-meta">
                      <ProjectStatusChip status={p.estado} />
                      {p.bloqueado && <BlockedChip />}
                      <span className="small muted">{personName(db.people, p.responsable)}</span>
                    </div>
                  </li>
                ))}
                {list.length === 0 && <li className="muted small">Sin proyectos activos</li>}
              </ul>
              {list.length > max && !areaId && (
                <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((e) => ({ ...e, [a.id]: !e[a.id] }))}>
                  {expanded[a.id] ? 'Ver menos' : `Ver ${list.length - max} más`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── PASO 3 · ORDENAR ───────── */
export function Step3Order({ data }: { data: WeekData }) {
  return (
    <div className="step">
      <Question>¿Es importante, urgente o ambas?</Question>
      <EisenhowerBoard projects={data.projects} origen="junta" />
    </div>
  );
}

/* ───────── PASO 4 · PRIORIZAR ───────── */
export function Step4Prioritize({ session, data }: StepProps) {
  const db = useDb();
  const settings = useSettings();
  const services = useServices();
  const modals = useModals();
  const { run } = useFeedback();
  const active = useMemo(() => data.projects.filter(isActiveProject), [data.projects]);
  const sortIds = () => [...active].sort((a, b) => b.score - a.score || sortProjectsByPriority(a, b)).map((p) => p.id);
  const [order, setOrder] = useState<string[]>(sortIds);
  const rows = [...order.map((id) => active.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p), ...active.filter((p) => !order.includes(p.id))];
  const counts = { P1: active.filter((p) => p.prioridadFinal === 'P1').length, P2: active.filter((p) => p.prioridadFinal === 'P2').length, P3: active.filter((p) => p.prioridadFinal === 'P3').length };

  const kickoff = session.tipo === 'arranque';
  const pondered = new Set(session.ponderados ?? []);
  const setLevel = (id: string, field: 'impacto' | 'urgencia' | 'dependencia', v: Level) =>
    run(() =>
      services.ctx.store.batch(() => {
        services.projects.update(id, { [field]: v }, { origen: 'junta' });
        if (kickoff) services.sessions.markPondered(session.id, id);
      }),
    );
  const pending = active.filter((p) => !pondered.has(p.id));

  return (
    <div className="step">
      <div className="prio-summary">
        {(['P1', 'P2', 'P3'] as const).map((p) => (
          <div key={p} className={`prio-count prio-count-${p.toLowerCase()}`}>
            <PriorityBadge p={p} size="lg" />
            <strong data-testid={`count-${p}`}>{counts[p]}</strong>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setOrder(sortIds())}>
          <ArrowDownUp size={15} aria-hidden /> Reordenar por score
        </button>
      </div>
      {kickoff && active.length > 0 && (
        <p className={`alert ${pending.length ? 'alert-yellow' : 'alert-green'}`} data-testid="ponder-status">
          {pending.length
            ? `Revisa impacto, urgencia y dependencia de cada proyecto y confirma su ponderación (${active.length - pending.length} de ${active.length} confirmados).`
            : `✓ Los ${active.length} proyectos tienen su ponderación confirmada.`}
          {pending.length > 1 && (
            <button className="btn btn-sm btn-secondary ml-auto" onClick={() => run(() => services.ctx.store.batch(() => pending.forEach((p) => services.sessions.markPondered(session.id, p.id))))}>
              Confirmar todos
            </button>
          )}
        </p>
      )}
      {counts.P1 > settings.criteria.maxP1 && (
        <p className="alert alert-yellow big">
          <AlertTriangle size={20} aria-hidden /> No todo puede ser P1: hay {counts.P1} (recomendado ≤ {settings.criteria.maxP1}). ¿Qué prioridad desplaza?
        </p>
      )}
      <div className="table-wrap card">
        <table className="table prio-table">
          <thead>
            <tr>
              <th scope="col">Proyecto</th>
              <th scope="col">Impacto</th>
              <th scope="col">Urgencia</th>
              <th scope="col">Dependencia</th>
              <th scope="col" className="num">Score</th>
              <th scope="col">Calculada</th>
              <th scope="col">Final</th>
              {kickoff && <th scope="col">Ponderación</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const area = db.areas.find((a) => a.id === p.areaId);
              return (
                <tr key={p.id} data-testid="prio-row">
                  <td>
                    <strong>{p.nombre}</strong>
                    <span className="small muted block">
                      {area?.nombre} {p.bloqueado && '· bloqueado'}
                    </span>
                  </td>
                  <td>
                    <LevelPicker label={`Impacto de ${p.nombre}`} value={p.impacto} onChange={(v) => setLevel(p.id, 'impacto', v)} labels={IMPACT_LABELS} compact name={`i-${p.id}`} />
                  </td>
                  <td>
                    <LevelPicker label={`Urgencia de ${p.nombre}`} value={p.urgencia} onChange={(v) => setLevel(p.id, 'urgencia', v)} labels={URGENCY_LABELS} compact name={`u-${p.id}`} />
                  </td>
                  <td>
                    <LevelPicker label={`Dependencia de ${p.nombre}`} value={p.dependencia} onChange={(v) => setLevel(p.id, 'dependencia', v)} labels={DEPENDENCY_LABELS} compact name={`d-${p.id}`} />
                  </td>
                  <td className="num">
                    <strong className="score-num sm">{p.score}</strong>
                  </td>
                  <td>
                    <PriorityBadge p={p.prioridadCalculada} />
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => modals.open({ type: 'override', projectId: p.id, sessionId: session.id, origen: 'junta' })} aria-label={`Ajustar prioridad de ${p.nombre}`}>
                      <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} /> <Scale size={14} aria-hidden />
                    </button>
                  </td>
                  {kickoff && (
                    <td>
                      {pondered.has(p.id) ? (
                        <span className="chip chip-green">
                          <CheckCircle2 size={14} aria-hidden /> Confirmada
                        </span>
                      ) : (
                        <button className="btn btn-sm btn-ok" onClick={() => run(() => services.sessions.markPondered(session.id, p.id))} aria-label={`Confirmar ponderación de ${p.nombre}`}>
                          <Check size={14} aria-hidden /> Confirmar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Question>¿Este orden representa realmente las prioridades de la Dirección?</Question>
    </div>
  );
}
