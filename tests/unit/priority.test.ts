import { describe, expect, it } from 'vitest';
import { readXlsx, writeXlsx } from '../../src/data/xlsx';
import { buildPlan, defaultChoices, parseInventory, TEMPLATE_COLUMNS, type ImportOptions } from '../../src/domain/inventory';
import { attentionOrder, matchInitiatives, normName, DEFAULT_MATRIX } from '../../src/domain/priority';
import { getActiveWeek, getWeekData, isActiveProject } from '../../src/domain/selectors';
import { ValidationError } from '../../src/domain/validation';
import { projectsCsv } from '../../src/services/exportService';
import { setup } from './helpers';

// Hoy en las pruebas: lunes 5 de octubre de 2026.
describe('matriz directiva · casos obligatorios', () => {
  it('SOC TV en Contenido → P1 Crítico (estratégico y urgente por la matriz)', async () => {
    const { svc, areas } = await setup();
    const p = svc.projects.create({ nombre: 'SOC TV · temporada 2', areaId: areas['Contenido'], impacto: 2, urgencia: 1, dependencia: 1 });
    expect(p.clasif).toMatchObject({ estrategica: 'P1', operativa: 'P1', integrada: 'P1C', fuenteEstrategica: 'matriz', fuenteOperativa: 'matriz' });
    expect(p.prioridadFinal).toBe('P1');
    expect(p.clasif!.motivoEstrategica).toContain('Iniciativa «SOC TV» definida como estratégica para Contenido por la Dirección de Posicionamiento');
  });

  it('Campaña Franquicias en Diseño → P1 Estratégico', async () => {
    const { svc, areas } = await setup();
    const p = svc.projects.create({ nombre: 'Campaña Franquicias 2026', areaId: areas['Diseño'], impacto: 3, urgencia: 1, dependencia: 1 });
    expect(p.clasif).toMatchObject({ estrategica: 'P1', operativa: 'P3', integrada: 'P1E' });
    expect(p.clasif!.motivoOperativa).toBe('Urgencia 1 + dependencia 1 + sin fecha compromiso (+0) = 2.');
    expect(p.clasif!.avisos).toContain('Sin fecha compromiso: requiere validación.');
  });

  it('Precalificador en Marketing Digital → P1 Crítico (también «Precalificador hipotecario»)', async () => {
    const { svc, areas } = await setup();
    const p = svc.projects.create({ nombre: 'Precalificador hipotecario', areaId: areas['Marketing Digital'], impacto: 2, urgencia: 2, dependencia: 1 });
    expect(p.clasif?.integrada).toBe('P1C');
    // En Contenido el Precalificador no está en la matriz: se pondera por criterios.
    const c = svc.projects.create({ nombre: 'Precalificador · video tutorial', areaId: areas['Contenido'], impacto: 2, urgencia: 2, dependencia: 1 });
    expect(c.clasif).toMatchObject({ estrategica: 'P2', operativa: 'P3', integrada: 'P2' });
  });

  it('Convención en SOC Store → P1 Urgente (no estratégica en esa gerencia)', async () => {
    const { svc, areas } = await setup();
    const p = svc.projects.create({ nombre: 'CONVENCIÓN SOC 2026 · merch', areaId: areas['SOC Store'], impacto: 2, urgencia: 1, dependencia: 1 });
    expect(p.clasif).toMatchObject({ estrategica: 'P2', operativa: 'P1', integrada: 'P1U', fuenteOperativa: 'matriz' });
  });

  it('proyecto fuera de la matriz: máximo P2 automático; Negocio queda como candidato a P1', async () => {
    const { svc, areas } = await setup();
    const negocio = svc.projects.create({ nombre: 'Boletín para oficinas', areaId: areas['Contenido'], impacto: 3, urgencia: 1, dependencia: 1 });
    expect(negocio.clasif).toMatchObject({ estrategica: 'P2', candidatoP1: true, integrada: 'P2' });
    expect(negocio.clasif!.avisos).toContain('Candidato a P1 estratégico: requiere validación directiva.');
    const op = svc.projects.create({ nombre: 'Archivo de fotos', areaId: areas['Contenido'], impacto: 1, urgencia: 1, dependencia: 1 });
    expect(op.clasif).toMatchObject({ estrategica: 'P3', operativa: 'P3', integrada: 'P3' });
    // Lo operativo urgente sí puede ser P1 por criterios: urgencia 3 + dependencia 3 + fecha en 2 días (+2) = 8
    const urgente = svc.projects.create({ nombre: 'Cambio de banner', areaId: areas['Contenido'], impacto: 1, urgencia: 3, dependencia: 3, fechaObjetivo: '2026-10-07' });
    expect(urgente.clasif).toMatchObject({ operativa: 'P1', integrada: 'P1U', scoreOperativo: 8 });
  });
});

describe('reconocimiento de nombres', () => {
  const m = (nombre: string, extra: { frente?: string; solicitante?: string } = {}) => matchInitiatives({ nombre, ...extra }, DEFAULT_MATRIX);

  it('normaliza acentos, mayúsculas, años y signos sin perder «+»', () => {
    expect(normName('  CONVENCIÓN  SOC 2026! ')).toBe('convencion soc');
    expect(normName('SOC Leads+')).toBe('soc leads+');
    expect(normName('¿Qué es SOC?')).toBe('que es soc');
  });

  it('reconoce variantes y no confunde iniciativas distintas', () => {
    expect(m('Convención').firmes.map((x) => x.key)).toEqual(['convencion']);
    expect(m('Convención SOC 2026 - registro').firmes.map((x) => x.key)).toEqual(['convencion']);
    expect(m('SOC Leads+ · landing').firmes.map((x) => x.key)).toEqual(['soc-leads']);
    expect(m('Video ¿Qué es SOC?').firmes.map((x) => x.key)).toEqual(['que-es-soc']);
    expect(m('SOC Store · catálogo').firmes).toEqual([]); // «SOC» solo no es SOC TV ni SOC Leads
    expect(m('Aulas de capacitación').firmes.map((x) => x.key)).toEqual(['aula']);
    expect(m('Paula diseño').firmes).toEqual([]); // no coincide dentro de otra palabra
    expect(m('Pieza', { frente: 'SOC TV' }).firmes).toEqual([{ key: 'soc-tv', via: 'frente', texto: 'SOC TV' }]);
  });

  it('Brokers: por solicitante es firme; mencionado en el nombre queda por validar', async () => {
    expect(m('Propuesta para brokers').porValidar.map((x) => x.key)).toEqual(['brokers']);
    expect(m('Propuesta', { solicitante: 'Brokers' }).firmes.map((x) => x.key)).toEqual(['brokers']);

    const { svc, areas } = await setup();
    const dudoso = svc.projects.create({ nombre: 'Día del Broker', areaId: areas['Diseño'], impacto: 2, urgencia: 1, dependencia: 1 });
    expect(dudoso.clasif).toMatchObject({ operativa: 'P3', porValidar: ['brokers'] });
    expect(dudoso.clasif!.avisos.join(' ')).toContain('Vínculo por validar con: Brokers');
    const firme = svc.projects.create({ nombre: 'Kit de presentación', areaId: areas['Diseño'], solicitante: 'Brokers', impacto: 2, urgencia: 1, dependencia: 1 });
    expect(firme.clasif).toMatchObject({ operativa: 'P1', integrada: 'P1U' });
    // Dirección valida el vínculo ambiguo → entra a la matriz; o lo descarta
    expect(svc.priority.setVinculo(dudoso.id, 'brokers', 'validado').clasif).toMatchObject({ operativa: 'P1', porValidar: [] });
    expect(svc.priority.setVinculo(dudoso.id, 'brokers', 'descartado').clasif).toMatchObject({ operativa: 'P3', porValidar: [] });
  });

  it('no fusiona proyectos: dos proyectos de la misma iniciativa conservan nombre e ID', async () => {
    const { svc, areas, store } = await setup();
    const a = svc.projects.create({ nombre: 'Convención · registro', areaId: areas['Contenido'], impacto: 2, urgencia: 1, dependencia: 1 });
    const b = svc.projects.create({ nombre: 'Convención SOC · video', areaId: areas['Contenido'], impacto: 2, urgencia: 1, dependencia: 1 });
    expect(a.id).not.toBe(b.id);
    expect(store.getState().projects.map((p) => p.nombre)).toEqual(['Convención · registro', 'Convención SOC · video']);
    expect([a.clasif?.integrada, b.clasif?.integrada]).toEqual(['P1U', 'P1U']);
  });
});

describe('validación directiva, bitácora y acuerdo', () => {
  it('Dirección prevalece; queda valor anterior, nuevo, motivo, fecha y responsable', async () => {
    const { svc, areas, store } = await setup();
    const p = svc.projects.create({ nombre: 'Boletín para oficinas', areaId: areas['Contenido'], impacto: 3, urgencia: 1, dependencia: 1 });
    const up = svc.priority.setDirective(p.id, 'estrategica', 'P1', 'Compromiso con Dirección General');
    expect(up.clasif).toMatchObject({ estrategica: 'P1', estrategicaCalc: 'P2', fuenteEstrategica: 'direccion', integrada: 'P1E', integradaCalc: 'P2' });
    expect(up).toMatchObject({ prioridadCalculada: 'P2', prioridadFinal: 'P1', ajusteDireccion: true });
    const [log] = store.getState().priorityLog;
    expect(log).toMatchObject({ projectId: p.id, tipo: 'prioridad', eje: 'estrategica', anterior: 'P2', nuevo: 'P1', motivo: 'Compromiso con Dirección General', fuente: 'pantalla' });
    expect(log.responsable).toBe(svc.ctx.userId());
    expect(log.createdAt).toMatch(/^2026-10-05T/);
    // La matriz no se degrada sola: SOC TV sigue P1 Crítico aunque baje su ponderación
    const tv = svc.projects.create({ nombre: 'SOC TV', areaId: areas['Contenido'], impacto: 3, urgencia: 3, dependencia: 3 });
    expect(svc.projects.update(tv.id, { impacto: 1, urgencia: 1, dependencia: 1 }).clasif?.integrada).toBe('P1C');
  });

  it('sólo Dirección valida prioridades y el motivo es obligatorio', async () => {
    const { svc, areas, ana } = await setup();
    const p = svc.projects.create({ nombre: 'Boletín', areaId: areas['Diseño'], impacto: 2, urgencia: 1, dependencia: 1 });
    expect(() => svc.priority.setDirective(p.id, 'operativa', 'P1', '  ')).toThrow(ValidationError);
    svc.settings.setCurrentUser(ana.id); // gerente
    expect(() => svc.priority.setDirective(p.id, 'operativa', 'P1', 'Lo pido yo')).toThrow(/Sólo Dirección/);
    expect(() => svc.priority.setLock([p.id], true)).toThrow(/Sólo Dirección/);
  });

  it('acuerdo cerrado: la gerencia actualiza avance pero no la ponderación; Dirección sí', async () => {
    const { svc, areas, ana, director } = await setupWithDirector();
    const p = svc.projects.create({ nombre: 'Campaña Franquicias', areaId: areas['Diseño'], impacto: 3, urgencia: 2, dependencia: 1 });
    expect(svc.priority.setLock([p.id], true)).toBe(1);
    svc.settings.setCurrentUser(ana.id);
    expect(() => svc.projects.update(p.id, { urgencia: 3 })).toThrow(/acuerdo de prioridad/);
    expect(() => svc.projects.update(p.id, { solicitante: 'Brokers' })).toThrow(/acuerdo de prioridad/);
    expect(svc.projects.update(p.id, { estado: 'en_riesgo', urgencia: 2, solicitante: '' }).estado).toBe('en_riesgo'); // sin cambios de ponderación
    svc.settings.setCurrentUser(director);
    expect(svc.projects.update(p.id, { urgencia: 3 }).urgencia).toBe(3);
    svc.priority.setLock([p.id], false);
    expect(svc.priority.logs(p.id).map((l) => [l.tipo, l.nuevo])).toEqual([
      ['acuerdo', 'Abierto'],
      ['acuerdo', 'Cerrado'],
    ]);
  });

  it('los ajustes del modelo anterior quedan como nota por revalidar (no se aplican)', async () => {
    const { svc, areas, store } = await setup();
    const p = svc.projects.create({ nombre: 'Landing antigua', areaId: areas['Diseño'], impacto: 1, urgencia: 1, dependencia: 1, descripcion: 'Algo\n\nFrente: Coberturas' });
    // Simula datos del modelo anterior
    svc.ctx.repos.projects.update(p.id, { prioridadFinal: 'P1', ajusteDireccion: true, motivoAjuste: 'Pedido de Dirección', clasif: undefined });
    svc.ctx.repos.settings.update('settings', { priorityModel: 1 });
    expect(svc.priority.migrateLegacy()).toBe(true);
    const after = store.getState().projects.find((x) => x.id === p.id)!;
    expect(after.notaRevalidar).toBe('ajuste del modelo anterior a P1 (Pedido de Dirección)');
    expect(after).toMatchObject({ frente: 'Coberturas', prioridadFinal: 'P3', ajusteDireccion: false });
    expect(after.clasif?.avisos.join(' ')).toContain('Por revalidar');
    expect(svc.priority.migrateLegacy()).toBe(false); // una sola vez
  });
});

describe('orden de atención', () => {
  it('Crítico → Urgente → Estratégico → P2 → P3, con desempate por fecha', async () => {
    const { svc, areas, store } = await setup();
    const p3 = svc.projects.create({ nombre: 'Archivo', areaId: areas['Contenido'], impacto: 1, urgencia: 1, dependencia: 1 });
    const est = svc.projects.create({ nombre: 'Campaña Franquicias', areaId: areas['Contenido'], impacto: 3, urgencia: 1, dependencia: 1 });
    const urgLejos = svc.projects.create({ nombre: 'Convención · registro', areaId: areas['Contenido'], impacto: 2, urgencia: 1, dependencia: 1, fechaObjetivo: '2026-11-20' });
    const urgCerca = svc.projects.create({ nombre: 'Convención · invitaciones', areaId: areas['Contenido'], impacto: 2, urgencia: 1, dependencia: 1, fechaObjetivo: '2026-10-09' });
    const crit = svc.projects.create({ nombre: 'SOC TV', areaId: areas['Contenido'], impacto: 3, urgencia: 3, dependencia: 3 });
    const p2 = svc.projects.create({ nombre: 'Boletín', areaId: areas['Contenido'], impacto: 2, urgencia: 1, dependencia: 1 });
    const db = store.getState();
    const order = attentionOrder(db, db.projects.filter(isActiveProject), '2026-10-05', 7);
    const ids = [...order.entries()].sort((a, b) => a[1].posicion - b[1].posicion).map(([id]) => id);
    expect(ids).toEqual([crit.id, urgCerca.id, urgLejos.id, est.id, p2.id, p3.id]);
    expect(order.get(est.id)).toMatchObject({ nivel: 3, desatendido: false });
  });

  it('un P1 Estratégico sin avance ni compromiso en 7 días sube al nivel 2', async () => {
    const { svc, areas, store, clock } = await setup();
    const est = svc.projects.create({ nombre: 'Campaña Franquicias', areaId: areas['Diseño'], impacto: 3, urgencia: 1, dependencia: 1 });
    const urg = svc.projects.create({ nombre: 'Convención', areaId: areas['Diseño'], impacto: 2, urgencia: 1, dependencia: 1 });
    clock.now = new Date(2026, 9, 14, 9, 0); // 9 días después
    const db = store.getState();
    const order = attentionOrder(db, db.projects.filter(isActiveProject), '2026-10-14', 7);
    expect(order.get(est.id)).toMatchObject({ nivel: 2, desatendido: true, clasificacion: 'P1E' });
    expect(order.get(urg.id)?.nivel).toBe(2);
    // Con un compromiso abierto reciente deja de estar desatendido
    svc.commitments.create({ projectId: est.id, accion: 'Brief de campaña', responsable: svc.ctx.userId()!, fecha: '2026-10-16', hora: '10:00' });
    const db2 = store.getState();
    expect(attentionOrder(db2, db2.projects.filter(isActiveProject), '2026-10-14', 7).get(est.id)).toMatchObject({ nivel: 3, desatendido: false });
  });
});

describe('Excel con columnas nuevas', () => {
  const header = TEMPLATE_COLUMNS.map((c) => c.header);
  type Fila = Record<string, string | number | undefined>;
  const row = (r: Fila) => header.map((h) => r[h] ?? null);
  const book = (rows: Fila[]) => writeXlsx([{ name: 'Diseño', rows: [['INVENTARIO'], [], [], header, ...rows.map(row)] }]);
  const ROWS: Fila[] = [
    { ID: 'D-01', 'Proyecto / iniciativa / pendiente': 'Campaña Franquicias', 'Tipo propuesto': 'Proyecto', Impacto: 'Negocio', Urgencia: 'Baja', Dependencia: 'Baja', 'Validación gerencia': 'Validado' },
    { ID: 'D-02', 'Proyecto / iniciativa / pendiente': 'Kit para brokers', 'Tipo propuesto': 'Proyecto', Solicitante: 'Brokers', Impacto: 'Estrategia', Urgencia: 'Baja', Dependencia: 'Baja', 'Validación gerencia': 'Validado' },
    {
      ID: 'D-03', 'Proyecto / iniciativa / pendiente': 'Señalética oficinas', 'Tipo propuesto': 'Proyecto', Impacto: 'Negocio', Urgencia: 'Media', Dependencia: 'Baja',
      'Prioridad estratégica (Dirección)': 'P1', 'Motivo prioridad estratégica': 'Expansión de oficinas', 'Validación directiva': 'Validado', 'Validación gerencia': 'Validado',
    },
  ];

  async function load(rows: Fila[] = ROWS, opts: Partial<ImportOptions> = {}) {
    const env = await setup();
    const db = env.store.getState();
    const inv = parseInventory(readXlsx(book(rows)), db, '2026-10-05');
    const o: ImportOptions = { includePending: false, defaultHora: '18:00', sheetAreas: { Diseño: env.areas['Diseño'] }, today: '2026-10-05', ...opts };
    return { ...env, inv, o, plan: buildPlan(inv, defaultChoices(inv, db), o, db) };
  }

  it('la vista previa ya muestra la clasificación; Dirección aplica sus columnas', async () => {
    const { plan, svc, store } = await load(ROWS, { esDireccion: true });
    const byRef = (r: string) => plan.projects.find((p) => p.ref === r)!;
    expect(byRef('D-01').clasif?.integrada).toBe('P1E');
    expect(byRef('D-02').clasif?.integrada).toBe('P1U');
    expect(byRef('D-03').directiva).toEqual({ estrategica: 'P1', motivoEstrategica: 'Expansión de oficinas' });
    expect(byRef('D-03').cerrarAcuerdo).toBe(true);
    svc.imports.apply(plan, 'area');
    const d3 = store.getState().projects.find((p) => p.ref === 'D-03')!;
    expect(d3.clasif).toMatchObject({ estrategica: 'P1', fuenteEstrategica: 'direccion' });
    expect(d3.acuerdo?.bloqueado).toBe(true);
    expect(store.getState().priorityLog.filter((l) => l.projectId === d3.id).map((l) => l.fuente)).toEqual(['excel', 'excel']);
  });

  it('si una gerencia llena las columnas de Dirección, se ignoran con aviso', async () => {
    const { plan } = await load(ROWS, { esDireccion: false });
    const d3 = plan.projects.find((p) => p.ref === 'D-03')!;
    expect(d3.directiva).toBeUndefined();
    expect(d3.cerrarAcuerdo).toBeFalsy();
    expect(d3.clasif?.integrada).toBe('P2');
    expect(plan.issues['Diseño#7'].map((i) => i.msg).join(' ')).toMatch(/Dirección/);
  });

  it('reimportar no duplica; «Actualizar prioridades» sólo cambia la ponderación sin tocar IDs ni historial', async () => {
    const { plan, svc, store, inv, o } = await load();
    svc.imports.apply(plan);
    const before = store.getState().projects.map((p) => [p.id, p.ref, p.nombre]);
    const week = getActiveWeek(store.getState())!;
    const histBefore = JSON.stringify(store.getState().weeklyUpdates.filter((u) => u.weekId !== week.id));

    const changed = ROWS.map((r) => (r.ID === 'D-01' ? { ...r, Urgencia: 'Alta', Dependencia: 'Alta', 'Fecha compromiso entrega': '2026-10-07' } : r));
    const db = store.getState();
    const inv2 = parseInventory(readXlsx(book(changed)), db, '2026-10-05');
    const omit = buildPlan(inv2, defaultChoices(inv2, db), o, db);
    expect(omit.stats.proyectos).toBe(0);
    expect(omit.updates).toHaveLength(0);
    const upd = buildPlan(inv2, defaultChoices(inv2, db), { ...o, updateExisting: true }, db);
    expect(upd.stats.proyectos).toBe(0);
    expect(upd.updates.map((u) => u.patch)).toEqual([{ urgencia: 3, dependencia: 3 }]);
    svc.imports.apply(upd);
    const after = store.getState();
    expect(after.projects.map((p) => [p.id, p.ref, p.nombre])).toEqual(before);
    expect(after.projects.find((p) => p.ref === 'D-01')!.clasif?.integrada).toBe('P1E'); // urgencia 3 + dependencia 3 = 6 → P2 operativa (sin fecha en el proyecto)
    expect(JSON.stringify(after.weeklyUpdates.filter((u) => u.weekId !== week.id))).toBe(histBefore);
    void inv;
  });

  it('el CSV agrega las columnas nuevas al final sin cambiar las anteriores', async () => {
    const { svc, areas, store } = await setup();
    svc.projects.create({ nombre: 'SOC TV', areaId: areas['Contenido'], impacto: 3, urgencia: 3, dependencia: 3, solicitante: 'Dirección General' });
    const [head, line] = projectsCsv(store.getState(), new Date(2026, 9, 5)).replace('﻿', '').split('\r\n');
    const cols = head.split(',');
    expect(cols.slice(0, 3)).toEqual(['Proyecto', 'Descripción', 'Área']);
    expect(cols.slice(18, 22)).toEqual(['ID', 'Solicitante', 'Frente', 'Prioridad estratégica']);
    expect(line).toContain('P1 Crítico');
    expect(getWeekData(store.getState(), undefined, new Date(2026, 9, 5))?.projects).toHaveLength(1);
  });
});

/** Igual que setup, devolviendo el id de Dirección para volver a su perfil. */
async function setupWithDirector() {
  const env = await setup();
  return { ...env, director: env.svc.ctx.userId()! };
}
