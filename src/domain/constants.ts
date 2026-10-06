import type {
  BlockStatus,
  CommitmentDisplayStatus,
  Criteria,
  Level,
  Priority,
  ProjectStatus,
  Quadrant,
  Role,
} from './types';

export const APP_NAME = 'Alignment & Unblock';
export const SCHEMA_VERSION = 1;
export const EXPORT_APP_ID = 'alignment-unblock';

export const INITIAL_AREAS: { nombre: string; color: string }[] = [
  { nombre: 'Contenido', color: '#3BBFDA' },
  { nombre: 'Diseño', color: '#E84E8A' },
  { nombre: 'Marketing Digital', color: '#F4614A' },
  { nombre: 'SOC Store', color: '#5DC65E' },
];

export const DEFAULT_EXTERNAL_DEPENDENCIES = [
  'Dirección General',
  'Comercial',
  'TI / Sistemas',
  'Legal / Cumplimiento',
  'Finanzas',
  'Red de Oficinas',
  'Proveedor externo',
];

export const DEFAULT_CRITERIA: Criteria = {
  maxProyectosPorArea: 5,
  maxP1: 6,
  horasVencePronto: 48,
  umbralReprogramaciones: 2,
  semanasProyectoLargo: 6,
};

export const LEVELS: Level[] = [1, 2, 3];

/** La Dirección a la que pertenecen las áreas; siempre disponible como dependencia. */
export const DIRECCION = 'Dirección de Posicionamiento';

export const IMPACT_LABELS: Record<Level, string> = {
  1: 'Operación',
  2: 'Estrategia',
  3: 'Negocio',
};
/** Qué significa cada nivel de impacto. */
export const IMPACT_HINTS: Record<Level, string> = {
  1: 'Lo básico de ejecución del día a día.',
  2: 'Impacta los objetivos del área: el posicionamiento de marca.',
  3: 'Impacta la venta a cliente, el desarrollo de negocio de oficinas o la atracción de franquicias o de talento para nuevas oficinas.',
};
export const URGENCY_LABELS: Record<Level, string> = {
  1: 'Puede esperar',
  2: 'Debe avanzar esta semana',
  3: 'Deadline inmediato',
};
export const DEPENDENCY_LABELS: Record<Level, string> = {
  1: 'Prácticamente autónomo',
  2: 'Depende de otra área / persona',
  3: 'Depende de varias áreas / Dirección / tercero',
};

export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3'];

export const QUADRANTS: Quadrant[] = ['hacer', 'planificar', 'delegar', 'eliminar'];
export const QUADRANT_LABELS: Record<Quadrant, string> = {
  hacer: 'Hacer / Resolver',
  planificar: 'Planificar',
  delegar: 'Delegar',
  eliminar: 'Reducir / Eliminar',
};
export const QUADRANT_HINTS: Record<Quadrant, string> = {
  hacer: 'Importante y urgente',
  planificar: 'Importante, no urgente',
  delegar: 'Urgente, no importante',
  eliminar: 'Ni urgente ni importante',
};

export const PROJECT_STATUSES: ProjectStatus[] = ['por_iniciar', 'en_curso', 'en_riesgo', 'en_pausa', 'completado', 'archivado'];
export const DEFAULT_STATUS_LABELS: Record<ProjectStatus, string> = {
  por_iniciar: 'Por iniciar',
  en_curso: 'En curso',
  en_riesgo: 'En riesgo',
  en_pausa: 'En pausa',
  completado: 'Cerrado',
  archivado: 'Archivado',
};
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = ['por_iniciar', 'en_curso', 'en_riesgo', 'en_pausa'];

export const BLOCK_STATUSES: BlockStatus[] = ['por_destrabar', 'en_gestion', 'resuelto', 'escalado'];
export const BLOCK_STATUS_LABELS: Record<BlockStatus, string> = {
  por_destrabar: 'Por destrabar',
  en_gestion: 'En gestión',
  resuelto: 'Resuelto',
  escalado: 'Escalado',
};

export const COMMITMENT_STATUS_LABELS: Record<CommitmentDisplayStatus, string> = {
  pendiente: 'Pendiente',
  en_gestion: 'En gestión',
  cumplido: 'Cumplido',
  reprogramado: 'Reprogramado',
  vencido: 'Vencido',
  escalado: 'Escalado',
  incumplido: 'Incumplido',
};
export const COMMITMENT_FILTER_STATUSES: CommitmentDisplayStatus[] = [
  'pendiente',
  'en_gestion',
  'reprogramado',
  'vencido',
  'escalado',
  'cumplido',
  'incumplido',
];

export const ROLES: Role[] = ['ADMIN', 'DIRECTOR', 'GERENTE', 'COLABORADOR'];
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  DIRECTOR: 'Dirección',
  GERENTE: 'Gerente',
  COLABORADOR: 'Colaborador',
};

export const WEEKLY_STEPS = [
  { n: 1, key: 'revisar', titulo: 'Revisar', pregunta: '¿Cumplimos lo acordado?' },
  { n: 2, key: 'visibilizar', titulo: 'Visibilizar', pregunta: '¿En qué estamos?' },
  { n: 3, key: 'ordenar', titulo: 'Ordenar', pregunta: '¿Es importante, urgente o ambas?' },
  { n: 4, key: 'priorizar', titulo: 'Priorizar', pregunta: '¿Este orden representa realmente las prioridades de la Dirección?' },
  { n: 5, key: 'detectar', titulo: 'Detectar', pregunta: '¿Puede avanzar?' },
  { n: 6, key: 'destrabar', titulo: 'Destrabar y comprometer', pregunta: '¿Qué necesitamos para avanzar?' },
  { n: 7, key: 'cerrar', titulo: 'Cerrar', pregunta: '¿Con qué salimos?' },
] as const;

export const RULES = [
  'No reportamos actividades. Trabajamos sobre proyectos.',
  'No todo lo urgente es importante.',
  'No todo puede ser P1.',
  'Un bloqueo no identifica culpables; identifica dónde necesita ayuda el proyecto.',
  'Todo bloqueo debe terminar en una acción.',
  'Toda acción debe tener responsable + fecha + hora.',
  'La siguiente Weekly comienza revisando los compromisos anteriores.',
  'Si aparece una nueva prioridad crítica, identificamos qué prioridad desplaza.',
];
