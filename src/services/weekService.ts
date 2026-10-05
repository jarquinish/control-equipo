import { newId } from '../data/ids';
import { addDays, isoWeek, parseDate, startOfWeek, toISODate, weekIdFor } from '../domain/dates';
import { computeKpis } from '../domain/metrics';
import { getWeekData, sortWeeks, updateFromProject } from '../domain/selectors';
import { buildSummary } from '../domain/summary';
import type { Week, WeekSnapshot, WeeklyUpdate } from '../domain/types';
import { ValidationError } from '../domain/validation';
import type { ServiceContext } from './context';

export function buildWeek(date: Date, at: string): Week {
  const start = startOfWeek(date);
  const { year, week } = isoWeek(start);
  return {
    id: weekIdFor(start),
    numero: week,
    anio: year,
    fechaInicio: toISODate(start),
    fechaFin: toISODate(addDays(start, 6)),
    estado: 'abierta',
    createdAt: at,
  };
}

export function weekService(ctx: ServiceContext) {
  const { weeks } = ctx.repos;

  const setActive = (weekId: string) => {
    ctx.repos.settings.upsert({ ...ctx.settings(), activeWeekId: weekId, updatedAt: ctx.nowIso() });
  };

  /**
   * Cierra la semana: consolida una fotografía por proyecto (WeeklyUpdate) y
   * un snapshot inmutable de bloqueos, compromisos, decisiones y KPIs.
   */
  const closeWeek = (weekId: string, sessionId?: string): WeekSnapshot => {
    const week = weeks.read(weekId);
    if (!week) throw new ValidationError({ semana: 'La semana no existe.' });
    if (week.estado === 'cerrada') {
      const existing = ctx.repos.snapshots.filter((s) => s.weekId === weekId)[0];
      if (existing) return existing;
    }
    const now = ctx.now();
    const at = now.toISOString();
    return ctx.store.batch(() => {
      // 1) Fotografía final de cada proyecto vigente.
      const live = getWeekData(ctx.store.getState(), weekId, now)!;
      for (const p of live.projects) {
        const id = `wu_${weekId}_${p.id}`;
        const prev = ctx.repos.weeklyUpdates.read(id);
        const row: WeeklyUpdate = {
          id,
          ...updateFromProject(p, weekId, prev?.origen ?? 'cierre', prev?.updatedAt ?? at, {
            comentario: prev?.comentario,
            updatedBy: prev?.updatedBy,
          }),
        };
        ctx.repos.weeklyUpdates.upsert(row);
      }
      // 2) Snapshot inmutable.
      const data = getWeekData(ctx.store.getState(), weekId, now)!;
      const summary = buildSummary(ctx.store.getState(), { ...data, live: true }, now);
      const snapshot: WeekSnapshot = structuredClone({
        id: newId('snp'),
        weekId,
        sessionId,
        createdAt: at,
        projects: ctx.repos.weeklyUpdates.filter((u) => u.weekId === weekId),
        blocks: data.blocks,
        commitments: data.commitments,
        decisions: data.decisions,
        areaUpdates: data.areaUpdates,
        kpis: computeKpis(data, now, ctx.repos.commitments.list()),
        resumen: summary.markdown,
      });
      ctx.repos.snapshots.create(snapshot);
      weeks.update(weekId, { estado: 'cerrada', closedAt: at });
      return snapshot;
    });
  };

  /** Siguiente semana a abrir (sin crearla). */
  const nextWeekPreview = (): Week => {
    const all = sortWeeks(weeks.list());
    const last = all.at(-1);
    const candidate = last ? addDays(parseDate(last.fechaInicio), 7) : startOfWeek(ctx.now());
    const current = startOfWeek(ctx.now());
    const start = current.getTime() > candidate.getTime() ? current : candidate;
    return buildWeek(start, ctx.nowIso());
  };

  return {
    list: () => sortWeeks(weeks.list()),
    get: (id: string) => weeks.read(id),
    setActive,
    closeWeek,

    /** Garantiza que exista una semana activa (primera ejecución). */
    ensureCurrentWeek(): Week {
      const all = sortWeeks(weeks.list());
      if (!all.length) {
        const w = weeks.create(buildWeek(ctx.now(), ctx.nowIso()));
        setActive(w.id);
        return w;
      }
      const active = ctx.activeWeek()!;
      if (!ctx.settings().activeWeekId) setActive(active.id);
      return active;
    },

    nextWeekPreview,

    /**
     * ABRIR NUEVA SEMANA. Si la semana activa sigue abierta, se cierra primero
     * (snapshot) para no sobrescribir información histórica.
     */
    openNextWeek(): Week {
      return ctx.store.batch(() => {
        const active = ctx.activeWeek();
        if (active && active.estado === 'abierta') {
          const openSession = ctx.repos.sessions.filter((s) => s.weekId === active.id && s.estado === 'en_curso')[0];
          if (openSession) {
            ctx.repos.sessions.update(openSession.id, { estado: 'cerrada', closedAt: ctx.nowIso() });
          }
          closeWeek(active.id, openSession?.id);
        }
        const preview = nextWeekPreview();
        const existing = weeks.read(preview.id);
        const w = existing ?? weeks.create(preview);
        setActive(w.id);
        return w;
      });
    },
  };
}
