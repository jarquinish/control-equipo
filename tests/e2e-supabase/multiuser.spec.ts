import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string, code = '123456') {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.getByRole('button', { name: 'No tengo contraseña: recibir un código por correo' }).click();
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Enviarme un código de acceso' }).click();
  await page.getByLabel('Código').fill(code);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Espera a que termine el inicio de sesión antes de navegar (si no, se cancela la verificación).
  if (code === '123456') await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toHaveCount(0);
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

  // Dirección cierra el acuerdo de prioridad: el gerente ya no cambia la ponderación (también lo impide el servidor)
  await admin.goto('/proyectos');
  await admin.getByTestId('project-row').first().click();
  await expect(admin.getByTestId('why-priority')).toContainText('P1 Urgente');
  await admin.getByTestId('lock-toggle').click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Cerrar acuerdo' }).click();
  await expect(admin.getByTestId('why-priority')).toContainText('Acuerdo cerrado');
  await expect(admin.getByTestId('priority-log')).toContainText('Cerrado');
  await ger.goto('/proyectos');
  await ger.reload();
  await expect(ger.getByTestId('project-row').first()).toContainText('Acuerdo cerrado');
  await ger.getByTestId('project-row').first().click();
  await expect(ger.getByRole('button', { name: 'Validación directiva' })).toHaveCount(0);
  await expect(ger.getByTestId('lock-toggle')).toHaveCount(0);
  await ger.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(ger.getByRole('dialog').getByRole('radio', { name: /^Urgencia 1:/ })).toBeDisabled();
  await ger.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

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

test('sólo consulta: alta con código, contraseña propia y sin botones de edición', async ({ browser }) => {
  const errors: string[] = [];
  const admin = await (await browser.newContext()).newPage();
  admin.on('pageerror', (e) => errors.push(e.message));
  await login(admin, 'admin@soc.test');
  await expect(admin.getByTestId('week-label')).toBeVisible();

  // Dirección da acceso de consulta y genera el código de alta
  await admin.goto('/configuracion');
  await admin.getByLabel('Correo para dar acceso').fill('lector@soc.test');
  await admin.getByLabel('Rol del nuevo acceso').selectOption('CONSULTA');
  await admin.getByRole('button', { name: 'Dar acceso' }).click();
  await expect(admin.getByTestId('issued-code')).toContainText('lector@soc.test');
  const code = (await admin.getByTestId('issued-code').locator('.alta-code').textContent())!.trim();
  expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  await expect(admin.getByTestId('member-row').filter({ hasText: 'lector@soc.test' }).getByTestId('alta-pending')).toBeVisible();

  // La persona crea su contraseña (primero con un código equivocado)
  const ctxL = await browser.newContext();
  const lector = await ctxL.newPage();
  lector.on('pageerror', (e) => errors.push(e.message));
  await lector.goto('/');
  await lector.getByRole('button', { name: 'Primera vez: crear mi contraseña' }).click();
  await lector.getByLabel('Correo').fill('Lector@SOC.test');
  await lector.getByLabel('Código de alta').fill('AAAA-BBBB-CCCC');
  await lector.getByLabel('Nueva contraseña').fill('MiClave-2026');
  await lector.getByLabel('Confirmar contraseña').fill('MiClave-2026');
  await lector.getByRole('button', { name: 'Crear contraseña y entrar' }).click();
  await expect(lector.getByRole('alert')).toContainText('El código no corresponde');
  await lector.getByLabel('Código de alta').fill(code.toLowerCase().replace(/-/g, ' '));
  await lector.getByRole('button', { name: 'Crear contraseña y entrar' }).click();

  // Ve las prioridades sin poder modificar
  await expect(lector.getByTestId('week-label')).toBeVisible();
  await expect(lector.locator('.user-name')).toContainText('Consulta (sólo lectura)');
  await lector.goto('/proyectos');
  await expect(lector.getByTestId('project-row')).toHaveCount(1);
  await expect(lector.getByRole('button', { name: 'Nuevo proyecto' })).toHaveCount(0);
  await lector.getByTestId('project-row').first().click();
  await expect(lector.getByTestId('why-priority')).toBeVisible();
  await expect(lector.getByRole('button', { name: 'Actualizar', exact: true })).toHaveCount(0);
  await lector.goto('/compromisos');
  await expect(lector.getByRole('button', { name: 'Nuevo compromiso' })).toHaveCount(0);
  await lector.goto('/weekly');
  await expect(lector.getByTestId('weekly-readonly')).toBeVisible();

  // El servidor también rechaza escrituras con su sesión
  const denied = await lector.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))!;
    const token = JSON.parse(localStorage.getItem(key)!).access_token as string;
    const r = await fetch('http://localhost:54321/rest/v1/au_records', {
      method: 'POST',
      headers: { apikey: token, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ collection: 'projects', id: 'x-consulta', data: {} }),
    });
    return r.status;
  });
  expect([401, 403]).toContain(denied);

  // Sale y vuelve a entrar con la contraseña que creó
  await lector.getByRole('button', { name: 'Salir' }).click();
  await lector.getByLabel('Correo').fill('lector@soc.test');
  await lector.getByLabel('Contraseña').fill('MiClave-2026');
  await lector.getByRole('button', { name: 'Entrar' }).click();
  await expect(lector.locator('.user-name')).toContainText('Consulta (sólo lectura)');

  // Dirección ve el alta completada
  await admin.reload();
  await expect(admin.getByTestId('member-row').filter({ hasText: 'lector@soc.test' })).toContainText('Creada');

  // Olvidó su contraseña: Dirección genera un código nuevo y la persona crea otra
  await admin.getByRole('button', { name: 'Generar código de alta para lector@soc.test' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Generar código' }).click();
  await expect(admin.getByTestId('issued-code')).toContainText('lector@soc.test');
  const code2 = (await admin.getByTestId('issued-code').locator('.alta-code').textContent())!.trim();
  expect(code2).not.toBe(code);
  await lector.getByRole('button', { name: 'Salir' }).click();
  await lector.getByLabel('Correo').fill('lector@soc.test');
  await lector.getByLabel('Contraseña').fill('MiClave-2026');
  await lector.getByRole('button', { name: 'Entrar' }).click();
  await expect(lector.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
  await lector.getByRole('button', { name: 'Primera vez: crear mi contraseña' }).click();
  await lector.getByLabel('Correo').fill('lector@soc.test');
  await lector.getByLabel('Código de alta').fill(code2);
  await lector.getByLabel('Nueva contraseña').fill('OtraClave-2026');
  await lector.getByLabel('Confirmar contraseña').fill('OtraClave-2026');
  await lector.getByRole('button', { name: 'Crear contraseña y entrar' }).click();
  await expect(lector.locator('.user-name')).toContainText('Consulta (sólo lectura)');

  expect(errors).toEqual([]);
});
