import { expect, test, type Page } from '@playwright/test';
import { inventoryBook } from '../fixtures/inventory';

async function login(page: Page, email: string, password = 'Clave-Prueba-2026') {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  // Sin SMTP (emailCode: false) sólo se entra con contraseña: no se ofrece el código por correo.
  await expect(page.getByRole('button', { name: /recibir un código/ })).toHaveCount(0);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

async function importBook(page: Page, sheet: string) {
  const dlg = page.getByRole('dialog');
  await dlg.getByTestId('import-file').setInputFiles({ name: `Inventario_${sheet}.xlsx`, mimeType: 'application/octet-stream', buffer: Buffer.from(inventoryBook(sheet)) });
  await expect(dlg.getByTestId('import-confirm')).toHaveText('Importar 4 proyectos · 3 compromisos');
  await dlg.getByTestId('import-confirm').click();
  await expect(page.getByText('Importado: 4 proyectos, 3 compromisos y 2 bloqueos')).toBeVisible();
}

test('plantilla de HubSpot: inicio de sesión, importación de Excel y datos compartidos en línea', async ({ browser }) => {
  const errors: string[] = [];
  const admin = await (await browser.newContext()).newPage();
  admin.on('pageerror', (e) => errors.push(e.message));
  await login(admin, 'admin@soc.test', 'contraseña-incorrecta');
  await expect(admin.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
  await admin.getByLabel('Contraseña').fill('Clave-Prueba-2026');
  await admin.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(admin.getByTestId('week-label')).toBeVisible();

  // Dirección importa el inventario de Contenido desde Configuración
  await admin.goto('/#/configuracion');
  await admin.getByTestId('open-import').click();
  await importBook(admin, 'Contenido');
  await admin.goto('/#/proyectos');
  await expect(admin.getByTestId('project-row')).toHaveCount(4);

  // Un gerente, en otro navegador, ve lo importado y sube el Excel de Diseño
  const ger = await (await browser.newContext()).newPage();
  ger.on('pageerror', (e) => errors.push(e.message));
  await login(ger, 'gerente@soc.test');
  await expect(ger.getByTestId('week-label')).toBeVisible();
  await ger.goto('/#/proyectos');
  await expect(ger.getByTestId('project-row')).toHaveCount(4);
  await ger.goto('/#/actualizar');
  await ger.getByRole('tab', { name: /Diseño/ }).click();
  await ger.getByTestId('area-import').click();
  await importBook(ger, 'Diseño');

  // Dirección deja la pestaña inactiva y vuelve después de un rato (sin recargar):
  // la sesión se renueva, la información se actualiza y no aparece ningún error.
  await admin.evaluate(() => {
    const realNow = Date.now.bind(Date);
    let state: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
    Date.now = () => realNow() + 5 * 60_000;
    state = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(admin.getByTestId('project-row')).toHaveCount(8);
  await expect(admin.getByText(/No fue posible/)).toHaveCount(0);

  // Y al recargar, los datos siguen ahí: están en el servidor, no en el navegador
  await admin.reload();
  await expect(admin.getByTestId('project-row')).toHaveCount(8);
  await admin.goto('/#/');
  await expect(admin.locator('.kpi', { hasText: 'Proyectos activos' })).toContainText('8');
  expect(errors).toEqual([]);
});
