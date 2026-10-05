import { AlertTriangle, CalendarCheck2, CalendarPlus, CheckCircle2, ClipboardList, PlayCircle } from 'lucide-react';
import { WEEKLY_STEPS } from '../../domain/constants';
import { fmtDate, fmtDateTime, fmtShort } from '../../domain/dates';
import { areaUpdateFor, blockIsManaged, getWeekData, isActiveProject, isBlockOpen } from '../../domain/selectors';
import { reviewCommitments } from '../../domain/weekly';
import { useActiveWeek, useApp, useDb, useServices } from '../../state/app';
import { navigate } from '../../state/router';
import { PageHeader, Section } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { useModals } from '../modals/ModalHost';

export function WeeklyPage() {
  const db = useDb();
  const week = useActiveWeek();
  const services = useServices();
  const modals = useModals();
  const { now, setViewWeekId } = useApp();
  const { run, confirm, toast } = useFeedback();
  if (!week) return null;
  const data = getWeekData(db, week.id, now)!;
  const session = services.sessions.forWeek(week.id);
  const areas = db.areas.filter((a) => a.activo);
  const updated = areas.filter((a) => areaUpdateFor(data, a.id));
  const prev = reviewCommitments(db, week.id);
  const blocked = data.projects.filter((p) => isActiveProject(p) && p.bloqueado);
  const unmanaged = data.blocks.filter((b) => isBlockOpen(b) && !blockIsManaged(b, data.commitments));

  const start = () => {
    const s = run(() => services.sessions.start());
    if (s) navigate('/weekly/junta');
  };
  const openNext = async () => {
    const next = services.weeks.nextWeekPreview();
    const ok = await confirm({ title: `Abrir Semana ${next.numero}`, message: `Se abrirá la Semana ${next.numero} (${fmtShort(next.fechaInicio)} — ${fmtDate(next.fechaFin)}). La Semana ${week.numero} queda como historial.`, confirmLabel: `Abrir Semana ${next.numero}` });
    if (!ok) return;
    services.weeks.openNextWeek();
    setViewWeekId(undefined);
    toast(`Semana ${next.numero} abierta`);
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Modo Junta" title={`Weekly · Semana ${week.numero}`} subtitle={`${fmtShort(week.fechaInicio)} — ${fmtDate(week.fechaFin)}. La junta vive dentro del dashboard.`} />

      <div className="weekly-launch card">
        {week.estado === 'cerrada' ? (
          <>
            <CheckCircle2 size={40} className="ok" aria-hidden />
            <div>
              <h2>Weekly cerrada</h2>
              <p className="muted">{session?.closedAt ? `Cerrada ${fmtDateTime(session.closedAt)}.` : 'Semana cerrada.'} La información quedó guardada en el historial.</p>
            </div>
            <div className="row gap wrap">
              <button className="btn btn-secondary btn-lg" onClick={() => modals.open({ type: 'summary', weekId: week.id })}>
                <ClipboardList size={18} aria-hidden /> Ver resumen
              </button>
              <button className="btn btn-primary btn-lg" onClick={openNext}>
                <CalendarPlus size={18} aria-hidden /> Abrir semana siguiente
              </button>
            </div>
          </>
        ) : session?.estado === 'en_curso' ? (
          <>
            <PlayCircle size={40} className="text-brand" aria-hidden />
            <div>
              <h2>Weekly en curso</h2>
              <p className="muted">Iniciada {fmtDateTime(session.createdAt)} · Paso {session.pasoActual} de 7: {WEEKLY_STEPS[session.pasoActual - 1].titulo}</p>
            </div>
            <button className="btn btn-primary btn-xl" onClick={() => navigate('/weekly/junta')}>
              <PlayCircle size={22} aria-hidden /> Continuar Weekly
            </button>
          </>
        ) : (
          <>
            <CalendarCheck2 size={40} className="text-brand" aria-hidden />
            <div>
              <h2>¿Listos para la Weekly?</h2>
              <p className="muted">Conduce la junta paso a paso. Funciona proyectado en pantalla completa.</p>
            </div>
            <button className="btn btn-primary btn-xl" onClick={start} data-testid="start-weekly">
              <PlayCircle size={22} aria-hidden /> Iniciar Weekly
            </button>
          </>
        )}
      </div>

      {week.estado === 'abierta' && (
        <Section title="Preparación de la junta">
          <ul className="prep-list">
            <li className={updated.length === areas.length ? 'ok' : 'warn'}>
              {updated.length === areas.length ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
              <span>
                <strong>
                  {updated.length} de {areas.length}
                </strong>{' '}
                áreas actualizaron su semana{updated.length < areas.length && ` · faltan: ${areas.filter((a) => !areaUpdateFor(data, a.id)).map((a) => a.nombre).join(', ')}`}
              </span>
            </li>
            <li className={prev.length ? 'info' : 'ok'}>
              <ClipboardList size={18} aria-hidden />
              <span>
                <strong>{prev.length}</strong> compromisos anteriores por revisar (paso 1)
              </span>
            </li>
            <li className={blocked.length ? 'warn' : 'ok'}>
              <AlertTriangle size={18} aria-hidden />
              <span>
                <strong>{blocked.length}</strong> proyectos bloqueados · <strong>{unmanaged.length}</strong> bloqueos sin compromiso
              </span>
            </li>
          </ul>
        </Section>
      )}

      <Section title="Los 7 pasos">
        <ol className="steps-overview">
          {WEEKLY_STEPS.map((s) => (
            <li key={s.n} className={session?.estado === 'en_curso' && session.pasoActual === s.n ? 'current' : ''}>
              <span className="step-n">{s.n}</span>
              <div>
                <strong>{s.titulo}</strong>
                <span className="muted block">{s.pregunta}</span>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
