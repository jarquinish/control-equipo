import { newId } from '../data/ids';
import { isValidDate } from '../domain/dates';
import { allocationError, budgetSummary } from '../domain/investment/budget';
import { DEFAULT_INVESTMENT_PRIORITY, priorityConfigErrors } from '../domain/investment/priorityIndex';
import { normText as normName } from '../domain/investment/contable';
import { assertValid, ValidationError, type FieldErrors } from '../domain/validation';
import { DIRECTION_ONLY_COLLECTIONS, INVESTMENT_COLLECTIONS, type CollectionName, type DbData, type EntityOf, type ID, type InvestmentPriorityConfig, type Periodo } from '../domain/types';
import type { ContableReport } from '../domain/investment/contable';
import type { SpendRecord } from '../domain/types';
import { isDirector } from './classification';
import type { ServiceContext } from './context';

export type InvestmentCollection =
  | 'objectives'
  | 'kpis'
  | 'kpiTargets'
  | 'results'
  | 'budgetLines'
  | 'budgetMovements'
  | 'spend'
  | 'budgetCommitments'
  | 'budgetAllocations'
  | 'projectKpis'
  | 'projectAreas'
  | 'revenues'
  | 'efficiencyScopes';

type Input<C extends InvestmentCollection> = Omit<EntityOf<C>, 'id' | 'createdAt' | 'updatedAt'> & { id?: ID };

const PREFIX: Record<InvestmentCollection, string> = {
  objectives: 'obj',
  kpis: 'kpi',
  kpiTargets: 'meta',
  results: 'res',
  budgetLines: 'ptda',
  budgetMovements: 'mov',
  spend: 'gto',
  budgetCommitments: 'comp',
  budgetAllocations: 'asig',
  projectKpis: 'pkpi',
  projectAreas: 'parea',
  revenues: 'ing',
  efficiencyScopes: 'alc',
};

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const periodErrors = (p: Periodo | undefined, e: FieldErrors, key = 'periodo') => {
  if (!p || !isValidDate(p.inicio) || !isValidDate(p.fin)) e[key] = 'Indica fechas de inicio y fin válidas.';
  else if (p.inicio > p.fin) e[key] = 'La fecha de inicio no puede ser posterior a la de fin.';
};
const samePeriod = (a: Periodo, b: Periodo) => a.inicio === b.inicio && a.fin === b.fin;

/**
 * Inversión, KPIs y Resultados: altas y cambios con validación de integridad
 * (también reforzada en el servidor, ver supabase/migrations/0004).
 */
export function investmentService(ctx: ServiceContext) {
  const db = () => ctx.store.getState();
  const director = () => isDirector(ctx);

  const requirePermission = (c: InvestmentCollection, estado?: string) => {
    if (DIRECTION_ONLY_COLLECTIONS.includes(c) && !director())
      throw new ValidationError({
        permiso: 'Sólo Dirección o Administración modifican cifras financieras, KPIs y metas.',
      });
    if (c === 'results' && estado === 'CONFIRMADO' && !director())
      throw new ValidationError({
        estado: 'Sólo Dirección confirma resultados; captúralo como «Pendiente de validación».',
      });
  };

  const exists = <C extends CollectionName>(c: C, id: ID | undefined) => !!id && !!ctx.store.get(c, id);
  const others = <C extends InvestmentCollection>(c: C, id: ID | undefined) => (db()[c] as EntityOf<C>[]).filter((x) => x.id !== id);

  /** Validación por colección. `item` incluye el id final (nuevo o existente). */
  function validate<C extends InvestmentCollection>(c: C, raw: Input<C> & { id: ID }): FieldErrors {
    const e: FieldErrors = {};
    const d = db();
    const item = raw as unknown as Record<string, unknown> & { id: ID };
    const fuenteReq = () => {
      if (!text(item.fuente)) e.fuente = 'Indica la fuente del dato (trazabilidad).';
    };
    switch (c) {
      case 'objectives': {
        if (!text(item.nombre)) e.nombre = 'Escribe el objetivo.';
        if (!text(item.clave)) e.clave = 'Indica una clave.';
        else if (others('objectives', item.id).some((o) => normName(o.clave) === normName(item.clave))) e.clave = 'Ya existe un objetivo con esa clave.';
        break;
      }
      case 'kpis': {
        const k = raw as unknown as EntityOf<'kpis'>;
        if (!text(k.nombre)) e.nombre = 'Escribe el nombre del KPI.';
        if (!text(k.clave)) e.clave = 'Indica una clave.';
        else if (others('kpis', k.id).some((o) => normName(o.clave) === normName(k.clave))) e.clave = 'Ya existe un KPI con esa clave.';
        if (!text(k.definicion)) e.definicion = 'Define qué mide el KPI.';
        if (!text(k.unidad)) e.unidad = 'Indica la unidad de medida.';
        if (!text(k.fuente)) e.fuente = 'Un KPI sin fuente no es trazable: indica de dónde sale el dato.';
        if (k.sentido === 'rango' && !(finite(k.rangoMin) && finite(k.rangoMax) && k.rangoMin <= k.rangoMax)) e.rangoMin = 'Para «rango objetivo» indica mínimo y máximo.';
        if (k.objetivoId && !exists('objectives', k.objetivoId)) e.objetivoId = 'El objetivo no existe.';
        if (k.areaIds.some((a) => !exists('areas', a))) e.areaIds = 'Alguna gerencia no existe.';
        break;
      }
      case 'kpiTargets': {
        const t = raw as unknown as EntityOf<'kpiTargets'>;
        if (!exists('kpis', t.kpiId)) e.kpiId = 'Selecciona el KPI.';
        if (!finite(t.meta)) e.meta = 'Indica la meta.';
        periodErrors(t.periodo, e);
        fuenteReq();
        if (!e.periodo && others('kpiTargets', t.id).some((o) => o.kpiId === t.kpiId && samePeriod(o.periodo, t.periodo))) e.periodo = 'Ese KPI ya tiene meta para ese periodo.';
        break;
      }
      case 'results': {
        const r = raw as unknown as EntityOf<'results'>;
        if (!text(r.metrica)) e.metrica = 'Indica qué se midió.';
        if (!finite(r.valor)) e.valor = 'Indica el valor.';
        if (!text(r.unidad)) e.unidad = 'Indica la unidad.';
        if (r.kpiId && !exists('kpis', r.kpiId)) e.kpiId = 'El KPI no existe.';
        if (r.projectId && !exists('projects', r.projectId)) e.projectId = 'El proyecto no existe.';
        periodErrors(r.periodo, e);
        fuenteReq();
        if (!e.periodo) {
          const dup = others('results', r.id).find((o) =>
            r.kpiId
              ? o.kpiId === r.kpiId && samePeriod(o.periodo, r.periodo)
              : !o.kpiId && normName(o.metrica) === normName(r.metrica) && samePeriod(o.periodo, r.periodo) && normName(o.fuente) === normName(r.fuente),
          );
          if (dup) e.periodo = 'Ya existe un resultado para ese KPI y periodo: edítalo en lugar de duplicarlo.';
        }
        break;
      }
      case 'budgetLines': {
        const l = raw as unknown as EntityOf<'budgetLines'>;
        if (!text(l.nombre)) e.nombre = 'Escribe el nombre de la partida.';
        if (!text(l.clave)) e.clave = 'Indica la clave.';
        else if (others('budgetLines', l.id).some((o) => normName(o.clave) === normName(l.clave))) e.clave = 'Ya existe una partida con esa clave.';
        if (!finite(l.original) || l.original < 0) e.original = 'El presupuesto inicial debe ser cero o mayor.';
        const usadas = new Map(others('budgetLines', l.id).flatMap((o) => o.categoriasContables.map((cat) => [normName(cat), o.nombre] as const)));
        const rep = l.categoriasContables.find((cat) => usadas.has(normName(cat)));
        if (rep) e.categoriasContables = `La categoría «${rep}» ya pertenece a «${usadas.get(normName(rep))}» (se contaría dos veces).`;
        if (l.areaId && !exists('areas', l.areaId)) e.areaId = 'La gerencia no existe.';
        fuenteReq();
        break;
      }
      case 'budgetMovements': {
        const m = raw as unknown as EntityOf<'budgetMovements'>;
        if (!text(m.folio)) e.folio = 'Indica el folio.';
        else if (others('budgetMovements', m.id).some((o) => normName(o.folio) === normName(m.folio))) e.folio = 'Ya existe un movimiento con ese folio.';
        if (!text(m.concepto)) e.concepto = 'Describe el movimiento.';
        const needMonto = m.tipo !== 'reclasificacion' || !m.deCategoria;
        if (needMonto && !(finite(m.monto) && m.monto > 0)) e.monto = 'El monto debe ser mayor que cero.';
        if (m.monto !== undefined && m.monto !== null && !(finite(m.monto) && m.monto > 0)) e.monto = 'El monto debe ser mayor que cero.';
        if (m.tipo === 'ampliacion' && !exists('budgetLines', m.aLineaId)) e.aLineaId = 'Selecciona la partida que recibe la ampliación.';
        if (m.tipo === 'reduccion' && !exists('budgetLines', m.deLineaId)) e.deLineaId = 'Selecciona la partida que se reduce.';
        if (m.tipo === 'transferencia') {
          if (!exists('budgetLines', m.deLineaId)) e.deLineaId = 'Selecciona la partida de origen.';
          if (!exists('budgetLines', m.aLineaId)) e.aLineaId = 'Selecciona la partida de destino.';
          if (m.deLineaId && m.deLineaId === m.aLineaId) e.aLineaId = 'Origen y destino deben ser distintos.';
        }
        if (m.tipo === 'reclasificacion') {
          if (!exists('budgetLines', m.aLineaId)) e.aLineaId = 'Selecciona la partida a la que se reclasifica el gasto.';
          if (!m.deLineaId && !text(m.deCategoria)) e.deLineaId = 'Indica la partida o categoría contable de origen.';
          if (m.deLineaId && m.deLineaId === m.aLineaId) e.aLineaId = 'Origen y destino deben ser distintos.';
        }
        fuenteReq();
        if (!Object.keys(e).length && m.estado === 'CONFIRMADO' && (m.tipo === 'reduccion' || m.tipo === 'transferencia')) {
          // Un movimiento no puede dejar una partida con vigente negativo.
          const sim = budgetSummary({
            ...d,
            budgetMovements: [...others('budgetMovements', m.id), m],
          });
          const neg = sim.lines.find((l) => l.vigente < -0.005);
          if (neg) e.monto = `La partida «${neg.line.nombre}» quedaría con presupuesto vigente negativo.`;
        }
        break;
      }
      case 'spend': {
        const s = raw as unknown as EntityOf<'spend'>;
        if (!text(s.categoria)) e.categoria = 'Indica la categoría contable.';
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s.mes ?? '')) e.mes = 'Indica el mes (AAAA-MM).';
        if (!finite(s.monto)) e.monto = 'Indica el monto.';
        fuenteReq();
        if (others('spend', s.id).some((o) => normName(o.categoria) === normName(s.categoria) && o.mes === s.mes)) e.mes = 'Ya hay gasto registrado para esa categoría y mes (se contaría dos veces).';
        break;
      }
      case 'budgetCommitments': {
        const b = raw as unknown as EntityOf<'budgetCommitments'>;
        if (!exists('budgetLines', b.lineaId)) e.lineaId = 'Selecciona la partida.';
        if (b.projectId && !exists('projects', b.projectId)) e.projectId = 'El proyecto no existe.';
        if (!text(b.concepto)) e.concepto = 'Describe el compromiso de gasto.';
        if (!(finite(b.monto) && b.monto > 0)) e.monto = 'El monto debe ser mayor que cero.';
        if (!isValidDate(b.fecha)) e.fecha = 'Indica la fecha.';
        fuenteReq();
        if (!Object.keys(e).length && b.situacion === 'comprometido') {
          const prev = d.budgetCommitments.find((o) => o.id === b.id);
          const l = budgetSummary(d).lines.find((x) => x.line.id === b.lineaId)!;
          const libre = l.disponible + (prev && prev.lineaId === b.lineaId && prev.situacion === 'comprometido' ? prev.monto : 0);
          if (!l.line.revolvente && b.monto > libre + 0.005)
            e.monto = `Supera el disponible de la partida (${libre.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}). Autoriza antes una transferencia.`;
        }
        break;
      }
      case 'budgetAllocations': {
        const a = raw as unknown as EntityOf<'budgetAllocations'>;
        if (!exists('budgetLines', a.lineaId)) e.lineaId = 'Selecciona la partida.';
        if (!exists('projects', a.projectId)) e.projectId = 'Selecciona el proyecto.';
        if (others('budgetAllocations', a.id).some((o) => o.lineaId === a.lineaId && o.projectId === a.projectId)) e.projectId = 'Ese proyecto ya tiene asignación de esa partida: edítala.';
        if (!Object.keys(e).length) {
          const prev = d.budgetAllocations.find((o) => o.id === a.id);
          const err = allocationError(budgetSummary(d), a.lineaId, a.monto, prev && prev.lineaId === a.lineaId ? prev.monto : 0);
          if (err) e.monto = err;
        }
        break;
      }
      case 'projectKpis': {
        const l = raw as unknown as EntityOf<'projectKpis'>;
        if (!exists('projects', l.projectId)) e.projectId = 'Selecciona el proyecto.';
        if (!exists('kpis', l.kpiId)) e.kpiId = 'Selecciona el KPI.';
        if (others('projectKpis', l.id).some((o) => o.projectId === l.projectId && o.kpiId === l.kpiId)) e.kpiId = 'El proyecto ya está vinculado a ese KPI.';
        break;
      }
      case 'projectAreas': {
        const l = raw as unknown as EntityOf<'projectAreas'>;
        const p = ctx.store.get('projects', l.projectId);
        if (!p) e.projectId = 'Selecciona el proyecto.';
        if (!exists('areas', l.areaId)) e.areaId = 'Selecciona la gerencia.';
        else if (p && p.areaId === l.areaId) e.areaId = 'Es la gerencia responsable del proyecto.';
        if (others('projectAreas', l.id).some((o) => o.projectId === l.projectId && o.areaId === l.areaId)) e.areaId = 'Esa gerencia ya colabora en el proyecto.';
        break;
      }
      case 'revenues': {
        const r = raw as unknown as EntityOf<'revenues'>;
        if (!text(r.concepto)) e.concepto = 'Describe el ingreso o beneficio.';
        else if (/colocaci|cr[eé]dito hipotecario/i.test(r.concepto)) e.concepto = 'La colocación hipotecaria no es ingreso de SOC: registra sólo ingresos o beneficios propios y verificables.';
        if (!(finite(r.monto) && r.monto >= 0)) e.monto = 'Indica el monto.';
        if (r.scopeId && !exists('efficiencyScopes', r.scopeId)) e.scopeId = 'El alcance no existe.';
        periodErrors(r.periodo, e);
        fuenteReq();
        break;
      }
      case 'efficiencyScopes': {
        const s = raw as unknown as EntityOf<'efficiencyScopes'>;
        if (!text(s.nombre)) e.nombre = 'Nombra el alcance.';
        periodErrors(s.periodo, e);
        if (s.inversion !== null && !(finite(s.inversion) && s.inversion >= 0)) e.inversion = 'La inversión debe ser un monto o quedar vacía.';
        if (s.gastoPublicitario != null && !(finite(s.gastoPublicitario) && s.gastoPublicitario >= 0)) e.gastoPublicitario = 'Monto inválido.';
        if (s.gastoPublicitario != null && s.inversion != null && s.gastoPublicitario > s.inversion) e.gastoPublicitario = 'El gasto publicitario no puede superar la inversión del alcance.';
        if (Object.values(s.etapas).some((id) => id && !exists('kpis', id))) e.etapas = 'Algún KPI del embudo no existe.';
        if (s.projectIds.some((id) => !exists('projects', id))) e.projectIds = 'Algún proyecto no existe.';
        if (s.lineaIds.some((id) => !exists('budgetLines', id))) e.lineaIds = 'Alguna partida no existe.';
        fuenteReq();
        break;
      }
    }
    return e;
  }

  function save<C extends InvestmentCollection>(c: C, input: Input<C>): EntityOf<C> {
    const prev = input.id ? (ctx.store.get(c, input.id) as (EntityOf<C> & { estado?: string }) | undefined) : undefined;
    if (c === 'results' && prev?.estado === 'CONFIRMADO' && !director())
      throw new ValidationError({
        estado: 'Este resultado ya fue confirmado por Dirección; sólo Dirección lo modifica.',
      });
    requirePermission(c, (input as { estado?: string }).estado);
    const id = input.id ?? newId(PREFIX[c]);
    const candidate = { ...input, id } as Input<C> & { id: ID };
    assertValid(validate(c, candidate));
    const now = ctx.nowIso();
    const item = {
      ...prev,
      ...candidate,
      id,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    } as unknown as EntityOf<C>;
    return prev ? ctx.store.update(c, id, item) : ctx.store.insert(c, item);
  }

  /** Dependencias que impiden borrar (para no dejar relaciones huérfanas). */
  function dependents(c: InvestmentCollection, id: ID): string[] {
    const d = db();
    const n = (label: string, count: number) => (count ? [`${count} ${label}`] : []);
    switch (c) {
      case 'kpis':
        return [
          ...n('resultado(s)', d.results.filter((r) => r.kpiId === id).length),
          ...n('meta(s)', d.kpiTargets.filter((r) => r.kpiId === id).length),
          ...n('vínculo(s) con proyectos', d.projectKpis.filter((r) => r.kpiId === id).length),
          ...n('alcance(s) de eficiencia', d.efficiencyScopes.filter((s) => Object.values(s.etapas).includes(id)).length),
        ];
      case 'budgetLines':
        return [
          ...n('movimiento(s)', d.budgetMovements.filter((m) => m.deLineaId === id || m.aLineaId === id).length),
          ...n('asignación(es)', d.budgetAllocations.filter((a) => a.lineaId === id).length),
          ...n('compromiso(s) de gasto', d.budgetCommitments.filter((a) => a.lineaId === id).length),
        ];
      case 'objectives':
        return n('KPI(s)', d.kpis.filter((k) => k.objetivoId === id).length);
      case 'efficiencyScopes':
        return n('ingreso(s) atribuible(s)', d.revenues.filter((r) => r.scopeId === id).length);
      default:
        return [];
    }
  }

  function remove(c: InvestmentCollection, id: ID): void {
    const prev = ctx.store.get(c, id) as { estado?: string } | undefined;
    if (!prev) return;
    requirePermission(c);
    if (c === 'results' && prev.estado === 'CONFIRMADO' && !director())
      throw new ValidationError({
        estado: 'Sólo Dirección elimina resultados confirmados.',
      });
    const deps = dependents(c, id);
    if (deps.length)
      throw new ValidationError({
        dependencias: `No se puede eliminar: tiene ${deps.join(', ')}.`,
      });
    ctx.store.remove(c, id);
  }

  return {
    canManageFinance: director,
    validate,
    save,
    remove,
    dependents,

    /** Configuración del índice complementario de atención. */
    priorityConfig(): InvestmentPriorityConfig {
      return ctx.settings().investmentPriority ?? DEFAULT_INVESTMENT_PRIORITY;
    },
    savePriorityConfig(cfg: InvestmentPriorityConfig) {
      if (!director())
        throw new ValidationError({
          permiso: 'Sólo Dirección configura el índice.',
        });
      const errs = priorityConfigErrors(cfg);
      if (errs.length) throw new ValidationError({ pesos: errs[0] });
      ctx.repos.settings.update('settings', {
        investmentPriority: cfg,
        updatedAt: ctx.nowIso(),
      });
    },

    /** Compara un reporte contable con el gasto registrado: meses nuevos, iguales y con cambios. */
    planSpend(report: ContableReport, fuente: string): SpendPlan {
      const d = db();
      const cats = new Set(d.budgetLines.flatMap((l) => l.categoriasContables.map(normName)));
      const nuevos: SpendRecord[] = [];
      const cambios: { actual: SpendRecord; monto: number }[] = [];
      let iguales = 0;
      const now = ctx.nowIso();
      for (const c of report.categorias)
        report.meses.forEach((mes, i) => {
          const monto = c.mensual[i];
          const actual = d.spend.find((s) => normName(s.categoria) === normName(c.nombre) && s.mes === mes);
          if (actual) {
            if (Math.abs(actual.monto - monto) < 0.005) iguales++;
            else cambios.push({ actual, monto });
          } else if (monto !== 0) {
            nuevos.push({
              id: newId('gto'),
              categoria: c.nombre,
              mes,
              monto,
              fuente: `${fuente} · hoja ${report.hoja}`,
              corte: report.corte,
              estado: 'CONFIRMADO',
              createdAt: now,
              updatedAt: now,
            });
          }
        });
      const sinPartida = report.categorias.filter((c) => !cats.has(normName(c.nombre)) && c.total !== 0).map((c) => c.nombre);
      return {
        nuevos,
        cambios,
        iguales,
        sinPartida,
        corte: report.corte,
        total: report.total,
      };
    },
    /** Agrega los meses nuevos; las correcciones de meses ya registrados sólo con confirmación explícita (quedan anotadas). */
    applySpend(plan: SpendPlan, aplicarCambios: boolean): number {
      if (!director())
        throw new ValidationError({
          permiso: 'Sólo Dirección actualiza el gasto contable.',
        });
      let n = 0;
      ctx.store.batch(() => {
        for (const s of plan.nuevos) {
          ctx.store.insert('spend', s);
          n++;
        }
        if (aplicarCambios)
          for (const c of plan.cambios) {
            const nota = `Corregido con el corte ${plan.corte}: antes ${c.actual.monto.toFixed(2)}.${c.actual.nota ? ` ${c.actual.nota}` : ''}`;
            ctx.store.update('spend', c.actual.id, {
              monto: c.monto,
              corte: plan.corte,
              nota,
              updatedAt: ctx.nowIso(),
            });
            n++;
          }
        ctx.repos.settings.update('settings', {
          corteContable: plan.corte,
          updatedAt: ctx.nowIso(),
        });
      });
      return n;
    },

    /**
     * Paquete de datos validados (JSON generado desde los archivos fuente).
     * Sólo AGREGA registros con id nuevo; nunca sobrescribe ni borra. Las gerencias
     * del paquete (`area:Nombre`) se traducen a las áreas reales con `areaMap`.
     */
    planImport(pkg: InvestmentPackage, areaMap: Record<string, ID | undefined>): { plan: ImportPlanStep[]; sinArea: string[] } {
      const d = db();
      const plan = INVESTMENT_COLLECTIONS.map((c) => {
        const items = ((pkg.data as Partial<DbData>)[c] ?? []) as { id: ID }[];
        const existing = new Map((d[c] as { id: ID }[]).map((x) => [x.id, x]));
        const nuevos = items.filter((x) => !existing.has(x.id)).map((x) => resolveAreas(x, areaMap));
        const iguales = items.filter((x) => existing.has(x.id) && sameContent(existing.get(x.id)!, resolveAreas(x, areaMap)));
        const distintos = items.filter((x) => existing.has(x.id) && !iguales.includes(x));
        return {
          collection: c as InvestmentCollection,
          nuevos,
          iguales: iguales.length,
          distintos: distintos.map((x) => x.id),
        };
      });
      const sinArea = [...new Set(JSON.stringify(pkg.data).match(/area:[^"\]]+/g) ?? [])].filter((k) => !areaMap[k.slice(5)]);
      return { plan, sinArea };
    },
    applyImport(plan: ImportPlanStep[]): number {
      if (!director())
        throw new ValidationError({
          permiso: 'Sólo Dirección carga el paquete de datos.',
        });
      let n = 0;
      ctx.store.batch(() => {
        for (const step of plan)
          for (const item of step.nuevos) {
            if (ctx.store.get(step.collection, item.id)) continue; // nunca sobrescribe
            ctx.store.insert(step.collection, item as never);
            n++;
          }
      });
      return n;
    },
  };
}

export interface SpendPlan {
  nuevos: SpendRecord[];
  cambios: { actual: SpendRecord; monto: number }[];
  iguales: number;
  /** Categorías con gasto que no pertenecen a ninguna partida. */
  sinPartida: string[];
  corte: string;
  total: number;
}

export interface ImportPlanStep {
  collection: InvestmentCollection;
  nuevos: { id: ID }[];
  iguales: number;
  /** Ids que ya existen con otro contenido: se conservan los existentes (no se sobrescriben). */
  distintos: ID[];
}

export interface InvestmentPackage {
  app: 'alignment-unblock';
  tipo: 'paquete-inversion';
  version: 1;
  generado: string;
  descripcion: string;
  fuentes: {
    id: string;
    archivo: string;
    corte?: string;
    uso: string;
    estado: string;
    nota?: string;
  }[];
  discrepancias: {
    tema: string;
    referencia: string;
    validado: string;
    tratamiento: string;
  }[];
  data: Partial<Pick<DbData, (typeof INVESTMENT_COLLECTIONS)[number]>>;
}

export function parsePackage(raw: string): { ok: true; pkg: InvestmentPackage } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  const p = json as Partial<InvestmentPackage>;
  if (p?.app !== 'alignment-unblock' || p.tipo !== 'paquete-inversion' || p.version !== 1 || typeof p.data !== 'object' || !p.data)
    return {
      ok: false,
      error: 'El archivo no es un paquete de datos de Inversión, KPIs y Resultados.',
    };
  for (const [c, items] of Object.entries(p.data)) {
    if (!INVESTMENT_COLLECTIONS.includes(c as CollectionName)) return { ok: false, error: `Colección desconocida en el paquete: ${c}.` };
    if (!Array.isArray(items) || items.some((x) => typeof x?.id !== 'string')) return { ok: false, error: `La sección ${c} no es válida.` };
  }
  return {
    ok: true,
    pkg: { discrepancias: [], fuentes: [], ...p } as InvestmentPackage,
  };
}

/** Sustituye `area:Nombre` por el id real del área. */
function resolveAreas<T>(item: T, areaMap: Record<string, ID | undefined>): T {
  const fix = (v: unknown): unknown => {
    if (typeof v === 'string' && v.startsWith('area:')) return areaMap[v.slice(5)] ?? undefined;
    if (Array.isArray(v)) return v.map(fix).filter((x) => x !== undefined);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .map(([k, x]) => [k, fix(x)])
          .filter(([, x]) => x !== undefined),
      );
    return v;
  };
  return fix(item) as T;
}

function sameContent(a: object, b: object): boolean {
  const strip = ({ createdAt: _c, updatedAt: _u, ...rest }: Record<string, unknown>) => rest;
  return JSON.stringify(sortKeys(strip(a as Record<string, unknown>))) === JSON.stringify(sortKeys(strip(b as Record<string, unknown>)));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}
