// Pruebas funcionales y financieras del Dashboard Ejecutivo abierto como archivo local (file://).
// Uso: node pruebas/probar.mjs <dashboard.html> <excel_contable_prueba.xlsx> <carpeta_capturas>
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [html, excelPrueba, shots] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const url = `file://${resolve(html)}`;
const resultados = [];
const ok = (nombre, cond, detalle = '') => {
  resultados.push({ nombre, ok: !!cond, detalle });
  console.log(`${cond ? '✓' : '✕'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};
const moneyNum = (s) => Number(String(s).replace(/[^0-9.-]/g, ''));
const parseCsv = (t) => t.replace(/^﻿/, '').trim().split(/\r\n/).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'es-MX' });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
const tab = (t) => page.click(`nav.tabs button:has-text("${t}")`);
const descargar = async (fn) => { const [d] = await Promise.all([page.waitForEvent('download'), fn()]); return { nombre: d.suggestedFilename(), texto: readFileSync(await d.path(), 'utf8') }; };
const subir = async (boton, ruta, espera = '#dlg[open]') => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), boton()]); await fc.setFiles(ruta); if (espera) await page.waitForSelector(espera); };

await page.goto(url);
await page.waitForSelector('[data-testid="gasto-real"]');

// ── 1. Resumen y cuadres
ok('Abre con doble clic (file://) sin errores', errores.length === 0, errores.join(' | '));
ok('Indicador de corte contable visible', (await page.textContent('[data-testid="corte"]')).includes('AGOSTO 2026'));
const gasto = await page.textContent('[data-testid="gasto-real"] .val');
ok('Gasto real = fuente oficial', moneyNum(gasto) === 10344874.57, gasto);
ok('Porcentaje de ejecución ≈ 60.9%', (await page.textContent('[data-testid="ejecucion"] .val')).includes('60.9'));
ok('Todas las validaciones de cuadre pasan', /11\/11/.test(await page.textContent('[data-testid="validaciones"]')), await page.textContent('[data-testid="validaciones"]'));
const alertas = await page.textContent('[data-testid="alertas"]');
ok('Alertas: sobreejercicio de Redes Sociales', alertas.includes('Redes Sociales y Campañas: sobreejercicio de $388,668'));
ok('Alertas: SOC Store requiere conciliación (no sobreejercicio)', alertas.includes('SOC Store: requiere conciliación') && !alertas.includes('SOC Store: sobreejercicio'));
await page.screenshot({ path: `${shots}/1-resumen.png`, fullPage: true });

// ── 2. Presupuesto y ejecución
await tab('Presupuesto y ejecución');
const filas = page.locator('table[data-table="partidas"] tbody tr:not(.total)');
ok('20 partidas en la tabla', (await filas.count()) === 20);
const fila = (n) => page.locator('table[data-table="partidas"] tbody tr', { hasText: n }).first();
ok('Branding de la Red ajustado $1,509,015.61', (await fila('Branding de la Red').textContent()).includes('$1,509,015.61'));
ok('Herramientas ajustado $124,777.14', (await fila('Herramientas').textContent()).includes('$124,777.14'));
ok('Redes Sociales: desviación -$388,667.75', (await fila('Redes Sociales').textContent()).includes('-$388,667.75'));
ok('Branding de la Red marcado pendiente (reclasificación)', (await fila('Branding de la Red').getAttribute('data-estado')) === 'PENDIENTE');
const csvP = await descargar(() => page.click('[data-act="csv-partidas"]'));
const rows = parseCsv(csvP.texto);
const partRows = rows.filter((r) => /^\d\d$/.test(r[0]));
ok('CSV: 20 partidas suman $16,960,000', partRows.length === 20 && partRows.reduce((s, r) => s + Number(r[4]), 0) === 16960000);
const totalRow = rows.find((r) => r[1] === 'TOTAL');
ok('CSV: total autorizado $17,000,000 y gasto ajustado = contable', Number(totalRow[4]) === 17000000 && Math.abs(Number(totalRow[5]) - Number(totalRow[7])) < 0.01, `${totalRow[5]} / ${totalRow[7]}`);
await page.selectOption('[data-act="sem-filtro"]', 'sobre');
const sobre = await filas.allTextContents();
ok('Filtro semáforo «Sobreejercicio»', sobre.length === 2 && sobre.some((t) => t.includes('Redes')) && sobre.some((t) => t.includes('Capacitación')), `${sobre.length} filas`);
await page.selectOption('[data-act="sem-filtro"]', '');
await page.fill('#q', 'aula');
await page.waitForTimeout(300);
ok('Búsqueda en tablas', (await filas.count()) === 1);
await page.fill('#q', '');
await page.waitForTimeout(300);
await page.click('th[data-sort="partidas:pct"]');
await page.click('th[data-sort="partidas:pct"]');
ok('Ordenamiento por % de ejecución (desc.)', (await filas.first().textContent()).includes('SOC Store'), (await filas.first().textContent()).slice(0, 40));
await fila('AULA SOC').click();
ok('Detalle mensual de partida', (await page.textContent('#dlg')).includes('Gasto contable mensual'));
await page.screenshot({ path: `${shots}/2b-detalle-partida.png` });
await page.keyboard.press('Escape');
await page.screenshot({ path: `${shots}/2-presupuesto.png`, fullPage: true });

// ── 3. Planeación de cierre: captura, validación, edición, persistencia
await tab('Planeación de cierre');
await page.click('[data-act="nuevo"][data-col="compromisos"]');
await page.click('[data-act="guardar-form"]');
ok('Validación: campos obligatorios', (await page.textContent('#dlg')).includes('Campo obligatorio'));
await page.selectOption('#frm [name="partida"]', '04');
await page.selectOption('#frm [name="mes"]', '2026-10');
await page.fill('#frm [name="concepto"]', 'Pauta campaña cierre de año (prueba)');
await page.selectOption('#frm [name="tipo"]', 'Comprometido');
await page.fill('#frm [name="monto"]', '0');
await page.click('[data-act="guardar-form"]');
ok('Validación: monto mayor a cero', (await page.textContent('#dlg')).includes('monto mayor a cero'));
await page.fill('#frm [name="monto"]', '120000');
await page.click('[data-act="guardar-form"]');
ok('Captura de compromiso', (await page.locator('table[data-table="compromisos"] tbody tr').count()) === 1);
await page.click('[data-act="editar"][data-col="compromisos"]');
await page.fill('#frm [name="monto"]', '130000');
await page.click('[data-act="guardar-form"]');
ok('Edición de compromiso', (await page.textContent('table[data-table="compromisos"]')).includes('$130,000'));
const saldoRedes = await page.locator('table[data-table="saldos"] tbody tr', { hasText: 'Redes' }).textContent();
ok('Saldo proyectado = disponible − compromisos', saldoRedes.includes('-$518,668'), saldoRedes.replace(/\s+/g, ' ').slice(0, 120));
await page.reload();
await page.waitForSelector('main .mod-head');
ok('Persistencia local tras recargar', (await page.locator('table[data-table="compromisos"] tbody tr').count()) === 1 && (await page.textContent('table[data-table="compromisos"]')).includes('$130,000'));
await page.screenshot({ path: `${shots}/3-cierre.png`, fullPage: true });
const csvC = await descargar(() => page.click('[data-act="csv"][data-col="compromisos"]'));
ok('Exportación CSV de compromisos', parseCsv(csvC.texto).length === 2 && csvC.texto.includes('130000'));

// ── 4. Resultados y KPI, filtro por estado y cambio de estado
await tab('Resultados y KPI');
const fran = await page.textContent('[data-testid="K-FRAN"]');
ok('Franquicias: costo por lead $353.55', fran.includes('$353.55'));
ok('Franquicias: costo por cierre $70,280.08', fran.includes('$70,280.08'));
ok('Franquicias: conversiones 53.6% / 7.2% / 13.1%', fran.includes('53.6%') && fran.includes('7.2%') && fran.includes('13.1%'));
ok('SOC Leads+: 41.3% sin gestionar', (await page.textContent('[data-testid="K-SOCL"]')).includes('41.3%'));
ok('Branding: 66.7% / 13.3% / 6.7% por línea', ['66.7%', '13.3%', '6.7%'].every((p) => (async () => true)()) && (await page.textContent('[data-testid="K-BRAND"]')).match(/66\.7%[\s\S]*13\.3%[\s\S]*6\.7%/) !== null);
ok('Cada indicador muestra su periodo', (await page.locator('.periodo').count()) === 7);
await page.screenshot({ path: `${shots}/4-kpi.png`, fullPage: true });
await page.click('#filtro-estado button:has-text("Pendiente")');
const visibles = await page.locator('[data-testid^="K-"]:visible').count();
ok('Filtro por estado «Pendiente» (3 indicadores sin archivo fuente)', visibles === 3, `${visibles} visibles`);
await page.click('#filtro-estado button:has-text("Todos")');
await page.click('[data-testid="K-SOCTV"] [data-act="estado"]');
await page.selectOption('#nuevo-estado', 'CONFIRMADO');
await page.click('[data-act="confirmar-estado"]');
ok('Cambio de estado exige motivo', (await page.textContent('#err-estado')).includes('motivo'));
await page.fill('#motivo-estado', 'Prueba: confirmado con reporte de YouTube');
await page.click('[data-act="confirmar-estado"]');
ok('Cambio de estado aplicado', (await page.getAttribute('[data-testid="K-SOCTV"]', 'data-estado')) === 'CONFIRMADO');

// ── 5. Gestión por gerencia: importación CSV
await tab('Gestión por gerencia');
ok('Totales por gerencia cuadran (103 / 56 / 38)', (await page.textContent('main')).includes('La suma por gerencia cuadra'));
const csvG = '\ufeff"Gerencia (MD, CON, DIS, STORE)",Responsable,Proyecto,Actividad,Prioridad,Prioridad confirmada (Sí/No),Estado,Fecha compromiso (AAAA-MM-DD),Bloqueo,Dependencia,Próxima acción,Validación\r\nCON,Responsable prueba,SOC TV temporada 2,Grabación,P1,No,En curso,2026-11-10,,Diseño,Calendario,Pendiente\r\nXYZ,,Sin gerencia válida,,,,,,,,,\r\n';
writeFileSync(`${shots}/gestion_prueba.csv`, csvG);
await subir(() => page.click('[data-act="importar-csv"][data-col="gestion"]'), `${shots}/gestion_prueba.csv`);
const dlgTxt = await page.textContent('#dlg');
ok('Importación CSV con validación de filas', dlgTxt.includes('1') && dlgTxt.includes('con errores') && dlgTxt.includes('Fila 3'));
await page.click('[data-act="confirmar-importar"]');
ok('Registro importado y marcado como P1 propuesta', (await page.textContent('table[data-table="gestion"]')).includes('(propuesta)'));
await page.screenshot({ path: `${shots}/5-gerencias.png`, fullPage: true });

// ── 6. Decisiones
await tab('Decisiones de Dirección');
ok('Sin decisiones automáticas', (await page.locator('table[data-table="decisiones"] tbody tr td.empty').count()) === 1);
await page.click('[data-act="tema-decision"][data-i="0"]');
await page.fill('#frm [name="responsable"]', 'Dirección');
await page.fill('#frm [name="fechaLimite"]', '2026-10-01');
await page.click('[data-act="guardar-form"]');
const dec = await page.textContent('table[data-table="decisiones"]');
ok('Registro de decisión desde un tema (manual) y marca de vencida', dec.includes('Definir acción') && dec.includes('Vencida'));
await page.screenshot({ path: `${shots}/7-decisiones.png`, fullPage: true });

// ── 7. Conciliación
await tab('Conciliación y trazabilidad');
const conc = await page.textContent('main');
ok('Bitácora registra capturas, ediciones y cambios de estado', ['Capturar compromiso', 'Editar compromiso', 'Cambio de estado', 'Importar CSV'].every((t) => conc.includes(t)));
ok('Movimientos: neto de transferencias $0', conc.includes('transferencias netas: $0'));
await page.screenshot({ path: `${shots}/6-conciliacion.png`, fullPage: true });

// ── 8. Respaldo y restauración
const resp = await descargar(() => page.click('[data-act="respaldar"]'));
writeFileSync(`${shots}/respaldo_prueba.json`, resp.texto);
await page.evaluate(() => localStorage.clear());
await page.reload();
await tab('Planeación de cierre');
ok('Sin datos tras borrar el navegador', (await page.locator('table[data-table="compromisos"] td.empty').count()) === 1);
await subir(() => page.click('[data-act="restaurar"]'), `${shots}/respaldo_prueba.json`);
await page.click('[data-act="confirmar-restaurar"]');
await page.waitForSelector('#dlg:not([open])', { state: 'attached' });
ok('Restauración del respaldo', (await page.textContent('table[data-table="compromisos"]')).includes('$130,000'));
await subir(() => page.click('[data-act="restaurar"]'), `${shots}/gestion_prueba.csv`, '#toast:visible');
ok('Rechaza archivos que no son respaldo', (await page.textContent('#toast')).includes('respaldo válido'));

// ── 9. Actualización contable mensual (Excel de prueba con septiembre)
await subir(() => page.click('[data-act="importar-contable"]'), excelPrueba);
const prev = await page.textContent('#dlg');
ok('Lee el Excel y detecta el nuevo corte', prev.includes('corte detectado: Septiembre 2026') && prev.includes('cuadran'), prev.replace(/\s+/g, ' ').slice(0, 300));
await page.click('[data-act="confirmar-contable"]');
await page.waitForSelector('#dlg:not([open])', { state: 'attached' });
ok('Corte oficial actualizado a septiembre', (await page.textContent('[data-testid="corte"]')).includes('SEPTIEMBRE 2026'));
await tab('Conciliación y trazabilidad');
const checks = await page.textContent('[data-testid="checks"]');
ok('Detecta gasto sin partida tras la actualización', checks.includes('Nueva categoría prueba'));
await tab('Resumen ejecutivo');
ok('Gasto real actualizado', moneyNum(await page.textContent('[data-testid="gasto-real"] .val')) === 10707220.24);

// ── 10. Diseño adaptable
for (const [w, h] of [[1024, 768], [820, 1180]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const t of ['Resumen ejecutivo', 'Presupuesto y ejecución', 'Resultados y KPI']) {
    await tab(t);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`Sin desborde horizontal ${w}px · ${t}`, desborde <= 1, `${desborde}px`);
  }
}
await page.setViewportSize({ width: 1024, height: 768 });
await tab('Resumen ejecutivo');
await page.screenshot({ path: `${shots}/tablet-resumen.png`, fullPage: true });

ok('Sin errores de JavaScript en toda la sesión', errores.length === 0, errores.join(' | '));
await browser.close();
writeFileSync(`${shots}/resultados.json`, JSON.stringify(resultados, null, 1));
const fallas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallas.length}/${resultados.length} pruebas correctas`);
process.exit(fallas.length ? 1 : 0);
