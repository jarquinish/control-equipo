import { COLLECTIONS, type CollectionName, type DbData } from '../../domain/types';
import type { ChangeOp, StorageAdapter } from './StorageAdapter';

type Records = Partial<Record<CollectionName, Map<string, unknown>>>;

function applyOps(records: Records, ops: ChangeOp[]): void {
  for (const op of ops) {
    const map = (records[op.collection] ??= new Map());
    if (op.type === 'delete') map.delete(op.id);
    else map.set(op.item.id, structuredClone(op.item));
  }
}

function toData(records: Records): Partial<DbData> | null {
  if (!Object.values(records).some((m) => m && m.size > 0)) return null;
  const out: Record<string, unknown[]> = {};
  for (const c of COLLECTIONS) out[c] = [...(records[c]?.values() ?? [])].map((v) => structuredClone(v));
  return out as unknown as Partial<DbData>;
}

/** Adaptador en memoria. Útil para pruebas y como último recurso. */
export class MemoryAdapter implements StorageAdapter {
  readonly kind = 'memory';
  private records: Records = {};

  async load() {
    return toData(this.records);
  }
  async apply(ops: ChangeOp[]) {
    applyOps(this.records, ops);
  }
  async replaceAll(data: DbData) {
    this.records = {};
    for (const c of COLLECTIONS) this.records[c] = new Map(data[c].map((i) => [i.id, structuredClone(i)]));
  }
  async clear() {
    this.records = {};
  }
}

/** Adaptador sobre localStorage (respaldo cuando IndexedDB no está disponible). */
export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = 'localStorage';
  constructor(private readonly prefix: string) {}

  private key(c: CollectionName) {
    return `${this.prefix}:${c}`;
  }
  private read(c: CollectionName): Map<string, unknown> {
    const raw = localStorage.getItem(this.key(c));
    const arr = raw ? (JSON.parse(raw) as { id: string }[]) : [];
    return new Map(arr.map((i) => [i.id, i]));
  }
  private write(c: CollectionName, map: Map<string, unknown>) {
    localStorage.setItem(this.key(c), JSON.stringify([...map.values()]));
  }

  async load() {
    const records: Records = {};
    for (const c of COLLECTIONS) records[c] = this.read(c);
    return toData(records);
  }
  async apply(ops: ChangeOp[]) {
    const touched = new Map<CollectionName, Map<string, unknown>>();
    for (const op of ops) {
      const map = touched.get(op.collection) ?? this.read(op.collection);
      touched.set(op.collection, map);
      if (op.type === 'delete') map.delete(op.id);
      else map.set(op.item.id, op.item);
    }
    for (const [c, map] of touched) this.write(c, map);
  }
  async replaceAll(data: DbData) {
    for (const c of COLLECTIONS) this.write(c, new Map(data[c].map((i) => [i.id, i])));
  }
  async clear() {
    for (const c of COLLECTIONS) localStorage.removeItem(this.key(c));
  }
}
