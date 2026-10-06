import { colLetter, writeXlsx, type WriteSheet } from '../data/xlsx';
import { norm, plannedDescription, TEMPLATE_COLUMNS, TEMPLATE_LISTS, type Plan } from '../domain/inventory';
import type { UpdateOrigin } from '../domain/types';
import { ValidationError } from '../domain/validation';
import type { blockService } from './blockService';
import type { commitmentService } from './commitmentService';
import type { ServiceContext } from './context';
import type { peopleService } from './peopleService';
import type { projectService } from './projectService';

interface Deps {
  people: ReturnType<typeof peopleService>;
  projects: ReturnType<typeof projectService>;
  blocks: ReturnType<typeof blockService>;
  commitments: ReturnType<typeof commitmentService>;
}

export interface ImportResult {
  proyectos: number;
  actualizados: number;
  bloqueos: number;
  compromisos: number;
  personas: number;
}

export function importService(ctx: ServiceContext, deps: Deps) {
  /** Ejecuta el plan de importación en un solo lote. */
  const apply = (plan: Plan, origen: UpdateOrigin = 'area'): ImportResult => {
    if (!ctx.activeWeek()) throw new ValidationError({ semana: 'Abre una semana antes de importar.' });
    if (!plan.projects.length) throw new ValidationError({ archivo: 'No hay filas para importar con la selección actual.' });
    const result: ImportResult = { proyectos: 0, actualizados: 0, bloqueos: 0, compromisos: 0, personas: 0 };
    return ctx.store.batch(() => {
      for (const p of plan.newPeople) {
        deps.people.create(p);
        result.personas++;
      }
      const ids = new Map(ctx.repos.people.list().map((p) => [norm(p.nombre), p.id]));
      const person = (name?: string) => (name ? ids.get(norm(name)) : undefined);

      for (const pp of plan.projects) {
        let projectId: string;
        if (pp.existingId) {
          projectId = pp.existingId;
          const extra = plannedDescription(pp);
          if (extra) {
            const current = deps.projects.get(projectId);
            deps.projects.update(projectId, { descripcion: [current.descripcion, extra].filter(Boolean).join('\n\n') }, { origen });
          }
          result.actualizados++;
        } else {
          const created = deps.projects.create(
            {
              nombre: pp.nombre,
              descripcion: plannedDescription(pp),
              areaId: pp.areaId,
              responsable: person(pp.responsable),
              fechaObjetivo: pp.fechaObjetivo,
              impacto: pp.impacto,
              urgencia: pp.urgencia,
              dependencia: pp.dependencia,
              estado: pp.estado,
              dependeDe: pp.dependeDe,
              ref: pp.ref,
            },
            { origen },
          );
          projectId = created.id;
          if (pp.override) deps.projects.setOverride(projectId, pp.override.prioridad, pp.override.motivo, { origen });
          result.proyectos++;
        }
        for (const b of pp.blocks) {
          const block = deps.blocks.create(
            {
              projectId,
              descripcion: b.descripcion,
              necesidad: b.necesidad,
              dependeDe: b.dependeDe,
              areaDependencia: b.areaDependencia,
              responsableGestion: person(b.responsableGestion),
            },
            origen,
          );
          result.bloqueos++;
          const c = b.commitment;
          const resp = person(c?.responsable);
          if (c && resp) {
            deps.commitments.create({ projectId, blockId: block.id, accion: c.accion, responsable: resp, fecha: c.fecha, hora: c.hora, comentario: c.comentario });
            result.compromisos++;
          }
        }
        for (const c of pp.commitments) {
          const resp = person(c.responsable);
          if (!resp) continue;
          deps.commitments.create({ projectId, accion: c.accion, responsable: resp, fecha: c.fecha, hora: c.hora, comentario: c.comentario });
          result.compromisos++;
        }
      }
      return result;
    });
  };

  return { apply };
}

/** Plantilla oficial del inventario: instrucciones + una hoja por área, con listas desplegables. */
export function buildInventoryTemplate(areas: string[]): Uint8Array {
  const last = 300;
  const header = TEMPLATE_COLUMNS.map((c) => ({ v: c.header, s: 1 as const }));
  const lists = TEMPLATE_COLUMNS.flatMap((c, i) => {
    const options = TEMPLATE_LISTS[c.field];
    if (!options) return [];
    const letter = colLetter(i);
    return [{ range: `${letter}5:${letter}${last}`, options }];
  });
  const instrucciones: WriteSheet = {
    name: 'Instrucciones',
    widths: [34, 110],
    merges: ['A1:B1', 'A2:B2'],
    rows: [
      [{ v: 'ALIGNMENT & UNBLOCK · INVENTARIO DE PROYECTOS', s: 2 }],
      [{ v: 'Una hoja por área. La herramienta lee las hojas cuyo nombre coincide con el área.', s: 4 }],
      [],
      [
        { v: 'Regla', s: 1 },
        { v: 'Cómo llenarlo', s: 1 },
      ],
      [{ v: 'Proyectos, no actividades', s: 3 }, { v: 'Tipo «Proyecto» o «Subproyecto» se carga como proyecto. «Actividad» u «Operación recurrente» se agrupa dentro del proyecto indicado en «Proyecto padre / frente».', s: 3 }],
      [{ v: 'Una persona responsable', s: 3 }, { v: 'Owner operativo, Responsable siguiente acción y Responsable solución: UN nombre por celda (nombre y apellido la primera vez).', s: 3 }],
      [{ v: 'Impacto', s: 3 }, { v: 'Operación = lo básico de ejecución · Estrategia = impacta los objetivos del área (posicionamiento de marca) · Negocio = impacta la venta a cliente, el desarrollo de negocio de oficinas o la atracción de franquicias o talento para nuevas oficinas.', s: 3 }],
      [{ v: 'Ponderación', s: 3 }, { v: 'Score = Impacto + Urgencia + Dependencia (1–3 cada uno). 8–9 → P1 · 6–7 → P2 · 3–5 → P3. «Prioridad validada» sólo si la gerencia decide otra prioridad (queda como ajuste de Dirección).', s: 3 }],
      [{ v: 'Compromisos', s: 3 }, { v: 'La siguiente acción se registra como compromiso cuando tiene responsable, fecha (AAAA-MM-DD) y hora (HH:MM). Igual para la solución de un bloqueo.', s: 3 }],
      [{ v: 'Bloqueos', s: 3 }, { v: '¿Bloqueado? = Sí, describe qué lo bloquea, qué se necesita, de quién depende y quién lo resuelve.', s: 3 }],
      [{ v: 'Validación', s: 3 }, { v: 'Sólo se importan las filas con «Validación gerencia» = Validado o Modificado. Descartado no se importa.', s: 3 }],
      [{ v: 'Volver a importar', s: 3 }, { v: 'Las filas cuyo ID o nombre ya existe en el área se omiten para no duplicar.', s: 3 }],
      [],
      [
        { v: 'Columna', s: 1 },
        { v: 'Qué capturar', s: 1 },
      ],
      ...TEMPLATE_COLUMNS.map((c) => [{ v: c.header, s: 3 as const }, { v: c.hint, s: 3 as const }]),
    ],
  };
  const areaSheets: WriteSheet[] = areas.map((area) => ({
    name: area,
    widths: TEMPLATE_COLUMNS.map((c) => c.width),
    freezeRows: 4,
    merges: [`A1:H1`, `A2:H2`],
    lists,
    rows: [
      [{ v: `ALIGNMENT & UNBLOCK · INVENTARIO · ${area}`, s: 2 }],
      [{ v: 'Una fila por proyecto. Usa las listas desplegables. Ver la hoja «Instrucciones».', s: 4 }],
      [],
      header,
    ],
  }));
  return writeXlsx([instrucciones, ...areaSheets]);
}
