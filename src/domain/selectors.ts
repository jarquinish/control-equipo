import {
  ACTIVE_PROJECT_STATUSES,
  DEFAULT_CRITERIA,
  DEFAULT_EXTERNAL_DEPENDENCIES,
  DEFAULT_STATUS_LABELS,
  SCHEMA_VERSION,
} from './constants';
import { deadline, hoursUntil, isSameDay, isValidDate, isValidTime, parseDate } from './dates';
import { PRIORITY_RANK } from './scoring';
import type {
  AreaUpdate,
  Block,
  Commitment,
  CommitmentDisplayStatus,
  DbData,
  Decision,
  Person,
  Project,
  Settings,
  Week,
  WeeklyUpdate,
  WeekSnapshot,
} from './types';

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    externalDependencies: [...DEFAULT_EXTERNAL_DEPENDENCIES],
    statusLabels: { ...DEFAULT_STATUS_LABELS },
    criteria: { ...DEFAULT_CRITERIA },
    orgName: 'Dirección de Posicionamiento · SOC',
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
  };
}

export function getSettings(db: DbData): Settings {
  const s = db.settings[0];
  if (!s) return defaultSettings();
  const d = defaultSettings();
  return {
    ...d,
    ...s,
    criteria: { ...d.criteria, ...s.criteria },
    statusLabels: { ...d.statusLabels, ...s.statusLabels },
  };
}

/* ───────────── Semanas ───────────── */

export function sortWeeks(weeks: Week[]): Week[] {
  return [...weeks].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
}

export function getActiveWeek(db: DbData): Week | undefined {
  const s = getSettings(db);
  return db.weeks.find((w) => w.id === s.activeWeekId) ?? sortWeeks(db.weeks).at(-1);
}

export function weekStart(week: Week): Date {
  return parseDate(week.fechaInicio);
}

/** Momento final (exclusivo) de la semana: lunes siguiente 00:00. */
export function weekEnd(week: Week): Date {
  const d = parseDate(week.fechaFin);
  d.setDate(d.getDate() + 1);
  return d;
}

export function inWeek(iso: string | undefined, week: Week): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= weekStart(week).getTime() && t < weekEnd(week).getTime();
}

export function weekLabel(week: Week | undefined): string {
  return week ? `Semana ${week.numero}` : 'Sin semana';
}

/* ───────────── Compromisos ───────────── */

export const OPEN_COMMITMENT_STATUSES = ['pendiente', 'en_gestion', 'reprogramado', 'escalado'] as const;

export function isOpenCommitment(c: Commitment): boolean {
  return (OPEN_COMMITMENT_STATUSES as readonly string[]).includes(c.estado);
}

export function commitmentDeadline(c: Commitment): Date | null {
  if (!isValidDate(c.fecha) || !isValidTime(c.hora)) return null;
  return deadline(c.fecha, c.hora);
}

export function isOverdue(c: Commitment, now: Date): boolean {
  const d = commitmentDeadline(c);
  return isOpenCommitment(c) && !!d && d.getTime() < now.getTime();
}

export function isDueToday(c: Commitment, now: Date): boolean {
  const d = commitmentDeadline(c);
  return isOpenCommitment(c) && !!d && d.getTime() >= now.getTime() && isSameDay(d, now);
}

export function isDueSoon(c: Commitment, now: Date, hours: number): boolean {
  const d = commitmentDeadline(c);
  if (!isOpenCommitment(c) || !d) return false;
  const h = hoursUntil(d, now);
  return h >= 0 && h <= hours;
}

/** Estado a mostrar: un compromiso abierto cuya fecha/hora ya pasó se muestra VENCIDO. */
export function commitmentDisplayStatus(c: Commitment, now: Date): CommitmentDisplayStatus {
  if (c.estado !== 'escalado' && isOverdue(c, now)) return 'vencido';
  return c.estado;
}

export function isCommitmentComplete(c: Partial<Commitment>): boolean {
  return !!c.accion?.trim() && !!c.responsable && isValidDate(c.fecha) && isValidTime(c.hora);
}

export function sortByDeadline(a: Commitment, b: Commitment): number {
  return `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`);
}

/* ───────────── Bloqueos ───────────── */

export function isBlockOpen(b: Block): boolean {
  return b.estado !== 'resuelto';
}

/** Un bloqueo se considera gestionado sólo con acción + responsable + fecha + hora. */
export function blockCommitments(block: Block, commitments: Commitment[]): Commitment[] {
  return commitments.filter((c) => c.blockId === block.id);
}

export function blockIsManaged(block: Block, commitments: Commitment[]): boolean {
  return blockCommitments(block, commitments).some(
    (c) => isCommitmentComplete(c) && c.estado !== 'incumplido',
  );
}

/** Compromiso abierto más próximo del bloqueo (su deadline). */
export function blockNextCommitment(block: Block, commitments: Commitment[]): Commitment | undefined {
  return blockCommitments(block, commitments).filter(isOpenCommitment).sort(sortByDeadline)[0];
}

export function blockIsOverdue(block: Block, commitments: Commitment[], now: Date): boolean {
  if (!isBlockOpen(block)) return false;
  return blockCommitments(block, commitments).some((c) => isOverdue(c, now));
}

/* ───────────── Proyectos ───────────── */

export function isActiveProject(p: Project): boolean {
  return ACTIVE_PROJECT_STATUSES.includes(p.estado);
}

export function sortProjectsByPriority(a: Project, b: Project): number {
  return (
    PRIORITY_RANK[a.prioridadFinal] - PRIORITY_RANK[b.prioridadFinal] ||
    b.score - a.score ||
    Number(b.bloqueado) - Number(a.bloqueado) ||
    a.nombre.localeCompare(b.nombre, 'es')
  );
}

/** Proyecto reconstruido desde una fotografía semanal. */
export function projectFromUpdate(u: WeeklyUpdate, base?: Project): Project {
  return {
    id: u.projectId,
    createdAt: base?.createdAt ?? u.updatedAt,
    updatedAt: u.updatedAt,
    descripcion: base?.descripcion ?? '',
    nombre: u.nombre,
    areaId: u.areaId,
    responsable: u.responsable,
    impacto: u.impacto,
    urgencia: u.urgencia,
    dependencia: u.dependencia,
    score: u.score,
    prioridadCalculada: u.prioridadCalculada ?? u.prioridad,
    prioridadFinal: u.prioridad,
    ajusteDireccion: u.ajusteDireccion ?? false,
    motivoAjuste: base?.motivoAjuste,
    eisenhower: u.eisenhower,
    estado: u.estado,
    bloqueado: u.bloqueado,
    fechaObjetivo: u.fechaObjetivo,
    dependeDe: u.dependeDe,
    createdWeekId: base?.createdWeekId,
  };
}

export function updateFromProject(
  p: Project,
  weekId: string,
  origen: WeeklyUpdate['origen'],
  at: string,
  extra: Partial<WeeklyUpdate> = {},
): Omit<WeeklyUpdate, 'id'> {
  return {
    weekId,
    projectId: p.id,
    areaId: p.areaId,
    nombre: p.nombre,
    responsable: p.responsable,
    estado: p.estado,
    impacto: p.impacto,
    urgencia: p.urgencia,
    dependencia: p.dependencia,
    score: p.score,
    prioridad: p.prioridadFinal,
    prioridadCalculada: p.prioridadCalculada,
    ajusteDireccion: p.ajusteDireccion,
    eisenhower: p.eisenhower,
    bloqueado: p.bloqueado,
    fechaObjetivo: p.fechaObjetivo,
    dependeDe: p.dependeDe,
    origen,
    updatedAt: at,
    ...extra,
  };
}

/* ───────────── Datos de una semana (vivo o histórico) ───────────── */

export interface WeekData {
  week: Week;
  /** true = datos vivos de la semana activa; false = fotografía histórica. */
  live: boolean;
  readOnly: boolean;
  projects: Project[];
  blocks: Block[];
  commitments: Commitment[];
  decisions: Decision[];
  areaUpdates: AreaUpdate[];
  weeklyUpdates: WeeklyUpdate[];
  snapshot?: WeekSnapshot;
  /** Momento de referencia para calcular vencimientos. */
  asOf: Date;
}

export function getSnapshot(db: DbData, weekId: string): WeekSnapshot | undefined {
  return db.snapshots
    .filter((s) => s.weekId === weekId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function liveSelection(db: DbData, week: Week) {
  const start = weekStart(week).getTime();
  const after = (iso?: string) => !!iso && new Date(iso).getTime() >= start;
  const projects = db.projects.filter(
    (p) => p.estado !== 'archivado' && (p.estado !== 'completado' || after(p.closedAt) || after(p.updatedAt)),
  );
  const blocks = db.blocks.filter((b) => isBlockOpen(b) || after(b.resolvedAt) || b.weekId === week.id);
  const commitments = db.commitments.filter(
    (c) => isOpenCommitment(c) || c.weekId === week.id || after(c.completedAt) || after(c.updatedAt),
  );
  return { projects, blocks, commitments };
}

export function getWeekData(db: DbData, weekId: string | undefined, now: Date): WeekData | undefined {
  const week = db.weeks.find((w) => w.id === weekId) ?? getActiveWeek(db);
  if (!week) return undefined;
  const settings = getSettings(db);
  const snapshot = week.estado === 'cerrada' ? getSnapshot(db, week.id) : undefined;
  const weeklyUpdates = db.weeklyUpdates.filter((u) => u.weekId === week.id);

  if (snapshot) {
    const byId = new Map(db.projects.map((p) => [p.id, p]));
    return {
      week,
      live: false,
      readOnly: true,
      projects: snapshot.projects.map((u) => projectFromUpdate(u, byId.get(u.projectId))),
      blocks: snapshot.blocks,
      commitments: snapshot.commitments,
      decisions: snapshot.decisions,
      areaUpdates: snapshot.areaUpdates,
      weeklyUpdates,
      snapshot,
      asOf: new Date(snapshot.createdAt),
    };
  }

  const isActive = week.id === settings.activeWeekId || week.id === getActiveWeek(db)?.id;
  const sel = liveSelection(db, week);
  return {
    week,
    live: isActive && week.estado === 'abierta',
    readOnly: week.estado === 'cerrada' || !isActive,
    ...sel,
    decisions: db.decisions.filter((d) => d.weekId === week.id),
    areaUpdates: db.areaUpdates.filter((a) => a.weekId === week.id),
    weeklyUpdates,
    asOf: now,
  };
}

export function personName(people: Person[], id: string | undefined, fallback = 'Sin responsable'): string {
  if (!id) return fallback;
  return people.find((p) => p.id === id)?.nombre ?? fallback;
}

/** Nombre legible de una dependencia (`id` de área o `ext:Nombre`). */
export function dependencyLabel(db: DbData, key: string | undefined): string {
  if (!key) return '—';
  if (key.startsWith('ext:')) return key.slice(4);
  return db.areas.find((a) => a.id === key)?.nombre ?? key;
}

export function projectUpdatedThisWeek(data: WeekData, projectId: string): boolean {
  return data.weeklyUpdates.some((u) => u.projectId === projectId && u.origen !== 'cierre');
}

export function areaUpdateFor(data: WeekData, areaId: string): AreaUpdate | undefined {
  return data.areaUpdates.find((a) => a.areaId === areaId);
}
