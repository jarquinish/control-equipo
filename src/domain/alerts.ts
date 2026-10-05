import { fmtDeadline } from './dates';
import {
  areaUpdateFor,
  blockIsManaged,
  getSettings,
  isActiveProject,
  isBlockOpen,
  isDueSoon,
  isDueToday,
  isOpenCommitment,
  isOverdue,
  projectUpdatedThisWeek,
  type WeekData,
} from './selectors';
import type { DbData, Project } from './types';

export type AlertKind =
  | 'compromiso_vencido'
  | 'p1_bloqueado'
  | 'compromiso_vence_hoy'
  | 'compromiso_vence_pronto'
  | 'reprogramado'
  | 'p1_sin_actualizacion'
  | 'escalado'
  | 'bloqueo_sin_compromiso'
  | 'p1_sin_responsable'
  | 'area_sin_actualizar';

export type Severity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  kind: AlertKind;
  /** Orden de atención (menor = más urgente). */
  rank: number;
  severity: Severity;
  title: string;
  detail: string;
  projectId?: string;
  commitmentId?: string;
  blockId?: string;
  areaId?: string;
}

export const ALERT_LABELS: Record<AlertKind, string> = {
  compromiso_vencido: 'Compromiso vencido',
  p1_bloqueado: 'P1 bloqueado',
  compromiso_vence_hoy: 'Compromiso vence hoy',
  compromiso_vence_pronto: 'Compromiso vence pronto',
  reprogramado: 'Proyecto reprogramado',
  p1_sin_actualizacion: 'P1 sin actualización',
  escalado: 'Bloqueo escalado',
  bloqueo_sin_compromiso: 'Bloqueo sin compromiso',
  p1_sin_responsable: 'P1 sin responsable',
  area_sin_actualizar: 'Área sin actualizar',
};

/**
 * Alertas internas. El orden sigue la regla de "Requieren atención":
 * vencidos → P1 bloqueados → vencen pronto → reprogramados → P1 sin
 * actualización → escalados → (bloqueos sin compromiso, P1 sin responsable, áreas).
 */
export function computeAlerts(db: DbData, data: WeekData, now: Date): Alert[] {
  const settings = getSettings(db);
  const { criteria } = settings;
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const alerts: Alert[] = [];
  const projectName = (id: string) => projects.get(id)?.nombre ?? db.projects.find((p) => p.id === id)?.nombre ?? 'Proyecto';

  for (const c of data.commitments.filter(isOpenCommitment)) {
    const when = fmtDeadline(c.fecha, c.hora, now);
    if (isOverdue(c, now)) {
      alerts.push({
        id: `venc-${c.id}`,
        kind: 'compromiso_vencido',
        rank: 1,
        severity: 'critical',
        title: projectName(c.projectId),
        detail: `Compromiso venció ${when}: ${c.accion}`,
        projectId: c.projectId,
        commitmentId: c.id,
      });
    } else if (isDueToday(c, now)) {
      alerts.push({
        id: `hoy-${c.id}`,
        kind: 'compromiso_vence_hoy',
        rank: 3,
        severity: 'warning',
        title: projectName(c.projectId),
        detail: `Compromiso vence ${when}: ${c.accion}`,
        projectId: c.projectId,
        commitmentId: c.id,
      });
    } else if (isDueSoon(c, now, criteria.horasVencePronto)) {
      alerts.push({
        id: `pronto-${c.id}`,
        kind: 'compromiso_vence_pronto',
        rank: 3,
        severity: 'warning',
        title: projectName(c.projectId),
        detail: `Compromiso vence ${when}: ${c.accion}`,
        projectId: c.projectId,
        commitmentId: c.id,
      });
    }
    if (c.reprogramaciones > 0) {
      const varias = c.reprogramaciones >= criteria.umbralReprogramaciones;
      alerts.push({
        id: `rep-${c.id}`,
        kind: 'reprogramado',
        rank: 4,
        severity: varias ? 'critical' : 'warning',
        title: projectName(c.projectId),
        detail: varias
          ? `Reprogramado ${c.reprogramaciones} veces: ${c.accion}`
          : `Reprogramado 1 vez: ${c.accion}`,
        projectId: c.projectId,
        commitmentId: c.id,
      });
    }
    if (c.estado === 'escalado') {
      alerts.push({
        id: `escc-${c.id}`,
        kind: 'escalado',
        rank: 6,
        severity: 'warning',
        title: projectName(c.projectId),
        detail: `Compromiso escalado${c.escaladoA ? ` a ${c.escaladoA}` : ''}: ${c.accion}`,
        projectId: c.projectId,
        commitmentId: c.id,
      });
    }
  }

  for (const p of data.projects.filter(isActiveProject)) {
    if (p.prioridadFinal !== 'P1') continue;
    if (p.bloqueado) {
      alerts.push({
        id: `p1b-${p.id}`,
        kind: 'p1_bloqueado',
        rank: 2,
        severity: 'critical',
        title: p.nombre,
        detail: 'P1 bloqueado',
        projectId: p.id,
      });
    }
    if (data.live && !projectUpdatedThisWeek(data, p.id)) {
      alerts.push({
        id: `p1u-${p.id}`,
        kind: 'p1_sin_actualizacion',
        rank: 5,
        severity: 'warning',
        title: p.nombre,
        detail: 'P1 sin actualización esta semana',
        projectId: p.id,
      });
    }
    if (!p.responsable) {
      alerts.push({
        id: `p1r-${p.id}`,
        kind: 'p1_sin_responsable',
        rank: 7,
        severity: 'warning',
        title: p.nombre,
        detail: 'P1 sin responsable asignado',
        projectId: p.id,
      });
    }
  }

  for (const b of data.blocks.filter(isBlockOpen)) {
    if (b.estado === 'escalado') {
      alerts.push({
        id: `escb-${b.id}`,
        kind: 'escalado',
        rank: 6,
        severity: 'warning',
        title: projectName(b.projectId),
        detail: `Bloqueo escalado${b.escaladoA ? ` a ${b.escaladoA}` : ''}: ${b.descripcion}`,
        projectId: b.projectId,
        blockId: b.id,
      });
    }
    if (!blockIsManaged(b, data.commitments)) {
      alerts.push({
        id: `bsc-${b.id}`,
        kind: 'bloqueo_sin_compromiso',
        rank: 7,
        severity: 'warning',
        title: projectName(b.projectId),
        detail: `Bloqueo sin compromiso: ${b.descripcion}`,
        projectId: b.projectId,
        blockId: b.id,
      });
    }
  }

  if (data.live) {
    for (const a of db.areas.filter((x) => x.activo)) {
      if (!areaUpdateFor(data, a.id)) {
        alerts.push({
          id: `area-${a.id}`,
          kind: 'area_sin_actualizar',
          rank: 8,
          severity: 'info',
          title: a.nombre,
          detail: `${a.nombre} aún no actualiza su semana`,
          areaId: a.id,
        });
      }
    }
  }

  return alerts.sort((a, b) => a.rank - b.rank);
}

export interface AttentionItem {
  project: Project;
  alerts: Alert[];
  rank: number;
}

/** Agrupa las alertas por proyecto para el bloque "Requieren atención". */
export function attentionItems(data: WeekData, alerts: Alert[]): AttentionItem[] {
  const map = new Map<string, AttentionItem>();
  for (const a of alerts) {
    if (!a.projectId) continue;
    const project = data.projects.find((p) => p.id === a.projectId);
    if (!project) continue;
    const item = map.get(a.projectId) ?? { project, alerts: [], rank: a.rank };
    item.alerts.push(a);
    item.rank = Math.min(item.rank, a.rank);
    map.set(a.projectId, item);
  }
  return [...map.values()].sort((a, b) => a.rank - b.rank || b.alerts.length - a.alerts.length);
}
