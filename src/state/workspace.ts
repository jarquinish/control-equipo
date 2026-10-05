import { IndexedDbAdapter } from '../data/adapters/indexedDbAdapter';
import { LocalStorageAdapter, MemoryAdapter } from '../data/adapters/memoryAdapter';
import { RestAdapter } from '../data/adapters/restAdapter';
import type { StorageAdapter } from '../data/adapters/StorageAdapter';

/**
 * Espacios de trabajo separados: "principal" (información real) y "demo".
 * Cargar o reiniciar la demo nunca toca la información real.
 */
export type Workspace = 'principal' | 'demo';

const KEY = 'au.workspace';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getWorkspace(): Workspace {
  return safeGet(KEY) === 'demo' ? 'demo' : 'principal';
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(KEY, ws);
  } catch {
    /* almacenamiento no disponible: se mantiene sólo en memoria */
  }
}

export function createAdapter(ws: Workspace): StorageAdapter {
  const mode = import.meta.env.VITE_STORAGE;
  if (mode === 'rest' && import.meta.env.VITE_API_URL && ws === 'principal') {
    return new RestAdapter({ baseUrl: import.meta.env.VITE_API_URL });
  }
  if (typeof indexedDB !== 'undefined') return new IndexedDbAdapter(`alignment-unblock-${ws}`);
  try {
    localStorage.setItem('au.test', '1');
    localStorage.removeItem('au.test');
    return new LocalStorageAdapter(`alignment-unblock-${ws}`);
  } catch {
    return new MemoryAdapter();
  }
}
