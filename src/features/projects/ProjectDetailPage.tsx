import { useMemo, useState } from 'react';
import { AlertOctagon, Archive, ArrowLeft, CheckCircle2, ListPlus, Pencil, RotateCcw, Scale, MessageSquarePlus } from 'lucide-react';
import { DEPENDENCY_LABELS, IMPACT_LABELS, QUADRANT_LABELS, URGENCY_LABELS } from '../../domain/constants';
import { fmtDate, fmtDateTime } from '../../domain/dates';
import { blockIsManaged, dependencyLabel, isActiveProject, isOpenCommitment, personName, sortWeeks } from '../../domain/selectors';
import { useActiveWeek, useApp, useDb, useServices, useSettings } from '../../state/app';
import { Link, navigate } from '../../state/router';
import { AreaDot, BlockedChip, BlockStatusChip, Chip, PriorityBadge, ProjectStatusChip, QuadrantChip } from '../../ui/badges';
import { EmptyState, Section } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { CommitmentTable } from '../commitments/CommitmentTable';
import { useModals } from '../modals/ModalHost';

export function ProjectDetailPage({ id }: { id: string }) {
  const db = useDb();
  const settings = useSettings();
  const services = useServices();
  const active = useActiveWeek();
  const modals = useModals();
  const { now } = useApp();
  const { run, confirm } = useFeedback();
  const p = db.projects.find((x) => x.id === id);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');

  const evolution = useMemo(() => {
    const weeks = sortWeeks(db.weeks);
    return weeks
      .map((w) => ({ week: w, u: db.weeklyUpdates.find((u) => u.weekId === w.id && u.projectId === id) }))
      .filter((x) => x.u);
  }, [db, id]);

  if (!p) {
    return (
      <div className="page">
        <EmptyState title="Proyecto no encontrado" action={<Link to="/proyectos" className="btn btn-secondary">Ver proyectos</Link>}>
          Puede que haya sido eliminado.
        </EmptyState>
      </div>
    );
  }

  const area = db.areas.find((a) => a.id === p.areaId);
  const blocks = db.blocks.filter((b) => b.projectId === p.id).sort((a, b) => Number(a.estado === 'resuelto') - Number(b.estado === 'resuelto') || b.createdAt.localeCompare(a.createdAt));
  const commitments = db.commitments.filter((c) => c.projectId === p.id).sort((a, b) => Number(!isOpenCommitment(a)) - Number(!isOpenCommitment(b)) || `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
  const decisions = db.decisions.filter((d) => d.projectId === p.id);
  const editable = !!active && active.estado === 'abierta';
  const activeProject = isActiveProject(p);
  const comments = evolution.filter((e) => e.u?.comentario);

  const setStatus = async (estado: 'completado' | 'archivado' | 'en_curso') => {
    if (estado !== 'en_curso') {
      const open = commitments.filter(isOpenCommitment).length;
      const ok = await confirm({
        title: estado === 'completado' ? 'Cerrar proyecto' : 'Archivar proyecto',
        message: (
          <>
            <p>
              <strong>{p.nombre}</strong> saldrá de la lista de proyectos activos. Su historial se conserva.
            </p>
            {open > 0 && <p>Tiene {open} compromiso(s) abierto(s): siguen visibles en Compromisos hasta que los cierres.</p>}
          </>
        ),
        confirmLabel: estado === 'completado' ? 'Cerrar proyecto' : 'Archivar',
      });
      if (!ok) return;
    }
    run(() => services.projects.setStatus(p.id, estado), estado === 'en_curso' ? 'Proyecto reactivado' : estado === 'completado' ? 'Proyecto cerrado' : 'Proyecto archivado');
  };

  const addComment = () => {
    if (!comment.trim()) return;
    if (run(() => services.projects.comment(p.id, comment), 'Comentario registrado')) {
      setComment('');
      setCommenting(false);
    }
  };
  const currentUpdate = active ? db.weeklyUpdates.find((u) => u.weekId === active.id && u.projectId === p.id) : undefined;
  const showLiveRow = !!active && active.estado === 'abierta' && !currentUpdate;

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/proyectos'))}>
        <ArrowLeft size={16} aria-hidden /> Volver
      </button>
      <header className="project-head card">
        <div className="project-head-main">
          <div className="row gap wrap">
            <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} size="lg" />
            <ProjectStatusChip status={p.estado} />
            {p.bloqueado && <BlockedChip />}
            <QuadrantChip q={p.eisenhower} />
          </div>
          <h1>{p.nombre}</h1>
          {p.descripcion && <p className="muted">{p.descripcion}</p>}
          <dl className="meta-grid">
            <div>
              <dt>Área</dt>
              <dd>{area && <AreaDot color={area.color} name={area.nombre} />}</dd>
            </div>
            <div>
              <dt>Responsable</dt>
              <dd>{personName(db.people, p.responsable)}</dd>
            </div>
            <div>
              <dt>Fecha objetivo</dt>
              <dd>{fmtDate(p.fechaObjetivo)}</dd>
            </div>
            <div>
              <dt>Depende de</dt>
              <dd>{p.dependeDe ? dependencyLabel(db, p.dependeDe) : '—'}</dd>
            </div>
          </dl>
        </div>
        {editable && (
          <div className="project-actions">
            <button className="btn btn-primary" onClick={() => modals.open({ type: 'project', projectId: p.id })}>
              <Pencil size={16} aria-hidden /> Actualizar
            </button>
            {activeProject && (
              <>
                <button className="btn btn-secondary" onClick={() => modals.open({ type: 'block', projectId: p.id })}>
                  <AlertOctagon size={16} aria-hidden /> Marcar bloqueo
                </button>
                <button className="btn btn-secondary" onClick={() => modals.open({ type: 'commitment', projectId: p.id })}>
                  <ListPlus size={16} aria-hidden /> Nuevo compromiso
                </button>
                <button className="btn btn-secondary" onClick={() => modals.open({ type: 'override', projectId: p.id })}>
                  <Scale size={16} aria-hidden /> Ajuste Dirección
                </button>
                <button className="btn btn-ghost" onClick={() => setCommenting(true)}>
                  <MessageSquarePlus size={16} aria-hidden /> Comentario
                </button>
                <button className="btn btn-ghost" onClick={() => setStatus('completado')}>
                  <CheckCircle2 size={16} aria-hidden /> Cerrar
                </button>
                <button className="btn btn-ghost" onClick={() => setStatus('archivado')}>
                  <Archive size={16} aria-hidden /> Archivar
                </button>
              </>
            )}
            {!activeProject && (
              <button className="btn btn-secondary" onClick={() => setStatus('en_curso')}>
                <RotateCcw size={16} aria-hidden /> Reactivar
              </button>
            )}
          </div>
        )}
      </header>

      {commenting && (
        <form
          className="card section inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            addComment();
          }}
        >
          <label className="grow">
            <span className="field-label">Comentario de la semana</span>
            <input className="input" autoFocus value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Avance, riesgo o contexto para la Weekly" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!comment.trim()}>
            Guardar comentario
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setCommenting(false)}>
            Cancelar
          </button>
        </form>
      )}

      <div className="two-col">
        <Section title="Ponderación">
          <dl className="scoring-detail">
            <div>
              <dt>Impacto</dt>
              <dd>
                <strong>{p.impacto}</strong> · {IMPACT_LABELS[p.impacto]}
              </dd>
            </div>
            <div>
              <dt>Urgencia</dt>
              <dd>
                <strong>{p.urgencia}</strong> · {URGENCY_LABELS[p.urgencia]}
              </dd>
            </div>
            <div>
              <dt>Dependencia</dt>
              <dd>
                <strong>{p.dependencia}</strong> · {DEPENDENCY_LABELS[p.dependencia]}
              </dd>
            </div>
            <div className="score-total">
              <dt>Score</dt>
              <dd>
                <strong className="score-num">{p.score}</strong> → calculada <PriorityBadge p={p.prioridadCalculada} /> · final <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />
              </dd>
            </div>
          </dl>
          {p.ajusteDireccion && (
            <p className="alert alert-blue">
              Ajuste de Dirección{p.motivoAjuste ? `: ${p.motivoAjuste}` : ''}.
            </p>
          )}
          <p className="small muted">Eisenhower: {QUADRANT_LABELS[p.eisenhower]}</p>
        </Section>

        <Section title="Evolución semanal">
          {evolution.length === 0 && !showLiveRow ? (
            <p className="muted">Aún sin registros semanales.</p>
          ) : (
            <ol className="evolution" data-testid="evolution">
              {evolution.map(({ week, u }) => (
                <li key={week.id}>
                  <span className="evo-week">Semana {week.numero}</span>
                  <span className="evo-arrow" aria-hidden>→</span>
                  <PriorityBadge p={u!.prioridad} override={u!.ajusteDireccion} />
                  {u!.bloqueado && <Chip tone="red">Bloqueado</Chip>}
                  {u!.estado === 'completado' && <Chip tone="green">Cerrado</Chip>}
                  {u!.estado !== 'completado' && !u!.bloqueado && <span className="small muted">{settings.statusLabels[u!.estado]}</span>}
                  <span className="small muted">score {u!.score}</span>
                </li>
              ))}
              {showLiveRow && (
                <li className="evo-live">
                  <span className="evo-week">Semana {active!.numero}</span>
                  <span className="evo-arrow" aria-hidden>→</span>
                  <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />
                  {p.bloqueado && <Chip tone="red">Bloqueado</Chip>}
                  <span className="small muted">sin actualizar aún · score {p.score}</span>
                </li>
              )}
            </ol>
          )}
        </Section>
      </div>

      <Section title={`Bloqueos (${blocks.filter((b) => b.estado !== 'resuelto').length} abiertos)`} actions={editable && activeProject ? <button className="btn btn-sm btn-secondary" onClick={() => modals.open({ type: 'block', projectId: p.id })}>Registrar bloqueo</button> : undefined}>
        {blocks.length === 0 ? (
          <p className="muted">Sin bloqueos registrados.</p>
        ) : (
          <ul className="block-list">
            {blocks.map((b) => {
              const managed = blockIsManaged(b, db.commitments);
              return (
                <li key={b.id} className="block-item">
                  <div>
                    <div className="row gap wrap">
                      <BlockStatusChip status={b.estado} />
                      {b.estado !== 'resuelto' && !managed && <Chip tone="yellow" icon={<AlertOctagon size={14} aria-hidden />}>Bloqueo sin compromiso</Chip>}
                      <span className="small muted">desde {fmtDateTime(b.createdAt)}</span>
                    </div>
                    <p className="block-desc">{b.descripcion}</p>
                    <p className="small">
                      {b.necesidad && <>Necesita: <strong>{b.necesidad}</strong> · </>}
                      Depende de: <strong>{[dependencyLabel(db, b.areaDependencia), b.dependeDe].filter((x) => x && x !== '—').join(' · ') || '—'}</strong> · Gestiona: <strong>{personName(db.people, b.responsableGestion)}</strong>
                      {b.escaladoA && b.estado === 'escalado' && <> · Escalado a <strong>{b.escaladoA}</strong></>}
                    </p>
                  </div>
                  {editable && b.estado !== 'resuelto' && (
                    <div className="row gap">
                      <button className="btn btn-sm btn-secondary" onClick={() => modals.open({ type: 'block', blockId: b.id })}>
                        Destrabar
                      </button>
                      <button className="btn btn-sm btn-ok" onClick={() => run(() => services.blocks.resolve(b.id), 'Bloqueo resuelto')}>
                        Resuelto
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Compromisos (${commitments.filter(isOpenCommitment).length} abiertos)`} actions={editable && activeProject ? <button className="btn btn-sm btn-secondary" onClick={() => modals.open({ type: 'commitment', projectId: p.id })}>Nuevo compromiso</button> : undefined}>
        {commitments.length === 0 ? <p className="muted">Sin compromisos.</p> : <CommitmentTable rows={commitments} showProject={false} showFail asOf={now} />}
      </Section>

      <div className="two-col">
        <Section title="Decisiones">
          {decisions.length === 0 ? (
            <p className="muted">Sin decisiones registradas.</p>
          ) : (
            <ul className="plain-list">
              {decisions.map((d) => (
                <li key={d.id}>
                  <strong>{d.descripcion}</strong>
                  <span className="small muted block">
                    Semana {db.weeks.find((w) => w.id === d.weekId)?.numero} · {personName(db.people, d.responsable, 'Sin responsable')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Comentarios semanales">
          {comments.length === 0 ? (
            <p className="muted">Sin comentarios.</p>
          ) : (
            <ul className="plain-list">
              {comments.map(({ week, u }) => (
                <li key={week.id}>
                  <span className="small muted">Semana {week.numero}</span> {u!.comentario}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
