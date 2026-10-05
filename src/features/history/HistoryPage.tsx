import { useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, History } from 'lucide-react';
import { BLOCK_STATUS_LABELS, QUADRANT_LABELS, QUADRANTS } from '../../domain/constants';
import { fmtDate, fmtDateTime, fmtShort } from '../../domain/dates';
import { computeHealth, computeKpis, weekCompliance } from '../../domain/metrics';
import { dependencyLabel, getWeekData, isActiveProject, isBlockOpen, personName, sortProjectsByPriority, sortWeeks } from '../../domain/selectors';
import { useActiveWeek, useApp, useDb, useSettings } from '../../state/app';
import { Link, navigate } from '../../state/router';
import { BlockStatusChip, PriorityBadge, ProjectStatusChip } from '../../ui/badges';
import { EmptyState, PageHeader, Section } from '../../ui/common';
import { useModals } from '../modals/ModalHost';
import { CommitmentTable } from '../commitments/CommitmentTable';

export function HistoryPage() {
  const db = useDb();
  const settings = useSettings();
  const active = useActiveWeek();
  const { now } = useApp();
  const weeks = sortWeeks(db.weeks).reverse();
  const currentKpis = useMemo(() => {
    if (!active || active.estado === 'cerrada') return undefined;
    const d = getWeekData(db, active.id, now)!;
    return { weekId: active.id, kpis: computeKpis(d, now, db.commitments) };
  }, [db, active, now]);
  const health = useMemo(() => computeHealth(db, now, settings.criteria.semanasProyectoLargo, currentKpis), [db, now, settings, currentKpis]);
  const name = (id: string) => db.projects.find((p) => p.id === id)?.nombre ?? '—';

  return (
    <div className="page">
      <PageHeader title="Historial de Weeklys" subtitle="Cada semana conserva su fotografía: lo que se decidió no se sobrescribe." />

      <Section title="Salud de ejecución" id="salud">
        <div className="health-grid">
          <div className="health-kpi">
            <span>Compromisos cumplidos</span>
            <strong>{health.totales.cumplimiento === null ? '—' : `${health.totales.cumplimiento}%`}</strong>
            <small>
              {health.totales.cumplidos} de {health.totales.cumplidos + health.totales.incumplidos + health.totales.vencidos} evaluables
            </small>
          </div>
          <div className="health-kpi">
            <span>Vencidos hoy</span>
            <strong className={health.totales.vencidos ? 'red' : ''}>{health.totales.vencidos}</strong>
          </div>
          <div className="health-kpi">
            <span>Reprogramaciones</span>
            <strong>{health.totales.reprogramaciones}</strong>
          </div>
          <div className="health-kpi">
            <span>Tiempo promedio de desbloqueo</span>
            <strong>{health.tiempoPromedioDesbloqueoHoras === null ? '—' : health.tiempoPromedioDesbloqueoHoras < 48 ? `${health.tiempoPromedioDesbloqueoHoras} h` : `${Math.round(health.tiempoPromedioDesbloqueoHoras / 24)} días`}</strong>
          </div>
        </div>

        {health.semanas.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Indicadores por semana</caption>
              <thead>
                <tr>
                  <th scope="col">Semana</th>
                  <th scope="col" className="num">P1</th>
                  <th scope="col" className="num">P1 bloqueados</th>
                  <th scope="col" className="num">Bloqueos abiertos</th>
                  <th scope="col" className="num">Resueltos</th>
                  <th scope="col" className="num">Vencidos</th>
                  <th scope="col" className="num">Reprog.</th>
                  <th scope="col" title="Compromisos cuya fecha original vencía esa semana">Cumplimiento de la semana</th>
                </tr>
              </thead>
              <tbody>
                {health.semanas.map(({ week, kpis, cerrada }) => (
                  <tr key={week.id}>
                    <td>
                      Semana {week.numero} {!cerrada && <span className="chip chip-blue">en curso</span>}
                    </td>
                    <td className="num">{kpis.p1}</td>
                    <td className="num">{kpis.p1Bloqueados}</td>
                    <td className="num">{kpis.bloqueosAbiertos}</td>
                    <td className="num">{kpis.bloqueosResueltos}</td>
                    <td className="num">{kpis.vencidos}</td>
                    <td className="num">{kpis.reprogramaciones}</td>
                    <td>
                      {(() => {
                        const wc = weekCompliance(db.commitments, week, now);
                        return wc.rate === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className="bar-cell">
                            <span className="bar" aria-hidden>
                              <span style={{ width: `${wc.rate}%` }} />
                            </span>
                            {wc.rate}% <span className="small muted">({wc.cumplidos}/{wc.evaluables})</span>
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="three-col">
          <div>
            <h3>Dependencias recurrentes</h3>
            {health.dependenciasRecurrentes.length === 0 ? (
              <p className="muted small">Sin datos.</p>
            ) : (
              <ul className="plain-list">
                {health.dependenciasRecurrentes.slice(0, 5).map((d) => (
                  <li key={d.key}>
                    <strong>{dependencyLabel(db, d.key)}</strong> · {d.total} bloqueos ({d.abiertos} abiertos)
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Bloqueos recurrentes</h3>
            {health.bloqueosRecurrentes.length === 0 ? (
              <p className="muted small">Ningún proyecto bloqueado en varias semanas.</p>
            ) : (
              <ul className="plain-list">
                {health.bloqueosRecurrentes.slice(0, 5).map((b) => (
                  <li key={b.projectId}>
                    <Link to={`/proyectos/${b.projectId}`}>{name(b.projectId)}</Link> · {b.semanas} semanas
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Proyectos abiertos demasiado tiempo</h3>
            {health.proyectosLargos.length === 0 ? (
              <p className="muted small">Ninguno supera {settings.criteria.semanasProyectoLargo} semanas.</p>
            ) : (
              <ul className="plain-list">
                {health.proyectosLargos.slice(0, 5).map((p) => (
                  <li key={p.projectId}>
                    <Link to={`/proyectos/${p.projectId}`}>{name(p.projectId)}</Link> · {p.semanas} semanas
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="small muted">Estos indicadores miden el sistema, no a las personas: sirven para detectar cuellos de botella.</p>
      </Section>

      <Section title="Semanas">
        {weeks.length === 0 ? (
          <EmptyState icon={<History size={32} />} title="Aún no hay semanas registradas" />
        ) : (
          <ul className="week-list">
            {weeks.map((w) => {
              const snap = db.snapshots.find((s) => s.weekId === w.id);
              const session = db.sessions.find((s) => s.weekId === w.id);
              return (
                <li key={w.id}>
                  <Link to={`/historial/${w.id}`} className="week-item card" data-testid="history-week">
                    <div>
                      <strong>Semana {w.numero}</strong>
                      <span className="small muted block">
                        {fmtShort(w.fechaInicio)} — {fmtDate(w.fechaFin)}
                      </span>
                    </div>
                    <span className={`chip ${w.estado === 'cerrada' ? 'chip-green' : 'chip-blue'}`}>{w.estado === 'cerrada' ? 'Cerrada' : 'Abierta'}</span>
                    {snap ? (
                      <span className="small">
                        {snap.kpis.p1} P1 · {snap.kpis.bloqueados} bloqueados · {snap.kpis.compromisosAbiertos} compromisos · cumplimiento {snap.kpis.cumplimiento === null ? '—' : `${snap.kpis.cumplimiento}%`}
                      </span>
                    ) : (
                      <span className="small muted">{session ? `Weekly ${session.estado === 'en_curso' ? 'en curso' : 'cerrada'}` : 'Sin Weekly aún'}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

const TABS = ['Proyectos', 'Eisenhower', 'Bloqueos', 'Compromisos', 'Decisiones', 'Resumen'] as const;

export function WeekHistoryPage({ id }: { id: string }) {
  const db = useDb();
  const { now } = useApp();
  const modals = useModals();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Proyectos');
  const data = getWeekData(db, id, now);
  if (!data || data.week.id !== id) return <EmptyState title="Semana no encontrada" />;
  const ref = data.live ? now : data.asOf;
  const kpis = data.snapshot?.kpis ?? computeKpis(data, ref, db.commitments);
  const wc = weekCompliance(db.commitments, data.week, now);
  const projects = data.projects.filter((p) => isActiveProject(p) || p.estado === 'completado').sort(sortProjectsByPriority);
  const reprog = data.commitments.filter((c) => c.reprogramaciones > 0);
  const escal = data.commitments.filter((c) => c.estado === 'escalado');

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm back" onClick={() => navigate('/historial')}>
        <ArrowLeft size={16} aria-hidden /> Historial
      </button>
      <PageHeader
        eyebrow={data.snapshot ? `Fotografía del ${fmtDateTime(data.snapshot.createdAt)}` : 'Semana en curso'}
        title={`Semana ${data.week.numero}`}
        subtitle={`${fmtShort(data.week.fechaInicio)} — ${fmtDate(data.week.fechaFin)}`}
        actions={
          <button className="btn btn-secondary" onClick={() => modals.open({ type: 'summary', weekId: id })}>
            <ClipboardList size={16} aria-hidden /> Resumen
          </button>
        }
      />
      <dl className="snapshot-kpis card">
        <div><dt>Proyectos</dt><dd>{kpis.proyectosActivos}</dd></div>
        <div><dt>P1 / P2 / P3</dt><dd>{kpis.p1} / {kpis.p2} / {kpis.p3}</dd></div>
        <div><dt>Bloqueados</dt><dd>{kpis.bloqueados}</dd></div>
        <div><dt>Compromisos abiertos</dt><dd>{kpis.compromisosAbiertos}</dd></div>
        <div><dt>Cumplimiento de la semana</dt><dd>{wc.rate === null ? '—' : `${wc.rate}%`}</dd></div>
        <div><dt>Reprogramaciones</dt><dd>{reprog.reduce((n, c) => n + c.reprogramaciones, 0)}</dd></div>
        <div><dt>Escalamientos</dt><dd>{escal.length + data.blocks.filter((b) => b.estado === 'escalado').length}</dd></div>
      </dl>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="card section" role="tabpanel">
        {tab === 'Proyectos' && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Prioridad</th>
                  <th scope="col">Proyecto</th>
                  <th scope="col">Área</th>
                  <th scope="col">Responsable</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Comentario</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} data-testid="history-project-row">
                    <td><PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} /></td>
                    <td>
                      <Link to={`/proyectos/${p.id}`}>{p.nombre}</Link> {p.bloqueado && <span className="chip chip-red">Bloqueado</span>}
                    </td>
                    <td>{db.areas.find((a) => a.id === p.areaId)?.nombre}</td>
                    <td>{personName(db.people, p.responsable)}</td>
                    <td className="num">{p.score}</td>
                    <td><ProjectStatusChip status={p.estado} /></td>
                    <td className="small">{data.weeklyUpdates.find((u) => u.projectId === p.id)?.comentario ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'Eisenhower' && (
          <div className="mini-eisen">
            {QUADRANTS.map((q) => (
              <div key={q} className={`mini-q quad-${q}`}>
                <h3>{QUADRANT_LABELS[q]}</h3>
                <ul>
                  {projects.filter((p) => p.eisenhower === q && isActiveProject(p)).map((p) => (
                    <li key={p.id}>
                      <PriorityBadge p={p.prioridadFinal} /> {p.nombre}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {tab === 'Bloqueos' &&
          (data.blocks.length === 0 ? (
            <p className="muted">Sin bloqueos esa semana.</p>
          ) : (
            <ul className="plain-list">
              {data.blocks.map((b) => (
                <li key={b.id}>
                  <BlockStatusChip status={b.estado} /> <strong>{db.projects.find((p) => p.id === b.projectId)?.nombre}</strong> — {b.descripcion}
                  <span className="small muted block">
                    Depende de {dependencyLabel(db, b.areaDependencia)} · {BLOCK_STATUS_LABELS[b.estado]}
                    {isBlockOpen(b) ? '' : ` · resuelto ${fmtDateTime(b.resolvedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'Compromisos' && (data.commitments.length ? <CommitmentTable rows={data.commitments} readOnly asOf={ref} /> : <p className="muted">Sin compromisos.</p>)}
        {tab === 'Decisiones' &&
          (data.decisions.length === 0 ? (
            <p className="muted">Sin decisiones registradas.</p>
          ) : (
            <ul className="plain-list">
              {data.decisions.map((d) => (
                <li key={d.id}>
                  <strong>{d.descripcion}</strong>
                  <span className="small muted block">
                    {d.projectId ? db.projects.find((p) => p.id === d.projectId)?.nombre : 'Tema general'} · {personName(db.people, d.responsable, 'sin responsable')}
                  </span>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'Resumen' && <pre className="summary-pre">{data.snapshot?.resumen ?? 'La semana aún no se cierra. Usa «Resumen» para ver la versión actual.'}</pre>}
      </div>
    </div>
  );
}
