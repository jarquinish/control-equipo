import { deadline, isValidDate, isValidTime } from './dates';
import { inWeek, isActiveProject, isBlockOpen, isOpenCommitment, isOverdue, sortWeeks, weekEnd, weekStart, type WeekData } from './selectors';
import type { Commitment, DbData, KpiSet, Week } from './types';

export interface Compliance {
  cumplidos: number;
  incumplidos: number;
  vencidos: number;
  evaluables: number;
  /** 0–100 o null si no hay compromisos evaluables. */
  rate: number | null;
}

const DAY = 86_400_000;

/**
 * Cumplimiento de compromisos en una ventana: considera los compromisos cuya
 * fecha/hora ORIGINAL cae en [from, to] (o que se cerraron en ella) y que ya son
 * evaluables: cumplidos, incumplidos o vencidos. Un compromiso reprogramado que
 * aún no vence no cuenta todavía.
 */
export function complianceRate(commitments: Commitment[], now: Date, from: Date, to: Date): Compliance {
  const inRange = (t: number) => t >= from.getTime() && t <= to.getTime();
  const set = commitments.filter((c) => {
    const orig = isValidDate(c.fechaOriginal) && isValidTime(c.horaOriginal) ? deadline(c.fechaOriginal, c.horaOriginal).getTime() : NaN;
    return inRange(orig) || (!!c.completedAt && inRange(new Date(c.completedAt).getTime()));
  });
  const cumplidos = set.filter((c) => c.estado === 'cumplido').length;
  const incumplidos = set.filter((c) => c.estado === 'incumplido').length;
  const vencidos = set.filter((c) => isOverdue(c, now)).length;
  const evaluables = cumplidos + incumplidos + vencidos;
  return { cumplidos, incumplidos, vencidos, evaluables, rate: evaluables ? Math.round((cumplidos / evaluables) * 100) : null };
}

/** Cumplimiento de los compromisos que vencían (originalmente) en esa semana. */
export function weekCompliance(commitments: Commitment[], week: Week, now: Date): Compliance {
  const end = new Date(Math.min(weekEnd(week).getTime() - 1, now.getTime()));
  return complianceRate(commitments, now, weekStart(week), end);
}

/**
 * KPIs de una semana. El cumplimiento es móvil: últimas 4 semanas hasta `now`
 * (para no marcar 0 % un lunes por la mañana). `allCommitments` permite incluir
 * compromisos ya cerrados en semanas anteriores.
 */
export function computeKpis(data: Pick<WeekData, 'projects' | 'blocks' | 'commitments' | 'week'>, now: Date, allCommitments?: Commitment[]): KpiSet {
  const active = data.projects.filter(isActiveProject);
  const open = data.commitments.filter(isOpenCommitment);
  const vencidos = open.filter((c) => isOverdue(c, now)).length;
  const comp = complianceRate(allCommitments ?? data.commitments, now, new Date(now.getTime() - 28 * DAY), now);
  const { cumplidos, incumplidos } = comp;
  const reprogramaciones = data.commitments.reduce(
    (n, c) => n + c.historial.filter((e) => e.tipo === 'reprogramado' && inWeek(e.fecha, data.week)).length,
    0,
  );
  return {
    proyectosActivos: active.length,
    p1: active.filter((p) => p.prioridadFinal === 'P1').length,
    p2: active.filter((p) => p.prioridadFinal === 'P2').length,
    p3: active.filter((p) => p.prioridadFinal === 'P3').length,
    bloqueados: active.filter((p) => p.bloqueado).length,
    compromisosAbiertos: open.length,
    vencidos,
    cumplidos,
    incumplidos,
    cumplimiento: comp.rate,
    evaluables: comp.evaluables,
    reprogramaciones,
    escalados:
      open.filter((c) => c.estado === 'escalado').length + data.blocks.filter((b) => b.estado === 'escalado').length,
    p1Bloqueados: active.filter((p) => p.prioridadFinal === 'P1' && p.bloqueado).length,
    bloqueosAbiertos: data.blocks.filter(isBlockOpen).length,
    bloqueosResueltos: data.blocks.filter((b) => b.estado === 'resuelto').length,
  };
}

export interface HealthReport {
  semanas: { week: Week; kpis: KpiSet; cerrada: boolean }[];
  /** Horas promedio entre que se registra un bloqueo y se resuelve. */
  tiempoPromedioDesbloqueoHoras: number | null;
  /** Áreas / entidades de las que más se depende (bloqueos recurrentes). */
  dependenciasRecurrentes: { key: string; total: number; abiertos: number }[];
  /** Proyectos con bloqueos en varias semanas distintas. */
  bloqueosRecurrentes: { projectId: string; semanas: number; total: number }[];
  /** Proyectos abiertos durante demasiadas semanas. */
  proyectosLargos: { projectId: string; semanas: number }[];
  totales: {
    compromisos: number;
    cumplidos: number;
    incumplidos: number;
    vencidos: number;
    reprogramaciones: number;
    cumplimiento: number | null;
  };
}

/**
 * Indicadores de salud del SISTEMA (no de personas): sirven para detectar
 * cuellos de botella, dependencias recurrentes y exceso de reprogramaciones.
 */
export function computeHealth(db: DbData, now: Date, semanasProyectoLargo: number, currentKpis?: { weekId: string; kpis: KpiSet }): HealthReport {
  const weeks = sortWeeks(db.weeks);
  const semanas = weeks.map((week) => {
    const snap = db.snapshots.find((s) => s.weekId === week.id);
    const kpis =
      currentKpis && currentKpis.weekId === week.id ? currentKpis.kpis : snap?.kpis;
    return kpis ? { week, kpis, cerrada: week.estado === 'cerrada' } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const resolved = db.blocks.filter((b) => b.resolvedAt);
  const tiempoPromedioDesbloqueoHoras = resolved.length
    ? Math.round(
        resolved.reduce((sum, b) => sum + (new Date(b.resolvedAt!).getTime() - new Date(b.createdAt).getTime()), 0) /
          resolved.length /
          3_600_000,
      )
    : null;

  const depMap = new Map<string, { total: number; abiertos: number }>();
  for (const b of db.blocks) {
    if (!b.areaDependencia) continue;
    const e = depMap.get(b.areaDependencia) ?? { total: 0, abiertos: 0 };
    e.total++;
    if (isBlockOpen(b)) e.abiertos++;
    depMap.set(b.areaDependencia, e);
  }
  const dependenciasRecurrentes = [...depMap.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.total - a.total || b.abiertos - a.abiertos);

  const blockWeeks = new Map<string, { weeks: Set<string>; total: number }>();
  for (const b of db.blocks) {
    const e = blockWeeks.get(b.projectId) ?? { weeks: new Set(), total: 0 };
    e.weeks.add(b.weekId);
    e.total++;
    blockWeeks.set(b.projectId, e);
  }
  for (const s of db.snapshots) {
    for (const u of s.projects) {
      if (!u.bloqueado) continue;
      const e = blockWeeks.get(u.projectId) ?? { weeks: new Set(), total: 0 };
      e.weeks.add(s.weekId);
      blockWeeks.set(u.projectId, e);
    }
  }
  const bloqueosRecurrentes = [...blockWeeks.entries()]
    .map(([projectId, v]) => ({ projectId, semanas: v.weeks.size, total: v.total }))
    .filter((x) => x.semanas >= 2)
    .sort((a, b) => b.semanas - a.semanas);

  const proyectosLargos = db.projects
    .filter(isActiveProject)
    .map((p) => {
      const ws = new Set(db.weeklyUpdates.filter((u) => u.projectId === p.id).map((u) => u.weekId));
      const ageWeeks = Math.floor((now.getTime() - new Date(p.createdAt).getTime()) / (7 * 86_400_000)) + 1;
      return { projectId: p.id, semanas: Math.max(ws.size, ageWeeks) };
    })
    .filter((x) => x.semanas >= semanasProyectoLargo)
    .sort((a, b) => b.semanas - a.semanas);

  const cumplidos = db.commitments.filter((c) => c.estado === 'cumplido').length;
  const incumplidos = db.commitments.filter((c) => c.estado === 'incumplido').length;
  const vencidos = db.commitments.filter((c) => isOverdue(c, now)).length;
  const evaluables = cumplidos + incumplidos + vencidos;

  return {
    semanas,
    tiempoPromedioDesbloqueoHoras,
    dependenciasRecurrentes,
    bloqueosRecurrentes,
    proyectosLargos,
    totales: {
      compromisos: db.commitments.length,
      cumplidos,
      incumplidos,
      vencidos,
      reprogramaciones: db.commitments.reduce((n, c) => n + c.reprogramaciones, 0),
      cumplimiento: evaluables ? Math.round((cumplidos / evaluables) * 100) : null,
    },
  };
}
