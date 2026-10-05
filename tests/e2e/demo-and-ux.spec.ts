import { expect, test, type Page } from '@playwright/test';
import { dialog } from './helpers';

async function loadDemo(page: Page) {
  await page.goto('/configuracion');
  await page.getByTestId('load-demo').click();
  await expect(page.getByText('Modo demo.')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.kpis')).toBeVisible();
}

test('demo: dashboard, KPIs clicables, alertas, búsqueda y aislamiento', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadDemo(page);

  // Marketing Digital pendiente de actualizar
  await expect(page.getByTestId('area-status-Marketing Digital')).toContainText('Pendiente');
  await expect(page.getByTestId('area-status-Contenido')).toContainText('Actualizada');

  // Requieren atención: primero vencidos
  const first = page.locator('.attention-item').first();
  await expect(first).toContainText(/Compromiso venció/);

  // KPI clicable: P1 filtra proyectos
  const p1Value = await page.locator('.kpi', { hasText: /^P1/ }).locator('.kpi-value').innerText();
  await page.locator('.kpi', { hasText: /^P1/ }).click();
  await expect(page).toHaveURL(/prioridad=P1/);
  await expect(page.getByTestId('project-row')).toHaveCount(Number(p1Value));

  // KPI vencidos → compromisos filtrados por estado vencido
  await page.goto('/');
  await page.locator('.kpi', { hasText: 'Vencidos' }).click();
  await expect(page).toHaveURL(/estado=vencido/);
  const rows = page.getByTestId('commitment-row');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const t of await rows.allInnerTexts()) expect(t).toContain('Vencido');

  // Búsqueda global
  await page.getByLabel('Búsqueda global').fill('landing');
  await expect(page.locator('.search-results button').first()).toContainText('Landing Precalificador');
  await page.locator('.search-results button').first().click();
  await expect(page.getByRole('heading', { name: 'Landing Precalificador hipotecario' })).toBeVisible();

  // Mis compromisos
  await page.goto('/compromisos?vista=mis');
  await page.getByLabel('Responsable').selectOption({ label: 'Andrea Solís' });
  await expect(page.locator('.my-count')).toContainText('por gestionar');
  await expect(page.locator('.my-card').first()).toContainText('Entregar KV final');

  // Dependencias: cuellos de botella
  await page.goto('/dependencias');
  await expect(page.getByTestId('dependency-row').first()).toBeVisible();
  await expect(page.locator('.bottlenecks')).toContainText('Comercial');

  // Historial con semanas cerradas y snapshot
  await page.goto('/historial');
  await expect(page.getByTestId('history-week')).toHaveCount(3);

  // La demo no toca el espacio principal
  await page.getByRole('button', { name: 'Salir de la demo' }).click();
  await expect(page.getByText('Modo demo.')).toHaveCount(0);
  await page.goto('/proyectos');
  await expect(page.getByTestId('project-row')).toHaveCount(0);

  // Reiniciar demo pide confirmación
  await page.goto('/configuracion');
  await page.getByTestId('load-demo').click();
  await page.goto('/configuracion');
  await page.getByRole('button', { name: 'Reiniciar demo' }).click();
  await expect(dialog(page)).toContainText('Se borrarán los cambios hechos en la demo');
  await dialog(page).getByRole('button', { name: 'Reiniciar demo' }).click();
  await expect(page.getByText('Demo reiniciada')).toBeVisible();
  expect(errors).toEqual([]);
});

test('drag & drop: Eisenhower y Kanban de bloqueos con regla de compromiso', async ({ page }) => {
  // Viewport alto: el arrastre HTML5 no debe depender de hacer scroll a mitad del gesto.
  await page.setViewportSize({ width: 1600, height: 2200 });
  await loadDemo(page);
  await page.goto('/eisenhower');
  const card = page.getByTestId('eisen-card').filter({ hasText: 'Inventario y reposición de material POP' });
  await card.dragTo(page.getByTestId('quadrant-delegar'), { targetPosition: { x: 60, y: 20 } });
  await expect(page.getByTestId('quadrant-delegar')).toContainText('Inventario y reposición');
  await page.reload();
  await expect(page.getByTestId('quadrant-delegar')).toContainText('Inventario y reposición'); // persistió

  await page.goto('/bloqueos');
  const unmanaged = page.getByTestId('block-card').filter({ hasText: 'Integración pasarela de pagos' });
  await expect(page.getByTestId('kanban-por_destrabar')).toContainText('Integración pasarela');
  // Sin compromiso no puede pasar a EN GESTIÓN: abre el formulario de destrabe
  await unmanaged.dragTo(page.getByTestId('kanban-en_gestion'), { targetPosition: { x: 60, y: 20 } });
  await expect(dialog(page)).toContainText('Compromiso para destrabar');
  await dialog(page).getByLabel('Acción').fill('Solicitar alta de cuenta concentradora a Tesorería');
  await dialog(page).getByRole('combobox', { name: /^Responsable/ }).selectOption({ label: 'Sofía Treviño · SOC Store' });
  await dialog(page).getByRole('button', { name: 'Guardar y comprometer' }).click();
  await expect(page.getByTestId('kanban-en_gestion')).toContainText('Integración pasarela');
  // Resolver arrastrando
  await page.getByTestId('block-card').filter({ hasText: 'Integración pasarela de pagos' }).dragTo(page.getByTestId('kanban-resuelto'), { targetPosition: { x: 60, y: 20 } });
  await expect(page.getByTestId('kanban-resuelto')).toContainText('Integración pasarela');
});

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-h', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test(`responsive sin scroll horizontal · ${vp.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loadDemo(page);
    for (const url of ['/', '/proyectos', '/eisenhower', '/bloqueos', '/compromisos', '/dependencias', '/areas', '/actualizar', '/historial', '/configuracion']) {
      await page.goto(url);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `scroll horizontal en ${url}`).toBeLessThanOrEqual(1);
    }
    await page.goto('/');
    await page.getByTestId('start-weekly').click();
    for (let step = 1; step <= 7; step++) {
      await expect(page.getByTestId('step-count')).toHaveText(`PASO ${step} DE 7`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `scroll horizontal en paso ${step}`).toBeLessThanOrEqual(1);
      if (vp.name === '1920x1080' || vp.name === 'mobile' || vp.name === 'tablet-h') await page.screenshot({ path: info.outputPath(`junta-paso-${step}.png`) });
      if (step < 7) await page.getByTestId('next-step').click();
    }
  });
}
