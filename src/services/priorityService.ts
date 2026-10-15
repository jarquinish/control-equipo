import { newId } from '../data/ids';
import { sameClasif } from '../domain/priority';
import type { Priority, PriorityAxis, PriorityLog, PriorityMatrix, Project } from '../domain/types';
import { ValidationError } from '../domain/validation';
import type { ServiceContext } from './context';
import { classificationFor, isDirector } from './classification';
import { recordWeeklyUpdate } from './projectService';

export type LogOrigin = PriorityLog['fuente'];

export function priorityService(ctx: ServiceContext) {
  const { projects, priorityLog } = ctx.repos;

  const get = (id: string): Project => {
    const p = projects.read(id);
    if (!p) throw new ValidationError({ proyecto: 'El proyecto ya no existe.' });
    return p;
  };

  const requireDirector = (accion: string) => {
    if (!isDirector(ctx)) throw new ValidationError({ permiso: `Sólo Dirección puede ${accion}.` });
  };

  const log = (p: Project, entry: Omit<PriorityLog, 'id' | 'projectId' | 'areaId' | 'createdAt' | 'responsable'>) =>
    priorityLog.create({ id: newId('plog'), projectId: p.id, areaId: p.areaId, responsable: ctx.userId(), createdAt: ctx.nowIso(), ...entry });

  /** Recalcula y guarda la clasificación sólo si cambió (no altera la fecha de actualización). */
  const refresh = (id: string): Project => {
    const p = get(id);
    const fields = classificationFor(ctx, p);
    if (sameClasif(p.clasif, fields.clasif) && p.prioridadFinal === fields.prioridadFinal && p.prioridadCalculada === fields.prioridadCalculada && p.ajusteDireccion === fields.ajusteDireccion) return p;
    return projects.update(id, fields);
  };

  /** Recalcula todos los proyectos vigentes; devuelve cuántos cambiaron. */
  const syncAll = (): number => {
      let changed = 0;
      ctx.store.batch(() => {
      for (const p of projects.list()) {
        if (p.estado === 'archivado') continue;
        if (refresh(p.id) !== p) changed++;
      }
    });
      return changed;
  };

  /**
   * Prioridad establecida por Dirección en un eje (null = volver a la calculada).
   * Conserva valor anterior, nuevo, motivo, fecha y responsable en la bitácora.
   */
  const setDirective = (id: string, eje: PriorityAxis, valor: Priority | null, motivo: string, fuente: LogOrigin = 'pantalla'): Project => {
    requireDirector('establecer prioridades');
    const m = motivo.trim();
    if (!m) throw new ValidationError({ motivo: 'Escribe el motivo del cambio.' });
    const p = get(id);
    const anterior = p.clasif?.[eje] ?? p.prioridadFinal;
    const dir = { ...(p.prioridadDireccion ?? {}) };
    if (eje === 'estrategica') {
      dir.estrategica = valor ?? undefined;
      dir.motivoEstrategica = valor ? m : undefined;
    } else {
      dir.operativa = valor ?? undefined;
      dir.motivoOperativa = valor ? m : undefined;
    }
    return ctx.store.batch(() => {
      projects.update(id, { prioridadDireccion: dir, notaRevalidar: undefined, updatedAt: ctx.nowIso(), updatedBy: ctx.userId() });
      const next = refresh(id);
      recordWeeklyUpdate(ctx, next, { origen: fuente === 'junta' ? 'junta' : 'area' });
      log(next, { tipo: 'prioridad', eje, anterior, nuevo: valor ?? `Calculada (${next.clasif?.[eje === 'estrategica' ? 'estrategicaCalc' : 'operativaCalc']})`, motivo: m, fuente });
      return projects.read(id)!;
    });
  };

  return {
    refresh,
    syncAll,
    setDirective,

    /** Bitácora del proyecto, del cambio más reciente al más antiguo. */
    logs: (projectId: string) =>
      priorityLog
        .filter((l) => l.projectId === projectId)
        .reverse()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    /** Regla 8: un nuevo P1 desplaza a otro de la misma gerencia y eje (queda como P2 de Dirección y como decisión). */
    displace(promovidoId: string, desplazadoId: string, eje: PriorityAxis, sessionId?: string): Project {
      const promovido = get(promovidoId);
      const desplazado = get(desplazadoId);
      return ctx.store.batch(() => {
        const next = setDirective(desplazadoId, eje, 'P2', `Desplazado por «${promovido.nombre}»`, sessionId ? 'junta' : 'pantalla');
        const week = ctx.activeWeek();
        const session = sessionId ? ctx.repos.sessions.read(sessionId) : undefined;
        if (session)
          ctx.repos.sessions.update(session.id, { desplazamientos: [...session.desplazamientos, { promovido: promovidoId, desplazado: desplazadoId, fecha: ctx.nowIso() }] });
        if (week)
          ctx.repos.decisions.create({
            id: newId('dec'),
            sessionId,
            weekId: week.id,
            projectId: promovidoId,
            descripcion: `«${promovido.nombre}» pasa a P1 ${eje === 'estrategica' ? 'estratégico' : 'operativo'} y desplaza a «${desplazado.nombre}» (P2).`,
            responsable: ctx.userId(),
            createdAt: ctx.nowIso(),
          });
        return next;
      });
    },

    /** Cierra o reabre el acuerdo de prioridad de uno o varios proyectos. */
    setLock(ids: string[], bloqueado: boolean, motivo = '', fuente: LogOrigin = 'pantalla'): number {
      requireDirector(bloqueado ? 'cerrar el acuerdo de prioridades' : 'reabrir el acuerdo de prioridades');
      let n = 0;
      ctx.store.batch(() => {
        for (const id of ids) {
          const p = get(id);
          if (!!p.acuerdo?.bloqueado === bloqueado) continue;
          projects.update(id, { acuerdo: { bloqueado, por: ctx.userId(), fecha: ctx.nowIso() } });
          log(p, {
            tipo: 'acuerdo',
            anterior: bloqueado ? 'Abierto' : 'Cerrado',
            nuevo: bloqueado ? 'Cerrado' : 'Abierto',
            motivo: motivo.trim() || (bloqueado ? 'Acuerdo de prioridades cerrado' : 'Acuerdo reabierto por Dirección'),
            fuente,
          });
          n++;
        }
      });
      return n;
    },

    /** Valida o descarta el vínculo de un proyecto con una iniciativa de la matriz (null = volver a automático). */
    setVinculo(id: string, iniciativa: string, estado: 'validado' | 'descartado' | null, motivo = '', fuente: LogOrigin = 'pantalla'): Project {
      requireDirector('validar vínculos con la matriz');
      const p = get(id);
      const nombre = ctx.settings().priorityMatrix!.iniciativas.find((i) => i.key === iniciativa)?.nombre ?? iniciativa;
      const prev = p.vinculos?.find((v) => v.iniciativa === iniciativa)?.estado;
      const vinculos = (p.vinculos ?? []).filter((v) => v.iniciativa !== iniciativa);
      if (estado) vinculos.push({ iniciativa, estado, por: ctx.userId(), fecha: ctx.nowIso() });
      return ctx.store.batch(() => {
        projects.update(id, { vinculos, updatedAt: ctx.nowIso(), updatedBy: ctx.userId() });
        const next = refresh(id);
        recordWeeklyUpdate(ctx, next, { origen: 'area' });
        log(next, {
          tipo: 'iniciativa',
          anterior: prev ? `${nombre}: ${prev}` : `${nombre}: automático`,
          nuevo: `${nombre}: ${estado ?? 'automático'}`,
          motivo: motivo.trim() || (estado === 'validado' ? 'Vínculo confirmado por Dirección' : estado === 'descartado' ? 'No corresponde a la iniciativa' : 'Vuelve al reconocimiento automático'),
          fuente,
        });
        return projects.read(id)!;
      });
    },

    /** Guarda la matriz directiva y recalcula todos los proyectos. */
    setMatrix(matrix: PriorityMatrix): number {
      requireDirector('editar la matriz directiva');
      ctx.repos.settings.update('settings', { priorityMatrix: matrix, updatedAt: ctx.nowIso() });
      return syncAll();
    },

    /**
     * Paso único al modelo de dos ejes: los ajustes de Dirección del modelo anterior
     * quedan como nota por revalidar (no se aplican) y el frente se toma de la descripción.
     */
    migrateLegacy(): boolean {
      const s = ctx.settings();
      if ((s.priorityModel ?? 1) >= 2 || !isDirector(ctx)) return false;
      ctx.store.batch(() => {
        for (const p of projects.list()) {
          const patch: Partial<Project> = {};
          if (p.ajusteDireccion && !p.prioridadDireccion) {
            patch.notaRevalidar = `ajuste del modelo anterior a ${p.prioridadFinal}${p.motivoAjuste ? ` (${p.motivoAjuste})` : ''}`;
          }
          if (!p.frente) {
            const m = /^Frente: (.+)$/m.exec(p.descripcion ?? '');
            if (m) patch.frente = m[1].trim();
          }
          if (Object.keys(patch).length) projects.update(p.id, patch);
        }
        if (ctx.repos.settings.read('settings')) ctx.repos.settings.update('settings', { priorityModel: 2, updatedAt: ctx.nowIso() });
        for (const p of projects.list()) if (p.estado !== 'archivado') refresh(p.id);
      });
      return true;
    },
  };
}
