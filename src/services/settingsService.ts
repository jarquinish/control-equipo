import { DEFAULT_STATUS_LABELS } from '../domain/constants';
import type { Criteria, ProjectStatus, Settings } from '../domain/types';
import { assertValid, type FieldErrors } from '../domain/validation';
import type { ServiceContext } from './context';

export function settingsService(ctx: ServiceContext) {
  const save = (patch: Partial<Settings>): Settings => {
    const next: Settings = { ...ctx.settings(), ...patch, id: 'settings', updatedAt: ctx.nowIso() };
    return ctx.repos.settings.upsert(next);
  };

  return {
    get: () => ctx.settings(),
    update: save,
    setCurrentUser: (userId: string | undefined) => save({ currentUserId: userId }),
    setActiveWeek: (weekId: string) => save({ activeWeekId: weekId }),

    addExternalDependency(nombre: string) {
      const n = nombre.trim();
      assertValid(n ? {} : { nombre: 'Escribe el nombre del área o entidad externa.' });
      const list = ctx.settings().externalDependencies;
      if (list.some((x) => x.toLowerCase() === n.toLowerCase())) return ctx.settings();
      return save({ externalDependencies: [...list, n] });
    },
    removeExternalDependency(nombre: string) {
      return save({ externalDependencies: ctx.settings().externalDependencies.filter((x) => x !== nombre) });
    },

    setStatusLabel(status: ProjectStatus, label: string) {
      const l = label.trim() || DEFAULT_STATUS_LABELS[status];
      return save({ statusLabels: { ...ctx.settings().statusLabels, [status]: l } });
    },

    setCriteria(patch: Partial<Criteria>) {
      const errors: FieldErrors = {};
      for (const [k, v] of Object.entries(patch)) {
        if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 999) errors[k] = 'Debe ser un número entero positivo.';
      }
      assertValid(errors);
      return save({ criteria: { ...ctx.settings().criteria, ...patch } });
    },
  };
}
