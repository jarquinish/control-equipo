import { newId } from '../data/ids';
import { calcScore, suggestQuadrant } from '../domain/scoring';
import { isBlockOpen, updateFromProject } from '../domain/selectors';
import type { Level, Project, ProjectStatus, Quadrant, UpdateOrigin, WeeklyUpdate } from '../domain/types';
import { assertValid, validateProject, ValidationError } from '../domain/validation';
import { classificationFor, isDirector, LOCKED_FIELDS } from './classification';
import type { ServiceContext } from './context';

export interface ProjectInput {
  nombre: string;
  descripcion?: string;
  areaId: string;
  responsable?: string;
  fechaObjetivo?: string;
  impacto: Level;
  urgencia: Level;
  dependencia: Level;
  eisenhower?: Quadrant;
  estado?: ProjectStatus;
  dependeDe?: string;
  ref?: string;
  solicitante?: string;
  frente?: string;
}

export interface UpdateOptions {
  origen?: UpdateOrigin;
  comentario?: string;
}

/** Fotografía semanal: un registro por proyecto y semana (id determinista → no se duplica). */
export function recordWeeklyUpdate(ctx: ServiceContext, project: Project, opts: UpdateOptions = {}): WeeklyUpdate | undefined {
  const week = ctx.activeWeek();
  if (!week || week.estado !== 'abierta') return undefined;
  const id = `wu_${week.id}_${project.id}`;
  const prev = ctx.repos.weeklyUpdates.read(id);
  const row: WeeklyUpdate = {
    id,
    ...updateFromProject(project, week.id, opts.origen ?? 'area', ctx.nowIso(), {
      comentario: opts.comentario?.trim() || prev?.comentario,
      updatedBy: ctx.userId(),
    }),
  };
  return ctx.repos.weeklyUpdates.upsert(row);
}

/** Mantiene `project.bloqueado` sincronizado con sus bloqueos abiertos. */
export function syncProjectBlocked(ctx: ServiceContext, projectId: string, origen: UpdateOrigin = 'area'): Project | undefined {
  const p = ctx.repos.projects.read(projectId);
  if (!p) return undefined;
  const bloqueado = ctx.repos.blocks.list().some((b) => b.projectId === projectId && isBlockOpen(b));
  if (bloqueado === p.bloqueado) return p;
  const next = ctx.repos.projects.update(projectId, { bloqueado, updatedAt: ctx.nowIso(), updatedBy: ctx.userId() });
  recordWeeklyUpdate(ctx, next, { origen });
  return next;
}

export function projectService(ctx: ServiceContext) {
  const { projects } = ctx.repos;

  const get = (id: string): Project => {
    const p = projects.read(id);
    if (!p) throw new ValidationError({ proyecto: 'El proyecto ya no existe.' });
    return p;
  };

  const create = (input: ProjectInput, opts: UpdateOptions = {}): Project => {
    assertValid(validateProject(input));
    if (!ctx.repos.areas.read(input.areaId)) throw new ValidationError({ areaId: 'El área seleccionada no existe.' });
    const at = ctx.nowIso();
    const base: Project = {
      id: newId('prj'),
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() ?? '',
      areaId: input.areaId,
      responsable: input.responsable || undefined,
      impacto: input.impacto,
      urgencia: input.urgencia,
      dependencia: input.dependencia,
      score: calcScore(input.impacto, input.urgencia, input.dependencia),
      prioridadCalculada: 'P3',
      prioridadFinal: 'P3',
      ajusteDireccion: false,
      eisenhower: input.eisenhower ?? suggestQuadrant(input.impacto, input.urgencia),
      estado: input.estado ?? 'en_curso',
      bloqueado: false,
      fechaObjetivo: input.fechaObjetivo || undefined,
      dependeDe: input.dependeDe || undefined,
      ref: input.ref?.trim() || undefined,
      solicitante: input.solicitante?.trim() || undefined,
      frente: input.frente?.trim() || undefined,
      createdWeekId: ctx.activeWeek()?.id,
      createdAt: at,
      updatedAt: at,
      updatedBy: ctx.userId(),
    };
    const project: Project = { ...base, ...classificationFor(ctx, base) };
    projects.create(project);
    recordWeeklyUpdate(ctx, project, opts);
    return project;
  };

  /** Actualiza un proyecto y recalcula su clasificación (lo establecido por Dirección se conserva). */
  const update = (id: string, patch: Partial<ProjectInput>, opts: UpdateOptions = {}): Project => {
    const current = get(id);
    assertValid(validateProject(patch, true));
    if (current.acuerdo?.bloqueado && !isDirector(ctx)) {
      const val = (v: unknown) => (typeof v === 'string' ? v.trim() || undefined : v);
      const touched = LOCKED_FIELDS.filter((f) => f in patch && val(patch[f]) !== val(current[f]));
      if (touched.length)
        throw new ValidationError({ acuerdo: 'El acuerdo de prioridad de este proyecto está cerrado: sólo Dirección puede cambiar su ponderación.' });
    }
    const merged: Project = {
      ...current,
      ...patch,
      nombre: patch.nombre?.trim() ?? current.nombre,
      responsable: 'responsable' in patch ? patch.responsable || undefined : current.responsable,
      fechaObjetivo: 'fechaObjetivo' in patch ? patch.fechaObjetivo || undefined : current.fechaObjetivo,
      solicitante: 'solicitante' in patch ? patch.solicitante?.trim() || undefined : current.solicitante,
      frente: 'frente' in patch ? patch.frente?.trim() || undefined : current.frente,
    };
    merged.score = calcScore(merged.impacto, merged.urgencia, merged.dependencia);
    const next = projects.update(id, {
      ...patch,
      nombre: merged.nombre,
      responsable: merged.responsable,
      fechaObjetivo: merged.fechaObjetivo,
      solicitante: merged.solicitante,
      frente: merged.frente,
      score: merged.score,
      ...classificationFor(ctx, merged),
      updatedAt: ctx.nowIso(),
      updatedBy: ctx.userId(),
    });
    recordWeeklyUpdate(ctx, next, opts);
    return next;
  };

  const setStatus = (id: string, estado: ProjectStatus, opts: UpdateOptions = {}): Project => {
    get(id);
    const at = ctx.nowIso();
    const closing = estado === 'completado' || estado === 'archivado';
    return ctx.store.batch(() => {
      if (closing) {
        // Un proyecto cerrado no conserva bloqueos abiertos.
        for (const b of ctx.repos.blocks.filter((x) => x.projectId === id && isBlockOpen(x))) {
          ctx.repos.blocks.update(b.id, { estado: 'resuelto', resolvedAt: at, updatedAt: at });
        }
      }
      const next = projects.update(id, {
        estado,
        bloqueado: closing ? false : get(id).bloqueado,
        closedAt: closing ? at : undefined,
        updatedAt: at,
        updatedBy: ctx.userId(),
      });
      recordWeeklyUpdate(ctx, next, opts);
      return next;
    });
  };

  return {
    list: () => projects.list(),
    get,
    create,
    update,
    setStatus,
    setQuadrant: (id: string, eisenhower: Quadrant, opts: UpdateOptions = {}) => {
      get(id);
      const next = projects.update(id, { eisenhower, updatedAt: ctx.nowIso(), updatedBy: ctx.userId() });
      recordWeeklyUpdate(ctx, next, opts);
      return next;
    },
    /** CONTINUAR: el proyecto sigue igual, pero queda registrada la actualización semanal. */
    continue: (id: string, comentario?: string, opts: UpdateOptions = {}) => {
      const p = projects.update(id, { updatedAt: ctx.nowIso(), updatedBy: ctx.userId() });
      return recordWeeklyUpdate(ctx, p, { ...opts, comentario });
    },
    comment: (id: string, comentario: string) => recordWeeklyUpdate(ctx, get(id), { comentario }),
    close: (id: string, opts: UpdateOptions = {}) => setStatus(id, 'completado', opts),
    archive: (id: string, opts: UpdateOptions = {}) => setStatus(id, 'archivado', opts),
    /** Elimina definitivamente (los snapshots históricos se conservan). */
    remove(id: string) {
      ctx.store.batch(() => {
        for (const c of ctx.repos.commitments.filter((x) => x.projectId === id)) ctx.repos.commitments.delete(c.id);
        for (const b of ctx.repos.blocks.filter((x) => x.projectId === id)) ctx.repos.blocks.delete(b.id);
        projects.delete(id);
      });
    },
  };
}
