import { newId } from '../data/ids';
import { toISODate } from '../domain/dates';
import { getWeekData } from '../domain/selectors';
import { buildSummary, type SummaryOutput } from '../domain/summary';
import type { Decision, DetectOutcome, Session, WeekSnapshot } from '../domain/types';
import { assertValid, ValidationError } from '../domain/validation';
import type { ServiceContext } from './context';
import { recordWeeklyUpdate } from './projectService';
import { blockService } from './blockService';
import { weekService } from './weekService';

export function sessionService(ctx: ServiceContext) {
  const { sessions, decisions } = ctx.repos;
  const blocks = blockService(ctx);
  const weeksSvc = weekService(ctx);

  const get = (id: string): Session => {
    const s = sessions.read(id);
    if (!s) throw new ValidationError({ sesion: 'La sesión Weekly no existe.' });
    return s;
  };

  const forWeek = (weekId: string | undefined): Session | undefined =>
    sessions
      .filter((s) => s.weekId === weekId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const patch = (id: string, p: Partial<Session>) => sessions.update(id, p);

  return {
    get,
    forWeek,

    /** INICIAR WEEKLY: crea la sesión de la semana activa o retoma la que esté en curso. */
    start(): Session {
      const week = ctx.activeWeek();
      if (!week) throw new ValidationError({ semana: 'No hay una semana activa.' });
      if (week.estado === 'cerrada')
        throw new ValidationError({ semana: `La Semana ${week.numero} ya está cerrada. Abre la siguiente semana para iniciar una nueva Weekly.` });
      const existing = forWeek(week.id);
      if (existing && existing.estado === 'en_curso') return existing;
      const at = ctx.nowIso();
      return sessions.create({
        id: newId('ses'),
        weekId: week.id,
        fecha: toISODate(ctx.now()),
        estado: 'en_curso',
        pasoActual: 1,
        proyectosRevisados: [],
        decisiones: [],
        compromisos: [],
        deteccion: {},
        desplazamientos: [],
        createdAt: at,
      });
    },

    setStep(id: string, paso: number) {
      if (paso < 1 || paso > 7) throw new RangeError('Paso fuera de rango');
      return patch(id, { pasoActual: paso });
    },

    markReviewed(id: string, projectId: string) {
      const s = get(id);
      if (s.proyectosRevisados.includes(projectId)) return s;
      const p = ctx.repos.projects.read(projectId);
      if (p) recordWeeklyUpdate(ctx, p, { origen: 'junta' });
      return patch(id, { proyectosRevisados: [...s.proyectosRevisados, projectId] });
    },

    /** Paso DETECTAR: ✓ avanza · ⚠ bloqueado · ? requiere decisión · ✓ resuelto. */
    detect(id: string, projectId: string, outcome: DetectOutcome) {
      return ctx.store.batch(() => {
        const s = get(id);
        if (outcome === 'resuelto') blocks.resolveProjectBlocks(projectId, 'junta');
        const p = ctx.repos.projects.read(projectId);
        if (p) recordWeeklyUpdate(ctx, p, { origen: 'junta' });
        return patch(id, {
          deteccion: { ...s.deteccion, [projectId]: outcome },
          proyectosRevisados: s.proyectosRevisados.includes(projectId) ? s.proyectosRevisados : [...s.proyectosRevisados, projectId],
        });
      });
    },

    addDecision(id: string | undefined, input: { projectId?: string; descripcion: string; responsable?: string }): Decision {
      assertValid(input.descripcion?.trim() ? {} : { descripcion: 'Describe la decisión tomada.' });
      const week = ctx.activeWeek();
      if (!week) throw new ValidationError({ semana: 'No hay una semana activa.' });
      return ctx.store.batch(() => {
        const d = decisions.create({
          id: newId('dec'),
          sessionId: id,
          weekId: week.id,
          projectId: input.projectId || undefined,
          descripcion: input.descripcion.trim(),
          responsable: input.responsable || undefined,
          createdAt: ctx.nowIso(),
        });
        if (id) {
          const s = get(id);
          patch(id, { decisiones: [...s.decisiones, d.id] });
        }
        return d;
      });
    },

    removeDecision(id: string | undefined, decisionId: string) {
      ctx.store.batch(() => {
        decisions.delete(decisionId);
        if (id) {
          const s = get(id);
          patch(id, { decisiones: s.decisiones.filter((x) => x !== decisionId) });
        }
      });
    },

    /**
     * Regla 8: una nueva prioridad crítica desplaza otra. El proyecto desplazado
     * baja a P2 por ajuste de Dirección y queda registrada la decisión.
     */
    displace(id: string | undefined, promovidoId: string, desplazadoId: string) {
      const promovido = ctx.repos.projects.read(promovidoId);
      const desplazado = ctx.repos.projects.read(desplazadoId);
      if (!promovido || !desplazado) throw new ValidationError({ proyecto: 'Proyecto no encontrado.' });
      return ctx.store.batch(() => {
        const at = ctx.nowIso();
        const calc = desplazado.prioridadCalculada;
        const ajuste = calc !== 'P2';
        const next = ctx.repos.projects.update(desplazadoId, {
          prioridadFinal: 'P2',
          ajusteDireccion: ajuste,
          motivoAjuste: ajuste ? `Desplazado por «${promovido.nombre}»` : undefined,
          updatedAt: at,
          updatedBy: ctx.userId(),
        });
        recordWeeklyUpdate(ctx, next, { origen: 'junta' });
        const week = ctx.activeWeek()!;
        decisions.create({
          id: newId('dec'),
          sessionId: id,
          weekId: week.id,
          projectId: promovidoId,
          descripcion: `«${promovido.nombre}» pasa a P1 y desplaza a «${desplazado.nombre}» (P2).`,
          responsable: ctx.userId(),
          createdAt: at,
        });
        if (id) {
          const s = get(id);
          patch(id, { desplazamientos: [...s.desplazamientos, { promovido: promovidoId, desplazado: desplazadoId, fecha: at }] });
        }
        return next;
      });
    },

    /** Genera el resumen ejecutivo de la semana (sin cerrarla). */
    summary(weekId?: string): SummaryOutput | undefined {
      const data = getWeekData(ctx.store.getState(), weekId ?? ctx.activeWeek()?.id, ctx.now());
      return data ? buildSummary(ctx.store.getState(), data, ctx.now()) : undefined;
    },

    /** CERRAR WEEKLY: cierra la sesión, toma el snapshot y cierra la semana. */
    close(id: string): { session: Session; snapshot: WeekSnapshot } {
      const s = get(id);
      if (s.estado === 'cerrada') throw new ValidationError({ sesion: 'Esta Weekly ya fue cerrada.' });
      return ctx.store.batch(() => {
        const snapshot = weeksSvc.closeWeek(s.weekId, s.id);
        const session = patch(id, { estado: 'cerrada', closedAt: ctx.nowIso(), resumen: snapshot.resumen, pasoActual: 7 });
        return { session, snapshot };
      });
    },
  };
}
