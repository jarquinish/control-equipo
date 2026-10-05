import type { ISODate, Time } from './types';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha local `YYYY-MM-DD` de un Date. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTime(d: Date): Time {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isValidDate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

export function isValidTime(value: unknown): value is Time {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** Convierte `YYYY-MM-DD` a Date local (00:00). */
export function parseDate(value: ISODate): Date {
  const m = DATE_RE.exec(value);
  if (!m) throw new RangeError(`Fecha inválida: ${value}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Momento local exacto de una fecha + hora. */
export function deadline(fecha: ISODate, hora: Time): Date {
  const d = parseDate(fecha);
  const [h, mi] = hora.split(':').map(Number);
  d.setHours(h, mi, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  return toISODate(addDays(parseDate(date), days));
}

/** Lunes (00:00 local) de la semana a la que pertenece la fecha. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - day);
  return d;
}

/** Número de semana ISO-8601 y año ISO de una fecha. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function weekIdFor(date: Date): string {
  const { year, week } = isoWeek(date);
  return `${year}-W${pad(week)}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `5 oct` */
export function fmtShort(date: ISODate | Date): string {
  const d = typeof date === 'string' ? parseDate(date) : date;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** `5 oct 2026` */
export function fmtDate(date: ISODate | Date | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? (isValidDate(date) ? parseDate(date) : new Date(date)) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `lunes 5 oct · 10:32` */
export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${toTime(d)}`;
}

export function dayName(date: ISODate): string {
  return DAYS[parseDate(date).getDay()];
}

/** Descripción humana de un deadline relativa a `now`: "hoy 13:00", "mañana 11:00", "miércoles 11:00", "12 oct 11:00". */
export function fmtDeadline(fecha: ISODate, hora: Time, now: Date): string {
  if (!isValidDate(fecha)) return '—';
  const d = parseDate(fecha);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  let label: string;
  if (diff === 0) label = 'hoy';
  else if (diff === 1) label = 'mañana';
  else if (diff === -1) label = 'ayer';
  else if (diff > 1 && diff < 7) label = DAYS[d.getDay()];
  else label = fmtShort(d);
  return `${label} ${hora}`;
}

/** Diferencia en horas (positivo = futuro). */
export function hoursUntil(target: Date, now: Date): number {
  return (target.getTime() - now.getTime()) / 3_600_000;
}
