import { expect, test, type Page } from '@playwright/test';
import { dialog, isoDate } from './helpers';

const stage = (page: Page) => page.getByTestId('kickoff-stage');
const next = (page: Page) => page.getByTestId('kickoff-next').click();

async function addProject(page: Page, nombre: string) {
  await page.getByTestId('capture-name').fill(nombre);
  await page.getByTestId('capture-name').press('Enter');
  await expect(page.getByTestId('capture-list')).toContainText(nombre);
}

test('Sesión 1 · arranque: metodología → proyectos por área → pasos 3–7 por área → cierre', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('start-kickoff').click();
  await expect(page.getByTestId('kickoff-mode')).toBeVisible();

  // 1. Primera hoja: metodología
  await expect(stage(page)).toHaveText('METODOLOGÍA');
  const method = page.getByTestId('methodology');
  await expect(method).toContainText('Objetivo');
  await expect(method).toContainText('Agenda de hoy');
  for (const t of ['Revisar', 'Visibilizar', 'Ordenar', 'Priorizar', 'Detectar', 'Destrabar y comprometer', 'Cerrar']) await expect(method.getByRole('heading', { name: t, exact: true })).toBeVisible();
  await expect(method).toContainText('Hoy no aplica');

  // 2. Proyectos por área
  await next(page);
  await expect(stage(page)).toHaveText('PROYECTOS POR ÁREA');
  await page.getByRole('combobox', { name: 'Responsable' }).selectOption({ index: 1 });
  await addProject(page, 'Campaña ¿Qué es SOC?');
  await addProject(page, 'SOC TV Temporada 2');
  for (const [area, nombre] of [['Diseño', 'KV Convención'], ['Marketing Digital', 'Campaña Convención'], ['SOC Store', 'Catálogo merch Q4']]) {
    await page.getByRole('tab', { name: new RegExp(area) }).click();
    await addProject(page, nombre);
  }
  await expect(page.getByRole('tab', { name: /Contenido/ })).toContainText('2');

  // 3–7 · Contenido
  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 3 DE 7');
  await expect(page.getByTestId('eisen-card')).toHaveCount(2);
  await page.getByLabel('Mover «SOC TV Temporada 2» a').selectOption('planificar');
  await expect(page.getByTestId('quadrant-planificar')).toContainText('SOC TV Temporada 2');

  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 4 DE 7');
  await expect(page.getByTestId('ponder-status')).toContainText('0 de 2');
  await page.getByRole('radio', { name: /^Urgencia de Campaña ¿Qué es SOC\? 3:/ }).check({ force: true });
  await page.getByRole('radio', { name: /^Impacto de Campaña ¿Qué es SOC\? 3:/ }).check({ force: true });
  await expect(page.getByTestId('prio-row').filter({ hasText: 'Campaña ¿Qué es SOC?' }).locator('.score-num')).toHaveText('8');
  await expect(page.getByTestId('ponder-status')).toContainText('1 de 2');
  await page.getByRole('button', { name: 'Confirmar ponderación de SOC TV Temporada 2' }).click();
  await expect(page.getByTestId('ponder-status')).toContainText('✓ Los 2 proyectos');

  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 5 DE 7');
  const card = page.getByTestId('detect-card');
  await expect(card).toContainText('Campaña ¿Qué es SOC?'); // P1 primero
  await card.getByRole('button', { name: 'Bloqueado' }).click();
  const dlg = dialog(page);
  await dlg.getByLabel('¿Qué está bloqueando el proyecto?').fill('Falta aprobación del copy por Dirección');
  await dlg.getByLabel('Acción').fill('Aprobar copy de la fase Conversación');
  await dlg.getByRole('combobox', { name: /^Responsable/ }).selectOption({ index: 1 });
  await dlg.getByLabel('Fecha').last().fill(isoDate(2));
  await dlg.getByLabel('Hora').last().fill('12:00');
  await dlg.getByRole('button', { name: 'Guardar y comprometer' }).click();
  await expect(dlg).toHaveCount(0);
  await page.getByRole('button', { name: /SOC TV Temporada 2/ }).click();
  await card.getByRole('button', { name: 'Avanza' }).click();

  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 6 DE 7');
  await expect(page.getByTestId('unblock-card')).toHaveCount(1);
  await expect(page.getByTestId('unblock-card')).toContainText('Gestionado');

  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 7 DE 7');
  await expect(page.getByRole('heading', { name: '¿CON QUÉ SALE CONTENIDO?' })).toBeVisible();
  await expect(page.getByTestId('area-closing-status')).toContainText('TODO CLARO');
  await page.getByTestId('close-area').click();

  // Diseño, Marketing Digital, SOC Store: 3 → 7 con ponderación confirmada
  for (const area of ['DISEÑO', 'MARKETING DIGITAL', 'SOC STORE']) {
    await expect(stage(page)).toHaveText(`${area} · PASO 3 DE 7`);
    await expect(page.getByTestId('eisen-card')).toHaveCount(1);
    await next(page);
    await expect(stage(page)).toHaveText(`${area} · PASO 4 DE 7`);
    await page.getByRole('button', { name: /^Confirmar ponderación de/ }).click();
    await expect(page.getByTestId('ponder-status')).toContainText('✓');
    await next(page);
    await page.getByTestId('detect-card').getByRole('button', { name: 'Avanza' }).click();
    await next(page);
    await next(page);
    await expect(stage(page)).toHaveText(`${area} · PASO 7 DE 7`);
    await expect(page.getByTestId('area-closing-status')).toContainText('TODO CLARO');
    await page.getByTestId('close-area').click();
  }

  // Cierre general
  await expect(stage(page)).toHaveText('CIERRE GENERAL');
  await expect(page.getByText('⚠ sin cerrar')).toHaveCount(0);
  await expect(page.getByTestId('closing-status')).toContainText('TODO CLARO');
  await page.getByTestId('close-weekly').click();
  await dialog(page).getByRole('button', { name: 'Cerrar Sesión 1' }).click();
  const summary = page.getByRole('dialog', { name: 'Resumen de la semana' });
  await expect(summary.getByTestId('summary-text')).toContainText('Aprobar copy de la fase Conversación');
  await summary.getByRole('button', { name: 'Cerrar' }).click();

  // Las cuatro áreas quedan como actualizadas y la siguiente semana arranca con Weekly regular
  await page.goto('/');
  for (const a of ['Contenido', 'Diseño', 'Marketing Digital', 'SOC Store']) await expect(page.getByTestId(`area-status-${a}`)).toContainText('Actualizada');
  await page.goto('/weekly');
  await expect(page.getByRole('heading', { name: 'Weekly cerrada' })).toBeVisible();
  expect(errors).toEqual([]);
});
