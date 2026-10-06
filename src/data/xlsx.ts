import { strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Lectura y escritura mínima de archivos .xlsx (Office Open XML) sin
 * dependencias pesadas: sólo descompresión zip (fflate) y XML regular.
 * Suficiente para tablas de captura: texto, números, fechas y listas
 * desplegables. No interpreta fórmulas (usa el último valor calculado).
 */

export type CellValue = string | number | boolean | null;

export interface SheetData {
  name: string;
  /** Filas (índice 0 = fila 1 de Excel); cada fila es un arreglo por columna (0 = A). */
  rows: CellValue[][];
}

export interface WorkbookData {
  sheets: SheetData[];
  /** Fechas con sistema 1904 (Excel antiguo de Mac). */
  date1904: boolean;
}

/* ───────────── Utilidades ───────────── */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : undefined;
}

/** Texto de un nodo con corridas de formato (<r><t>…</t></r>), sin guías fonéticas. */
function richText(xml: string): string {
  const clean = xml.replace(/<(?:[\w.-]+:)?rPh\b[\s\S]*?<\/(?:[\w.-]+:)?rPh>/g, '');
  let out = '';
  const re = /<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>|<(?:[\w.-]+:)?t(?:\s[^>]*)?\/>/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) out += m[1] ? decode(m[1]) : '';
  return out;
}

/** "A" → 0, "AB" → 27. */
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function colLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `xl/${target}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}

/* ───────────── Lectura ───────────── */

export class XlsxError extends Error {}

export function readXlsx(data: ArrayBuffer | Uint8Array): WorkbookData {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
  } catch {
    throw new XlsxError('El archivo no es un Excel (.xlsx) válido.');
  }
  const text = (path: string) => {
    const f = files[path];
    return f ? new TextDecoder('utf-8').decode(f) : '';
  };
  const workbook = text('xl/workbook.xml');
  if (!workbook) throw new XlsxError('El archivo no es un Excel (.xlsx) válido.');

  const shared: string[] = [];
  const sst = text('xl/sharedStrings.xml');
  for (const m of sst.matchAll(/<(?:[\w.-]+:)?si>([\s\S]*?)<\/(?:[\w.-]+:)?si>|<(?:[\w.-]+:)?si\s*\/>/g)) shared.push(m[1] ? richText(m[1]) : '');

  const rels = new Map<string, string>();
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) rels.set(id, resolveTarget(target));
  }

  const pr = /<(?:[\w.-]+:)?workbookPr\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const date1904 = ['1', 'true'].includes(attr(pr, 'date1904') ?? '');

  const sheets: SheetData[] = [];
  for (const m of workbook.matchAll(/<(?:[\w.-]+:)?sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name') ?? `Hoja ${sheets.length + 1}`;
    const rid = attr(m[0], 'r:id');
    const path = rid ? rels.get(rid) : undefined;
    if (!path || !files[path]) continue;
    sheets.push({ name, rows: parseSheet(text(path), shared) });
  }
  return { sheets, date1904 };
}

function parseSheet(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  const cellRe = /<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;
  for (const rowMatch of xml.matchAll(/<(?:[\w.-]+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?row>)/g)) {
    const r = Number(attr(rowMatch[1], 'r')) || rows.length + 1;
    const body = rowMatch[2] ?? '';
    const row: CellValue[] = [];
    let next = 0;
    for (const c of body.matchAll(cellRe)) {
      const ref = attr(c[1], 'r');
      const col = ref ? colIndex(ref.replace(/\d+/g, '')) : next;
      next = col + 1;
      const t = attr(c[1], 't');
      const inner = c[2] ?? '';
      const v = /<(?:[\w.-]+:)?v>([\s\S]*?)<\/(?:[\w.-]+:)?v>/.exec(inner)?.[1];
      let value: CellValue = null;
      if (t === 's') value = v !== undefined ? (shared[Number(v)] ?? '') : null;
      else if (t === 'inlineStr') value = richText(/<(?:[\w.-]+:)?is>([\s\S]*?)<\/(?:[\w.-]+:)?is>/.exec(inner)?.[1] ?? '');
      else if (t === 'str' || t === 'e') value = v !== undefined ? decode(v) : null;
      else if (t === 'b') value = v === '1';
      else if (v !== undefined && v !== '') value = Number(v);
      if (typeof value === 'string' && value.trim() === '') value = null;
      row[col] = value;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[r - 1] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** Número de serie de Excel → fecha ISO (AAAA-MM-DD) y hora (HH:MM, si trae fracción). */
export function excelSerialToDate(serial: number, date1904 = false): { date: string; time?: string } | undefined {
  if (!Number.isFinite(serial) || serial < 1) return undefined;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = base + Math.round(serial * 86400) * 1000;
  const d = new Date(ms);
  const date = d.toISOString().slice(0, 10);
  const frac = serial % 1;
  return { date, time: frac > 0 ? excelFractionToTime(frac) : undefined };
}

export function excelFractionToTime(frac: number): string {
  const mins = Math.round((frac % 1) * 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/* ───────────── Escritura ───────────── */

export interface WriteCell {
  v: string | number | null;
  /** Estilo: 0 normal, 1 encabezado, 2 título, 3 texto ajustado, 4 nota. */
  s?: 0 | 1 | 2 | 3 | 4;
}

export interface WriteSheet {
  name: string;
  rows: (WriteCell | string | number | null)[][];
  /** Anchos de columna (caracteres). */
  widths?: number[];
  /** Listas desplegables: rango (p. ej. "C5:C300") y opciones. */
  lists?: { range: string; options: string[] }[];
  /** Combina celdas, p. ej. "A1:F1". */
  merges?: string[];
  /** Congela filas superiores (la fila de encabezados queda visible). */
  freezeRows?: number;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF006D4E"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF006D4E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(s: WriteSheet): string {
  const rows = s.rows
    .map((row, ri) => {
      const cells = row
        .map((raw, ci) => {
          if (raw === null || raw === undefined) return '';
          const cell: WriteCell = typeof raw === 'object' ? raw : { v: raw };
          if (cell.v === null || cell.v === '') return cell.s ? `<c r="${colLetter(ci)}${ri + 1}" s="${cell.s}"/>` : '';
          const ref = `${colLetter(ci)}${ri + 1}`;
          const st = cell.s ? ` s="${cell.s}"` : '';
          if (typeof cell.v === 'number') return `<c r="${ref}"${st}><v>${cell.v}</v></c>`;
          return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${escape(cell.v)}</t></is></c>`;
        })
        .join('');
      return cells ? `<row r="${ri + 1}">${cells}</row>` : '';
    })
    .join('');
  const freeze = s.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${s.freezeRows}" topLeftCell="A${s.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';
  const cols = s.widths?.length ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const merges = s.merges?.length ? `<mergeCells count="${s.merges.length}">${s.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const lists = s.lists?.length
    ? `<dataValidations count="${s.lists.length}">${s.lists
        .map(
          (l) =>
            `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="warning" sqref="${l.range}"><formula1>${escape(`"${l.options.join(',')}"`)}</formula1></dataValidation>`,
        )
        .join('')}</dataValidations>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols}<sheetData>${rows}</sheetData>${merges}${lists}</worksheet>`;
}

/** Genera un .xlsx con texto, números, estilos básicos y listas desplegables. */
export function writeXlsx(sheets: WriteSheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const add = (path: string, content: string) => (files[path] = strToU8(content));
  add(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`,
  );
  add(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${escape(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  add(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  add('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zipSync(files);
}
