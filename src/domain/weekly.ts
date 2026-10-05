import {
  blockIsManaged,
  isActiveProject,
  isBlockOpen,
  isOpenCommitment,
  isOverdue,
  sortProjectsByPriority,
  type WeekData,
} from './selectors';
import type { Commitment, DbData, Project, Session } from './types';

/**
 * Orden de revisión del paso DETECTAR:
 * 1. P1 bloqueados · 2. P1 · 3. P2 bloqueados · 4. P2 · 5. P3 sólo si requiere atención.
 */
export function detectQueue(data: WeekData, now: Date): Project[] {
  const active = data.projects.filter(isActiveProject).sort(sortProjectsByPriority);
  const needsAttention = (p: Project) =>
    p.bloqueado ||
    p.estado === 'en_riesgo' ||
    data.commitments.some((c) => c.projectId === p.id && isOverdue(c, now)) ||
    data.blocks.some((b) => b.projectId === p.id && isBlockOpen(b));
  const groups: Project[][] = [
    active.filter((p) => p.prioridadFinal === 'P1' && p.bloqueado),
    active.filter((p) => p.prioridadFinal === 'P1' && !p.bloqueado),
    active.filter((p) => p.prioridadFinal === 'P2' && p.bloqueado),
    active.filter((p) => p.prioridadFinal === 'P2' && !p.bloqueado),
    active.filter((p) => p.prioridadFinal === 'P3' && needsAttention(p)),
  ];
  return groups.flat();
}

/** Compromisos que se revisan en el paso 1: abiertos de semanas anteriores + los atendidos en esta sesión. */
export function reviewCommitments(db: DbData, weekId: string, session?: Session): Commitment[] {
  return db.commitments
    .filter(
      (c) =>
        c.weekId !== weekId &&
        (isOpenCommitment(c) || (!!session && c.historial.some((e) => e.sessionId === session.id))),
    )
    .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
}

export type ClosingIssueKind =
  | 'bloqueo_sin_accion'
  | 'compromiso_sin_responsable'
  | 'compromiso_sin_fecha'
  | 'compromiso_sin_hora'
  | 'p1_sin_responsable'
  | 'tema_sin_decision';

export interface ClosingIssue {
  kind: ClosingIssueKind;
  message: string;
  projectId?: string;
  blockId?: string;
  commitmentId?: string;
}

/** Validaciones del paso CERRAR. */
export function closingIssues(db: DbData, data: WeekData, session?: Session): ClosingIssue[] {
  const issues: ClosingIssue[] = [];
  const name = (id: string) => data.projects.find((p) => p.id === id)?.nombre ?? db.projects.find((p) => p.id === id)?.nombre ?? 'Proyecto';

  for (const b of data.blocks.filter(isBlockOpen)) {
    if (!blockIsManaged(b, data.commitments)) {
      issues.push({
        kind: 'bloqueo_sin_accion',
        message: `Bloqueo sin acción comprometida: ${name(b.projectId)} — ${b.descripcion}`,
        projectId: b.projectId,
        blockId: b.id,
      });
    }
  }
  for (const c of data.commitments.filter(isOpenCommitment)) {
    if (!c.responsable)
      issues.push({ kind: 'compromiso_sin_responsable', message: `Compromiso sin responsable: ${c.accion}`, commitmentId: c.id, projectId: c.projectId });
    if (!c.fecha)
      issues.push({ kind: 'compromiso_sin_fecha', message: `Compromiso sin fecha: ${c.accion}`, commitmentId: c.id, projectId: c.projectId });
    if (!c.hora)
      issues.push({ kind: 'compromiso_sin_hora', message: `Compromiso sin hora: ${c.accion}`, commitmentId: c.id, projectId: c.projectId });
  }
  for (const p of data.projects.filter((x) => isActiveProject(x) && x.prioridadFinal === 'P1' && !x.responsable)) {
    issues.push({ kind: 'p1_sin_responsable', message: `P1 sin responsable: ${p.nombre}`, projectId: p.id });
  }
  if (session) {
    for (const [projectId, outcome] of Object.entries(session.deteccion)) {
      if (outcome !== 'decision') continue;
      const decided = db.decisions.some((d) => d.sessionId === session.id && d.projectId === projectId);
      if (!decided)
        issues.push({ kind: 'tema_sin_decision', message: `Tema sin decisión: ${name(projectId)}`, projectId });
    }
  }
  return issues;
}
