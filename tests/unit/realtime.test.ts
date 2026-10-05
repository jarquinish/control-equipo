import { describe, expect, it } from 'vitest';
import { toChangeOp } from '../../src/data/adapters/supabaseAdapter';
import { MemoryAdapter } from '../../src/data/adapters/memoryAdapter';
import type { ChangeOp, StorageAdapter } from '../../src/data/adapters/StorageAdapter';
import { DataStore } from '../../src/data/store';
import { createServices } from '../../src/services';
import { ensureIdentity } from '../../src/services/identityService';

describe('tiempo real (Supabase)', () => {
  it('traduce eventos e ignora el eco de la propia pestaña', () => {
    const item = { id: 'p1', nombre: 'X' };
    expect(toChangeOp({ eventType: 'INSERT', new: { collection: 'projects', id: 'p1', data: item, client_id: 'otra' }, old: {} }, 'yo')).toEqual({ type: 'update', collection: 'projects', item });
    expect(toChangeOp({ eventType: 'UPDATE', new: { collection: 'projects', id: 'p1', data: item, client_id: 'yo' }, old: {} }, 'yo')).toBeNull();
    expect(toChangeOp({ eventType: 'DELETE', new: {}, old: { collection: 'blocks', id: 'b1' } }, 'yo')).toEqual({ type: 'delete', collection: 'blocks', id: 'b1' });
    expect(toChangeOp({ eventType: 'INSERT', new: { collection: 'hack' as never, id: 'x', data: { id: 'x' } }, old: {} }, 'yo')).toBeNull();
  });

  it('aplica cambios de otros usuarios sin volver a guardarlos', async () => {
    let push: ((op: ChangeOp) => void) | undefined;
    const base = new MemoryAdapter();
    const applied: ChangeOp[][] = [];
    const adapter: StorageAdapter = {
      kind: 'fake',
      load: () => base.load(),
      apply: async (ops) => void applied.push(ops),
      replaceAll: (d) => base.replaceAll(d),
      clear: () => base.clear(),
      subscribe: (fn) => {
        push = fn;
        return () => (push = undefined);
      },
    };
    const store = new DataStore(adapter);
    await store.init();
    let renders = 0;
    store.subscribe(() => renders++);
    push!({ type: 'update', collection: 'decisions', item: { id: 'd1', descripcion: 'Remota' } as never });
    expect(store.getState().decisions).toHaveLength(1);
    push!({ type: 'update', collection: 'decisions', item: { id: 'd1', descripcion: 'Editada' } as never });
    expect(store.getState().decisions[0].descripcion).toBe('Editada');
    push!({ type: 'delete', collection: 'decisions', id: 'd1' });
    expect(store.getState().decisions).toHaveLength(0);
    await store.flush();
    expect(applied).toHaveLength(0);
    expect(renders).toBe(3);
    store.dispose();
    expect(push).toBeUndefined();
  });

  it('vincula la sesión con su persona y respeta el rol de Accesos', async () => {
    const store = new DataStore(new MemoryAdapter());
    await store.init();
    const svc = createServices(store);
    const ana = svc.people.create({ nombre: 'Ana Solís', rol: 'COLABORADOR', email: 'ana@soc.mx' });
    expect(ensureIdentity(svc, { email: 'ANA@soc.mx', rol: 'GERENTE' })).toBe(ana.id);
    expect(store.get('people', ana.id)!.rol).toBe('GERENTE');
    const nuevo = ensureIdentity(svc, { email: 'luis.perez@soc.mx', rol: 'COLABORADOR' });
    expect(store.get('people', nuevo)!.nombre).toBe('Luis Perez');
    expect(ensureIdentity(svc, { email: 'otro@soc.mx', rol: 'DIRECTOR', personId: ana.id })).toBe(ana.id);
  });
});
