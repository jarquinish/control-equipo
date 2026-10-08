import { COLLECTIONS, type CollectionName, type DbData, type EntityOf } from '../domain/types';
import type { ChangeOp, StorageAdapter } from './adapters/StorageAdapter';

export function emptyData(): DbData {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as DbData;
}

export function normalizeData(partial: Partial<DbData> | null | undefined): DbData {
  const base = emptyData();
  if (!partial) return base;
  for (const c of COLLECTIONS) {
    const items = partial[c];
    if (Array.isArray(items)) (base as unknown as Record<string, unknown[]>)[c] = [...items];
  }
  return base;
}

type Listener = () => void;
type ErrorListener = (error: unknown) => void;

/**
 * DataStore: caché en memoria (lecturas síncronas para la UI) + persistencia
 * asíncrona a través de un StorageAdapter. Cada mutación produce un nuevo
 * objeto de estado inmutable, lo que permite usarlo con `useSyncExternalStore`.
 */
export class DataStore {
  private data: DbData = emptyData();
  private listeners = new Set<Listener>();
  private errorListeners = new Set<ErrorListener>();
  private queue: ChangeOp[] = [];
  private flushing: Promise<void> = Promise.resolve();
  private flushScheduled = false;
  private batchDepth = 0;
  private dirty = false;
  ready = false;
  /** Persona autenticada (modo multiusuario). Tiene prioridad sobre settings.currentUserId. */
  identity: string | undefined;
  private unsubscribeRemote?: () => void;

  constructor(public adapter: StorageAdapter) {}

  async init(): Promise<boolean> {
    const loaded = await this.adapter.load();
    this.data = normalizeData(loaded);
    this.ready = true;
    this.emit();
    try {
      this.unsubscribeRemote = this.adapter.subscribe?.((op) => this.applyExternal(op));
    } catch (err) {
      // Sin tiempo real la app sigue funcionando (los datos se recargan al volver a la pestaña).
      console.warn('[Alignment & Unblock] Tiempo real no disponible', err);
    }
    return loaded !== null;
  }

  /** Detiene la sincronización en tiempo real. */
  dispose(): void {
    this.unsubscribeRemote?.();
    this.unsubscribeRemote = undefined;
  }

  /** Aplica un cambio que llegó de otro usuario, sin volver a persistirlo. */
  applyExternal(op: ChangeOp): void {
    const list = this.data[op.collection] as { id: string }[];
    if (op.type === 'delete') {
      if (!list.some((i) => i.id === op.id)) return;
      this.data = { ...this.data, [op.collection]: list.filter((i) => i.id !== op.id) };
    } else {
      const exists = list.some((i) => i.id === op.item.id);
      this.data = {
        ...this.data,
        [op.collection]: exists ? list.map((i) => (i.id === op.item.id ? op.item : i)) : [...list, op.item],
      };
    }
    this.emit();
  }

  /** Vuelve a leer todo desde el almacenamiento (p. ej. tras un rechazo del servidor). */
  async reload(): Promise<void> {
    await this.flush();
    this.data = normalizeData(await this.adapter.load());
    this.emit();
  }

  getState = (): DbData => this.data;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  onError(fn: ErrorListener): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  private emit() {
    if (this.batchDepth > 0) {
      this.dirty = true;
      return;
    }
    this.dirty = false;
    for (const l of this.listeners) l();
  }

  /** Agrupa varias mutaciones en una sola notificación a la UI. */
  batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.dirty) this.emit();
    }
  }

  list<C extends CollectionName>(c: C): EntityOf<C>[] {
    return this.data[c] as EntityOf<C>[];
  }

  get<C extends CollectionName>(c: C, id: string | undefined): EntityOf<C> | undefined {
    if (!id) return undefined;
    return (this.data[c] as EntityOf<C>[]).find((i) => i.id === id);
  }

  insert<C extends CollectionName>(c: C, item: EntityOf<C>): EntityOf<C> {
    if (this.get(c, item.id)) throw new Error(`Ya existe un registro con id ${item.id} en ${c}`);
    this.setCollection(c, [...this.list(c), item]);
    this.enqueue({ type: 'insert', collection: c, item });
    return item;
  }

  update<C extends CollectionName>(c: C, id: string, patch: Partial<EntityOf<C>>): EntityOf<C> {
    const current = this.get(c, id);
    if (!current) throw new Error(`No se encontró el registro ${id} en ${c}`);
    const next = { ...current, ...patch, id } as EntityOf<C>;
    this.setCollection(
      c,
      this.list(c).map((i) => (i.id === id ? next : i)),
    );
    this.enqueue({ type: 'update', collection: c, item: next });
    return next;
  }

  upsert<C extends CollectionName>(c: C, item: EntityOf<C>): EntityOf<C> {
    return this.get(c, item.id) ? this.update(c, item.id, item) : this.insert(c, item);
  }

  remove<C extends CollectionName>(c: C, id: string): void {
    if (!this.get(c, id)) return;
    this.setCollection(
      c,
      this.list(c).filter((i) => i.id !== id),
    );
    this.enqueue({ type: 'delete', collection: c, id });
  }

  /** Reemplaza todo el contenido (restaurar respaldo / cambiar de espacio). */
  async replaceAll(data: DbData): Promise<void> {
    await this.flush();
    const next = normalizeData(data);
    await this.adapter.replaceAll(next);
    this.data = next;
    this.emit();
  }

  async clear(): Promise<void> {
    await this.flush();
    await this.adapter.clear();
    this.data = emptyData();
    this.emit();
  }

  /** Espera a que todas las escrituras pendientes lleguen al almacenamiento. */
  async flush(): Promise<void> {
    if (this.queue.length) this.runFlush();
    await this.flushing;
  }

  private setCollection<C extends CollectionName>(c: C, items: EntityOf<C>[]) {
    this.data = { ...this.data, [c]: items };
    this.emit();
  }

  private enqueue(op: ChangeOp) {
    this.queue.push(op);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => this.runFlush());
    }
  }

  private runFlush() {
    this.flushScheduled = false;
    const ops = this.queue.splice(0);
    if (!ops.length) return;
    this.flushing = this.flushing
      .then(() => this.adapter.apply(ops))
      .catch((err) => {
        console.error('[Alignment & Unblock] Error al guardar', err);
        for (const l of this.errorListeners) l(err);
      });
  }
}
