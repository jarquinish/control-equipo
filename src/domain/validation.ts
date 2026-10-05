import { isValidDate, isValidTime } from './dates';
import { isLevel } from './scoring';
import { PRIORITIES, PROJECT_STATUSES, QUADRANTS } from './constants';

export type FieldErrors = Record<string, string>;

/** Error de validación con mensajes por campo, pensados para el usuario final. */
export class ValidationError extends Error {
  constructor(public readonly errors: FieldErrors) {
    super(Object.values(errors)[0] ?? 'Revisa la información capturada.');
    this.name = 'ValidationError';
  }
}

export function assertValid(errors: FieldErrors): void {
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export interface ProjectInputLike {
  nombre?: string;
  areaId?: string;
  impacto?: unknown;
  urgencia?: unknown;
  dependencia?: unknown;
  fechaObjetivo?: string;
  eisenhower?: string;
  estado?: string;
  prioridadFinal?: string;
}

export function validateProject(input: ProjectInputLike, partial = false): FieldErrors {
  const e: FieldErrors = {};
  if (!partial || input.nombre !== undefined) {
    if (!text(input.nombre)) e.nombre = 'El proyecto necesita un nombre.';
    else if (text(input.nombre).length > 120) e.nombre = 'El nombre es demasiado largo (máx. 120 caracteres).';
  }
  if (!partial || input.areaId !== undefined) {
    if (!input.areaId) e.areaId = 'Selecciona el área responsable.';
  }
  for (const f of ['impacto', 'urgencia', 'dependencia'] as const) {
    if (!partial || input[f] !== undefined) {
      if (!isLevel(input[f])) e[f] = 'Elige un valor entre 1 y 3.';
    }
  }
  if (input.fechaObjetivo && !isValidDate(input.fechaObjetivo)) e.fechaObjetivo = 'La fecha objetivo no es válida.';
  if (input.eisenhower !== undefined && !QUADRANTS.includes(input.eisenhower as never))
    e.eisenhower = 'Cuadrante no válido.';
  if (input.estado !== undefined && !PROJECT_STATUSES.includes(input.estado as never)) e.estado = 'Estado no válido.';
  if (input.prioridadFinal !== undefined && !PRIORITIES.includes(input.prioridadFinal as never))
    e.prioridadFinal = 'Prioridad no válida.';
  return e;
}

export interface CommitmentInputLike {
  accion?: string;
  responsable?: string;
  fecha?: string;
  hora?: string;
  projectId?: string;
}

export function validateCommitment(input: CommitmentInputLike): FieldErrors {
  const e: FieldErrors = {};
  if (!input.projectId) e.projectId = 'Selecciona el proyecto.';
  if (!text(input.accion)) e.accion = 'Describe la acción concreta que se hará.';
  if (!input.responsable) e.responsable = 'Toda acción necesita un responsable.';
  if (!input.fecha) e.fecha = 'Define la fecha compromiso.';
  else if (!isValidDate(input.fecha)) e.fecha = 'La fecha no es válida.';
  if (!input.hora) e.hora = 'Define la hora compromiso.';
  else if (!isValidTime(input.hora)) e.hora = 'La hora no es válida (usa formato 24 h, p. ej. 13:00).';
  return e;
}

export interface BlockInputLike {
  projectId?: string;
  descripcion?: string;
  necesidad?: string;
  areaDependencia?: string;
}

export function validateBlock(input: BlockInputLike): FieldErrors {
  const e: FieldErrors = {};
  if (!input.projectId) e.projectId = 'Selecciona el proyecto bloqueado.';
  if (!text(input.descripcion)) e.descripcion = 'Explica qué está bloqueando el proyecto.';
  return e;
}

export function validateReschedule(input: { fecha?: string; hora?: string; motivo?: string }): FieldErrors {
  const e: FieldErrors = {};
  if (!input.fecha || !isValidDate(input.fecha)) e.fecha = 'Define una nueva fecha válida.';
  if (!input.hora || !isValidTime(input.hora)) e.hora = 'Define una nueva hora válida.';
  if (!text(input.motivo)) e.motivo = 'Indica el motivo de la reprogramación.';
  return e;
}
