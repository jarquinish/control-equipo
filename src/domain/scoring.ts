import type { Level, Priority, Quadrant } from './types';

/** SCORE = IMPACTO + URGENCIA + DEPENDENCIA (cada criterio 1–3, total 3–9). */
export function calcScore(impacto: Level, urgencia: Level, dependencia: Level): number {
  assertLevel(impacto, 'impacto');
  assertLevel(urgencia, 'urgencia');
  assertLevel(dependencia, 'dependencia');
  return impacto + urgencia + dependencia;
}

/** 8–9 → P1 · 6–7 → P2 · 3–5 → P3 */
export function priorityFromScore(score: number): Priority {
  if (!Number.isInteger(score) || score < 3 || score > 9) {
    throw new RangeError(`El score debe estar entre 3 y 9 (recibido: ${score}).`);
  }
  if (score >= 8) return 'P1';
  if (score >= 6) return 'P2';
  return 'P3';
}

export function isLevel(value: unknown): value is Level {
  return value === 1 || value === 2 || value === 3;
}

export function assertLevel(value: unknown, field: string): asserts value is Level {
  if (!isLevel(value)) throw new RangeError(`El valor de ${field} debe ser 1, 2 o 3.`);
}

export interface ScoringInput {
  impacto: Level;
  urgencia: Level;
  dependencia: Level;
  /** Prioridad fijada por Dirección; `undefined` = usar la calculada. */
  override?: Priority;
}

export interface ScoringResult {
  score: number;
  prioridadCalculada: Priority;
  prioridadFinal: Priority;
  ajusteDireccion: boolean;
}

export function computePriority(input: ScoringInput): ScoringResult {
  const score = calcScore(input.impacto, input.urgencia, input.dependencia);
  const prioridadCalculada = priorityFromScore(score);
  const ajusteDireccion = !!input.override && input.override !== prioridadCalculada;
  return {
    score,
    prioridadCalculada,
    prioridadFinal: ajusteDireccion ? input.override! : prioridadCalculada,
    ajusteDireccion,
  };
}

/**
 * Cuadrante sugerido a partir de impacto (importancia) y urgencia.
 * Es sólo una sugerencia: el cuadrante final lo decide el equipo.
 */
export function suggestQuadrant(impacto: Level, urgencia: Level): Quadrant {
  const importante = impacto >= 2;
  const urgente = urgencia >= 2;
  if (importante && urgente) return 'hacer';
  if (importante) return 'planificar';
  if (urgente) return 'delegar';
  return 'eliminar';
}

export function quadrantAxes(q: Quadrant): { importante: boolean; urgente: boolean } {
  return {
    importante: q === 'hacer' || q === 'planificar',
    urgente: q === 'hacer' || q === 'delegar',
  };
}

export const PRIORITY_RANK: Record<Priority, number> = { P1: 1, P2: 2, P3: 3 };
