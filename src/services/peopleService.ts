import { newId } from '../data/ids';
import type { Area, Person, Role } from '../domain/types';
import { assertValid } from '../domain/validation';
import type { ServiceContext } from './context';

export interface PersonInput {
  nombre: string;
  rol?: Role;
  areaId?: string;
  email?: string;
}

export function peopleService(ctx: ServiceContext) {
  const { people } = ctx.repos;

  const create = (input: PersonInput): Person => {
    const nombre = input.nombre?.trim();
    assertValid(nombre ? {} : { nombre: 'Escribe el nombre de la persona.' });
    const dup = people.list().find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
    if (dup) return dup.activo ? dup : people.update(dup.id, { activo: true, updatedAt: ctx.nowIso() });
    const at = ctx.nowIso();
    return people.create({
      id: newId('per'),
      nombre,
      rol: input.rol ?? 'COLABORADOR',
      areaId: input.areaId,
      email: input.email?.trim() || undefined,
      activo: true,
      createdAt: at,
      updatedAt: at,
    });
  };

  return {
    list: () => people.list(),
    create,
    /** Busca por nombre o crea un colaborador nuevo. */
    ensure: (nombre: string, areaId?: string) => create({ nombre, areaId }),
    update(id: string, patch: Partial<PersonInput & { activo: boolean }>) {
      if (patch.nombre !== undefined) assertValid(patch.nombre.trim() ? {} : { nombre: 'El nombre no puede quedar vacío.' });
      return people.update(id, { ...patch, nombre: patch.nombre?.trim() ?? people.read(id)?.nombre, updatedAt: ctx.nowIso() } as Partial<Person>);
    },
    setActive: (id: string, activo: boolean) => people.update(id, { activo, updatedAt: ctx.nowIso() }),
    areaOf: (id: string | undefined): Area | undefined => ctx.repos.areas.read(people.read(id)?.areaId),
  };
}
