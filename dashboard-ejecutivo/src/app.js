'use strict';
/* Dashboard Ejecutivo · Marketing y Posicionamiento SOC 2026
 * Un solo archivo, sin servidor ni servicios externos. Los datos de origen
 * (FUENTES, CONFIG) vienen incrustados; lo capturado se guarda en este navegador
 * (localStorage) y se respalda/restaura con un archivo JSON.
 *
 * Regla de Dirección: los módulos NO se vinculan entre sí. Los cálculos financieros
 * sólo leen el presupuesto y el reporte contable; los KPI, la gestión por gerencia y
 * las decisiones no alimentan ni reciben cifras de otros módulos.
 */

/* ───────────── Utilidades ───────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ESTADOS = ['CONFIRMADO', 'PENDIENTE', 'PROPUESTA'];
const ESTADO_TXT = { CONFIRMADO: 'Confirmado', PENDIENTE: 'Pendiente de validación', PROPUESTA: 'Propuesta' };
const ESTADO_ICO = { CONFIRMADO: '✓', PENDIENTE: '!', PROPUESTA: '◇' };
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmt0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const money = (n, dec = false) => (n === null || n === undefined || Number.isNaN(n) ? '—' : (dec ? fmt2 : fmt0).format(n));
const num = (n) => (n === null || n === undefined ? '—' : fmtN.format(n));
const pct = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(d)}%`);
const r2 = (n) => Math.round(n * 100) / 100 || 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const mesLabel = (ym) => { const [y, m] = String(ym).split('-').map(Number); return m ? `${MESES[m - 1]} ${y}` : String(ym); };
const ymAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const hoy = () => new Date().toISOString().slice(0, 10);
const ahora = () => new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

function badge(estado, id) {
  const e = ESTADOS.includes(estado) ? estado : 'PENDIENTE';
  const inner = `<span class="badge st-${e}" title="${ESTADO_TXT[e]}"><span aria-hidden="true">${ESTADO_ICO[e]}</span>${ESTADO_TXT[e]}</span>`;
  return id ? `<button class="st-btn" data-act="estado" data-id="${esc(id)}" title="Cambiar estado de validación">${inner}</button>` : inner;
}

/* ───────────── Estado persistente ───────────── */
const KEY = 'soc-mkt-dashboard-2026';
const nuevoEstado = () => ({ version: 1, tab: 'resumen', filtro: 'TODOS', compromisos: [], gestion: [], decisiones: [], estados: {}, observaciones: {}, contable: null, mapeo: {}, bitacora: [], soloConfirmados: false, guardado: null });
let storageOk = true;
let state = nuevoEstado();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...nuevoEstado(), ...JSON.parse(raw) };
} catch (e) {
  storageOk = false;
}
function save() {
  state.guardado = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
  }
  saveIndicator();
}
function saveIndicator() {
  const el = $('#save-state');
  if (!storageOk) {
    el.className = 'save-state bad';
    el.textContent = '⚠ Este navegador no permite guardar: descarga un respaldo antes de cerrar';
  } else {
    el.className = 'save-state';
    el.textContent = state.guardado ? `Guardado en este navegador · ${new Date(state.guardado).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}` : 'Sin cambios capturados';
  }
}
function log(accion, detalle) {
  state.bitacora.unshift({ id: uid('log'), fecha: new Date().toISOString(), accion, detalle });
  state.bitacora = state.bitacora.slice(0, 500);
}
const estadoDe = (id, def) => state.estados[id] || def;

/* ───────────── Cálculos financieros (sólo presupuesto + contable) ───────────── */
function contable() {
  return state.contable || FUENTES.contable;
}
function partidaDeCategoria(nombre) {
  const n = norm(nombre);
  if (state.mapeo && state.mapeo[n] !== undefined) return state.mapeo[n] || null;
  const p = CONFIG.partidas.find((x) => x.categorias.some((c) => norm(c) === n));
  return p ? p.id : null;
}
function fin() {
  const c = contable();
  const P = CONFIG.partidas;
  const nMeses = c.meses.length;
  const movs = CONFIG.movimientos;
  const rows = P.map((p) => {
    const movimientos = movs.filter((m) => m.partida === p.id).reduce((s, m) => s + m.monto, 0);
    const cats = c.categorias.filter((x) => partidaDeCategoria(x.nombre) === p.id);
    const gastoContable = r2(cats.reduce((s, x) => s + x.total, 0));
    const mensual = c.meses.map((_, i) => r2(cats.reduce((s, x) => s + (x.mensual[i] || 0), 0)));
    return { id: p.id, nombre: p.nombre, autorizado: p.autorizado, original: p.autorizado - movimientos, movimientos, categorias: cats.map((x) => x.nombre), gastoContable, ajuste: 0, mensual, revolvente: !!p.revolvente, reclas: [] };
  });
  const sinPartida = c.categorias.filter((x) => !partidaDeCategoria(x.nombre)).map((x) => ({ nombre: x.nombre, total: x.total, mensual: x.mensual, ajuste: 0 }));
  const reclas = CONFIG.reclasificaciones.map((r) => {
    let monto = r.monto;
    if (r.deTipo === 'categoria') {
      const cat = c.categorias.find((x) => norm(x.nombre) === norm(r.de));
      monto = cat ? cat.total : 0;
    }
    const destino = rows.find((x) => x.id === r.a);
    let origenNombre;
    if (r.deTipo === 'partida') {
      const o = rows.find((x) => x.id === r.de);
      o.ajuste -= monto;
      o.reclas.push(r.id);
      origenNombre = `${o.id} ${o.nombre}`;
    } else {
      const s = sinPartida.find((x) => norm(x.nombre) === norm(r.de));
      const enPartida = rows.find((x) => x.categorias.some((n) => norm(n) === norm(r.de)));
      if (s) s.ajuste -= monto;
      else if (enPartida) { enPartida.ajuste -= monto; enPartida.reclas.push(r.id); }
      origenNombre = `Categoría contable «${r.de.trim()}»`;
    }
    destino.ajuste += monto;
    destino.reclas.push(r.id);
    return { ...r, monto: r2(monto), origenNombre, destinoNombre: `${destino.id} ${destino.nombre}`, estado: estadoDe(r.id, r.estado), validacionContable: state.observaciones[`${r.id}-vc`] || r.validacionContable };
  });
  for (const x of rows) {
    x.ajuste = r2(x.ajuste);
    x.gastoAjustado = r2(x.gastoContable + x.ajuste);
    x.disponible = r2(x.autorizado - x.gastoAjustado);
    x.pct = x.autorizado ? x.gastoAjustado / x.autorizado : 0;
    x.sem = semaforo(x);
    x.estado = x.ajuste !== 0 ? 'PENDIENTE' : 'CONFIRMADO';
  }
  for (const s of sinPartida) s.ajuste = r2(s.ajuste);
  const tot = {
    autorizado: P.reduce((s, p) => s + p.autorizado, 0),
    original: rows.reduce((s, x) => s + x.original, 0),
    gastoContable: r2(c.categorias.reduce((s, x) => s + x.total, 0)),
    gastoAjustado: r2(rows.reduce((s, x) => s + x.gastoAjustado, 0) + sinPartida.reduce((s, x) => s + x.total + x.ajuste, 0)),
    ajuste: r2(rows.reduce((s, x) => s + x.ajuste, 0) + sinPartida.reduce((s, x) => s + x.ajuste, 0)),
  };
  tot.disponible = r2(tot.autorizado - tot.gastoAjustado);
  const mensual = c.meses.map((_, i) => r2(c.categorias.reduce((s, x) => s + (x.mensual[i] || 0), 0)));
  return { c, rows, sinPartida, reclas, tot, mensual, nMeses, corte: c.corte };
}
function semaforo(x) {
  if (x.revolvente) return { k: 'conciliar', t: 'Conciliar (revolvente)', i: '↺' };
  if (x.pct > 1) return { k: 'sobre', t: 'Sobreejercicio', i: '▲' };
  if (x.pct >= 0.9) return { k: 'riesgo', t: 'Riesgo (≥ 90%)', i: '!' };
  if (x.gastoAjustado === 0) return { k: 'sin', t: 'Sin ejercer', i: '○' };
  return { k: 'ok', t: 'En rango', i: '✓' };
}
const semChip = (s) => `<span class="chip sem-${s.k}"><span aria-hidden="true">${s.i}</span>${s.t}</span>`;

/* Compromisos sep–dic: sólo se comparan con el disponible de su partida (mismo módulo financiero). */
function mesesPlaneacion(F) {
  const out = [];
  let m = ymAdd(F.corte, 1);
  while (m <= `${CONFIG.anio}-12`) { out.push(m); m = ymAdd(m, 1); }
  return out;
}
function cierre(F) {
  const meses = mesesPlaneacion(F);
  const lista = state.compromisos.filter((x) => meses.includes(x.mes) && (!state.soloConfirmados || x.estado === 'CONFIRMADO'));
  const porPartida = F.rows.map((r) => {
    const items = lista.filter((x) => x.partida === r.id);
    const comprometido = r2(items.filter((x) => x.tipo === 'Comprometido').reduce((s, x) => s + Number(x.monto), 0));
    const planeado = r2(items.filter((x) => x.tipo !== 'Comprometido').reduce((s, x) => s + Number(x.monto), 0));
    const saldo = r2(r.disponible - comprometido - planeado);
    return { ...r, comprometido, planeado, saldoProyectado: saldo, n: items.length };
  });
  const porMes = meses.map((m) => r2(lista.filter((x) => x.mes === m).reduce((s, x) => s + Number(x.monto), 0)));
  const total = r2(lista.reduce((s, x) => s + Number(x.monto), 0));
  return { meses, porPartida, porMes, total, saldo: r2(F.tot.disponible - total) };
}

/* ───────────── Validaciones (control de calidad) ───────────── */
function validaciones(F) {
  const P = CONFIG.presupuesto;
  const suma20 = CONFIG.partidas.reduce((s, p) => s + p.autorizado, 0);
  const ampl = CONFIG.movimientos.filter((m) => m.tipo === 'Ampliación').reduce((s, m) => s + m.monto, 0);
  const transf = CONFIG.movimientos.filter((m) => m.tipo === 'Transferencia').reduce((s, m) => s + m.monto, 0);
  const reservaMov = CONFIG.movimientos.filter((m) => m.partida === 'RESERVA').reduce((s, m) => s + m.monto, 0);
  const c = F.c;
  const sumaCat = r2(c.categorias.reduce((s, x) => s + x.total, 0));
  const mens = c.categorias.every((x) => Math.abs(x.mensual.reduce((s, v) => s + v, 0) - x.total) < 0.01);
  const reclasNet = r2(F.rows.reduce((s, x) => s + x.ajuste, 0) + F.sinPartida.reduce((s, x) => s + x.ajuste, 0));
  const det = c === FUENTES.contable ? FUENTES.contable.detalle : null;
  const v = [
    { t: `Las 20 partidas suman ${money(P.distribuido)}`, ok: suma20 === P.distribuido, d: money(suma20) },
    { t: `Partidas + reserva = presupuesto total ${money(P.total)}`, ok: suma20 + P.reserva === P.total, d: `${money(suma20)} + ${money(P.reserva)} = ${money(suma20 + P.reserva)}` },
    { t: `Presupuesto original + ampliación = total (${money(P.original)} + ${money(P.ampliacion)})`, ok: P.original + ampl === P.total && ampl === P.ampliacion && F.tot.original === P.original, d: `Original por partida ${money(F.tot.original)} · ampliación ${money(ampl)}` },
    { t: 'Las transferencias internas no modifican el total', ok: transf === 0, d: `Neto ${money(transf)}` },
    { t: 'La reserva no está asignada a ninguna partida', ok: reservaMov === P.reserva && !CONFIG.partidas.some((p) => p.id === 'RESERVA'), d: money(P.reserva) },
    { t: 'Categorías contables = total del reporte (cuadre)', ok: Math.abs(sumaCat - c.total) < 0.01 && mens, d: `${money(sumaCat, true)} vs ${money(c.total, true)}` },
    det ? { t: `Hoja RESUMEN = detalle de movimientos (${num(det.registros)} registros)`, ok: Math.abs(det.total - c.total) < 0.01, d: money(det.total, true) } : { t: 'Detalle de movimientos', na: true, d: 'Sólo se verifica con el archivo de origen' },
    { t: 'Las reclasificaciones no alteran el gasto total', ok: reclasNet === 0 && Math.abs(F.tot.gastoAjustado - F.tot.gastoContable) < 0.01, d: `Neto ${money(reclasNet, true)}` },
    { t: 'Todo el gasto contable está asignado a una partida (tras reclasificar)', ok: F.sinPartida.every((s) => Math.abs(s.total + s.ajuste) < 0.01), d: F.sinPartida.filter((s) => Math.abs(s.total + s.ajuste) >= 0.01).map((s) => s.nombre).join(', ') || 'Sin pendientes' },
    { t: 'Un solo corte contable en las cifras financieras', ok: true, d: mesLabel(F.corte) },
    { t: 'Las cifras comerciales no se suman al gasto contable', ok: true, d: 'Verificado por diseño: el cálculo financiero sólo lee presupuesto y contabilidad' },
  ];
  return v;
}

/* ───────────── Diferencias detectadas (auditoría) ───────────── */
function diferencias(F) {
  const c = F.c;
  const row = (id) => F.rows.find((x) => x.id === id);
  const ptto = FUENTES.contable.pttoExcelAgosto;
  const sinGasto = F.rows.filter((x) => x.gastoAjustado === 0);
  const sobre = F.rows.filter((x) => x.sem.k === 'sobre');
  const store = FUENTES.store;
  const ventasAbrAgo = store.porMes.filter((m) => ['Abr', 'May', 'Jun', 'Jul', 'Ago'].includes(m.mes)).reduce((s, m) => s + m.facturacion, 0);
  const d = [
    { id: 'D01', tema: 'Presupuesto', titulo: 'La columna PTTO del Excel contable no es el presupuesto autorizado', detalle: `La hoja «vs 2025» compara contra ${money(ptto.total, true)} (prorrateo 8/12 de una distribución anterior: anualizado ≈ ${money(ptto.total * 1.5)}). No incluye la ampliación de ${money(640000)} ni las transferencias. El dashboard usa el presupuesto autorizado de ${money(CONFIG.presupuesto.total)}.`, estado: 'CONFIRMADO' },
    { id: 'D02', tema: 'Presupuesto', titulo: 'Subtotales duplicados en la hoja «vs 2025»', detalle: 'Filas de grupo (Comunicación con cliente final, Inmobiliarias y desarrollos, Medios masivos, Internet, Apoyo directo a la red, Atracción de talento, Otros) repiten montos de otras filas. No se suman: el dashboard usa la hoja RESUMEN.', estado: 'CONFIRMADO' },
    { id: 'D03', tema: 'Gasto', titulo: 'Content Marketing registrado sin partida autorizada', detalle: `${money(F.sinPartida.find((s) => norm(s.nombre) === 'content marketing')?.total ?? 0, true)} en «Content Marketing». Se asigna a Branding de la Red por la reclasificación R2 (análisis directivo, pendiente de formalizar).`, estado: 'PENDIENTE' },
    { id: 'D04', tema: 'Gasto', titulo: 'Herramientas ajustado: diferencia de redondeo', detalle: `Gasto ajustado ${money(row('19').gastoAjustado, true)} frente a ${money(124777)} indicado. Diferencia de ${money(r2(row('19').gastoAjustado - 124777), true)} por redondeo; se conserva la cifra contable exacta.`, estado: 'CONFIRMADO' },
    { id: 'D05', tema: 'Gasto', titulo: 'Porcentaje de ejecución', detalle: `${pct(F.tot.gastoContable / CONFIG.presupuesto.total, 2)} sobre el total de ${money(CONFIG.presupuesto.total)} (≈ 60.9% indicado) y ${pct(F.tot.gastoContable / CONFIG.presupuesto.distribuido, 2)} sobre lo distribuido.`, estado: 'CONFIRMADO' },
    ...sobre.map((x) => ({ id: `D-SOBRE-${x.id}`, tema: 'Desviación', titulo: `${x.nombre}: sobreejercicio de ${money(-x.disponible, true)}`, detalle: `Gasto ${x.ajuste ? 'ajustado' : 'contable'} ${money(x.gastoAjustado, true)} contra ${money(x.autorizado)} autorizados (${pct(x.pct)}).${x.id === '20' ? ' Esta partida no estaba en los datos identificados; la cifra es verificable en el Excel contable.' : ''}`, estado: 'CONFIRMADO' })),
    { id: 'D06', tema: 'Gasto', titulo: `${sinGasto.length} partidas sin gasto contable al corte`, detalle: `${sinGasto.map((x) => x.nombre).join(', ')}: ${money(sinGasto.reduce((s, x) => s + x.autorizado, 0))} autorizados sin categoría con gasto en el reporte. Confirmar con Contabilidad que no haya gastos registrados en otras categorías.`, estado: 'PENDIENTE' },
    { id: 'D07', tema: 'SOC Store', titulo: 'SOC Store: gasto contable mayor al capital inicial', detalle: `Gasto ${money(row('16').gastoContable, true)} vs capital inicial ${money(200000)}. Opera como capital revolvente: no se trata como sobreejercicio hasta conciliar capital, ventas, cobranza, inventario, costo, reinversión y saldo.`, estado: 'PENDIENTE' },
    { id: 'D08', tema: 'SOC Store', titulo: 'Ingreso de tienda contable ≠ facturación del reporte comercial', detalle: `Contabilidad registra ${money(FUENTES.contable.ingresoTienda.total, true)} de «Ingreso Tienda» (ene–ago); el reporte comercial muestra ${money(ventasAbrAgo)} facturados abr–ago. Las bases y periodos son distintos (reporte comercial al 16-oct-2026): requiere conciliación.`, estado: 'PENDIENTE' },
    { id: 'D09', tema: 'Resultados', titulo: 'Inversión de Atracción de Franquicias sin correspondencia presupuestal', detalle: `${money(FUENTES.franquicias.total.inversion, true)} (ene–sep) del reporte de la iniciativa. No se identifica en una partida contable y no se suma al gasto.`, estado: 'PENDIENTE' },
    { id: 'D10', tema: 'Resultados', titulo: 'Franquicias: 2 SQL sin red asignada', detalle: 'El archivo fuente registra 39 SQL en T3; la suma por red da 37. El reporte usa 37 (107 en el año).', estado: 'PENDIENTE' },
    { id: 'D11', tema: 'Resultados', titulo: `SOC Leads+: ${(FUENTES.socleads.leads - (FUENTES.socleads.registrosPorAnio['2026'] || 0))} registros creados antes de 2026`, detalle: `De ${FUENTES.socleads.leads} leads, ${FUENTES.socleads.registrosPorAnio['2026'] || 0} se crearon en 2026. El informe incluye todos los negocios de la exportación.`, estado: 'PENDIENTE' },
    { id: 'D12', tema: 'Resultados', titulo: 'Precalificador: el histórico incluye 2025', detalle: `${num(FUENTES.precalificador.historico)} registros = ${num(FUENTES.precalificador.total2025)} de 2025 + ${num(FUENTES.precalificador.total2026)} de 2026 (octubre parcial al 15-oct). ${num(FUENTES.precalificador.sinZona)} sin zona (${num(FUENTES.precalificador.sinZona2026)} de 2026).`, estado: 'CONFIRMADO' },
    { id: 'D13', tema: 'Gerencias', titulo: 'Inventarios Alignment & Unblock incompletos', detalle: 'Sólo se recibió el inventario de Contenido. Los conteos por gerencia son los reportados a Dirección (fotografía operativa).', estado: 'PENDIENTE' },
  ];
  if (c !== FUENTES.contable) d.unshift({ id: 'D00', tema: 'Gasto', titulo: 'Reporte contable actualizado desde Excel', detalle: `Se usa «${c.fuente}» (corte ${mesLabel(c.corte)}), cargado el ${new Date(c.importadoEl).toLocaleDateString('es-MX')}.`, estado: 'CONFIRMADO' });
  return d.map((x) => ({ ...x, estado: estadoDe(x.id, x.estado), observacion: state.observaciones[x.id] || '' }));
}

/* ───────────── Gráficas (SVG sin librerías) ───────────── */
/* Escala "redonda" para los ejes: 0, paso, 2·paso… con paso 1/2/2.5/5 × 10^n. */
function escala(maxVal, n = 4) {
  const raw = Math.max(1, maxVal) / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= raw);
  return { max: paso * n, paso, n };
}
const ejeMoney = (v, max) => (max >= 1e6 ? `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M` : max >= 1e3 ? `$${fmtN.format(v / 1e3)}K` : `$${fmtN.format(v)}`);
function colChart({ labels, values, kinds = [], height = 220, money: isMoney = true, notes = [] }) {
  const W = 760, H = height, L = 64, B = 30, T = 14, R = 10;
  const E = escala(Math.max(...values, 0));
  const max = E.max;
  const step = (W - L - R) / labels.length;
  const bw = Math.min(46, step * 0.62);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let g = '<g class="grid">';
  for (let i = 0; i <= E.n; i++) {
    const v = E.paso * i;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${isMoney ? ejeMoney(v, max) : num(v)}</text>`;
  }
  g += '</g>';
  let bars = '';
  labels.forEach((lb, i) => {
    const v = values[i] || 0;
    const x = L + step * i + (step - bw) / 2;
    const k = kinds[i] || 'real';
    const h = Math.max(0, y(0) - y(v));
    const tip = `${lb}\n${isMoney ? money(v, true) : num(v)}${notes[i] ? `\n${notes[i]}` : ''}`;
    if (v > 0) {
      bars += k === 'real'
        ? `<path d="M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z" fill="var(--brand)"/>`
        : `<rect x="${x + 1}" y="${y(v) + 1}" width="${bw - 2}" height="${Math.max(0, h - 1)}" rx="4" fill="url(#hatch)" stroke="var(--sky)" stroke-width="2"/>`;
    }
    bars += `<rect class="hit" x="${L + step * i}" y="${T}" width="${step}" height="${H - T - B}" data-tip="${esc(tip)}"/>`;
    bars += `<text x="${L + step * i + step / 2}" y="${H - 10}" text-anchor="middle" class="lbl">${esc(lb)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de columnas"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#e3f5fa"/><line x1="0" y1="0" x2="0" y2="6" stroke="#3bbfda" stroke-width="2"/></pattern></defs>${g}${bars}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--text-3)"/></svg>`;
}
function lineChart({ labels, series, height = 230, partialFrom = null }) {
  const W = 760, H = height, L = 52, B = 30, T = 14, R = 14;
  const all = series.flatMap((s) => s.values.filter((v) => v !== null));
  const E = escala(Math.max(...all, 0));
  const max = E.max;
  const step = (W - L - R) / Math.max(1, labels.length - 1);
  const x = (i) => L + step * i;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let g = '<g class="grid">';
  for (let i = 0; i <= E.n; i++) { const v = E.paso * i; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`; }
  g += '</g>';
  let paths = '';
  for (const s of series) {
    let d = '';
    s.values.forEach((v, i) => { if (v === null) return; d += `${d ? 'L' : 'M'}${x(i)},${y(v)}`; });
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    s.values.forEach((v, i) => { if (v !== null) paths += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>`; });
  }
  let hits = '';
  labels.forEach((lb, i) => {
    const tip = [lb + (partialFrom !== null && i >= partialFrom ? ' (parcial)' : ''), ...series.map((s) => `${s.name}: ${s.values[i] === null ? '—' : num(s.values[i])}`)].join('\n');
    hits += `<rect class="hit" x="${x(i) - step / 2}" y="${T}" width="${step}" height="${H - T - B}" data-tip="${esc(tip)}"/>`;
    hits += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="lbl">${esc(lb)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de líneas">${g}${paths}${hits}</svg>`;
}
function legend(items) {
  return `<div class="legend">${items.map(([c, t, hatch]) => `<span><i style="${hatch ? 'background:repeating-linear-gradient(45deg,#e3f5fa 0 3px,#3bbfda 3px 5px);outline:2px solid #3bbfda' : `background:${c}`}"></i>${esc(t)}</span>`).join('')}</div>`;
}
function barCell(x, ref) {
  const w = Math.min(100, x.pct * 100);
  return `<div class="bar" data-tip="${esc(`${x.nombre}\n${pct(x.pct)} ejecutado · ${money(x.gastoAjustado)} de ${money(x.autorizado)}`)}"><i class="${x.sem.k}" style="width:${w}%"></i>${ref ? `<b style="left:${ref * 100}%" title="Referencia lineal al corte"></b>` : ''}</div>`;
}

/* ───────────── Tablas genéricas (búsqueda + orden + CSV) ───────────── */
const sortState = {};
function table(id, cols, rows, { total = null, onRow = null, empty = 'Sin registros.', estado = (r) => r.estado } = {}) {
  const q = norm($('#q').value);
  const s = sortState[id];
  let list = rows.filter((r) => !q || norm(cols.map((c) => (c.text ? c.text(r) : r[c.k])).join(' ')).includes(q));
  if (s) {
    const c = cols.find((x) => x.k === s.k);
    const val = (r) => (c.sort ? c.sort(r) : r[c.k]);
    list = [...list].sort((a, b) => { const va = val(a), vb = val(b); const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'es'); return s.dir * r; });
  }
  const head = cols.map((c) => `<th scope="col" class="${c.num ? 'num ' : ''}${c.nosort ? '' : 'sortable'}${c.k === 'actions' ? ' actions' : ''}" ${c.nosort ? '' : `data-sort="${id}:${c.k}"`}>${esc(c.label)}${s && s.k === c.k ? ` <span class="arrow">${s.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('');
  const body = list.map((r) => `<tr ${estado(r) ? `data-estado="${estado(r)}"` : ''} ${onRow ? `class="clickable" data-row="${id}:${esc(r.id)}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''}${c.k === 'actions' ? ' actions' : ''}">${c.html ? c.html(r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('');
  const tot = total ? `<tr class="total">${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${total[c.k] ?? ''}</td>`).join('')}</tr>` : '';
  return `<div class="tw"><table data-table="${id}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="empty">${q ? 'Ningún registro coincide con la búsqueda.' : empty}</td></tr>`}${tot}</tbody></table></div>`;
}
function csv(headers, rows) {
  const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
function download(name, content, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ───────────── Lector de Excel (.xlsx) nativo del navegador ───────────── */
async function inflate(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error('Formato de compresión no soportado.');
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede leer Excel. Usa Chrome, Edge o Firefox actualizados.');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readXlsx(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true);
    const start = off + 30 + lnl + lel;
    files[name] = dec.decode(await inflate(u8.subarray(start, start + csize), method));
  }
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const tags = (doc, t) => [...doc.getElementsByTagNameNS('*', t)];
  const ss = files['xl/sharedStrings.xml'] ? tags(xml(files['xl/sharedStrings.xml']), 'si').map((si) => tags(si, 't').map((t) => t.textContent).join('')) : [];
  const rels = {};
  for (const r of tags(xml(files['xl/_rels/workbook.xml.rels'] || '<x/>'), 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target').replace(/^\/?(xl\/)?/, 'xl/');
  const sheets = {};
  for (const s of tags(xml(files['xl/workbook.xml'] || '<x/>'), 'sheet')) {
    const rid = s.getAttribute('r:id') || [...s.attributes].find((a) => a.name.endsWith(':id'))?.value;
    const f = files[rels[rid]];
    if (!f) continue;
    const rows = [];
    for (const r of tags(xml(f), 'row')) {
      const ri = Number(r.getAttribute('r')) - 1;
      const out = [];
      for (const c of tags(r, 'c')) {
        const ref = c.getAttribute('r') || '';
        let col = 0;
        for (const ch of ref.replace(/\d+/g, '')) col = col * 26 + (ch.charCodeAt(0) - 64);
        const t = c.getAttribute('t');
        const v = tags(c, 'v')[0]?.textContent;
        let val = null;
        if (t === 's') val = ss[Number(v)] ?? null;
        else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
        else if (t === 'str' || t === 'e') val = v ?? null;
        else if (t === 'b') val = v === '1';
        else if (v !== undefined) val = Number(v);
        out[col - 1] = val;
      }
      rows[ri] = out;
    }
    sheets[s.getAttribute('name')] = rows;
  }
  return sheets;
}
function leerResumenContable(sheets, fileName) {
  const name = Object.keys(sheets).find((k) => norm(k) === 'resumen');
  if (!name) throw new Error('No encontré la hoja «RESUMEN» en el archivo.');
  const rows = sheets[name];
  const hi = rows.findIndex((r) => r && norm(r[0]) === 'reporte mkt');
  if (hi < 0) throw new Error('La hoja RESUMEN no tiene el encabezado «REPORTE MKT».');
  const hdr = rows[hi];
  const meses = [];
  let totalCol = -1;
  for (let j = 1; j < hdr.length; j++) {
    const h = norm(hdr[j]);
    const m = MESES.findIndex((x) => norm(x) === h || norm(x).slice(0, 3) === h.slice(0, 3) && h.length <= norm(x).length);
    if (m >= 0 && h) meses.push({ col: j, mes: `${CONFIG.anio}-${String(m + 1).padStart(2, '0')}` });
    else if (h === String(CONFIG.anio) || h === 'total') { totalCol = j; break; }
  }
  if (!meses.length || totalCol < 0) throw new Error('No reconocí las columnas de meses y total en RESUMEN.');
  const categorias = [];
  let total = null;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[0] === null || r[0] === undefined || r[0] === '') continue;
    if (norm(r[0]) === String(CONFIG.anio) || norm(r[0]) === 'total') { total = Number(r[totalCol]) || 0; break; }
    const mensual = meses.map((m) => r2(Number(r[m.col]) || 0));
    categorias.push({ nombre: String(r[0]).trim(), mensual, total: r2(Number(r[totalCol]) || 0) });
  }
  if (total === null) throw new Error(`No encontré la fila de total (${CONFIG.anio}) en RESUMEN.`);
  let ultimo = 0;
  meses.forEach((m, i) => { if (categorias.some((c) => c.mensual[i] !== 0)) ultimo = i; });
  const usados = meses.slice(0, ultimo + 1);
  return {
    fuente: fileName, hoja: name, corte: usados[usados.length - 1].mes, meses: usados.map((m) => m.mes),
    mesesTexto: usados.map((m) => MESES[Number(m.mes.slice(5)) - 1]),
    categorias: categorias.map((c) => ({ ...c, mensual: c.mensual.slice(0, usados.length) })), total: r2(total), importadoEl: new Date().toISOString(),
  };
}

/* ───────────── Interfaz: navegación y filtros ───────────── */
const MODULOS = [
  ['resumen', 'Resumen ejecutivo'],
  ['presupuesto', 'Presupuesto y ejecución'],
  ['cierre', 'Planeación de cierre'],
  ['kpi', 'Resultados y KPI'],
  ['gerencias', 'Gestión por gerencia'],
  ['conciliacion', 'Conciliación y trazabilidad'],
  ['decisiones', 'Decisiones de Dirección'],
];
function renderNav() {
  $('#tabs').innerHTML = MODULOS.map(([k, t], i) => `<button role="tab" aria-selected="${state.tab === k}" data-tab="${k}"><span class="n">${i + 1}</span>${t}</button>`).join('');
  $('#filtro-estado').innerHTML = [['TODOS', 'Todos'], ...ESTADOS.map((e) => [e, ESTADO_TXT[e]])].map(([k, t]) => `<button aria-pressed="${state.filtro === k}" data-filtro="${k}">${t}</button>`).join('');
  document.body.dataset.fe = state.filtro;
}
function render() {
  const F = fin();
  $('#corte').innerHTML = `Corte contable oficial<b>${esc(mesLabel(F.corte).toUpperCase())}</b>`;
  renderNav();
  const fn = { resumen: vResumen, presupuesto: vPresupuesto, cierre: vCierre, kpi: vKpi, gerencias: vGerencias, conciliacion: vConciliacion, decisiones: vDecisiones }[state.tab] || vResumen;
  $('#view').innerHTML = fn(F);
  saveIndicator();
}

/* ───────────── Módulo 1 · Resumen ejecutivo ───────────── */
function vResumen(F) {
  const P = CONFIG.presupuesto;
  const C = cierre(F);
  const noEjercido = r2(P.total - F.tot.gastoContable);
  const val = validaciones(F);
  const okN = val.filter((v) => v.ok).length, valN = val.filter((v) => !v.na).length;
  const alertas = alertasFinancieras(F, C);
  const ref = F.nMeses / 12;
  const pend = conteoPendientes(F);
  const meses = [...F.c.meses.map((m) => MESES_CORTOS[Number(m.slice(5)) - 1]), ...C.meses.map((m) => MESES_CORTOS[Number(m.slice(5)) - 1])];
  const valores = [...F.mensual, ...C.porMes];
  const kinds = [...F.mensual.map(() => 'real'), ...C.porMes.map(() => 'comp')];
  const notes = [...F.mensual.map(() => 'Gasto real (contable)'), ...C.porMes.map(() => 'Compromisos / planeación capturados · no es gasto real')];
  return `
  <div class="mod-head"><div><h2>Resumen ejecutivo</h2><p>Gasto real con corte contable oficial a <b>${esc(mesLabel(F.corte))}</b>. Los meses posteriores sólo muestran compromisos o planeación capturados: nunca se presentan como gasto real.</p></div>
  <div class="row"><span class="chip ${okN === valN ? 'sem-ok' : 'sem-sobre'}" data-testid="validaciones">${okN === valN ? '✓' : '▲'} ${okN}/${valN} validaciones de cuadre</span></div></div>
  <section class="kpis" aria-label="Indicadores financieros">
    ${kpi('Presupuesto total autorizado', money(P.total), `Distribuido ${money(P.distribuido)} · reserva ${money(P.reserva)}`, 'CONFIRMADO', 'accent')}
    ${kpi(`Gasto real ene–${MESES_CORTOS[Number(F.corte.slice(5)) - 1].toLowerCase()}`, money(F.tot.gastoContable, true), `Fuente: ${F.c.fuente}`, 'CONFIRMADO', 'accent', 'gasto-real')}
    ${kpi('Porcentaje de ejecución', pct(F.tot.gastoContable / P.total), `${pct(F.tot.gastoContable / P.distribuido)} del distribuido · referencia lineal ${pct(ref)}`, 'CONFIRMADO', '', 'ejecucion')}
    ${kpi('Recursos no ejercidos', money(noEjercido, true), `Incluye la reserva de ${money(P.reserva)}`, 'CONFIRMADO')}
    ${kpi('Reserva sin asignar', money(P.reserva), 'No asignada a ninguna partida', 'CONFIRMADO')}
    ${kpi(`Compromisos ${C.meses.length ? `${MESES_CORTOS[Number(C.meses[0].slice(5)) - 1].toLowerCase()}–dic` : ''}`, money(C.total), C.total ? `Saldo proyectado ${money(C.saldo)}` : 'Aún sin capturar (módulo 3)', C.total ? 'PROPUESTA' : 'PENDIENTE', C.saldo < 0 ? 'alert' : '')}
  </section>
  <div class="grid g2">
    <div class="card" data-estado="CONFIRMADO">
      <h3>¿Dónde está el presupuesto?</h3><p class="sub">Presupuesto total ${money(P.total)} · gasto real al corte, disponible asignado y reserva</p>
      <div class="stack" role="img" aria-label="Distribución del presupuesto">
        <span style="width:${(F.tot.gastoContable / P.total) * 100}%;background:var(--brand)" data-tip="${esc(`Gasto real\n${money(F.tot.gastoContable, true)}`)}"></span>
        <span style="width:${(Math.max(0, P.distribuido - F.tot.gastoContable) / P.total) * 100}%;background:var(--brand-100)" data-tip="${esc(`Disponible en partidas\n${money(P.distribuido - F.tot.gastoContable, true)}`)}"></span>
        <span style="width:${(P.reserva / P.total) * 100}%;background:var(--sky)" data-tip="${esc(`Reserva sin asignar\n${money(P.reserva)}`)}"></span>
      </div>
      ${legend([['var(--brand)', `Gasto real ${money(F.tot.gastoContable)}`], ['var(--brand-100)', `Disponible en partidas ${money(P.distribuido - F.tot.gastoContable)}`], ['var(--sky)', `Reserva ${money(P.reserva)}`]])}
      <h3 class="section">Gasto mensual</h3><p class="sub">Real (contable) y, después del corte, compromisos capturados</p>
      ${colChart({ labels: meses, values: valores, kinds, notes })}
      ${legend([['var(--brand)', 'Gasto real contable'], ['', 'Compromisos / planeación (no es gasto real)', true]])}
    </div>
    <div class="card">
      <h3>Alertas financieras</h3><p class="sub">Calculadas sólo con presupuesto autorizado y gasto contable</p>
      <ul class="alerts" data-testid="alertas">${alertas.map((a) => `<li class="${a.k}" data-estado="${a.estado}"><span class="ico" aria-hidden="true">${a.i}</span><div><b>${esc(a.t)}</b><div class="small">${esc(a.d)}</div></div></li>`).join('') || '<li class="info">Sin alertas.</li>'}</ul>
      <h3 class="section">Información pendiente de validación</h3>
      <p class="sub">Registros marcados como pendientes en todo el dashboard</p>
      <div class="metric">${pend.map(([t, n]) => `<div><b>${n}</b><span>${esc(t)}</span></div>`).join('')}</div>
      <button class="btn btn-sm" data-tab="conciliacion">Ver conciliación y trazabilidad →</button>
    </div>
  </div>`;
}
function kpi(lbl, val, hint, estado, cls = '', testid = '') {
  return `<div class="card kpi ${cls}" data-estado="${estado}" ${testid ? `data-testid="${testid}"` : ''}><div class="lbl">${esc(lbl)}</div><div class="val">${val}</div><div class="hint">${esc(hint)}</div><div class="badge-wrap">${badge(estado)}</div></div>`;
}
function alertasFinancieras(F, C) {
  const a = [];
  for (const x of F.rows.filter((r) => r.sem.k === 'sobre')) a.push({ k: 'sobre', i: '▲', t: `${x.nombre}: sobreejercicio de ${money(-x.disponible)}`, d: `${pct(x.pct)} del autorizado (${money(x.gastoAjustado)} de ${money(x.autorizado)}).`, estado: x.estado });
  for (const x of F.rows.filter((r) => r.sem.k === 'riesgo')) a.push({ k: 'riesgo', i: '!', t: `${x.nombre}: ${pct(x.pct)} ejecutado al corte`, d: `Quedan ${money(x.disponible)} para ${12 - F.nMeses} meses.`, estado: x.estado });
  for (const x of F.rows.filter((r) => r.sem.k === 'conciliar')) a.push({ k: 'conciliar', i: '↺', t: `${x.nombre}: requiere conciliación`, d: `Gasto ${money(x.gastoContable)} vs capital inicial ${money(x.autorizado)}. Capital revolvente: no es sobreejercicio automático.`, estado: 'PENDIENTE' });
  const sin = F.rows.filter((r) => r.sem.k === 'sin');
  if (sin.length) a.push({ k: 'sin', i: '○', t: `${sin.length} partidas sin ejercer: ${money(sin.reduce((s, x) => s + x.autorizado, 0))}`, d: sin.map((x) => x.nombre).join(', '), estado: 'CONFIRMADO' });
  const rp = F.reclas.filter((r) => r.estado !== 'CONFIRMADO');
  if (rp.length) a.push({ k: 'info', i: '!', t: `${rp.length} reclasificaciones pendientes de formalizar`, d: `${money(rp.reduce((s, r) => s + r.monto, 0), true)} hacia Branding de la Red (no alteran el gasto total).`, estado: 'PENDIENTE' });
  for (const x of C.porPartida.filter((r) => r.n && r.saldoProyectado < 0)) a.push({ k: 'sobre', i: '▲', t: `${x.nombre}: sobreejercicio proyectado de ${money(-x.saldoProyectado)}`, d: 'Con los compromisos capturados para el cierre.', estado: 'PROPUESTA' });
  return a;
}
function conteoPendientes(F) {
  const kpis = kpiRegistros().filter((k) => k.estado === 'PENDIENTE').length;
  return [
    ['Reclasificaciones', F.reclas.filter((r) => r.estado === 'PENDIENTE').length],
    ['Diferencias', diferencias(F).filter((d) => d.estado === 'PENDIENTE').length],
    ['Indicadores', kpis],
    ['Gerencias', CONFIG.gerencias.filter((g) => estadoDe(`G-${g.id}`, 'PENDIENTE') === 'PENDIENTE').length],
    ['Compromisos', state.compromisos.filter((x) => x.estado === 'PENDIENTE').length],
  ];
}

/* ───────────── Módulo 2 · Presupuesto y ejecución ───────────── */
let semFiltro = '';
function vPresupuesto(F) {
  const ref = F.nMeses / 12;
  const rows = F.rows.filter((r) => !semFiltro || r.sem.k === semFiltro);
  const cols = [
    { k: 'id', label: '#' },
    { k: 'nombre', label: 'Partida', html: (r) => `<b>${esc(r.nombre)}</b>${r.revolvente ? '<div class="small muted">Capital revolvente</div>' : ''}<div class="small muted">${esc(r.categorias.join(', ') || 'Sin categoría contable con gasto')}</div>` },
    { k: 'original', label: 'Original', num: true, html: (r) => money(r.original) },
    { k: 'movimientos', label: 'Movimientos', num: true, html: (r) => (r.movimientos ? `<span class="${r.movimientos < 0 ? 'neg' : ''}">${r.movimientos > 0 ? '+' : ''}${money(r.movimientos)}</span>` : '—') },
    { k: 'autorizado', label: 'Autorizado', num: true, html: (r) => `<b>${money(r.autorizado)}</b>` },
    { k: 'gastoContable', label: 'Gasto contable', num: true, html: (r) => money(r.gastoContable, true) },
    { k: 'ajuste', label: 'Reclasificación', num: true, html: (r) => (r.ajuste ? `<span class="${r.ajuste < 0 ? 'neg' : ''}">${r.ajuste > 0 ? '+' : ''}${money(r.ajuste, true)}</span><div class="small muted">${r.reclas.join(', ')}</div>` : '—') },
    { k: 'gastoAjustado', label: 'Gasto ajustado', num: true, html: (r) => `<b>${money(r.gastoAjustado, true)}</b>` },
    { k: 'disponible', label: 'Disponible', num: true, html: (r) => `<span class="${r.disponible < 0 && !r.revolvente ? 'neg' : ''}">${money(r.disponible, true)}</span>` },
    { k: 'pct', label: '% ejec.', num: true, html: (r) => pct(r.pct) },
    { k: 'bar', label: 'Avance', nosort: true, html: (r) => barCell(r, ref) },
    { k: 'sem', label: 'Semáforo', sort: (r) => ['sobre', 'riesgo', 'conciliar', 'ok', 'sin'].indexOf(r.sem.k), html: (r) => semChip(r.sem), text: (r) => r.sem.t },
    { k: 'estado', label: 'Validación', html: (r) => badge(r.estado), text: (r) => ESTADO_TXT[r.estado] },
  ];
  const T = F.tot;
  const sinP = F.sinPartida.filter((s) => s.total);
  const total = { nombre: '<b>Total 20 partidas</b>', original: money(T.original), movimientos: money(F.rows.reduce((s, r) => s + r.movimientos, 0)), autorizado: money(T.autorizado), gastoContable: money(F.rows.reduce((s, r) => s + r.gastoContable, 0), true), ajuste: money(F.rows.reduce((s, r) => s + r.ajuste, 0), true), gastoAjustado: money(F.rows.reduce((s, r) => s + r.gastoAjustado, 0), true), disponible: money(F.rows.reduce((s, r) => s + r.disponible, 0), true), pct: pct(F.rows.reduce((s, r) => s + r.gastoAjustado, 0) / T.autorizado) };
  return `
  <div class="mod-head"><div><h2>Presupuesto y ejecución</h2><p>20 partidas autorizadas, gasto contable al corte de <b>${esc(mesLabel(F.corte))}</b>, reclasificaciones para el análisis directivo y gasto ajustado. Haz clic en una partida para ver su gasto mensual.</p></div>
  <div class="row no-print"><select class="input" style="width:auto" data-act="sem-filtro" aria-label="Filtrar por semáforo"><option value="">Semáforo: todos</option>${[['sobre', 'Sobreejercicio'], ['riesgo', 'Riesgo (≥ 90%)'], ['ok', 'En rango'], ['sin', 'Sin ejercer'], ['conciliar', 'Conciliar']].map(([k, t]) => `<option value="${k}" ${semFiltro === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
  <button class="btn" data-act="csv-partidas">Exportar CSV</button></div></div>
  <div class="note info small" style="margin-bottom:12px">La marca vertical en cada barra es la <b>referencia lineal al corte</b> (${pct(ref)} = ${F.nMeses}/12 meses): sólo orienta, no es una proyección. Semáforo: sobreejercicio &gt; 100%, riesgo ≥ 90%, SOC Store se concilia aparte por ser capital revolvente.</div>
  ${table('partidas', cols, rows, { total: semFiltro ? null : total, onRow: true })}
  ${sinP.length ? `<div class="card section"><h3>Gasto contable sin partida autorizada</h3><p class="sub">Se muestra para que el total cuadre con la fuente oficial</p>${table('sinpartida', [
    { k: 'nombre', label: 'Categoría contable' }, { k: 'total', label: 'Gasto contable', num: true, html: (r) => money(r.total, true) },
    { k: 'ajuste', label: 'Reclasificación', num: true, html: (r) => (r.ajuste ? `<span class="neg">${money(r.ajuste, true)}</span>` : '—') },
    { k: 'final', label: 'Queda sin partida', num: true, html: (r) => money(r.total + r.ajuste, true) },
  ], sinP.map((s) => ({ ...s, id: s.nombre })), { estado: (r) => (r.ajuste ? 'PENDIENTE' : 'CONFIRMADO') })}</div>` : ''}
  <div class="card section"><h3>Cuadre del gasto</h3><div class="metric">
    <div><b>${money(T.gastoContable, true)}</b><span>Gasto contable total</span></div>
    <div><b>${money(T.ajuste, true)}</b><span>Neto de reclasificaciones</span></div>
    <div><b>${money(T.gastoAjustado, true)}</b><span>Gasto ajustado total</span></div>
    <div><b>${money(T.disponible, true)}</b><span>Disponible en partidas (sin la reserva de ${money(CONFIG.presupuesto.reserva)})</span></div></div></div>`;
}

/* ───────────── Módulo 3 · Planeación de cierre ───────────── */
function vCierre(F) {
  const C = cierre(F);
  const cols = [
    { k: 'id', label: '#' }, { k: 'nombre', label: 'Partida' },
    { k: 'disponible', label: 'Disponible al corte', num: true, html: (r) => money(r.disponible) },
    { k: 'comprometido', label: 'Comprometido', num: true, html: (r) => money(r.comprometido) },
    { k: 'planeado', label: 'Planeado / proyectos', num: true, html: (r) => money(r.planeado) },
    { k: 'saldoProyectado', label: 'Saldo proyectado', num: true, html: (r) => `<b class="${r.saldoProyectado < 0 && !r.revolvente ? 'neg' : ''}">${money(r.saldoProyectado)}</b>` },
    { k: 'alerta', label: 'Alerta', nosort: true, html: (r) => (r.revolvente ? semChip({ k: 'conciliar', t: 'Conciliar', i: '↺' }) : r.saldoProyectado < 0 ? semChip({ k: 'sobre', t: r.disponible < 0 ? 'Ya excedida' : 'Sobreejercicio proyectado', i: '▲' }) : r.n ? semChip({ k: 'ok', t: 'Con saldo', i: '✓' }) : '<span class="small muted">Sin compromisos</span>') },
  ];
  const cc = [
    { k: 'mes', label: 'Mes', html: (r) => esc(mesLabel(r.mes)) },
    { k: 'partida', label: 'Partida', html: (r) => esc(nombrePartida(r.partida)) },
    { k: 'concepto', label: 'Concepto' }, { k: 'tipo', label: 'Tipo' }, { k: 'proveedor', label: 'Proveedor' },
    { k: 'monto', label: 'Monto', num: true, sort: (r) => Number(r.monto), html: (r) => money(Number(r.monto)) },
    { k: 'responsable', label: 'Seguimiento' },
    { k: 'estado', label: 'Validación', html: (r) => badge(r.estado, `C:${r.id}`), text: (r) => ESTADO_TXT[r.estado] },
    { k: 'actions', label: '', nosort: true, html: (r) => `<button class="btn btn-sm" data-act="editar" data-col="compromisos" data-id="${esc(r.id)}">Editar</button> <button class="btn btn-sm btn-danger" data-act="borrar" data-col="compromisos" data-id="${esc(r.id)}">Eliminar</button>` },
  ];
  return `
  <div class="mod-head"><div><h2>Planeación de cierre ${CONFIG.anio}</h2><p>Compromisos y proyectos pendientes de ${C.meses.length ? `${esc(mesLabel(C.meses[0]))} a diciembre` : 'cierre'}. Son <b>planeación, no gasto real</b>: el gasto real sólo cambia con el reporte contable oficial.</p></div>
  <div class="row no-print"><label class="row small"><input type="checkbox" data-act="solo-confirmados" ${state.soloConfirmados ? 'checked' : ''}> Sólo compromisos confirmados</label>
  <button class="btn btn-primary" data-act="nuevo" data-col="compromisos">+ Capturar compromiso</button>
  <button class="btn" data-act="importar-csv" data-col="compromisos">Importar CSV</button><button class="btn" data-act="plantilla" data-col="compromisos">Plantilla CSV</button>
  <button class="btn" data-act="csv" data-col="compromisos">Exportar CSV</button></div></div>
  <section class="kpis">
    ${kpi('Disponible en partidas al corte', money(F.tot.disponible), `No incluye la reserva sin asignar de ${money(CONFIG.presupuesto.reserva)}`, 'CONFIRMADO')}
    ${kpi('Recursos comprometidos', money(C.total), `${state.compromisos.length} ${state.compromisos.length === 1 ? "registro capturado" : "registros capturados"}`, C.total ? 'PROPUESTA' : 'PENDIENTE')}
    ${kpi('Saldo proyectado al cierre', money(C.saldo), C.total ? 'Disponible − compromisos capturados' : 'Sin compromisos: igual al disponible', C.total ? 'PROPUESTA' : 'PENDIENTE', C.saldo < 0 ? 'alert' : '')}
    ${kpi('Partidas con sobreejercicio proyectado', String(C.porPartida.filter((r) => r.saldoProyectado < 0 && !r.revolvente).length), 'Incluye las que ya están excedidas', 'CONFIRMADO', C.porPartida.some((r) => r.saldoProyectado < 0 && !r.revolvente) ? 'alert' : '')}
  </section>
  ${state.compromisos.length ? '' : '<div class="note warn" style="margin-bottom:12px"><b>Sin compromisos capturados.</b> No se recibió información de compromisos de septiembre a diciembre: captúrala aquí o impórtala con la plantilla CSV. No se inventan cifras.</div>'}
  <div class="card"><h3>Compromisos y proyectos pendientes</h3><p class="sub">Captura, edita o elimina. Cada registro tiene su estado de validación.</p>${table('compromisos', cc, state.compromisos, { empty: 'Aún no hay compromisos capturados.' })}</div>
  <div class="card section"><h3>Saldo proyectado por partida</h3><p class="sub">Disponible al corte menos compromisos y planeación capturados${state.soloConfirmados ? ' (sólo confirmados)' : ''}</p>${table('saldos', cols, C.porPartida, { estado: () => null })}</div>`;
}
const nombrePartida = (id) => { const p = CONFIG.partidas.find((x) => x.id === id); return p ? `${p.id} ${p.nombre}` : id; };

/* ───────────── Módulo 4 · Resultados y KPI (independiente) ───────────── */
function kpiRegistros() {
  const K = CONFIG.kpisManuales;
  return [
    { id: 'K-FRAN', titulo: 'Atracción de franquicias', periodo: FUENTES.franquicias.periodo, fuente: FUENTES.franquicias.fuente, estado: estadoDe('K-FRAN', 'CONFIRMADO') },
    { id: 'K-SOCL', titulo: 'SOC Leads+', periodo: FUENTES.socleads.periodo, fuente: FUENTES.socleads.fuente, estado: estadoDe('K-SOCL', 'CONFIRMADO') },
    { id: 'K-SOCTV', titulo: 'SOC TV', periodo: K.socTv.periodo, fuente: K.socTv.fuente, estado: estadoDe('K-SOCTV', K.socTv.estado) },
    { id: 'K-PLAT', titulo: 'Plataforma SOC', periodo: K.plataforma.periodo, fuente: K.plataforma.fuente, estado: estadoDe('K-PLAT', K.plataforma.estado) },
    { id: 'K-PRECAL', titulo: 'Precalificador', periodo: 'Ene-2025 a 15-oct-2026 (histórico) · 2026 por separado', fuente: FUENTES.precalificador.fuente, estado: estadoDe('K-PRECAL', 'CONFIRMADO') },
    { id: 'K-BRAND', titulo: 'Branding de oficinas', periodo: K.branding.periodo, fuente: K.branding.fuente, estado: estadoDe('K-BRAND', K.branding.estado) },
    { id: 'K-STORE', titulo: 'SOC Store (reporte comercial)', periodo: FUENTES.store.periodo, fuente: FUENTES.store.fuente, estado: estadoDe('K-STORE', 'CONFIRMADO') },
  ];
}
function kpiCard(reg, body) {
  return `<div class="card" data-estado="${reg.estado}" data-testid="${reg.id}"><h3>${esc(reg.titulo)} ${badge(reg.estado, reg.id)}</h3><div class="row" style="margin:6px 0 4px"><span class="periodo">Periodo: ${esc(reg.periodo)}</span></div>${body}<div class="src">Fuente: ${esc(reg.fuente)}</div></div>`;
}
function vKpi() {
  const R = Object.fromEntries(kpiRegistros().map((r) => [r.id, r]));
  const fr = FUENTES.franquicias.total;
  const fq = FUENTES.franquicias;
  const sl = FUENTES.socleads;
  const K = CONFIG.kpisManuales;
  const pc = FUENTES.precalificador;
  const st = FUENTES.store;
  const i25 = (m) => pc.meses.indexOf(m);
  const lbl = MESES_CORTOS.slice(0, 10);
  const s25 = lbl.map((_, i) => pc.mensual[i25(`2025-${String(i + 1).padStart(2, '0')}`)]);
  const s26 = lbl.map((_, i) => { const k = i25(`2026-${String(i + 1).padStart(2, '0')}`); return k >= 0 ? pc.mensual[k] : null; });
  const ene_sep26 = s26.slice(0, 9).reduce((s, v) => s + (v || 0), 0);
  const ene_sep25 = s25.slice(0, 9).reduce((s, v) => s + (v || 0), 0);
  const storeMeses = st.porMes.filter((m) => m.ventas > 0);
  return `
  <div class="mod-head"><div><h2>Resultados y KPI</h2><p>Módulo independiente: cada indicador muestra su periodo y fuente. <b>No se vincula con el gasto contable</b> ni se calcula ROI; la inversión que reportan las iniciativas no se suma al presupuesto ejercido.</p></div>
  <div class="row no-print"><button class="btn" data-act="csv-kpi">Exportar CSV</button></div></div>
  <div class="grid g2">
  ${kpiCard(R['K-FRAN'], `
    <div class="metric">
      <div><b>${money(fr.inversion)}</b><span>Inversión reportada</span></div><div><b>${num(fr.leads)}</b><span>Leads</span></div><div><b>${num(fr.mql)}</b><span>MQL</span></div><div><b>${num(fr.sql)}</b><span>SQL</span></div><div><b>${num(fr.cierres)}</b><span>Cierres</span></div>
    </div>
    <div class="tw"><table><thead><tr><th>Costo</th><th class="num">Valor</th><th>Conversión</th><th class="num">Tasa</th></tr></thead><tbody>
      <tr><td>Por lead</td><td class="num">${money(fr.inversion / fr.leads, true)}</td><td>Lead → MQL</td><td class="num">${pct(fr.mql / fr.leads)}</td></tr>
      <tr><td>Por MQL</td><td class="num">${money(fr.inversion / fr.mql, true)}</td><td>MQL → SQL</td><td class="num">${pct(fr.sql / fr.mql)}</td></tr>
      <tr><td>Por SQL</td><td class="num">${money(fr.inversion / fr.sql, true)}</td><td>SQL → cierre</td><td class="num">${pct(fr.cierres / fr.sql)}</td></tr>
      <tr><td>Por cierre</td><td class="num">${money(fr.inversion / fr.cierres, true)}</td><td>Lead → cierre</td><td class="num">${pct(fr.cierres / fr.leads, 2)}</td></tr>
    </tbody></table></div>
    <h3 class="section" style="font-size:14px">Cierres por trimestre</h3>
    ${colChart({ labels: fq.trimestres, values: fq.cierres, money: false, height: 160, notes: fq.trimestres.map((t, i) => `Inversión ${money(fq.inversion[i])} · ${num(fq.mql[i])} MQL · ${num(fq.sql[i])} SQL`) })}
    <div class="note warn small">La inversión pertenece al reporte de la iniciativa: no se suma al gasto contable hasta validar su correspondencia presupuestal.</div>`)}
  ${kpiCard(R['K-SOCL'], `
    <div class="metric"><div><b>${sl.oficinas}</b><span>Oficinas</span></div><div><b>${num(sl.leads)}</b><span>Leads</span></div><div><b>${num(sl.sinGestionar)}</b><span>Sin gestionar</span></div><div><b>${pct(sl.sinGestionar / sl.leads)}</b><span>% sin gestionar</span></div><div><b>${num(sl.enProceso)}</b><span>En proceso</span></div></div>
    <p class="sub">Etapas reportadas por el informe (suman ${num(sl.sinGestionar + sl.contactados + sl.enProceso + sl.perdidos)} de ${num(sl.leads)}):</p>
    ${[['Sin gestionar (asignado)', sl.sinGestionar, 'var(--coral)'], ['Contactados', sl.contactados, 'var(--sky)'], ['En proceso (asesorado, integración, banco)', sl.enProceso, 'var(--brand)'], ['Perdidos (no contactable, no responde, no interesado, no perfila, descartado)', sl.perdidos, 'var(--text-3)']].map(([t, v, c]) => `<div class="hbar"><span class="small">${esc(t)}</span><div class="bar" data-tip="${esc(`${t}\n${num(v)} leads · ${pct(v / sl.leads)}`)}"><i style="width:${(v / sl.leads) * 100}%;background:${c}"></i></div><span class="num small"><b>${num(v)}</b> · ${pct(v / sl.leads)}</span></div>`).join('')}
    <div class="note info small">${num(sl.leads - (sl.registrosPorAnio['2026'] || 0))} de los ${num(sl.leads)} registros se crearon antes de 2026 (incluidos en la exportación).</div>`)}
  ${kpiCard(R['K-SOCTV'], `<div class="metric"><div><b>${num(K.socTv.vistas)}</b><span>Visualizaciones</span></div><div><b>+${(K.socTv.crecimiento * 100).toFixed(0)}%</b><span>Crecimiento interanual</span></div></div><div class="note warn small">Sin archivo fuente adjunto: pendiente de validación.</div>`)}
  ${kpiCard(R['K-PLAT'], `<div class="metric"><div><b>${num(K.plataforma.descargas)}</b><span>Descargas</span></div><div><b>${num(K.plataforma.solicitudes)}</b><span>Solicitudes</span></div><div><b>${num(K.plataforma.oficinasActivas)}</b><span>Oficinas activas</span></div></div><div class="note warn small">Sin archivo fuente adjunto: pendiente de validación.</div>`)}
  ${kpiCard(R['K-PRECAL'], `
    <div class="metric"><div><b>${num(pc.historico)}</b><span>Registros históricos</span></div><div><b>${num(pc.total2026)}</b><span>Registros 2026*</span></div><div><b>${num(pc.sinZona)}</b><span>Sin zona (histórico)</span></div><div><b>${num(pc.sinZona2026)}</b><span>Sin zona 2026</span></div></div>
    <p class="sub">Registros por mes: 2025 vs 2026. Ene–sep 2026: ${num(ene_sep26)} vs ${num(ene_sep25)} en 2025 (${pct(ene_sep26 / ene_sep25 - 1)}).</p>
    ${lineChart({ labels: lbl, series: [{ name: '2025', color: '#9aa8a3', values: s25 }, { name: '2026', color: 'var(--brand)', values: s26 }], partialFrom: 9 })}
    ${legend([['#9aa8a3', '2025'], ['var(--brand)', '2026 (octubre parcial al 15-oct)']])}
    <div class="note warn small">* El histórico (${num(pc.historico)}) incluye ${num(pc.total2025)} registros de 2025: no son resultados de 2026. Un registro en el precalificador no equivale a un resultado comercial.</div>`)}
  ${kpiCard(R['K-BRAND'], `${K.branding.lineas.map((l) => `<div class="hbar"><span class="small"><b>${esc(l.linea)}</b></span><div class="bar" data-tip="${esc(`${l.linea}\n${l.logradas} de ${l.universo} oficinas · ${pct(l.logradas / l.universo)}`)}"><i style="width:${(l.logradas / l.universo) * 100}%"></i></div><span class="num small"><b>${l.logradas}/${l.universo}</b> · ${pct(l.logradas / l.universo)}</span></div>`).join('')}
    <div class="note warn small">Cumplimiento por línea de negocio sobre el universo indicado para cada una. No se extrapola a toda la red SOC. Sin archivo fuente adjunto.</div>`)}
  ${kpiCard(R['K-STORE'], `
    <div class="metric"><div><b>${num(st.transacciones)}</b><span>Transacciones</span></div><div><b>${money(st.facturado)}</b><span>Facturado</span></div><div><b>${num(st.unidades)}</b><span>Unidades</span></div><div><b>${money(st.ticketPromedio)}</b><span>Ticket promedio</span></div><div><b>${money(st.ticketMediano)}</b><span>Ticket mediano</span></div><div><b>${num(st.pedidosDescuentoTotal)}</b><span>Pedidos con 100% desc.</span></div></div>
    <p class="sub">Facturación mensual (ventas desde ${esc(storeMeses[0]?.mes || '—')}; octubre parcial al 16-oct)</p>
    ${colChart({ labels: storeMeses.map((m) => m.mes), values: storeMeses.map((m) => m.facturacion), height: 170, notes: storeMeses.map((m) => `${num(m.ventas)} ventas · ${num(m.unidades)} unidades`) })}
    <div class="note warn small">Periodo distinto al corte contable (agosto). No se calcula utilidad, margen ni ROI sin conciliar periodos, costos e ingresos (ver Conciliación).</div>`)}
  </div>`;
}

/* ───────────── Módulo 5 · Gestión por gerencia (independiente) ───────────── */
function vGerencias() {
  const T = CONFIG.gerenciasTotales;
  const suma = (k) => CONFIG.gerencias.reduce((s, g) => s + g[k], 0);
  const cuadra = suma('pendientes') === T.pendientes && suma('p1') === T.p1 && suma('bloqueos') === T.bloqueos;
  const gg = [
    { k: 'gerencia', label: 'Gerencia', html: (r) => esc(gerenciaNombre(r.gerencia)), text: (r) => gerenciaNombre(r.gerencia) },
    { k: 'responsable', label: 'Responsable' }, { k: 'proyecto', label: 'Proyecto' }, { k: 'actividad', label: 'Actividad' },
    { k: 'prioridad', label: 'Prioridad', html: (r) => `${esc(r.prioridad || '—')}${r.prioridad && r.prioridadConfirmada !== 'Sí' ? ' <span class="small muted">(propuesta)</span>' : ''}` },
    { k: 'avance', label: 'Estado' }, { k: 'fecha', label: 'Fecha compromiso' }, { k: 'bloqueo', label: 'Bloqueo' }, { k: 'dependencia', label: 'Dependencia' }, { k: 'proximaAccion', label: 'Próxima acción' },
    { k: 'estado', label: 'Validación', html: (r) => badge(r.estado, `GE:${r.id}`), text: (r) => ESTADO_TXT[r.estado] },
    { k: 'actions', label: '', nosort: true, html: (r) => `<button class="btn btn-sm" data-act="editar" data-col="gestion" data-id="${esc(r.id)}">Editar</button> <button class="btn btn-sm btn-danger" data-act="borrar" data-col="gestion" data-id="${esc(r.id)}">Eliminar</button>` },
  ];
  return `
  <div class="mod-head"><div><h2>Gestión por gerencia</h2><p>Módulo independiente: no se vincula con presupuesto, resultados ni evaluaciones. <b>No califica desempeño individual.</b></p></div>
  <div class="row no-print"><button class="btn btn-primary" data-act="nuevo" data-col="gestion">+ Capturar registro</button><button class="btn" data-act="importar-csv" data-col="gestion">Importar CSV</button><button class="btn" data-act="plantilla" data-col="gestion">Plantilla CSV</button><button class="btn" data-act="csv" data-col="gestion">Exportar CSV</button></div></div>
  <div class="note warn" style="margin-bottom:12px">${esc(CONFIG.gerenciasNota)}</div>
  <div class="grid g2" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
  ${CONFIG.gerencias.map((g) => { const e = estadoDe(`G-${g.id}`, 'PENDIENTE'); return `<div class="card ger" data-estado="${e}" data-testid="ger-${g.id}"><h3>${esc(g.gerencia)}</h3><div class="sub">${esc(g.responsable)}</div>${badge(e, `G-${g.id}`)}
    <div class="nums"><div><b>${g.pendientes}</b><span>Pendientes</span></div><div><b>${g.p1}</b><span>P1 propuestas</span></div><div><b>${g.bloqueos}</b><span>Bloqueos</span></div></div></div>`; }).join('')}
  </div>
  <div class="card section"><div class="row"><b>Totales de la fotografía:</b> ${T.pendientes} pendientes · ${T.p1} prioridades P1 (propuestas) · ${T.bloqueos} bloqueos <span class="chip ${cuadra ? 'sem-ok' : 'sem-sobre'}">${cuadra ? '✓ La suma por gerencia cuadra' : '▲ La suma por gerencia no cuadra'}</span></div></div>
  <div class="card section"><h3>Detalle de proyectos y actividades</h3><p class="sub">Captura o importa los registros que cada gerencia confirme (responsable, proyecto, actividad, prioridad, estado, fecha compromiso, bloqueo, dependencia, próxima acción y validación).</p>
  ${table('gestion', gg, state.gestion, { empty: 'Sin registros: se cargan cuando cada gerencia valide su inventario.' })}</div>`;
}
const gerenciaNombre = (id) => CONFIG.gerencias.find((g) => g.id === id)?.gerencia || id;

/* ───────────── Módulo 6 · Conciliación y trazabilidad ───────────── */
function vConciliacion(F) {
  const val = validaciones(F);
  const fuentes = [
    { id: 'F-CONT', fuente: `${F.c.fuente} (hoja ${F.c.hoja})`, corte: mesLabel(F.corte), periodo: `Enero–${MESES[Number(F.corte.slice(5)) - 1].toLowerCase()} ${CONFIG.anio}`, uso: 'Gasto real (fuente oficial)', estado: estadoDe('F-CONT', 'CONFIRMADO'), observacion: '' },
    { id: 'F-FRAN', fuente: FUENTES.franquicias.fuente, corte: 'Septiembre 2026', periodo: FUENTES.franquicias.periodo, uso: 'Embudo de atracción de franquicias', estado: estadoDe('F-FRAN', 'CONFIRMADO'), observacion: 'Correspondencia presupuestal de la inversión pendiente.' },
    { id: 'F-SOCL', fuente: FUENTES.socleads.fuente, corte: '16-oct-2026', periodo: FUENTES.socleads.periodo, uso: 'Gestión de leads SOC Leads+', estado: estadoDe('F-SOCL', 'CONFIRMADO'), observacion: '' },
    { id: 'F-STORE', fuente: FUENTES.store.fuente, corte: '16-oct-2026', periodo: FUENTES.store.periodo, uso: 'Ventas SOC Store (reporte comercial)', estado: estadoDe('F-STORE', 'CONFIRMADO'), observacion: 'Periodo distinto al corte contable.' },
    { id: 'F-PRECAL', fuente: FUENTES.precalificador.fuente, corte: '15-oct-2026', periodo: 'Enero 2025 – 15 octubre 2026', uso: 'Registros del precalificador', estado: estadoDe('F-PRECAL', 'CONFIRMADO'), observacion: '' },
    ...CONFIG.fuentesExternas.map((f) => ({ ...f, estado: estadoDe(f.id, f.estado) })),
  ].map((f) => ({ ...f, observacion: state.observaciones[f.id] ?? f.observacion }));
  const P = CONFIG.presupuesto;
  const movs = CONFIG.movimientos.map((m) => ({ ...m, partidaNombre: m.partida === 'RESERVA' ? 'Reserva no asignada' : nombrePartida(m.partida), estado: estadoDe(m.id, m.estado) }));
  const st = FUENTES.store;
  const ventasAbrAgo = st.porMes.filter((m) => ['Abr', 'May', 'Jun', 'Jul', 'Ago'].includes(m.mes)).reduce((s, m) => s + m.facturacion, 0);
  const ventasSepOct = st.porMes.filter((m) => ['Sep', 'Oct'].includes(m.mes)).reduce((s, m) => s + m.facturacion, 0);
  const tienda = F.rows.find((r) => r.id === '16');
  const conc = [
    ['Capital inicial', money(CONFIG.storeConciliacion.capitalInicial), 'Presupuesto autorizado', 'Ejercicio 2026', 'CONFIRMADO'],
    ['Gasto contable', money(tienda.gastoContable, true), 'Reporte contable', `Ene–${MESES_CORTOS[Number(F.corte.slice(5)) - 1].toLowerCase()} 2026`, 'CONFIRMADO'],
    ['Ingreso de tienda (contable)', money(FUENTES.contable.ingresoTienda.total, true), 'Reporte contable (hoja «vs 2025»)', 'Ene–ago 2026', 'CONFIRMADO'],
    ['Ventas (facturación comercial)', `${money(ventasAbrAgo)} abr–ago · ${money(ventasSepOct)} sep–16 oct`, 'Reporte comercial SOC Store', st.periodo, 'CONFIRMADO'],
    ['Cobranza', 'Sin dato', '—', '—', 'PENDIENTE'],
    ['Inventario', 'Sin dato', '—', '—', 'PENDIENTE'],
    ['Costo de mercancía', 'Sin dato', '—', '—', 'PENDIENTE'],
    ['Reinversión', 'Sin dato', '—', '—', 'PENDIENTE'],
    ['Saldo disponible', 'Sin dato', '—', '—', 'PENDIENTE'],
  ];
  return `
  <div class="mod-head"><div><h2>Conciliación y trazabilidad</h2><p>Fuente y corte de cada dato, movimientos presupuestales, reclasificaciones, diferencias detectadas y validaciones de cuadre. Haz clic en un estado para cambiarlo; los cambios quedan en la bitácora.</p></div>
  <div class="row no-print"><button class="btn" data-act="csv-conciliacion">Exportar CSV</button><button class="btn" data-act="csv-bitacora">Bitácora CSV</button></div></div>
  <div class="grid g2">
    <div class="card"><h3>Validaciones de cuadre</h3><p class="sub">Se recalculan cada vez que cambia la información</p><ul class="checks" data-testid="checks">${val.map((v) => `<li class="${v.na ? 'na' : v.ok ? '' : 'fail'}"><b aria-hidden="true">${v.na ? '–' : v.ok ? '✓' : '✕'}</b><span>${esc(v.t)}</span><span class="small">${esc(v.d)}</span></li>`).join('')}</ul></div>
    <div class="card"><h3>Movimientos presupuestales</h3><p class="sub">Original ${money(P.original)} + ampliación ${money(P.ampliacion)} = ${money(P.total)}</p>
    ${table('movimientos', [{ k: 'id', label: 'ID' }, { k: 'tipo', label: 'Tipo' }, { k: 'partidaNombre', label: 'Partida' }, { k: 'monto', label: 'Monto', num: true, html: (r) => `<span class="${r.monto < 0 ? 'neg' : ''}">${r.monto > 0 ? '+' : ''}${money(r.monto)}</span>` }, { k: 'concepto', label: 'Concepto' }, { k: 'estado', label: 'Estado', html: (r) => badge(r.estado, r.id), text: (r) => ESTADO_TXT[r.estado] }], movs, { total: { tipo: 'Neto', monto: money(movs.reduce((s, m) => s + m.monto, 0)) } })}
    <p class="small muted">Ampliación: ${money(movs.filter((m) => m.tipo === 'Ampliación').reduce((s, m) => s + m.monto, 0))} · transferencias netas: ${money(movs.filter((m) => m.tipo === 'Transferencia').reduce((s, m) => s + m.monto, 0))}. Fecha de cada movimiento: pendiente de registrar.</p></div>
  </div>
  <div class="card section"><h3>Reclasificaciones para el análisis directivo</h3><p class="sub">No se asume que Contabilidad ya las formalizó. No alteran el gasto total.</p>
  ${table('reclas', [{ k: 'id', label: 'ID' }, { k: 'origenNombre', label: 'Origen' }, { k: 'destinoNombre', label: 'Destino' }, { k: 'concepto', label: 'Concepto' }, { k: 'monto', label: 'Monto', num: true, html: (r) => money(r.monto, true) }, { k: 'validacionContable', label: 'Validación contable', html: (r) => `${esc(r.validacionContable)} <button class="btn btn-sm btn-ghost no-print" data-act="obs" data-id="${r.id}-vc" title="Editar">✎</button>` }, { k: 'estado', label: 'Estado', html: (r) => badge(r.estado, r.id), text: (r) => ESTADO_TXT[r.estado] }], F.reclas, { total: { concepto: 'Total reclasificado', monto: money(F.reclas.reduce((s, r) => s + r.monto, 0), true) } })}
  <div class="metric">${['02', '19'].map((id) => { const r = F.rows.find((x) => x.id === id); return `<div><b>${money(r.gastoAjustado, true)}</b><span>${esc(r.nombre)} · ajustado (contable ${money(r.gastoContable, true)})</span></div>`; }).join('')}</div></div>
  <div class="card section"><h3>Diferencias detectadas</h3><p class="sub">Auditoría de la información recibida. Agrega observaciones y cambia el estado al resolverlas.</p>
  ${table('diferencias', [{ k: 'id', label: 'ID' }, { k: 'tema', label: 'Tema' }, { k: 'titulo', label: 'Diferencia', html: (r) => `<b>${esc(r.titulo)}</b><div class="small">${esc(r.detalle)}</div>` }, { k: 'observacion', label: 'Observaciones', html: (r) => `${esc(r.observacion) || '<span class="muted small">—</span>'} <button class="btn btn-sm btn-ghost no-print" data-act="obs" data-id="${r.id}" title="Editar observación">✎</button>` }, { k: 'estado', label: 'Estado', html: (r) => badge(r.estado, r.id), text: (r) => ESTADO_TXT[r.estado] }], diferencias(F))}</div>
  <div class="card section"><h3>SOC Store · conciliación del capital revolvente</h3><p class="sub">No se calcula utilidad, margen ni ROI hasta completar estos conceptos con el mismo periodo</p>
  <div class="tw"><table><thead><tr><th>Concepto</th><th>Dato disponible</th><th>Fuente</th><th>Periodo</th><th>Estado</th></tr></thead><tbody>${conc.map((c) => `<tr data-estado="${c[4]}"><td><b>${c[0]}</b></td><td>${c[1]}</td><td>${c[2]}</td><td>${esc(c[3])}</td><td>${badge(c[4])}</td></tr>`).join('')}</tbody></table></div>
  <p class="small muted">Además: ${num(st.pedidosDescuentoTotal)} pedidos con 100% de descuento y ${num(st.ventasCentroCosto.ventas)} ventas cargadas a «centro de costo» (${money(st.ventasCentroCosto.facturacion)} facturados): consumo interno por confirmar.</p></div>
  <div class="card section"><h3>Fuentes de información</h3>
  ${table('fuentes', [{ k: 'fuente', label: 'Fuente' }, { k: 'corte', label: 'Fecha de corte' }, { k: 'periodo', label: 'Periodo' }, { k: 'uso', label: 'Uso en el dashboard' }, { k: 'observacion', label: 'Observaciones', html: (r) => `${esc(r.observacion) || '<span class="muted small">—</span>'} <button class="btn btn-sm btn-ghost no-print" data-act="obs" data-id="${r.id}" title="Editar observación">✎</button>` }, { k: 'estado', label: 'Estado', html: (r) => badge(r.estado, r.id), text: (r) => ESTADO_TXT[r.estado] }], fuentes)}</div>
  <div class="card section"><h3>Bitácora de cambios</h3><p class="sub">Capturas, cambios de estado, importaciones y restauraciones hechas en este navegador</p>
  ${table('bitacora', [{ k: 'fecha', label: 'Fecha', html: (r) => esc(new Date(r.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })) }, { k: 'accion', label: 'Acción' }, { k: 'detalle', label: 'Detalle' }], state.bitacora, { estado: () => null, empty: 'Sin cambios registrados.' })}</div>`;
}

/* ───────────── Módulo 7 · Decisiones de Dirección ───────────── */
function vDecisiones(F) {
  const temas = alertasFinancieras(F, cierre(F)).filter((a) => a.k !== 'info');
  const cols = [
    { k: 'decision', label: 'Decisión requerida', html: (r) => `<b>${esc(r.decision)}</b>` }, { k: 'motivo', label: 'Motivo' }, { k: 'impacto', label: 'Impacto esperado' },
    { k: 'prioridad', label: 'Prioridad', sort: (r) => ['Alta', 'Media', 'Baja'].indexOf(r.prioridad) }, { k: 'responsable', label: 'Seguimiento' },
    { k: 'fechaLimite', label: 'Fecha límite', html: (r) => `${esc(r.fechaLimite || '—')}${r.fechaLimite && r.fechaLimite < hoy() && !['Resuelta', 'Descartada'].includes(r.estatus) ? ' <span class="chip sem-sobre">Vencida</span>' : ''}` },
    { k: 'estatus', label: 'Estatus' }, { k: 'resolucion', label: 'Resolución' },
    { k: 'estado', label: 'Validación', html: (r) => badge(r.estado, `DE:${r.id}`), text: (r) => ESTADO_TXT[r.estado] },
    { k: 'actions', label: '', nosort: true, html: (r) => `<button class="btn btn-sm" data-act="editar" data-col="decisiones" data-id="${esc(r.id)}">Editar</button> <button class="btn btn-sm btn-danger" data-act="borrar" data-col="decisiones" data-id="${esc(r.id)}">Eliminar</button>` },
  ];
  const abiertas = state.decisiones.filter((d) => !['Resuelta', 'Descartada'].includes(d.estatus)).length;
  return `
  <div class="mod-head"><div><h2>Decisiones de Dirección</h2><p>Espacio editable e independiente. Las decisiones las registra Dirección: el dashboard no genera decisiones automáticas.</p></div>
  <div class="row no-print"><button class="btn btn-primary" data-act="nuevo" data-col="decisiones">+ Registrar decisión</button><button class="btn" data-act="importar-csv" data-col="decisiones">Importar CSV</button><button class="btn" data-act="plantilla" data-col="decisiones">Plantilla CSV</button><button class="btn" data-act="csv" data-col="decisiones">Exportar CSV</button></div></div>
  <section class="kpis">${kpi('Decisiones abiertas', String(abiertas), `${state.decisiones.length} registradas`, 'CONFIRMADO')}${kpi('Vencidas', String(state.decisiones.filter((d) => d.fechaLimite && d.fechaLimite < hoy() && !['Resuelta', 'Descartada'].includes(d.estatus)).length), 'Fecha límite cumplida sin resolver', 'CONFIRMADO')}</section>
  <div class="card">${table('decisiones', cols, state.decisiones, { empty: 'Aún no hay decisiones registradas.' })}</div>
  <div class="card section no-print"><h3>Temas financieros para considerar</h3><p class="sub">Hechos del presupuesto y el reporte contable. Sólo se registran como decisión si Dirección lo indica.</p>
  <ul class="alerts">${temas.map((a, i) => `<li class="${a.k}" data-estado="${a.estado}"><span class="ico" aria-hidden="true">${a.i}</span><div class="row" style="justify-content:space-between"><div><b>${esc(a.t)}</b><div class="small">${esc(a.d)}</div></div><button class="btn btn-sm" data-act="tema-decision" data-i="${i}">Registrar como decisión</button></div></li>`).join('')}</ul></div>`;
}

/* ───────────── Formularios de captura ───────────── */
const PARTIDA_OPTS = () => CONFIG.partidas.map((p) => [p.id, `${p.id} ${p.nombre}`]);
const ESTADO_OPTS = ESTADOS.map((e) => [e, ESTADO_TXT[e]]);
const ESQUEMAS = {
  compromisos: {
    titulo: 'compromiso', etiqueta: 'Compromisos',
    campos: () => [
      { k: 'partida', label: 'Partida', type: 'select', options: PARTIDA_OPTS(), req: true },
      { k: 'mes', label: 'Mes', type: 'select', options: mesesPlaneacion(fin()).map((m) => [m, mesLabel(m)]), req: true },
      { k: 'concepto', label: 'Concepto', req: true, full: true },
      { k: 'tipo', label: 'Tipo', type: 'select', options: [['Comprometido', 'Comprometido (contrato / OC)'], ['Planeado', 'Planeado'], ['Proyecto pendiente', 'Proyecto pendiente']], req: true },
      { k: 'monto', label: 'Monto (MXN)', type: 'number', req: true },
      { k: 'proveedor', label: 'Proveedor' },
      { k: 'responsable', label: 'Responsable de seguimiento' },
      { k: 'estado', label: 'Estado de validación', type: 'select', options: ESTADO_OPTS, req: true, def: 'PROPUESTA' },
      { k: 'notas', label: 'Notas', type: 'textarea', full: true },
    ],
    validar: (o) => {
      const e = {};
      if (!(Number(o.monto) > 0)) e.monto = 'Captura un monto mayor a cero.';
      if (o.mes && !mesesPlaneacion(fin()).includes(o.mes)) e.mes = `Sólo meses posteriores al corte contable (${mesLabel(fin().corte)}).`;
      if (o.partida && !CONFIG.partidas.some((p) => p.id === o.partida)) e.partida = 'Partida inexistente.';
      return e;
    },
  },
  gestion: {
    titulo: 'registro de gestión', etiqueta: 'Gestión por gerencia',
    campos: () => [
      { k: 'gerencia', label: 'Gerencia', type: 'select', options: CONFIG.gerencias.map((g) => [g.id, g.gerencia]), req: true },
      { k: 'responsable', label: 'Responsable' },
      { k: 'proyecto', label: 'Proyecto', req: true }, { k: 'actividad', label: 'Actividad' },
      { k: 'prioridad', label: 'Prioridad', type: 'select', options: [['', '—'], ['P1', 'P1'], ['P2', 'P2'], ['P3', 'P3']] },
      { k: 'prioridadConfirmada', label: '¿Prioridad confirmada por Dirección?', type: 'select', options: [['No', 'No (propuesta)'], ['Sí', 'Sí']], def: 'No' },
      { k: 'avance', label: 'Estado', type: 'select', options: ['Por iniciar', 'En curso', 'En riesgo', 'Bloqueado', 'Terminado'].map((x) => [x, x]), def: 'En curso' },
      { k: 'fecha', label: 'Fecha compromiso', type: 'date' },
      { k: 'bloqueo', label: 'Bloqueo' }, { k: 'dependencia', label: 'Dependencia' },
      { k: 'proximaAccion', label: 'Próxima acción', full: true },
      { k: 'estado', label: 'Validación', type: 'select', options: ESTADO_OPTS, req: true, def: 'PENDIENTE' },
    ],
    validar: (o) => (o.gerencia && !CONFIG.gerencias.some((g) => g.id === o.gerencia) ? { gerencia: 'Gerencia inexistente.' } : {}),
  },
  decisiones: {
    titulo: 'decisión', etiqueta: 'Decisiones',
    campos: () => [
      { k: 'decision', label: 'Decisión requerida', req: true, full: true },
      { k: 'motivo', label: 'Motivo', type: 'textarea', full: true },
      { k: 'impacto', label: 'Impacto esperado', type: 'textarea', full: true },
      { k: 'prioridad', label: 'Prioridad', type: 'select', options: ['Alta', 'Media', 'Baja'].map((x) => [x, x]), def: 'Media', req: true },
      { k: 'responsable', label: 'Responsable de seguimiento' },
      { k: 'fechaLimite', label: 'Fecha límite', type: 'date' },
      { k: 'estatus', label: 'Estatus', type: 'select', options: ['Abierta', 'En análisis', 'Resuelta', 'Descartada'].map((x) => [x, x]), def: 'Abierta', req: true },
      { k: 'resolucion', label: 'Resolución', type: 'textarea', full: true },
      { k: 'estado', label: 'Validación', type: 'select', options: ESTADO_OPTS, req: true, def: 'PROPUESTA' },
    ],
    validar: (o) => (o.estatus === 'Resuelta' && !String(o.resolucion || '').trim() ? { resolucion: 'Describe la resolución.' } : {}),
  },
};
function abrirForm(col, id, preset = {}) {
  const E = ESQUEMAS[col];
  const actual = id ? state[col].find((x) => x.id === id) : null;
  const o = actual ? { ...actual } : { ...Object.fromEntries(E.campos().map((c) => [c.k, c.def ?? ''])), ...preset };
  const campos = E.campos();
  const body = `<form class="form" id="frm" novalidate>${campos.map((c) => {
    const v = o[c.k] ?? '';
    const input = c.type === 'select' ? `<select class="input" name="${c.k}">${c.req && !c.def ? '<option value="">Elige…</option>' : ''}${c.options.map(([val, t]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
      : c.type === 'textarea' ? `<textarea class="input" name="${c.k}">${esc(v)}</textarea>`
      : `<input class="input" name="${c.k}" type="${c.type === 'number' ? 'number' : c.type || 'text'}" ${c.type === 'number' ? 'step="0.01" min="0"' : ''} value="${esc(v)}">`;
    return `<label class="f ${c.full ? 'full' : ''}" data-f="${c.k}">${esc(c.label)}${c.req ? ' *' : ''}${input}<span class="ferr"></span></label>`;
  }).join('')}</form>`;
  dialogo(`${actual ? 'Editar' : 'Nuevo'} ${E.titulo}`, body, [['Cancelar', 'cerrar-dlg', ''], [actual ? 'Guardar cambios' : 'Guardar', 'guardar-form', 'btn-primary']]);
  $('#dlg').dataset.col = col;
  $('#dlg').dataset.id = id || '';
}
function guardarForm() {
  const col = $('#dlg').dataset.col, id = $('#dlg').dataset.id;
  const E = ESQUEMAS[col];
  const fd = new FormData($('#frm'));
  const o = Object.fromEntries(E.campos().map((c) => [c.k, String(fd.get(c.k) ?? '').trim()]));
  const err = {};
  for (const c of E.campos()) if (c.req && !o[c.k]) err[c.k] = 'Campo obligatorio.';
  Object.assign(err, E.validar(o));
  $$('#frm [data-f]').forEach((l) => { const m = err[l.dataset.f]; l.classList.toggle('err', !!m); $('.ferr', l).textContent = m || ''; });
  if (Object.keys(err).length) return;
  if (o.monto !== undefined && o.monto !== '') o.monto = r2(Number(o.monto));
  if (id) {
    const i = state[col].findIndex((x) => x.id === id);
    state[col][i] = { ...state[col][i], ...o, actualizado: new Date().toISOString() };
    log(`Editar ${E.titulo}`, resumenRegistro(col, state[col][i]));
  } else {
    const nuevo = { id: uid(col.slice(0, 3)), ...o, creado: new Date().toISOString() };
    state[col].push(nuevo);
    log(`Capturar ${E.titulo}`, resumenRegistro(col, nuevo));
  }
  save();
  cerrarDlg();
  render();
  toast(id ? 'Cambios guardados' : 'Registro guardado');
}
function resumenRegistro(col, o) {
  if (col === 'compromisos') return `${nombrePartida(o.partida)} · ${mesLabel(o.mes)} · ${o.concepto} · ${money(Number(o.monto))}`;
  if (col === 'gestion') return `${gerenciaNombre(o.gerencia)} · ${o.proyecto}`;
  return `${o.decision} · ${o.estatus}`;
}

/* ───────────── Diálogos, avisos y tooltip ───────────── */
function dialogo(titulo, html, botones) {
  $('#dlg-t').textContent = titulo;
  $('#dlg-b').innerHTML = html;
  $('#dlg-f').innerHTML = botones.map(([t, act, cls]) => `<button class="btn ${cls}" data-act="${act}">${esc(t)}</button>`).join('');
  const d = $('#dlg');
  if (!d.open) d.showModal();
  setTimeout(() => $('#dlg-b input, #dlg-b select, #dlg-b textarea')?.focus(), 30);
}
function cerrarDlg() { const d = $('#dlg'); if (d.open) d.close(); }
let toastT;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = bad ? 'bad' : '';
  t.style.display = 'block';
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.style.display = 'none'), 3200);
}
document.addEventListener('mousemove', (e) => {
  const el = e.target.closest?.('[data-tip]');
  const tip = $('#tip');
  if (!el) { tip.style.display = 'none'; return; }
  tip.textContent = el.getAttribute('data-tip');
  tip.style.display = 'block';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.min(window.innerWidth - w - 8, e.clientX + 14)}px`;
  tip.style.top = `${Math.max(8, e.clientY - h - 12)}px`;
});

/* ───────────── Archivos: respaldo, CSV, Excel ───────────── */
let fileMode = null;
function elegirArchivo(modo, accept) {
  fileMode = modo;
  const f = $('#file');
  f.value = '';
  f.accept = accept;
  f.click();
}
$('#file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    if (fileMode === 'restaurar') restaurar(await file.text(), file.name);
    else if (fileMode === 'contable') previewContable(file.name, leerResumenContable(await readXlsx(await file.arrayBuffer()), file.name));
    else if (fileMode?.startsWith('csv:')) importarCsv(fileMode.slice(4), await file.text(), file.name);
  } catch (err) {
    toast(err.message || 'No se pudo leer el archivo.', true);
  }
});
function respaldar() {
  const data = { app: 'soc-mkt-dashboard-2026', version: 1, exportado: new Date().toISOString(), corteContable: fin().corte, state };
  download(`Respaldo_Dashboard_MKT_SOC_2026_${hoy()}.json`, JSON.stringify(data, null, 1), 'application/json');
  log('Respaldo descargado', `${state.compromisos.length} compromisos · ${state.gestion.length} registros de gestión · ${state.decisiones.length} decisiones`);
  save();
  toast('Respaldo descargado');
}
function restaurar(text, name) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('El archivo no es un respaldo válido (JSON).'); }
  if (data?.app !== 'soc-mkt-dashboard-2026' || typeof data.state !== 'object') throw new Error('El archivo no es un respaldo de este dashboard.');
  const s = data.state;
  for (const k of ['compromisos', 'gestion', 'decisiones', 'bitacora']) if (s[k] !== undefined && !Array.isArray(s[k])) throw new Error(`Respaldo dañado: «${k}» no es una lista.`);
  dialogo('Restaurar respaldo', `<p>Se reemplazará todo lo capturado en este navegador por el respaldo <b>${esc(name)}</b> (${esc(new Date(data.exportado).toLocaleString('es-MX'))}):</p><ul><li>${(s.compromisos || []).length} compromisos</li><li>${(s.gestion || []).length} registros de gestión</li><li>${(s.decisiones || []).length} decisiones</li><li>${s.contable ? `Reporte contable cargado: ${esc(s.contable.fuente)} (corte ${esc(mesLabel(s.contable.corte))})` : 'Reporte contable de origen'}</li></ul><p class="small muted">Recomendación: descarga antes un respaldo de lo actual.</p>`, [['Cancelar', 'cerrar-dlg', ''], ['Restaurar', 'confirmar-restaurar', 'btn-primary']]);
  pendiente = () => {
    const tab = state.tab;
    state = { ...nuevoEstado(), ...s, tab };
    log('Respaldo restaurado', name);
    save();
    render();
    toast('Respaldo restaurado');
  };
}
let pendiente = null;
const CSV_COLS = {
  compromisos: [['partida', 'Partida (01-20)'], ['mes', 'Mes (AAAA-MM)'], ['concepto', 'Concepto'], ['tipo', 'Tipo'], ['monto', 'Monto'], ['proveedor', 'Proveedor'], ['responsable', 'Responsable de seguimiento'], ['estado', 'Estado de validación'], ['notas', 'Notas']],
  gestion: [['gerencia', 'Gerencia (MD, CON, DIS, STORE)'], ['responsable', 'Responsable'], ['proyecto', 'Proyecto'], ['actividad', 'Actividad'], ['prioridad', 'Prioridad'], ['prioridadConfirmada', 'Prioridad confirmada (Sí/No)'], ['avance', 'Estado'], ['fecha', 'Fecha compromiso (AAAA-MM-DD)'], ['bloqueo', 'Bloqueo'], ['dependencia', 'Dependencia'], ['proximaAccion', 'Próxima acción'], ['estado', 'Validación']],
  decisiones: [['decision', 'Decisión requerida'], ['motivo', 'Motivo'], ['impacto', 'Impacto esperado'], ['prioridad', 'Prioridad'], ['responsable', 'Responsable de seguimiento'], ['fechaLimite', 'Fecha límite (AAAA-MM-DD)'], ['estatus', 'Estatus'], ['resolucion', 'Resolución'], ['estado', 'Validación']],
};
function normEstado(v) {
  const n = norm(v);
  if (n.startsWith('confirm')) return 'CONFIRMADO';
  if (n.startsWith('propuest')) return 'PROPUESTA';
  return 'PENDIENTE';
}
function importarCsv(col, text, name) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('El CSV no tiene registros.');
  const hdr = rows[0].map(norm);
  const map = CSV_COLS[col].map(([k, t]) => [k, hdr.findIndex((h) => h === norm(t) || h === norm(t.replace(/\s*\(.*\)$/, '')) || h === norm(k))]);
  const faltan = map.filter(([, i]) => i < 0).map(([k]) => CSV_COLS[col].find((c) => c[0] === k)[1]);
  const E = ESQUEMAS[col];
  const req = E.campos().filter((c) => c.req).map((c) => c.k);
  const buenos = [], malos = [];
  rows.slice(1).forEach((r, n) => {
    const o = Object.fromEntries(map.map(([k, i]) => [k, i >= 0 ? String(r[i] ?? '').trim() : '']));
    o.estado = normEstado(o.estado);
    if (col === 'compromisos') { o.partida = o.partida.padStart(2, '0').slice(0, 2); o.monto = Number(String(o.monto).replace(/[$,\s]/g, '')); if (!o.tipo) o.tipo = 'Planeado'; }
    if (col === 'gestion') { const g = CONFIG.gerencias.find((x) => norm(x.id) === norm(o.gerencia) || norm(x.gerencia) === norm(o.gerencia)); if (g) o.gerencia = g.id; if (!o.prioridadConfirmada) o.prioridadConfirmada = 'No'; }
    if (col === 'decisiones') { if (!o.estatus) o.estatus = 'Abierta'; if (!o.prioridad) o.prioridad = 'Media'; }
    const err = { ...Object.fromEntries(req.filter((k) => o[k] === '' || o[k] === undefined || Number.isNaN(o[k])).map((k) => [k, 'obligatorio'])), ...E.validar(o) };
    if (Object.keys(err).length) malos.push(`Fila ${n + 2}: ${Object.entries(err).map(([k, m]) => `${k} ${m}`).join('; ')}`);
    else buenos.push({ id: uid(col.slice(0, 3)), ...o, creado: new Date().toISOString(), origen: name });
  });
  dialogo(`Importar ${E.etiqueta.toLowerCase()} desde CSV`, `<p><b>${buenos.length}</b> registros válidos y <b>${malos.length}</b> con errores en <b>${esc(name)}</b>.</p>${faltan.length ? `<div class="note warn small">Columnas no encontradas (quedan vacías): ${esc(faltan.join(', '))}</div>` : ''}${malos.length ? `<div class="note bad small" style="margin-top:8px">${malos.slice(0, 12).map(esc).join('<br>')}${malos.length > 12 ? '<br>…' : ''}</div>` : ''}<p class="small muted">Los registros sin estado válido se cargan como «Pendiente de validación». Se agregan a los existentes (no los reemplazan).</p>`, [['Cancelar', 'cerrar-dlg', ''], [`Agregar ${buenos.length} registros`, 'confirmar-importar', 'btn-primary']]);
  pendiente = () => {
    if (!buenos.length) return;
    state[col].push(...buenos);
    log(`Importar CSV · ${E.etiqueta}`, `${buenos.length} registros de ${name}`);
    save();
    render();
    toast(`${buenos.length} ${buenos.length === 1 ? "registro importado" : "registros importados"}`);
  };
}
function previewContable(name, nuevo) {
  const actual = contable();
  const sumaCat = r2(nuevo.categorias.reduce((s, c) => s + c.total, 0));
  const cuadra = Math.abs(sumaCat - nuevo.total) < 0.01;
  const filas = nuevo.categorias.map((c) => {
    const pid = partidaDeCategoria(c.nombre);
    return `<tr><td>${esc(c.nombre)}</td><td class="num">${money(c.total, true)}</td><td><select class="input" data-map="${esc(norm(c.nombre))}"><option value="">Sin partida (requiere decisión)</option>${CONFIG.partidas.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${p.id} ${esc(p.nombre)}</option>`).join('')}</select></td></tr>`;
  }).join('');
  dialogo('Actualizar reporte contable', `
    <p>Archivo <b>${esc(name)}</b> · hoja ${esc(nuevo.hoja)} · <b>corte detectado: ${esc(mesLabel(nuevo.corte))}</b> (${nuevo.meses.length} meses con gasto).</p>
    <div class="metric"><div><b>${money(nuevo.total, true)}</b><span>Total del reporte</span></div><div><b>${money(sumaCat, true)}</b><span>Suma de categorías</span></div><div><b>${money(r2(nuevo.total - actual.total), true)}</b><span>Cambio vs. corte actual</span></div></div>
    ${cuadra ? '<div class="note ok small">✓ Las categorías cuadran con el total del reporte.</div>' : '<div class="note bad small">✕ Las categorías no cuadran con el total: revisa el archivo antes de aplicar.</div>'}
    <p class="small">Revisa a qué partida corresponde cada categoría contable. Content Marketing se deja sin partida: la reclasificación R2 la asigna a Branding de la Red.</p>
    <div class="tw"><table><thead><tr><th>Categoría contable</th><th class="num">Gasto</th><th>Partida</th></tr></thead><tbody>${filas}</tbody></table></div>`, [['Cancelar', 'cerrar-dlg', ''], ['Aplicar reporte', 'confirmar-contable', 'btn-primary']]);
  pendiente = () => {
    if (!cuadra) { toast('El reporte no cuadra: no se aplicó.', true); return; }
    const mapeo = {};
    $$('#dlg [data-map]').forEach((s) => { mapeo[s.dataset.map] = s.value || ''; });
    state.mapeo = mapeo;
    state.contable = nuevo;
    log('Reporte contable actualizado', `${name} · corte ${mesLabel(nuevo.corte)} · ${money(nuevo.total, true)}`);
    save();
    render();
    toast(`Corte contable actualizado a ${mesLabel(nuevo.corte)}`);
  };
}
function exportar(tipo) {
  const F = fin();
  const est = (e) => ESTADO_TXT[e] || e;
  if (tipo === 'partidas') {
    const rows = F.rows.map((r) => [r.id, r.nombre, r.original, r.movimientos, r.autorizado, r.gastoContable, r.ajuste, r.gastoAjustado, r.disponible, r2(r.pct * 100), r.sem.t, est(r.estado), r.categorias.join(' | '), r.reclas.join(' | ')]);
    F.sinPartida.forEach((s) => rows.push(['—', `Sin partida: ${s.nombre}`, 0, 0, 0, s.total, s.ajuste, r2(s.total + s.ajuste), '', '', '', s.ajuste ? est('PENDIENTE') : est('CONFIRMADO'), s.nombre, '']));
    const movRes = CONFIG.movimientos.filter((m) => m.partida === 'RESERVA').reduce((s, m) => s + m.monto, 0);
    rows.push(['', 'Reserva no asignada', CONFIG.presupuesto.reserva - movRes, movRes, CONFIG.presupuesto.reserva, 0, 0, 0, CONFIG.presupuesto.reserva, 0, '', est('CONFIRMADO'), '', '']);
    rows.push(['', 'TOTAL', CONFIG.presupuesto.original, CONFIG.presupuesto.ampliacion, CONFIG.presupuesto.total, F.tot.gastoContable, F.tot.ajuste, F.tot.gastoAjustado, F.tot.disponible, r2((F.tot.gastoAjustado / CONFIG.presupuesto.total) * 100), '', '', '', '']);
    download(`Presupuesto_Ejecucion_corte_${F.corte}.csv`, csv(['#', 'Partida', 'Presupuesto original', 'Movimientos', 'Autorizado', 'Gasto contable', 'Reclasificación', 'Gasto ajustado', 'Disponible', '% ejecución', 'Semáforo', 'Validación', 'Categorías contables', 'Reclasificaciones'], rows));
  } else if (tipo === 'kpi') {
    const fr = FUENTES.franquicias.total, sl = FUENTES.socleads, K = CONFIG.kpisManuales, pc = FUENTES.precalificador, st = FUENTES.store;
    const R = Object.fromEntries(kpiRegistros().map((r) => [r.id, r]));
    const L = (id, ind, v, unidad) => [R[id].titulo, ind, v, unidad, R[id].periodo, R[id].fuente, est(R[id].estado)];
    const rows = [
      L('K-FRAN', 'Inversión reportada', fr.inversion, 'MXN'), L('K-FRAN', 'Leads', fr.leads, 'leads'), L('K-FRAN', 'MQL', fr.mql, 'MQL'), L('K-FRAN', 'SQL', fr.sql, 'SQL'), L('K-FRAN', 'Cierres', fr.cierres, 'cierres'),
      L('K-FRAN', 'Costo por lead', r2(fr.inversion / fr.leads), 'MXN'), L('K-FRAN', 'Costo por MQL', r2(fr.inversion / fr.mql), 'MXN'), L('K-FRAN', 'Costo por SQL', r2(fr.inversion / fr.sql), 'MXN'), L('K-FRAN', 'Costo por cierre', r2(fr.inversion / fr.cierres), 'MXN'),
      L('K-FRAN', 'Conversión lead-MQL', r2((fr.mql / fr.leads) * 100), '%'), L('K-FRAN', 'Conversión MQL-SQL', r2((fr.sql / fr.mql) * 100), '%'), L('K-FRAN', 'Conversión SQL-cierre', r2((fr.cierres / fr.sql) * 100), '%'),
      L('K-SOCL', 'Oficinas participantes', sl.oficinas, 'oficinas'), L('K-SOCL', 'Leads', sl.leads, 'leads'), L('K-SOCL', 'Sin gestionar', sl.sinGestionar, 'leads'), L('K-SOCL', '% sin gestionar', r2((sl.sinGestionar / sl.leads) * 100), '%'), L('K-SOCL', 'En proceso', sl.enProceso, 'leads'), L('K-SOCL', 'Contactados', sl.contactados, 'leads'), L('K-SOCL', 'Perdidos', sl.perdidos, 'leads'),
      L('K-SOCTV', 'Visualizaciones', K.socTv.vistas, 'vistas'), L('K-SOCTV', 'Crecimiento interanual', r2(K.socTv.crecimiento * 100), '%'),
      L('K-PLAT', 'Descargas', K.plataforma.descargas, 'descargas'), L('K-PLAT', 'Solicitudes', K.plataforma.solicitudes, 'solicitudes'), L('K-PLAT', 'Oficinas activas', K.plataforma.oficinasActivas, 'oficinas'),
      L('K-PRECAL', 'Registros históricos', pc.historico, 'registros'), L('K-PRECAL', 'Registros 2025', pc.total2025, 'registros'), L('K-PRECAL', 'Registros 2026 (al 15-oct)', pc.total2026, 'registros'), L('K-PRECAL', 'Sin zona asignada (histórico)', pc.sinZona, 'registros'),
      ...K.branding.lineas.map((l) => L('K-BRAND', `${l.linea}: oficinas con branding`, `${l.logradas}/${l.universo}`, `${r2((l.logradas / l.universo) * 100)}%`)),
      L('K-STORE', 'Transacciones', st.transacciones, 'ventas'), L('K-STORE', 'Facturado', st.facturado, 'MXN'), L('K-STORE', 'Unidades', st.unidades, 'unidades'), L('K-STORE', 'Ticket promedio', st.ticketPromedio, 'MXN'), L('K-STORE', 'Ticket mediano', st.ticketMediano, 'MXN'), L('K-STORE', 'Pedidos con 100% de descuento', st.pedidosDescuentoTotal, 'pedidos'),
    ];
    download('Resultados_KPI_2026.csv', csv(['Iniciativa', 'Indicador', 'Valor', 'Unidad', 'Periodo', 'Fuente', 'Validación'], rows));
  } else if (tipo === 'conciliacion') {
    const rows = [
      ...CONFIG.movimientos.map((m) => ['Movimiento presupuestal', m.id, m.concepto, m.monto, '', est(estadoDe(m.id, m.estado)), state.observaciones[m.id] || '']),
      ...F.reclas.map((r) => ['Reclasificación', r.id, `${r.origenNombre} → ${r.destinoNombre}: ${r.concepto}`, r.monto, r.validacionContable, est(r.estado), state.observaciones[r.id] || '']),
      ...diferencias(F).map((d) => ['Diferencia', d.id, `${d.titulo}. ${d.detalle}`, '', d.tema, est(d.estado), d.observacion]),
      ...validaciones(F).map((v, i) => ['Validación de cuadre', `V${String(i + 1).padStart(2, '0')}`, v.t, '', v.d, v.na ? 'N/A' : v.ok ? 'OK' : 'FALLA', '']),
    ];
    download(`Conciliacion_corte_${F.corte}.csv`, csv(['Tipo', 'ID', 'Descripción', 'Monto', 'Detalle', 'Estado', 'Observaciones'], rows));
  } else if (tipo === 'bitacora') {
    download('Bitacora_dashboard.csv', csv(['Fecha', 'Acción', 'Detalle'], state.bitacora.map((b) => [b.fecha, b.accion, b.detalle])));
  } else if (CSV_COLS[tipo]) {
    const cols = CSV_COLS[tipo];
    download(`${ESQUEMAS[tipo].etiqueta.replace(/\s+/g, '_')}_${hoy()}.csv`, csv(cols.map((c) => c[1]), state[tipo].map((o) => cols.map(([k]) => (k === 'estado' ? est(o[k]) : o[k])))));
  }
}
function plantilla(col) {
  const ej = {
    compromisos: [['04', `${CONFIG.anio}-10`, 'Pauta campaña cierre de año', 'Comprometido', '120000', 'Proveedor ejemplo', 'Marketing Digital', 'Propuesta', 'Ejemplo: borra esta fila']],
    gestion: [['MD', 'Nombre del responsable', 'Proyecto ejemplo', 'Actividad ejemplo', 'P2', 'No', 'En curso', `${CONFIG.anio}-11-15`, '', '', 'Siguiente paso', 'Pendiente']],
    decisiones: [['Decisión ejemplo', 'Motivo', 'Impacto esperado', 'Media', 'Responsable', `${CONFIG.anio}-11-30`, 'Abierta', '', 'Propuesta']],
  }[col];
  download(`Plantilla_${ESQUEMAS[col].etiqueta.replace(/\s+/g, '_')}.csv`, csv(CSV_COLS[col].map((c) => c[1]), ej));
}

/* ───────────── Cambio de estado y observaciones ───────────── */
function cambiarEstado(id) {
  const [pref, rid] = id.includes(':') ? id.split(':') : [null, id];
  let actual;
  if (pref === 'C') actual = state.compromisos.find((x) => x.id === rid)?.estado;
  else if (pref === 'GE') actual = state.gestion.find((x) => x.id === rid)?.estado;
  else if (pref === 'DE') actual = state.decisiones.find((x) => x.id === rid)?.estado;
  else actual = $(`[data-act="estado"][data-id="${CSS.escape(id)}"] .badge`)?.className.match(/st-(\w+)/)?.[1];
  dialogo('Cambiar estado de validación', `<p class="small muted">Registro: ${esc(rid)}</p><div class="form"><label class="f">Nuevo estado<select class="input" id="nuevo-estado">${ESTADOS.map((e) => `<option value="${e}" ${e === actual ? 'selected' : ''}>${ESTADO_TXT[e]}</option>`).join('')}</select></label><label class="f full">Motivo / respaldo *<input class="input" id="motivo-estado" placeholder="Ej. Confirmado por Contabilidad el 20-oct"><span class="ferr" id="err-estado"></span></label></div>`, [['Cancelar', 'cerrar-dlg', ''], ['Guardar estado', 'confirmar-estado', 'btn-primary']]);
  pendiente = () => {
    const nuevo = $('#nuevo-estado').value, motivo = $('#motivo-estado').value.trim();
    if (!motivo) { $('#err-estado').textContent = 'Indica el motivo o respaldo del cambio.'; return false; }
    if (pref === 'C') state.compromisos.find((x) => x.id === rid).estado = nuevo;
    else if (pref === 'GE') state.gestion.find((x) => x.id === rid).estado = nuevo;
    else if (pref === 'DE') state.decisiones.find((x) => x.id === rid).estado = nuevo;
    else state.estados[rid] = nuevo;
    log('Cambio de estado', `${rid}: ${ESTADO_TXT[actual] || '—'} → ${ESTADO_TXT[nuevo]} · ${motivo}`);
    save();
    render();
    toast('Estado actualizado');
  };
}
function editarObs(id) {
  dialogo('Observaciones', `<label class="f">Observación<textarea class="input" id="obs-txt">${esc(state.observaciones[id] || '')}</textarea></label>`, [['Cancelar', 'cerrar-dlg', ''], ['Guardar', 'confirmar-obs', 'btn-primary']]);
  pendiente = () => {
    const t = $('#obs-txt').value.trim();
    if (t) state.observaciones[id] = t; else delete state.observaciones[id];
    log('Observación', `${id}: ${t || '(borrada)'}`);
    save();
    render();
  };
}
function detallePartida(id) {
  const F = fin();
  const r = F.rows.find((x) => x.id === id);
  if (!r) return;
  const meses = F.c.meses.map((m) => MESES_CORTOS[Number(m.slice(5)) - 1]);
  const movs = CONFIG.movimientos.filter((m) => m.partida === id);
  dialogo(`${r.id} · ${r.nombre}`, `
    <div class="metric"><div><b>${money(r.autorizado)}</b><span>Autorizado</span></div><div><b>${money(r.gastoContable, true)}</b><span>Gasto contable</span></div><div><b>${money(r.gastoAjustado, true)}</b><span>Gasto ajustado</span></div><div><b>${money(r.disponible, true)}</b><span>Disponible</span></div></div>
    <p class="sub">Gasto contable mensual (${esc(r.categorias.join(', ') || 'sin categoría con gasto')})${r.ajuste ? '. Las reclasificaciones no tienen detalle mensual: se muestran sólo en el total.' : ''}</p>
    ${colChart({ labels: meses, values: r.mensual, height: 200 })}
    <div class="tw"><table><thead><tr>${meses.map((m) => `<th class="num">${m}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody><tr>${r.mensual.map((v) => `<td class="num">${money(v)}</td>`).join('')}<td class="num"><b>${money(r.gastoContable, true)}</b></td></tr></tbody></table></div>
    ${movs.length ? `<p class="small"><b>Movimientos:</b> ${movs.map((m) => `${esc(m.concepto)} (${m.monto > 0 ? '+' : ''}${money(m.monto)})`).join(' · ')}</p>` : ''}
    <p class="small muted">${semChip(r.sem)} · original ${money(r.original)}</p>`, [['Cerrar', 'cerrar-dlg', '']]);
}
function ayuda() {
  dialogo('Ayuda · cómo funciona este dashboard', `
    <h3 style="font-size:15px">Guardado</h3>
    <ul class="small"><li>Lo que capturas (compromisos, gestión, decisiones, estados y observaciones) se guarda <b>sólo en este navegador y en esta computadora</b> (almacenamiento local).</li>
    <li><b>No se sincroniza</b> con otras computadoras ni personas. Para compartir o cambiar de equipo: <b>Respaldar</b> (descarga un JSON) y en el otro equipo <b>Restaurar</b>.</li>
    <li>Se pierde si se borran los datos del navegador, en ventanas privadas o si el navegador bloquea el almacenamiento (verás un aviso rojo arriba a la derecha). Descarga un respaldo al terminar cada reunión.</li>
    <li>Las cifras de origen (presupuesto, contable, KPI) vienen dentro del archivo y no se pierden.</li></ul>
    <h3 style="font-size:15px">Actualización mensual</h3>
    <ul class="small"><li><b>Actualizar contable</b>: carga el Excel del ejercicio presupuestal (hoja RESUMEN). Se valida el cuadre, se revisa la partida de cada categoría y cambia el corte oficial.</li>
    <li>Los compromisos de meses que ya tienen gasto real dejan de contarse en la planeación.</li></ul>
    <h3 style="font-size:15px">Estados de validación</h3>
    <ul class="small"><li>${badge('CONFIRMADO')} información validada y respaldada.</li><li>${badge('PENDIENTE')} disponible, requiere confirmación.</li><li>${badge('PROPUESTA')} sugerida para planeación o análisis.</li><li>Haz clic en un estado para cambiarlo (pide motivo y queda en la bitácora). Usa el filtro superior para ver sólo un estado.</li></ul>
    <h3 style="font-size:15px">Independencia de módulos</h3>
    <p class="small">Por instrucción de Dirección, presupuesto, resultados, gestión por gerencia y decisiones no se vinculan automáticamente ni se calcula ROI por gerencia.</p>
    <p class="small muted">Datos de origen generados: ${esc(FUENTES.generado)}.</p>`, [['Cerrar', 'cerrar-dlg', '']]);
}

/* ───────────── Eventos ───────────── */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-filtro],[data-act],[data-sort],[data-row]');
  if (!t) return;
  if (t.dataset.tab && !t.dataset.act) { state.tab = t.dataset.tab; save(); render(); $('#view').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.filtro && !t.dataset.act) { state.filtro = t.dataset.filtro; save(); render(); return; }
  if (t.dataset.sort) { const [id, k] = t.dataset.sort.split(':'); const s = sortState[id]; sortState[id] = s && s.k === k ? { k, dir: -s.dir } : { k, dir: 1 }; render(); return; }
  const act = t.dataset.act;
  if (!act && t.dataset.row) { const [tid, rid] = t.dataset.row.split(':'); if (tid === 'partidas') detallePartida(rid); return; }
  switch (act) {
    case 'estado': e.stopPropagation(); cambiarEstado(t.dataset.id); break;
    case 'obs': editarObs(t.dataset.id); break;
    case 'nuevo': abrirForm(t.dataset.col); break;
    case 'editar': abrirForm(t.dataset.col, t.dataset.id); break;
    case 'borrar': {
      const col = t.dataset.col, id = t.dataset.id, o = state[col].find((x) => x.id === id);
      dialogo('Eliminar registro', `<p>¿Eliminar <b>${esc(resumenRegistro(col, o))}</b>? Queda constancia en la bitácora.</p>`, [['Cancelar', 'cerrar-dlg', ''], ['Eliminar', 'confirmar-borrar', 'btn-primary']]);
      pendiente = () => { state[col] = state[col].filter((x) => x.id !== id); log(`Eliminar ${ESQUEMAS[col].titulo}`, resumenRegistro(col, o)); save(); render(); toast('Registro eliminado'); };
      break;
    }
    case 'guardar-form': guardarForm(); break;
    case 'cerrar-dlg': cerrarDlg(); break;
    case 'confirmar-restaurar': case 'confirmar-importar': case 'confirmar-contable': case 'confirmar-estado': case 'confirmar-obs': case 'confirmar-borrar': {
      const fn = pendiente;
      const r = fn ? fn() : undefined;
      if (r !== false) { pendiente = null; cerrarDlg(); }
      break;
    }
    case 'respaldar': respaldar(); break;
    case 'restaurar': elegirArchivo('restaurar', '.json,application/json'); break;
    case 'importar-contable': elegirArchivo('contable', '.xlsx'); break;
    case 'importar-csv': elegirArchivo(`csv:${t.dataset.col}`, '.csv,text/csv'); break;
    case 'plantilla': plantilla(t.dataset.col); break;
    case 'csv': exportar(t.dataset.col); break;
    case 'csv-partidas': exportar('partidas'); break;
    case 'csv-kpi': exportar('kpi'); break;
    case 'csv-conciliacion': exportar('conciliacion'); break;
    case 'csv-bitacora': exportar('bitacora'); break;
    case 'imprimir': window.print(); break;
    case 'ayuda': ayuda(); break;
    case 'tema-decision': {
      const F = fin();
      const a = alertasFinancieras(F, cierre(F)).filter((x) => x.k !== 'info')[Number(t.dataset.i)];
      abrirForm('decisiones', null, { decision: `Definir acción: ${a.t}`, motivo: a.d, estado: 'PROPUESTA' });
      break;
    }
    default: break;
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act === 'sem-filtro') { semFiltro = t.value; render(); }
  if (t.dataset.act === 'solo-confirmados') { state.soloConfirmados = t.checked; save(); render(); }
});
let qT;
$('#q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(render, 150); });
$('#dlg').addEventListener('close', () => { pendiente = null; });

render();
