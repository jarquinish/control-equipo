/**
 * Modelo de datos de Alignment & Unblock.
 *
 * Todas las entidades son objetos planos serializables a JSON. Los campos de
 * persona (`responsable`, `apoyo`, `responsableGestion`, `updatedBy`…) guardan el
 * `id` de una `Person`, de modo que el modelo ya está listo para multiusuario y
 * autenticación futura.
 */

export type ID = string;
/** Fecha calendario local en formato `YYYY-MM-DD`. */
export type ISODate = string;
/** Fecha-hora ISO 8601 (`toISOString()`). */
export type ISODateTime = string;
/** Hora local en formato `HH:mm` (24 h). */
export type Time = string;

export type Level = 1 | 2 | 3;
export type Priority = 'P1' | 'P2' | 'P3';
export type Quadrant = 'hacer' | 'planificar' | 'delegar' | 'eliminar';
export type Role = 'ADMIN' | 'DIRECTOR' | 'GERENTE' | 'COLABORADOR';

export type ProjectStatus = 'por_iniciar' | 'en_curso' | 'en_riesgo' | 'en_pausa' | 'completado' | 'archivado';
export type WeekStatus = 'abierta' | 'cerrada';
export type BlockStatus = 'por_destrabar' | 'en_gestion' | 'resuelto' | 'escalado';
/** `vencido` no se almacena: se calcula comparando fecha/hora con el momento actual. */
export type CommitmentStatus = 'pendiente' | 'en_gestion' | 'cumplido' | 'reprogramado' | 'incumplido' | 'escalado';
export type CommitmentDisplayStatus = CommitmentStatus | 'vencido';
export type SessionStatus = 'en_curso' | 'cerrada';
export type SessionType = 'regular' | 'arranque';
export type DetectOutcome = 'avanza' | 'bloqueado' | 'decision' | 'resuelto';
export type UpdateOrigin = 'area' | 'junta' | 'cierre';

export interface BaseEntity {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Person extends BaseEntity {
  nombre: string;
  email?: string;
  rol: Role;
  areaId?: ID;
  activo: boolean;
}

export interface Area extends BaseEntity {
  nombre: string;
  /** id de Person */
  responsable?: ID;
  activo: boolean;
  orden: number;
  color: string;
}

export interface Project extends BaseEntity {
  nombre: string;
  descripcion: string;
  areaId: ID;
  responsable?: ID;
  impacto: Level;
  urgencia: Level;
  dependencia: Level;
  score: number;
  prioridadCalculada: Priority;
  prioridadFinal: Priority;
  ajusteDireccion: boolean;
  motivoAjuste?: string;
  eisenhower: Quadrant;
  estado: ProjectStatus;
  bloqueado: boolean;
  fechaObjetivo?: ISODate;
  /** Clave de dependencia principal (id de área interna o `ext:Nombre`). */
  dependeDe?: string;
  createdWeekId?: ID;
  closedAt?: ISODateTime;
  updatedBy?: ID;
}

export interface Week {
  id: ID;
  numero: number;
  anio: number;
  fechaInicio: ISODate;
  fechaFin: ISODate;
  estado: WeekStatus;
  createdAt: ISODateTime;
  closedAt?: ISODateTime;
}

/** Fotografía semanal de un proyecto. Permite que un proyecto viva varias semanas sin duplicarse. */
export interface WeeklyUpdate {
  id: ID;
  weekId: ID;
  projectId: ID;
  areaId: ID;
  nombre: string;
  responsable?: ID;
  estado: ProjectStatus;
  impacto: Level;
  urgencia: Level;
  dependencia: Level;
  score: number;
  prioridad: Priority;
  prioridadCalculada: Priority;
  ajusteDireccion: boolean;
  eisenhower: Quadrant;
  bloqueado: boolean;
  fechaObjetivo?: ISODate;
  dependeDe?: string;
  comentario?: string;
  origen: UpdateOrigin;
  updatedBy?: ID;
  updatedAt: ISODateTime;
}

/** Registro de que un área completó su actualización semanal. */
export interface AreaUpdate {
  id: ID;
  weekId: ID;
  areaId: ID;
  completedAt: ISODateTime;
  completedBy?: ID;
  comentario?: string;
}

export interface Block extends BaseEntity {
  projectId: ID;
  weekId: ID;
  /** ¿Qué está bloqueando el proyecto? */
  descripcion: string;
  /** ¿Qué necesitamos para avanzar? */
  necesidad: string;
  /** ¿De quién depende? (persona/rol concreto) */
  dependeDe: string;
  /** Área o entidad de la que se depende (id de área o `ext:Nombre`). */
  areaDependencia: string;
  /** ¿Quién puede ayudar? */
  quienPuedeAyudar?: string;
  /** ¿Quién gestionará el desbloqueo? (id de Person) */
  responsableGestion?: ID;
  estado: BlockStatus;
  escaladoA?: string;
  resolvedAt?: ISODateTime;
}

export interface CommitmentComment {
  id: ID;
  texto: string;
  autor?: ID;
  fecha: ISODateTime;
}

export type CommitmentEventType = 'creado' | 'cumplido' | 'reprogramado' | 'incumplido' | 'escalado' | 'en_gestion' | 'comentario' | 'reabierto';

export interface CommitmentEvent {
  tipo: CommitmentEventType;
  fecha: ISODateTime;
  weekId?: ID;
  sessionId?: ID;
  detalle?: string;
  autor?: ID;
}

export interface Commitment extends BaseEntity {
  projectId: ID;
  blockId?: ID;
  weekId: ID;
  accion: string;
  responsable: ID;
  apoyo?: string;
  fecha: ISODate;
  hora: Time;
  estado: CommitmentStatus;
  fechaOriginal: ISODate;
  horaOriginal: Time;
  reprogramaciones: number;
  motivoReprogramacion?: string;
  escaladoA?: string;
  comentarios: CommitmentComment[];
  historial: CommitmentEvent[];
  completedAt?: ISODateTime;
}

export interface Session {
  id: ID;
  weekId: ID;
  fecha: ISODate;
  estado: SessionStatus;
  pasoActual: number;
  proyectosRevisados: ID[];
  decisiones: ID[];
  compromisos: ID[];
  /** Resultado del paso DETECTAR por proyecto. */
  deteccion: Record<ID, DetectOutcome>;
  /** Proyectos cuya prioridad desplazó otra (regla 8). */
  desplazamientos: { promovido: ID; desplazado: ID; fecha: ISODateTime }[];
  resumen?: string;
  createdAt: ISODateTime;
  closedAt?: ISODateTime;
  /** `arranque` = Sesión 1: metodología → proyectos por área → pasos 3–7 por área → cierre. */
  tipo?: SessionType;
  /** Etapa actual de la sesión de arranque (ver domain/kickoff.ts). */
  etapa?: string;
  /** Proyectos cuya ponderación se confirmó en la sesión. */
  ponderados?: ID[];
  /** Áreas que ya cerraron sus pasos 3–7 en la sesión de arranque. */
  areasCerradas?: ID[];
}

export interface Decision {
  id: ID;
  sessionId?: ID;
  weekId: ID;
  projectId?: ID;
  descripcion: string;
  responsable?: ID;
  createdAt: ISODateTime;
}

export interface KpiSet {
  proyectosActivos: number;
  p1: number;
  p2: number;
  p3: number;
  bloqueados: number;
  compromisosAbiertos: number;
  vencidos: number;
  cumplidos: number;
  incumplidos: number;
  /** 0–100 o null si no hay compromisos evaluables. */
  cumplimiento: number | null;
  /** Compromisos evaluables considerados en el cumplimiento. */
  evaluables?: number;
  reprogramaciones: number;
  escalados: number;
  p1Bloqueados: number;
  bloqueosAbiertos: number;
  bloqueosResueltos: number;
}

/** Fotografía inmutable de la semana al cerrarse. Garantiza que el historial no cambie. */
export interface WeekSnapshot {
  id: ID;
  weekId: ID;
  sessionId?: ID;
  createdAt: ISODateTime;
  projects: WeeklyUpdate[];
  blocks: Block[];
  commitments: Commitment[];
  decisions: Decision[];
  areaUpdates: AreaUpdate[];
  kpis: KpiSet;
  resumen: string;
}

export interface Criteria {
  /** Recomendación de proyectos relevantes por área (paso VISIBILIZAR). */
  maxProyectosPorArea: number;
  /** Máximo recomendado de P1 simultáneos (regla 3). */
  maxP1: number;
  /** Horas para considerar que un compromiso "vence pronto". */
  horasVencePronto: number;
  /** Reprogramaciones a partir de las cuales se alerta. */
  umbralReprogramaciones: number;
  /** Semanas abiertas a partir de las cuales un proyecto se considera de larga duración. */
  semanasProyectoLargo: number;
}

export interface Settings {
  id: 'settings';
  activeWeekId?: ID;
  currentUserId?: ID;
  externalDependencies: string[];
  statusLabels: Record<ProjectStatus, string>;
  criteria: Criteria;
  orgName: string;
  schemaVersion: number;
  updatedAt: ISODateTime;
}

export interface DbData {
  areas: Area[];
  people: Person[];
  projects: Project[];
  weeks: Week[];
  weeklyUpdates: WeeklyUpdate[];
  areaUpdates: AreaUpdate[];
  blocks: Block[];
  commitments: Commitment[];
  sessions: Session[];
  decisions: Decision[];
  snapshots: WeekSnapshot[];
  settings: Settings[];
}

export type CollectionName = keyof DbData;
export type EntityOf<C extends CollectionName> = DbData[C][number];

export const COLLECTIONS: CollectionName[] = [
  'areas',
  'people',
  'projects',
  'weeks',
  'weeklyUpdates',
  'areaUpdates',
  'blocks',
  'commitments',
  'sessions',
  'decisions',
  'snapshots',
  'settings',
];
