import { excelFractionToTime, excelSerialToDate, type CellValue, type WorkbookData } from '../data/xlsx';
import { DEFAULT_STATUS_LABELS, DEPENDENCY_LABELS, DIRECCION, IMPACT_LABELS, URGENCY_LABELS } from './constants';
import { isValidDate, isValidTime } from './dates';
import { computePriority } from './scoring';
import { getSettings, isActiveProject } from './selectors';
import type { DbData, Level, Priority, ProjectStatus, Role } from './types';

/**
 * Importación del inventario de proyectos desde Excel (una hoja por área).
 *
 * 1. `parseInventory` lee el libro y entiende cada fila (tipo, estado,
 *    ponderación, personas, fechas, bloqueo…), con avisos estáticos.
 * 2. `defaultChoices` propone qué hacer con cada fila (editable en la vista previa).
 * 3. `buildPlan` arma exactamente lo que se creará y los avisos vigentes.
 * 4. `importService.apply` ejecuta el plan (ver services/importService.ts).
 */

/* ───────────── Columnas reconocidas ───────────── */

export type Field =
  | 'ref'
  | 'mencionado'
  | 'nombre'
  | 'tipo'
  | 'padre'
  | 'objetivo'
  | 'owner'
  | 'gerente'
  | 'estado'
  | 'impacto'
  | 'urgencia'
  | 'dependencia'
  | 'prioIA'
  | 'prioValidada'
  | 'hito'
  | 'accion'
  | 'accionResp'
  | 'fecha'
  | 'hora'
  | 'bloqueado'
  | 'bloqueo'
  | 'necesidad'
  | 'dependeDe'
  | 'respSolucion'
  | 'fechaSol'
  | 'horaSol'
  | 'depArea'
  | 'entregable'
  | 'desplazado'
  | 'motivoDesp'
  | 'decision'
  | 'origen'
  | 'confianza'
  | 'evidencia'
  | 'validacion'
  | 'observaciones';

/** Encabezados aceptados por campo (normalizados: sin acentos, minúsculas). */
const HEADERS: Record<Field, string[]> = {
  ref: ['id'],
  mencionado: ['persona que lo menciono'],
  nombre: ['proyecto / iniciativa / pendiente', 'proyecto / iniciativa', 'proyecto', 'nombre del proyecto'],
  tipo: ['tipo propuesto', 'tipo'],
  padre: ['proyecto padre / frente', 'proyecto padre', 'frente'],
  objetivo: ['objetivo / entregable', 'objetivo', 'descripcion'],
  owner: ['owner operativo', 'responsable (una persona)', 'responsable del proyecto', 'responsable'],
  gerente: ['gerente responsable'],
  estado: ['estado'],
  impacto: ['impacto'],
  urgencia: ['urgencia'],
  dependencia: ['dependencia'],
  prioIA: ['prioridad ia'],
  prioValidada: ['prioridad validada'],
  hito: ['proximo hito'],
  accion: ['siguiente accion concreta', 'siguiente accion'],
  accionResp: ['responsable siguiente accion'],
  fecha: ['fecha compromiso entrega', 'fecha compromiso', 'fecha de entrega', 'fecha objetivo'],
  hora: ['hora compromiso entrega', 'hora compromiso', 'hora de entrega'],
  bloqueado: ['bloqueado'],
  bloqueo: ['bloqueo / problema concreto', 'bloqueo'],
  necesidad: ['que se necesita para destrabar'],
  dependeDe: ['de quien depende'],
  respSolucion: ['responsable solucion / desbloqueo', 'responsable de destrabar'],
  fechaSol: ['fecha compromiso solucion'],
  horaSol: ['hora compromiso solucion'],
  depArea: ['dependencia con otra area'],
  entregable: ['entregable hacia otra area'],
  desplazado: ['proyecto desplazado / pausado'],
  motivoDesp: ['motivo del desplazamiento'],
  decision: ['decision requerida'],
  origen: ['origen'],
  confianza: ['confianza ia'],
  evidencia: ['evidencia / momento de sesion'],
  validacion: ['validacion gerencia', 'validacion'],
  observaciones: ['observaciones gerencia', 'observaciones'],
};

/** Columnas de la plantilla oficial (orden y encabezados). */
export const TEMPLATE_COLUMNS: { field: Field; header: string; width: number; hint: string }[] = [
  { field: 'ref', header: 'ID', width: 9, hint: 'Clave corta, p. ej. CON-01. Evita duplicados si se vuelve a importar.' },
  { field: 'nombre', header: 'Proyecto / iniciativa / pendiente', width: 36, hint: 'Nombre corto del proyecto (máx. 120 caracteres).' },
  { field: 'tipo', header: 'Tipo propuesto', width: 18, hint: 'Proyecto / Subproyecto se cargan como proyecto. Actividad u Operación recurrente se agrupan dentro de su proyecto padre.' },
  { field: 'padre', header: 'Proyecto padre / frente', width: 26, hint: 'Para actividades: el nombre exacto del proyecto al que pertenecen (o el frente que las agrupa).' },
  { field: 'objetivo', header: 'Objetivo / entregable', width: 38, hint: '¿Qué resultado entrega?' },
  { field: 'owner', header: 'Owner operativo', width: 20, hint: 'UNA persona responsable del proyecto.' },
  { field: 'gerente', header: 'Gerente responsable', width: 20, hint: 'Gerente del área.' },
  { field: 'estado', header: 'Estado', width: 14, hint: 'Por iniciar, En curso, En riesgo, En pausa, Completado o Archivado.' },
  { field: 'impacto', header: 'Impacto', width: 13, hint: 'Operación (ejecución básica) · Estrategia (posicionamiento de marca) · Negocio (venta, oficinas, franquicias, talento).' },
  { field: 'urgencia', header: 'Urgencia', width: 24, hint: 'Puede esperar · Debe avanzar esta semana · Deadline inmediato.' },
  { field: 'dependencia', header: 'Dependencia', width: 30, hint: 'Prácticamente autónomo · Depende de otra área / persona · Varias áreas / Dirección / tercero.' },
  { field: 'prioValidada', header: 'Prioridad validada', width: 12, hint: 'Sólo si la gerencia decide una prioridad distinta a la fórmula (queda como ajuste de Dirección).' },
  { field: 'hito', header: 'Próximo hito', width: 26, hint: 'Siguiente punto de control.' },
  { field: 'accion', header: 'Siguiente acción concreta', width: 34, hint: 'Se registra como compromiso si tiene responsable y fecha.' },
  { field: 'accionResp', header: 'Responsable siguiente acción', width: 20, hint: 'UNA persona.' },
  { field: 'fecha', header: 'Fecha compromiso entrega', width: 14, hint: 'AAAA-MM-DD o fecha de Excel.' },
  { field: 'hora', header: 'Hora compromiso entrega', width: 11, hint: 'HH:MM en 24 h (p. ej. 13:00).' },
  { field: 'bloqueado', header: '¿Bloqueado?', width: 11, hint: 'Sí / No.' },
  { field: 'bloqueo', header: 'Bloqueo / problema concreto', width: 32, hint: '¿Qué lo está bloqueando?' },
  { field: 'necesidad', header: 'Qué se necesita para destrabar', width: 30, hint: 'Se registra como compromiso de solución.' },
  { field: 'dependeDe', header: 'De quién depende', width: 22, hint: 'Área o persona (Dirección de Posicionamiento, Diseño, Comercial…).' },
  { field: 'respSolucion', header: 'Responsable solución / desbloqueo', width: 20, hint: 'UNA persona.' },
  { field: 'fechaSol', header: 'Fecha compromiso solución', width: 14, hint: 'AAAA-MM-DD.' },
  { field: 'horaSol', header: 'Hora compromiso solución', width: 11, hint: 'HH:MM.' },
  { field: 'depArea', header: 'Dependencia con otra área', width: 22, hint: 'Área de la que depende el proyecto.' },
  { field: 'entregable', header: 'Entregable hacia otra área', width: 24, hint: 'Qué entrega esta área a otra.' },
  { field: 'desplazado', header: 'Proyecto desplazado / pausado', width: 22, hint: 'Si este proyecto desplazó a otro.' },
  { field: 'motivoDesp', header: 'Motivo del desplazamiento', width: 24, hint: '' },
  { field: 'decision', header: 'Decisión requerida', width: 24, hint: 'Decisión pendiente para la junta.' },
  { field: 'validacion', header: 'Validación gerencia', width: 14, hint: 'Sólo se importan las filas Validado o Modificado.' },
  { field: 'observaciones', header: 'Observaciones gerencia', width: 28, hint: '' },
];

export const TEMPLATE_LISTS: Partial<Record<Field, string[]>> = {
  tipo: ['Proyecto', 'Subproyecto', 'Actividad', 'Operación recurrente', 'No aplica'],
  estado: Object.values(DEFAULT_STATUS_LABELS),
  impacto: [IMPACT_LABELS[1], IMPACT_LABELS[2], IMPACT_LABELS[3]],
  urgencia: [URGENCY_LABELS[1], URGENCY_LABELS[2], URGENCY_LABELS[3]],
  dependencia: ['Prácticamente autónomo', 'Depende de otra área / persona', 'Varias áreas / Dirección / tercero'],
  prioValidada: ['P1', 'P2', 'P3'],
  bloqueado: ['Sí', 'No'],
  validacion: ['Pendiente', 'Validado', 'Modificado', 'Descartado'],
};

/* ───────────── Tipos ───────────── */

export interface Issue {
  level: 'warn' | 'info';
  msg: string;
}

export type RowKind = 'proyecto' | 'actividad' | 'omitir';
export type Validation = 'validado' | 'pendiente' | 'descartado';

export interface InventoryRow {
  key: string;
  sheet: string;
  excelRow: number;
  ref: string;
  nombre: string;
  /** Texto original de cada columna reconocida. */
  raw: Partial<Record<Field, string>>;
  kind: RowKind;
  tipoDudoso: boolean;
  validacion: Validation;
  padre?: string;
  estado: ProjectStatus;
  impacto: Level;
  /** El impacto ya viene como Operación / Estrategia / Negocio (o 1–3). */
  impactoClasificado: boolean;
  urgencia: Level;
  dependencia: Level;
  prioridadIA?: Priority;
  prioridadValidada?: Priority;
  personas: { owner: string[]; accion: string[]; solucion: string[] };
  fecha?: string;
  hora?: string;
  fechaSol?: string;
  horaSol?: string;
  bloqueado: boolean;
  /** Dependencia principal del proyecto (id de área o `ext:Nombre`). */
  dependeKey?: string;
  /** De quién depende el desbloqueo. */
  bloqueoDependeKey?: string;
  /** Proyecto que ya existe en la herramienta con el mismo ID o nombre. */
  existingId?: string;
  issues: Issue[];
}

export interface InventorySheet {
  name: string;
  /** Área sugerida por el nombre de la hoja ('' si no coincide). */
  areaId: string;
  headerRow: number;
  rows: InventoryRow[];
}

export interface Inventory {
  sheets: InventorySheet[];
  /** Hojas sin tabla de proyectos (p. ej. resúmenes). */
  ignored: string[];
  /** Personas detectadas (nombre canónico → hoja donde aparecen como autoras o gerentes). */
  people: Record<string, { sheet?: string; gerente?: boolean }>;
}

export interface RowChoice {
  /** 'proyecto' | 'omitir' | 'row:<clave>' | 'frente:<nombre>' | 'prj:<id>' */
  destino: string;
  responsable: string;
  impacto: Level;
  /** La gerencia ya confirmó el impacto en la vista previa. */
  impactoOk: boolean;
  fecha: string;
  hora: string;
}

export interface ImportOptions {
  includePending: boolean;
  /** Hora para compromisos sin hora en el archivo ('' = no crear el compromiso). */
  defaultHora: string;
  /** Hoja → área ('' = no importar). */
  sheetAreas: Record<string, string>;
  /** Fecha de hoy (AAAA-MM-DD) para detectar compromisos vencidos. */
  today: string;
}

export interface PlannedCommitment {
  accion: string;
  responsable: string;
  fecha: string;
  hora: string;
  comentario?: string;
}

export interface PlannedBlock {
  descripcion: string;
  necesidad: string;
  dependeDe: string;
  areaDependencia?: string;
  responsableGestion?: string;
  commitment?: PlannedCommitment;
}

export interface PlannedProject {
  key: string;
  existingId?: string;
  areaId: string;
  nombre: string;
  descripcion: string;
  ref?: string;
  responsable?: string;
  fechaObjetivo?: string;
  impacto: Level;
  urgencia: Level;
  dependencia: Level;
  estado: ProjectStatus;
  dependeDe?: string;
  override?: { prioridad: Priority; motivo: string };
  commitments: PlannedCommitment[];
  blocks: PlannedBlock[];
  /** Actividades agrupadas (una línea por actividad, se agregan a la descripción). */
  actividades: string[];
  rows: string[];
  esFrente?: boolean;
}

/** Descripción final: la del proyecto más la lista de actividades agrupadas. */
export function plannedDescription(p: PlannedProject): string {
  const acts = p.actividades.length ? `Actividades:\n${p.actividades.map((a) => `- ${a}`).join('\n')}` : '';
  return [p.descripcion, acts].filter(Boolean).join('\n\n');
}

export interface Plan {
  projects: PlannedProject[];
  newPeople: { nombre: string; areaId?: string; rol: Role }[];
  /** Avisos vigentes por fila. */
  issues: Record<string, Issue[]>;
  included: Record<string, boolean>;
  stats: {
    proyectos: number;
    frentes: number;
    actividades: number;
    compromisos: number;
    bloqueos: number;
    personas: number;
    omitidas: number;
    avisos: number;
    p1: number;
    porArea: Record<string, { nuevos: number; activos: number }>;
  };
}

/* ───────────── Utilidades de texto ───────────── */

export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[¿?¡!*:]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cellText(v: CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v).trim();
}

const NON_PERSON = new Set([
  'direccion',
  'direccion de posicionamiento',
  'produccion',
  'comunicacion',
  'patrocinios',
  'proveedor',
  'social',
  'social media',
  'oficinas',
  'bancos',
  'eventos',
  'soc tv',
  'medios',
  'forbes',
  'prensa',
  'agencia',
  'franquicias',
  'comerciales',
  'cliente',
  'clientes',
  'rh',
  'recursos humanos',
  'sistemas',
  'ti',
  'nadie',
  'todos',
  'equipo',
  'por validar',
  'por definir',
  'pendiente',
  'n/a',
  'na',
  'digital',
  'marketing',
  'store',
]);

function nameTokens(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\s*(?:\/|\+|,|;|&|\s+y\s+)\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/* ───────────── Interpretación de valores ───────────── */

const LEVEL_WORDS: Record<string, Level> = { alto: 3, alta: 3, medio: 2, media: 2, bajo: 1, baja: 1 };

function labelLevel(n: string, labels: Record<Level, string>, extra: Record<string, Level> = {}): Level | undefined {
  for (const [k, v] of Object.entries(extra)) if (n.startsWith(k)) return v;
  for (const l of [1, 2, 3] as Level[]) {
    const ln = norm(labels[l]);
    if (n === ln || n.startsWith(ln) || ln.startsWith(n)) return l;
  }
  return undefined;
}

export function parseLevel(raw: string, criterio: 'impacto' | 'urgencia' | 'dependencia'): { level?: Level; nuevo?: boolean } {
  const n = norm(raw);
  if (!n) return {};
  const num = /^([123])\b/.exec(n);
  if (num) return { level: Number(num[1]) as Level, nuevo: true };
  if (criterio === 'impacto') {
    const l = labelLevel(n, IMPACT_LABELS, { operacion: 1, operativ: 1, estrateg: 2, negocio: 3 });
    if (l) return { level: l, nuevo: true };
  } else if (criterio === 'urgencia') {
    const l = labelLevel(n, URGENCY_LABELS);
    if (l) return { level: l, nuevo: true };
  } else {
    const l = labelLevel(n, DEPENDENCY_LABELS, { 'varias areas': 3, 'depende de varias': 3, 'depende de otra': 2, autonom: 1, 'practicamente': 1 });
    if (l) return { level: l, nuevo: true };
  }
  const w = LEVEL_WORDS[n.split(' ')[0]];
  return w ? { level: w, nuevo: false } : {};
}

const STATUS_RULES: [RegExp, ProjectStatus][] = [
  [/casi/, 'en_curso'],
  [/cancelad|descartad|archivad/, 'archivado'],
  [/^cerrad|^terminad|completad|concluid|^entregad/, 'completado'],
  [/bloquead|atorad|riesgo|retrasad|detenid/, 'en_riesgo'],
  [/pausad|espera|suspendid|congelad/, 'en_pausa'],
  [/no iniciad|por iniciar|sin iniciar|solicitad|propuest|pendiente|programad|planeacion|planead|por definir|idea/, 'por_iniciar'],
  [/proceso|curso|activ|cierre|preparacion|tiempo|ajuste|prioridad|recurrente|urgente|reprogramad|por cerrar|avance|ejecucion|produccion|revision/, 'en_curso'],
];

export function parseStatus(raw: string): { estado: ProjectStatus; reconocido: boolean } {
  const n = norm(raw);
  if (!n) return { estado: 'en_curso', reconocido: true };
  for (const [k, v] of Object.entries(DEFAULT_STATUS_LABELS)) if (n === norm(v)) return { estado: k as ProjectStatus, reconocido: true };
  for (const [re, estado] of STATUS_RULES) if (re.test(n)) return { estado, reconocido: true };
  return { estado: 'en_curso', reconocido: false };
}

export function parseTipo(raw: string): { kind: RowKind; dudoso: boolean } {
  const n = norm(raw);
  if (!n) return { kind: 'proyecto', dudoso: false };
  if (n.startsWith('no aplica') || n === 'descartado') return { kind: 'omitir', dudoso: false };
  if (n.includes('validar')) return { kind: 'proyecto', dudoso: true };
  const first = n.split(/[/-]/)[0].trim();
  if (first.startsWith('proyecto') || first.startsWith('subproyecto')) return { kind: 'proyecto', dudoso: false };
  if (first.startsWith('actividad') || first.startsWith('operacion') || first.startsWith('compromiso')) return { kind: 'actividad', dudoso: false };
  return { kind: 'proyecto', dudoso: true };
}

export function parseValidation(raw: string): Validation {
  const n = norm(raw);
  if (n.startsWith('validad') || n.startsWith('modificad') || n === 'si' || n === 'ok') return 'validado';
  if (n.startsWith('descartad') || n.startsWith('no aplica')) return 'descartado';
  return 'pendiente';
}

function parsePriority(raw: string): Priority | undefined {
  const m = /^p\s*([123])$/.exec(norm(raw));
  return m ? (`P${m[1]}` as Priority) : undefined;
}

const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

function iso(y: number, m: number, d: number): string | undefined {
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidDate(s) ? s : undefined;
}

/** Fecha de una celda: número de serie de Excel, AAAA-MM-DD, DD/MM/AAAA o texto como «12 oct». */
export function parseDateCell(v: CellValue | undefined, date1904: boolean, today: string): { date?: string; time?: string; interpretada?: boolean } {
  if (v === null || v === undefined || v === '') return {};
  if (typeof v === 'number') {
    const d = excelSerialToDate(v, date1904);
    return d ? { date: d.date, time: d.time } : {};
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m && m[0].length >= s.length - 3) {
    const date = iso(+m[1], +m[2], +m[3]);
    return date ? { date, time: m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : undefined } : {};
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const date = iso(y, +m[2], +m[1]);
    return date ? { date } : {};
  }
  m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const date = iso(+m[1], +m[2], +m[3]);
    return date ? { date, interpretada: true } : {};
  }
  const n = norm(s);
  m = /(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?(?:\s*(?:de\s+)?(\d{4}))?/.exec(n);
  if (m) {
    const y = m[3] ? +m[3] : +today.slice(0, 4);
    const date = iso(y, MONTHS[m[2]], +m[1]);
    return date ? { date, interpretada: true } : {};
  }
  return {};
}

export function parseTimeCell(v: CellValue | undefined): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return v < 1 ? excelFractionToTime(v) : v % 1 > 0 ? excelFractionToTime(v % 1) : undefined;
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|h|hrs?)?$/i.exec(String(v).trim());
  if (!m) return undefined;
  let h = +m[1];
  const suf = (m[3] ?? '').toLowerCase().replace(/[\s.]/g, '');
  if (suf === 'pm' && h < 12) h += 12;
  if (suf === 'am' && h === 12) h = 0;
  if (!m[2] && !suf) return undefined;
  const t = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
  return isValidTime(t) ? t : undefined;
}

function isYes(raw: string): boolean {
  return ['si', 'x', 'true', '1', 'yes'].includes(norm(raw));
}

/* ───────────── Lectura del libro ───────────── */

interface Ctx {
  db: DbData;
  nonPerson: Set<string>;
  areaByNorm: Map<string, string>;
}

function makeCtx(db: DbData): Ctx {
  const nonPerson = new Set(NON_PERSON);
  const areaByNorm = new Map<string, string>();
  for (const a of db.areas) {
    const n = norm(a.nombre);
    nonPerson.add(n);
    for (const w of n.split(' ')) if (w.length > 2) nonPerson.add(w);
    areaByNorm.set(n, a.id);
  }
  const md = db.areas.find((a) => norm(a.nombre) === 'marketing digital');
  if (md) areaByNorm.set('digital', md.id);
  const store = db.areas.find((a) => norm(a.nombre) === 'soc store');
  if (store) areaByNorm.set('store', store.id);
  for (const x of getSettings(db).externalDependencies) {
    nonPerson.add(norm(x));
    for (const part of x.split('/')) nonPerson.add(norm(part));
  }
  return { db, nonPerson, areaByNorm };
}

function isPersonToken(tok: string, ctx: Ctx): boolean {
  const n = norm(tok);
  if (!n || ctx.nonPerson.has(n)) return false;
  if (!/^\p{Lu}/u.test(tok)) return false;
  if (/\d/.test(n) || /^(equipo|area|por |todo)/.test(n) || n.includes(' area')) return false;
  return n.split(' ').length <= 4;
}

/** Área (id) o `ext:Nombre` a partir de un texto como «Dirección + Diseño» o «Comercial / Patrocinios». */
export function mapDependency(raw: string | undefined, ownAreaId: string, db: DbData, ctxIn?: Ctx): string | undefined {
  if (!raw) return undefined;
  const ctx = ctxIn ?? makeCtx(db);
  const externals = getSettings(db).externalDependencies;
  let fallback: string | undefined;
  for (const tok of nameTokens(raw)) {
    const n = norm(tok);
    if (!n) continue;
    const areaId = ctx.areaByNorm.get(n);
    if (areaId) {
      if (areaId !== ownAreaId) return areaId;
      continue;
    }
    if (n === 'direccion' || n === norm(DIRECCION)) return `ext:${DIRECCION}`;
    const ext = externals.find((x) => norm(x) === n || norm(x).startsWith(`${n} `) || norm(x).startsWith(`${n}/`) || norm(x).split(' / ').includes(n));
    if (ext) return `ext:${ext}`;
    if (!fallback && ctx.nonPerson.has(n)) fallback = `ext:${tok.charAt(0).toUpperCase()}${tok.slice(1)}`;
  }
  return fallback;
}

function findHeader(rows: CellValue[][]): { row: number; cols: Partial<Record<Field, number>> } | undefined {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cols: Partial<Record<Field, number>> = {};
    (rows[r] ?? []).forEach((v, c) => {
      const n = norm(cellText(v));
      if (!n) return;
      for (const [field, aliases] of Object.entries(HEADERS) as [Field, string[]][]) {
        if (cols[field] === undefined && aliases.includes(n)) {
          cols[field] = c;
          break;
        }
      }
    });
    if (cols.nombre !== undefined && Object.keys(cols).length >= 4) return { row: r, cols };
  }
  return undefined;
}

export function parseInventory(wb: WorkbookData, db: DbData, today: string): Inventory {
  const ctx = makeCtx(db);
  const sheets: InventorySheet[] = [];
  const ignored: string[] = [];
  type Pending = { sheet: string; areaId: string; headerRow: number; rows: { r: number; cells: Partial<Record<Field, CellValue>> }[] };
  const pending: Pending[] = [];

  for (const s of wb.sheets) {
    const h = findHeader(s.rows);
    if (!h) {
      ignored.push(s.name);
      continue;
    }
    const areaId = ctx.areaByNorm.get(norm(s.name)) ?? db.areas.find((a) => norm(s.name).includes(norm(a.nombre)))?.id ?? '';
    const p: Pending = { sheet: s.name, areaId, headerRow: h.row + 1, rows: [] };
    for (let r = h.row + 1; r < s.rows.length; r++) {
      const row = s.rows[r] ?? [];
      const cells: Partial<Record<Field, CellValue>> = {};
      for (const [f, c] of Object.entries(h.cols) as [Field, number][]) cells[f] = row[c] ?? null;
      if (!cellText(cells.nombre)) continue;
      p.rows.push({ r: r + 1, cells });
    }
    pending.push(p);
  }

  // Padrón de personas: nombres completos del archivo y de la herramienta.
  const roster = new Map<string, string>();
  for (const p of db.people) roster.set(norm(p.nombre), p.nombre);
  const people: Inventory['people'] = {};
  const personFields: Field[] = ['mencionado', 'gerente', 'owner', 'accionResp', 'respSolucion'];
  for (const p of pending)
    for (const { cells } of p.rows)
      for (const f of personFields)
        for (const tok of nameTokens(cellText(cells[f])))
          if (isPersonToken(tok, ctx) && tok.split(/\s+/).length >= 2 && !roster.has(norm(tok))) roster.set(norm(tok), tok);

  const canonical = (tok: string): string => {
    const n = norm(tok);
    const exact = roster.get(n);
    if (exact) return exact;
    if (!n.includes(' ')) {
      const matches = [...roster.entries()].filter(([k]) => k.split(' ')[0] === n);
      if (matches.length === 1) return matches[0][1];
    }
    return tok;
  };
  const persons = (raw: string) => [...new Set(nameTokens(raw).filter((t) => isPersonToken(t, ctx)).map(canonical))];

  for (const p of pending) {
    const rows: InventoryRow[] = [];
    for (const { r, cells } of p.rows) {
      const raw: Partial<Record<Field, string>> = {};
      for (const [f, v] of Object.entries(cells) as [Field, CellValue][]) {
        const t = cellText(v);
        if (t) raw[f] = t;
      }
      const issues: Issue[] = [];
      let nombre = raw.nombre!;
      if (nombre.length > 120) {
        issues.push({ level: 'info', msg: 'Nombre recortado a 120 caracteres.' });
        nombre = `${nombre.slice(0, 119)}…`;
      }
      const tipo = parseTipo(raw.tipo ?? '');
      if (tipo.dudoso) issues.push({ level: 'warn', msg: `Tipo «${raw.tipo}»: confirma si es proyecto o actividad.` });
      const st = parseStatus(raw.estado ?? '');
      if (!st.reconocido) issues.push({ level: 'warn', msg: `Estado «${raw.estado}» no reconocido: se usará «En curso».` });

      const imp = parseLevel(raw.impacto ?? '', 'impacto');
      const urg = parseLevel(raw.urgencia ?? '', 'urgencia');
      const dep = parseLevel(raw.dependencia ?? '', 'dependencia');
      const missingLv = [
        ['Impacto', raw.impacto, imp.level],
        ['Urgencia', raw.urgencia, urg.level],
        ['Dependencia', raw.dependencia, dep.level],
      ].filter(([, , l]) => !l);
      if (missingLv.length)
        issues.push({ level: 'warn', msg: `${missingLv.map(([c, v]) => `${c} ${v ? `«${v}» no reconocido` : 'vacío'}`).join(' · ')}: se usará 2.` });

      const owner = persons(raw.owner ?? '');
      const accion = persons(raw.accionResp ?? '');
      const solucion = persons(raw.respSolucion ?? '');
      for (const n of persons(raw.mencionado ?? '')) people[n] = { ...people[n], sheet: people[n]?.sheet ?? p.sheet };
      for (const n of persons(raw.gerente ?? '')) people[n] = { sheet: p.sheet, gerente: true };

      const f = parseDateCell(cells.fecha, wb.date1904, today);
      if (raw.fecha && !f.date) issues.push({ level: 'warn', msg: `Fecha de entrega «${raw.fecha}» no reconocida.` });
      if (f.interpretada) issues.push({ level: 'info', msg: `Fecha de entrega «${raw.fecha}» interpretada como ${f.date}.` });
      const fs = parseDateCell(cells.fechaSol, wb.date1904, today);
      if (raw.fechaSol && !fs.date) issues.push({ level: 'warn', msg: `Fecha de solución «${raw.fechaSol}» no reconocida.` });
      if (fs.interpretada) issues.push({ level: 'info', msg: `Fecha de solución «${raw.fechaSol}» interpretada como ${fs.date}.` });
      const hora = parseTimeCell(cells.hora) ?? f.time;
      if (raw.hora && !parseTimeCell(cells.hora)) issues.push({ level: 'warn', msg: `Hora «${raw.hora}» no reconocida (usa HH:MM).` });

      const bloqueado = raw.bloqueado ? isYes(raw.bloqueado) : /bloquead|atorad/.test(norm(raw.estado));
      if (bloqueado && !raw.bloqueo) issues.push({ level: 'warn', msg: 'Marcado como bloqueado sin describir qué lo bloquea.' });

      const ref = raw.ref ?? `${p.sheet}-${r}`;
      const existing = db.projects.find(
        (x) => x.areaId === p.areaId && ((raw.ref && x.ref === raw.ref) || norm(x.nombre) === norm(nombre)) && x.estado !== 'archivado',
      );
      if (existing) issues.push({ level: 'info', msg: `Ya existe en la herramienta («${existing.nombre}»): se omite para no duplicarlo.` });

      rows.push({
        key: `${p.sheet}#${r}`,
        sheet: p.sheet,
        excelRow: r,
        ref,
        nombre,
        raw,
        kind: tipo.kind,
        tipoDudoso: tipo.dudoso,
        validacion: parseValidation(raw.validacion ?? ''),
        padre: raw.padre,
        estado: st.estado,
        impacto: imp.level ?? 2,
        impactoClasificado: !!imp.level && !!imp.nuevo,
        urgencia: urg.level ?? 2,
        dependencia: dep.level ?? 2,
        prioridadIA: parsePriority(raw.prioIA ?? ''),
        prioridadValidada: parsePriority(raw.prioValidada ?? ''),
        personas: { owner, accion, solucion },
        fecha: f.date,
        hora,
        fechaSol: fs.date,
        horaSol: parseTimeCell(cells.horaSol) ?? fs.time,
        bloqueado,
        dependeKey: mapDependency(raw.depArea, p.areaId, db, ctx) ?? mapDependency(raw.dependeDe, p.areaId, db, ctx),
        bloqueoDependeKey: mapDependency(raw.dependeDe, p.areaId, db, ctx),
        existingId: existing?.id,
        issues,
      });
    }
    sheets.push({ name: p.sheet, areaId: p.areaId, headerRow: p.headerRow, rows });
  }
  return { sheets, ignored, people };
}

/* ───────────── Propuesta por fila ───────────── */

/** Proyecto al que pertenece una actividad: fila con ese nombre, proyecto existente o el frente. */
function parentFor(row: InventoryRow, sheet: InventorySheet, db: DbData, areaId: string): string {
  const padre = norm(row.padre);
  if (padre) {
    const projects = sheet.rows.filter((r) => r.kind === 'proyecto' && r.key !== row.key);
    const exact = projects.filter((r) => norm(r.nombre) === padre);
    if (exact.length === 1) return `row:${exact[0].key}`;
    const existing = db.projects.find((p) => p.areaId === areaId && isActiveProject(p) && norm(p.nombre) === padre);
    if (existing) return `prj:${existing.id}`;
    return `frente:${row.padre!.trim()}`;
  }
  return `frente:Actividades de ${sheet.name}`;
}

export function defaultChoices(inv: Inventory, db: DbData): Record<string, RowChoice> {
  const out: Record<string, RowChoice> = {};
  for (const sheet of inv.sheets) {
    for (const row of sheet.rows) {
      let destino: string;
      if (row.existingId || row.kind === 'omitir') destino = 'omitir';
      else if (row.kind === 'actividad') destino = parentFor(row, sheet, db, sheet.areaId);
      else destino = 'proyecto';
      out[row.key] = {
        destino,
        responsable: row.personas.owner[0] ?? row.personas.accion[0] ?? '',
        impacto: row.impacto,
        impactoOk: row.impactoClasificado,
        fecha: row.fecha ?? '',
        hora: row.hora ?? '',
      };
    }
  }
  return out;
}

/** Destinos posibles para una fila (para el selector «Importar como»). */
export function destinationOptions(sheet: InventorySheet, row: InventoryRow, db: DbData, areaId: string, choices: Record<string, RowChoice>) {
  const opts: { value: string; label: string }[] = [
    { value: 'proyecto', label: 'Proyecto' },
    { value: 'omitir', label: 'No importar' },
  ];
  for (const r of sheet.rows)
    if (r.key !== row.key && choices[r.key]?.destino === 'proyecto') opts.push({ value: `row:${r.key}`, label: `Actividad de: ${r.nombre}` });
  const frentes = new Set<string>();
  for (const r of sheet.rows) {
    const d = choices[r.key]?.destino;
    if (d?.startsWith('frente:')) frentes.add(d.slice(7));
  }
  if (row.padre) frentes.add(row.padre.trim());
  for (const f of frentes) opts.push({ value: `frente:${f}`, label: `Actividad del frente: ${f}` });
  for (const p of db.projects.filter((x) => x.areaId === areaId && isActiveProject(x)))
    opts.push({ value: `prj:${p.id}`, label: `Actividad de (existente): ${p.nombre}` });
  return opts;
}

/* ───────────── Plan ───────────── */

export function isIncluded(row: InventoryRow, opts: ImportOptions): boolean {
  if (!opts.sheetAreas[row.sheet]) return false;
  return row.validacion === 'validado' || (row.validacion === 'pendiente' && opts.includePending);
}

function personKey(db: DbData, name: string): boolean {
  return db.people.some((p) => norm(p.nombre) === norm(name));
}

export function buildPlan(inv: Inventory, choices: Record<string, RowChoice>, opts: ImportOptions, db: DbData): Plan {
  const issues: Record<string, Issue[]> = {};
  const included: Record<string, boolean> = {};
  const projects = new Map<string, PlannedProject>();
  let actividades = 0;
  let omitidas = 0;

  const rowsByKey = new Map<string, { row: InventoryRow; sheet: InventorySheet }>();
  for (const sheet of inv.sheets) for (const row of sheet.rows) rowsByKey.set(row.key, { row, sheet });

  const describe = (row: InventoryRow, withAction: boolean): string => {
    const r = row.raw;
    const lines: string[] = [];
    if (r.objetivo) lines.push(r.objetivo);
    if (row.padre && norm(row.padre) !== norm(row.nombre)) lines.push(`Frente: ${row.padre}`);
    if (r.hito) lines.push(`Próximo hito: ${r.hito}`);
    if (withAction && r.accion) lines.push(`Siguiente acción: ${r.accion}${r.accionResp ? ` (${r.accionResp})` : ''}${r.fecha ? ` · ${r.fecha}` : ''}`);
    if (r.entregable || r.depArea) lines.push(`Entrega a otra área: ${[r.entregable, r.depArea && `(${r.depArea})`].filter(Boolean).join(' ')}`);
    if (r.decision) lines.push(`Decisión requerida: ${r.decision}`);
    if (r.desplazado) lines.push(`Desplazó a: ${r.desplazado}${r.motivoDesp ? ` — ${r.motivoDesp}` : ''}`);
    if (r.observaciones) lines.push(`Observaciones de gerencia: ${r.observaciones}`);
    const origen = [row.ref, r.origen, r.confianza && `confianza IA ${r.confianza}`, r.evidencia, r.mencionado && `mencionado por ${r.mencionado}`].filter(Boolean);
    lines.push(`Inventario: ${origen.join(' · ')}`);
    return lines.join('\n');
  };

  /** Compromiso de la siguiente acción y bloqueo de una fila (o avisos de por qué no). */
  const extras = (row: InventoryRow, c: RowChoice, warn: (m: string) => void, prefix = '') => {
    const out: { commitment?: PlannedCommitment; block?: PlannedBlock; accionPendiente: boolean } = { accionPendiente: false };
    const r = row.raw;
    if (r.accion) {
      const resp = row.personas.accion[0] ?? c.responsable;
      const hora = c.hora || opts.defaultHora;
      const faltan = [!resp && 'responsable', !c.fecha && 'fecha', !hora && 'hora'].filter(Boolean);
      if (faltan.length) {
        warn(`La siguiente acción no tiene ${faltan.join(', ')}: no se registrará como compromiso.`);
        out.accionPendiente = true;
      } else if (!isValidDate(c.fecha) || !isValidTime(hora)) {
        warn('La fecha u hora de la siguiente acción no es válida: no se registrará como compromiso.');
        out.accionPendiente = true;
      } else {
        if (c.fecha < opts.today) warn(`El compromiso vence el ${c.fecha}: entrará como vencido.`);
        out.commitment = {
          accion: `${prefix}${r.accion}`.slice(0, 300),
          responsable: resp,
          fecha: c.fecha,
          hora,
          comentario: row.personas.accion.length > 1 || nameTokens(r.accionResp).length > 1 ? `Responsables en el inventario: ${r.accionResp}` : undefined,
        };
      }
    }
    if (row.bloqueado) {
      const resp = row.personas.solucion[0];
      const hora = row.horaSol || opts.defaultHora;
      const block: PlannedBlock = {
        descripcion: `${prefix}${r.bloqueo ?? 'Bloqueado (sin detalle en el inventario)'}`,
        necesidad: r.necesidad ?? '',
        dependeDe: r.dependeDe ?? '',
        areaDependencia: row.bloqueoDependeKey,
        responsableGestion: resp,
      };
      const faltan = [!resp && 'responsable', !row.fechaSol && 'fecha', !hora && 'hora'].filter(Boolean);
      if (faltan.length) warn(`Bloqueo sin compromiso de solución (falta ${faltan.join(', ')}): quedará «por destrabar».`);
      else {
        if (row.fechaSol! < opts.today) warn(`La solución del bloqueo vence el ${row.fechaSol}: entrará como vencida.`);
        block.commitment = {
          accion: `Destrabar: ${r.necesidad ?? r.bloqueo ?? row.nombre}`.slice(0, 300),
          responsable: resp!,
          fecha: row.fechaSol!,
          hora,
          comentario: nameTokens(r.respSolucion).length > 1 ? `Responsables en el inventario: ${r.respSolucion}` : undefined,
        };
      }
      out.block = block;
    }
    return out;
  };

  // 1) Proyectos (filas con destino «proyecto»).
  for (const sheet of inv.sheets) {
    const areaId = opts.sheetAreas[sheet.name] ?? '';
    for (const row of sheet.rows) {
      const list: Issue[] = [...row.issues];
      issues[row.key] = list;
      const c = choices[row.key];
      const inc = isIncluded(row, opts) && c.destino !== 'omitir';
      included[row.key] = inc;
      if (!areaId) list.unshift({ level: 'info', msg: 'La hoja no está asignada a un área: no se importa.' });
      else if (row.validacion === 'descartado') list.unshift({ level: 'info', msg: 'Descartado por la gerencia: no se importa.' });
      else if (row.validacion === 'pendiente' && !opts.includePending) list.unshift({ level: 'info', msg: 'Pendiente de validación: no se importa.' });
      if (!inc) {
        omitidas++;
        continue;
      }
      if (c.destino !== 'proyecto') continue;
      const warn = (msg: string) => list.push({ level: 'warn', msg });
      const info = (msg: string) => list.push({ level: 'info', msg });
      const scoring = computePriority({ impacto: c.impacto, urgencia: row.urgencia, dependencia: row.dependencia });
      if (!row.impactoClasificado && !c.impactoOk) warn(`Impacto «${row.raw.impacto ?? 'vacío'}»: clasifícalo como Operación, Estrategia o Negocio.`);
      if (!c.responsable) warn(`Sin responsable${scoring.prioridadCalculada === 'P1' ? ': un P1 necesita responsable' : ''}.`);
      let override: PlannedProject['override'];
      if (row.prioridadValidada && row.prioridadValidada !== scoring.prioridadCalculada) {
        override = { prioridad: row.prioridadValidada, motivo: 'Prioridad validada por la gerencia en el inventario.' };
        info(`Ajuste de Dirección: ${row.prioridadValidada} (la fórmula da ${scoring.prioridadCalculada}).`);
      } else if (!row.prioridadValidada && row.prioridadIA && row.prioridadIA !== scoring.prioridadCalculada) {
        warn(`La IA propuso ${row.prioridadIA}; la fórmula da ${scoring.prioridadCalculada} (score ${scoring.score}). Para conservar ${row.prioridadIA}, captura «Prioridad validada».`);
      }
      const ex = extras(row, c, warn);
      projects.set(`row:${row.key}`, {
        key: `row:${row.key}`,
        areaId,
        nombre: row.nombre,
        descripcion: describe(row, ex.accionPendiente),
        ref: row.raw.ref,
        responsable: c.responsable || undefined,
        fechaObjetivo: c.fecha && isValidDate(c.fecha) ? c.fecha : undefined,
        impacto: c.impacto,
        urgencia: row.urgencia,
        dependencia: row.dependencia,
        estado: row.estado,
        dependeDe: row.dependeKey,
        override,
        commitments: ex.commitment ? [ex.commitment] : [],
        blocks: ex.block ? [ex.block] : [],
        actividades: [],
        rows: [row.key],
      });
    }
  }

  // 2) Actividades: se agrupan dentro de su proyecto o frente.
  for (const sheet of inv.sheets) {
    const areaId = opts.sheetAreas[sheet.name] ?? '';
    for (const row of sheet.rows) {
      const c = choices[row.key];
      if (!included[row.key] || c.destino === 'proyecto') continue;
      const list = issues[row.key];
      const warn = (msg: string) => list.push({ level: 'warn', msg });
      const info = (msg: string) => list.push({ level: 'info', msg });
      let target = c.destino;
      if (target.startsWith('row:') && !projects.has(target)) {
        const parent = rowsByKey.get(target.slice(4));
        target = `frente:${row.padre?.trim() || parent?.row.nombre || `Actividades de ${sheet.name}`}`;
        info(`Su proyecto no se importa: queda en el frente «${target.slice(7)}».`);
      }
      let parent = projects.get(target);
      if (!parent && target.startsWith('prj:')) {
        const existing = db.projects.find((p) => p.id === target.slice(4));
        if (!existing) continue;
        parent = { key: target, existingId: existing.id, areaId: existing.areaId, nombre: existing.nombre, descripcion: '', impacto: existing.impacto, urgencia: existing.urgencia, dependencia: existing.dependencia, estado: existing.estado, commitments: [], blocks: [], actividades: [], rows: [] };
        projects.set(target, parent);
      }
      if (!parent && target.startsWith('frente:')) {
        const nombre = target.slice(7).slice(0, 120);
        const existing = db.projects.find((p) => p.areaId === areaId && isActiveProject(p) && norm(p.nombre) === norm(nombre));
        const key = existing ? `prj:${existing.id}` : `frente:${areaId}:${norm(nombre)}`;
        parent = projects.get(key);
        if (!parent) {
          parent = existing
            ? { key, existingId: existing.id, areaId, nombre: existing.nombre, descripcion: '', impacto: existing.impacto, urgencia: existing.urgencia, dependencia: existing.dependencia, estado: existing.estado, commitments: [], blocks: [], actividades: [], rows: [] }
            : { key, areaId, nombre, descripcion: `Frente que agrupa actividades del inventario de ${sheet.name}.`, responsable: c.responsable || undefined, impacto: 1, urgencia: 1, dependencia: 1, estado: 'en_curso', commitments: [], blocks: [], actividades: [], rows: [], esFrente: true };
          projects.set(key, parent);
        }
      }
      if (!parent) continue;
      actividades++;
      if (parent.esFrente) {
        parent.impacto = Math.max(parent.impacto, c.impacto) as Level;
        parent.urgencia = Math.max(parent.urgencia, row.urgencia) as Level;
        parent.dependencia = Math.max(parent.dependencia, row.dependencia) as Level;
        parent.responsable ??= c.responsable || undefined;
        parent.dependeDe ??= row.dependeKey;
      }
      const ex = extras(row, c, warn, `${row.nombre}: `);
      const r = row.raw;
      parent.actividades.push(`${row.nombre}${r.objetivo ? `: ${r.objetivo}` : ''}${c.responsable ? ` (${c.responsable})` : ''}${ex.accionPendiente && r.accion ? ` · siguiente acción: ${r.accion}` : ''}${r.decision ? ` · decisión requerida: ${r.decision}` : ''} [${row.ref}]`);
      if (ex.commitment) parent.commitments.push({ ...ex.commitment, comentario: [`Actividad: ${row.nombre}`, ex.commitment.comentario].filter(Boolean).join(' · ') });
      if (ex.block) parent.blocks.push(ex.block);
      parent.rows.push(row.key);
      info(`Se agrupa en «${parent.nombre}».`);
    }
  }

  // 3) Personas nuevas.
  const used = new Set<string>();
  for (const p of projects.values()) {
    if (p.responsable) used.add(p.responsable);
    for (const c of p.commitments) used.add(c.responsable);
    for (const b of p.blocks) {
      if (b.responsableGestion) used.add(b.responsableGestion);
      if (b.commitment) used.add(b.commitment.responsable);
    }
  }
  for (const [nombre, meta] of Object.entries(inv.people)) if (meta.gerente) used.add(nombre);
  const newPeople = [...used]
    .filter((n) => n && !personKey(db, n))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((nombre) => {
      const meta = inv.people[nombre];
      return { nombre, areaId: meta?.sheet ? opts.sheetAreas[meta.sheet] || undefined : undefined, rol: (meta?.gerente ? 'GERENTE' : 'COLABORADOR') as Role };
    });

  const list = [...projects.values()];
  const porArea: Plan['stats']['porArea'] = {};
  for (const a of db.areas) porArea[a.id] = { nuevos: 0, activos: db.projects.filter((p) => p.areaId === a.id && isActiveProject(p)).length };
  let p1 = db.projects.filter((p) => isActiveProject(p) && p.prioridadFinal === 'P1').length;
  for (const p of list) {
    if (p.existingId) continue;
    if (porArea[p.areaId]) porArea[p.areaId].nuevos++;
    const pr = p.override?.prioridad ?? computePriority({ impacto: p.impacto, urgencia: p.urgencia, dependencia: p.dependencia }).prioridadCalculada;
    if (pr === 'P1') p1++;
  }
  return {
    projects: list,
    newPeople,
    issues,
    included,
    stats: {
      proyectos: list.filter((p) => !p.existingId && !p.esFrente).length,
      frentes: list.filter((p) => p.esFrente).length,
      actividades,
      compromisos: list.reduce((n, p) => n + p.commitments.length + p.blocks.filter((b) => b.commitment).length, 0),
      bloqueos: list.reduce((n, p) => n + p.blocks.length, 0),
      personas: newPeople.length,
      omitidas,
      avisos: Object.entries(issues).reduce((n, [k, l]) => n + (included[k] ? l.filter((i) => i.level === 'warn').length : 0), 0),
      p1,
      porArea,
    },
  };
}
