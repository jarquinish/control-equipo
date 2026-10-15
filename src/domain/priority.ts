import { addDaysISO, isValidDate, toISODate } from './dates';
import { PRIORITY_RANK } from './scoring';
import type { Commitment, DbData, ID, ISODate, Priority, Project, ProjectClasif, Clasificacion, PriorityMatrix, Iniciativa } from './types';

/**
 * Modelo de priorización de la Dirección de Posicionamiento.
 *
 * Dos ejes independientes:
 *  · ESTRATÉGICA — matriz directiva (P1) o, fuera de ella, el impacto
 *    (Negocio → P2 candidato a P1 · Estrategia → P2 · Operación → P3).
 *  · OPERATIVA — matriz de urgencias (P1) o, fuera de ella, la puntuación
 *    Urgencia + Dependencia + cercanía de la fecha compromiso + bloqueo.
 * Lo establecido por Dirección prevalece sobre ambos cálculos.
 *
 * Clasificación integrada: P1 Crítico (ambos P1) · P1 Urgente · P1 Estratégico · P2 · P3.
 * Orden de atención: nivel 1–5 según la clasificación; un P1 Estratégico
 * desatendido sube al nivel 2 para que las urgencias no lo posterguen.
 */

export const CLASIFICACION_LABELS: Record<Clasificacion, string> = {
  P1C: 'P1 Crítico',
  P1U: 'P1 Urgente',
  P1E: 'P1 Estratégico',
  P2: 'P2',
  P3: 'P3',
};
export const CLASIFICACIONES: Clasificacion[] = ['P1C', 'P1U', 'P1E', 'P2', 'P3'];
export const NIVEL_POR_CLASIFICACION: Record<Clasificacion, number> = { P1C: 1, P1U: 2, P1E: 3, P2: 4, P3: 5 };
export const FUENTE_LABELS = { matriz: 'Matriz directiva', criterios: 'Criterios', direccion: 'Dirección' } as const;

/* ───────────── Matriz oficial (Dirección de Posicionamiento) ───────────── */

const ini = (key: string, nombre: string, alias: string[], tipo: Iniciativa['tipo'] = 'proyecto', generica = false): Iniciativa => ({ key, nombre, alias, tipo, generica });

export const DEFAULT_INICIATIVAS: Iniciativa[] = [
  ini('franquicias', 'Campaña Franquicias', ['campaña franquicias', 'franquicias']),
  ini('que-es-soc', 'Campaña ¿Qué es SOC?', ['campaña que es soc', 'que es soc']),
  ini('soc-tv', 'SOC TV', ['soc tv', 'soctv']),
  ini('campana-md', 'Campaña de Marketing Digital', ['campaña de marketing digital', 'campaña marketing digital']),
  ini('convencion', 'Convención SOC', ['convencion soc', 'convencion']),
  ini('soc-leads', 'SOC Leads', ['soc leads+', 'soc leads', 'socleads']),
  ini('precalificador', 'Precalificador', ['precalificador hipotecario', 'precalificador']),
  ini('costo-cero', 'Costo Cero', ['costo cero']),
  ini('automatizacion', 'Automatización', ['automatizaciones', 'automatizacion']),
  ini('aula', 'AULA', ['mini aula', 'aulas', 'aula']),
  ini('workshop', 'Workshop', ['workshops', 'workshop']),
  ini('campanas-tematicas', 'Campañas Temáticas', ['campañas tematicas', 'campaña tematica']),
  ini('cobros-extraordinarios', 'Cobros Extraordinarios', ['cobros extraordinarios', 'cobro extraordinario']),
  ini('campana-venta', 'Campaña para Venta', ['campaña para venta', 'campaña de venta', 'campaña venta']),
  ini('venta-brokers', 'Venta Brokers', ['venta a brokers', 'venta brokers', 'venta para brokers']),
  ini('brokers', 'Brokers', ['brokers', 'broker'], 'solicitante', true),
  ini('direccion-comercial', 'Dirección Comercial', ['direccion comercial'], 'solicitante', true),
  ini('direccion-general', 'Dirección General', ['direccion general'], 'solicitante', true),
];

const rows = (area: string, estrategico: string[], urgente: string[]) => [
  ...estrategico.map((iniciativa) => ({ area, eje: 'estrategico' as const, iniciativa })),
  ...urgente.map((iniciativa) => ({ area, eje: 'urgente' as const, iniciativa })),
];

export const DEFAULT_MATRIX: PriorityMatrix = {
  iniciativas: DEFAULT_INICIATIVAS,
  reglas: [
    ...rows('Diseño', ['franquicias', 'que-es-soc', 'soc-tv', 'campana-md'], ['convencion', 'soc-tv', 'brokers', 'direccion-comercial', 'direccion-general']),
    ...rows('Contenido', ['franquicias', 'que-es-soc', 'soc-tv', 'campana-md'], ['convencion', 'soc-tv', 'brokers', 'direccion-comercial', 'direccion-general']),
    ...rows('Marketing Digital', ['soc-leads', 'precalificador', 'costo-cero'], ['precalificador', 'automatizacion', 'convencion', 'soc-tv', 'aula']),
    ...rows('SOC Store', ['campana-venta', 'venta-brokers', 'direccion-comercial'], ['convencion', 'workshop', 'aula', 'campanas-tematicas', 'cobros-extraordinarios']),
  ],
};

/* ───────────── Reconocimiento de iniciativas ───────────── */

/** Minúsculas, sin acentos ni signos (conserva «+»), sin años y con espacios simples. */
export function normName(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\b20\d\d\b/g, ' ')
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPhrase(text: string, alias: string): boolean {
  const a = normName(alias);
  if (!a || !text) return false;
  const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^| )${esc}($| )`).test(text);
}

export interface MatchResult {
  /** Vínculos firmes: coincidencia de una iniciativa específica, validación o solicitante. */
  firmes: { key: string; via: 'nombre' | 'frente' | 'solicitante' | 'validado'; texto: string }[];
  /** Coincidencias ambiguas (término genérico): requieren validación de Dirección. */
  porValidar: { key: string; via: 'nombre' | 'frente'; texto: string }[];
}

/** Iniciativas de la matriz a las que corresponde un proyecto (sin fusionar proyectos). */
export function matchInitiatives(p: Pick<Project, 'nombre' | 'frente' | 'solicitante' | 'vinculos'>, matrix: PriorityMatrix): MatchResult {
  const nombre = normName(p.nombre);
  const frente = normName(p.frente);
  const solicitante = normName(p.solicitante);
  const decided = new Map((p.vinculos ?? []).map((v) => [v.iniciativa, v.estado]));
  const out: MatchResult = { firmes: [], porValidar: [] };
  for (const i of matrix.iniciativas) {
    const estado = decided.get(i.key);
    if (estado === 'descartado') continue;
    if (estado === 'validado') {
      out.firmes.push({ key: i.key, via: 'validado', texto: i.nombre });
      continue;
    }
    if (i.tipo === 'solicitante' && solicitante && i.alias.some((a) => hasPhrase(solicitante, a))) {
      out.firmes.push({ key: i.key, via: 'solicitante', texto: p.solicitante! });
      continue;
    }
    const via = i.alias.some((a) => hasPhrase(nombre, a)) ? 'nombre' : i.alias.some((a) => hasPhrase(frente, a)) ? 'frente' : null;
    if (!via) continue;
    const texto = via === 'nombre' ? p.nombre : (p.frente ?? '');
    if (i.generica || i.tipo === 'solicitante') out.porValidar.push({ key: i.key, via, texto });
    else out.firmes.push({ key: i.key, via, texto });
  }
  return out;
}

/* ───────────── Clasificación ───────────── */

export interface ClassifyContext {
  matrix: PriorityMatrix;
  /** Nombre del área del proyecto (la matriz se define por gerencia). */
  areaNombre: string;
  /** Compromisos abiertos del proyecto (su fecha cuenta como fecha compromiso). */
  openCommitments: Pick<Commitment, 'fecha'>[];
  today: ISODate;
  umbralP1: number;
  umbralP2: number;
}

function reglasDe(matrix: PriorityMatrix, areaNombre: string, eje: 'estrategico' | 'urgente'): Set<string> {
  const a = normName(areaNombre);
  return new Set(matrix.reglas.filter((r) => r.eje === eje && normName(r.area) === a).map((r) => r.iniciativa));
}

function viaText(m: MatchResult['firmes'][number]): string {
  if (m.via === 'validado') return 'vínculo validado por Dirección';
  if (m.via === 'solicitante') return `solicitante «${m.texto}»`;
  return `coincidencia en el ${m.via} «${m.texto}»`;
}

const IMPACTO_NOMBRE = { 1: 'Operación', 2: 'Estrategia', 3: 'Negocio' } as const;

export function integrar(estrategica: Priority, operativa: Priority): Clasificacion {
  if (estrategica === 'P1' && operativa === 'P1') return 'P1C';
  if (operativa === 'P1') return 'P1U';
  if (estrategica === 'P1') return 'P1E';
  return estrategica === 'P2' || operativa === 'P2' ? 'P2' : 'P3';
}

/** Nivel P de una clasificación (para indicadores y vistas que manejan P1/P2/P3). */
export function clasificacionPriority(c: Clasificacion): Priority {
  return c === 'P2' ? 'P2' : c === 'P3' ? 'P3' : 'P1';
}

/** Días entre hoy y una fecha (negativo = vencida). */
function daysUntil(today: ISODate, date: ISODate): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function classifyProject(p: Project, ctx: ClassifyContext): ProjectClasif {
  const matches = matchInitiatives(p, ctx.matrix);
  const names = new Map(ctx.matrix.iniciativas.map((i) => [i.key, i.nombre]));
  const avisos: string[] = [];
  const area = ctx.areaNombre;

  // ── Eje estratégico
  const est = reglasDe(ctx.matrix, area, 'estrategico');
  const estHit = matches.firmes.find((m) => est.has(m.key));
  let estrategicaCalc: Priority;
  let motivoEst: string;
  let fuenteEst: ProjectClasif['fuenteEstrategica'];
  let candidatoP1 = false;
  if (estHit) {
    estrategicaCalc = 'P1';
    fuenteEst = 'matriz';
    motivoEst = `Iniciativa «${names.get(estHit.key)}» definida como estratégica para ${area} por la Dirección de Posicionamiento (${viaText(estHit)}).`;
  } else {
    fuenteEst = 'criterios';
    if (p.impacto === 3) {
      estrategicaCalc = 'P2';
      candidatoP1 = true;
      motivoEst = 'Impacto Negocio, fuera de la matriz estratégica: candidato a P1 estratégico, requiere validación directiva.';
    } else {
      estrategicaCalc = p.impacto === 2 ? 'P2' : 'P3';
      motivoEst = `Impacto ${IMPACTO_NOMBRE[p.impacto]}, fuera de la matriz estratégica.`;
    }
  }

  // ── Eje operativo
  const urg = reglasDe(ctx.matrix, area, 'urgente');
  const urgHit = matches.firmes.find((m) => urg.has(m.key));
  const fechas = [p.fechaObjetivo, ...ctx.openCommitments.map((c) => c.fecha)].filter((d): d is string => !!d && isValidDate(d)).sort();
  const fechaRef = fechas[0];
  let operativaCalc: Priority;
  let motivoOp: string;
  let fuenteOp: ProjectClasif['fuenteOperativa'];
  let scoreOperativo: number | undefined;
  if (urgHit) {
    operativaCalc = 'P1';
    fuenteOp = 'matriz';
    motivoOp = `Iniciativa «${names.get(urgHit.key)}» incluida en la matriz oficial de urgencias de ${area} (${viaText(urgHit)}).`;
  } else {
    fuenteOp = 'criterios';
    let fechaPts = 0;
    let fechaTxt = 'sin fecha compromiso (+0)';
    if (fechaRef) {
      const d = daysUntil(ctx.today, fechaRef);
      fechaPts = d <= 7 ? 2 : d <= 14 ? 1 : 0;
      fechaTxt = d < 0 ? `compromiso vencido hace ${-d} ${-d === 1 ? 'día' : 'días'} (+2)` : d === 0 ? 'fecha compromiso hoy (+2)' : `fecha compromiso en ${d} ${d === 1 ? 'día' : 'días'} (+${fechaPts})`;
    }
    const bloq = p.bloqueado ? 1 : 0;
    scoreOperativo = p.urgencia + p.dependencia + fechaPts + bloq;
    operativaCalc = scoreOperativo >= ctx.umbralP1 ? 'P1' : scoreOperativo >= ctx.umbralP2 ? 'P2' : 'P3';
    motivoOp = `Urgencia ${p.urgencia} + dependencia ${p.dependencia} + ${fechaTxt}${bloq ? ' + bloqueado (+1)' : ''} = ${scoreOperativo}.`;
  }
  if (!fechaRef) avisos.push('Sin fecha compromiso: requiere validación.');
  if (candidatoP1 && !p.prioridadDireccion?.estrategica) avisos.push('Candidato a P1 estratégico: requiere validación directiva.');
  // Sólo importan las menciones ambiguas que cambiarían la prioridad en esta gerencia.
  const porValidar = matches.porValidar.filter((m) => (est.has(m.key) || urg.has(m.key)) && !matches.firmes.some((f) => f.key === m.key));
  if (porValidar.length) avisos.push(`Vínculo por validar con: ${porValidar.map((m) => names.get(m.key)).join(', ')}.`);
  if (p.notaRevalidar) avisos.push(`Por revalidar: ${p.notaRevalidar}`);

  // ── Dirección prevalece
  const dir = p.prioridadDireccion ?? {};
  const estrategica = dir.estrategica ?? estrategicaCalc;
  const operativa = dir.operativa ?? operativaCalc;
  if (dir.estrategica) {
    fuenteEst = 'direccion';
    motivoEst = `Establecida por Dirección: ${dir.motivoEstrategica || 'sin motivo registrado'} (calculada: ${estrategicaCalc}).`;
  }
  if (dir.operativa) {
    fuenteOp = 'direccion';
    motivoOp = `Establecida por Dirección: ${dir.motivoOperativa || 'sin motivo registrado'} (calculada: ${operativaCalc}).`;
  }

  return {
    estrategica,
    operativa,
    estrategicaCalc,
    operativaCalc,
    fuenteEstrategica: fuenteEst,
    fuenteOperativa: fuenteOp,
    motivoEstrategica: motivoEst,
    motivoOperativa: motivoOp,
    integrada: integrar(estrategica, operativa),
    integradaCalc: integrar(estrategicaCalc, operativaCalc),
    iniciativas: matches.firmes.map((m) => m.key),
    porValidar: porValidar.map((m) => m.key),
    candidatoP1,
    avisos,
    scoreOperativo,
    fechaRef,
    calculadoEl: ctx.today,
  };
}

/** Contexto de clasificación tomado de la base completa. */
export function classifyContext(db: DbData, p: Pick<Project, 'id' | 'areaId'>, today: ISODate, matrix: PriorityMatrix, umbralP1: number, umbralP2: number): ClassifyContext {
  return {
    matrix,
    areaNombre: db.areas.find((a) => a.id === p.areaId)?.nombre ?? '',
    openCommitments: db.commitments.filter((c) => c.projectId === p.id && ['pendiente', 'en_gestion', 'reprogramado'].includes(c.estado)),
    today,
    umbralP1,
    umbralP2,
  };
}

/** Campos derivados de la clasificación (compatibles con las vistas que usan P1/P2/P3). */
export function classificationFields(c: ProjectClasif, p: Pick<Project, 'prioridadDireccion' | 'motivoAjuste'>) {
  const dir = p.prioridadDireccion;
  const ajuste = !!(dir?.estrategica || dir?.operativa);
  return {
    clasif: c,
    prioridadCalculada: clasificacionPriority(c.integradaCalc),
    prioridadFinal: clasificacionPriority(c.integrada),
    ajusteDireccion: ajuste && c.integrada !== c.integradaCalc,
    motivoAjuste: ajuste ? [dir?.motivoEstrategica, dir?.motivoOperativa].filter(Boolean).join(' · ') || undefined : undefined,
  };
}

/** ¿Cambió algo relevante? (ignora la fecha de cálculo). */
export function sameClasif(a: ProjectClasif | undefined, b: ProjectClasif): boolean {
  if (!a) return false;
  const strip = (c: ProjectClasif) => JSON.stringify({ ...c, calculadoEl: undefined });
  return strip(a) === strip(b);
}

/* ───────────── Orden de atención ───────────── */

export interface Attention {
  nivel: number;
  clasificacion: Clasificacion;
  /** P1 Estratégico sin actividad o sin compromiso abierto: sube al nivel 2. */
  desatendido: boolean;
  vencido: boolean;
  posicion: number;
}

/** Última actividad registrada de un proyecto (actualizaciones semanales y compromisos). */
export function lastActivity(db: DbData, p: Project): string {
  let last = p.createdAt;
  for (const u of db.weeklyUpdates) if (u.projectId === p.id && u.origen !== 'cierre' && u.updatedAt > last) last = u.updatedAt;
  for (const c of db.commitments) if (c.projectId === p.id && c.updatedAt > last) last = c.updatedAt;
  return last;
}

export function isDesatendido(db: DbData, p: Project, today: ISODate, dias: number): boolean {
  if (p.clasif?.integrada !== 'P1E') return false;
  const limite = addDaysISO(today, -dias);
  const sinActividad = toISODate(new Date(lastActivity(db, p))) < limite;
  const tieneCompromiso = db.commitments.some((c) => c.projectId === p.id && ['pendiente', 'en_gestion', 'reprogramado'].includes(c.estado));
  const antiguo = toISODate(new Date(p.createdAt)) < limite;
  return sinActividad || (!tieneCompromiso && antiguo);
}

/** Orden recomendado de ejecución de los proyectos dados. */
export function attentionOrder(db: DbData, projects: Project[], today: ISODate, diasDesatendido: number): Map<ID, Attention> {
  const items = projects.map((p) => {
    const clasificacion: Clasificacion = p.clasif?.integrada ?? (p.prioridadFinal === 'P1' ? 'P1U' : p.prioridadFinal);
    const desatendido = isDesatendido(db, p, today, diasDesatendido);
    const fecha = p.clasif?.fechaRef;
    return {
      p,
      clasificacion,
      desatendido,
      nivel: desatendido ? 2 : NIVEL_POR_CLASIFICACION[clasificacion],
      vencido: !!fecha && fecha < today,
      fecha,
    };
  });
  items.sort(
    (a, b) =>
      a.nivel - b.nivel ||
      Number(b.vencido) - Number(a.vencido) ||
      (a.fecha ?? '9999') .localeCompare(b.fecha ?? '9999') ||
      Number(b.p.bloqueado) - Number(a.p.bloqueado) ||
      b.p.dependencia - a.p.dependencia ||
      b.p.impacto - a.p.impacto ||
      PRIORITY_RANK[a.p.prioridadFinal] - PRIORITY_RANK[b.p.prioridadFinal] ||
      a.p.nombre.localeCompare(b.p.nombre, 'es'),
  );
  return new Map(items.map((x, i) => [x.p.id, { nivel: x.nivel, clasificacion: x.clasificacion, desatendido: x.desatendido, vencido: x.vencido, posicion: i + 1 }]));
}

/** Carga por gerencia: cuántos proyectos activos hay en cada clasificación. */
export function cargaPorArea(projects: Project[]): Map<ID, Record<Clasificacion, number>> {
  const out = new Map<ID, Record<Clasificacion, number>>();
  for (const p of projects) {
    const c = p.clasif?.integrada;
    if (!c) continue;
    const row = out.get(p.areaId) ?? { P1C: 0, P1U: 0, P1E: 0, P2: 0, P3: 0 };
    row[c]++;
    out.set(p.areaId, row);
  }
  return out;
}

/** Fecha de hoy (local) en formato ISO. */
export const todayISO = (now: Date): ISODate => toISODate(now);
