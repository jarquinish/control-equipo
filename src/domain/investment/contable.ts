import type { WorkbookData } from '../../data/xlsx';

/**
 * Lee el reporte contable mensual (hoja RESUMEN, encabezado «REPORTE MKT»): una
 * fila por categoría contable, una columna por mes y el total del año. Valida el
 * cuadre antes de usarlo; si no cuadra, no se carga nada.
 */
export interface ContableReport {
  hoja: string;
  anio: number;
  meses: string[];
  corte: string;
  categorias: { nombre: string; mensual: number[]; total: number }[];
  total: number;
}

/** Minúsculas, sin acentos ni signos, espacios simples (conserva números y años). */
export function normText(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseContable(wb: WorkbookData, anio: number): ContableReport {
  const sheet = wb.sheets.find((s) => normText(s.name) === 'resumen');
  if (!sheet) throw new Error('No encontré la hoja «RESUMEN» en el archivo.');
  const rows = sheet.rows;
  const hi = rows.findIndex((r) => r && normText(r[0]) === 'reporte mkt');
  if (hi < 0) throw new Error('La hoja RESUMEN no tiene el encabezado «REPORTE MKT».');
  const hdr = rows[hi];
  const meses: { col: number; mes: string }[] = [];
  let totalCol = -1;
  for (let j = 1; j < hdr.length; j++) {
    const h = normText(hdr[j]);
    const m = MESES.findIndex((x) => x === h || (h.length >= 3 && x.startsWith(h.slice(0, 3)) && h.length <= x.length));
    if (m >= 0 && h) meses.push({ col: j, mes: `${anio}-${String(m + 1).padStart(2, '0')}` });
    else if (h === String(anio) || h === 'total') {
      totalCol = j;
      break;
    }
  }
  if (!meses.length || totalCol < 0) throw new Error('No reconocí las columnas de meses y total en RESUMEN.');
  const categorias: ContableReport['categorias'] = [];
  let total: number | null = null;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[0] === null || r[0] === undefined || r[0] === '') continue;
    if (normText(r[0]) === String(anio) || normText(r[0]) === 'total') {
      total = r2(Number(r[totalCol]) || 0);
      break;
    }
    const mensual = meses.map((m) => r2(Number(r[m.col]) || 0));
    const nombre = String(r[0]).trim();
    const t = r2(Number(r[totalCol]) || 0);
    if (Math.abs(mensual.reduce((s, v) => s + v, 0) - t) > 0.01) throw new Error(`La categoría «${nombre}» no cuadra: la suma de sus meses no es igual a su total.`);
    categorias.push({ nombre, mensual, total: t });
  }
  if (total === null) throw new Error(`No encontré la fila de total (${anio}) en RESUMEN.`);
  const suma = r2(categorias.reduce((s, c) => s + c.total, 0));
  if (Math.abs(suma - total) > 0.01) throw new Error(`Las categorías suman ${suma} y el total del reporte es ${total}: no cuadra.`);
  let ultimo = -1;
  meses.forEach((_, i) => {
    if (categorias.some((c) => c.mensual[i] !== 0)) ultimo = i;
  });
  if (ultimo < 0) throw new Error('El reporte no tiene gasto registrado.');
  const usados = meses.slice(0, ultimo + 1);
  return {
    hoja: sheet.name,
    anio,
    meses: usados.map((m) => m.mes),
    corte: usados[usados.length - 1].mes,
    categorias: categorias.map((c) => ({
      ...c,
      mensual: c.mensual.slice(0, usados.length),
    })),
    total,
  };
}
