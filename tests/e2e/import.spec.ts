import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { readXlsx } from '../../src/data/xlsx';
import { inventoryBook } from '../fixtures/inventory';
import { dialog } from './helpers';

test('importar inventario Excel: vista previa, correcciones y carga al dashboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/actualizar');
  await page.getByRole('tab', { name: /Contenido/ }).click();
  await page.getByTestId('area-import').click();
  const dlg = dialog(page);
  await expect(dlg.getByRole('heading', { name: 'Importar inventario desde Excel' })).toBeVisible();

  // Plantilla descargable: instrucciones + una hoja por área
  const [download] = await Promise.all([page.waitForEvent('download'), dlg.getByTestId('import-template').click()]);
  expect(download.suggestedFilename()).toBe('Plantilla_Inventario_Alignment_Unblock.xlsx');
  const tpl = readXlsx(readFileSync((await download.path())!));
  expect(tpl.sheets.map((s) => s.name)).toEqual(['Instrucciones', 'Contenido', 'Diseño', 'Marketing Digital', 'SOC Store']);

  // Archivo inválido
  await dlg.getByTestId('import-file').setInputFiles({ name: 'notas.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('hola') });
  await expect(dlg.getByTestId('import-error')).toContainText('no es un Excel');

  // Inventario de la gerencia (formato original)
  await dlg.getByTestId('import-file').setInputFiles({
    name: 'Inventario_Contenido.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(inventoryBook()),
  });
  await expect(dlg.getByTestId('import-error')).toHaveCount(0);
  await expect(dlg.getByTestId('import-row')).toHaveCount(7);
  await expect(dlg).toContainText('Hojas sin tabla de proyectos (se ignoran): Resumen Dirección');
  const stats = dlg.getByTestId('import-stats');
  await expect(stats).toContainText('3Proyectos nuevos');
  await expect(stats).toContainText('1Frentes');
  await expect(dlg.getByTestId('import-confirm')).toHaveText('Importar 4 proyectos · 3 compromisos');

  // Avisos por fila y corrección en la vista previa
  const t1 = dlg.locator('[data-ref="T-01"]');
  await expect(t1).toContainText('Impacto «Alto»: clasifícalo como Operación, Estrategia o Negocio');
  await t1.getByRole('combobox', { name: 'Impacto de T-01' }).selectOption({ label: '2 · Estrategia' });
  await expect(t1).not.toContainText('clasifícalo');
  await expect(dlg.locator('[data-ref="T-05"]')).toContainText('Pendiente de validación: no se importa');
  const t3 = dlg.locator('[data-ref="T-03"]');
  await t3.getByRole('combobox', { name: 'Responsable de T-03' }).selectOption('Laura Pérez');
  await t3.getByLabel('Fecha del compromiso de T-03').fill('2026-10-20');
  await expect(dlg.getByTestId('import-confirm')).toHaveText('Importar 4 proyectos · 4 compromisos');

  // Incluir pendientes suma la fila T-05
  await dlg.getByTestId('import-pending').check();
  await expect(dlg.getByTestId('import-confirm')).toHaveText('Importar 5 proyectos · 4 compromisos');
  await dlg.getByTestId('import-pending').uncheck();

  await dlg.getByTestId('import-confirm').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Importado: 4 proyectos, 4 compromisos y 2 bloqueos')).toBeVisible();

  // Dashboard, proyectos y bloqueos actualizados
  await page.goto('/');
  await expect(page.locator('.kpi', { hasText: 'Proyectos activos' })).toContainText('4');
  await page.goto('/proyectos');
  await expect(page.getByTestId('project-row')).toHaveCount(4);
  await page.getByTestId('project-row').filter({ hasText: 'Revista - publirreportaje' }).getByRole('link').first().click();
  await expect(page.getByText('Inventario: T-01')).toBeVisible();
  await expect(page.getByText('Estrategia').first()).toBeVisible();

  // Reimportar no duplica
  await page.goto('/actualizar');
  await page.getByRole('tab', { name: /Contenido/ }).click();
  await page.getByTestId('area-import').click();
  await dialog(page).getByTestId('import-file').setInputFiles({ name: 'Inventario_Contenido.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(inventoryBook()) });
  await expect(dialog(page).locator('[data-ref="T-01"]')).toContainText('Ya existe en la herramienta');
  await expect(dialog(page).getByTestId('import-stats')).toContainText('0Proyectos nuevos');
  expect(errors).toEqual([]);
});
