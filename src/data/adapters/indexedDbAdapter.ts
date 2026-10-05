import { COLLECTIONS, type CollectionName, type DbData } from '../../domain/types';
import type { ChangeOp, StorageAdapter } from './StorageAdapter';

const DB_VERSION = 1;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
  });
}

/**
 * Persistencia principal de V1: IndexedDB, un object store por colección
 * (keyPath `id`). Los lotes se aplican en una sola transacción.
 */
export class IndexedDbAdapter implements StorageAdapter {
  readonly kind = 'indexedDB';
  private dbPromise?: Promise<IDBDatabase>;

  constructor(
    private readonly dbName: string,
    private readonly idb: IDBFactory = indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = this.idb.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const c of COLLECTIONS) {
          if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('La base de datos local está bloqueada por otra pestaña.'));
    });
    return this.dbPromise;
  }

  async load(): Promise<Partial<DbData> | null> {
    const db = await this.open();
    const tx = db.transaction(COLLECTIONS, 'readonly');
    const out: Partial<Record<CollectionName, unknown[]>> = {};
    let total = 0;
    await Promise.all(
      COLLECTIONS.map(async (c) => {
        const items = await promisify(tx.objectStore(c).getAll());
        out[c] = items;
        total += items.length;
      }),
    );
    return total === 0 ? null : (out as Partial<DbData>);
  }

  async apply(ops: ChangeOp[]): Promise<void> {
    if (ops.length === 0) return;
    const db = await this.open();
    const stores = [...new Set(ops.map((o) => o.collection))];
    const tx = db.transaction(stores, 'readwrite');
    for (const op of ops) {
      const store = tx.objectStore(op.collection);
      if (op.type === 'delete') store.delete(op.id);
      else store.put(op.item);
    }
    await txDone(tx);
  }

  async replaceAll(data: DbData): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(COLLECTIONS, 'readwrite');
    for (const c of COLLECTIONS) {
      const store = tx.objectStore(c);
      store.clear();
      for (const item of data[c] ?? []) store.put(item);
    }
    await txDone(tx);
  }

  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(COLLECTIONS, 'readwrite');
    for (const c of COLLECTIONS) tx.objectStore(c).clear();
    await txDone(tx);
  }
}
