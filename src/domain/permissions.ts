import type { Person, Role } from './types';

/**
 * Matriz de permisos preparada para multiusuario. En V1 (local, sin
 * autenticación) se usa para orientar la interfaz según el usuario activo;
 * cuando exista backend, el servidor debe aplicar la misma matriz.
 */
export type Action =
  | 'project.edit'
  | 'project.override'
  | 'weekly.run'
  | 'weekly.close'
  | 'week.open'
  | 'commitment.manage'
  | 'config.manage'
  | 'data.restore';

const MATRIX: Record<Role, Action[]> = {
  ADMIN: ['project.edit', 'project.override', 'weekly.run', 'weekly.close', 'week.open', 'commitment.manage', 'config.manage', 'data.restore'],
  DIRECTOR: ['project.edit', 'project.override', 'weekly.run', 'weekly.close', 'week.open', 'commitment.manage', 'config.manage', 'data.restore'],
  GERENTE: ['project.edit', 'commitment.manage', 'weekly.run'],
  COLABORADOR: ['commitment.manage'],
  /** Sólo consulta: ve toda la información y no modifica nada (también lo impide el servidor). */
  CONSULTA: [],
};

export function can(user: Pick<Person, 'rol'> | undefined, action: Action): boolean {
  // Sin usuario identificado (instalación local de un solo equipo) se permite todo.
  if (!user) return true;
  return MATRIX[user.rol]?.includes(action) ?? false;
}

export const PERMISSION_MATRIX = MATRIX;

/** ¿Puede modificar algo? (consulta no). */
export function canEditAnything(user: Pick<Person, 'rol'> | undefined): boolean {
  return can(user, 'project.edit') || can(user, 'commitment.manage');
}
