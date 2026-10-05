import { expect, type Page } from '@playwright/test';

export function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isoWeekNumber(date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - y.getTime()) / 86400000 + 1) / 7);
}

export const dialog = (page: Page) => page.getByRole('dialog');

export async function setLevels(page: Page, i: number, u: number, d: number) {
  const dlg = dialog(page);
  await dlg.getByRole('radio', { name: new RegExp(`^Impacto ${i}:`) }).check({ force: true });
  await dlg.getByRole('radio', { name: new RegExp(`^Urgencia ${u}:`) }).check({ force: true });
  await dlg.getByRole('radio', { name: new RegExp(`^Dependencia ${d}:`) }).check({ force: true });
}

export async function createProject(
  page: Page,
  opts: { nombre: string; responsable: string; i: number; u: number; d: number; bloqueo?: string },
) {
  const dlg = dialog(page);
  await expect(dlg.getByRole('heading', { name: 'Nuevo proyecto' })).toBeVisible();
  await dlg.getByRole('textbox', { name: 'Nombre', exact: true }).fill(opts.nombre);
  await dlg.getByLabel('Responsable').selectOption({ label: opts.responsable });
  await setLevels(page, opts.i, opts.u, opts.d);
  await expect(dlg.getByTestId('score-preview')).toHaveText(String(opts.i + opts.u + opts.d));
  if (opts.bloqueo) {
    await dlg.getByLabel('¿Está bloqueado?').check();
    await dlg.getByLabel('¿Qué está bloqueando el proyecto?').fill(opts.bloqueo);
  }
  await dlg.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(dlg).toHaveCount(0);
}

/** Llena el bloque de compromiso dentro del modal de bloqueo o compromiso. */
export async function fillCommitment(page: Page, opts: { accion: string; responsable: string; fecha: string; hora: string; apoyo?: string }) {
  const dlg = dialog(page);
  await dlg.getByLabel('Acción', { exact: false }).first().fill(opts.accion);
  await dlg.getByRole('combobox', { name: /^Responsable/ }).last().selectOption({ label: opts.responsable });
  if (opts.apoyo) await dlg.getByLabel('Apoyo').fill(opts.apoyo);
  await dlg.getByLabel('Fecha', { exact: false }).last().fill(opts.fecha);
  await dlg.getByLabel('Hora', { exact: false }).last().fill(opts.hora);
}
