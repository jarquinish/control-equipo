import { expect, test } from '@playwright/test';
import { investmentPackage } from '../fixtures/investmentPackage';
import { dialog } from './helpers';

test('Inversión, KPIs y Resultados: carga del paquete, vistas, vínculos y alertas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Proyecto existente (no se toca al cargar el paquete)
  await page.goto('/proyectos');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).first().click();
  let dlg = dialog(page);
  await dlg.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Campaña Franquicias');
  await dlg.getByRole('combobox', { name: 'Área', exact: true }).selectOption({ label: 'Marketing Digital' });
  await dlg.getByRole('radio', { name: /^Urgencia 3:/ }).check({ force: true });
  await dlg.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(page.getByRole('heading', { name: 'Campaña Franquicias' })).toBeVisible();
  const projectUrl = page.url();

  // Módulo vacío → Datos → paquete
  await page.getByRole('link', { name: 'Inversión y KPIs' }).click();
  await expect(page.getByText('Aún no hay información de inversión ni KPIs')).toBeVisible();
  await page.getByRole('link', { name: /Cargar paquete de datos validados/ }).click();
  await page.getByTestId('package-file').setInputFiles({
    name: 'paquete.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(investmentPackage)),
  });
  await expect(page.getByText('Discrepancias detectadas contra la referencia')).toBeVisible();
  await page.getByTestId('apply-package').click();
  await dialog(page).getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText(/Listo: se agregaron 17 registros/)).toBeVisible();

  // Volver a cargar no duplica
  await page.getByTestId('package-file').setInputFiles({
    name: 'paquete.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(investmentPackage)),
  });
  await expect(page.getByTestId('apply-package')).toHaveText('Agregar 0 registros');
  await expect(page.getByTestId('apply-package')).toBeDisabled();

  // Resumen
  await page.getByRole('tab', { name: 'Resumen ejecutivo' }).click();
  await expect(page.locator('.kpi', { hasText: 'Presupuesto anual vigente' })).toContainText('$1,600');
  await expect(page.locator('.kpi', { hasText: /^Ejercido/ })).toContainText('$590');

  // Control presupuestal: transferencia, sobreejercicio, gasto sin partida, reclasificación pendiente
  await page.getByRole('tab', { name: 'Control presupuestal' }).click();
  await expect(page.getByTestId('budget-row')).toHaveCount(3);
  const herr = page.getByTestId('budget-row').filter({ hasText: 'Herramientas' });
  await expect(herr).toContainText('Sobreejercido');
  await expect(page.getByText('Gasto contable sin partida autorizada')).toBeVisible();
  await expect(page.getByText(/La referencia la nombra «Paid»/).first()).toBeVisible();
  await expect(page.locator('.inv-checks-list li.bad')).toHaveCount(0);
  await page.getByTestId('budget-row').filter({ hasText: 'Digital' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos que financia' })).toBeVisible();

  // Asignar partida al proyecto desde el detalle del proyecto (supera el vigente → rechazo)
  await page.goto(projectUrl);
  await expect(page.getByText('Inversión, KPIs y resultados')).toBeVisible();
  await page.getByRole('button', { name: 'Asignar partida' }).click();
  dlg = dialog(page);
  await dlg.locator('#f-monto').fill('900');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(dlg.getByRole('alert')).toContainText('sólo tiene');
  await dlg.locator('#f-monto').fill('800');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.inv-project-panel')).toContainText('Asignado $800');

  // Vincular KPI
  await page.getByTestId('link-kpi').click();
  dlg = dialog(page);
  await dlg.locator('#f-kpiId').selectOption({ label: 'C-LEADS · Leads de franquicias' });
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.inv-project-panel')).toContainText('C-LEADS · Leads de franquicias');

  // Proyectos e inversión
  await page.goto('/inversion?vista=proyectos');
  const row = page.getByTestId('inv-project-row').filter({ hasText: 'Campaña Franquicias' });
  await expect(row).toContainText('$800');
  await expect(row).toContainText('C-LEADS');

  // KPIs: detalle, meta y resultado
  await page.getByRole('tab', { name: 'KPIs y resultados' }).click();
  await page.getByTestId('kpi-row').filter({ hasText: 'C-LEADS' }).click();
  await page.getByRole('button', { name: 'Meta por periodo' }).click();
  dlg = page.getByRole('dialog').last();
  await dlg.locator('#f-inicio').fill('2026-01-01');
  await dlg.locator('#f-fin').fill('2026-02-28');
  await dlg.locator('#f-meta').fill('250');
  await dlg.locator('#f-fuente').fill('Plan de prueba');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog').last()).toContainText('Debajo de meta');
  await page.keyboard.press('Escape');

  // Eficiencia: CPL calculado y CPA no calculable con motivo
  await page.getByRole('tab', { name: 'Eficiencia y rentabilidad' }).click();
  await expect(page.getByTestId('metric-cpl')).toContainText('$50.00');
  await expect(page.getByTestId('metric-cpcierre')).toContainText('$5,000.00');
  await expect(page.getByTestId('metric-roas')).toContainText('No calculable con los datos disponibles');

  // Centro de decisiones
  await page.getByRole('tab', { name: /Centro de decisiones/ }).click();
  await expect(page.getByTestId('exec-alert').filter({ hasText: '03 · Herramientas' }).filter({ hasText: 'sobreejercicio' })).toBeVisible();
  await expect(page.getByTestId('exec-alert').filter({ hasText: 'Gasto sin partida: Content' })).toBeVisible();
  await expect(page.getByTestId('exec-alert').filter({ hasText: 'R1' })).toBeVisible();
  await expect(page.getByTestId('exec-alert').filter({ hasText: 'Partida 01 · Digital' })).toContainText('Paid');

  // Gerencias
  await page.getByRole('tab', { name: 'Desempeño por gerencia' }).click();
  await expect(page.locator('.inv-compare')).toContainText('$800');

  // Sin scroll horizontal en celular ni en tableta
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const v of ['resumen', 'gerencias', 'proyectos', 'presupuesto', 'kpis', 'eficiencia', 'decisiones', 'datos']) {
      await page.goto(`/inversion?vista=${v}`);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `scroll horizontal en ${v} (${width}px)`).toBeLessThanOrEqual(1);
    }
    await page.goto(projectUrl);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Las funciones originales siguen operando
  await page.goto('/proyectos');
  await expect(page.getByTestId('project-row')).toHaveCount(1);
  await page.goto('/weekly');
  await expect(page.getByTestId('start-kickoff').or(page.getByTestId('start-weekly')).first()).toBeVisible();
  expect(errors).toEqual([]);
});
