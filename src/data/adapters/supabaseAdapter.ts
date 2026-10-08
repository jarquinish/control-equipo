import type { SupabaseClient } from '@supabase/supabase-js';
import { COLLECTIONS, type CollectionName, type DbData } from '../../domain/types';
import type { ChangeOp, StorageAdapter } from './StorageAdapter';

const TABLE = 'au_records';
let channelSeq = 0;
const PAGE = 1000;

interface RecordRow {
  collection: CollectionName;
  id: string;
  data: { id: string };
  client_id?: string | null;
}

interface PgError {
  code?: string;
  message: string;
}

/** Error del servidor con mensaje entendible para el usuario. */
export class RemoteError extends Error {
  constructor(
    message: string,
    public readonly permission: boolean,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

function toRemoteError(err: PgError, accion: string): RemoteError {
  const permission = err.code === '42501' || /row-level security|permission denied/i.test(err.message);
  return new RemoteError(
    permission
      ? `Tu rol no permite ${accion}. Se restauró la información del servidor.`
      : `No se pudo ${accion} en el servidor. Revisa tu conexión e intenta de nuevo.`,
    permission,
  );
}

/**
 * Persistencia compartida en Supabase (PostgreSQL). Cada entidad es una fila de
 * `au_records` con su documento JSON; la seguridad la aplica la RLS del servidor
 * (ver supabase/migrations). Los cambios de otros usuarios llegan en tiempo real.
 */
export class SupabaseAdapter implements StorageAdapter {
  readonly kind = 'supabase';

  constructor(
    private readonly client: SupabaseClient,
    /** Identifica esta pestaña para ignorar el eco de sus propios cambios. */
    readonly clientId: string,
  ) {}

  async load(): Promise<Partial<DbData> | null> {
    const out = Object.fromEntries(COLLECTIONS.map((c) => [c, [] as unknown[]])) as Record<CollectionName, unknown[]>;
    let total = 0;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from(TABLE)
        .select('collection,id,data')
        .order('collection')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw toRemoteError(error, 'cargar la información');
      const rows = (data ?? []) as RecordRow[];
      for (const r of rows) out[r.collection]?.push(r.data);
      total += rows.length;
      if (rows.length < PAGE) break;
    }
    return total === 0 ? null : (out as unknown as Partial<DbData>);
  }

  async apply(ops: ChangeOp[]): Promise<void> {
    // Agrupa operaciones consecutivas del mismo tipo para minimizar peticiones,
    // conservando el orden (un borrado después de una inserción sigue siendo borrado).
    let i = 0;
    while (i < ops.length) {
      const op = ops[i];
      if (op.type === 'delete') {
        const ids: string[] = [];
        while (i < ops.length && ops[i].type === 'delete' && ops[i].collection === op.collection) {
          ids.push((ops[i] as Extract<ChangeOp, { type: 'delete' }>).id);
          i++;
        }
        const { error } = await this.client.from(TABLE).delete().eq('collection', op.collection).in('id', ids);
        if (error) throw toRemoteError(error, 'eliminar este registro');
      } else {
        const rows = new Map<string, RecordRow>();
        while (i < ops.length && ops[i].type !== 'delete') {
          const o = ops[i] as Exclude<ChangeOp, { type: 'delete' }>;
          rows.set(`${o.collection}:${o.item.id}`, { collection: o.collection, id: o.item.id, data: o.item, client_id: this.clientId });
          i++;
        }
        const { error } = await this.client.from(TABLE).upsert([...rows.values()], { onConflict: 'collection,id' });
        if (error) throw toRemoteError(error, 'guardar este cambio');
      }
    }
  }

  async replaceAll(data: DbData): Promise<void> {
    const { error } = await this.client.rpc('au_replace_all', { payload: data });
    if (error) throw toRemoteError(error, 'restaurar el respaldo');
  }

  async clear(): Promise<void> {
    const { error } = await this.client.rpc('au_clear');
    if (error) throw toRemoteError(error, 'borrar la información');
  }

  subscribe(onChange: (op: ChangeOp) => void): () => void {
    // Nombre único por suscripción: supabase-js reutiliza un canal con el mismo nombre
    // y rechaza agregarle escuchas si ya estaba suscrito (p. ej. al reabrir la base).
    const channel = this.client
      .channel(`au_records:${this.clientId}:${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        const op = toChangeOp(payload as RealtimePayload, this.clientId);
        if (op) onChange(op);
      })
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}

export interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Partial<RecordRow>;
  old: Partial<RecordRow>;
}

/** Traduce un evento de Supabase Realtime a una operación del DataStore. */
export function toChangeOp(p: RealtimePayload, ownClientId: string): ChangeOp | null {
  if (p.eventType === 'DELETE') {
    const { collection, id } = p.old;
    return collection && id && COLLECTIONS.includes(collection) ? { type: 'delete', collection, id } : null;
  }
  const row = p.new;
  if (!row.collection || !row.data || !COLLECTIONS.includes(row.collection)) return null;
  if (row.client_id && row.client_id === ownClientId) return null; // eco de un cambio propio
  return { type: 'update', collection: row.collection, item: row.data };
}
