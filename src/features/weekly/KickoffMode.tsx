import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Flag,
  LogOut,
  Maximize2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DEPENDENCY_LABELS,
  IMPACT_LABELS,
  QUADRANT_HINTS,
  QUADRANT_LABELS,
  QUADRANTS,
  RULES,
  URGENCY_LABELS,
  WEEKLY_STEPS,
} from "../../domain/constants";
import { fmtDate } from "../../domain/dates";
import {
  isAreaStage,
  kickoffStages,
  METHOD_OBJECTIVE,
  METHOD_STEPS,
  stageIndex,
  type KickoffStage,
} from "../../domain/kickoff";
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
} from "../../domain/selectors";
import type { Area, Session } from "../../domain/types";
import {
  closingIssues,
  sliceByArea,
  type ClosingIssue,
} from "../../domain/weekly";
import { useApp, useDb, useServices, useSettings } from "../../state/app";
import { navigate } from "../../state/router";
import {
  AreaDot,
  BlockedChip,
  Chip,
  CommitmentStatusChip,
  PriorityBadge,
} from "../../ui/badges";
import { EmptyState, Question } from "../../ui/common";
import { friendlyError, useFeedback } from "../../ui/feedback";
import { PersonSelect } from "../../ui/forms";
import { useModals } from "../modals/ModalHost";
import { Step3Order, Step4Prioritize } from "./steps1to4";
import { Step5Detect, Step6Unblock, Step7Close } from "./steps5to7";
import { ValidationError } from "../../domain/validation";

const STEP_META = Object.fromEntries(WEEKLY_STEPS.map((s) => [s.n, s]));

/**
 * SESIÓN 1 · ARRANQUE
 * Metodología → Proyectos por área → (por área) Ordenar, Priorizar, Detectar,
 * Destrabar y Cerrar → Cierre general.
 */
export function KickoffFrame({
  session,
  data,
  weekNumber,
  range,
}: {
  session: Session;
  data: WeekData;
  weekNumber: number;
  range: string;
}) {
  const db = useDb();
  const services = useServices();
  const { run } = useFeedback();
  const areas = useMemo(
    () => db.areas.filter((a) => a.activo).sort((a, b) => a.orden - b.orden),
    [db.areas],
  );
  const stages = useMemo(() => kickoffStages(areas), [areas]);
  const idx = stageIndex(stages, session.etapa);
  const stage = stages[idx];
  const area = isAreaStage(stage)
    ? areas.find((a) => a.id === stage.areaId)
    : undefined;
  const closed = new Set(session.areasCerradas ?? []);
  const number = services.sessions.number(session.id);

  const go = (target: number) => {
    if (target < 0 || target >= stages.length) return;
    run(() =>
      services.ctx.store.batch(() => {
        // Salir hacia adelante del paso 7 de un área = el área queda cerrada.
        if (target > idx && isAreaStage(stage) && stage.paso === 7)
          services.sessions.closeArea(session.id, stage.areaId);
        services.sessions.setStage(session.id, stages[target].key);
      }),
    );
    document.querySelector(".meeting-body")?.scrollTo({ top: 0 });
  };

  const title = (() => {
    if (stage.key === "metodologia")
      return {
        eyebrow: `Sesión ${number} · Arranque · Metodología`,
        h1: "¿CÓMO VAMOS A TRABAJAR?",
      };
    if (stage.key === "proyectos")
      return {
        eyebrow: `Sesión ${number} · Arranque · Levantamiento`,
        h1: "¿CUÁLES SON NUESTROS PROYECTOS?",
      };
    if (stage.key === "cierre")
      return {
        eyebrow: `Sesión ${number} · Cierre general`,
        h1: "¿CON QUÉ SALIMOS?",
      };
    const s = stage as { paso: 3 | 4 | 5 | 6 | 7 };
    const meta = STEP_META[s.paso];
    return {
      eyebrow: `${area?.nombre} · Paso ${s.paso} · ${meta.titulo}`,
      h1:
        s.paso === 7
          ? `¿CON QUÉ SALE ${area?.nombre.toUpperCase()}?`
          : meta.pregunta.toUpperCase(),
    };
  })();

  const nextLabel = (() => {
    const next = stages[idx + 1];
    if (!next) return null;
    if (next.key === "proyectos") return "Proyectos por área";
    if (next.key === "cierre")
      return isAreaStage(stage)
        ? `Cerrar ${area?.nombre} · Cierre general`
        : "Cierre general";
    if (isAreaStage(next)) {
      const a = areas.find((x) => x.id === next.areaId);
      if (isAreaStage(stage) && stage.paso === 7)
        return `Cerrar ${area?.nombre} · Seguir con ${a?.nombre}`;
      if (!isAreaStage(stage)) return `Empezar con ${a?.nombre}`;
      return STEP_META[next.paso].titulo;
    }
    return "Siguiente";
  })();

  const prevLabel = (() => {
    const prev = stages[idx - 1];
    if (!prev) return null;
    if (prev.key === "metodologia") return "Metodología";
    if (prev.key === "proyectos") return "Proyectos por área";
    if (isAreaStage(prev))
      return isAreaStage(stage) && prev.areaId === stage.areaId
        ? STEP_META[prev.paso].titulo
        : `${areas.find((a) => a.id === prev.areaId)?.nombre} · Cerrar`;
    return "Anterior";
  })();

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement
        .requestFullscreen?.()
        .catch(() => undefined);
  };

  const areaData = area ? sliceByArea(data, area.id) : undefined;

  return (
    <div className="meeting kickoff" data-testid="kickoff-mode">
      <header className="meeting-top">
        <div className="meeting-brand">
          <strong>Alignment &amp; Unblock</strong>
          <span>
            Sesión {number} · Semana {weekNumber} · {range}
          </span>
        </div>
        <div
          className="meeting-progress"
          aria-label={`Etapa ${idx + 1} de ${stages.length}`}
        >
          <span className="step-count" data-testid="kickoff-stage">
            {stage.key === "metodologia"
              ? "METODOLOGÍA"
              : stage.key === "proyectos"
                ? "PROYECTOS POR ÁREA"
                : stage.key === "cierre"
                  ? "CIERRE GENERAL"
                  : `${area?.nombre.toUpperCase()} · PASO ${(stage as { paso: number }).paso} DE 7`}
          </span>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={stages.length}
            aria-valuenow={idx + 1}
          >
            <div style={{ width: `${((idx + 1) / stages.length) * 100}%` }} />
          </div>
        </div>
        <div className="meeting-tools">
          <button
            className="btn btn-ghost btn-sm"
            onClick={fullscreen}
            title="Pantalla completa"
          >
            <Maximize2 size={16} aria-hidden />{" "}
            <span className="hide-md">Pantalla completa</span>
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/weekly")}
          >
            <LogOut size={16} aria-hidden /> Salir
          </button>
        </div>
      </header>

      <div className="kickoff-navs">
        <nav className="step-pills" aria-label="Etapas de la sesión">
          <PhasePill
            label="Metodología"
            on={stage.key === "metodologia"}
            past={idx > 0}
            onClick={() => go(0)}
          />
          <PhasePill
            label="Proyectos por área"
            on={stage.key === "proyectos"}
            past={idx > 1}
            onClick={() => go(1)}
          />
          {areas.map((a) => {
            const first = stages.findIndex(
              (s) => isAreaStage(s) && s.areaId === a.id,
            );
            return (
              <PhasePill
                key={a.id}
                label={a.nombre}
                dot={a.color}
                on={area?.id === a.id}
                past={closed.has(a.id)}
                onClick={() => go(first)}
              />
            );
          })}
          <PhasePill
            label="Cierre"
            on={stage.key === "cierre"}
            past={false}
            onClick={() => go(stages.length - 1)}
          />
        </nav>
        {area && isAreaStage(stage) && (
          <nav className="substeps" aria-label={`Pasos de ${area.nombre}`}>
            {[3, 4, 5, 6, 7].map((n) => {
              const target = stages.findIndex(
                (s) => s.key === `${area.id}:${n}`,
              );
              return (
                <button
                  key={n}
                  className={`substep ${stage.paso === n ? "on" : ""} ${stage.paso > n ? "past" : ""}`}
                  onClick={() => go(target)}
                  aria-current={stage.paso === n ? "step" : undefined}
                >
                  <span className="step-n">{n}</span>
                  {STEP_META[n].titulo}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      <main className="meeting-body" id="main">
        <div className="meeting-title">
          <p className="eyebrow">{title.eyebrow}</p>
          <h1>{title.h1}</h1>
        </div>
        {stage.key === "metodologia" && <MethodologySheet areas={areas} />}
        {stage.key === "proyectos" && (
          <ProjectsByArea areas={areas} data={data} />
        )}
        {area && areaData && isAreaStage(stage) && stage.paso === 3 && (
          <Step3Order data={areaData} />
        )}
        {area && areaData && isAreaStage(stage) && stage.paso === 4 && (
          <Step4Prioritize key={area.id} session={session} data={areaData} />
        )}
        {area && areaData && isAreaStage(stage) && stage.paso === 5 && (
          <Step5Detect
            key={area.id}
            session={session}
            data={areaData}
            includeAllP3
          />
        )}
        {area && areaData && isAreaStage(stage) && stage.paso === 6 && (
          <Step6Unblock session={session} data={areaData} />
        )}
        {area && areaData && isAreaStage(stage) && stage.paso === 7 && (
          <AreaClose
            area={area}
            session={session}
            data={areaData}
            nextLabel={nextLabel ?? ""}
            onNext={() => go(idx + 1)}
          />
        )}
        {stage.key === "cierre" && (
          <GeneralClose session={session} data={data} areas={areas} />
        )}
      </main>

      <footer className="meeting-foot">
        <button
          className="btn btn-secondary btn-lg"
          disabled={idx === 0}
          onClick={() => go(idx - 1)}
        >
          <ArrowLeft size={18} aria-hidden /> {prevLabel ?? "Anterior"}
        </button>
        <span className="muted small hide-md">
          Etapa {idx + 1} de {stages.length}
        </span>
        {nextLabel ? (
          <button
            className="btn btn-primary btn-lg"
            onClick={() => go(idx + 1)}
            data-testid="kickoff-next"
          >
            {nextLabel} <ArrowRight size={18} aria-hidden />
          </button>
        ) : (
          <span />
        )}
      </footer>
    </div>
  );
}

function PhasePill({
  label,
  on,
  past,
  onClick,
  dot,
}: {
  label: string;
  on: boolean;
  past: boolean;
  onClick: () => void;
  dot?: string;
}) {
  return (
    <button
      className={`step-pill ${on ? "on" : ""} ${past ? "past" : ""}`}
      onClick={onClick}
      aria-current={on ? "step" : undefined}
    >
      {past ? (
        <CheckCircle2 size={16} className="ok" aria-hidden />
      ) : dot ? (
        <span className="area-dot" style={{ background: dot }} aria-hidden />
      ) : null}
      {label}
    </button>
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
        <p className="method-cycle">
          REVISAR → VISIBILIZAR → ORDENAR → PRIORIZAR → DETECTAR → DESTRABAR →
          COMPROMETER → CERRAR → DAR SEGUIMIENTO
        </p>
      </section>

      <section className="method-agenda card">
        <h2>Agenda de hoy</h2>
        <ol>
          <li>
            <strong>Metodología</strong> · cómo vamos a trabajar (esta hoja).
          </li>
          <li>
            <strong>Proyectos por área</strong> · cada área enlista sus
            proyectos principales (máximo{" "}
            {settings.criteria.maxProyectosPorArea} recomendados).
          </li>
          <li>
            <strong>Área por área, pasos 3 a 7</strong> ·{" "}
            {areas.map((a) => a.nombre).join(" → ")}.
          </li>
          <li>
            <strong>Cierre general</strong> · prioridades, bloqueos, decisiones
            y compromisos; resumen para Teams.
          </li>
        </ol>
        <p className="small muted">
          A partir de la siguiente semana, la Weekly recorre los 7 pasos con
          todas las áreas a la vez y empieza revisando estos compromisos.
        </p>
      </section>

      <section className="method-steps" aria-label="Los 7 pasos">
        {METHOD_STEPS.map((s) => (
          <article
            key={s.n}
            className={`method-step card ${"hoy" in s ? "muted-step" : ""}`}
          >
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
            {"hoy" in s && <p className="method-today">{s.hoy}</p>}
          </article>
        ))}
      </section>

      <div className="method-two">
        <section className="card section">
          <h2>Ponderación</h2>
          <p className="small muted">
            Score = Impacto + Urgencia + Dependencia · 8–9 → P1 · 6–7 → P2 · 3–5
            → P3
          </p>
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
                    ["Impacto", IMPACT_LABELS],
                    ["Urgencia", URGENCY_LABELS],
                    ["Dependencia", DEPENDENCY_LABELS],
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

/* ───────── PROYECTOS POR ÁREA ───────── */
function ProjectsByArea({ areas, data }: { areas: Area[]; data: WeekData }) {
  const db = useDb();
  const services = useServices();
  const settings = useSettings();
  const modals = useModals();
  const { toast, confirm } = useFeedback();
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [f, setF] = useState({
    nombre: "",
    responsable: "",
    fechaObjetivo: "",
  });
  const [error, setError] = useState<string>();
  const nameRef = useRef<HTMLInputElement>(null);
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const list = data.projects
    .filter((p) => p.areaId === area?.id && isActiveProject(p))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const max = settings.criteria.maxProyectosPorArea;

  const add = (e: FormEvent) => {
    e.preventDefault();
    try {
      services.projects.create(
        {
          nombre: f.nombre,
          areaId: area.id,
          responsable: f.responsable || undefined,
          fechaObjetivo: f.fechaObjetivo || undefined,
          impacto: 2,
          urgencia: 2,
          dependencia: 2,
        },
        { origen: "junta" },
      );
      setF((x) => ({ ...x, nombre: "", fechaObjetivo: "" }));
      setError(undefined);
      nameRef.current?.focus();
    } catch (err) {
      setError(
        err instanceof ValidationError ? err.message : friendlyError(err),
      );
    }
  };

  const remove = async (id: string, nombre: string) => {
    const ok = await confirm({
      title: "Quitar proyecto",
      message: `¿Quitar «${nombre}» de la lista?`,
      confirmLabel: "Quitar",
      danger: true,
    });
    if (!ok) return;
    services.projects.remove(id);
    toast("Proyecto quitado");
  };

  if (!area) return <EmptyState title="No hay áreas activas" />;
  return (
    <div className="step capture">
      <p className="step-lead">
        Proyectos, no actividades. Escribe el nombre y presiona <kbd>Enter</kbd>
        ; la ponderación se hace en el paso 4.
      </p>
      <div className="area-tabs" role="tablist" aria-label="Área">
        {areas.map((a) => {
          const n = data.projects.filter(
            (p) => p.areaId === a.id && isActiveProject(p),
          ).length;
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={a.id === area.id}
              className={`area-tab ${a.id === area.id ? "on" : ""}`}
              onClick={() => setAreaId(a.id)}
            >
              <span
                className="area-dot"
                style={{ background: a.color }}
                aria-hidden
              />
              {a.nombre}
              <span className="count-pill">{n}</span>
            </button>
          );
        })}
      </div>

      <form
        className="capture-form card"
        onSubmit={add}
        aria-label={`Agregar proyecto a ${area.nombre}`}
      >
        <label className="field grow">
          <span className="field-label">Proyecto de {area.nombre}</span>
          <input
            ref={nameRef}
            className="input input-lg"
            value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value })}
            placeholder="Ej. Campaña Convención"
            aria-invalid={!!error}
            autoFocus
            data-testid="capture-name"
          />
        </label>
        <div className="capture-person">
          <PersonSelect
            label="Responsable"
            value={f.responsable}
            onValue={(v) => setF({ ...f, responsable: v })}
            areaHint={area.id}
          />
        </div>
        <label className="field">
          <span className="field-label">Fecha objetivo</span>
          <input
            className="input"
            type="date"
            value={f.fechaObjetivo}
            onChange={(e) => setF({ ...f, fechaObjetivo: e.target.value })}
          />
        </label>
        <button className="btn btn-primary btn-lg" type="submit">
          <Plus size={18} aria-hidden /> Agregar
        </button>
        {error && (
          <p className="field-error capture-error" role="alert">
            {error}
          </p>
        )}
      </form>

      {list.length > max && (
        <p className="alert alert-yellow">
          <AlertTriangle size={18} aria-hidden /> {area.nombre} tiene{" "}
          {list.length} proyectos. ¿Todos necesitan foco? Recomendación: máximo{" "}
          {max}.
        </p>
      )}

      {list.length === 0 ? (
        <EmptyState title={`${area.nombre} aún no tiene proyectos`}>
          Agrega sus proyectos principales en el campo de arriba.
        </EmptyState>
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
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  modals.open({
                    type: "project",
                    projectId: p.id,
                    origen: "junta",
                  })
                }
                aria-label={`Editar ${p.nombre}`}
              >
                <Pencil size={15} aria-hidden />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => void remove(p.id, p.nombre)}
                aria-label={`Quitar ${p.nombre}`}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}

      <section className="capture-summary" aria-label="Resumen por área">
        {areas.map((a) => {
          const n = data.projects.filter(
            (p) => p.areaId === a.id && isActiveProject(p),
          ).length;
          return (
            <div key={a.id} className={`capture-sum ${n ? "ok" : "warn"}`}>
              <AreaDot color={a.color} name={a.nombre} />
              <strong>{n}</strong>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ───────── PASO 7 POR ÁREA ───────── */
function AreaClose({
  area,
  session,
  data,
  nextLabel,
  onNext,
}: {
  area: Area;
  session: Session;
  data: WeekData;
  nextLabel: string;
  onNext: () => void;
}) {
  const db = useDb();
  const { now } = useApp();
  const modals = useModals();
  const { confirm } = useFeedback();
  const issues = closingIssues(db, data, session);
  const active = data.projects
    .filter(isActiveProject)
    .sort(sortProjectsByPriority);
  const blocks = data.blocks.filter(isBlockOpen);
  const commitments = data.commitments
    .filter(isOpenCommitment)
    .sort(sortByDeadline);
  const counts = {
    P1: active.filter((p) => p.prioridadFinal === "P1").length,
    P2: active.filter((p) => p.prioridadFinal === "P2").length,
    P3: active.filter((p) => p.prioridadFinal === "P3").length,
  };

  const fix = (i: ClosingIssue) => {
    if (i.kind === "bloqueo_sin_accion" && i.blockId)
      modals.open({
        type: "block",
        blockId: i.blockId,
        sessionId: session.id,
        origen: "junta",
      });
    else if (i.kind === "tema_sin_decision")
      modals.open({
        type: "decision",
        projectId: i.projectId,
        sessionId: session.id,
      });
    else if (i.projectId)
      modals.open({ type: "project", projectId: i.projectId, origen: "junta" });
  };

  const next = async () => {
    if (issues.length) {
      const ok = await confirm({
        title: `${area.nombre}: ${issues.length} tema${issues.length === 1 ? "" : "s"} sin definir`,
        message:
          "Puedes resolverlos ahora o continuar; quedarán en el cierre general.",
        confirmLabel: "Continuar de todos modos",
      });
      if (!ok) return;
    }
    onNext();
  };

  return (
    <div className="step close-step">
      <div
        className={`closing-status ${issues.length ? "warn" : "ok"}`}
        data-testid="area-closing-status"
      >
        {issues.length === 0 ? (
          <>
            <CheckCircle2 size={28} aria-hidden />{" "}
            <strong>✓ {area.nombre.toUpperCase()}: TODO CLARO</strong>
          </>
        ) : (
          <>
            <AlertTriangle size={28} aria-hidden />{" "}
            <strong>
              ⚠ {issues.length} TEMA{issues.length === 1 ? "" : "S"} REQUIERE
              {issues.length === 1 ? "" : "N"} DEFINICIÓN
            </strong>
          </>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((i, n) => (
            <li key={n}>
              <AlertTriangle size={16} aria-hidden /> <span>{i.message}</span>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => fix(i)}
              >
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
                <PriorityBadge
                  p={p.prioridadFinal}
                  override={p.ajusteDireccion}
                />
                <strong>{p.nombre}</strong>
                <span className="small muted">
                  {personName(db.people, p.responsable)}
                </span>
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
                <strong>
                  {db.projects.find((p) => p.id === b.projectId)?.nombre}
                </strong>{" "}
                — {b.descripcion}
                <span className="small muted block">
                  Depende de {dependencyLabel(db, b.areaDependencia)}
                </span>
                {!blockIsManaged(b, data.commitments) && (
                  <Chip tone="red">sin compromiso</Chip>
                )}
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
            {data.decisions.length === 0 && (
              <li className="muted">Sin decisiones.</li>
            )}
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
                    <td>
                      {db.projects.find((p) => p.id === c.projectId)?.nombre}
                    </td>
                    <td>
                      <strong>{c.accion}</strong>
                    </td>
                    <td>{personName(db.people, c.responsable)}</td>
                    <td>{c.fecha}</td>
                    <td>{c.hora}</td>
                    <td>
                      <CommitmentStatusChip
                        status={commitmentDisplayStatus(c, now)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="close-actions">
        <button
          className="btn btn-primary btn-xl"
          onClick={() => void next()}
          data-testid="close-area"
        >
          <Flag size={20} aria-hidden /> {nextLabel}
        </button>
      </div>
    </div>
  );
}

/* ───────── CIERRE GENERAL ───────── */
function GeneralClose({
  session,
  data,
  areas,
}: {
  session: Session;
  data: WeekData;
  areas: Area[];
}) {
  const closed = new Set(session.areasCerradas ?? []);
  const pending = areas.filter((a) => !closed.has(a.id));
  return (
    <div className="step">
      <div className="capture-summary" aria-label="Áreas">
        {areas.map((a) => (
          <div
            key={a.id}
            className={`capture-sum ${closed.has(a.id) ? "ok" : "warn"}`}
          >
            <AreaDot color={a.color} name={a.nombre} />
            <span className="small">
              {closed.has(a.id) ? "✓ cerrada" : "⚠ sin cerrar"}
            </span>
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <p className="alert alert-yellow">
          <AlertTriangle size={18} aria-hidden /> Falta recorrer los pasos 3–7
          de: {pending.map((a) => a.nombre).join(", ")}.
        </p>
      )}
      <Question>¿Con qué salimos de la Sesión 1?</Question>
      <Step7Close session={session} data={data} />
    </div>
  );
}

export type { KickoffStage };
