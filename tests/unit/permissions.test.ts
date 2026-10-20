import { describe, expect, it } from 'vitest';
import { can, canEditAnything } from '../../src/domain/permissions';
import { ROLES } from '../../src/domain/constants';

describe('permisos por rol', () => {
  it('Consulta sólo lee: no puede modificar nada', () => {
    const consulta = { rol: 'CONSULTA' as const };
    expect(canEditAnything(consulta)).toBe(false);
    for (const action of ['project.edit', 'project.override', 'commitment.manage', 'config.manage', 'data.restore'] as const) expect(can(consulta, action)).toBe(false);
  });

  it('los demás roles siguen pudiendo trabajar', () => {
    for (const rol of ROLES.filter((r) => r !== 'CONSULTA')) expect(canEditAnything({ rol })).toBe(true);
    // Instalación local sin usuario identificado: se permite todo.
    expect(canEditAnything(undefined)).toBe(true);
  });
});
