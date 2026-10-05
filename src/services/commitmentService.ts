import { newId } from '../data/ids';
import { isOpenCommitment } from '../domain/selectors';
import type { Commitment, CommitmentEvent, CommitmentEventType } from '../domain/types';
import { assertValid, validateCommitment, validateReschedule, ValidationError } from '../domain/validation';
import type { ServiceContext } from './context';
import { syncProjectBlocked } from './projectService';

export interface CommitmentInput {
  projectId: string;
  blockId?: string;
  accion: string;
  responsable: string;
  apoyo?: string;
  fecha: string;
  hora: string;
  comentario?: string;
}

export interface ActionOptions {
  sessionId?: string;
  comentario?: string;
}

export function commitmentService(ctx: ServiceContext) {
  const { commitments } = ctx.repos;

  const get = (id: string): Commitment => {
    const c = commitments.read(id);
    if (!c) throw new ValidationError({ compromiso: 'El compromiso ya no existe.' });
    return c;
  };

  const event = (tipo: CommitmentEventType, opts: ActionOptions & { detalle?: string } = {}): CommitmentEvent => ({
    tipo,
    fecha: ctx.nowIso(),
    weekId: ctx.activeWeek()?.id,
    sessionId: opts.sessionId,
    detalle: opts.detalle ?? opts.comentario,
    autor: ctx.userId(),
  });

  const withComment = (c: Commitment, texto?: string) =>
    texto?.trim()
      ? [...c.comentarios, { id: newId('cmt'), texto: texto.trim(), autor: ctx.userId(), fecha: ctx.nowIso() }]
      : c.comentarios;

  const linkToSession = (sessionId: string | undefined, commitmentId: string) => {
    if (!sessionId) return;
    const s = ctx.repos.sessions.read(sessionId);
    if (s && !s.compromisos.includes(commitmentId))
      ctx.repos.sessions.update(sessionId, { compromisos: [...s.compromisos, commitmentId] });
  };

  const create = (input: CommitmentInput, opts: ActionOptions = {}): Commitment => {
    assertValid(validateCommitment(input));
    if (!ctx.repos.projects.read(input.projectId)) throw new ValidationError({ projectId: 'El proyecto no existe.' });
    const week = ctx.activeWeek();
    if (!week) throw new ValidationError({ semana: 'Abre una semana antes de registrar compromisos.' });
    const at = ctx.nowIso();
    return ctx.store.batch(() => {
      const c = commitments.create({
        id: newId('cmp'),
        projectId: input.projectId,
        blockId: input.blockId || undefined,
        weekId: week.id,
        accion: input.accion.trim(),
        responsable: input.responsable,
        apoyo: input.apoyo?.trim() || undefined,
        fecha: input.fecha,
        hora: input.hora,
        estado: 'pendiente',
        fechaOriginal: input.fecha,
        horaOriginal: input.hora,
        reprogramaciones: 0,
        comentarios: [],
        historial: [event('creado', opts)],
        createdAt: at,
        updatedAt: at,
      });
      if (input.comentario) commitments.update(c.id, { comentarios: withComment(c, input.comentario) });
      // Un bloqueo con compromiso completo pasa automáticamente a EN GESTIÓN.
      const block = ctx.repos.blocks.read(c.blockId);
      if (block && block.estado === 'por_destrabar') {
        ctx.repos.blocks.update(block.id, { estado: 'en_gestion', updatedAt: at });
      }
      linkToSession(opts.sessionId, c.id);
      return commitments.read(c.id)!;
    });
  };

  const update = (id: string, patch: Partial<Pick<CommitmentInput, 'accion' | 'responsable' | 'apoyo' | 'blockId'>>) => {
    const c = get(id);
    assertValid(validateCommitment({ ...c, ...patch }));
    return commitments.update(id, { ...patch, accion: patch.accion?.trim() ?? c.accion, updatedAt: ctx.nowIso() });
  };

  const transition = (id: string, patch: Partial<Commitment>, tipo: CommitmentEventType, opts: ActionOptions & { detalle?: string } = {}) => {
    const c = get(id);
    return commitments.update(id, {
      ...patch,
      comentarios: withComment(c, opts.comentario),
      historial: [...c.historial, event(tipo, opts)],
      updatedAt: ctx.nowIso(),
    });
  };

  return {
    list: () => commitments.list(),
    get,
    create,
    update,

    /** ✓ CUMPLIDO. Opcionalmente resuelve el bloqueo asociado. */
    complete(id: string, opts: ActionOptions & { resolveBlock?: boolean } = {}) {
      return ctx.store.batch(() => {
        const c = transition(id, { estado: 'cumplido', completedAt: ctx.nowIso() }, 'cumplido', opts);
        const block = ctx.repos.blocks.read(c.blockId);
        if (opts.resolveBlock && block && block.estado !== 'resuelto') {
          ctx.repos.blocks.update(block.id, { estado: 'resuelto', resolvedAt: ctx.nowIso(), updatedAt: ctx.nowIso() });
          syncProjectBlocked(ctx, block.projectId, opts.sessionId ? 'junta' : 'area');
        }
        return c;
      });
    },

    /** ↻ REPROGRAMAR: exige nueva fecha, nueva hora y motivo. Conserva fecha/hora original. */
    reschedule(id: string, input: { fecha: string; hora: string; motivo: string }, opts: ActionOptions = {}) {
      const c = get(id);
      assertValid(validateReschedule(input));
      if (input.fecha === c.fecha && input.hora === c.hora)
        throw new ValidationError({ fecha: 'La nueva fecha y hora son iguales a las actuales.' });
      return transition(
        id,
        {
          fecha: input.fecha,
          hora: input.hora,
          estado: 'reprogramado',
          reprogramaciones: c.reprogramaciones + 1,
          motivoReprogramacion: input.motivo.trim(),
          completedAt: undefined,
        },
        'reprogramado',
        { ...opts, detalle: `${c.fecha} ${c.hora} → ${input.fecha} ${input.hora} · ${input.motivo.trim()}` },
      );
    },

    /** ✕ INCUMPLIDO */
    fail(id: string, opts: ActionOptions = {}) {
      return transition(id, { estado: 'incumplido', completedAt: ctx.nowIso() }, 'incumplido', opts);
    },

    /** ↑ ESCALAR. El bloqueo asociado también se escala. */
    escalate(id: string, escaladoA: string, opts: ActionOptions = {}) {
      const to = escaladoA?.trim() || 'Dirección';
      return ctx.store.batch(() => {
        const c = transition(id, { estado: 'escalado', escaladoA: to, completedAt: undefined }, 'escalado', { ...opts, detalle: `Escalado a ${to}${opts.comentario ? ` · ${opts.comentario}` : ''}` });
        const block = ctx.repos.blocks.read(c.blockId);
        if (block && block.estado !== 'resuelto') {
          ctx.repos.blocks.update(block.id, { estado: 'escalado', escaladoA: to, updatedAt: ctx.nowIso() });
        }
        return c;
      });
    },

    setInProgress(id: string, opts: ActionOptions = {}) {
      return transition(id, { estado: 'en_gestion' }, 'en_gestion', opts);
    },

    reopen(id: string, opts: ActionOptions = {}) {
      const c = get(id);
      if (isOpenCommitment(c)) return c;
      return transition(id, { estado: c.reprogramaciones ? 'reprogramado' : 'pendiente', completedAt: undefined }, 'reabierto', opts);
    },

    addComment(id: string, texto: string) {
      assertValid(texto?.trim() ? {} : { comentario: 'Escribe un comentario.' });
      const c = get(id);
      return commitments.update(id, {
        comentarios: withComment(c, texto),
        historial: [...c.historial, event('comentario', { detalle: texto.trim() })],
        updatedAt: ctx.nowIso(),
      });
    },

    remove: (id: string) => commitments.delete(id),
  };
}
