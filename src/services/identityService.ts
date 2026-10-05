import type { Role } from '../domain/types';
import type { Services } from './index';

export interface IdentityInput {
  email: string;
  name?: string;
  rol: Role;
  personId?: string | null;
}

/**
 * Vincula al usuario autenticado con su Persona del directorio (por id asignado
 * en Accesos, o por correo) y la crea si no existe. El rol de Accesos manda.
 * Devuelve el id de la persona.
 */
export function ensureIdentity(services: Services, who: IdentityInput, justBootstrapped = false): string {
  const { repos } = services.ctx;
  const email = who.email.toLowerCase();
  const people = repos.people.list();
  let person =
    (who.personId ? people.find((p) => p.id === who.personId) : undefined) ??
    people.find((p) => p.email?.toLowerCase() === email);

  // Primer arranque del espacio: el perfil genérico de Dirección pasa a ser el de quien lo inicializó.
  if (!person && justBootstrapped && people.length === 1 && !people[0].email) {
    person = services.people.update(people[0].id, { nombre: who.name || people[0].nombre, email }) ;
  }
  if (!person) {
    const nombre = who.name || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    person = services.people.create({ nombre, email, rol: who.rol });
  }
  if (person.rol !== who.rol || !person.activo || person.email?.toLowerCase() !== email) {
    person = services.people.update(person.id, { rol: who.rol, activo: true, email });
  }
  return person.id;
}
