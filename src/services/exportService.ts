import { BLOCK_STATUS_LABELS, COMMITMENT_STATUS_LABELS, QUADRANT_LABELS } from '../domain/constants';
import { commitmentDisplayStatus, dependencyLabel, getSettings, personName } from '../domain/selectors';
import type { DbData } from '../domain/types';

function cell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM UTF-8 para que Excel respete acentos. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function projectsCsv(db: DbData): string {
  const s = getSettings(db);
  const area = (id: string) => db.areas.find((a) => a.id === id)?.nombre ?? '';
  return toCsv(
    ['Proyecto', 'Descripción', 'Área', 'Responsable', 'Impacto', 'Urgencia', 'Dependencia', 'Score', 'Prioridad calculada', 'Prioridad final', 'Ajuste Dirección', 'Motivo ajuste', 'Eisenhower', 'Estado', 'Bloqueado', 'Depende de', 'Fecha objetivo', 'Actualizado'],
    db.projects.map((p) => [
      p.nombre, p.descripcion, area(p.areaId), personName(db.people, p.responsable, ''), p.impacto, p.urgencia, p.dependencia, p.score,
      p.prioridadCalculada, p.prioridadFinal, p.ajusteDireccion ? 'Sí' : 'No', p.motivoAjuste ?? '', QUADRANT_LABELS[p.eisenhower],
      s.statusLabels[p.estado], p.bloqueado ? 'Sí' : 'No', p.dependeDe ? dependencyLabel(db, p.dependeDe) : '', p.fechaObjetivo ?? '', p.updatedAt,
    ]),
  );
}

export function commitmentsCsv(db: DbData, now: Date): string {
  const proj = (id: string) => db.projects.find((p) => p.id === id);
  const area = (id?: string) => db.areas.find((a) => a.id === id)?.nombre ?? '';
  return toCsv(
    ['Compromiso', 'Proyecto', 'Área', 'Responsable', 'Apoyo', 'Fecha', 'Hora', 'Estado', 'Fecha original', 'Hora original', 'Reprogramaciones', 'Motivo reprogramación', 'Escalado a', 'Semana', 'Creado', 'Completado'],
    db.commitments.map((c) => [
      c.accion, proj(c.projectId)?.nombre ?? '', area(proj(c.projectId)?.areaId), personName(db.people, c.responsable, ''), c.apoyo ?? '',
      c.fecha, c.hora, COMMITMENT_STATUS_LABELS[commitmentDisplayStatus(c, now)], c.fechaOriginal, c.horaOriginal, c.reprogramaciones,
      c.motivoReprogramacion ?? '', c.escaladoA ?? '', c.weekId, c.createdAt, c.completedAt ?? '',
    ]),
  );
}

export function blocksCsv(db: DbData): string {
  const proj = (id: string) => db.projects.find((p) => p.id === id);
  const area = (id?: string) => db.areas.find((a) => a.id === id)?.nombre ?? '';
  return toCsv(
    ['Proyecto', 'Área', 'Prioridad', 'Bloqueo', 'Necesidad', 'Depende de (área)', 'Depende de (persona)', 'Quién puede ayudar', 'Gestiona', 'Estado', 'Escalado a', 'Semana', 'Creado', 'Resuelto'],
    db.blocks.map((b) => [
      proj(b.projectId)?.nombre ?? '', area(proj(b.projectId)?.areaId), proj(b.projectId)?.prioridadFinal ?? '', b.descripcion, b.necesidad,
      dependencyLabel(db, b.areaDependencia), b.dependeDe, b.quienPuedeAyudar ?? '', personName(db.people, b.responsableGestion, ''),
      BLOCK_STATUS_LABELS[b.estado], b.escaladoA ?? '', b.weekId, b.createdAt, b.resolvedAt ?? '',
    ]),
  );
}
