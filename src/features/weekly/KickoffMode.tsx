import { useMemo } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Flag, LogOut, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { DEPENDENCY_LABELS, IMPACT_LABELS, QUADRANT_HINTS, QUADRANT_LABELS, QUADRANTS, RULES, URGENCY_LABELS } from '../../domain/constants';
import { fmtDate, fmtDeadline } from '../../domain/dates';
import { AREA_STEP_LABELS, isAreaStage, kickoffStages, METHOD_OBJECTIVE, METHOD_STEPS, stageIndex, type KickoffAreaStep } from '../../domain/kickoff';
import { computeKpis } from '../../domain/metrics';
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
import type { Area, Session } from '../../domain/types';
import { closingIssues, sliceByArea, type ClosingIssue } from '../../domain/weekly';
import { useApp, useDb, useServices, useSettings } from '../../state/app';
import { navigate } from '../../state/router';
import { AreaDot, BlockedChip, Chip, CommitmentStatusChip, PriorityBadge, ProjectStatusChip, QuadrantChip } from '../../ui/badges';
import { EmptyState, Question } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { useModals } from '../modals/ModalHost';
import { ProjectQuickForm } from '../projects/ProjectQuickForm';
import { Step2Visibilize, Step3Order, Step4Prioritize } from './steps1to4';
import { Step5Detect, Step6Unblock, Step7Close } from './steps5to7';

const AREA_QUESTIONS: Record<KickoffAreaStep, (area: string) => string> = {
  registro: (a) => `¿CUÁLES SON LOS PROYECTOS DE ${a}?`,
  2: () => '¿EN QUÉ ESTAMOS?',
  3: () => '¿ES IMPORTANTE, URGENTE O AMBAS?',
  4: () => '¿ESTE ORDEN REPRESENTA REALMENTE LAS PRIORIDADES DE LA DIRECCIÓN?',
  5: () => '¿PUEDE AVANZAR?',
  6: () => '¿QUÉ NECESITAMOS PARA AVANZAR?',
  7: (a) => `¿CON QUÉ SALE ${a}?`,
};

/**
 * SESIÓN 1 · ARRANQUE — un área a la vez:
 * Metodología → Contenido (registro, 2–7) → Diseño (registro, 2–7) →
 * Marketing Digital (registro, 2–7) → SOC Store (registro, 2–7) → Resumen final.
 */
export function KickoffFrame({ session, data, weekNumber, range }: { session: Session; data: WeekData; weekNumber: number; range: string }) {
  const db = useDb();
  const services = useServices();
  const { run } = useFeedback();
  const areas = useMemo(() => db.areas.filter((a) => a.activo).sort((a, b) => a.orden - b.orden), [db.areas]);
  const stages = useMemo(() => kickoffStages(areas), [areas]);
  const idx = stageIndex(stages, session.etapa);
  const stage = stages[idx];
  const areaStage = isAreaStage(stage) ? stage : undefined;
  const area = areaStage ? areas.find((a) => a.id === areaStage.areaId) : undefined;
  const closed = new Set(session.areasCerradas ?? []);
  const number = services.sessions.number(session.id);
  const areaData = area ? sliceByArea(data, area.id) : undefined;

  const go = (target: number) => {
    if (target < 0 || target >= stages.length) return;
    run(() =>
      services.ctx.store.batch(() => {
        // Avanzar desde el paso 7 de un área = el área queda cerrada.
        if (target > idx && areaStage?.paso === 7) services.sessions.closeArea(session.id, areaStage.areaId);
        services.sessions.setStage(session.id, stages[target].key);
      }),
    );
    document.querySelector('.meeting-body')?.scrollTo({ top: 0 });
  };

  const stageLabel = (i: number): string => {
    const s = stages[i];
    if (!s) return '';
    if (s.key === 'metodologia') return 'Metodología';
    if (s.key === 'cierre') return 'Resumen final';
    if (isAreaStage(s)) {
      const a = areas.find((x) => x.id === s.areaId)?.nombre ?? '';
      if (areaStage && s.areaId === areaStage.areaId) return AREA_STEP_LABELS[s.paso];
      return s.paso === 'registro' ? `${a} · Registro` : `${a} · ${AREA_STEP_LABELS[s.paso]}`;
    }
    return '';
  };
  const nextLabel = (() => {
    if (idx >= stages.length - 1) return null;
    if (areaStage?.paso === 7) return `Cerrar ${area?.nombre} · ${stageLabel(idx + 1)}`;
    return stageLabel(idx + 1);
  })();

  const header = (() => {
    if (stage.key === 'metodologia') return { eyebrow: `Sesión ${number} · Arranque · Metodología`, h1: '¿CÓMO VAMOS A TRABAJAR?', top: 'METODOLOGÍA' };
    if (stage.key === 'cierre') return { eyebrow: `Sesión ${number} · Resumen final`, h1: '¿CON QUÉ SALIMOS?', top: 'RESUMEN FINAL' };
    const name = area?.nombre ?? '';
    const p = areaStage!.paso;
    return {
      eyebrow: p === 'registro' ? `${name} · Registro de proyectos` : `${name} · Paso ${p} · ${AREA_STEP_LABELS[p]}`,
      h1: AREA_QUESTIONS[p](name.toUpperCase()),
      top: p === 'registro' ? `${name.toUpperCase()} · REGISTRO DE PROYECTOS` : `${name.toUpperCase()} · PASO ${p} DE 7`,
    };
  })();

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className="meeting kickoff" data-testid="kickoff-mode">
      <header className="meeting-top">
        <div className="meeting-brand">
          <strong>Alignment &amp; Unblock</strong>
          <span>
            Sesión {number} · Semana {weekNumber} · {range}
          </span>
        </div>
        <div className="meeting-progress" aria-label={`Etapa ${idx + 1} de ${stages.length}`}>
          <span className="step-count" data-testid="kickoff-stage">
            {header.top}
          </span>
          <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={stages.length} aria-valuenow={idx + 1}>
            <div style={{ width: `${((idx + 1) / stages.length) * 100}%` }} />
          </div>
        </div>
        <div className="meeting-tools">
          <button className="btn btn-ghost btn-sm" onClick={fullscreen} title="Pantalla completa">
            <Maximize2 size={16} aria-hidden /> <span className="hide-md">Pantalla completa</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/weekly')}>
            <LogOut size={16} aria-hidden /> Salir
          </button>
        </div>
      </header>

      <div className="kickoff-navs">
        <nav className="step-pills" aria-label="Etapas de la sesión">
          <PhasePill label="Metodología" on={stage.key === 'metodologia'} past={idx > 0} onClick={() => go(0)} />
          {areas.map((a) => {
            const first = stages.findIndex((s) => isAreaStage(s) && s.areaId === a.id);
            return <PhasePill key={a.id} label={a.nombre} dot={a.color} on={area?.id === a.id} past={closed.has(a.id)} onClick={() => go(first)} />;
          })}
          <PhasePill label="Resumen final" on={stage.key === 'cierre'} past={false} onClick={() => go(stages.length - 1)} />
        </nav>
        {area && areaStage && (
          <nav className="substeps" aria-label={`Pasos de ${area.nombre}`}>
            {(['registro', 2, 3, 4, 5, 6, 7] as KickoffAreaStep[]).map((n, i) => {
              const target = stages.findIndex((s) => s.key === `${area.id}:${n}`);
              const current = (['registro', 2, 3, 4, 5, 6, 7] as KickoffAreaStep[]).indexOf(areaStage.paso);
              return (
                <button key={String(n)} className={`substep ${areaStage.paso === n ? 'on' : ''} ${current > i ? 'past' : ''}`} onClick={() => go(target)} aria-current={areaStage.paso === n ? 'step' : undefined}>
                  <span className="step-n">{n === 'registro' ? '✎' : n}</span>
                  {AREA_STEP_LABELS[n]}
                </button>
              );
            })}
          </nav>
        )}
        <LiveStatus data={data} />
      </div>

      <main className="meeting-body" id="main">
        <div className="meeting-title">
          <p className="eyebrow">{header.eyebrow}</p>
          <h1>{header.h1}</h1>
        </div>
        {stage.key === 'metodologia' && <MethodologySheet areas={areas} />}
        {area && areaData && areaStage?.paso === 'registro' && <AreaRegistro area={area} data={areaData} />}
        {area && areaData && areaStage?.paso === 2 && <Step2Visibilize session={session} data={areaData} areaId={area.id} />}
        {area && areaData && areaStage?.paso === 3 && <Step3Order data={areaData} />}
        {area && areaData && areaStage?.paso === 4 && <Step4Prioritize key={area.id} session={session} data={areaData} />}
        {area && areaData && areaStage?.paso === 5 && <Step5Detect key={area.id} session={session} data={areaData} includeAllP3 />}
        {area && areaData && areaStage?.paso === 6 && <Step6Unblock session={session} data={areaData} />}
        {area && areaData && areaStage?.paso === 7 && <AreaClose area={area} session={session} data={areaData} nextLabel={nextLabel ?? ''} onNext={() => go(idx + 1)} />}
        {stage.key === 'cierre' && <FinalSummary session={session} data={data} areas={areas} />}
      </main>

      <footer className="meeting-foot">
        <button className="btn btn-secondary btn-lg" disabled={idx === 0} onClick={() => go(idx - 1)}>
          <ArrowLeft size={18} aria-hidden /> {idx > 0 ? stageLabel(idx - 1) : 'Anterior'}
        </button>
        <span className="muted small hide-md">
          Etapa {idx + 1} de {stages.length}
        </span>
        {nextLabel ? (
          <button className="btn btn-primary btn-lg" onClick={() => go(idx + 1)} data-testid="kickoff-next">
            {nextLabel} <ArrowRight size={18} aria-hidden />
          </button>
        ) : (
          <span />
        )}
      </footer>
    </div>
  );
}

function PhasePill({ label, on, past, onClick, dot }: { label: string; on: boolean; past: boolean; onClick: () => void; dot?: string }) {
  return (
    <button className={`step-pill ${on ? 'on' : ''} ${past ? 'past' : ''}`} onClick={onClick} aria-current={on ? 'step' : undefined}>
      {past ? <CheckCircle2 size={16} className="ok" aria-hidden /> : dot ? <span className="area-dot" style={{ background: dot }} aria-hidden /> : null}
      {label}
    </button>
  );
}

/** Franja con los indicadores del dashboard: se actualiza con cada proyecto, bloqueo o compromiso guardado. */
function LiveStatus({ data }: { data: WeekData }) {
  const { now } = useApp();
  const k = computeKpis(data, now);
  return (
    <div className="live-status" aria-live="polite" data-testid="live-status">
      <span className="live-label">Dashboard en vivo</span>
      <span>
        <strong data-testid="live-projects">{k.proyectosActivos}</strong> proyectos
      </span>
      <span>
        <PriorityBadge p="P1" /> <strong>{k.p1}</strong>
      </span>
      <span>
        <PriorityBadge p="P2" /> <strong>{k.p2}</strong>
      </span>
      <span>
        <PriorityBadge p="P3" /> <strong>{k.p3}</strong>
      </span>
      <span>
        <strong>{k.bloqueados}</strong> bloqueados
      </span>
      <span>
        <strong data-testid="live-commitments">{k.compromisosAbiertos}</strong> compromisos
      </span>
    </div>
  );
}

/* ───────── PRIMERA HOJA · METODOLOGÍA ───────── */
function MethodologySheet({ areas }: { areas: Area[] }) {
  const settings = useSettings();
  return (
    <div className="method" data-testid="methodology">
      <section className="method-objective card">
        <h2>Objetivo</h2>
        <p>{METHOD_OBJECTIVE}</p>
        <p className="method-cycle">REVISAR → VISIBILIZAR → ORDENAR → PRIORIZAR → DETECTAR → DESTRABAR → COMPROMETER → CERRAR → DAR SEGUIMIENTO</p>
      </section>

      <section className="method-agenda card">
        <h2>Agenda de hoy</h2>
        <ol>
          <li>
            <strong>Metodología</strong> · cómo vamos a trabajar (esta hoja).
          </li>
          <li>
            <strong>Un área a la vez</strong> · {areas.map((a) => a.nombre).join(' → ')}. Cada área registra sus proyectos (máximo {settings.criteria.maxProyectosPorArea} recomendados) y recorre los pasos 2 a 7: Visibilizar, Ordenar, Priorizar, Detectar, Destrabar y comprometer, y Cerrar. Al cerrar un área pasamos a la siguiente.
          </li>
          <li>
            <strong>Resumen final</strong> · proyectos, acuerdos y estatus de todas las áreas; resumen para Teams.
          </li>
        </ol>
        <p className="small muted">A partir de la siguiente semana, la Weekly recorre los 7 pasos con todas las áreas a la vez y empieza revisando los compromisos de hoy (paso 1).</p>
      </section>

      <section className="method-steps" aria-label="Los 7 pasos">
        {METHOD_STEPS.map((s) => (
          <article key={s.n} className={`method-step card ${'hoy' in s ? 'muted-step' : ''}`}>
            <header>
              <span className="step-n">{s.n}</span>
              <div>
                <h3>{s.titulo}</h3>
                <p className="method-q">{s.pregunta}</p>
              </div>
            </header>
            <dl>
              <dt>Objetivo</dt>
              <dd>{s.objetivo}</dd>
              <dt>Resultado</dt>
              <dd>{s.resultado}</dd>
            </dl>
            {'hoy' in s && <p className="method-today">{s.hoy}</p>}
          </article>
        ))}
      </section>

      <div className="method-two">
        <section className="card section">
          <h2>Ponderación</h2>
          <p className="small muted">Score = Impacto + Urgencia + Dependencia · 8–9 → P1 · 6–7 → P2 · 3–5 → P3</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Criterio</th>
                  <th scope="col">1</th>
                  <th scope="col">2</th>
                  <th scope="col">3</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Impacto', IMPACT_LABELS],
                    ['Urgencia', URGENCY_LABELS],
                    ['Dependencia', DEPENDENCY_LABELS],
                  ] as const
                ).map(([c, l]) => (
                  <tr key={c}>
                    <th scope="row">{c}</th>
                    <td>{l[1]}</td>
                    <td>{l[2]}</td>
                    <td>{l[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card section">
          <h2>Eisenhower</h2>
          <div className="mini-eisen">
            {QUADRANTS.map((q) => (
              <div key={q} className={`mini-q quad-${q}`}>
                <h3>{QUADRANT_LABELS[q]}</h3>
                <p className="small muted">{QUADRANT_HINTS[q]}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card section rules">
        <h2>Reglas del juego</h2>
        <ol>
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/* ───────── REGISTRO DE PROYECTOS DEL ÁREA ───────── */
function AreaRegistro({ area, data }: { area: Area; data: WeekData }) {
  const db = useDb();
  const services = useServices();
  const settings = useSettings();
  const modals = useModals();
  const { toast, confirm } = useFeedback();
  const list = data.projects.filter(isActiveProject).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const max = settings.criteria.maxProyectosPorArea;

  const remove = async (id: string, nombre: string) => {
    const ok = await confirm({ title: 'Quitar proyecto', message: `¿Quitar «${nombre}» de ${area.nombre}?`, confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    services.projects.remove(id);
    toast('Proyecto quitado');
  };

  return (
    <div className="step capture">
      <p className="step-lead">
        Proyectos de <strong>{area.nombre}</strong>, no actividades. Cada proyecto guardado aparece de inmediato en el dashboard, en Proyectos y en el tablero del área.
      </p>
      <ProjectQuickForm areaId={area.id} areaName={area.nombre} origen="junta" />
      {list.length > max && (
        <p className="alert alert-yellow">
          <AlertTriangle size={18} aria-hidden /> {area.nombre} tiene {list.length} proyectos. ¿Todos necesitan foco? Recomendación: máximo {max}.
        </p>
      )}
      <h2 className="capture-title">
        Proyectos registrados de {area.nombre} <span className="count-pill">{list.length}</span>
      </h2>
      {list.length === 0 ? (
        <EmptyState title={`${area.nombre} aún no tiene proyectos`}>Usa el formulario de arriba y presiona «Guardar proyecto».</EmptyState>
      ) : (
        <ol className="capture-list" data-testid="capture-list">
          {list.map((p) => (
            <li key={p.id} className="capture-item card">
              <span className="capture-n" aria-hidden />
              <div className="capture-main">
                <strong>{p.nombre}</strong>
                <span className="small muted">
                  {personName(db.people, p.responsable)}
                  {p.fechaObjetivo && ` · objetivo ${fmtDate(p.fechaObjetivo)}`}
                  {p.dependeDe && ` · depende de ${dependencyLabel(db, p.dependeDe)}`}
                </span>
              </div>
              <ProjectStatusChip status={p.estado} />
              {p.bloqueado && <BlockedChip />}
              <button className="btn btn-ghost btn-sm" onClick={() => modals.open({ type: 'project', projectId: p.id, origen: 'junta' })} aria-label={`Editar ${p.nombre}`}>
                <Pencil size={15} aria-hidden />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void remove(p.id, p.nombre)} aria-label={`Quitar ${p.nombre}`}>
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ───────── PASO 7 POR ÁREA ───────── */
function AreaClose({ area, session, data, nextLabel, onNext }: { area: Area; session: Session; data: WeekData; nextLabel: string; onNext: () => void }) {
  const db = useDb();
  const { now } = useApp();
  const modals = useModals();
  const { confirm } = useFeedback();
  const issues = closingIssues(db, data, session);
  const active = data.projects.filter(isActiveProject).sort(sortProjectsByPriority);
  const blocks = data.blocks.filter(isBlockOpen);
  const commitments = data.commitments.filter(isOpenCommitment).sort(sortByDeadline);
  const counts = { P1: active.filter((p) => p.prioridadFinal === 'P1').length, P2: active.filter((p) => p.prioridadFinal === 'P2').length, P3: active.filter((p) => p.prioridadFinal === 'P3').length };

  const fix = (i: ClosingIssue) => {
    if (i.kind === 'bloqueo_sin_accion' && i.blockId) modals.open({ type: 'block', blockId: i.blockId, sessionId: session.id, origen: 'junta' });
    else if (i.kind === 'tema_sin_decision') modals.open({ type: 'decision', projectId: i.projectId, sessionId: session.id });
    else if (i.projectId) modals.open({ type: 'project', projectId: i.projectId, origen: 'junta' });
  };

  const next = async () => {
    if (issues.length) {
      const ok = await confirm({
        title: `${area.nombre}: ${issues.length} tema${issues.length === 1 ? '' : 's'} sin definir`,
        message: 'Puedes resolverlos ahora o continuar; quedarán señalados en el resumen final.',
        confirmLabel: 'Continuar de todos modos',
      });
      if (!ok) return;
    }
    onNext();
  };

  return (
    <div className="step close-step">
      <div className={`closing-status ${issues.length ? 'warn' : 'ok'}`} data-testid="area-closing-status">
        {issues.length === 0 ? (
          <>
            <CheckCircle2 size={28} aria-hidden /> <strong>✓ {area.nombre.toUpperCase()}: TODO CLARO</strong>
          </>
        ) : (
          <>
            <AlertTriangle size={28} aria-hidden />{' '}
            <strong>
              ⚠ {issues.length} TEMA{issues.length === 1 ? '' : 'S'} REQUIERE{issues.length === 1 ? '' : 'N'} DEFINICIÓN
            </strong>
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
          <h2>Prioridades de {area.nombre}</h2>
          <p className="small muted">
            {counts.P1} P1 · {counts.P2} P2 · {counts.P3} P3
          </p>
          <ul className="plain-list">
            {active.map((p) => (
              <li key={p.id} className="row gap wrap">
                <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />
                <strong>{p.nombre}</strong>
                <span className="small muted">{personName(db.people, p.responsable)}</span>
                {p.bloqueado && <BlockedChip />}
              </li>
            ))}
            {active.length === 0 && <li className="muted">Sin proyectos.</li>}
          </ul>
        </section>
        <section className="card section">
          <h2>Bloqueos ({blocks.length})</h2>
          <ul className="plain-list">
            {blocks.map((b) => (
              <li key={b.id}>
                <strong>{db.projects.find((p) => p.id === b.projectId)?.nombre}</strong> — {b.descripcion}
                <span className="small muted block">Depende de {dependencyLabel(db, b.areaDependencia)}</span>
                {!blockIsManaged(b, data.commitments) && <Chip tone="red">sin compromiso</Chip>}
              </li>
            ))}
            {blocks.length === 0 && <li className="muted">Sin bloqueos.</li>}
          </ul>
        </section>
        <section className="card section">
          <h2>Decisiones ({data.decisions.length})</h2>
          <ul className="plain-list">
            {data.decisions.map((d) => (
              <li key={d.id}>{d.descripcion}</li>
            ))}
            {data.decisions.length === 0 && <li className="muted">Sin decisiones.</li>}
          </ul>
        </section>
      </div>

      <section className="card section">
        <h2>
          Compromisos de {area.nombre} ({commitments.length})
        </h2>
        {commitments.length === 0 ? (
          <p className="muted">Sin compromisos.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Proyecto</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Responsable</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Hora</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {commitments.map((c) => (
                  <tr key={c.id}>
                    <td>{db.projects.find((p) => p.id === c.projectId)?.nombre}</td>
                    <td>
                      <strong>{c.accion}</strong>
                    </td>
                    <td>{personName(db.people, c.responsable)}</td>
                    <td>{c.fecha}</td>
                    <td>{c.hora}</td>
                    <td>
                      <CommitmentStatusChip status={commitmentDisplayStatus(c, now)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="close-actions">
        <button className="btn btn-primary btn-xl" onClick={() => void next()} data-testid="close-area">
          <Flag size={20} aria-hidden /> {nextLabel}
        </button>
      </div>
    </div>
  );
}

/* ───────── RESUMEN FINAL: proyectos, acuerdos y estatus ───────── */
function FinalSummary({ session, data, areas }: { session: Session; data: WeekData; areas: Area[] }) {
  const db = useDb();
  const { now } = useApp();
  const closed = new Set(session.areasCerradas ?? []);
  const pending = areas.filter((a) => !closed.has(a.id));
  const k = computeKpis(data, now);
  const commitments = data.commitments.filter(isOpenCommitment).sort(sortByDeadline);

  return (
    <div className="step final-summary" data-testid="final-summary">
      <section className="final-kpis card" aria-label="Estatus general">
        <div>
          <span>Proyectos</span>
          <strong>{k.proyectosActivos}</strong>
        </div>
        <div>
          <span>P1 · P2 · P3</span>
          <strong>
            {k.p1} · {k.p2} · {k.p3}
          </strong>
        </div>
        <div>
          <span>Bloqueados</span>
          <strong className={k.bloqueados ? 'red' : ''}>{k.bloqueados}</strong>
        </div>
        <div>
          <span>Compromisos</span>
          <strong>{k.compromisosAbiertos}</strong>
        </div>
        <div>
          <span>Decisiones</span>
          <strong>{data.decisions.length}</strong>
        </div>
        <div>
          <span>Áreas cerradas</span>
          <strong>
            {closed.size} de {areas.length}
          </strong>
        </div>
      </section>
      {pending.length > 0 && (
        <p className="alert alert-yellow">
          <AlertTriangle size={18} aria-hidden /> Falta cerrar: {pending.map((a) => a.nombre).join(', ')}.
        </p>
      )}

      {areas.map((a) => {
        const slice = sliceByArea(data, a.id);
        const projects = slice.projects.filter(isActiveProject).sort(sortProjectsByPriority);
        return (
          <section key={a.id} className="card section final-area" aria-label={a.nombre} data-testid="final-area">
            <div className="section-head">
              <h2>
                <AreaDot color={a.color} name={a.nombre} />
              </h2>
              <span className={`chip ${closed.has(a.id) ? 'chip-green' : 'chip-yellow'}`}>{closed.has(a.id) ? '✓ Cerrada' : '⚠ Sin cerrar'}</span>
            </div>
            {projects.length === 0 ? (
              <p className="muted">Sin proyectos registrados.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Prioridad</th>
                      <th scope="col">Proyecto</th>
                      <th scope="col">Responsable</th>
                      <th scope="col">Eisenhower</th>
                      <th scope="col">Estatus</th>
                      <th scope="col">Acuerdos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => {
                      const cs = slice.commitments.filter((c) => c.projectId === p.id && isOpenCommitment(c)).sort(sortByDeadline);
                      const ds = slice.decisions.filter((d) => d.projectId === p.id);
                      return (
                        <tr key={p.id}>
                          <td>
                            <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />
                          </td>
                          <td>
                            <strong>{p.nombre}</strong>
                            <span className="small muted block">score {p.score}</span>
                          </td>
                          <td>{personName(db.people, p.responsable)}</td>
                          <td>
                            <QuadrantChip q={p.eisenhower} />
                          </td>
                          <td>
                            <div className="row gap wrap">
                              <ProjectStatusChip status={p.estado} />
                              {p.bloqueado && <BlockedChip />}
                            </div>
                          </td>
                          <td className="small">
                            {cs.map((c) => (
                              <span key={c.id} className="block">
                                • {c.accion} — {personName(db.people, c.responsable)} · {fmtDeadline(c.fecha, c.hora, now)}
                              </span>
                            ))}
                            {ds.map((d) => (
                              <span key={d.id} className="block">
                                ◆ {d.descripcion}
                              </span>
                            ))}
                            {cs.length + ds.length === 0 && <span className="muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {commitments.length === 0 && <p className="muted">Aún no hay compromisos registrados.</p>}
      <Question>¿Con qué salimos de la Sesión 1?</Question>
      <Step7Close session={session} data={data} />
    </div>
  );
}
