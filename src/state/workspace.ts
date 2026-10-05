import { IndexedDbAdapter } from '../data/adapters/indexedDbAdapter';
import { LocalStorageAdapter, MemoryAdapter } from '../data/adapters/memoryAdapter';
import { RestAdapter } from '../data/adapters/restAdapter';
import type { StorageAdapter } from '../data/adapters/StorageAdapter';
import { SupabaseAdapter } from '../data/adapters/supabaseAdapter';
import { newId } from '../data/ids';
import type { AuthInfo } from './auth';

/** Identificador de esta pestaña (para ignorar el eco de sus propios cambios en tiempo real). */
const CLIENT_ID = newId('tab');

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
  const saved = safeGet(KEY);
  if (saved === 'demo' || saved === 'principal') return saved;
  // La vista previa abre directamente con los datos demo.
  return import.meta.env.VITE_PREVIEW === 'true' ? 'demo' : 'principal';
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(KEY, ws);
  } catch {
    /* almacenamiento no disponible: se mantiene sólo en memoria */
  }
}

export function createAdapter(ws: Workspace, auth?: AuthInfo | null): StorageAdapter {
  // Espacio principal compartido en Supabase; la demo siempre es local.
  if (auth && ws === 'principal') return new SupabaseAdapter(auth.client, CLIENT_ID);
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

/** Alternativa cuando IndexedDB no está disponible: localStorage y, si tampoco, memoria. */
export function fallbackAdapter(ws: Workspace): StorageAdapter {
  try {
    localStorage.setItem('au.test', '1');
    localStorage.removeItem('au.test');
    return new LocalStorageAdapter(`alignment-unblock-${ws}`);
  } catch {
    return new MemoryAdapter();
  }
}
