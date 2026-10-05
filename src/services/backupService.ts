import { normalizeData } from '../data/store';
import { EXPORT_APP_ID, PRIORITIES, PROJECT_STATUSES, SCHEMA_VERSION } from '../domain/constants';
import { isValidDate, isValidTime } from '../domain/dates';
import { isLevel } from '../domain/scoring';
import { COLLECTIONS, type CollectionName, type DbData } from '../domain/types';
import type { ServiceContext } from './context';

export interface BackupFile {
  app: typeof EXPORT_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  workspace?: string;
  data: DbData;
}

export type ParseResult =
  | { ok: true; file: BackupFile; counts: Record<CollectionName, number>; warnings: string[] }
  | { ok: false; errors: string[] };

const LABELS: Record<CollectionName, string> = {
  areas: 'áreas',
  people: 'personas',
  projects: 'proyectos',
  weeks: 'semanas',
  weeklyUpdates: 'actualizaciones semanales',
  areaUpdates: 'actualizaciones de área',
  blocks: 'bloqueos',
  commitments: 'compromisos',
  sessions: 'sesiones Weekly',
  decisions: 'decisiones',
  snapshots: 'snapshots históricos',
  settings: 'configuración',
};
export const COLLECTION_LABELS = LABELS;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Valida un archivo de respaldo ANTES de tocar la información existente.
 * Un archivo inválido nunca llega al almacenamiento.
 */
export function parseBackup(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['El archivo no es un JSON válido.'] };
  }
  if (!isObj(json)) return { ok: false, errors: ['El archivo no tiene el formato esperado.'] };
  if (json.app !== EXPORT_APP_ID) return { ok: false, errors: ['El archivo no es un respaldo de Alignment & Unblock.'] };
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion > SCHEMA_VERSION)
    return { ok: false, errors: ['El respaldo proviene de una versión más reciente de la aplicación.'] };
  if (!isObj(json.data)) return { ok: false, errors: ['El respaldo no contiene datos.'] };

  const data = json.data as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];
  const push = (m: string) => errors.length < 25 && errors.push(m);

  for (const c of COLLECTIONS) {
    if (data[c] === undefined) {
      warnings.push(`No incluye ${LABELS[c]}; se tomará como vacío.`);
      continue;
    }
    if (!Array.isArray(data[c])) {
      push(`La sección «${LABELS[c]}» no es una lista.`);
      continue;
    }
    const ids = new Set<string>();
    (data[c] as unknown[]).forEach((item, i) => {
      if (!isObj(item) || !isStr(item.id)) return push(`Registro ${i + 1} de ${LABELS[c]} sin identificador.`);
      if (ids.has(item.id)) push(`Identificador duplicado en ${LABELS[c]}: ${item.id}`);
      ids.add(item.id);
    });
  }
  if (errors.length) return { ok: false, errors };

  const d = normalizeData(data as Partial<DbData>);
  const areaIds = new Set(d.areas.map((a) => a.id));
  const projectIds = new Set(d.projects.map((p) => p.id));

  d.areas.forEach((a) => !isStr(a.nombre) && push(`Área ${a.id} sin nombre.`));
  d.weeks.forEach((w) => {
    if (typeof w.numero !== 'number' || !isValidDate(w.fechaInicio) || !isValidDate(w.fechaFin))
      push(`Semana ${w.id} con número o fechas inválidas.`);
  });
  d.projects.forEach((p) => {
    if (!isStr(p.nombre)) push(`Proyecto ${p.id} sin nombre.`);
    if (!areaIds.has(p.areaId)) push(`El proyecto «${p.nombre ?? p.id}» apunta a un área inexistente.`);
    if (!isLevel(p.impacto) || !isLevel(p.urgencia) || !isLevel(p.dependencia))
      push(`El proyecto «${p.nombre ?? p.id}» tiene impacto/urgencia/dependencia fuera de rango (1–3).`);
    if (!PRIORITIES.includes(p.prioridadFinal)) push(`El proyecto «${p.nombre ?? p.id}» tiene una prioridad inválida.`);
    if (!PROJECT_STATUSES.includes(p.estado)) push(`El proyecto «${p.nombre ?? p.id}» tiene un estado inválido.`);
  });
  d.commitments.forEach((c) => {
    if (!isStr(c.accion)) push(`Compromiso ${c.id} sin acción.`);
    if (!projectIds.has(c.projectId)) push(`El compromiso «${c.accion ?? c.id}» apunta a un proyecto inexistente.`);
    if (!isValidDate(c.fecha) || !isValidTime(c.hora)) push(`El compromiso «${c.accion ?? c.id}» tiene fecha u hora inválida.`);
    if (!Array.isArray(c.historial) || !Array.isArray(c.comentarios)) push(`El compromiso «${c.accion ?? c.id}» tiene historial inválido.`);
  });
  d.blocks.forEach((b) => {
    if (!isStr(b.descripcion)) push(`Bloqueo ${b.id} sin descripción.`);
    if (!projectIds.has(b.projectId)) push(`El bloqueo «${b.descripcion ?? b.id}» apunta a un proyecto inexistente.`);
  });
  if (errors.length) return { ok: false, errors };

  const counts = Object.fromEntries(COLLECTIONS.map((c) => [c, d[c].length])) as Record<CollectionName, number>;
  return {
    ok: true,
    file: {
      app: EXPORT_APP_ID,
      schemaVersion: json.schemaVersion,
      exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : '',
      workspace: typeof json.workspace === 'string' ? json.workspace : undefined,
      data: d,
    },
    counts,
    warnings,
  };
}

export function backupService(ctx: ServiceContext) {
  return {
    /** GENERAR RESPALDO / EXPORTAR JSON: toda la información. */
    exportBackup(workspace?: string): BackupFile {
      return {
        app: EXPORT_APP_ID,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: ctx.nowIso(),
        workspace,
        data: structuredClone(ctx.store.getState()),
      };
    },
    parse: parseBackup,

    /** RESTAURAR RESPALDO: reemplaza todo. Sólo acepta un archivo ya validado. */
    async restore(file: BackupFile): Promise<void> {
      await ctx.store.replaceAll(file.data);
    },

    /** IMPORTAR JSON: combina registros (agrega nuevos y actualiza los existentes por id). */
    importMerge(file: BackupFile): Record<CollectionName, number> {
      const counts = {} as Record<CollectionName, number>;
      ctx.store.batch(() => {
        for (const c of COLLECTIONS) {
          counts[c] = 0;
          for (const item of file.data[c]) {
            if (c === 'settings') continue; // la configuración local se conserva al combinar
            ctx.store.upsert(c, item as never);
            counts[c]++;
          }
        }
      });
      return counts;
    },
  };
}
