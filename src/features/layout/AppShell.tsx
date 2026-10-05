import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertOctagon,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GitFork,
  Grid2x2,
  History,
  Home,
  Layers,
  Menu,
  Search,
  Settings as SettingsIcon,
  Users,
  X,
  FlaskConical,
  Eye,
  CalendarPlus,
} from 'lucide-react';
import { fmtDate, fmtShort } from '../../domain/dates';
import { sortWeeks } from '../../domain/selectors';
import { ROLE_LABELS } from '../../domain/constants';
import { useActiveWeek, useApp, useCurrentUser, useDb, useServices, useWeekData } from '../../state/app';
import { Link, navigate, useLocation } from '../../state/router';
import { useFeedback } from '../../ui/feedback';

const NAV = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/weekly', label: 'Weekly', icon: CalendarCheck2 },
  { to: '/proyectos', label: 'Proyectos', icon: Layers },
  { to: '/eisenhower', label: 'Eisenhower', icon: Grid2x2 },
  { to: '/bloqueos', label: 'Bloqueos', icon: AlertOctagon },
  { to: '/compromisos', label: 'Compromisos', icon: ClipboardList },
  { to: '/dependencias', label: 'Dependencias', icon: GitFork },
  { to: '/areas', label: 'Áreas', icon: Users },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/configuracion', label: 'Configuración', icon: SettingsIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  const { workspace, switchWorkspace, saveError } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Saltar al contenido
      </a>
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Navegación principal">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            A<span>&amp;</span>U
          </span>
          <span className="brand-text">
            <strong>Alignment &amp; Unblock</strong>
            <small>Dirección de Posicionamiento · SOC</small>
          </span>
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>
        <nav>
          <ul>
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
              return (
                <li key={to}>
                  <Link to={to} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                    <Icon size={18} aria-hidden />
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="sidebar-cycle" aria-label="Ciclo de trabajo">
          Revisar → Visibilizar → Ordenar → Priorizar → Detectar → Destrabar → Comprometer → Cerrar
        </p>
      </aside>
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} aria-hidden />}

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu size={22} />
          </button>
          <WeekNavigator />
          <GlobalSearch />
          <UserSwitcher />
        </header>
        {workspace === 'demo' && (
          <div className="banner banner-demo" role="note">
            <FlaskConical size={16} aria-hidden />
            <span>
              <strong>Modo demo.</strong> Estás explorando datos de ejemplo; tu información real no se modifica.
            </span>
            <button className="btn btn-sm btn-ghost-light" onClick={() => switchWorkspace('principal')}>
              Salir de la demo
            </button>
          </div>
        )}
        {saveError && (
          <div className="banner banner-error" role="alert">
            {saveError}
          </div>
        )}
        <ReadOnlyBanner />
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function ReadOnlyBanner() {
  const data = useWeekData();
  const active = useActiveWeek();
  const { setViewWeekId } = useApp();
  const services = useServices();
  const { confirm, toast } = useFeedback();
  if (!data) return null;

  if (data.week.id !== active?.id) {
    return (
      <div className="banner banner-history" role="note">
        <Eye size={16} aria-hidden />
        <span>
          Estás viendo la <strong>Semana {data.week.numero}</strong> ({data.week.estado === 'cerrada' ? 'cerrada · sólo lectura' : 'no activa'}).
        </span>
        <button className="btn btn-sm btn-secondary" onClick={() => setViewWeekId(undefined)}>
          Ir a la semana actual
        </button>
      </div>
    );
  }
  if (data.week.estado === 'cerrada') {
    const next = services.weeks.nextWeekPreview();
    const openNext = async () => {
      const ok = await confirm({
        title: `Abrir Semana ${next.numero}`,
        message: `La Semana ${data.week.numero} ya está cerrada y se conserva como historial. ¿Abrir la Semana ${next.numero} (${fmtShort(next.fechaInicio)} — ${fmtDate(next.fechaFin)})?`,
        confirmLabel: `Abrir Semana ${next.numero}`,
      });
      if (ok) {
        services.weeks.openNextWeek();
        setViewWeekId(undefined);
        toast(`Semana ${next.numero} abierta`);
      }
    };
    return (
      <div className="banner banner-history" role="note">
        <CalendarCheck2 size={16} aria-hidden />
        <span>
          La Weekly de la <strong>Semana {data.week.numero}</strong> está cerrada. Los compromisos se siguen gestionando; para actualizar proyectos abre la siguiente semana.
        </span>
        <button className="btn btn-sm btn-primary" onClick={openNext}>
          <CalendarPlus size={14} aria-hidden /> Abrir Semana {next.numero}
        </button>
      </div>
    );
  }
  return null;
}

function WeekNavigator() {
  const db = useDb();
  const data = useWeekData();
  const active = useActiveWeek();
  const { setViewWeekId } = useApp();
  const services = useServices();
  const { confirm, toast } = useFeedback();
  const weeks = useMemo(() => sortWeeks(db.weeks), [db.weeks]);
  if (!data) return null;
  const idx = weeks.findIndex((w) => w.id === data.week.id);
  const prev = weeks[idx - 1];
  const next = weeks[idx + 1];
  const isLast = idx === weeks.length - 1;
  const preview = services.weeks.nextWeekPreview();

  const goNext = async () => {
    if (next) return setViewWeekId(next.id === active?.id ? undefined : next.id);
    const openWeek = data.week.estado === 'abierta';
    const ok = await confirm({
      title: `Abrir Semana ${preview.numero}`,
      message: openWeek ? (
        <>
          <p>
            La <strong>Semana {data.week.numero}</strong> sigue abierta. Al abrir la Semana {preview.numero} se cerrará y se guardará su fotografía histórica.
          </p>
          <p>Lo recomendable es cerrar primero la Weekly desde el Modo Junta.</p>
        </>
      ) : (
        `Se abrirá la Semana ${preview.numero} (${fmtShort(preview.fechaInicio)} — ${fmtDate(preview.fechaFin)}).`
      ),
      confirmLabel: `Abrir Semana ${preview.numero}`,
      danger: openWeek,
    });
    if (!ok) return;
    services.weeks.openNextWeek();
    setViewWeekId(undefined);
    toast(`Semana ${preview.numero} abierta`);
  };

  return (
    <div className="week-nav" aria-label="Semana">
      <button className="btn btn-ghost btn-sm" disabled={!prev} onClick={() => prev && setViewWeekId(prev.id === active?.id ? undefined : prev.id)} aria-label="Semana anterior">
        <ChevronLeft size={18} aria-hidden />
        <span className="hide-md">Semana anterior</span>
      </button>
      <div className="week-current">
        <strong data-testid="week-label">SEMANA {data.week.numero}</strong>
        <span>
          {fmtShort(data.week.fechaInicio)} — {fmtDate(data.week.fechaFin)}
        </span>
        <span className={`week-state ${data.week.estado}`}>{data.week.id === active?.id ? (data.week.estado === 'abierta' ? 'Activa' : 'Cerrada') : 'Historial'}</span>
      </div>
      <button className="btn btn-ghost btn-sm" disabled={data.week.id === active?.id} onClick={() => setViewWeekId(undefined)}>
        Semana actual
      </button>
      <button className="btn btn-ghost btn-sm" onClick={goNext} aria-label={next ? 'Semana siguiente' : `Abrir semana ${preview.numero}`}>
        <span className="hide-md">{next || !isLast ? 'Semana siguiente' : `Abrir Semana ${preview.numero}`}</span>
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  );
}

function GlobalSearch() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nt = norm(t);
    const out: { key: string; label: string; meta: string; to: string }[] = [];
    for (const p of db.projects) if (norm(`${p.nombre} ${p.descripcion}`).includes(nt)) out.push({ key: p.id, label: p.nombre, meta: `Proyecto · ${p.prioridadFinal}`, to: `/proyectos/${p.id}` });
    for (const c of db.commitments)
      if (norm(c.accion).includes(nt)) out.push({ key: c.id, label: c.accion, meta: `Compromiso · ${db.projects.find((p) => p.id === c.projectId)?.nombre ?? ''}`, to: `/proyectos/${c.projectId}` });
    for (const b of db.blocks)
      if (norm(`${b.descripcion} ${b.necesidad}`).includes(nt)) out.push({ key: b.id, label: b.descripcion, meta: `Bloqueo · ${db.projects.find((p) => p.id === b.projectId)?.nombre ?? ''}`, to: `/proyectos/${b.projectId}` });
    for (const per of db.people) if (norm(per.nombre).includes(nt)) out.push({ key: per.id, label: per.nombre, meta: 'Responsable · ver compromisos', to: `/compromisos?vista=mis&persona=${per.id}` });
    return out.slice(0, 10);
  }, [q, db]);

  const go = (to: string) => {
    setQ('');
    ref.current?.blur();
    navigate(to);
  };

  return (
    <div className="search" role="search">
      <Search size={16} className="search-icon" aria-hidden />
      <input
        ref={ref}
        type="search"
        className="input search-input"
        placeholder="Buscar proyectos, compromisos, personas…  (Ctrl+K)"
        aria-label="Búsqueda global"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => window.setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0].to);
          if (e.key === 'Escape') setQ('');
        }}
        aria-expanded={focus && results.length > 0}
        aria-controls="search-results"
      />
      {focus && q.trim().length >= 2 && (
        <ul className="search-results" id="search-results" role="listbox">
          {results.length === 0 && <li className="search-empty">Sin resultados para «{q}»</li>}
          {results.map((r) => (
            <li key={r.key} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.to)}>
                <strong>{r.label}</strong>
                <span>{r.meta}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserSwitcher() {
  const db = useDb();
  const user = useCurrentUser();
  const services = useServices();
  const people = db.people.filter((p) => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return (
    <label className="user-switch" title="Usuario activo (preparado para autenticación futura)">
      <span className="avatar" aria-hidden>
        {(user?.nombre ?? '?')
          .split(' ')
          .map((x) => x[0])
          .slice(0, 2)
          .join('')}
      </span>
      <span className="sr-only">Usuario activo</span>
      <select className="user-select" value={user?.id ?? ''} onChange={(e) => services.settings.setCurrentUser(e.target.value || undefined)}>
        <option value="">Sin identificar</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} · {ROLE_LABELS[p.rol]}
          </option>
        ))}
      </select>
    </label>
  );
}
