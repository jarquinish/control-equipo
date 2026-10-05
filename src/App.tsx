import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AppProvider } from './state/app';
import { AuthGate } from './state/auth';
import { match, useLocation } from './state/router';
import { FeedbackProvider } from './ui/feedback';
import { ModalProvider } from './features/modals/ModalHost';
import { AppShell } from './features/layout/AppShell';
import { HomePage } from './features/home/HomePage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { ProjectDetailPage } from './features/projects/ProjectDetailPage';
import { EisenhowerPage } from './features/eisenhower/EisenhowerPage';
import { BlocksPage } from './features/blocks/BlocksPage';
import { CommitmentsPage } from './features/commitments/CommitmentsPage';
import { DependenciesPage } from './features/dependencies/DependenciesPage';
import { AreaDashboard, AreasPage } from './features/areas/AreasPage';
import { AreaUpdatePage } from './features/areas/AreaUpdatePage';
import { HistoryPage, WeekHistoryPage } from './features/history/HistoryPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { WeeklyPage } from './features/weekly/WeeklyPage';
import { MeetingMode } from './features/weekly/MeetingMode';
import { EmptyState } from './ui/common';
import { Link } from './state/router';

function Routes() {
  const { path } = useLocation();
  let m: Record<string, string> | null;
  if (path === '/weekly/junta') return <MeetingMode />;

  let page: ReactNode;
  if (path === '/') page = <HomePage />;
  else if (path === '/weekly') page = <WeeklyPage />;
  else if (path === '/proyectos') page = <ProjectsPage />;
  else if ((m = match('/proyectos/:id', path))) page = <ProjectDetailPage key={m.id} id={m.id} />;
  else if (path === '/eisenhower') page = <EisenhowerPage />;
  else if (path === '/bloqueos') page = <BlocksPage />;
  else if (path === '/compromisos') page = <CommitmentsPage />;
  else if (path === '/dependencias') page = <DependenciesPage />;
  else if (path === '/areas') page = <AreasPage />;
  else if ((m = match('/areas/:id', path))) page = <AreaDashboard key={m.id} id={m.id} />;
  else if (path === '/actualizar') page = <AreaUpdatePage />;
  else if (path === '/historial') page = <HistoryPage />;
  else if ((m = match('/historial/:id', path))) page = <WeekHistoryPage key={m.id} id={m.id} />;
  else if (path === '/configuracion') page = <SettingsPage />;
  else
    page = (
      <EmptyState title="Página no encontrada" action={<Link to="/" className="btn btn-primary">Ir al inicio</Link>}>
        La dirección no existe.
      </EmptyState>
    );
  return <AppShell>{page}</AppShell>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Alignment & Unblock] Error de interfaz', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="fatal" role="alert">
          <h1>Algo salió mal en esta pantalla</h1>
          <p>Tu información está guardada. Recarga la página para continuar; si el problema persiste, genera un respaldo desde Configuración.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Loading() {
  return (
    <div className="loading" role="status">
      <span className="brand-mark" aria-hidden>A<span>&amp;</span>U</span>
      <span>Cargando Alignment &amp; Unblock…</span>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <FeedbackProvider>
        <AuthGate>
          <AppProvider fallback={<Loading />}>
            <ModalProvider>
              <Routes />
            </ModalProvider>
          </AppProvider>
        </AuthGate>
      </FeedbackProvider>
    </ErrorBoundary>
  );
}
