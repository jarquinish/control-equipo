import { addDaysISO, parseDate, toISODate } from '../dates';
import { isActiveProject, isBlockOpen } from '../selectors';
import type { DbData, ID, ISODate, Kpi, KpiTarget, Periodo, ResultRecord } from '../types';

/**
 * KPIs: meta vs. resultado por periodo.
 *
 * - Un resultado se compara con la meta de su MISMO periodo. Si la meta es de un
 *   periodo mayor (p. ej. anual) se agregan los resultados contenidos en él, sólo
 *   si no se traslapan (evita doble conteo) y según la agregación del KPI.
 * - Cumplimiento: «mayor es mejor» = real/meta; «menor es mejor» = meta/real;
 *   «rango» = dentro del rango → 100 %.
 * - Periodo en curso: se compara contra la meta proporcional al tiempo
 *   transcurrido (sólo para KPIs de suma) y se rotula como proyección.
 */

export type KpiEstado = 'cumplido' | 'en_riesgo' | 'debajo' | 'en_curso' | 'sin_meta' | 'sin_dato' | 'periodo_incompatible';

export const KPI_ESTADO_LABELS: Record<KpiEstado, string> = {
  cumplido: 'Cumplido',
  en_riesgo: 'En riesgo',
  debajo: 'Debajo de meta',
  en_curso: 'En curso',
  sin_meta: 'Sin meta',
  sin_dato: 'Sin resultado',
  periodo_incompatible: 'Periodos incompatibles',
};

export const KPI_GRUPOS: Record<Kpi['grupo'], string> = {
  A: 'Posicionamiento de marca',
  B: 'Atracción y generación de demanda',
  C: 'Atracción de franquicias',
  D: 'Desarrollo y retención',
  E: 'Contenido y comunicación',
  F: 'Eficiencia operativa',
};

export const KPI_TIPOS: Record<Kpi['tipo'], string> = {
  actividad: 'Actividad',
  desempeno: 'Desempeño',
  eficiencia: 'Eficiencia',
  rentabilidad: 'Rentabilidad',
  marca: 'Estratégico de marca',
};

/** Umbral de «en riesgo»: por debajo del 90 % de la meta (o de la meta proporcional). */
export const UMBRAL_RIESGO = 0.9;

export const within = (inner: Periodo, outer: Periodo) => inner.inicio >= outer.inicio && inner.fin <= outer.fin;
export const samePeriod = (a: Periodo, b: Periodo) => a.inicio === b.inicio && a.fin === b.fin;
export const overlaps = (a: Periodo, b: Periodo) => a.inicio <= b.fin && b.inicio <= a.fin;

export function periodLabel(p: Periodo | undefined): string {
  if (!p) return '—';
  if (p.etiqueta) return p.etiqueta;
  return p.inicio === p.fin ? p.inicio : `${p.inicio} a ${p.fin}`;
}

/**
 * Agrega resultados de un KPI dentro de un periodo. Devuelve `null` si hay
 * traslapes (doble conteo) o si no hay resultados.
 */
export function aggregate(
  kpi: Pick<Kpi, 'agregacion'>,
  results: ResultRecord[],
  periodo: Periodo,
): {
  valor: number | null;
  usados: ResultRecord[];
  cobertura: Periodo | null;
  traslape: boolean;
} {
  const inside = results.filter((r) => within(r.periodo, periodo)).sort((a, b) => a.periodo.inicio.localeCompare(b.periodo.inicio));
  if (!inside.length) return { valor: null, usados: [], cobertura: null, traslape: false };
  // Si hay un resultado del periodo exacto, ése manda (no se suman desgloses del mismo periodo).
  const exact = inside.find((r) => samePeriod(r.periodo, periodo));
  if (exact)
    return {
      valor: exact.valor,
      usados: [exact],
      cobertura: exact.periodo,
      traslape: false,
    };
  const set = pickNonOverlapping(inside);
  if (set.traslape) return { valor: null, usados: inside, cobertura: null, traslape: true };
  const usados = set.items;
  const valor = kpi.agregacion === 'suma' ? usados.reduce((s, r) => s + r.valor, 0) : usados[usados.length - 1].valor;
  return {
    valor,
    usados,
    cobertura: {
      inicio: usados[0].periodo.inicio,
      fin: usados[usados.length - 1].periodo.fin,
    },
    traslape: false,
  };
}

/**
 * Resultados ordenados sin traslape. Si hay desgloses (p. ej. trimestres y meses
 * del mismo año) se usa la serie más fina que cubre sin huecos; si los registros
 * se traslapan de forma irregular, se reporta traslape.
 */
function pickNonOverlapping(items: ResultRecord[]): {
  items: ResultRecord[];
  traslape: boolean;
} {
  if (items.every((r, i) => i === 0 || !overlaps(items[i - 1].periodo, r.periodo))) return { items, traslape: false };
  const byLen = new Map<number, ResultRecord[]>();
  const len = (r: ResultRecord) => Math.round((parseDate(r.periodo.fin).getTime() - parseDate(r.periodo.inicio).getTime()) / 86_400_000);
  for (const r of items) {
    const k = Math.round(len(r) / 27); // agrupa por granularidad (mes ≈ 1, trimestre ≈ 3…)
    byLen.set(k, [...(byLen.get(k) ?? []), r]);
  }
  // De la serie más fina a la más gruesa: la primera sin traslapes que cubra lo mismo que las demás.
  const series = [...byLen.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  for (const serie of series) {
    let ok = true;
    for (let i = 1; i < serie.length; i++) if (overlaps(serie[i - 1].periodo, serie[i].periodo)) ok = false;
    if (ok) {
      const others = items.filter((r) => !serie.includes(r));
      const covered = (r: ResultRecord) => serie.some((s) => overlaps(s.periodo, r.periodo));
      if (others.every(covered)) return { items: serie, traslape: false };
    }
  }
  return { items, traslape: true };
}

export interface KpiEval {
  kpi: Kpi;
  target?: KpiTarget;
  periodo?: Periodo;
  real: number | null;
  meta: number | null;
  /** Meta proporcional al avance del periodo (sólo periodos en curso de KPIs de suma). */
  metaProporcional: number | null;
  cumplimiento: number | null;
  estado: KpiEstado;
  resultados: ResultRecord[];
  pendienteValidacion: boolean;
  avisos: string[];
}

function cumplimiento(kpi: Kpi, real: number, meta: number): number | null {
  if (kpi.sentido === 'rango') {
    const min = kpi.rangoMin ?? -Infinity;
    const max = kpi.rangoMax ?? Infinity;
    return real >= min && real <= max ? 1 : 0;
  }
  if (kpi.sentido === 'menor') return real > 0 ? meta / real : null;
  return meta > 0 ? real / meta : null;
}

/** Evalúa un KPI contra la meta cuyo periodo cubre `filtro` (o la más reciente). */
export function evaluateKpi(kpi: Kpi, targets: KpiTarget[], results: ResultRecord[], today: ISODate, filtro?: Periodo): KpiEval {
  const mine = results.filter((r) => r.kpiId === kpi.id && (!filtro || overlaps(r.periodo, filtro)));
  const ts = targets.filter((t) => t.kpiId === kpi.id && (!filtro || overlaps(t.periodo, filtro))).sort((a, b) => b.periodo.fin.localeCompare(a.periodo.fin));
  const avisos: string[] = [];
  const pendienteValidacion = mine.some((r) => r.estado !== 'CONFIRMADO');
  if (!kpi.fuente?.trim()) avisos.push('KPI sin fuente definida.');

  const target = ts.find((t) => t.periodo.inicio <= today) ?? ts[0];
  if (!target) {
    // Sin meta: con filtro de periodo se muestra lo acumulado en él (sin doble conteo); si no, el último dato.
    const agg = filtro ? aggregate(kpi, mine, filtro) : null;
    if (agg && agg.valor !== null && agg.cobertura)
      return {
        kpi,
        real: agg.valor,
        meta: null,
        metaProporcional: null,
        cumplimiento: null,
        estado: 'sin_meta',
        resultados: mine,
        pendienteValidacion: agg.usados.some((r) => r.estado !== 'CONFIRMADO'),
        avisos,
        periodo: agg.cobertura,
      };
    const last = [...mine].sort((a, b) => b.periodo.fin.localeCompare(a.periodo.fin))[0];
    return {
      kpi,
      real: last?.valor ?? null,
      meta: null,
      metaProporcional: null,
      cumplimiento: null,
      estado: last ? 'sin_meta' : 'sin_dato',
      resultados: mine,
      pendienteValidacion,
      avisos,
      periodo: last?.periodo,
    };
  }
  const agg = aggregate(kpi, mine, target.periodo);
  if (agg.traslape) avisos.push('Hay resultados con periodos traslapados: no se suman para evitar doble conteo.');
  const partial = mine.filter((r) => overlaps(r.periodo, target.periodo) && !within(r.periodo, target.periodo));
  if (partial.length) avisos.push(`${partial.length} resultado(s) abarcan fechas fuera del periodo de la meta: no se incluyen.`);
  const base = {
    kpi,
    target,
    periodo: target.periodo,
    meta: target.meta,
    resultados: mine,
    pendienteValidacion,
    avisos,
  };
  if (agg.traslape)
    return {
      ...base,
      real: null,
      metaProporcional: null,
      cumplimiento: null,
      estado: 'periodo_incompatible',
    };
  if (agg.valor === null)
    return {
      ...base,
      real: null,
      metaProporcional: null,
      cumplimiento: null,
      estado: partial.length ? 'periodo_incompatible' : 'sin_dato',
    };

  const enCurso = today < target.periodo.fin;
  const coberturaFin = agg.cobertura?.fin ?? target.periodo.fin;
  const incompleto = coberturaFin < target.periodo.fin;
  let metaProporcional: number | null = null;
  let c = cumplimiento(kpi, agg.valor, target.meta);
  let estado: KpiEstado;
  if (incompleto && kpi.agregacion === 'suma' && kpi.sentido === 'mayor') {
    // Resultados hasta una fecha intermedia: comparar contra la meta proporcional a esa fecha.
    const total = parseDate(target.periodo.fin).getTime() - parseDate(target.periodo.inicio).getTime() + 86_400_000;
    const trans = parseDate(coberturaFin).getTime() - parseDate(target.periodo.inicio).getTime() + 86_400_000;
    metaProporcional = Math.round(target.meta * Math.min(1, trans / total) * 100) / 100;
    const cp = cumplimiento(kpi, agg.valor, metaProporcional);
    estado = c !== null && c >= 1 ? 'cumplido' : cp === null ? 'en_curso' : cp >= 1 ? 'en_curso' : cp >= UMBRAL_RIESGO ? 'en_riesgo' : 'debajo';
    avisos.push(`Resultados al ${coberturaFin}: se comparan contra la meta proporcional (${metaProporcional}).`);
    c = cp;
  } else if (incompleto || (enCurso && kpi.agregacion === 'ultimo')) {
    estado = c !== null && c >= 1 ? 'cumplido' : 'en_curso';
    if (incompleto) avisos.push(`Resultados al ${coberturaFin}; el periodo de la meta termina el ${target.periodo.fin}.`);
  } else {
    estado = c === null ? 'sin_dato' : c >= 1 ? 'cumplido' : c >= UMBRAL_RIESGO ? 'en_riesgo' : 'debajo';
  }
  return {
    ...base,
    real: agg.valor,
    metaProporcional,
    cumplimiento: c,
    estado,
  };
}

export function evaluateAll(db: Pick<DbData, 'kpis' | 'kpiTargets' | 'results'>, today: ISODate, filtro?: Periodo): KpiEval[] {
  return db.kpis.filter((k) => k.activo).map((k) => evaluateKpi(k, db.kpiTargets, db.results, today, filtro));
}

/** Serie temporal (resultados ordenados) para tendencia. */
export function kpiSeries(kpiId: ID, results: ResultRecord[]): ResultRecord[] {
  return results.filter((r) => r.kpiId === kpiId).sort((a, b) => a.periodo.inicio.localeCompare(b.periodo.inicio) || a.periodo.fin.localeCompare(b.periodo.fin));
}

/** Proyectos ↔ KPIs (por id, tabla de asociación). */
export function kpiProjects(db: Pick<DbData, 'projectKpis'>, kpiId: ID): ID[] {
  return [...new Set(db.projectKpis.filter((l) => l.kpiId === kpiId).map((l) => l.projectId))];
}
export function projectKpiIds(db: Pick<DbData, 'projectKpis'>, projectId: ID): ID[] {
  return [...new Set(db.projectKpis.filter((l) => l.projectId === projectId).map((l) => l.kpiId))];
}

/**
 * Indicadores de eficiencia operativa calculados con los datos de la propia
 * herramienta (no se capturan): fuente = Alignment & Unblock, siempre al día.
 */
export interface OperationalKpi {
  clave: string;
  nombre: string;
  valor: number | null;
  unidad: string;
  definicion: string;
}

export function operationalKpis(db: DbData, now: Date, areaId?: ID): OperationalKpi[] {
  const today = toISODate(now);
  const projects = db.projects.filter((p) => !areaId || p.areaId === areaId);
  const ids = new Set(projects.map((p) => p.id));
  const active = projects.filter(isActiveProject);
  const concluidos = projects.filter((p) => p.estado === 'completado');
  const retrasados = active.filter((p) => p.fechaObjetivo && p.fechaObjetivo < today);
  const blocks = db.blocks.filter((b) => ids.has(b.projectId));
  const abiertos = blocks.filter(isBlockOpen);
  const resueltos = blocks.filter((b) => b.estado === 'resuelto' && b.resolvedAt);
  const dias = resueltos.map((b) => (new Date(b.resolvedAt!).getTime() - new Date(b.createdAt).getTime()) / 86_400_000);
  const commits = db.commitments.filter((c) => ids.has(c.projectId));
  const cerrados = commits.filter((c) => c.estado === 'cumplido' || c.estado === 'incumplido');
  const p1 = active.filter((p) => (p.clasif ? p.clasif.integrada !== 'P2' && p.clasif.integrada !== 'P3' : p.prioridadFinal === 'P1'));
  const desde = addDaysISO(today, -14);
  const p1Atendidos = p1.filter((p) => db.commitments.some((c) => c.projectId === p.id && (c.updatedAt ?? c.createdAt).slice(0, 10) >= desde));
  return [
    {
      clave: 'F-CONC',
      nombre: 'Proyectos concluidos',
      valor: concluidos.length,
      unidad: 'proyectos',
      definicion: 'Proyectos con estado «Completado».',
    },
    {
      clave: 'F-RETR',
      nombre: 'Proyectos retrasados',
      valor: retrasados.length,
      unidad: 'proyectos',
      definicion: 'Proyectos activos con fecha objetivo vencida.',
    },
    {
      clave: 'F-BLOQ',
      nombre: 'Bloqueos abiertos',
      valor: abiertos.length,
      unidad: 'bloqueos',
      definicion: 'Bloqueos por destrabar, en gestión o escalados.',
    },
    {
      clave: 'F-TRES',
      nombre: 'Tiempo medio de resolución de bloqueos',
      valor: dias.length ? Math.round((dias.reduce((s, d) => s + d, 0) / dias.length) * 10) / 10 : null,
      unidad: 'días',
      definicion: 'Promedio de días entre el registro y la resolución de los bloqueos resueltos.',
    },
    {
      clave: 'F-CUMP',
      nombre: 'Cumplimiento de entregables (compromisos)',
      valor: cerrados.length ? Math.round((cerrados.filter((c) => c.estado === 'cumplido').length / cerrados.length) * 1000) / 10 : null,
      unidad: '%',
      definicion: 'Compromisos cumplidos entre compromisos cerrados (cumplidos + incumplidos).',
    },
    {
      clave: 'F-P1AT',
      nombre: 'Prioridades P1 atendidas (últimos 14 días)',
      valor: p1.length ? Math.round((p1Atendidos.length / p1.length) * 1000) / 10 : null,
      unidad: '%',
      definicion: 'Proyectos P1 activos con algún compromiso creado o actualizado en los últimos 14 días.',
    },
    {
      clave: 'F-DESF',
      nombre: 'Desviación de fechas',
      valor: active.filter((p) => p.fechaObjetivo).length ? Math.round((retrasados.length / active.filter((p) => p.fechaObjetivo).length) * 1000) / 10 : null,
      unidad: '%',
      definicion: 'Proyectos activos con fecha vencida entre proyectos activos con fecha objetivo.',
    },
  ];
}
