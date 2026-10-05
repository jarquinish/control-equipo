import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string, code = '123456') {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Enviarme un código de acceso' }).click();
  await page.getByLabel('Código').fill(code);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('multiusuario: acceso, roles, datos compartidos y sesión', async ({ browser }) => {
  const errors: string[] = [];
  const ctxA = await browser.newContext();
  const admin = await ctxA.newPage();
  admin.on('pageerror', (e) => errors.push(e.message));

  // Código incorrecto
  await login(admin, 'admin@soc.test', '000000');
  await expect(admin.getByRole('alert')).toContainText('El código no es válido');
  await admin.getByLabel('Código').fill('123456');
  await admin.getByRole('button', { name: 'Entrar' }).click();

  // Dirección inicializa el espacio compartido
  await expect(admin.getByTestId('week-label')).toBeVisible();
  await expect(admin.locator('.user-name')).toContainText('Administrador');
  await admin.getByRole('button', { name: 'Nuevo proyecto' }).first().click();
  const dlg = admin.getByRole('dialog');
  await dlg.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Campaña Convención');
  await dlg.getByRole('combobox', { name: 'Área', exact: true }).selectOption({ label: 'Marketing Digital' });
  await dlg.getByRole('radio', { name: /^Urgencia 3:/ }).check({ force: true });
  await dlg.getByRole('button', { name: 'Crear proyecto' }).click();
  await expect(admin.getByRole('heading', { name: 'Campaña Convención' })).toBeVisible();

  // Accesos: otorga acceso a un colaborador
  await admin.goto('/configuracion');
  await expect(admin.getByTestId('member-row')).toHaveCount(2);
  await admin.getByLabel('Correo para dar acceso').fill('Nuevo@SOC.test');
  await admin.getByLabel('Rol del nuevo acceso').selectOption('COLABORADOR');
  await admin.getByRole('button', { name: 'Dar acceso' }).click();
  await expect(admin.getByTestId('member-row')).toHaveCount(3);
  await expect(admin.getByTestId('member-row').filter({ hasText: 'nuevo@soc.test' })).toBeVisible();

  // Gerente en otro navegador: ve lo de Dirección y agrega un compromiso
  const ctxG = await browser.newContext();
  const ger = await ctxG.newPage();
  ger.on('pageerror', (e) => errors.push(e.message));
  await login(ger, 'gerente@soc.test');
  await ger.goto('/proyectos');
  await expect(ger.getByTestId('project-row')).toHaveCount(1);
  await ger.goto('/compromisos');
  await ger.getByRole('button', { name: 'Nuevo compromiso' }).click();
  const gd = ger.getByRole('dialog');
  await gd.getByLabel('Proyecto').selectOption({ index: 1 });
  await gd.getByLabel('Acción').fill('Validar presupuesto con Comercial');
  await gd.getByRole('combobox', { name: /^Responsable/ }).selectOption({ index: 1 });
  await gd.getByLabel('Fecha').fill('2030-01-15');
  await gd.getByLabel('Hora').fill('13:00');
  await gd.getByRole('button', { name: 'Crear compromiso' }).click();
  await expect(ger.getByTestId('commitment-row')).toHaveCount(1);
  // El gerente no administra configuración ni accesos
  await ger.goto('/configuracion');
  await expect(ger.getByText('Los accesos los administra Dirección o Administración.')).toBeVisible();
  await expect(ger.getByRole('button', { name: 'Agregar área' })).toBeDisabled();

  // Dirección ve el compromiso del gerente (persistido en el servidor)
  await admin.goto('/compromisos');
  await expect(admin.getByTestId('commitment-row').filter({ hasText: 'Validar presupuesto con Comercial' })).toBeVisible();

  // Correo sin acceso
  const ctxX = await browser.newContext();
  const x = await ctxX.newPage();
  await login(x, 'extrano@gmail.com');
  await expect(x.getByText('Tu correo aún no tiene acceso')).toBeVisible();

  // Cerrar sesión y volver a entrar: la información sigue ahí
  await admin.getByRole('button', { name: 'Salir' }).click();
  await expect(admin.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await login(admin, 'admin@soc.test');
  await admin.goto('/proyectos');
  await expect(admin.getByTestId('project-row')).toHaveCount(1);

  expect(errors).toEqual([]);
});
