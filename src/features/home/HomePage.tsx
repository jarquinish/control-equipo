import { useMemo } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  FlaskConical,
  ListPlus,
  PlayCircle,
  Plus,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { ALERT_LABELS, attentionItems, computeAlerts, type Alert } from '../../domain/alerts';
import { fmtDate, fmtDateTime, fmtShort } from '../../domain/dates';
import { computeKpis } from '../../domain/metrics';
import { cargaPorArea, CLASIFICACION_LABELS, CLASIFICACIONES } from '../../domain/priority';
import { areaUpdateFor, dependencyLabel, isActiveProject } from '../../domain/selectors';
import { RULES } from '../../domain/constants';
import { useApp, useCurrentUser, useDb, useServices, useSettings, useWeekData } from '../../state/app';
import { Link, navigate } from '../../state/router';
import { demoEnabled } from '../../state/workspace';
import { AreaDot, BlockedChip, Chip, ClassBadge, PriorityBadge } from '../../ui/badges';
import { EmptyState, KpiCard, Section } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { useModals } from '../modals/ModalHost';

const CARGA_CORTO = { P1C: 'Crít.', P1U: 'Urg.', P1E: 'Estr.', P2: 'P2', P3: 'P3' } as const;

const SEVERITY_ICON = {
  critical: <AlertOctagon size={15} aria-hidden />,
  warning: <AlertTriangle size={15} aria-hidden />,
  info: <Clock size={15} aria-hidden />,
};

export function HomePage() {
  const db = useDb();
  const data = useWeekData();
  const settings = useSettings();
  const user = useCurrentUser();
  const { now, switchWorkspace, workspace } = useApp();
  const services = useServices();
  const modals = useModals();
  const { run } = useFeedback();

  const ref = data?.live ? now : (data?.asOf ?? now);
  const kpis = useMemo(() => (data ? (data.snapshot?.kpis ?? computeKpis(data, ref, db.commitments)) : null), [db, data, ref]);
  const alerts = useMemo(() => (data ? computeAlerts(db, data, ref) : []), [db, data, ref]);
  const items = useMemo(() => (data ? attentionItems(data, alerts) : []), [data, alerts]);
  const carga = useMemo(() => (data ? cargaPorArea(data.projects.filter(isActiveProject)) : new Map()), [data]);
  if (!data || !kpis) return null;
  const criticos = data.projects.filter((p) => isActiveProject(p) && p.clasif?.integrada === 'P1C').length;
  const { maxP1UrgentesPorArea: maxU, maxP1EstrategicosPorArea: maxE } = settings.criteria;
  const areasExcedidas = [...carga.entries()].filter(([, c]) => c.P1C + c.P1U > maxU || c.P1E > maxE).length;

  const session = services.sessions.forWeek(data.week.id);
  const areas = [...db.areas].filter((a) => a.activo).sort((a, b) => a.orden - b.orden);
  const myArea = user?.areaId ?? areas[0]?.id;
  const noProjects = db.projects.length === 0;

  const firstTime = !db.sessions.some((x) => x.estado === 'cerrada');
  const startWeekly = (tipo: 'regular' | 'arranque' = 'regular') => {
    const s = run(() => services.sessions.start(tipo));
    if (s) navigate('/weekly/junta');
  };

  const cta = data.week.estado === 'cerrada' ? (
    <button className="btn btn-xl btn-secondary" onClick={() => modals.open({ type: 'summary', weekId: data.week.id })}>
      <CalendarCheck2 size={22} aria-hidden /> Ver resumen de la Weekly
    </button>
  ) : !data.live ? null : session?.estado === 'en_curso' ? (
    <button className="btn btn-xl btn-primary" onClick={() => navigate('/weekly/junta')}>
      <PlayCircle size={22} aria-hidden /> {session.tipo === 'arranque' ? 'Continuar Sesión 1' : `Continuar Weekly · Paso ${session.pasoActual}`}
    </button>
  ) : firstTime ? (
    <button className="btn btn-xl btn-primary" onClick={() => startWeekly('arranque')} data-testid="start-kickoff">
      <PlayCircle size={22} aria-hidden /> Iniciar Sesión 1
    </button>
  ) : (
    <button className="btn btn-xl btn-primary" onClick={() => startWeekly('regular')} data-testid="start-weekly">
      <PlayCircle size={22} aria-hidden /> Iniciar Weekly
    </button>
  );

  return (
    <div className="page home">
      <header className="hero">
        <div>
          <p className="eyebrow">Alignment &amp; Unblock</p>
          <h1>Semana {data.week.numero}</h1>
          <p className="page-subtitle">
            {fmtShort(data.week.fechaInicio)} — {fmtDate(data.week.fechaFin)} · {settings.orgName}
          </p>
        </div>
        <div className="hero-cta">{cta}</div>
      </header>

      {data.live && (
        <nav className="quick-actions" aria-label="Acciones rápidas">
          <button className="qa" onClick={() => modals.open({ type: 'project', areaId: user?.areaId })}>
            <Plus size={18} aria-hidden /> Nuevo proyecto
          </button>
          <button className="qa" onClick={() => modals.open({ type: 'commitment' })} disabled={noProjects}>
            <ListPlus size={18} aria-hidden /> Nuevo compromiso
          </button>
          <Link className="qa" to={`/actualizar?area=${myArea ?? ''}`}>
            <RefreshCw size={18} aria-hidden /> Actualizar mi área
          </Link>
          <Link className="qa" to="/bloqueos">
            <AlertOctagon size={18} aria-hidden /> Ver bloqueos
          </Link>
          <Link className="qa" to="/compromisos?estado=vencido">
            <Clock size={18} aria-hidden /> Ver vencidos
          </Link>
        </nav>
      )}

      <Section title="Estado de actualización" id="area-status">
        <ul className="area-status">
          {areas.map((a) => {
            const up = areaUpdateFor(data, a.id);
            return (
              <li key={a.id}>
                <Link to={data.live ? `/actualizar?area=${a.id}` : `/areas/${a.id}`} className={`area-pill ${up ? 'done' : 'pending'}`} data-testid={`area-status-${a.nombre}`}>
                  <AreaDot color={a.color} name={a.nombre} />
                  {up ? (
                    <span className="status ok">
                      <CheckCircle2 size={16} aria-hidden /> Actualizada <small>{fmtDateTime(up.completedAt)}</small>
                    </span>
                  ) : (
                    <span className="status warn">
                      <AlertTriangle size={16} aria-hidden /> Pendiente
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      {noProjects ? (
        <Section className="welcome">
          <EmptyState
            icon={<UserCheck size={36} />}
            title="Bienvenido a Alignment & Unblock"
            action={
              <div className="row gap">
                <button className="btn btn-primary" onClick={() => modals.open({ type: 'project' })}>
                  <Plus size={16} aria-hidden /> Registrar primer proyecto
                </button>
                {workspace !== 'demo' && demoEnabled() && (
                  <button className="btn btn-secondary" onClick={() => switchWorkspace('demo')}>
                    <FlaskConical size={16} aria-hidden /> Explorar con datos demo
                  </button>
                )}
              </div>
            }
          >
            <ol className="steps-list">
              <li>Cada área registra y actualiza sus proyectos antes de la junta.</li>
              <li>Dirección presiona <strong>Iniciar Weekly</strong> y conduce los 7 pasos desde aquí.</li>
              <li>Todo bloqueo termina en un compromiso con responsable, fecha y hora.</li>
              <li>La siguiente Weekly comienza revisando esos compromisos.</li>
            </ol>
          </EmptyState>
        </Section>
      ) : (
        <>
          <section className="kpis kpis-9" aria-label="Indicadores de la semana">
            <KpiCard label="Proyectos activos" value={kpis.proyectosActivos} to="/proyectos" tone="brand" />
            <KpiCard label="P1 Crítico" value={criticos} to="/proyectos?clasif=P1C" tone={criticos ? 'red' : 'default'} hint="Estratégico y urgente a la vez" />
            <KpiCard
              label="P1"
              value={kpis.p1}
              to="/proyectos?clasif=P1"
              hint={areasExcedidas ? `${areasExcedidas} gerencia(s) sobre el límite` : `Máx. por gerencia: ${maxU} urgentes · ${maxE} estratégicos`}
              tone={areasExcedidas ? 'yellow' : 'default'}
            />
            <KpiCard label="P2" value={kpis.p2} to="/proyectos?prioridad=P2" />
            <KpiCard label="P3" value={kpis.p3} to="/proyectos?prioridad=P3" />
            <KpiCard label="Bloqueados" value={kpis.bloqueados} to="/bloqueos" tone={kpis.bloqueados ? 'red' : 'green'} />
            <KpiCard label="Compromisos" value={kpis.compromisosAbiertos} to="/compromisos" tone="blue" />
            <KpiCard label="Vencidos" value={kpis.vencidos} to="/compromisos?estado=vencido" tone={kpis.vencidos ? 'red' : 'green'} />
            <KpiCard label="Cumplimiento" value={kpis.cumplimiento === null ? '—' : `${kpis.cumplimiento}%`} to="/historial" tone={kpis.cumplimiento === null ? 'default' : kpis.cumplimiento >= 80 ? 'green' : kpis.cumplimiento >= 60 ? 'yellow' : 'red'} hint={`Últimas 4 semanas · ${kpis.cumplidos} de ${kpis.evaluables ?? kpis.cumplidos + kpis.incumplidos} cumplidos`} />
          </section>

          <div className="home-grid">
            <Section title="Requieren atención" id="attention" actions={<span className="muted small">{items.length} proyectos</span>}>
              {items.length === 0 ? (
                <EmptyState icon={<CheckCircle2 size={32} />} title="Todo en orden">
                  No hay compromisos vencidos, P1 bloqueados ni escalamientos esta semana.
                </EmptyState>
              ) : (
                <ul className="attention">
                  {items.slice(0, 8).map((it) => {
                    const area = db.areas.find((a) => a.id === it.project.areaId);
                    return (
                      <li key={it.project.id} className={`attention-item rank-${it.rank <= 2 ? 'hi' : it.rank <= 4 ? 'mid' : 'lo'}`}>
                        <div className="attention-main">
                          <div className="attention-title">
                            <strong>{it.project.nombre}</strong>
                            {it.project.clasif ? <ClassBadge c={it.project.clasif.integrada} /> : <PriorityBadge p={it.project.prioridadFinal} override={it.project.ajusteDireccion} />}
                            {it.project.bloqueado && <BlockedChip />}
                          </div>
                          <div className="attention-meta">
                            {area && <AreaDot color={area.color} name={area.nombre} />}
                            {it.project.dependeDe && <span>Depende de {dependencyLabel(db, it.project.dependeDe)}</span>}
                          </div>
                          <ul className="attention-reasons">
                            {dedupe(it.alerts).map((a) => (
                              <li key={a.id} className={`sev-${a.severity}`}>
                                {SEVERITY_ICON[a.severity]}
                                <span>
                                  <span className="sr-only">{ALERT_LABELS[a.kind]}: </span>
                                  {a.detail}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <Link className="btn btn-secondary btn-sm" to={`/proyectos/${it.project.id}`} aria-label={`Ver ${it.project.nombre}`}>
                          Ver <ArrowRight size={14} aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {items.length > 8 && (
                <p className="more">
                  <Link to="/proyectos?atencion=1">Ver los {items.length} proyectos que requieren atención →</Link>
                </p>
              )}
            </Section>

            <div className="stack">
              <Section title="Salud de ejecución" id="health" actions={<Link to="/historial" className="small">Ver historial →</Link>}>
                <dl className="health-list">
                  <div>
                    <dt>Compromisos cumplidos</dt>
                    <dd>{kpis.cumplimiento === null ? '—' : `${kpis.cumplimiento}%`}</dd>
                  </div>
                  <div>
                    <dt>Bloqueos abiertos</dt>
                    <dd>{kpis.bloqueosAbiertos}</dd>
                  </div>
                  <div>
                    <dt>Bloqueos resueltos</dt>
                    <dd>{kpis.bloqueosResueltos}</dd>
                  </div>
                  <div>
                    <dt>Vencidos</dt>
                    <dd>{kpis.vencidos}</dd>
                  </div>
                  <div>
                    <dt>Reprogramaciones</dt>
                    <dd>{kpis.reprogramaciones}</dd>
                  </div>
                  <div>
                    <dt>P1 bloqueados</dt>
                    <dd>{kpis.p1Bloqueados}</dd>
                  </div>
                </dl>
                <p className="small muted">Indicadores del sistema, no de personas: sirven para detectar dónde se atora el trabajo.</p>
              </Section>
              <Section title="Carga por gerencia" id="carga" actions={<Link to="/proyectos?clasif=P1" className="small">Ver P1 →</Link>}>
                <div className="table-wrap">
                  <table className="table table-compact carga-table" data-testid="carga-gerencia">
                    <thead>
                      <tr>
                        <th scope="col">Gerencia</th>
                        {CLASIFICACIONES.map((c) => (
                          <th key={c} scope="col" className="num" title={CLASIFICACION_LABELS[c]}>
                            <span className={`cls cls-${c.toLowerCase()}`} aria-label={CLASIFICACION_LABELS[c]}>
                              {CARGA_CORTO[c]}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {areas.map((a) => {
                        const c = carga.get(a.id) ?? { P1C: 0, P1U: 0, P1E: 0, P2: 0, P3: 0 };
                        const overU = c.P1C + c.P1U > maxU;
                        const overE = c.P1E > maxE;
                        return (
                          <tr key={a.id}>
                            <td>
                              <AreaDot color={a.color} name={a.nombre} />
                            </td>
                            {CLASIFICACIONES.map((k) => (
                              <td key={k} className={`num ${(overU && (k === 'P1C' || k === 'P1U')) || (overE && k === 'P1E') ? 'carga-over' : ''}`}>
                                <Link to={`/proyectos?area=${a.id}&clasif=${k}`}>{c[k]}</Link>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="small muted">
                  Límite por gerencia: {maxU} P1 Críticos + Urgentes y {maxE} P1 Estratégicos. En rojo, lo que excede: Dirección decide qué se desplaza.
                </p>
              </Section>
              <OtherAlerts alerts={alerts} />
              <Section title="Reglas del juego" className="rules">
                <ol>
                  {RULES.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function dedupe(alerts: Alert[]): Alert[] {
  const seen = new Set<string>();
  return alerts.filter((a) => (seen.has(a.detail) ? false : (seen.add(a.detail), true)));
}

function OtherAlerts({ alerts }: { alerts: Alert[] }) {
  const counts = new Map<string, number>();
  for (const a of alerts) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  const rows = [
    ['bloqueo_sin_compromiso', '/bloqueos'],
    ['p1_sin_responsable', '/proyectos?clasif=P1'],
    ['p1e_desatendido', '/proyectos?clasif=P1E'],
    ['p1_limite_area', '/proyectos?clasif=P1'],
    ['area_sin_actualizar', '/areas'],
    ['escalado', '/bloqueos'],
  ] as const;
  const visible = rows.filter(([k]) => counts.get(k));
  if (!visible.length) return null;
  return (
    <Section title="Alertas">
      <ul className="alert-list">
        {visible.map(([k, to]) => (
          <li key={k}>
            <Link to={to}>
              <Chip tone={k === 'area_sin_actualizar' || k === 'p1_limite_area' ? 'yellow' : k === 'escalado' ? 'pink' : 'red'} icon={<AlertTriangle size={14} aria-hidden />}>
                {counts.get(k)}
              </Chip>
              {ALERT_LABELS[k]}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
