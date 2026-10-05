import type { CollectionName, DbData } from '../../domain/types';

/**
 * Operación de cambio sobre una colección. El DataStore acumula operaciones y
 * las entrega al adaptador en lotes. Un adaptador REST puede traducirlas
 * directamente a POST / PUT / DELETE.
 */
export type ChangeOp =
  | { type: 'insert'; collection: CollectionName; item: { id: string } }
  | { type: 'update'; collection: CollectionName; item: { id: string } }
  | { type: 'delete'; collection: CollectionName; id: string };

/**
 * Contrato de almacenamiento. Cambiar IndexedDB por PostgreSQL / Supabase /
 * Firebase / API REST significa implementar esta interfaz; la UI y los
 * servicios no cambian.
 */
export interface StorageAdapter {
  readonly kind: string;
  /** Carga todas las colecciones. `null` si el almacenamiento está vacío. */
  load(): Promise<Partial<DbData> | null>;
  /** Aplica un lote de operaciones de forma atómica cuando el medio lo permite. */
  apply(ops: ChangeOp[]): Promise<void>;
  /** Reemplaza todo el contenido (restaurar respaldo). */
  replaceAll(data: DbData): Promise<void>;
  /** Elimina todo el contenido. */
  clear(): Promise<void>;
  /**
   * Opcional: cambios hechos por OTROS usuarios (tiempo real). Devuelve la
   * función para cancelar la suscripción.
   */
  subscribe?(onChange: (op: ChangeOp) => void): () => void;
}
