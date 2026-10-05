import { describe, expect, it } from 'vitest';
import { computeAlerts } from '../../src/domain/alerts';
import { computeKpis } from '../../src/domain/metrics';
import {
  blockIsManaged,
  commitmentDisplayStatus,
  getActiveWeek,
  getWeekData,
} from '../../src/domain/selectors';
import { closingIssues, detectQueue, reviewCommitments } from '../../src/domain/weekly';
import { ValidationError } from '../../src/domain/validation';
import { parseBackup } from '../../src/services/backupService';
import { commitmentsCsv, projectsCsv } from '../../src/services/exportService';
import { setup } from './helpers';

describe('proyectos', () => {
  it('crea un proyecto con score y prioridad calculados', async () => {
    const { svc, areas, ana } = await setup();
    const p = svc.projects.create({ nombre: 'Campaña Convención', areaId: areas['Marketing Digital'], responsable: ana.id, impacto: 3, urgencia: 3, dependencia: 3 });
    expect(p.score).toBe(9);
    expect(p.prioridadFinal).toBe('P1');
    expect(p.eisenhower).toBe('hacer');
    expect(p.estado).toBe('en_curso');
    // registra la fotografía semanal
    const wu = svc.ctx.repos.weeklyUpdates.list().filter((u) => u.projectId === p.id);
    expect(wu).toHaveLength(1);
  });

  it('no permite proyectos sin nombre ni valores fuera de rango', async () => {
    const { svc, areas } = await setup();
    expect(() => svc.projects.create({ nombre: '  ', areaId: areas['Diseño'], impacto: 1, urgencia: 1, dependencia: 1 })).toThrow(ValidationError);
    // @ts-expect-error valor inválido a propósito
    expect(() => svc.projects.create({ nombre: 'X', areaId: areas['Diseño'], impacto: 5, urgencia: 1, dependencia: 1 })).toThrow(ValidationError);
    expect(() => svc.projects.create({ nombre: 'X', areaId: areas['Diseño'], impacto: 1, urgencia: 1, dependencia: 1, fechaObjetivo: '2026-13-01' })).toThrow(ValidationError);
  });

  it('edita y recalcula; el override de Dirección se conserva', async () => {
    const { svc, areas } = await setup();
    const p = svc.projects.create({ nombre: 'Landing', areaId: areas['Marketing Digital'], impacto: 3, urgencia: 2, dependencia: 1 });
    expect(p.prioridadFinal).toBe('P2');
    const up = svc.projects.update(p.id, { urgencia: 3, dependencia: 2 });
    expect(up.score).toBe(8);
    expect(up.prioridadFinal).toBe('P1');
    const ov = svc.projects.setOverride(p.id, 'P2', 'Arranca después');
    expect(ov).toMatchObject({ prioridadCalculada: 'P1', prioridadFinal: 'P2', ajusteDireccion: true, motivoAjuste: 'Arranca después' });
    const again = svc.projects.update(p.id, { impacto: 2 }); // score 7 → P2 calculada = override
    expect(again).toMatchObject({ prioridadCalculada: 'P2', prioridadFinal: 'P2', ajusteDireccion: false });
    const back = svc.projects.setOverride(p.id, null);
    expect(back.ajusteDireccion).toBe(false);
  });

  it('cambia el cuadrante Eisenhower', async () => {
    const { svc, areas } = await setup();
    const p = svc.projects.create({ nombre: 'Boletín', areaId: areas['Contenido'], impacto: 1, urgencia: 3, dependencia: 1 });
    expect(p.eisenhower).toBe('delegar');
    expect(svc.projects.setQuadrant(p.id, 'eliminar').eisenhower).toBe('eliminar');
  });
});

describe('bloqueos y compromisos', () => {
  it('un bloqueo sólo queda gestionado con acción + responsable + fecha + hora', async () => {
    const { svc, areas, ana } = await setup();
    const p = svc.projects.create({ nombre: 'KV Convención', areaId: areas['Diseño'], impacto: 3, urgencia: 3, dependencia: 3 });
    const b = svc.blocks.create({ projectId: p.id, descripcion: 'Falta agenda de Comercial', necesidad: 'Agenda final', areaDependencia: 'ext:Comercial' });
    expect(svc.projects.get(p.id).bloqueado).toBe(true);
    expect(svc.projects.get(p.id).dependeDe).toBe('ext:Comercial');
    expect(() => svc.blocks.move(b.id, 'en_gestion')).toThrow(/responsable, fecha y hora/);
    expect(() => svc.commitments.create({ projectId: p.id, blockId: b.id, accion: '', responsable: ana.id, fecha: '2026-10-07', hora: '11:00' })).toThrow(ValidationError);
    expect(() => svc.commitments.create({ projectId: p.id, blockId: b.id, accion: 'Pedir agenda', responsable: ana.id, fecha: '2026-10-07', hora: '25:00' })).toThrow(ValidationError);
    const c = svc.commitments.create({ projectId: p.id, blockId: b.id, accion: 'Pedir agenda', responsable: ana.id, fecha: '2026-10-07', hora: '11:00' });
    expect(svc.blocks.get(b.id).estado).toBe('en_gestion');
    expect(blockIsManaged(svc.blocks.get(b.id), svc.commitments.list())).toBe(true);
    expect(c.fechaOriginal).toBe('2026-10-07');
  });

  it('reprograma conservando fecha original y contador; exige motivo', async () => {
    const { svc, areas, ana } = await setup();
    const p = svc.projects.create({ nombre: 'Catálogo', areaId: areas['SOC Store'], impacto: 2, urgencia: 3, dependencia: 2 });
    const c = svc.commitments.create({ projectId: p.id, accion: 'Confirmar proveedor', responsable: ana.id, fecha: '2026-10-07', hora: '13:00' });
    expect(() => svc.commitments.reschedule(c.id, { fecha: '2026-10-08', hora: '13:00', motivo: '' })).toThrow(ValidationError);
    svc.commitments.reschedule(c.id, { fecha: '2026-10-08', hora: '13:00', motivo: 'Muestras' });
    const r = svc.commitments.reschedule(c.id, { fecha: '2026-10-09', hora: '10:00', motivo: 'Aduana' });
    expect(r).toMatchObject({ fecha: '2026-10-09', hora: '10:00', fechaOriginal: '2026-10-07', horaOriginal: '13:00', reprogramaciones: 2, estado: 'reprogramado', motivoReprogramacion: 'Aduana' });
    expect(r.historial.filter((e) => e.tipo === 'reprogramado')).toHaveLength(2);
  });

  it('cumplir resuelve el bloqueo si se indica; escalar escala el bloqueo', async () => {
    const { svc, areas, ana } = await setup();
    const p = svc.projects.create({ nombre: 'Leads+', areaId: areas['Marketing Digital'], impacto: 3, urgencia: 2, dependencia: 3 });
    const b = svc.blocks.create({ projectId: p.id, descripcion: 'Sin acceso a API' });
    const c = svc.commitments.create({ projectId: p.id, blockId: b.id, accion: 'Solicitar acceso', responsable: ana.id, fecha: '2026-10-06', hora: '12:00' });
    const e = svc.commitments.escalate(c.id, 'Dirección General', { comentario: 'TI no responde' });
    expect(e.estado).toBe('escalado');
    expect(svc.blocks.get(b.id)).toMatchObject({ estado: 'escalado', escaladoA: 'Dirección General' });
    const done = svc.commitments.complete(c.id, { resolveBlock: true });
    expect(done.estado).toBe('cumplido');
    expect(svc.blocks.get(b.id).estado).toBe('resuelto');
    expect(svc.projects.get(p.id).bloqueado).toBe(false);
  });

  it('marca VENCIDO cuando fecha/hora < momento actual', async () => {
    const { svc, areas, ana, clock, store } = await setup(new Date(2026, 9, 5, 9, 0));
    const p = svc.projects.create({ nombre: 'Convención', areaId: areas['Marketing Digital'], impacto: 3, urgencia: 3, dependencia: 3 });
    const c = svc.commitments.create({ projectId: p.id, accion: 'Validar presupuesto', responsable: ana.id, fecha: '2026-10-05', hora: '13:00' });
    expect(commitmentDisplayStatus(c, clock.now)).toBe('pendiente');
    const later = new Date(2026, 9, 5, 14, 0);
    expect(commitmentDisplayStatus(c, later)).toBe('vencido');
    const data = getWeekData(store.getState(), undefined, later)!;
    const alerts = computeAlerts(store.getState(), data, later);
    expect(alerts[0].kind).toBe('compromiso_vencido');
    expect(computeKpis(data, later).vencidos).toBe(1);
  });
});

describe('Weekly completa y continuidad semanal', () => {
  it('semana 1 → cierre → semana 2 sin alterar historial', async () => {
    const { svc, store, areas, ana, beto, clock } = await setup(new Date(2026, 9, 5, 8, 0));
    const w1 = getActiveWeek(store.getState())!;
    expect(w1.numero).toBe(41);

    // Las cuatro áreas actualizan
    const p1 = svc.projects.create({ nombre: 'Campaña Convención', areaId: areas['Marketing Digital'], responsable: beto.id, impacto: 3, urgencia: 3, dependencia: 3 });
    const p2 = svc.projects.create({ nombre: 'KV Convención', areaId: areas['Diseño'], responsable: ana.id, impacto: 3, urgencia: 3, dependencia: 2 });
    const p3 = svc.projects.create({ nombre: 'SOC TV', areaId: areas['Contenido'], impacto: 3, urgencia: 1, dependencia: 2 });
    const p4 = svc.projects.create({ nombre: 'Catálogo', areaId: areas['SOC Store'], impacto: 1, urgencia: 2, dependencia: 1 });
    for (const id of Object.values(areas)) svc.areas.completeUpdate(id);

    // Dirección inicia la Weekly
    clock.now = new Date(2026, 9, 5, 10, 0);
    const s = svc.sessions.start();
    expect(svc.sessions.start().id).toBe(s.id); // retoma, no duplica
    svc.projects.setQuadrant(p3.id, 'planificar', { origen: 'junta' });
    svc.projects.update(p4.id, { urgencia: 1 }, { origen: 'junta' });
    const data = getWeekData(store.getState(), w1.id, clock.now)!;
    expect(detectQueue(data, clock.now).map((p) => p.id).slice(0, 2)).toEqual([p1.id, p2.id]);

    const b = svc.blocks.create({ projectId: p1.id, descripcion: 'Comercial no confirma presupuesto', areaDependencia: 'ext:Comercial', responsableGestion: beto.id }, 'junta');
    svc.sessions.detect(s.id, p1.id, 'bloqueado');
    svc.sessions.detect(s.id, p2.id, 'decision');
    let issues = closingIssues(store.getState(), getWeekData(store.getState(), w1.id, clock.now)!, svc.sessions.get(s.id));
    expect(issues.map((i) => i.kind).sort()).toEqual(['bloqueo_sin_accion', 'tema_sin_decision']);

    const c1 = svc.commitments.create({ projectId: p1.id, blockId: b.id, accion: 'Validar presupuesto con Comercial', responsable: beto.id, fecha: '2026-10-07', hora: '13:00' }, { sessionId: s.id });
    const c2 = svc.commitments.create({ projectId: p2.id, accion: 'Entregar adaptaciones', responsable: ana.id, fecha: '2026-10-08', hora: '11:00' }, { sessionId: s.id });
    const c3 = svc.commitments.create({ projectId: p3.id, accion: 'Calendario de grabación', responsable: ana.id, fecha: '2026-10-09', hora: '17:00' }, { sessionId: s.id });
    svc.sessions.addDecision(s.id, { projectId: p2.id, descripcion: 'Se usa la versión B del KV', responsable: ana.id });
    issues = closingIssues(store.getState(), getWeekData(store.getState(), w1.id, clock.now)!, svc.sessions.get(s.id));
    expect(issues).toEqual([]);

    const summary = svc.sessions.summary()!;
    expect(summary.markdown).toContain('SEMANA 41');
    expect(summary.markdown).toContain('Validar presupuesto con Comercial');
    expect(summary.commitmentsOnly).toContain('Entregar adaptaciones');

    const { snapshot } = svc.sessions.close(s.id);
    expect(store.get('weeks', w1.id)!.estado).toBe('cerrada');
    expect(snapshot.kpis).toMatchObject({ p1: 2, bloqueados: 1, compromisosAbiertos: 3 });
    expect(() => svc.sessions.start()).toThrow(/cerrada/);
    const backup = svc.backup.exportBackup('test');
    const historyBefore = JSON.stringify(getWeekData(store.getState(), w1.id, clock.now));

    // SEMANA 2
    clock.now = new Date(2026, 9, 12, 8, 0);
    const w2 = svc.weeks.openNextWeek();
    expect(w2.numero).toBe(42);
    expect(getActiveWeek(store.getState())!.id).toBe(w2.id);
    const s2 = svc.sessions.start();
    const toReview = reviewCommitments(store.getState(), w2.id, s2);
    expect(toReview.map((c) => c.id)).toEqual([c1.id, c2.id, c3.id]);
    svc.commitments.complete(c1.id, { sessionId: s2.id, resolveBlock: true });
    svc.commitments.reschedule(c2.id, { fecha: '2026-10-14', hora: '11:00', motivo: 'Cambio de agenda' }, { sessionId: s2.id });
    svc.commitments.escalate(c3.id, 'Dirección General', { sessionId: s2.id });
    expect(reviewCommitments(store.getState(), w2.id, svc.sessions.get(s2.id))).toHaveLength(3); // siguen visibles en la sesión
    svc.projects.update(p2.id, { urgencia: 2 }, { origen: 'junta' });
    const p5 = svc.projects.create({ nombre: 'Buen Fin', areaId: areas['SOC Store'], impacto: 2, urgencia: 3, dependencia: 1 });
    svc.projects.close(p4.id);

    // Semana 1 NO cambió
    expect(JSON.stringify(getWeekData(store.getState(), w1.id, clock.now))).toBe(historyBefore);
    const w1Data = getWeekData(store.getState(), w1.id, clock.now)!;
    expect(w1Data.commitments.find((c) => c.id === c1.id)!.estado).toBe('pendiente');
    expect(w1Data.projects.find((p) => p.id === p2.id)!.score).toBe(8);
    expect(w1Data.projects.some((p) => p.id === p5.id)).toBe(false);

    // Evolución del proyecto sin duplicarlo
    expect(store.getState().projects.filter((p) => p.nombre === 'KV Convención')).toHaveLength(1);
    const evo = store.getState().weeklyUpdates.filter((u) => u.projectId === p2.id).map((u) => [u.weekId, u.prioridad]);
    expect(evo).toEqual([[w1.id, 'P1'], [w2.id, 'P2']]);

    svc.sessions.addDecision(s2.id, { descripcion: 'Buen Fin entra como P2' });
    svc.sessions.close(s2.id);
    const w2Data = getWeekData(store.getState(), w2.id, clock.now)!;
    expect(w2Data.readOnly).toBe(true);
    expect(w2Data.projects.find((p) => p.id === p4.id)!.estado).toBe('completado');
    expect(w2Data.snapshot!.kpis.cumplidos).toBe(1);

    // Exportar → restaurar
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) await svc.backup.restore(parsed.file);
    expect(getActiveWeek(store.getState())!.id).toBe(w1.id);
    expect(store.getState().projects).toHaveLength(4);
  });

  it('regla 8: un nuevo P1 desplaza a otro y queda la decisión', async () => {
    const { svc, store, areas } = await setup();
    const a = svc.projects.create({ nombre: 'A', areaId: areas['Diseño'], impacto: 3, urgencia: 3, dependencia: 3 });
    const b = svc.projects.create({ nombre: 'B', areaId: areas['Diseño'], impacto: 2, urgencia: 2, dependencia: 2 });
    const s = svc.sessions.start();
    svc.projects.setOverride(b.id, 'P1', 'Urgencia comercial');
    svc.sessions.displace(s.id, b.id, a.id);
    expect(svc.projects.get(a.id)).toMatchObject({ prioridadFinal: 'P2', ajusteDireccion: true });
    expect(store.getState().decisions[0].descripcion).toContain('desplaza');
    expect(svc.sessions.get(s.id).desplazamientos).toHaveLength(1);
  });
});

describe('importar / exportar', () => {
  it('rechaza archivos inválidos sin tocar la información', async () => {
    const { svc, store, areas } = await setup();
    svc.projects.create({ nombre: 'Seguro', areaId: areas['Diseño'], impacto: 1, urgencia: 1, dependencia: 1 });
    const before = JSON.stringify(store.getState());
    expect(parseBackup('{no json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'otra', data: {} })).ok).toBe(false);
    const bad = svc.backup.exportBackup();
    bad.data.projects[0].impacto = 7 as never;
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/fuera de rango/);
    const orphan = svc.backup.exportBackup();
    orphan.data.projects[0].areaId = 'nope';
    expect(parseBackup(JSON.stringify(orphan)).ok).toBe(false);
    expect(JSON.stringify(store.getState())).toBe(before);
  });

  it('combina registros con IMPORTAR JSON', async () => {
    const a = await setup();
    const b = await setup();
    a.svc.projects.create({ nombre: 'Desde A', areaId: a.areas['Diseño'], impacto: 1, urgencia: 1, dependencia: 1 });
    const file = a.svc.backup.exportBackup();
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) b.svc.backup.importMerge(parsed.file);
    expect(b.store.getState().projects.map((p) => p.nombre)).toContain('Desde A');
  });

  it('exporta CSV con encabezados y escapes', async () => {
    const { svc, store, areas, ana } = await setup();
    const p = svc.projects.create({ nombre: 'Campaña "Q4", fase 1', areaId: areas['Diseño'], impacto: 3, urgencia: 3, dependencia: 3 });
    svc.commitments.create({ projectId: p.id, accion: 'Revisar', responsable: ana.id, fecha: '2026-10-07', hora: '11:00' });
    const csv = projectsCsv(store.getState());
    expect(csv.startsWith('﻿Proyecto,')).toBe(true);
    expect(csv).toContain('"Campaña ""Q4"", fase 1"');
    expect(commitmentsCsv(store.getState(), new Date(2026, 9, 5)).split('\r\n')[1]).toContain('Ana Gerente');
  });
});

describe('métricas de cumplimiento', async () => {
  const { complianceRate } = await import('../../src/domain/metrics');
  it('sólo evalúa compromisos cumplidos, incumplidos o vencidos en la ventana', async () => {
    const { svc, store, areas, ana, clock } = await setup(new Date(2026, 9, 5, 9, 0));
    const p = svc.projects.create({ nombre: 'X', areaId: areas['Diseño'], impacto: 2, urgencia: 2, dependencia: 2 });
    const mk = (fecha: string, hora: string) => svc.commitments.create({ projectId: p.id, accion: `A ${fecha}`, responsable: ana.id, fecha, hora });
    const a = mk('2026-10-05', '10:00');
    const b = mk('2026-10-05', '11:00');
    mk('2026-10-05', '12:00'); // vencerá
    mk('2026-10-09', '12:00'); // futuro: no cuenta
    clock.now = new Date(2026, 9, 5, 13, 0);
    svc.commitments.complete(a.id);
    svc.commitments.fail(b.id);
    const r = complianceRate(store.getState().commitments, clock.now, new Date(2026, 9, 1), clock.now);
    expect(r).toMatchObject({ cumplidos: 1, incumplidos: 1, vencidos: 1, evaluables: 3, rate: 33 });
  });
});
