import { repository, type Repository } from '../data/repository';
import type { DataStore } from '../data/store';
import { getActiveWeek, getSettings } from '../domain/selectors';
import type { CollectionName, Settings, Week } from '../domain/types';

export type Repos = { [C in CollectionName]: Repository<C> };

export interface ServiceContext {
  store: DataStore;
  repos: Repos;
  /** Reloj inyectable (permite pruebas deterministas). */
  now: () => Date;
  nowIso: () => string;
  settings: () => Settings;
  userId: () => string | undefined;
  activeWeek: () => Week | undefined;
}

export function createContext(store: DataStore, now: () => Date = () => new Date()): ServiceContext {
  const names: CollectionName[] = [
    'areas', 'people', 'projects', 'weeks', 'weeklyUpdates', 'areaUpdates',
    'blocks', 'commitments', 'sessions', 'decisions', 'snapshots', 'settings',
  ];
  const repos = Object.fromEntries(names.map((c) => [c, repository(store, c)])) as Repos;
  return {
    store,
    repos,
    now,
    nowIso: () => now().toISOString(),
    settings: () => getSettings(store.getState()),
    userId: () => getSettings(store.getState()).currentUserId,
    activeWeek: () => getActiveWeek(store.getState()),
  };
}
