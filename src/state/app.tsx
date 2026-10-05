import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DataStore } from '../data/store';
import { getActiveWeek, getSettings, getWeekData, liveSelection, type WeekData } from '../domain/selectors';
import type { DbData, Person, Settings } from '../domain/types';
import { bootstrapEmpty, createServices, type Services } from '../services';
import { buildDemoData } from '../services/demoService';
import { createAdapter, getWorkspace, saveWorkspace, type Workspace } from './workspace';

interface AppContextValue {
  store: DataStore;
  services: Services;
  workspace: Workspace;
  storageKind: string;
  now: Date;
  viewWeekId: string | undefined;
  setViewWeekId: (id: string | undefined) => void;
  switchWorkspace: (ws: Workspace) => Promise<void>;
  resetDemo: () => Promise<void>;
  saveError: string | null;
}

const AppContext = createContext<AppContextValue | null>(null);

async function openStore(ws: Workspace): Promise<{ store: DataStore; services: Services }> {
  const store = new DataStore(createAdapter(ws));
  const hadData = await store.init();
  const services = createServices(store);
  if (!hadData) {
    if (ws === 'demo') await store.replaceAll(buildDemoData(new Date()));
    else bootstrapEmpty(services);
  } else {
    services.weeks.ensureCurrentWeek();
  }
  await store.flush();
  return { store, services };
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [state, setState] = useState<{ store: DataStore; services: Services; workspace: Workspace } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [viewWeekId, setViewWeekId] = useState<string | undefined>();

  const load = useCallback(async (ws: Workspace) => {
    try {
      const opened = await openStore(ws);
      opened.store.onError(() => setSaveError('No se pudo guardar el último cambio en este navegador. Genera un respaldo y recarga la página.'));
      setState({ ...opened, workspace: ws });
      setViewWeekId(undefined);
    } catch (err) {
      console.error('[Alignment & Unblock] Error al abrir el almacenamiento', err);
      setLoadError('No fue posible abrir la información guardada en este navegador. Revisa que no estés en modo privado o que el almacenamiento no esté bloqueado.');
    }
  }, []);

  useEffect(() => {
    void load(getWorkspace());
  }, [load]);

  // Reloj de la aplicación: actualiza vencimientos automáticamente.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const switchWorkspace = useCallback(
    async (ws: Workspace) => {
      await state?.store.flush();
      saveWorkspace(ws);
      setState(null);
      await load(ws);
    },
    [state, load],
  );

  const resetDemo = useCallback(async () => {
    if (!state) return;
    await state.store.flush();
    saveWorkspace('demo');
    if (state.workspace === 'demo') {
      await state.store.replaceAll(buildDemoData(new Date()));
      setViewWeekId(undefined);
    } else {
      setState(null);
      const store = new DataStore(createAdapter('demo'));
      await store.init();
      await store.replaceAll(buildDemoData(new Date()));
      await load('demo');
    }
  }, [state, load]);

  const value = useMemo<AppContextValue | null>(
    () =>
      state && {
        ...state,
        storageKind: state.store.adapter.kind,
        now,
        viewWeekId,
        setViewWeekId,
        switchWorkspace,
        resetDemo,
        saveError,
      },
    [state, now, viewWeekId, switchWorkspace, resetDemo, saveError],
  );

  if (loadError) {
    return (
      <div className="fatal" role="alert">
        <h1>Alignment &amp; Unblock</h1>
        <p>{loadError}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }
  if (!value) return <>{fallback}</>;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp fuera de AppProvider');
  return ctx;
}

export function useServices(): Services {
  return useApp().services;
}

/** Estado completo de la base (inmutable; se re-renderiza en cada cambio). */
export function useDb(): DbData {
  const { store } = useApp();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useSettings(): Settings {
  const db = useDb();
  return useMemo(() => getSettings(db), [db]);
}

export function useCurrentUser(): Person | undefined {
  const db = useDb();
  const s = useSettings();
  return db.people.find((p) => p.id === s.currentUserId);
}

/** Datos de la semana que se está viendo (viva o histórica). */
export function useWeekData(): WeekData | undefined {
  const db = useDb();
  const { viewWeekId, now } = useApp();
  return useMemo(() => getWeekData(db, viewWeekId, now), [db, viewWeekId, now]);
}

export function useActiveWeek() {
  const db = useDb();
  return useMemo(() => getActiveWeek(db), [db]);
}

/**
 * Bloqueos y compromisos "operables". En la semana activa siempre son los datos
 * vivos (aunque su Weekly ya esté cerrada: se siguen gestionando); en semanas
 * históricas son la fotografía de solo lectura.
 */
export function useOpsData() {
  const db = useDb();
  const data = useWeekData();
  const active = useActiveWeek();
  return useMemo(() => {
    if (!data) return undefined;
    const manageable = !!active && data.week.id === active.id;
    if (!manageable || data.live) return { ...data, manageable };
    const live = liveSelection(db, data.week);
    return { ...data, blocks: live.blocks, commitments: live.commitments, asOf: new Date(), manageable };
  }, [db, data, active]);
}
