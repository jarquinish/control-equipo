import { COLLECTIONS, type CollectionName, type DbData } from '../../domain/types';
import type { ChangeOp, StorageAdapter } from './StorageAdapter';

/**
 * Mapa colección → recurso REST. Contrato esperado del backend:
 *
 *   GET    /api/projects            → Project[]
 *   POST   /api/projects            → crea (body: Project)
 *   PUT    /api/projects/:id        → actualiza (body: Project)
 *   DELETE /api/projects/:id
 *
 * y lo mismo para weeks, blocks, commitments, sessions, areas, people,
 * weekly-updates, area-updates, decisions, snapshots y settings.
 */
export const REST_RESOURCES: Record<CollectionName, string> = {
  areas: 'areas',
  people: 'people',
  projects: 'projects',
  weeks: 'weeks',
  weeklyUpdates: 'weekly-updates',
  areaUpdates: 'area-updates',
  blocks: 'blocks',
  commitments: 'commitments',
  sessions: 'sessions',
  decisions: 'decisions',
  snapshots: 'snapshots',
  settings: 'settings',
};

export interface RestAdapterOptions {
  baseUrl: string;
  /** Devuelve el token de sesión (autenticación futura: Microsoft Entra ID / Supabase Auth…). */
  getToken?: () => string | undefined;
  fetchImpl?: typeof fetch;
}

/**
 * Adaptador preparado para un backend REST (PostgreSQL, MySQL, Supabase…).
 * No se usa en V1 salvo que `VITE_STORAGE=rest`. Ver README → Backend.
 */
export class RestAdapter implements StorageAdapter {
  readonly kind = 'rest';
  constructor(private readonly opts: RestAdapterOptions) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.baseUrl.replace(/\/$/, '')}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Error del servidor (${res.status}) en ${method} /${path}`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  async load(): Promise<Partial<DbData> | null> {
    const entries = await Promise.all(
      COLLECTIONS.map(async (c) => [c, await this.request<unknown[]>('GET', REST_RESOURCES[c])] as const),
    );
    const data = Object.fromEntries(entries) as unknown as Partial<DbData>;
    return entries.some(([, items]) => items.length > 0) ? data : null;
  }

  async apply(ops: ChangeOp[]): Promise<void> {
    for (const op of ops) {
      const res = REST_RESOURCES[op.collection];
      if (op.type === 'insert') await this.request('POST', res, op.item);
      else if (op.type === 'update') await this.request('PUT', `${res}/${encodeURIComponent(op.item.id)}`, op.item);
      else await this.request('DELETE', `${res}/${encodeURIComponent(op.id)}`);
    }
  }

  async replaceAll(data: DbData): Promise<void> {
    await this.request('POST', 'import', data);
  }

  async clear(): Promise<void> {
    await this.request('DELETE', 'data');
  }
}
