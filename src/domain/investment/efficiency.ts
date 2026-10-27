import type { DbData, EfficiencyScope, Kpi, Revenue } from '../types';
import { aggregate, periodLabel, samePeriod, within } from './kpis';

/**
 * Eficiencia y rentabilidad de un alcance (inversión atribuible + resultados del
 * MISMO alcance y periodo). Si falta un dato, la métrica dice por qué no se
 * calcula: nunca se sustituye con estimaciones.
 *
 * CPL = inversión / leads · Costo por MQL / SQL / cierre = inversión / etapa
 * CPA = inversión / clientes adquiridos
 * ROAS = ingresos atribuibles a publicidad / gasto publicitario
 * ROI = (beneficio económico atribuible − inversión) / inversión × 100
 */

export const NO_CALCULABLE = 'No calculable con los datos disponibles';

export type MetricKey = 'cpl' | 'cpmql' | 'cpsql' | 'cpcierre' | 'cpa' | 'roas' | 'roi';

export interface Metric {
  key: MetricKey;
  nombre: string;
  formula: string;
  valor: number | null;
  unidad: 'MXN' | 'x' | '%';
  /** Por qué no se calcula (si `valor` es null). */
  motivo?: string;
  /** Numerador y denominador usados (trazabilidad). */
  detalle?: string;
}

export interface Conversion {
  de: string;
  a: string;
  valor: number | null;
}

export interface ScopeEval {
  scope: EfficiencyScope;
  etapas: {
    key: keyof EfficiencyScope['etapas'];
    nombre: string;
    kpi?: Kpi;
    valor: number | null;
    motivo?: string;
  }[];
  metrics: Metric[];
  conversiones: Conversion[];
  advertencias: string[];
}

const ETAPAS: { key: keyof EfficiencyScope['etapas']; nombre: string }[] = [
  { key: 'leads', nombre: 'Leads' },
  { key: 'mql', nombre: 'MQL' },
  { key: 'sql', nombre: 'SQL' },
  { key: 'cierres', nombre: 'Cierres' },
  { key: 'clientes', nombre: 'Clientes adquiridos' },
];

const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export function evaluateScope(scope: EfficiencyScope, db: Pick<DbData, 'kpis' | 'results' | 'revenues'>): ScopeEval {
  const advertencias: string[] = [];
  if (scope.estado !== 'CONFIRMADO') advertencias.push(`La inversión atribuible está «${scope.estado === 'PENDIENTE' ? 'pendiente de validación' : 'en propuesta'}»: los costos son preliminares.`);
  if (scope.nota) advertencias.push(scope.nota);

  const etapas = ETAPAS.map(({ key, nombre }) => {
    const kpiId = scope.etapas[key];
    if (!kpiId) return { key, nombre, valor: null };
    const kpi = db.kpis.find((k) => k.id === kpiId);
    if (!kpi) return { key, nombre, valor: null, motivo: 'KPI no encontrado' };
    const results = db.results.filter((r) => r.kpiId === kpiId);
    const fuera = results.filter((r) => !within(r.periodo, scope.periodo) && r.periodo.inicio <= scope.periodo.fin && r.periodo.fin >= scope.periodo.inicio);
    const agg = aggregate(kpi, results, scope.periodo);
    if (agg.traslape)
      return {
        key,
        nombre,
        kpi,
        valor: null,
        motivo: 'Resultados con periodos traslapados (posible doble conteo)',
      };
    if (agg.valor === null)
      return {
        key,
        nombre,
        kpi,
        valor: null,
        motivo: fuera.length ? 'Resultados de otro periodo' : 'Sin resultados en el periodo',
      };
    if (!agg.cobertura || !samePeriod(agg.cobertura, scope.periodo))
      return {
        key,
        nombre,
        kpi,
        valor: null,
        motivo: `Los resultados cubren ${periodLabel(agg.cobertura ?? undefined)}, no todo el periodo de la inversión`,
      };
    if (agg.usados.some((r) => r.estado !== 'CONFIRMADO')) advertencias.push(`${nombre}: incluye resultados pendientes de validación.`);
    return { key, nombre, kpi, valor: agg.valor };
  });
  const v = (k: keyof EfficiencyScope['etapas']) => etapas.find((e) => e.key === k)!;

  const inv = scope.inversion;
  const costo = (key: MetricKey, nombre: string, etapa: keyof EfficiencyScope['etapas'], formula: string): Metric => {
    const e = v(etapa);
    if (inv === null || !(inv > 0))
      return {
        key,
        nombre,
        formula,
        valor: null,
        unidad: 'MXN',
        motivo: `${NO_CALCULABLE}: inversión atribuible no identificada.`,
      };
    if (!scope.etapas[etapa])
      return {
        key,
        nombre,
        formula,
        valor: null,
        unidad: 'MXN',
        motivo: `${NO_CALCULABLE}: el alcance no define la etapa «${e.nombre}».`,
      };
    if (e.valor === null)
      return {
        key,
        nombre,
        formula,
        valor: null,
        unidad: 'MXN',
        motivo: `${NO_CALCULABLE}: ${e.motivo ?? 'sin resultados'}.`,
      };
    if (e.valor === 0)
      return {
        key,
        nombre,
        formula,
        valor: null,
        unidad: 'MXN',
        motivo: `${NO_CALCULABLE}: ${e.nombre} = 0.`,
      };
    return {
      key,
      nombre,
      formula,
      valor: Math.round((inv / e.valor) * 100) / 100,
      unidad: 'MXN',
      detalle: `${money(inv)} / ${e.valor.toLocaleString('es-MX')}`,
    };
  };

  const revenueOf = (tipo: Revenue['tipo']) => db.revenues.filter((r) => r.scopeId === scope.id && r.tipo === tipo);
  const roas = (): Metric => {
    const base = {
      key: 'roas' as const,
      nombre: 'ROAS',
      formula: 'Ingresos atribuibles a publicidad / gasto publicitario',
      unidad: 'x' as const,
    };
    const rev = revenueOf('ingreso_publicidad');
    if (!rev.length)
      return {
        ...base,
        valor: null,
        motivo: `${NO_CALCULABLE}: no hay ingresos atribuibles a publicidad registrados y verificables.`,
      };
    if (!rev.every((r) => samePeriod(r.periodo, scope.periodo)))
      return {
        ...base,
        valor: null,
        motivo: `${NO_CALCULABLE}: los ingresos no corresponden al periodo de la inversión.`,
      };
    const gasto = scope.gastoPublicitario;
    if (!gasto || gasto <= 0)
      return {
        ...base,
        valor: null,
        motivo: `${NO_CALCULABLE}: gasto publicitario no identificado.`,
      };
    const total = rev.reduce((s, r) => s + r.monto, 0);
    if (rev.some((r) => r.estado !== 'CONFIRMADO')) advertencias.push('ROAS: ingresos pendientes de validación.');
    return {
      ...base,
      valor: Math.round((total / gasto) * 100) / 100,
      detalle: `${money(total)} / ${money(gasto)}`,
    };
  };
  const roi = (): Metric => {
    const base = {
      key: 'roi' as const,
      nombre: 'ROI',
      formula: '(Beneficio económico atribuible − inversión) / inversión × 100',
      unidad: '%' as const,
    };
    const ben = revenueOf('beneficio_economico');
    if (inv === null || !(inv > 0))
      return {
        ...base,
        valor: null,
        motivo: `${NO_CALCULABLE}: inversión atribuible no identificada.`,
      };
    if (!ben.length)
      return {
        ...base,
        valor: null,
        motivo: `${NO_CALCULABLE}: no hay beneficio económico atribuible y verificable (el ingreso bruto o la colocación hipotecaria no son beneficio de SOC).`,
      };
    if (!ben.every((r) => samePeriod(r.periodo, scope.periodo)))
      return {
        ...base,
        valor: null,
        motivo: `${NO_CALCULABLE}: el beneficio no corresponde al periodo de la inversión.`,
      };
    if (!scope.criterioRoi?.trim())
      return {
        ...base,
        valor: null,
        motivo: `${NO_CALCULABLE}: falta definir qué costos y beneficios se consideran.`,
      };
    const total = ben.reduce((s, r) => s + r.monto, 0);
    if (ben.some((r) => r.estado !== 'CONFIRMADO')) advertencias.push('ROI: beneficio pendiente de validación.');
    return {
      ...base,
      valor: Math.round(((total - inv) / inv) * 10000) / 100,
      detalle: `(${money(total)} − ${money(inv)}) / ${money(inv)} · ${scope.criterioRoi}`,
    };
  };

  const metrics: Metric[] = [
    costo('cpl', 'CPL (costo por lead)', 'leads', 'Inversión atribuible / leads'),
    costo('cpmql', 'Costo por MQL', 'mql', 'Inversión atribuible / MQL'),
    costo('cpsql', 'Costo por SQL', 'sql', 'Inversión atribuible / SQL'),
    costo('cpcierre', 'Costo por cierre', 'cierres', 'Inversión atribuible / cierres'),
    costo('cpa', 'CPA (costo por adquisición)', 'clientes', 'Inversión atribuible / clientes adquiridos'),
    roas(),
    roi(),
  ];

  const conv = (a: keyof EfficiencyScope['etapas'], b: keyof EfficiencyScope['etapas']): Conversion => {
    const x = v(a).valor;
    const y = v(b).valor;
    return {
      de: v(a).nombre,
      a: v(b).nombre,
      valor: x && y !== null ? Math.round((y / x) * 10000) / 100 : null,
    };
  };
  const conversiones = [conv('leads', 'mql'), conv('mql', 'sql'), conv('sql', 'cierres'), conv('leads', 'cierres')].filter((c) => c.valor !== null);

  return {
    scope,
    etapas,
    metrics,
    conversiones,
    advertencias: [...new Set(advertencias)],
  };
}
