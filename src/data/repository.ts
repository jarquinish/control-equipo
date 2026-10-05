import type { CollectionName, EntityOf } from '../domain/types';
import type { DataStore } from './store';

/**
 * Repositorio genérico con las operaciones CRUD + filtro. Los servicios de
 * negocio trabajan contra repositorios, nunca contra el almacenamiento físico.
 */
export interface Repository<C extends CollectionName> {
  list(): EntityOf<C>[];
  read(id: string | undefined): EntityOf<C> | undefined;
  filter(pred: (item: EntityOf<C>) => boolean): EntityOf<C>[];
  create(item: EntityOf<C>): EntityOf<C>;
  update(id: string, patch: Partial<EntityOf<C>>): EntityOf<C>;
  upsert(item: EntityOf<C>): EntityOf<C>;
  delete(id: string): void;
}

export function repository<C extends CollectionName>(store: DataStore, collection: C): Repository<C> {
  return {
    list: () => store.list(collection),
    read: (id) => store.get(collection, id),
    filter: (pred) => store.list(collection).filter(pred),
    create: (item) => store.insert(collection, item),
    update: (id, patch) => store.update(collection, id, patch),
    upsert: (item) => store.upsert(collection, item),
    delete: (id) => store.remove(collection, id),
  };
}
