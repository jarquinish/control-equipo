import { useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, LogOut, Maximize2 } from 'lucide-react';
import { WEEKLY_STEPS } from '../../domain/constants';
import { fmtDate, fmtShort } from '../../domain/dates';
import { getWeekData } from '../../domain/selectors';
import type { Session } from '../../domain/types';
import { useActiveWeek, useApp, useDb, useServices } from '../../state/app';
import { navigate } from '../../state/router';
import { EmptyState } from '../../ui/common';
import { Step1Review, Step2Visibilize, Step3Order, Step4Prioritize } from './steps1to4';
import { Step5Detect, Step6Unblock, Step7Close } from './steps5to7';
import { KickoffFrame } from './KickoffMode';

export function MeetingMode() {
  const db = useDb();
  const week = useActiveWeek();
  const services = useServices();
  const { now } = useApp();
  const session = week ? services.sessions.forWeek(week.id) : undefined;
  const data = useMemo(() => (week ? getWeekData(db, week.id, now) : undefined), [db, week, now]);

  if (!week || !data || !session || session.estado !== 'en_curso') {
    return (
      <div className="meeting">
        <div className="meeting-empty">
          <EmptyState title="No hay una Weekly en curso" action={<button className="btn btn-primary" onClick={() => navigate('/weekly')}>Ir a Weekly</button>}>
            Inicia la Weekly desde la pantalla de Inicio o Weekly.
          </EmptyState>
        </div>
      </div>
    );
  }
  const range = `${fmtShort(week.fechaInicio)} — ${fmtDate(week.fechaFin)}`;
  if (session.tipo === 'arranque') return <KickoffFrame session={session} weekNumber={week.numero} range={range} data={data} />;
  return <MeetingFrame session={session} weekNumber={week.numero} range={range} data={data} />;
}

function MeetingFrame({ session, weekNumber, range, data }: { session: Session; weekNumber: number; range: string; data: NonNullable<ReturnType<typeof getWeekData>> }) {
  const services = useServices();
  const step = session.pasoActual;
  const meta = WEEKLY_STEPS[step - 1];
  const go = (n: number) => {
    if (n < 1 || n > 7) return;
    services.sessions.setStep(session.id, n);
    document.querySelector('.meeting-body')?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || document.body.classList.contains('modal-open')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(step + 1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className="meeting" data-testid="meeting-mode">
      <header className="meeting-top">
        <div className="meeting-brand">
          <strong>Alignment &amp; Unblock</strong>
          <span>
            Semana {weekNumber} · {range}
          </span>
        </div>
        <div className="meeting-progress" aria-label={`Paso ${step} de 7`}>
          <span className="step-count" data-testid="step-count">
            PASO {step} DE 7
          </span>
          <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={7} aria-valuenow={step}>
            <div style={{ width: `${(step / 7) * 100}%` }} />
          </div>
        </div>
        <div className="meeting-tools">
          <button className="btn btn-ghost btn-sm" onClick={fullscreen} title="Pantalla completa">
            <Maximize2 size={16} aria-hidden /> <span className="hide-md">Pantalla completa</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/weekly')}>
            <LogOut size={16} aria-hidden /> Salir
          </button>
        </div>
      </header>
      <nav className="step-pills" aria-label="Pasos de la Weekly">
        {WEEKLY_STEPS.map((s) => (
          <button key={s.n} className={`step-pill ${s.n === step ? 'on' : ''} ${s.n < step ? 'past' : ''}`} onClick={() => go(s.n)} aria-current={s.n === step ? 'step' : undefined}>
            <span className="step-n">{s.n}</span>
            {s.titulo}
          </button>
        ))}
      </nav>
      <main className="meeting-body" id="main">
        <div className="meeting-title">
          <p className="eyebrow">
            Paso {step} · {meta.titulo}
          </p>
          <h1>{meta.pregunta.toUpperCase()}</h1>
        </div>
        {step === 1 && <Step1Review session={session} data={data} />}
        {step === 2 && <Step2Visibilize session={session} data={data} />}
        {step === 3 && <Step3Order data={data} />}
        {step === 4 && <Step4Prioritize session={session} data={data} />}
        {step === 5 && <Step5Detect session={session} data={data} />}
        {step === 6 && <Step6Unblock session={session} data={data} />}
        {step === 7 && <Step7Close session={session} data={data} />}
      </main>
      <footer className="meeting-foot">
        <button className="btn btn-secondary btn-lg" disabled={step === 1} onClick={() => go(step - 1)}>
          <ArrowLeft size={18} aria-hidden /> {step > 1 ? WEEKLY_STEPS[step - 2].titulo : 'Anterior'}
        </button>
        <span className="muted small hide-md">Usa ← → para navegar</span>
        {step < 7 ? (
          <button className="btn btn-primary btn-lg" onClick={() => go(step + 1)} data-testid="next-step">
            {WEEKLY_STEPS[step].titulo} <ArrowRight size={18} aria-hidden />
          </button>
        ) : (
          <span />
        )}
      </footer>
    </div>
  );
}
