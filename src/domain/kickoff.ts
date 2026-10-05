import type { Area } from './types';

/**
 * Sesión 1 · Arranque: secuencia de etapas.
 *   metodologia → proyectos → (por área) pasos 3, 4, 5, 6, 7 → cierre
 * Cada etapa se identifica con una clave: 'metodologia', 'proyectos',
 * '<areaId>:<paso>' o 'cierre'.
 */
export const KICKOFF_AREA_STEPS = [3, 4, 5, 6, 7] as const;
export type KickoffAreaStep = (typeof KICKOFF_AREA_STEPS)[number];

export type KickoffStage =
  | { key: 'metodologia' }
  | { key: 'proyectos' }
  | { key: string; areaId: string; paso: KickoffAreaStep }
  | { key: 'cierre' };

export function kickoffStages(areas: Area[]): KickoffStage[] {
  const ordered = areas.filter((a) => a.activo).sort((a, b) => a.orden - b.orden);
  return [
    { key: 'metodologia' },
    { key: 'proyectos' },
    ...ordered.flatMap((a) => KICKOFF_AREA_STEPS.map((paso) => ({ key: `${a.id}:${paso}`, areaId: a.id, paso }))),
    { key: 'cierre' },
  ];
}

export function stageIndex(stages: KickoffStage[], key: string | undefined): number {
  const i = stages.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

export function isAreaStage(s: KickoffStage): s is { key: string; areaId: string; paso: KickoffAreaStep } {
  return 'areaId' in s;
}

/** Contenido de la primera hoja: cómo se lleva a cabo la metodología. */
export const METHOD_OBJECTIVE =
  'Alinear cada semana a Contenido, Diseño, Marketing Digital y SOC Store sobre qué proyectos importan, qué los detiene y quién los destraba, con compromisos que tienen responsable, fecha y hora.';

export const METHOD_STEPS = [
  {
    n: 1,
    titulo: 'Revisar',
    pregunta: '¿Cumplimos lo acordado?',
    objetivo: 'Empezar por los compromisos de la semana anterior para que nada se quede en el aire.',
    resultado: 'Cada compromiso queda cumplido, reprogramado (con nueva fecha, hora y motivo), incumplido o escalado.',
    hoy: 'Hoy no aplica: es la primera sesión y aún no hay compromisos previos.',
  },
  {
    n: 2,
    titulo: 'Visibilizar',
    pregunta: '¿En qué estamos?',
    objetivo: 'Ver en una sola pantalla los proyectos principales de cada área.',
    resultado: 'Máximo 5 proyectos relevantes por área a la vista de todos.',
    hoy: 'Hoy se sustituye por el levantamiento de proyectos por área.',
  },
  {
    n: 3,
    titulo: 'Ordenar',
    pregunta: '¿Es importante, urgente o ambas?',
    objetivo: 'Separar lo importante de lo que sólo llegó con urgencia (matriz de Eisenhower).',
    resultado: 'Cada proyecto en un cuadrante: Hacer, Planificar, Delegar o Reducir.',
  },
  {
    n: 4,
    titulo: 'Priorizar',
    pregunta: '¿Este orden representa las prioridades de la Dirección?',
    objetivo: 'Ponderar impacto, urgencia y dependencia para obtener P1, P2 y P3. Dirección puede ajustar.',
    resultado: 'Prioridad confirmada por proyecto; si entra un P1 nuevo, se decide qué desplaza.',
  },
  {
    n: 5,
    titulo: 'Detectar',
    pregunta: '¿Puede avanzar?',
    objetivo: 'Revisar proyecto por proyecto, empezando por los P1, para encontrar dónde se atora.',
    resultado: 'Cada proyecto marcado: avanza, bloqueado, requiere decisión o resuelto.',
  },
  {
    n: 6,
    titulo: 'Destrabar y comprometer',
    pregunta: '¿Qué necesitamos para avanzar?',
    objetivo: 'Convertir cada bloqueo en una acción: qué lo bloquea, qué se necesita, de quién depende y quién lo gestiona.',
    resultado: 'Compromisos con acción, responsable, apoyo, fecha y hora.',
  },
  {
    n: 7,
    titulo: 'Cerrar',
    pregunta: '¿Con qué salimos?',
    objetivo: 'Confirmar prioridades, bloqueos, decisiones y compromisos antes de terminar.',
    resultado: 'Resumen ejecutivo listo para Teams y base para la siguiente Weekly.',
  },
] as const;

export const SCORING_GUIDE = [
  { criterio: 'Impacto', niveles: ['Operativo / bajo', 'Relevante', 'Estratégico / comercial / reputacional'] },
  { criterio: 'Urgencia', niveles: ['Puede esperar', 'Debe avanzar esta semana', 'Deadline inmediato'] },
  { criterio: 'Dependencia', niveles: ['Prácticamente autónomo', 'Depende de otra área / persona', 'Varias áreas / Dirección / tercero'] },
] as const;
