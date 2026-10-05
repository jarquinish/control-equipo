import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createProject, dialog, fillCommitment, isoDate, isoWeekNumber } from './helpers';

/**
 * PRUEBA END-TO-END SIMULADA (sección 55):
 * Semana 1 completa (áreas actualizan → Weekly de 7 pasos → cierre → resumen → respaldo)
 * Semana 2 (nueva semana → revisar compromisos → cumplir / reprogramar / escalar →
 * actualizar → agregar → cerrar proyecto → historial intacto → cerrar Weekly)
 * + restaurar respaldo, recarga del navegador e importación inválida.
 */
test('flujo completo de dos semanas', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const W1 = isoWeekNumber();

  await page.goto('/');
  await expect(page.getByTestId('week-label')).toHaveText(`SEMANA ${W1}`);
  await expect(page.getByText('Bienvenido a Alignment & Unblock')).toBeVisible();

  // ── Responsables
  await page.getByRole('link', { name: 'Configuración' }).click();
  const people: [string, string][] = [
    ['Carla Contenido', 'Contenido'],
    ['Ana Diseño', 'Diseño'],
    ['Beto Marketing', 'Marketing Digital'],
    ['Dani Store', 'SOC Store'],
  ];
  for (const [nombre, area] of people) {
    await page.getByLabel('Nombre de la persona').fill(nombre);
    await page.getByLabel('Rol', { exact: true }).selectOption('GERENTE');
    await page.getByLabel('Área', { exact: true }).selectOption({ label: area });
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByLabel(`Rol de ${nombre}`)).toBeVisible();
  }

  // ── SEMANA 1 · Las cuatro áreas actualizan
  const plan: { area: string; projects: Parameters<typeof createProject>[1][] }[] = [
    { area: 'Contenido', projects: [{ nombre: 'Campaña Qué es SOC', responsable: 'Carla Contenido · Contenido', i: 3, u: 3, d: 2 }] },
    { area: 'Diseño', projects: [{ nombre: 'KV Convención', responsable: 'Ana Diseño · Diseño', i: 3, u: 2, d: 2 }] },
    {
      area: 'Marketing Digital',
      projects: [
        { nombre: 'Campaña Convención', responsable: 'Beto Marketing · Marketing Digital', i: 3, u: 3, d: 3, bloqueo: 'Comercial no confirma presupuesto' },
        { nombre: 'Reporte de pauta', responsable: 'Beto Marketing · Marketing Digital', i: 1, u: 2, d: 1 },
      ],
    },
    { area: 'SOC Store', projects: [{ nombre: 'Catálogo merch', responsable: 'Dani Store · SOC Store', i: 2, u: 3, d: 2 }] },
  ];
  for (const { area, projects } of plan) {
    await page.goto('/');
    await page.getByTestId(`area-status-${area}`).click();
    await expect(page.getByRole('heading', { name: 'Actualizar mi semana' })).toBeVisible();
    for (const p of projects) {
      await page.getByRole('button', { name: 'Crear proyecto' }).first().click();
      await createProject(page, p);
      await expect(page.getByRole('heading', { name: p.nombre })).toBeVisible(); // detalle del proyecto
      await page.goBack();
    }
    await page.getByTestId('complete-area-update').click();
    await expect(page.getByTestId('area-update-status')).toContainText('Actualización completada');
  }
  await page.goto('/');
  for (const { area } of plan) await expect(page.getByTestId(`area-status-${area}`)).toContainText('Actualizada');
  await expect(page.locator('.kpi', { hasText: 'Proyectos activos' })).toContainText('5');
  await expect(page.locator('.kpi', { hasText: 'Bloqueados' })).toContainText('1');

  // ── Dirección inicia la Weekly
  await page.getByTestId('start-weekly').click();
  await expect(page.getByTestId('meeting-mode')).toBeVisible();
  await expect(page.getByTestId('step-count')).toHaveText('PASO 1 DE 7');
  await expect(page.getByText('No hay compromisos anteriores abiertos')).toBeVisible();

  // Paso 2 · Visibilizar
  await page.getByTestId('next-step').click();
  await expect(page.getByTestId('step-count')).toHaveText('PASO 2 DE 7');
  await expect(page.getByRole('heading', { name: '¿EN QUÉ ESTAMOS?' })).toBeVisible();

  // Paso 3 · Ordenar (Eisenhower)
  await page.getByTestId('next-step').click();
  await expect(page.getByText('¿ES REALMENTE PRIORITARIO O SIMPLEMENTE LLEGÓ CON URGENCIA?')).toBeVisible();
  await page.getByLabel('Mover «Reporte de pauta» a').selectOption('eliminar');
  await expect(page.getByTestId('quadrant-eliminar')).toContainText('Reporte de pauta');

  // Paso 4 · Priorizar (recalcular + override)
  await page.getByTestId('next-step').click();
  await expect(page.getByTestId('count-P1')).toHaveText('2'); // Qué es SOC (8), Convención (9)
  const kvRow = page.getByTestId('prio-row').filter({ hasText: 'KV Convención' });
  await expect(kvRow).toContainText('7');
  await kvRow.getByRole('radio', { name: /^Urgencia de KV Convención 3:/ }).check({ force: true });
  await expect(kvRow.locator('.score-num')).toHaveText('8');
  await expect(page.getByTestId('count-P1')).toHaveText('3');
  await page.getByRole('button', { name: 'Ajustar prioridad de Catálogo merch' }).click();
  await dialog(page).locator('label.radio-card', { hasText: 'P1' }).click();
  await dialog(page).getByLabel('Motivo (opcional)').fill('Temporada alta de pedidos');
  await dialog(page).getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByTestId('count-P1')).toHaveText('4');

  // Paso 5 · Detectar
  await page.getByTestId('next-step').click();
  const card = page.getByTestId('detect-card');
  await expect(card).toContainText('Campaña Convención'); // P1 bloqueado primero
  await card.getByRole('button', { name: 'Bloqueado' }).click(); // ya tiene bloqueo → pasa al siguiente
  await expect(card.locator('.detect-name')).not.toHaveText('Campaña Convención');
  // KV Convención: se detecta bloqueo y se compromete en el momento
  while (!(await card.locator('.detect-name').innerText()).includes('KV Convención')) {
    await card.getByRole('button', { name: 'Avanza' }).click();
  }
  await card.getByRole('button', { name: 'Bloqueado' }).click();
  await dialog(page).getByLabel('¿Qué está bloqueando el proyecto?').fill('Falta agenda final');
  await dialog(page).getByLabel('¿Qué necesitamos para avanzar?').fill('Agenda final de Comercial');
  await dialog(page).getByLabel('¿De quién depende? (área)').selectOption({ label: 'Comercial' });
  await fillCommitment(page, { accion: 'Pedir agenda final a Comercial', responsable: 'Ana Diseño · Diseño', fecha: isoDate(2), hora: '11:00', apoyo: 'Dirección' });
  await dialog(page).getByRole('button', { name: 'Guardar y comprometer' }).click();
  await expect(dialog(page)).toHaveCount(0);
  // Catálogo: requiere decisión
  await page.getByRole('button', { name: /Catálogo merch/ }).click();
  await card.getByRole('button', { name: 'Requiere decisión' }).click();
  await dialog(page).getByLabel('Decisión').fill('Se aprueba proveedor alterno para el catálogo');
  await dialog(page).getByRole('button', { name: 'Registrar decisión' }).click();
  await expect(dialog(page)).toHaveCount(0);

  // Paso 6 · Destrabar y comprometer
  await page.getByTestId('next-step').click();
  const conv = page.getByTestId('unblock-card').filter({ hasText: 'Campaña Convención' });
  await expect(conv).toContainText('⚠ Bloqueo sin compromiso');
  await conv.getByRole('button', { name: /Destrabar y comprometer/ }).click();
  await dialog(page).getByLabel('¿De quién depende? (área)').selectOption({ label: 'Comercial' });
  await dialog(page).getByLabel('¿Quién gestionará el desbloqueo?').selectOption({ label: 'Beto Marketing · Marketing Digital' });
  await fillCommitment(page, { accion: 'Validar presupuesto de pauta con Comercial', responsable: 'Beto Marketing · Marketing Digital', fecha: isoDate(1), hora: '13:00' });
  await dialog(page).getByRole('button', { name: 'Guardar y comprometer' }).click();
  await expect(conv).toContainText('Gestionado');

  // Compromiso adicional de avance (sin bloqueo) para tener tres
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.goto('/compromisos');
  await page.getByRole('button', { name: 'Nuevo compromiso' }).click();
  await dialog(page).getByLabel('Proyecto').selectOption({ label: 'P1 · Campaña Qué es SOC' });
  await fillCommitment(page, { accion: 'Aprobar copy fase Conversación', responsable: 'Carla Contenido · Contenido', fecha: isoDate(3), hora: '17:00' });
  await dialog(page).getByRole('button', { name: 'Crear compromiso' }).click();
  await expect(page.getByTestId('commitment-row')).toHaveCount(3);
  await page.goto('/weekly');
  await page.getByRole('button', { name: 'Continuar Weekly' }).click();

  // Paso 7 · Cerrar
  await page.locator('.step-pill', { hasText: 'Cerrar' }).click();
  await expect(page.getByTestId('step-count')).toHaveText('PASO 7 DE 7');
  await expect(page.getByTestId('closing-status')).toContainText('TODO CLARO');
  await expect(page.getByTestId('final-row')).toHaveCount(3);
  await page.getByTestId('close-weekly').click();
  await dialog(page).getByRole('button', { name: 'Cerrar Weekly' }).click();

  // Resumen automático
  const summary = page.getByRole('dialog', { name: 'Resumen de la semana' });
  await expect(summary).toBeVisible();
  await expect(summary.getByTestId('summary-text')).toContainText(`SEMANA ${W1}`);
  await expect(summary.getByTestId('summary-text')).toContainText('PRIORIDADES P1 (4)');
  await expect(summary.getByTestId('summary-text')).toContainText('Validar presupuesto de pauta con Comercial');
  await summary.getByRole('button', { name: 'Copiar para Teams' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`**SEMANA ${W1}**`);
  await summary.getByRole('button', { name: 'Copiar sólo compromisos' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Pedir agenda final a Comercial');
  const [mdDownload] = await Promise.all([page.waitForEvent('download'), summary.getByRole('button', { name: 'Descargar .md' }).click()]);
  expect(mdDownload.suggestedFilename()).toBe(`alignment-unblock-semana-${W1}.md`);
  await summary.getByRole('button', { name: 'Cerrar' }).click();

  // Exporta respaldo
  await page.goto('/configuracion');
  const [backupDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Generar respaldo' }).click()]);
  const backupPath = testInfo.outputPath('respaldo.json');
  await backupDl.saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  expect(backup.app).toBe('alignment-unblock');
  expect(backup.data.projects).toHaveLength(5);

  // Historial de la semana 1 antes de la semana 2
  await page.goto('/historial');
  await page.getByTestId('history-week').filter({ hasText: `Semana ${W1}` }).click();
  await page.getByRole('tab', { name: 'Compromisos' }).click();
  const w1Url = page.url();
  const w1CommitmentsBefore = await page.getByTestId('commitment-row').allInnerTexts();
  expect(w1CommitmentsBefore).toHaveLength(3);

  // ── SEMANA 2
  await page.goto('/weekly');
  await page.getByRole('button', { name: 'Abrir semana siguiente' }).click();
  await dialog(page).getByRole('button', { name: /Abrir Semana/ }).click();
  await expect(page.getByTestId('week-label')).toHaveText(`SEMANA ${W1 + 1}`);

  // Actualizar un proyecto, agregar otro y cerrar otro
  await page.goto('/actualizar');
  await page.getByRole('tab', { name: /SOC Store/ }).click();
  await page.getByRole('button', { name: 'Crear proyecto' }).first().click();
  await createProject(page, { nombre: 'Campaña Buen Fin', responsable: 'Dani Store · SOC Store', i: 2, u: 3, d: 1 });
  await page.goto('/proyectos');
  await page.getByRole('link', { name: 'Reporte de pauta' }).click();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Cerrar proyecto' }).click();
  await expect(page.locator('.project-head')).toContainText('Cerrado');

  // Weekly 2 · Paso 1: revisar compromisos anteriores
  await page.goto('/weekly');
  await page.getByTestId('start-weekly').click();
  await expect(page.getByTestId('review-card')).toHaveCount(3);
  // Cumplir (con bloqueo → se resuelve)
  const r1 = page.getByTestId('review-card').filter({ hasText: 'Validar presupuesto de pauta' });
  await r1.getByRole('button', { name: 'Cumplido', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Sí, resolver bloqueo' }).click();
  await expect(r1).toContainText('Cumplido');
  // Reprogramar
  const r2 = page.getByTestId('review-card').filter({ hasText: 'Aprobar copy fase Conversación' });
  await r2.getByRole('button', { name: 'Reprogramar' }).click();
  await dialog(page).getByRole('button', { name: 'Reprogramar' }).click();
  await expect(dialog(page)).toContainText('Indica el motivo');
  await dialog(page).getByLabel('Nueva fecha').fill(isoDate(9));
  await dialog(page).getByLabel('Nueva hora').fill('10:00');
  await dialog(page).getByLabel('Motivo').fill('Se espera validación legal');
  await dialog(page).getByRole('button', { name: 'Reprogramar' }).click();
  await expect(r2).toContainText('×1 reprogramaciones');
  // Escalar
  const r3 = page.getByTestId('review-card').filter({ hasText: 'Pedir agenda final' });
  await r3.getByRole('button', { name: 'Escalar' }).click();
  await dialog(page).getByLabel('¿A quién se escala?').fill('Dirección General');
  await dialog(page).getByRole('button', { name: 'Escalar' }).click();
  await expect(r3).toContainText('Escalado');

  // Cerrar Weekly 2
  await page.locator('.step-pill', { hasText: 'Cerrar' }).click();
  await expect(page.getByTestId('step-count')).toHaveText('PASO 7 DE 7');
  await page.getByTestId('close-weekly').click();
  await dialog(page).getByRole('button', { name: /Cerrar/ }).last().click();
  await expect(page.getByRole('dialog', { name: 'Resumen de la semana' })).toBeVisible();
  await expect(page.getByTestId('summary-text')).toContainText('ESCALAMIENTOS (2)');
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();

  // Semana 1 NO cambió
  await page.goto(w1Url);
  await page.getByRole('tab', { name: 'Compromisos' }).click();
  expect(await page.getByTestId('commitment-row').allInnerTexts()).toEqual(w1CommitmentsBefore);
  await page.getByRole('tab', { name: 'Proyectos' }).click();
  await expect(page.getByTestId('history-project-row')).toHaveCount(5);
  await expect(page.getByTestId('history-project-row').filter({ hasText: 'Buen Fin' })).toHaveCount(0);

  // Evolución del proyecto sin duplicarlo
  await page.goto('/proyectos?estado=todos');
  await expect(page.getByTestId('project-row').filter({ hasText: 'KV Convención' })).toHaveCount(1);
  await page.getByRole('link', { name: 'KV Convención' }).click();
  await expect(page.getByTestId('evolution')).toContainText(`Semana ${W1}`);
  await expect(page.getByTestId('evolution')).toContainText(`Semana ${W1 + 1}`);

  // Persistencia tras recargar
  await page.reload();
  await expect(page.getByRole('heading', { name: 'KV Convención' })).toBeVisible();
  await expect(page.getByTestId('week-label')).toHaveText(`SEMANA ${W1 + 1}`);

  // Importación inválida: no destruye información
  const badPath = testInfo.outputPath('malo.json');
  writeFileSync(badPath, JSON.stringify({ ...backup, data: { ...backup.data, projects: [{ ...backup.data.projects[0], impacto: 9 }] } }));
  await page.goto('/configuracion');
  await page.getByRole('button', { name: 'Importar JSON' }).click();
  await page.getByTestId('file-input').setInputFiles(badPath);
  await expect(page.getByTestId('import-errors')).toContainText('fuera de rango');
  await dialog(page).getByRole('button', { name: 'Entendido' }).click();
  await expect(page.getByTestId('week-label')).toHaveText(`SEMANA ${W1 + 1}`);

  // Restaurar respaldo (estado al cierre de la semana 1)
  await page.getByRole('button', { name: 'Restaurar respaldo' }).click();
  await page.getByTestId('file-input').setInputFiles(backupPath);
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('week-label')).toHaveText(`SEMANA ${W1}`);
  await page.reload();
  await expect(page.getByTestId('week-label')).toHaveText(`SEMANA ${W1}`);
  await page.goto('/proyectos');
  await expect(page.getByTestId('project-row')).toHaveCount(5);

  expect(errors).toEqual([]);
});
