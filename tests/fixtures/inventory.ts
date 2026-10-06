import { writeXlsx } from '../../src/data/xlsx';

/** Encabezados del inventario «Baseline 01» (formato original de la gerencia). */
export const HEAD = [
  'ID', 'Persona que lo mencionó', 'Proyecto / iniciativa / pendiente', 'Tipo propuesto', 'Proyecto padre / frente', 'Objetivo / entregable',
  'Owner operativo', 'Gerente responsable', 'Estado', 'Impacto', 'Urgencia', 'Dependencia', 'Prioridad IA', 'Prioridad validada', 'Próximo hito',
  'Siguiente acción concreta', 'Responsable siguiente acción', 'Fecha compromiso entrega', '¿Bloqueado?', 'Bloqueo / problema concreto',
  'Qué se necesita para destrabar', 'De quién depende', 'Responsable solución / desbloqueo', 'Fecha compromiso solución', 'Dependencia con otra área',
  'Entregable hacia otra área', 'Proyecto desplazado / pausado', 'Motivo del desplazamiento', 'Decisión requerida', 'Origen', 'Confianza IA',
  'Evidencia / momento de sesión', 'Validación gerencia', 'Observaciones gerencia',
] as const;
type Row = Partial<Record<(typeof HEAD)[number], string | number>>;
const row = (r: Row) => HEAD.map((h) => r[h] ?? null);

/** Filas de ejemplo (datos ficticios) que cubren los casos que la importación debe resolver. */
export const ROWS: Row[] = [
  { ID: 'T-01', 'Persona que lo mencionó': 'Laura Pérez', 'Proyecto / iniciativa / pendiente': 'Revista - publirreportaje', 'Tipo propuesto': 'Proyecto', 'Owner operativo': 'Laura / Marta', 'Gerente responsable': 'Marta Ruiz', Estado: 'En cierre', Impacto: 'Alto', Urgencia: 'Alta', Dependencia: 'Alta', 'Prioridad IA': 'P1', 'Siguiente acción concreta': 'Enviar copy final', 'Responsable siguiente acción': 'Laura', 'Fecha compromiso entrega': '2026-10-08', '¿Bloqueado?': 'Sí', 'Bloqueo / problema concreto': 'Falta visto bueno', 'Qué se necesita para destrabar': 'Aprobación de copy', 'De quién depende': 'Dirección + Diseño', 'Responsable solución / desbloqueo': 'Marta', 'Fecha compromiso solución': 46303, 'Validación gerencia': 'Validado' },
  { ID: 'T-02', 'Persona que lo mencionó': 'Laura Pérez', 'Proyecto / iniciativa / pendiente': 'Cobertura evento A', 'Tipo propuesto': 'Actividad / cobertura', 'Proyecto padre / frente': 'Coberturas semanales', 'Owner operativo': 'Laura', Estado: 'Programado', Impacto: 'Medio', Urgencia: 'Media', Dependencia: 'Baja', 'Siguiente acción concreta': 'Cubrir evento', 'Responsable siguiente acción': 'Laura', 'Fecha compromiso entrega': 'Semana del 12 oct', 'Validación gerencia': 'Validado' },
  { ID: 'T-03', 'Persona que lo mencionó': 'Laura Pérez', 'Proyecto / iniciativa / pendiente': 'Cobertura evento B', 'Tipo propuesto': 'Actividad', 'Proyecto padre / frente': 'Coberturas semanales', 'Owner operativo': 'Diseño', Estado: 'Atorado', Impacto: 'Negocio', Urgencia: 'Deadline inmediato', Dependencia: 'Media', 'Siguiente acción concreta': 'Cubrir evento B', 'Responsable siguiente acción': 'Diseño', 'Fecha compromiso entrega': 'Semanal', 'Validación gerencia': 'Modificado' },
  { ID: 'T-04', 'Proyecto / iniciativa / pendiente': 'Reporte de KPIs', 'Tipo propuesto': 'Proyecto / análisis', 'Owner operativo': 'Marta Ruiz', Estado: 'Casi terminado', Impacto: 'Alto', Urgencia: 'Alta', Dependencia: 'Baja', 'Prioridad IA': 'P1', 'Prioridad validada': 'P1', 'Validación gerencia': 'Validado' },
  { ID: 'T-05', 'Proyecto / iniciativa / pendiente': 'Idea sin validar', 'Tipo propuesto': 'Proyecto', Impacto: 'Bajo', Urgencia: 'Baja', Dependencia: 'Baja', 'Validación gerencia': 'Pendiente' },
  { ID: 'T-06', 'Proyecto / iniciativa / pendiente': 'Descartado', 'Tipo propuesto': 'Proyecto', Impacto: 'Bajo', Urgencia: 'Baja', Dependencia: 'Baja', 'Validación gerencia': 'Descartado' },
  { ID: 'T-07', 'Proyecto / iniciativa / pendiente': 'Webinar', 'Tipo propuesto': 'Proyecto', 'Owner operativo': 'Laura', Impacto: 'Alto', Urgencia: 'Media', Dependencia: 'Alta', 'Prioridad IA': 'P2', 'Validación gerencia': 'Validado' },
];

/** Libro con una hoja de resumen (se ignora) y la hoja del área con título, subtítulo y encabezados en la fila 4. */
export function inventoryBook(sheetName = 'Contenido') {
  return writeXlsx([
    { name: 'Resumen Dirección', rows: [['Gerencia', 'Registros'], ['Contenido', 7]] },
    { name: sheetName, rows: [['ALIGNMENT & UNBLOCK · BASELINE 01'], ['Sesión 1'], [], [...HEAD], ...ROWS.map(row)] },
  ]);
}
