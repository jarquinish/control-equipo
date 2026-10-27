import { parseDate } from '../dates';
import type { DbData, ID, InvestmentPriorityConfig, ISODate, Project } from '../types';

/**
 * Índice complementario de atención (0–100). PROPUESTA configurable por
 * Dirección: complementa —no reemplaza— la prioridad oficial (P1 Crítico, P1
 * Urgente, P1 Estratégico, P2, P3).
 *
 * Regla de diseño: la inversión tiene un peso bajo y un tope, y nunca puede pesar
 * más que el impacto estratégico; así un proyecto caro no se vuelve prioritario
 * sólo por su presupuesto.
 */
export const DEFAULT_INVESTMENT_PRIORITY: InvestmentPriorityConfig = {
  aprobado: false,
  pesos: {
    impacto: 25,
    urgencia: 15,
    dependencia: 10,
    riesgo: 15,
    avance: 5,
    kpis: 15,
    inversion: 5,
    fecha: 10,
  },
  topeInversion: 5,
};

export const PESO_LABELS: Record<keyof InvestmentPriorityConfig['pesos'], string> = {
  impacto: 'Impacto estratégico',
  urgencia: 'Urgencia',
  dependencia: 'Dependencias',
  riesgo: 'Riesgo (en riesgo / bloqueado)',
  avance: 'Avance pendiente',
  kpis: 'Contribución a KPIs',
  inversion: 'Inversión comprometida',
  fecha: 'Cercanía de la fecha objetivo',
};

/** Errores de configuración (se valida al guardar). */
export function priorityConfigErrors(c: InvestmentPriorityConfig): string[] {
  const e: string[] = [];
  const total = Object.values(c.pesos).reduce((s, x) => s + x, 0);
  if (Object.values(c.pesos).some((x) => !(x >= 0))) e.push('Los pesos no pueden ser negativos.');
  if (total !== 100) e.push(`Los pesos deben sumar 100 (suman ${total}).`);
  if (c.pesos.inversion > c.pesos.impacto) e.push('La inversión no puede pesar más que el impacto estratégico.');
  if (c.pesos.inversion > c.topeInversion) e.push(`La inversión no puede pesar más que su tope (${c.topeInversion}).`);
  return e;
}

const AVANCE: Record<Project['estado'], number> = {
  por_iniciar: 1,
  en_pausa: 0.8,
  en_riesgo: 0.7,
  en_curso: 0.5,
  completado: 0,
  archivado: 0,
};

export interface PriorityIndex {
  total: number;
  partes: Record<keyof InvestmentPriorityConfig['pesos'], number>;
}

export function priorityIndex(
  p: Project,
  ctx: {
    kpiLinks: Map<ID, { directa: number; indirecta: number }>;
    asignado: Map<ID, number>;
    maxAsignado: number;
    today: ISODate;
  },
  cfg: InvestmentPriorityConfig,
): PriorityIndex {
  const w = {
    ...cfg.pesos,
    inversion: Math.min(cfg.pesos.inversion, cfg.topeInversion),
  };
  const links = ctx.kpiLinks.get(p.id);
  const dias = p.fechaObjetivo ? Math.round((parseDate(p.fechaObjetivo).getTime() - parseDate(ctx.today).getTime()) / 86_400_000) : null;
  const factors = {
    impacto: (p.impacto - 1) / 2,
    urgencia: (p.urgencia - 1) / 2,
    dependencia: (p.dependencia - 1) / 2,
    riesgo: p.bloqueado || p.estado === 'en_riesgo' ? 1 : 0,
    avance: AVANCE[p.estado] ?? 0.5,
    kpis: links ? Math.min(1, links.directa * 0.5 + links.indirecta * 0.25) : 0,
    inversion: ctx.maxAsignado > 0 ? (ctx.asignado.get(p.id) ?? 0) / ctx.maxAsignado : 0,
    fecha: dias === null ? 0 : dias < 0 ? 1 : dias <= 14 ? 1 : dias <= 30 ? 0.6 : dias <= 60 ? 0.3 : 0.1,
  };
  const partes = Object.fromEntries(Object.entries(factors).map(([k, f]) => [k, Math.round(f * w[k as keyof typeof w] * 10) / 10])) as PriorityIndex['partes'];
  const total = Math.round(Object.values(partes).reduce((s, x) => s + x, 0));
  return { total, partes };
}

export function priorityIndexMap(db: Pick<DbData, 'projects' | 'projectKpis' | 'budgetAllocations'>, today: ISODate, cfg: InvestmentPriorityConfig): Map<ID, PriorityIndex> {
  const kpiLinks = new Map<ID, { directa: number; indirecta: number }>();
  for (const l of db.projectKpis) {
    const e = kpiLinks.get(l.projectId) ?? { directa: 0, indirecta: 0 };
    e[l.contribucion]++;
    kpiLinks.set(l.projectId, e);
  }
  const asignado = new Map<ID, number>();
  for (const a of db.budgetAllocations) asignado.set(a.projectId, (asignado.get(a.projectId) ?? 0) + a.monto);
  const maxAsignado = Math.max(0, ...asignado.values());
  return new Map(db.projects.map((p) => [p.id, priorityIndex(p, { kpiLinks, asignado, maxAsignado, today }, cfg)]));
}
