import { expect, test, type Page } from '@playwright/test';
import { dialog, isoDate } from './helpers';

const stage = (page: Page) => page.getByTestId('kickoff-stage');
const next = (page: Page) => page.getByTestId('kickoff-next').click();

/** Registra y guarda un proyecto con el formulario del área. */
async function register(page: Page, nombre: string, opts: { responsable?: boolean; bloqueo?: string } = {}) {
  const form = page.getByTestId('quick-form');
  await form.getByTestId('quick-name').fill(nombre);
  if (opts.responsable) await form.getByRole('combobox', { name: 'Responsable' }).selectOption({ index: 1 });
  if (opts.bloqueo) {
    await form.getByLabel('¿Está bloqueado?').check();
    await form.getByLabel('¿Qué lo está bloqueando?').fill(opts.bloqueo);
  }
  await form.getByTestId('quick-save').click();
  await expect(page.getByTestId('capture-list')).toContainText(nombre);
}

test('Sesión 1: metodología → cada área (registro + pasos 2–7) → resumen final', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Cada área puede registrar y guardar proyectos fuera de la junta; el dashboard se actualiza.
  await page.goto('/actualizar');
  await page.getByRole('tab', { name: /SOC Store/ }).click();
  await page.getByTestId('quick-name').fill('Inventario material POP');
  await page.getByTestId('quick-save').click();
  await expect(page.getByTestId('update-row')).toHaveCount(1);
  await page.goto('/');
  await expect(page.locator('.kpi', { hasText: 'Proyectos activos' })).toContainText('1');

  await page.getByTestId('start-kickoff').click();
  await expect(page.getByTestId('kickoff-mode')).toBeVisible();

  // Metodología
  await expect(stage(page)).toHaveText('METODOLOGÍA');
  const method = page.getByTestId('methodology');
  await expect(method).toContainText('Agenda de hoy');
  await expect(method).toContainText('Un área a la vez');
  for (const t of ['Operación', 'Estrategia', 'Negocio']) await expect(method.getByRole('cell', { name: new RegExp(`^${t}`) })).toBeVisible();
  await expect(method).toContainText('atracción de franquicias o de talento para nuevas oficinas');
  for (const t of ['Revisar', 'Visibilizar', 'Ordenar', 'Priorizar', 'Detectar', 'Destrabar y comprometer', 'Cerrar']) await expect(method.getByRole('heading', { name: t, exact: true })).toBeVisible();

  // ── CONTENIDO: registro
  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · REGISTRO DE PROYECTOS');
  await expect(page.getByRole('heading', { name: '¿CUÁLES SON LOS PROYECTOS DE CONTENIDO?' })).toBeVisible();
  await expect(page.getByTestId('live-projects')).toHaveText('1');
  await expect(page.getByTestId('kickoff-import')).toHaveText(/Importar Excel de Contenido/);
  const depende = page.getByTestId('quick-form').getByRole('combobox', { name: '¿De quién depende?' });
  await expect(depende.locator('option', { hasText: 'Dirección de Posicionamiento' })).toHaveCount(1);
  await depende.selectOption({ label: 'Dirección de Posicionamiento' });
  await register(page, 'Campaña ¿Qué es SOC?', { responsable: true });
  await expect(page.getByTestId('live-projects')).toHaveText('2');
  await register(page, 'SOC TV Temporada 2', { responsable: true, bloqueo: 'Falta calendario de grabación de Comercial' });
  await expect(page.getByTestId('live-projects')).toHaveText('3');
  await expect(page.getByTestId('live-status')).toContainText('1 bloqueados');

  // Paso 2 · Visibilizar (sólo Contenido)
  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 2 DE 7');
  await expect(page.locator('.vis-item')).toHaveCount(2);

  // Paso 3 · Ordenar
  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 3 DE 7');
  await expect(page.getByTestId('eisen-card')).toHaveCount(2);
  await page.getByLabel('Mover «SOC TV Temporada 2» a').selectOption('planificar');
  await expect(page.getByTestId('quadrant-planificar')).toContainText('SOC TV Temporada 2');

  // Paso 4 · Priorizar
  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 4 DE 7');
  await expect(page.getByTestId('impact-legend')).toContainText('Impacto 3 · Negocio');
  await expect(page.getByRole('radio', { name: 'Impacto de Campaña ¿Qué es SOC? 3: Negocio' })).toHaveCount(1);
  await page.getByRole('radio', { name: /^Urgencia de Campaña ¿Qué es SOC\? 3:/ }).check({ force: true });
  await page.getByRole('radio', { name: /^Impacto de Campaña ¿Qué es SOC\? 3:/ }).check({ force: true });
  await expect(page.getByTestId('prio-row').filter({ hasText: 'Campaña ¿Qué es SOC?' }).locator('.score-num')).toHaveText('8');
  await page.getByRole('button', { name: 'Confirmar ponderación de SOC TV Temporada 2' }).click();
  await expect(page.getByTestId('ponder-status')).toContainText('✓ Los 2 proyectos');
  await expect(page.getByTestId('live-status')).toContainText('1');

  // Paso 5 · Detectar
  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 5 DE 7');
  const card = page.getByTestId('detect-card');
  await expect(card).toContainText('Campaña ¿Qué es SOC?');
  await card.getByRole('button', { name: 'Avanza' }).click();
  await expect(card).toContainText('SOC TV Temporada 2');
  await card.getByRole('button', { name: 'Bloqueado' }).click();

  // Paso 6 · Destrabar y comprometer
  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 6 DE 7');
  const unblock = page.getByTestId('unblock-card');
  await expect(unblock).toContainText('⚠ Bloqueo sin compromiso');
  await unblock.getByRole('button', { name: /Destrabar y comprometer/ }).click();
  const dlg = dialog(page);
  await dlg.getByLabel('Acción').fill('Confirmar calendario de grabación con Comercial');
  await dlg.getByRole('combobox', { name: /^Responsable/ }).selectOption({ index: 1 });
  await dlg.getByLabel('Fecha').last().fill(isoDate(2));
  await dlg.getByLabel('Hora').last().fill('12:00');
  await dlg.getByRole('button', { name: 'Guardar y comprometer' }).click();
  await expect(unblock).toContainText('Gestionado');
  await expect(page.getByTestId('live-commitments')).toHaveText('1');

  // Paso 7 · Cerrar Contenido → Diseño
  await next(page);
  await expect(stage(page)).toHaveText('CONTENIDO · PASO 7 DE 7');
  await expect(page.getByRole('heading', { name: '¿CON QUÉ SALE CONTENIDO?' })).toBeVisible();
  await expect(page.getByTestId('area-closing-status')).toContainText('TODO CLARO');
  await page.getByTestId('close-area').click();

  // ── DISEÑO, MARKETING DIGITAL, SOC STORE: misma secuencia completa
  const plan: [string, string, number][] = [
    ['DISEÑO', 'KV Convención', 1],
    ['MARKETING DIGITAL', 'Campaña Convención', 1],
    ['SOC STORE', 'Catálogo merch Q4', 2], // + el registrado antes desde "Actualizar mi área"
  ];
  for (const [area, proyecto, total] of plan) {
    await expect(stage(page)).toHaveText(`${area} · REGISTRO DE PROYECTOS`);
    await register(page, proyecto);
    await next(page);
    await expect(stage(page)).toHaveText(`${area} · PASO 2 DE 7`);
    await expect(page.locator('.vis-item')).toHaveCount(total);
    await next(page);
    await expect(stage(page)).toHaveText(`${area} · PASO 3 DE 7`);
    await expect(page.getByTestId('eisen-card')).toHaveCount(total);
    await next(page);
    await expect(stage(page)).toHaveText(`${area} · PASO 4 DE 7`);
    const confirmAll = page.getByRole('button', { name: 'Confirmar todos' });
    if (await confirmAll.count()) await confirmAll.click();
    else await page.getByRole('button', { name: /^Confirmar ponderación de/ }).click();
    await expect(page.getByTestId('ponder-status')).toContainText('✓');
    await next(page);
    await expect(stage(page)).toHaveText(`${area} · PASO 5 DE 7`);
    for (let i = 0; i < total; i++) await page.getByTestId('detect-card').getByRole('button', { name: 'Avanza' }).click();
    await next(page);
    await expect(stage(page)).toHaveText(`${area} · PASO 6 DE 7`);
    await next(page);
    await expect(stage(page)).toHaveText(`${area} · PASO 7 DE 7`);
    await expect(page.getByTestId('area-closing-status')).toContainText('TODO CLARO');
    await page.getByTestId('close-area').click();
  }

  // ── RESUMEN FINAL: proyectos, acuerdos y estatus
  await expect(stage(page)).toHaveText('RESUMEN FINAL');
  const summary = page.getByTestId('final-summary');
  await expect(summary.getByTestId('final-area')).toHaveCount(4);
  await expect(summary).toContainText('4 de 4');
  await expect(summary.getByTestId('final-area').filter({ hasText: 'Contenido' })).toContainText('Confirmar calendario de grabación con Comercial');
  await expect(page.getByTestId('closing-status')).toContainText('TODO CLARO');
  await page.getByTestId('close-weekly').click();
  await dialog(page).getByRole('button', { name: 'Cerrar Sesión 1' }).click();
  const resumen = page.getByRole('dialog', { name: 'Resumen de la semana' });
  await expect(resumen.getByTestId('summary-text')).toContainText('Confirmar calendario de grabación con Comercial');
  await resumen.getByRole('button', { name: 'Cerrar' }).click();

  // Dashboard actualizado
  await page.goto('/');
  await expect(page.locator('.kpi', { hasText: 'Proyectos activos' })).toContainText('6');
  for (const a of ['Contenido', 'Diseño', 'Marketing Digital', 'SOC Store']) await expect(page.getByTestId(`area-status-${a}`)).toContainText('Actualizada');
  await page.goto('/proyectos');
  await expect(page.getByTestId('project-row')).toHaveCount(6);
  expect(errors).toEqual([]);
});
