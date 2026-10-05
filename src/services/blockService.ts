import { newId } from '../data/ids';
import { blockIsManaged } from '../domain/selectors';
import type { Block, BlockStatus, UpdateOrigin } from '../domain/types';
import { assertValid, validateBlock, ValidationError } from '../domain/validation';
import type { ServiceContext } from './context';
import { recordWeeklyUpdate, syncProjectBlocked } from './projectService';

export interface BlockInput {
  projectId: string;
  descripcion: string;
  necesidad?: string;
  dependeDe?: string;
  areaDependencia?: string;
  quienPuedeAyudar?: string;
  responsableGestion?: string;
}

export function blockService(ctx: ServiceContext) {
  const { blocks } = ctx.repos;

  const get = (id: string): Block => {
    const b = blocks.read(id);
    if (!b) throw new ValidationError({ bloqueo: 'El bloqueo ya no existe.' });
    return b;
  };

  const create = (input: BlockInput, origen: UpdateOrigin = 'area'): Block => {
    assertValid(validateBlock(input));
    const project = ctx.repos.projects.read(input.projectId);
    if (!project) throw new ValidationError({ projectId: 'El proyecto no existe.' });
    const week = ctx.activeWeek();
    if (!week) throw new ValidationError({ semana: 'Abre una semana antes de registrar bloqueos.' });
    const at = ctx.nowIso();
    return ctx.store.batch(() => {
      const block = blocks.create({
        id: newId('blk'),
        projectId: input.projectId,
        weekId: week.id,
        descripcion: input.descripcion.trim(),
        necesidad: input.necesidad?.trim() ?? '',
        dependeDe: input.dependeDe?.trim() ?? '',
        areaDependencia: input.areaDependencia ?? '',
        quienPuedeAyudar: input.quienPuedeAyudar?.trim() || undefined,
        responsableGestion: input.responsableGestion || undefined,
        estado: 'por_destrabar',
        createdAt: at,
        updatedAt: at,
      });
      if (input.areaDependencia && !project.dependeDe) {
        const p = ctx.repos.projects.update(project.id, { dependeDe: input.areaDependencia, updatedAt: at });
        recordWeeklyUpdate(ctx, p, { origen });
      }
      syncProjectBlocked(ctx, project.id, origen);
      return block;
    });
  };

  const update = (id: string, patch: Partial<BlockInput>): Block => {
    const current = get(id);
    assertValid(validateBlock({ ...current, ...patch }));
    return blocks.update(id, {
      ...patch,
      descripcion: patch.descripcion?.trim() ?? current.descripcion,
      updatedAt: ctx.nowIso(),
    });
  };

  /**
   * Mueve un bloqueo en el Kanban. Regla: un bloqueo no puede quedar EN GESTIÓN
   * sin un compromiso con acción + responsable + fecha + hora.
   */
  const move = (id: string, estado: BlockStatus, opts: { escaladoA?: string; origen?: UpdateOrigin } = {}): Block => {
    const block = get(id);
    if (estado === 'en_gestion' && !blockIsManaged(block, ctx.repos.commitments.list())) {
      throw new ValidationError({
        estado: 'Para pasar a EN GESTIÓN define una acción con responsable, fecha y hora.',
      });
    }
    const at = ctx.nowIso();
    return ctx.store.batch(() => {
      const next = blocks.update(id, {
        estado,
        escaladoA: estado === 'escalado' ? opts.escaladoA?.trim() || block.escaladoA || 'Dirección' : block.escaladoA,
        resolvedAt: estado === 'resuelto' ? at : undefined,
        updatedAt: at,
      });
      syncProjectBlocked(ctx, block.projectId, opts.origen);
      return next;
    });
  };

  return {
    list: () => blocks.list(),
    get,
    create,
    update,
    move,
    resolve: (id: string, origen?: UpdateOrigin) => move(id, 'resuelto', { origen }),
    escalate: (id: string, escaladoA?: string, origen?: UpdateOrigin) => move(id, 'escalado', { escaladoA, origen }),
    resolveProjectBlocks(projectId: string, origen?: UpdateOrigin) {
      return ctx.store.batch(() =>
        blocks
          .filter((b) => b.projectId === projectId && b.estado !== 'resuelto')
          .map((b) => move(b.id, 'resuelto', { origen })),
      );
    },
    remove(id: string) {
      const b = get(id);
      ctx.store.batch(() => {
        for (const c of ctx.repos.commitments.filter((x) => x.blockId === id)) {
          ctx.repos.commitments.update(c.id, { blockId: undefined, updatedAt: ctx.nowIso() });
        }
        blocks.delete(id);
        syncProjectBlocked(ctx, b.projectId);
      });
    },
  };
}
