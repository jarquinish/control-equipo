import { newId } from '../data/ids';
import type { Area, AreaUpdate } from '../domain/types';
import { assertValid, ValidationError } from '../domain/validation';
import type { ServiceContext } from './context';

export interface AreaInput {
  nombre: string;
  responsable?: string;
  color?: string;
}

export function areaService(ctx: ServiceContext) {
  const { areas, areaUpdates } = ctx.repos;

  return {
    list: () => [...areas.list()].sort((a, b) => a.orden - b.orden),
    create(input: AreaInput): Area {
      const nombre = input.nombre?.trim();
      assertValid(nombre ? {} : { nombre: 'Escribe el nombre del área.' });
      if (areas.list().some((a) => a.nombre.toLowerCase() === nombre.toLowerCase()))
        throw new ValidationError({ nombre: 'Ya existe un área con ese nombre.' });
      const at = ctx.nowIso();
      return areas.create({
        id: newId('area'),
        nombre,
        responsable: input.responsable,
        color: input.color ?? '#006D4E',
        activo: true,
        orden: areas.list().length,
        createdAt: at,
        updatedAt: at,
      });
    },
    update(id: string, patch: Partial<AreaInput & { activo: boolean }>) {
      if (patch.nombre !== undefined) assertValid(patch.nombre.trim() ? {} : { nombre: 'El nombre no puede quedar vacío.' });
      return areas.update(id, { ...patch, updatedAt: ctx.nowIso() } as Partial<Area>);
    },
    remove(id: string) {
      if (ctx.repos.projects.list().some((p) => p.areaId === id))
        throw new ValidationError({ area: 'El área tiene proyectos. Desactívala en lugar de eliminarla para conservar el historial.' });
      areas.delete(id);
    },

    /** Registra que el área completó su actualización de la semana activa. */
    completeUpdate(areaId: string, comentario?: string): AreaUpdate {
      const week = ctx.activeWeek();
      if (!week || week.estado !== 'abierta')
        throw new ValidationError({ semana: 'No hay una semana abierta para actualizar.' });
      const id = `au_${week.id}_${areaId}`;
      return areaUpdates.upsert({
        id,
        weekId: week.id,
        areaId,
        completedAt: ctx.nowIso(),
        completedBy: ctx.userId(),
        comentario: comentario?.trim() || undefined,
      });
    },
    reopenUpdate(areaId: string) {
      const week = ctx.activeWeek();
      if (week) areaUpdates.delete(`au_${week.id}_${areaId}`);
    },
  };
}
