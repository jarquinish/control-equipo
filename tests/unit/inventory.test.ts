import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readXlsx } from '../../src/data/xlsx';
import { buildPlan, defaultChoices, parseDateCell, parseInventory, parseLevel, parseStatus, parseTipo, type ImportOptions } from '../../src/domain/inventory';
import { getWeekData, getActiveWeek } from '../../src/domain/selectors';
import { buildInventoryTemplate } from '../../src/services/importService';
import { inventoryBook } from '../fixtures/inventory';
import { setup } from './helpers';

async function load(opts: Partial<ImportOptions> = {}) {
  const env = await setup();
  const db = env.svc.ctx.store.getState();
  const inv = parseInventory(readXlsx(inventoryBook()), db, '2026-10-06');
  const choices = defaultChoices(inv, db);
  const o: ImportOptions = { includePending: false, defaultHora: '18:00', sheetAreas: { Contenido: env.areas.Contenido }, today: '2026-10-06', ...opts };
  return { ...env, db, inv, choices, o };
}

describe('lectura de Excel', () => {
  it('lee texto, números y libros con prefijos de espacio de nombres (x:)', () => {
    const files = {
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8('<?xml version="1.0"?><x:workbook xmlns:x="m"><x:sheets><x:sheet name="Diseño" sheetId="1" r:id="R1" xmlns:r="r" /></x:sheets></x:workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('﻿<Relationships><Relationship Target="/xl/worksheets/sheet1.xml" Id="R1" /></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<x:sst><x:si><x:t>Hola &amp; adiós</x:t></x:si><x:si><x:r><x:t>Ri</x:t></x:r><x:r><x:t xml:space="preserve">co</x:t></x:r></x:si></x:sst>'),
      'xl/worksheets/sheet1.xml': strToU8('<x:worksheet><x:sheetData><x:row r="2"><x:c r="B2" t="s"><x:v>0</x:v></x:c><x:c r="D2" t="s"><x:v>1</x:v></x:c><x:c r="E2"><x:v>46300</x:v></x:c></x:row></x:sheetData></x:worksheet>'),
    };
    const wb = readXlsx(zipSync(files));
    expect(wb.sheets[0].name).toBe('Diseño');
    expect(wb.sheets[0].rows[1]).toEqual([null, 'Hola & adiós', null, 'Rico', 46300]);
  });

  it('rechaza archivos que no son Excel', () => {
    expect(() => readXlsx(strToU8('no soy un zip'))).toThrow(/Excel/);
  });

  it('interpreta valores de la gerencia', () => {
    expect(parseLevel('Alto', 'impacto')).toEqual({ level: 3, nuevo: false });
    expect(parseLevel('Estrategia', 'impacto')).toEqual({ level: 2, nuevo: true });
    expect(parseLevel('Debe avanzar esta semana', 'urgencia').level).toBe(2);
    expect(parseLevel('Varias áreas / Dirección / tercero', 'dependencia').level).toBe(3);
    expect(parseStatus('Atorado').estado).toBe('en_riesgo');
    expect(parseStatus('Casi terminado').estado).toBe('en_curso');
    expect(parseStatus('Cancelado').estado).toBe('archivado');
    expect(parseStatus('Propuesto en sesión').estado).toBe('por_iniciar');
    expect(parseTipo('Actividad / subproyecto').kind).toBe('actividad');
    expect(parseTipo('Proyecto o actividad - validar')).toEqual({ kind: 'proyecto', dudoso: true });
    expect(parseDateCell(46303, false, '2026-10-06')).toEqual({ date: '2026-10-08', time: undefined });
    expect(parseDateCell('05/10/2026', false, '2026-10-06').date).toBe('2026-10-05');
    expect(parseDateCell('Antes de 2026-10-14', false, '2026-10-06')).toEqual({ date: '2026-10-14', interpretada: true });
    expect(parseDateCell('Semana del 12 oct', false, '2026-10-06')).toEqual({ date: '2026-10-12', interpretada: true });
    expect(parseDateCell('Semanal', false, '2026-10-06')).toEqual({});
  });
});

describe('inventario: interpretación y plan', () => {
  it('detecta la hoja del área, ignora el resumen y unifica nombres', async () => {
    const { inv, areas } = await load();
    expect(inv.ignored).toEqual(['Resumen Dirección']);
    expect(inv.sheets).toHaveLength(1);
    expect(inv.sheets[0].areaId).toBe(areas.Contenido);
    expect(inv.sheets[0].rows).toHaveLength(7);
    const t1 = inv.sheets[0].rows[0];
    expect(t1.personas.owner).toEqual(['Laura Pérez', 'Marta Ruiz']); // «Laura / Marta» → nombres completos
    expect(t1.personas.solucion).toEqual(['Marta Ruiz']);
    expect(t1.fechaSol).toBe('2026-10-08'); // número de serie de Excel
    expect(t1.bloqueoDependeKey).toBe('ext:Dirección de Posicionamiento');
    expect(inv.people['Marta Ruiz']).toEqual({ sheet: 'Contenido', gerente: true });
  });

  it('sólo importa filas validadas (o pendientes si se pide) y agrupa actividades', async () => {
    const { inv, choices, o, db } = await load();
    const plan = buildPlan(inv, choices, o, db);
    expect(plan.stats.proyectos).toBe(3); // T-01, T-04, T-07
    expect(plan.stats.frentes).toBe(1); // «Coberturas semanales» agrupa T-02 y T-03
    expect(plan.stats.actividades).toBe(2);
    const frente = plan.projects.find((p) => p.esFrente)!;
    expect(frente.nombre).toBe('Coberturas semanales');
    expect(frente.actividades).toHaveLength(2);
    expect(frente.impacto).toBe(3); // el mayor de sus actividades
    expect(plan.issues[`Contenido#9`].some((i) => i.msg.includes('Pendiente de validación'))).toBe(true);
    expect(plan.issues[`Contenido#10`].some((i) => i.msg.includes('Descartado'))).toBe(true);
    const withPending = buildPlan(inv, choices, { ...o, includePending: true }, db);
    expect(withPending.stats.proyectos).toBe(4);
  });

  it('avisa lo que la gerencia debe decidir', async () => {
    const { inv, choices, o, db } = await load();
    const plan = buildPlan(inv, choices, o, db);
    const msgs = (k: string) => plan.issues[k].map((i) => i.msg).join(' | ');
    expect(msgs('Contenido#5')).toContain('Impacto «Alto»: clasifícalo como Operación, Estrategia o Negocio');
    expect(msgs('Contenido#6')).toContain('interpretada como 2026-10-12');
    expect(msgs('Contenido#7')).toContain('Fecha de entrega «Semanal» no reconocida');
    expect(msgs('Contenido#7')).toContain('no tiene responsable, fecha');
    expect(msgs('Contenido#11')).toContain('La IA propuso P2; la fórmula da P1 (score 8)');
    // Prioridad validada distinta a la fórmula → ajuste de Dirección
    expect(plan.projects.find((p) => p.nombre === 'Reporte de KPIs')!.override).toEqual({ prioridad: 'P1', motivo: expect.any(String) });
    // Al clasificar el impacto en la vista previa, el aviso desaparece
    const fixed = buildPlan(inv, { ...choices, 'Contenido#5': { ...choices['Contenido#5'], impacto: 2, impactoOk: true } }, o, db);
    expect(fixed.issues['Contenido#5'].map((i) => i.msg).join()).not.toContain('clasifícalo');
  });

  it('crea proyectos, bloqueos, compromisos y personas; no duplica al reimportar', async () => {
    const { svc, inv, choices, o, db, areas } = await load();
    const plan = buildPlan(inv, choices, o, db);
    const res = svc.imports.apply(plan, 'junta');
    expect(res).toMatchObject({ proyectos: 4, bloqueos: 2, personas: 2 }); // T-03 «Atorado» también es un bloqueo
    const state = svc.ctx.store.getState();
    const t1 = state.projects.find((p) => p.ref === 'T-01')!;
    expect(t1).toMatchObject({ areaId: areas.Contenido, prioridadFinal: 'P1', bloqueado: true, estado: 'en_curso' });
    expect(state.people.find((p) => p.id === t1.responsable)?.nombre).toBe('Laura Pérez');
    expect(state.people.find((p) => p.nombre === 'Marta Ruiz')).toMatchObject({ rol: 'GERENTE', areaId: areas.Contenido });
    const block = state.blocks.find((b) => b.projectId === t1.id)!;
    expect(block.estado).toBe('en_gestion'); // tiene compromiso de solución completo
    const cs = state.commitments.filter((c) => c.projectId === t1.id);
    expect(cs.map((c) => [c.accion, c.fecha, c.hora])).toEqual(
      expect.arrayContaining([
        ['Destrabar: Aprobación de copy', '2026-10-08', '18:00'],
        ['Enviar copy final', '2026-10-08', '18:00'],
      ]),
    );
    const kpis = state.projects.find((p) => p.ref === 'T-04')!;
    expect(kpis).toMatchObject({ prioridadCalculada: 'P2', prioridadFinal: 'P1', ajusteDireccion: true });
    const frente = state.projects.find((p) => p.nombre === 'Coberturas semanales')!;
    expect(frente.descripcion).toContain('Actividades:\n- Cobertura evento A');
    // Aparece en la semana activa (dashboard)
    expect(getWeekData(state, getActiveWeek(state)?.id, new Date(2026, 9, 6))?.projects).toHaveLength(4);

    // Reimportar el mismo archivo no duplica
    const inv2 = parseInventory(readXlsx(inventoryBook()), state, '2026-10-06');
    const plan2 = buildPlan(inv2, defaultChoices(inv2, state), o, state);
    expect(plan2.stats.proyectos).toBe(0);
    expect(plan2.issues['Contenido#5'].some((i) => i.msg.includes('Ya existe'))).toBe(true);
  });

  it('la plantilla se puede leer de vuelta: una hoja por área con todas las columnas', async () => {
    const { db } = await load();
    const bytes = buildInventoryTemplate(db.areas.map((a) => a.nombre));
    const wb = readXlsx(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Instrucciones', 'Contenido', 'Diseño', 'Marketing Digital', 'SOC Store']);
    const inv = parseInventory(wb, db, '2026-10-06');
    expect(inv.sheets.map((s) => s.areaId)).toEqual(db.areas.map((a) => a.id));
    expect(inv.ignored).toEqual(['Instrucciones']);
  });
});
