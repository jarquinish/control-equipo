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
export type Role = 'ADMIN' | 'DIRECTOR' | 'GERENTE' | 'COLABORADOR' | 'CONSULTA';

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
  /** ID de origen (p. ej. CON-01) cuando el proyecto vino de un inventario en Excel. */
  ref?: string;
  /** Quién solicita el trabajo (p. ej. Brokers, Dirección Comercial). */
  solicitante?: string;
  /** Proyecto padre / frente al que pertenece. */
  frente?: string;
  /** Decisiones de Dirección sobre el vínculo con iniciativas de la matriz. */
  vinculos?: { iniciativa: string; estado: 'validado' | 'descartado'; por?: ID; fecha?: ISODateTime }[];
  /** Prioridades establecidas por Dirección (prevalecen sobre el cálculo). */
  prioridadDireccion?: { estrategica?: Priority; operativa?: Priority; motivoEstrategica?: string; motivoOperativa?: string };
  /** Acuerdo de prioridad cerrado: sólo Dirección puede cambiar la ponderación. */
  acuerdo?: { bloqueado: boolean; por?: ID; fecha?: ISODateTime };
  /** Ajuste del modelo anterior pendiente de revalidar por Dirección. */
  notaRevalidar?: string;
  /** Clasificación calculada (prioridad estratégica y operativa). */
  clasif?: ProjectClasif;
  createdWeekId?: ID;
  closedAt?: ISODateTime;
  updatedBy?: ID;
}

export type Clasificacion = 'P1C' | 'P1U' | 'P1E' | 'P2' | 'P3';
export type PriorityAxis = 'estrategica' | 'operativa';

export interface ProjectClasif {
  estrategica: Priority;
  operativa: Priority;
  estrategicaCalc: Priority;
  operativaCalc: Priority;
  fuenteEstrategica: 'matriz' | 'criterios' | 'direccion';
  fuenteOperativa: 'matriz' | 'criterios' | 'direccion';
  motivoEstrategica: string;
  motivoOperativa: string;
  integrada: Clasificacion;
  integradaCalc: Clasificacion;
  /** Iniciativas de la matriz vinculadas (claves). */
  iniciativas: string[];
  /** Coincidencias ambiguas que Dirección debe validar. */
  porValidar: string[];
  candidatoP1: boolean;
  avisos: string[];
  scoreOperativo?: number;
  fechaRef?: ISODate;
  calculadoEl: ISODate;
}

export interface Iniciativa {
  key: string;
  nombre: string;
  /** Variantes de nombre que la identifican (se comparan sin acentos ni mayúsculas). */
  alias: string[];
  /** `solicitante`: se reconoce por el campo Solicitante (Brokers, Dirección Comercial…). */
  tipo: 'proyecto' | 'solicitante';
  /** Término genérico: una mención en el nombre requiere validación. */
  generica?: boolean;
}

export interface PriorityMatrix {
  iniciativas: Iniciativa[];
  reglas: { area: string; eje: 'estrategico' | 'urgente'; iniciativa: string }[];
}

/** Bitácora inalterable de decisiones de prioridad. */
export interface PriorityLog {
  id: ID;
  projectId: ID;
  areaId: ID;
  tipo: 'prioridad' | 'acuerdo' | 'iniciativa';
  eje?: PriorityAxis;
  anterior?: string;
  nuevo: string;
  motivo: string;
  fuente: 'pantalla' | 'excel' | 'junta';
  responsable?: ID;
  createdAt: ISODateTime;
}

// ═══ Inversión, KPIs y Resultados ════════════════════════════════════════════
// Relaciones por identificador (tablas de asociación), nunca por nombre.

/** Estado de validación de una cifra o registro. */
export type Validacion = 'CONFIRMADO' | 'PENDIENTE' | 'PROPUESTA';
/** Periodo de una cifra: fechas inclusivas `YYYY-MM-DD`. */
export interface Periodo {
  inicio: ISODate;
  fin: ISODate;
  etiqueta?: string;
}
/** Trazabilidad de una cifra. */
export interface Fuente {
  fuente: string;
  corte?: string;
  estado: Validacion;
  nota?: string;
  /** Discrepancia detectada contra otra fuente: se muestra hasta que Dirección la resuelva. */
  discrepancia?: string;
}

export interface StrategicObjective extends BaseEntity {
  clave: string;
  nombre: string;
  descripcion?: string;
  orden: number;
  estado: Validacion;
}

/** A Posicionamiento · B Demanda · C Franquicias · D Desarrollo y retención · E Contenido · F Eficiencia operativa */
export type KpiGrupo = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type KpiTipo = 'actividad' | 'desempeno' | 'eficiencia' | 'rentabilidad' | 'marca';
export type KpiSentido = 'mayor' | 'menor' | 'rango';

export interface Kpi extends BaseEntity {
  clave: string;
  nombre: string;
  definicion: string;
  grupo: KpiGrupo;
  tipo: KpiTipo;
  objetivoId?: ID;
  /** Gerencias responsables (id de Area). */
  areaIds: ID[];
  unidad: string;
  sentido: KpiSentido;
  /** Para `rango`: límites aceptables. */
  rangoMin?: number;
  rangoMax?: number;
  /** Cómo se suman resultados de varios periodos: `suma` (conteos) o `ultimo` (tasas, saldos). */
  agregacion: 'suma' | 'ultimo';
  fuente: string;
  estado: Validacion;
  activo: boolean;
  discrepancia?: string;
}

export interface KpiTarget extends BaseEntity, Fuente {
  kpiId: ID;
  periodo: Periodo;
  meta: number;
}

/** Resultado medido. Sin `kpiId` queda «pendiente de vinculación». Cada resultado se cuenta una sola vez. */
export interface ResultRecord extends BaseEntity, Fuente {
  kpiId?: ID;
  /** Nombre de la métrica tal como viene en la fuente. */
  metrica: string;
  valor: number;
  unidad: string;
  periodo: Periodo;
  /** Fecha en que se actualizó la cifra en la fuente. */
  actualizado?: ISODate;
  /** Proyecto/iniciativa al que se atribuye directamente (opcional; la relación general es proyecto → KPI). */
  projectId?: ID;
}

export interface BudgetLine extends BaseEntity, Fuente {
  clave: string;
  nombre: string;
  /** Presupuesto autorizado inicial (antes de ampliaciones y transferencias). */
  original: number;
  /** Categorías del reporte contable que se cargan a esta partida. */
  categoriasContables: string[];
  /** Fondo revolvente (p. ej. SOC Store): el gasto se concilia contra ventas y reinversión. */
  revolvente?: boolean;
  /** Reserva no asignada. */
  reserva?: boolean;
  areaId?: ID;
  orden: number;
}

export type BudgetMovementTipo = 'ampliacion' | 'reduccion' | 'transferencia' | 'reclasificacion';

/**
 * Movimiento presupuestal. Una transferencia es UN registro con origen y destino:
 * mueve dinero entre partidas sin cambiar el total. La reclasificación mueve GASTO
 * contable entre partidas (análisis directivo) y nunca cambia el presupuesto.
 */
export interface BudgetMovement extends BaseEntity, Fuente {
  folio: string;
  tipo: BudgetMovementTipo;
  deLineaId?: ID;
  aLineaId?: ID;
  /** Para reclasificaciones de una categoría contable sin partida (p. ej. Content Marketing). */
  deCategoria?: string;
  /** Monto; en reclasificación de categoría completa puede omitirse (se toma el gasto de la categoría). */
  monto?: number;
  concepto: string;
  fecha?: ISODate;
  autorizadoPor?: string;
}

/** Gasto ejercido (reporte contable) por categoría contable y mes. */
export interface SpendRecord extends BaseEntity, Fuente {
  categoria: string;
  /** `YYYY-MM` */
  mes: string;
  monto: number;
}

/** Gasto comprometido (o ejercido con detalle de proyecto). */
export interface BudgetCommitment extends BaseEntity, Fuente {
  lineaId: ID;
  projectId?: ID;
  concepto: string;
  monto: number;
  fecha: ISODate;
  situacion: 'comprometido' | 'ejercido' | 'cancelado';
}

/** Partida ↔ proyecto: cuánto de una partida financia un proyecto. */
export interface BudgetAllocation extends BaseEntity {
  lineaId: ID;
  projectId: ID;
  monto: number;
  nota?: string;
  estado: Validacion;
}

/** Proyecto ↔ KPI. */
export interface ProjectKpi extends BaseEntity {
  projectId: ID;
  kpiId: ID;
  contribucion: 'directa' | 'indirecta';
  nota?: string;
}

/** Proyecto ↔ gerencia colaboradora (además del área responsable del proyecto). */
export interface ProjectArea extends BaseEntity {
  projectId: ID;
  areaId: ID;
  rol: string;
}

/** Ingreso o beneficio económico atribuible y verificable (para ROAS / ROI). */
export interface Revenue extends BaseEntity, Fuente {
  concepto: string;
  /**
   * `ingreso_publicidad`: ingreso atribuible a la publicidad (ROAS).
   * `beneficio_economico`: beneficio económico atribuible (margen o utilidad, NO ingreso bruto) para ROI.
   * Nunca el monto de colocación hipotecaria.
   */
  tipo: 'ingreso_publicidad' | 'beneficio_economico';
  monto: number;
  periodo: Periodo;
  scopeId?: ID;
}

/**
 * Alcance de eficiencia: una inversión atribuible y los resultados que produjo,
 * del MISMO alcance y periodo. Es la única base para CPL, costo por MQL/SQL/cierre,
 * CPA, ROAS y ROI.
 */
export interface EfficiencyScope extends BaseEntity, Fuente {
  nombre: string;
  areaId?: ID;
  projectIds: ID[];
  lineaIds: ID[];
  periodo: Periodo;
  /** Inversión atribuible al alcance (null = no identificada). */
  inversion: number | null;
  /** Qué incluye la inversión (pauta, honorarios, producción…). */
  inversionIncluye?: string;
  /** KPIs del embudo, por etapa. */
  etapas: { leads?: ID; mql?: ID; sql?: ID; cierres?: ID; clientes?: ID };
  /** Gasto publicitario dentro de la inversión (para ROAS). */
  gastoPublicitario?: number | null;
  /** Costos y beneficios que se consideran para ROI. */
  criterioRoi?: string;
}

/** Pesos del índice complementario de atención (propuesta configurable; no cambia la prioridad oficial). */
export interface InvestmentPriorityConfig {
  aprobado: boolean;
  pesos: { impacto: number; urgencia: number; dependencia: number; riesgo: number; avance: number; kpis: number; inversion: number; fecha: number };
  /** Tope de la contribución de la inversión (evita que el dinero domine). */
  topeInversion: number;
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
  /** Prioridad estratégica / operativa / clasificación integrada (desde el modelo de dos ejes). */
  prioridadEstrategica?: Priority;
  prioridadOperativa?: Priority;
  clasificacion?: Clasificacion;
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
  /** Máximo recomendado por gerencia de P1 Críticos + P1 Urgentes. */
  maxP1UrgentesPorArea: number;
  /** Máximo recomendado por gerencia de P1 Estratégicos. */
  maxP1EstrategicosPorArea: number;
  /** Días sin actividad para marcar un P1 Estratégico como desatendido. */
  diasDesatendido: number;
  /** Puntuación operativa mínima para P1 y para P2. */
  umbralOperativoP1: number;
  umbralOperativoP2: number;
}

export interface Settings {
  id: 'settings';
  activeWeekId?: ID;
  currentUserId?: ID;
  externalDependencies: string[];
  statusLabels: Record<ProjectStatus, string>;
  criteria: Criteria;
  orgName: string;
  /** Matriz directiva de prioridades (por gerencia). */
  priorityMatrix?: PriorityMatrix;
  /** 2 = modelo de prioridad estratégica + operativa ya aplicado a los datos. */
  priorityModel?: number;
  /** Índice complementario de atención (Inversión, KPIs y Resultados). */
  investmentPriority?: InvestmentPriorityConfig;
  /** Fecha de corte contable vigente (`YYYY-MM`). */
  corteContable?: string;
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
  priorityLog: PriorityLog[];
  objectives: StrategicObjective[];
  kpis: Kpi[];
  kpiTargets: KpiTarget[];
  results: ResultRecord[];
  budgetLines: BudgetLine[];
  budgetMovements: BudgetMovement[];
  spend: SpendRecord[];
  budgetCommitments: BudgetCommitment[];
  budgetAllocations: BudgetAllocation[];
  projectKpis: ProjectKpi[];
  projectAreas: ProjectArea[];
  revenues: Revenue[];
  efficiencyScopes: EfficiencyScope[];
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
  'priorityLog',
  'objectives',
  'kpis',
  'kpiTargets',
  'results',
  'budgetLines',
  'budgetMovements',
  'spend',
  'budgetCommitments',
  'budgetAllocations',
  'projectKpis',
  'projectAreas',
  'revenues',
  'efficiencyScopes',
];

/** Colecciones del módulo Inversión, KPIs y Resultados. */
export const INVESTMENT_COLLECTIONS: CollectionName[] = COLLECTIONS.slice(COLLECTIONS.indexOf('objectives'));
/** Cifras financieras y catálogo: sólo Dirección / Administración las modifican (también en el servidor). */
export const DIRECTION_ONLY_COLLECTIONS: CollectionName[] = [
  'objectives',
  'kpis',
  'kpiTargets',
  'budgetLines',
  'budgetMovements',
  'spend',
  'budgetCommitments',
  'budgetAllocations',
  'revenues',
  'efficiencyScopes',
];
