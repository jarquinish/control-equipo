import { toISODate } from '../domain/dates';
import { classificationFields, classifyContext, classifyProject } from '../domain/priority';
import type { Project } from '../domain/types';
import type { ServiceContext } from './context';

/** Campos de la ponderación que se congelan al cerrar el acuerdo de prioridad. */
export const LOCKED_FIELDS = ['impacto', 'urgencia', 'dependencia', 'solicitante', 'frente'] as const;

/** Dirección o Administración (en modo local sin usuario identificado se permite todo). */
export function isDirector(ctx: ServiceContext): boolean {
  const id = ctx.userId();
  const rol = ctx.store.role ?? (id ? ctx.repos.people.read(id)?.rol : undefined);
  return !rol || rol === 'ADMIN' || rol === 'DIRECTOR';
}

/** Clasificación vigente de un proyecto (con la base actual y la fecha de hoy). */
export function classificationFor(ctx: ServiceContext, p: Project) {
  const s = ctx.settings();
  const db = ctx.store.getState();
  const c = classifyProject(p, classifyContext(db, p, toISODate(ctx.now()), s.priorityMatrix!, s.criteria.umbralOperativoP1, s.criteria.umbralOperativoP2));
  const fields = classificationFields(c, p);
  // Hasta que Dirección abra la nueva versión, el ajuste del modelo anterior se conserva
  // para que quede como «nota por revalidar» (ver priorityService.migrateLegacy).
  if ((s.priorityModel ?? 1) < 2 && p.ajusteDireccion && !p.prioridadDireccion) {
    return { ...fields, prioridadFinal: p.prioridadFinal, ajusteDireccion: true, motivoAjuste: p.motivoAjuste };
  }
  return fields;
}

