import { describe, expect, it } from 'vitest';
import { IndexedDbAdapter } from '../../src/data/adapters/indexedDbAdapter';
import { RestAdapter } from '../../src/data/adapters/restAdapter';
import { DataStore } from '../../src/data/store';
import { getActiveWeek, getWeekData, isOverdue } from '../../src/domain/selectors';
import { computeAlerts } from '../../src/domain/alerts';
import { computeKpis } from '../../src/domain/metrics';
import { bootstrapEmpty, createServices } from '../../src/services';
import { buildDemoData } from '../../src/services/demoService';
import { parseBackup } from '../../src/services/backupService';
import { EXPORT_APP_ID, SCHEMA_VERSION } from '../../src/domain/constants';

describe('persistencia IndexedDB', () => {
  it('conserva la información al "cerrar y volver a abrir"', async () => {
    const name = `test-${Math.random()}`;
    const store1 = new DataStore(new IndexedDbAdapter(name));
    expect(await store1.init()).toBe(false);
    const svc = createServices(store1);
    bootstrapEmpty(svc);
    const area = svc.areas.list()[0];
    svc.projects.create({ nombre: 'Persistente', areaId: area.id, impacto: 2, urgencia: 2, dependencia: 2 });
    await store1.flush();

    const store2 = new DataStore(new IndexedDbAdapter(name));
    expect(await store2.init()).toBe(true);
    expect(store2.getState().projects.map((p) => p.nombre)).toEqual(['Persistente']);
    expect(store2.getState().areas).toHaveLength(4);
    expect(getActiveWeek(store2.getState())).toBeTruthy();
  });
});

describe('adaptador REST', () => {
  it('traduce operaciones a endpoints', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      return new Response(init?.method === 'GET' ? '[]' : '{}', { status: 200 });
    }) as unknown as typeof fetch;
    const api = new RestAdapter({ baseUrl: 'http://x/api', fetchImpl });
    await api.apply([
      { type: 'insert', collection: 'projects', item: { id: 'p1' } },
      { type: 'update', collection: 'commitments', item: { id: 'c1' } },
      { type: 'delete', collection: 'blocks', id: 'b1' },
    ]);
    expect(calls).toEqual(['POST http://x/api/projects', 'PUT http://x/api/commitments/c1', 'DELETE http://x/api/blocks/b1']);
    expect(await api.load()).toBeNull();
  });
});

describe('datos demo', () => {
  it('genera 3 semanas coherentes con todos los casos', () => {
    const now = new Date(2026, 9, 5, 12, 30);
    const data = buildDemoData(now);
    expect(data.areas.map((a) => a.nombre)).toEqual(['Contenido', 'Diseño', 'Marketing Digital', 'SOC Store']);
    expect(data.projects.length).toBeGreaterThanOrEqual(16);
    expect(data.projects.length).toBeLessThanOrEqual(20);
    expect(data.weeks).toHaveLength(3);
    expect(data.weeks.filter((w) => w.estado === 'cerrada')).toHaveLength(2);
    expect(data.snapshots).toHaveLength(2);
    const active = getActiveWeek(data)!;
    expect(active.estado).toBe('abierta');
    expect(active.numero).toBe(41);
    const wd = getWeekData(data, active.id, now)!;
    const k = computeKpis(wd, now);
    expect(k.p1).toBeGreaterThanOrEqual(4);
    expect(k.p2).toBeGreaterThan(0);
    expect(k.p3).toBeGreaterThan(0);
    expect(k.bloqueados).toBeGreaterThanOrEqual(3);
    expect(data.commitments.some((c) => isOverdue(c, now))).toBe(true);
    expect(data.commitments.some((c) => c.reprogramaciones >= 2)).toBe(true);
    expect(data.commitments.some((c) => c.estado === 'escalado')).toBe(true);
    expect(data.blocks.some((b) => b.areaDependencia.startsWith('ext:'))).toBe(true);
    expect(data.blocks.some((b) => !b.areaDependencia.startsWith('ext:') && b.areaDependencia)).toBe(true);
    expect(data.projects.some((p) => p.ajusteDireccion)).toBe(true);
    expect(wd.areaUpdates).toHaveLength(3); // Marketing Digital pendiente
    const alerts = computeAlerts(data, wd, now);
    expect(alerts[0].kind).toBe('compromiso_vencido');
    const kinds = new Set(alerts.map((a) => a.kind));
    for (const kind of ['p1_bloqueado', 'reprogramado', 'escalado', 'bloqueo_sin_compromiso', 'area_sin_actualizar', 'p1_sin_actualizacion'])
      expect(kinds.has(kind as never)).toBe(true);
    // es un respaldo válido
    const parsed = parseBackup(JSON.stringify({ app: EXPORT_APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), data }));
    expect(parsed.ok).toBe(true);
  });

  it('funciona a cualquier hora (lunes temprano y domingo noche)', () => {
    for (const now of [new Date(2026, 9, 5, 0, 20), new Date(2026, 9, 11, 23, 50), new Date(2026, 9, 7, 16, 5)]) {
      const data = buildDemoData(now);
      expect(getActiveWeek(data)!.estado).toBe('abierta');
      const times = data.commitments.map((c) => new Date(c.createdAt).getTime());
      expect(Math.max(...times)).toBeLessThanOrEqual(now.getTime());
    }
  });
});
