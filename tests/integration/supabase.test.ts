/**
 * Integración real: SupabaseAdapter + @supabase/supabase-js contra PostgreSQL +
 * PostgREST con la migración y la RLS de supabase/migrations.
 * Ejecutar con: npm run test:supabase  (requiere PostgreSQL y POSTGREST_BIN)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
// @ts-expect-error módulo JS de la pila de pruebas
import { startStack, signJwt } from '../../supabase/tests/stack.mjs';
import { SupabaseAdapter, RemoteError } from '../../src/data/adapters/supabaseAdapter';
import { DataStore } from '../../src/data/store';
import { bootstrapEmpty, createServices } from '../../src/services';
import { buildDemoData } from '../../src/services/demoService';
import { ensureIdentity } from '../../src/services/identityService';

let stack: { url: string; anonKey: string; stop: () => void; psql: (a: string[]) => string };

function clientFor(email: string) {
  const token = signJwt({ sub: email, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return createClient(stack.url, stack.anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
}

beforeAll(async () => {
  stack = await startStack({ members: [['admin@soc.test', 'ADMIN'], ['gerente@soc.test', 'GERENTE']] });
}, 60_000);
afterAll(() => stack?.stop());

describe('SupabaseAdapter (PostgreSQL + PostgREST + RLS)', () => {
  it('Dirección inicializa el espacio y otro usuario lo lee', async () => {
    const admin = new DataStore(new SupabaseAdapter(clientFor('admin@soc.test'), 'tab-a'));
    expect(await admin.init()).toBe(false);
    const svc = createServices(admin);
    bootstrapEmpty(svc);
    admin.identity = ensureIdentity(svc, { email: 'admin@soc.test', name: 'Miguel', rol: 'ADMIN' }, true);
    const area = svc.areas.list()[0];
    const p = svc.projects.create({ nombre: 'Campaña Convención', areaId: area.id, impacto: 3, urgencia: 3, dependencia: 3 });
    await admin.flush();
    expect(stack.psql(['-tAc', "select updated_by from au_records where collection='projects'"]).trim()).toBe('admin@soc.test');

    const ger = new DataStore(new SupabaseAdapter(clientFor('gerente@soc.test'), 'tab-g'));
    expect(await ger.init()).toBe(true);
    const gsvc = createServices(ger);
    ger.identity = ensureIdentity(gsvc, { email: 'gerente@soc.test', rol: 'GERENTE' });
    expect(ger.getState().projects.map((x) => x.nombre)).toEqual(['Campaña Convención']);
    expect(ger.getState().areas).toHaveLength(4);
    expect(ger.getState().people.find((x) => x.id === admin.identity)?.nombre).toBe('Miguel');

    // El gerente registra un bloqueo con compromiso
    const b = gsvc.blocks.create({ projectId: p.id, descripcion: 'Comercial no confirma presupuesto', areaDependencia: 'ext:Comercial' });
    gsvc.commitments.create({ projectId: p.id, blockId: b.id, accion: 'Validar presupuesto', responsable: ger.identity!, fecha: '2026-10-07', hora: '13:00' });
    await ger.flush();

    await admin.reload();
    expect(admin.getState().commitments.map((c) => c.accion)).toEqual(['Validar presupuesto']);
    expect(admin.getState().projects[0].bloqueado).toBe(true);
    expect(admin.getState().blocks[0].estado).toBe('en_gestion');
  });

  it('la RLS rechaza cambios de configuración de un gerente con un error comprensible', async () => {
    const ger = new DataStore(new SupabaseAdapter(clientFor('gerente@soc.test'), 'tab-g2'));
    await ger.init();
    const errors: unknown[] = [];
    ger.onError((e) => errors.push(e));
    const gsvc = createServices(ger);
    gsvc.areas.update(ger.getState().areas[0].id, { nombre: 'Cambiada sin permiso' });
    await ger.flush();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RemoteError);
    expect((errors[0] as RemoteError).permission).toBe(true);
    await ger.reload();
    expect(ger.getState().areas.map((a) => a.nombre)).not.toContain('Cambiada sin permiso');
  });

  it('un correo sin acceso no ve nada', async () => {
    const x = new DataStore(new SupabaseAdapter(clientFor('extrano@gmail.com'), 'tab-x'));
    expect(await x.init()).toBe(false);
    expect(x.getState().projects).toHaveLength(0);
  });

  it('borra registros y restaura un respaldo completo (sólo Dirección)', async () => {
    const admin = new DataStore(new SupabaseAdapter(clientFor('admin@soc.test'), 'tab-a2'));
    await admin.init();
    const svc = createServices(admin);
    svc.commitments.remove(admin.getState().commitments[0].id);
    await admin.flush();
    expect(stack.psql(['-tAc', "select count(*) from au_records where collection='commitments'"]).trim()).toBe('0');

    const demo = buildDemoData(new Date());
    await admin.replaceAll(demo);
    const fresh = new DataStore(new SupabaseAdapter(clientFor('gerente@soc.test'), 'tab-g3'));
    await fresh.init();
    expect(fresh.getState().projects).toHaveLength(demo.projects.length);
    expect(fresh.getState().snapshots).toHaveLength(demo.snapshots.length);

    const ger = new SupabaseAdapter(clientFor('gerente@soc.test'), 'tab-g4');
    await expect(ger.replaceAll(demo)).rejects.toBeInstanceOf(RemoteError);
    await expect(ger.clear()).rejects.toBeInstanceOf(RemoteError);
  });

  it('carga en páginas más de 1000 registros', async () => {
    const admin = new SupabaseAdapter(clientFor('admin@soc.test'), 'tab-p');
    const before = (await admin.load())!.decisions!.length;
    const ops = Array.from({ length: 1205 }, (_, i) => ({ type: 'insert' as const, collection: 'decisions' as const, item: { id: `d${i}`, weekId: 'w', descripcion: 'x', createdAt: '' } }));
    await admin.apply(ops);
    const data = await admin.load();
    expect(data!.decisions!.length).toBe(before + 1205);
  });
});
