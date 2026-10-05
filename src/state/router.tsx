import { useCallback, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * Router SPA mínimo (sin dependencias). Modo "history" por defecto; modo "hash"
 * (VITE_ROUTER=hash) para la versión de un solo archivo, que funciona sin
 * servidor (abierta desde el disco o embebida).
 */
const HASH = import.meta.env.VITE_ROUTER === 'hash';
const BASE = HASH ? '' : (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
const EVENT = 'au:navigate';

/** Ruta en memoria si el entorno bloquea la History API (p. ej. marcos restringidos). */
let memoryPath: string | null = null;

function snapshot() {
  if (memoryPath !== null) return memoryPath;
  if (HASH) return window.location.hash.slice(1) || '/';
  return window.location.pathname + window.location.search;
}

function currentSearch() {
  const full = snapshot();
  const i = full.indexOf('?');
  return i === -1 ? '' : full.slice(i);
}

function subscribe(fn: () => void) {
  window.addEventListener('popstate', fn);
  window.addEventListener('hashchange', fn);
  window.addEventListener(EVENT, fn);
  return () => {
    window.removeEventListener('popstate', fn);
    window.removeEventListener('hashchange', fn);
    window.removeEventListener(EVENT, fn);
  };
}

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) {
  const url = BASE + (to.startsWith('/') ? to : `/${to}`);
  if (url === snapshot()) return;
  try {
    window.history[opts.replace ? 'replaceState' : 'pushState'](null, '', HASH ? `#${url}` : url);
  } catch {
    memoryPath = url;
  }
  window.dispatchEvent(new Event(EVENT));
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
}

export function useLocation() {
  const full = useSyncExternalStore(subscribe, snapshot, () => '/');
  const [pathRaw, search = ''] = full.split('?');
  const path = (pathRaw.startsWith(BASE) ? pathRaw.slice(BASE.length) : pathRaw) || '/';
  return { path: path.replace(/\/$/, '') || '/', search: search ? `?${search}` : '' };
}

export function useQuery(): [URLSearchParams, (patch: Record<string, string | undefined>) => void] {
  const { path, search } = useLocation();
  const params = new URLSearchParams(search);
  const set = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(currentSearch());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      navigate(`${path}${qs ? `?${qs}` : ''}`, { replace: true, keepScroll: true });
    },
    [path],
  );
  return [params, set];
}

/** `match('/proyectos/:id', '/proyectos/abc')` → `{ id: 'abc' }` */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={HASH ? `#${to}` : BASE + to} onClick={handle} {...rest} />;
}
