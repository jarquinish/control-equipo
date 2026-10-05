import { MemoryAdapter } from '../../src/data/adapters/memoryAdapter';
import { DataStore } from '../../src/data/store';
import { bootstrapEmpty, createServices } from '../../src/services';

/** Crea servicios con reloj controlable sobre un almacenamiento en memoria. */
export async function setup(start = new Date(2026, 9, 5, 9, 0)) {
  const store = new DataStore(new MemoryAdapter());
  await store.init();
  const clock = { now: new Date(start) };
  const svc = createServices(store, () => new Date(clock.now));
  bootstrapEmpty(svc);
  const areas = Object.fromEntries(svc.areas.list().map((a) => [a.nombre, a.id])) as Record<string, string>;
  const ana = svc.people.create({ nombre: 'Ana Gerente', rol: 'GERENTE', areaId: areas['Diseño'] });
  const beto = svc.people.create({ nombre: 'Beto Colaborador', rol: 'COLABORADOR', areaId: areas['Marketing Digital'] });
  const advance = (hours: number) => {
    clock.now = new Date(clock.now.getTime() + hours * 3_600_000);
  };
  return { store, svc, clock, areas, ana, beto, advance };
}
