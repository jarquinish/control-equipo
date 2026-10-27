import type { BudgetLine, BudgetMovement, DbData, ID, SpendRecord, Validacion } from '../types';

/**
 * Control presupuestal.
 *
 * - Autorizado inicial = `BudgetLine.original`.
 * - Vigente = inicial + ampliaciones − reducciones ± transferencias CONFIRMADAS.
 *   Una transferencia es un solo registro (origen → destino): no cambia el total.
 * - Ejercido = gasto del reporte contable (colección `spend`) de las categorías
 *   contables de la partida, hasta el corte. Las reclasificaciones de gasto
 *   CONFIRMADAS se aplican; las PENDIENTES sólo se muestran en «ejercido con
 *   reclasificaciones propuestas» (nunca se corrigen en silencio).
 * - Comprometido = compromisos de gasto vigentes (no ejercidos ni cancelados).
 * - Disponible = vigente − ejercido − comprometido.
 */

export interface LineSummary {
  line: BudgetLine;
  original: number;
  ampliaciones: number;
  reducciones: number;
  transferenciasEntrada: number;
  transferenciasSalida: number;
  vigente: number;
  /** Gasto contable de sus categorías (sin reclasificaciones). */
  ejercidoContable: number;
  /** Reclasificaciones confirmadas (± gasto). */
  reclasConfirmadas: number;
  /** Ejercido oficial = contable + reclasificaciones confirmadas. */
  ejercido: number;
  /** Reclasificaciones pendientes (± gasto) — sólo análisis. */
  reclasPendientes: number;
  ejercidoConPropuestas: number;
  comprometido: number;
  disponible: number;
  /** Asignado a proyectos (tabla partida ↔ proyecto). */
  asignado: number;
  sinAsignar: number;
  /** Ejercido / vigente (0–1+) o null si vigente = 0. */
  ejecucion: number | null;
  mensual: Record<string, number>;
  semaforo: 'ok' | 'atencion' | 'sobre' | 'sin_ejercer' | 'revolvente';
}

export interface BudgetCheck {
  id: string;
  texto: string;
  ok: boolean;
  detalle: string;
}

export interface BudgetSummary {
  lines: LineSummary[];
  /** Categorías contables con gasto que no pertenecen a ninguna partida. */
  sinPartida: {
    categoria: string;
    monto: number;
    reclasPendiente: number;
    reclasConfirmada: number;
  }[];
  totales: {
    original: number;
    ampliaciones: number;
    reducciones: number;
    vigente: number;
    ejercido: number;
    ejercidoContable: number;
    ejercidoConPropuestas: number;
    comprometido: number;
    disponible: number;
    asignado: number;
    gastoTotalFuente: number;
  };
  /** Último mes con gasto registrado (corte contable efectivo). */
  corte?: string;
  meses: string[];
  movimientosPendientes: BudgetMovement[];
  checks: BudgetCheck[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Gasto de una categoría hasta un mes (`YYYY-MM`, inclusive). */
function spendByCategory(spend: SpendRecord[], hasta?: string) {
  const map = new Map<string, { total: number; mensual: Record<string, number> }>();
  for (const s of spend) {
    if (hasta && s.mes > hasta) continue;
    const e = map.get(s.categoria) ?? { total: 0, mensual: {} };
    e.total += s.monto;
    e.mensual[s.mes] = (e.mensual[s.mes] ?? 0) + s.monto;
    map.set(s.categoria, e);
  }
  return map;
}

/** Monto de una reclasificación: el indicado o, si mueve una categoría completa, su gasto. */
export function reclasMonto(m: BudgetMovement, catSpend: Map<string, { total: number }>, lineCats: Map<ID, string[]>): number {
  if (typeof m.monto === 'number') return m.monto;
  if (m.deCategoria) return catSpend.get(m.deCategoria)?.total ?? 0;
  if (m.deLineaId) return (lineCats.get(m.deLineaId) ?? []).reduce((s, c) => s + (catSpend.get(c)?.total ?? 0), 0);
  return 0;
}

const confirmed = (v: Validacion) => v === 'CONFIRMADO';

export function budgetSummary(db: Pick<DbData, 'budgetLines' | 'budgetMovements' | 'spend' | 'budgetCommitments' | 'budgetAllocations'>, opts: { hasta?: string } = {}): BudgetSummary {
  const lines = [...db.budgetLines].sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));
  const catSpend = spendByCategory(db.spend, opts.hasta);
  const lineCats = new Map(lines.map((l) => [l.id, l.categoriasContables]));
  const catOwner = new Map<string, ID>();
  for (const l of lines) for (const c of l.categoriasContables) catOwner.set(c, l.id);

  const movs = db.budgetMovements;
  const budgetMovs = movs.filter((m) => m.tipo !== 'reclasificacion' && confirmed(m.estado));
  const reclas = movs.filter((m) => m.tipo === 'reclasificacion');

  const reclasDelta = (lineId: ID, estado: 'conf' | 'pend') =>
    reclas
      .filter((m) => (estado === 'conf' ? confirmed(m.estado) : !confirmed(m.estado)))
      .reduce((s, m) => {
        const monto = reclasMonto(m, catSpend, lineCats);
        return s + (m.aLineaId === lineId ? monto : 0) - (m.deLineaId === lineId ? monto : 0);
      }, 0);

  const meses = [...new Set(db.spend.filter((s) => !opts.hasta || s.mes <= opts.hasta).map((s) => s.mes))].sort();

  const out: LineSummary[] = lines.map((line) => {
    const mine = budgetMovs;
    const ampliaciones = mine.filter((m) => m.tipo === 'ampliacion' && m.aLineaId === line.id).reduce((s, m) => s + (m.monto ?? 0), 0);
    const reducciones = mine.filter((m) => m.tipo === 'reduccion' && m.deLineaId === line.id).reduce((s, m) => s + (m.monto ?? 0), 0);
    const tIn = mine.filter((m) => m.tipo === 'transferencia' && m.aLineaId === line.id).reduce((s, m) => s + (m.monto ?? 0), 0);
    const tOut = mine.filter((m) => m.tipo === 'transferencia' && m.deLineaId === line.id).reduce((s, m) => s + (m.monto ?? 0), 0);
    const vigente = line.original + ampliaciones - reducciones + tIn - tOut;

    const mensual: Record<string, number> = {};
    let ejercidoContable = 0;
    for (const c of line.categoriasContables) {
      const e = catSpend.get(c);
      if (!e) continue;
      ejercidoContable += e.total;
      for (const [mes, v] of Object.entries(e.mensual)) mensual[mes] = (mensual[mes] ?? 0) + v;
    }
    const reclasConfirmadas = reclasDelta(line.id, 'conf');
    const reclasPendientes = reclasDelta(line.id, 'pend');
    const ejercido = ejercidoContable + reclasConfirmadas;
    const comprometido = db.budgetCommitments.filter((c) => c.lineaId === line.id && c.situacion === 'comprometido').reduce((s, c) => s + c.monto, 0);
    const asignado = db.budgetAllocations.filter((a) => a.lineaId === line.id).reduce((s, a) => s + a.monto, 0);
    const ejecucion = vigente > 0 ? ejercido / vigente : null;
    const semaforo: LineSummary['semaforo'] = line.revolvente
      ? 'revolvente'
      : ejercido > vigente + 0.005
        ? 'sobre'
        : ejercido === 0 && vigente > 0
          ? 'sin_ejercer'
          : ejecucion !== null && ejercido + comprometido > vigente
            ? 'atencion'
            : 'ok';
    return {
      line,
      original: line.original,
      ampliaciones,
      reducciones,
      transferenciasEntrada: tIn,
      transferenciasSalida: tOut,
      vigente: round2(vigente),
      ejercidoContable: round2(ejercidoContable),
      reclasConfirmadas: round2(reclasConfirmadas),
      ejercido: round2(ejercido),
      reclasPendientes: round2(reclasPendientes),
      ejercidoConPropuestas: round2(ejercido + reclasPendientes),
      comprometido: round2(comprometido),
      disponible: round2(vigente - ejercido - comprometido),
      asignado: round2(asignado),
      sinAsignar: round2(vigente - asignado),
      ejecucion,
      mensual,
      semaforo,
    };
  });

  // Categorías con gasto sin partida (p. ej. Content Marketing): se informan, no se pierden.
  const sinPartida = [...catSpend.entries()]
    .filter(([c]) => !catOwner.has(c))
    .map(([categoria, e]) => {
      const rs = reclas.filter((m) => m.deCategoria === categoria);
      const pend = rs.filter((m) => !confirmed(m.estado)).reduce((s, m) => s + reclasMonto(m, catSpend, lineCats), 0);
      const conf = rs.filter((m) => confirmed(m.estado)).reduce((s, m) => s + reclasMonto(m, catSpend, lineCats), 0);
      return {
        categoria,
        monto: round2(e.total),
        reclasPendiente: round2(pend),
        reclasConfirmada: round2(conf),
      };
    })
    .sort((a, b) => b.monto - a.monto);

  const sum = (f: (l: LineSummary) => number) => round2(out.reduce((s, l) => s + f(l), 0));
  const gastoTotalFuente = round2([...catSpend.values()].reduce((s, e) => s + e.total, 0));
  const sinPartidaNeto = round2(sinPartida.reduce((s, x) => s + x.monto - x.reclasConfirmada, 0));
  const totales = {
    original: sum((l) => l.original),
    ampliaciones: sum((l) => l.ampliaciones),
    reducciones: sum((l) => l.reducciones),
    vigente: sum((l) => l.vigente),
    ejercido: round2(sum((l) => l.ejercido) + sinPartidaNeto),
    ejercidoContable: gastoTotalFuente,
    ejercidoConPropuestas: round2(sum((l) => l.ejercidoConPropuestas) + sinPartida.reduce((s, x) => s + x.monto - x.reclasConfirmada - x.reclasPendiente, 0)),
    comprometido: sum((l) => l.comprometido),
    // Incluye el gasto sin partida: el total disponible no puede ignorarlo.
    disponible: round2(sum((l) => l.vigente) - (sum((l) => l.ejercido) + sinPartidaNeto) - sum((l) => l.comprometido)),
    asignado: sum((l) => l.asignado),
    gastoTotalFuente,
  };

  const transfers = budgetMovs.filter((m) => m.tipo === 'transferencia');
  const transferNet = round2(out.reduce((s, l) => s + l.transferenciasEntrada - l.transferenciasSalida, 0));
  const checks: BudgetCheck[] = [
    {
      id: 'vigente',
      texto: 'Inicial + ampliaciones − reducciones = vigente',
      ok: near(totales.original + totales.ampliaciones - totales.reducciones, totales.vigente),
      detalle: `${totales.original} + ${totales.ampliaciones} − ${totales.reducciones} = ${totales.vigente}`,
    },
    {
      id: 'transferencias',
      texto: 'Las transferencias no cambian el total (neto $0)',
      ok: near(transferNet, 0) && transfers.every((m) => m.deLineaId && m.aLineaId && m.deLineaId !== m.aLineaId),
      detalle: `${transfers.length} transferencias · neto ${transferNet}`,
    },
    {
      id: 'gasto',
      texto: 'Gasto por partida + gasto sin partida = gasto del reporte contable (sin doble conteo)',
      ok: near(totales.ejercido, gastoTotalFuente),
      detalle: `${totales.ejercido} vs ${gastoTotalFuente}`,
    },
    {
      id: 'reclas',
      texto: 'Las reclasificaciones de gasto suman $0 en el total',
      ok: near(totales.ejercidoConPropuestas, gastoTotalFuente),
      detalle: `${totales.ejercidoConPropuestas} vs ${gastoTotalFuente}`,
    },
    {
      id: 'asignaciones',
      texto: 'Ninguna partida asigna a proyectos más que su presupuesto vigente',
      ok: out.every((l) => l.asignado <= l.vigente + 0.005),
      detalle:
        out
          .filter((l) => l.asignado > l.vigente + 0.005)
          .map((l) => l.line.nombre)
          .join(', ') || 'Sin excesos',
    },
  ];

  return {
    lines: out,
    sinPartida,
    totales,
    corte: meses[meses.length - 1],
    meses,
    movimientosPendientes: movs.filter((m) => !confirmed(m.estado)),
    checks,
  };
}

/** Inversión vinculada a cada proyecto: asignaciones y gasto con detalle de proyecto. */
export interface ProjectInvestment {
  asignado: number;
  comprometido: number;
  ejercido: number;
  lineas: { lineaId: ID; monto: number }[];
}

export function projectInvestment(db: Pick<DbData, 'budgetAllocations' | 'budgetCommitments'>): Map<ID, ProjectInvestment> {
  const map = new Map<ID, ProjectInvestment>();
  const get = (id: ID) => {
    let e = map.get(id);
    if (!e) map.set(id, (e = { asignado: 0, comprometido: 0, ejercido: 0, lineas: [] }));
    return e;
  };
  for (const a of db.budgetAllocations) {
    const e = get(a.projectId);
    e.asignado += a.monto;
    e.lineas.push({ lineaId: a.lineaId, monto: a.monto });
  }
  for (const c of db.budgetCommitments) {
    if (!c.projectId || c.situacion === 'cancelado') continue;
    const e = get(c.projectId);
    if (c.situacion === 'comprometido') e.comprometido += c.monto;
    else e.ejercido += c.monto;
  }
  return map;
}

/** Valida una asignación partida → proyecto antes de guardarla (también lo valida el servidor). */
export function allocationError(summary: BudgetSummary, lineaId: ID, monto: number, excluirMonto = 0): string | null {
  if (!(monto > 0)) return 'El monto debe ser mayor que cero.';
  const l = summary.lines.find((x) => x.line.id === lineaId);
  if (!l) return 'La partida no existe.';
  const libre = l.vigente - (l.asignado - excluirMonto);
  if (monto > libre + 0.005) return `La partida «${l.line.nombre}» sólo tiene ${libre.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} sin asignar.`;
  return null;
}
