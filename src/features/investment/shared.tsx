import { useMemo, useState, type ReactNode } from 'react';
import { toISODate } from '../../domain/dates';
import { budgetSummary, projectInvestment } from '../../domain/investment/budget';
import { evaluateScope } from '../../domain/investment/efficiency';
import { evaluateAll, operationalKpis } from '../../domain/investment/kpis';
import { executiveAlerts } from '../../domain/investment/alerts';
import { DEFAULT_INVESTMENT_PRIORITY, priorityIndexMap } from '../../domain/investment/priorityIndex';
import type { ID, Periodo, Validacion } from '../../domain/types';
import { ValidationError } from '../../domain/validation';
import { useApp, useDb, useServices, useSettings } from '../../state/app';
import { useQuery } from '../../state/router';
import { Chip } from '../../ui/badges';
import { Modal } from '../../ui/Modal';
import { useFeedback } from '../../ui/feedback';
import type { InvestmentCollection } from '../../services/investmentService';

/* ───────────── Formato ───────────── */

export const money = (n: number | null | undefined, cents = false) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: cents ? 2 : 0,
        maximumFractionDigits: cents ? 2 : 0,
      });
/** Monto compacto para tarjetas: $17.00 M · $590.5 mil · $1,600 (el monto exacto va en la pista). */
export const moneyShort = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${n < 0 ? '−' : ''}$${(a / 1_000_000).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
  if (a >= 100_000) return `${n < 0 ? '−' : ''}$${(a / 1_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} mil`;
  return money(n);
};
export const num = (n: number | null | undefined, digits = 0) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('es-MX', { maximumFractionDigits: digits }));
export const pct = (r: number | null | undefined, digits = 1) =>
  r === null || r === undefined || !Number.isFinite(r) ? '—' : `${(r * 100).toLocaleString('es-MX', { maximumFractionDigits: digits })}%`;
export const valueWithUnit = (v: number | null | undefined, unidad: string) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : unidad === 'MXN'
      ? money(v, true)
      : unidad === '%'
        ? `${num(v, 1)}%`
        : `${num(v, 2)} ${unidad}`;

export const VALIDACION_LABELS: Record<Validacion, string> = {
  CONFIRMADO: 'Confirmado',
  PENDIENTE: 'Pendiente de validación',
  PROPUESTA: 'Propuesta',
};
export function ValidChip({ estado }: { estado: Validacion | undefined }) {
  if (!estado) return null;
  return <Chip tone={estado === 'CONFIRMADO' ? 'green' : estado === 'PENDIENTE' ? 'yellow' : 'blue'}>{VALIDACION_LABELS[estado]}</Chip>;
}

/** Barra horizontal (valor / máximo). `over` marca excesos. */
export function Bar({ value, max, tone = 'brand', label }: { value: number; max: number; tone?: 'brand' | 'red' | 'yellow' | 'gray' | 'green'; label?: string }) {
  const w = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <span className={`inv-bar inv-bar-${tone}`} role="img" aria-label={label ?? `${Math.round(w)}%`}>
      <span style={{ width: `${w}%` }} />
    </span>
  );
}

/** Serie de barras verticales simples (tendencia). */
export function SeriesBars({ items, unidad, height = 90 }: { items: { label: string; value: number; pending?: boolean }[]; unidad: string; height?: number }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="small muted">Sin resultados registrados.</p>;
  return (
    <div className="inv-series" style={{ height: height + 46 }} role="img" aria-label={`Tendencia: ${items.map((i) => `${i.label} ${num(i.value)}`).join(', ')}`}>
      {items.map((i) => (
        <div key={i.label} className="inv-series-col" title={`${i.label}: ${valueWithUnit(i.value, unidad)}${i.pending ? ' (pendiente de validación)' : ''}`}>
          <span className="inv-series-val">{num(i.value, unidad === 'MXN' ? 0 : 1)}</span>
          <span className={`inv-series-bar ${i.pending ? 'pending' : ''}`} style={{ height: `${Math.max(2, (i.value / max) * height)}px` }} />
          <span className="inv-series-label">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Filtros (periodo y gerencia) ───────────── */

export interface PeriodOption {
  key: string;
  label: string;
  periodo?: Periodo;
}

export function periodOptions(anio: number): PeriodOption[] {
  const q = (n: number, ini: string, fin: string): PeriodOption => ({
    key: `t${n}`,
    label: `T${n} ${anio}`,
    periodo: {
      inicio: `${anio}-${ini}`,
      fin: `${anio}-${fin}`,
      etiqueta: `T${n} ${anio}`,
    },
  });
  return [
    { key: 'todo', label: 'Todos los periodos' },
    {
      key: 'anio',
      label: `Año ${anio}`,
      periodo: {
        inicio: `${anio}-01-01`,
        fin: `${anio}-12-31`,
        etiqueta: `Año ${anio}`,
      },
    },
    q(1, '01-01', '03-31'),
    q(2, '04-01', '06-30'),
    q(3, '07-01', '09-30'),
    q(4, '10-01', '12-31'),
  ];
}

export function useInvestmentFilters() {
  const [q, setQ] = useQuery();
  const { now } = useApp();
  const anio = Number(q.get('anio') ?? now.getFullYear());
  const opts = periodOptions(anio);
  const periodoKey = q.get('periodo') ?? 'anio';
  const periodo = opts.find((o) => o.key === periodoKey) ?? opts[1];
  return { q, setQ, anio, opts, periodo, area: q.get('area') ?? '' };
}

/** Todos los cálculos del módulo, memorizados sobre la base y el periodo. */
export function useInvestment(periodo?: Periodo) {
  const db = useDb();
  const { now } = useApp();
  const settings = useSettings();
  const today = toISODate(now);
  return useMemo(() => {
    const hasta = periodo ? periodo.fin.slice(0, 7) : undefined;
    const budget = budgetSummary(db, { hasta });
    const budgetFull = hasta ? budgetSummary(db) : budget;
    const kpis = evaluateAll(db, today, periodo);
    const scopes = [...db.efficiencyScopes].sort((a, b) => a.periodo.inicio.localeCompare(b.periodo.inicio) || b.periodo.fin.localeCompare(a.periodo.fin)).filter((s) => !periodo || (s.periodo.inicio <= periodo.fin && s.periodo.fin >= periodo.inicio)).map((s) => evaluateScope(s, db));
    const allScopes = db.efficiencyScopes.map((s) => evaluateScope(s, db));
    const alerts = executiveAlerts(db, {
      today,
      budget: budgetFull,
      kpis: evaluateAll(db, today),
      scopes: allScopes,
    });
    const projInv = projectInvestment(db);
    const cfg = settings.investmentPriority ?? DEFAULT_INVESTMENT_PRIORITY;
    const prio = priorityIndexMap(db, today, cfg);
    return {
      db,
      today,
      budget,
      budgetFull,
      kpis,
      scopes,
      allScopes,
      alerts,
      projInv,
      prio,
      cfg,
      operational: operationalKpis(db, now),
    };
  }, [db, today, periodo?.inicio, periodo?.fin, settings.investmentPriority, now]);
}

export type InvestmentData = ReturnType<typeof useInvestment>;

export function useAreaName() {
  const db = useDb();
  return (id: ID | undefined) => db.areas.find((a) => a.id === id)?.nombre ?? 'Sin gerencia';
}

/* ───────────── Formulario genérico ───────────── */

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'month' | 'select' | 'multiselect' | 'checkbox';
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  /** Campo vacío = null/undefined. */
  optional?: boolean;
  full?: boolean;
}

type Values = Record<string, unknown>;

/**
 * Formulario de alta/edición validado por el servicio (los mismos errores que el
 * servidor). `toInput` arma el registro; `fieldOf` traduce claves de error a campos.
 */
export function RecordModal<C extends InvestmentCollection>({
  title,
  subtitle,
  collection,
  fields,
  initial,
  toInput,
  onClose,
  onSaved,
  note,
}: {
  title: string;
  subtitle?: ReactNode;
  collection: C;
  fields: FieldSpec[];
  initial: Values;
  toInput: (v: Values) => Record<string, unknown>;
  onClose: () => void;
  onSaved?: (id: ID) => void;
  note?: ReactNode;
}) {
  const services = useServices();
  const { toast } = useFeedback();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: unknown) => setValues((x) => ({ ...x, [k]: v }));

  const submit = () => {
    try {
      const saved = services.investment.save(collection, toInput(values) as never);
      toast('Guardado');
      onSaved?.(saved.id);
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.errors);
        const unknown = Object.keys(err.errors).filter((k) => !fields.some((f) => f.key === k || k.startsWith(`${f.key}`)));
        if (unknown.length) toast(err.errors[unknown[0]], 'error');
      } else {
        toast('No se pudo guardar.', 'error');
        console.error(err);
      }
    }
  };

  const errorFor = (k: string) => errors[k] ?? Object.entries(errors).find(([e]) => k.startsWith(e) || e.startsWith(k))?.[1];

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Guardar
          </button>
        </>
      }
    >
      {note && <p className="alert alert-blue">{note}</p>}
      <div className="form-grid">
        {fields.map((f) => {
          const id = `f-${f.key}`;
          const v = values[f.key];
          const err = errorFor(f.key);
          const common = {
            id,
            className: 'input',
            'aria-invalid': !!err || undefined,
          };
          let control: ReactNode;
          if (f.type === 'textarea') control = <textarea {...common} rows={3} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />;
          else if (f.type === 'select')
            control = (
              <select {...common} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                {f.optional && <option value="">—</option>}
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            );
          else if (f.type === 'multiselect')
            control = (
              <div className="inv-checks" role="group" aria-label={f.label}>
                {f.options?.map((o) => {
                  const arr = (v as string[]) ?? [];
                  return (
                    <label key={o.value} className="check">
                      <input type="checkbox" checked={arr.includes(o.value)} onChange={(e) => set(f.key, e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} /> {o.label}
                    </label>
                  );
                })}
              </div>
            );
          else if (f.type === 'checkbox')
            control = (
              <label className="check">
                <input id={id} type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} /> {f.hint ?? 'Sí'}
              </label>
            );
          else
            control = (
              <input
                {...common}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'month' ? 'month' : 'text'}
                step={f.type === 'number' ? 'any' : undefined}
                value={v === null || v === undefined ? '' : String(v)}
                onChange={(e) => set(f.key, e.target.value)}
              />
            );
          return (
            <div key={f.key} className={`field ${f.full || f.type === 'textarea' || f.type === 'multiselect' ? 'span-2' : ''}`}>
              <label className="field-label" htmlFor={f.type === 'multiselect' ? undefined : id}>
                {f.label}
                {f.required && (
                  <span className="req" aria-hidden>
                    {' '}
                    *
                  </span>
                )}
              </label>
              {control}
              {f.hint && f.type !== 'checkbox' && <span className="field-hint">{f.hint}</span>}
              {err && (
                <span className="field-error" role="alert">
                  {err}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {(errors.permiso || errors.dependencias) && (
        <p className="field-error" role="alert">
          {errors.permiso ?? errors.dependencias}
        </p>
      )}
    </Modal>
  );
}

/** Convierte el texto de un campo numérico: vacío → null. */
export const toNum = (v: unknown): number | null => (v === '' || v === null || v === undefined ? null : Number(v));
export const toStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export const VALIDACION_OPTIONS = (['CONFIRMADO', 'PENDIENTE', 'PROPUESTA'] as Validacion[]).map((v) => ({ value: v, label: VALIDACION_LABELS[v] }));

/** CSV con BOM para Excel. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
