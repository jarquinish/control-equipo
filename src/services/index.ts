import type { DataStore } from '../data/store';
import { INITIAL_AREAS, SCHEMA_VERSION } from '../domain/constants';
import { defaultSettings } from '../domain/selectors';
import { areaService } from './areaService';
import { backupService } from './backupService';
import { blockService } from './blockService';
import { commitmentService } from './commitmentService';
import { createContext, type ServiceContext } from './context';
import { importService } from './importService';
import { peopleService } from './peopleService';
import { projectService } from './projectService';
import { sessionService } from './sessionService';
import { settingsService } from './settingsService';
import { weekService } from './weekService';

export function createServices(store: DataStore, now: () => Date = () => new Date()) {
  const ctx = createContext(store, now);
  const people = peopleService(ctx);
  const projects = projectService(ctx);
  const blocks = blockService(ctx);
  const commitments = commitmentService(ctx);
  return {
    ctx,
    settings: settingsService(ctx),
    people,
    areas: areaService(ctx),
    projects,
    blocks,
    commitments,
    imports: importService(ctx, { people, projects, blocks, commitments }),
    weeks: weekService(ctx),
    sessions: sessionService(ctx),
    backup: backupService(ctx),
  };
}

export type Services = ReturnType<typeof createServices>;

/**
 * Primera ejecución de un espacio de trabajo vacío: crea las cuatro áreas
 * iniciales, el perfil de Dirección y la semana actual.
 */
export function bootstrapEmpty(services: Services): void {
  const { ctx } = services;
  ctx.store.batch(() => {
    if (!ctx.repos.settings.read('settings')) {
      ctx.repos.settings.create({ ...defaultSettings(), schemaVersion: SCHEMA_VERSION, updatedAt: ctx.nowIso() });
    }
    if (!ctx.repos.people.list().length) {
      const director = services.people.create({ nombre: 'Dirección de Posicionamiento', rol: 'DIRECTOR' });
      services.settings.setCurrentUser(director.id);
    }
    if (!ctx.repos.areas.list().length) {
      for (const a of INITIAL_AREAS) services.areas.create({ nombre: a.nombre, color: a.color });
    }
    services.weeks.ensureCurrentWeek();
  });
}

export type { ServiceContext };
