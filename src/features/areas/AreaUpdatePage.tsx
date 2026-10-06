import { useState } from 'react';
import { AlertOctagon, Archive, Check, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, Pencil, Plus, Save, Flag } from 'lucide-react';
import { DEPENDENCY_LABELS, IMPACT_HINTS, IMPACT_LABELS, PROJECT_STATUSES, URGENCY_LABELS } from '../../domain/constants';
import { fmtDateTime } from '../../domain/dates';
import { computePriority } from '../../domain/scoring';
import { areaUpdateFor, isActiveProject, personName, projectUpdatedThisWeek, sortProjectsByPriority } from '../../domain/selectors';
import type { Level, Project, ProjectStatus } from '../../domain/types';
import { useActiveWeek, useDb, useServices, useSettings, useWeekData } from '../../state/app';
import { Link, navigate, useQuery } from '../../state/router';
import { BlockedChip, Chip, PriorityBadge } from '../../ui/badges';
import { EmptyState, PageHeader } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { LevelPicker, PersonSelect } from '../../ui/forms';
import { useModals } from '../modals/ModalHost';
import { ProjectQuickForm } from '../projects/ProjectQuickForm';

/** ACTUALIZAR MI SEMANA: flujo rápido para que cada gerente prepare la Weekly. */
export function AreaUpdatePage() {
  const db = useDb();
  const data = useWeekData();
  const active = useActiveWeek();
  const services = useServices();
  const modals = useModals();
  const { run, confirm, toast } = useFeedback();
  const [q, setQ] = useQuery();
  const [nota, setNota] = useState('');
  const areas = db.areas.filter((a) => a.activo).sort((a, b) => a.orden - b.orden);
  const areaId = q.get('area') || areas[0]?.id;
  const area = db.areas.find((a) => a.id === areaId);

  if (!data || !area) return null;
  const live = data.live && data.week.id === active?.id;
  const projects = data.projects.filter((p) => p.areaId === area.id && isActiveProject(p)).sort(sortProjectsByPriority);
  const done = areaUpdateFor(data, area.id);
  const pending = projects.filter((p) => !projectUpdatedThisWeek(data, p.id));

  const complete = async () => {
    if (pending.length) {
      const ok = await confirm({
        title: 'Proyectos sin revisar',
        message: (
          <>
            <p>
              {pending.length} proyecto{pending.length === 1 ? '' : 's'} no {pending.length === 1 ? 'se ha' : 'se han'} actualizado:
            </p>
            <ul>
              {pending.map((p) => (
                <li key={p.id}>{p.nombre}</li>
              ))}
            </ul>
            <p>¿Marcarlos como «continúa sin cambios» y completar la actualización?</p>
          </>
        ),
        confirmLabel: 'Sí, continuar todos y completar',
      });
      if (!ok) return;
    }
    const r = run(() =>
      services.ctx.store.batch(() => {
        for (const p of pending) services.projects.continue(p.id);
        return services.areas.completeUpdate(area.id, nota);
      }),
    );
    if (r) {
      toast(`✓ Actualización completada · ${area.nombre}`);
      setNota('');
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Semana ${data.week.numero}`}
        title="Actualizar mi semana"
        subtitle="Revisa cada proyecto antes de la Weekly: continúa, actualiza, cierra o marca bloqueo."
        actions={
          live && (
            <button className="btn btn-primary" onClick={() => modals.open({ type: 'project', areaId: area.id })}>
              <Plus size={16} aria-hidden /> Crear proyecto
            </button>
          )
        }
      />
      <div className="area-tabs" role="tablist" aria-label="Área">
        {areas.map((a) => {
          const up = areaUpdateFor(data, a.id);
          return (
            <button key={a.id} role="tab" aria-selected={a.id === area.id} className={`area-tab ${a.id === area.id ? 'on' : ''}`} onClick={() => setQ({ area: a.id })}>
              <span className="area-dot" style={{ background: a.color }} aria-hidden />
              {a.nombre}
              {up ? <CheckCircle2 size={15} className="ok" aria-label="actualizada" /> : <span className="warn-dot" aria-label="pendiente">⚠</span>}
            </button>
          );
        })}
      </div>

      {!live && (
        <p className="alert alert-yellow">
          La semana en vista no está abierta. {active?.estado === 'cerrada' ? 'Abre la siguiente semana para registrar actualizaciones.' : <Link to="/">Ir a la semana actual</Link>}
        </p>
      )}

      <div className={`update-status card ${done ? 'done' : ''}`} data-testid="area-update-status">
        {done ? (
          <>
            <CheckCircle2 size={22} aria-hidden />
            <div>
              <strong>Actualización completada</strong>
              <span className="small muted block">
                {fmtDateTime(done.completedAt)} · {personName(db.people, done.completedBy, 'usuario local')}
                {done.comentario && ` · «${done.comentario}»`}
              </span>
            </div>
            {live && (
              <button className="btn btn-ghost btn-sm ml-auto" onClick={() => run(() => services.areas.reopenUpdate(area.id), 'Actualización reabierta')}>
                Reabrir
              </button>
            )}
          </>
        ) : (
          <>
            <AlertOctagon size={22} aria-hidden />
            <div>
              <strong>{area.nombre}: actualización pendiente</strong>
              <span className="small muted block">
                {projects.length - pending.length} de {projects.length} proyectos revisados
              </span>
            </div>
          </>
        )}
      </div>

      {live && (
        <details className="area-register" open={projects.length === 0}>
          <summary className="btn btn-secondary">＋ Registrar proyecto de {area.nombre}</summary>
          <ProjectQuickForm key={area.id} areaId={area.id} areaName={area.nombre} origen="area" />
        </details>
      )}
      {live && (
        <button type="button" className="btn btn-secondary area-import" onClick={() => modals.open({ type: 'import', areaId: area.id })} data-testid="area-import">
          <FileSpreadsheet size={16} aria-hidden /> Importar Excel de {area.nombre}
        </button>
      )}

      {projects.length === 0 ? (
        <EmptyState title={`${area.nombre} aún no tiene proyectos activos`} action={live && <button className="btn btn-primary" onClick={() => modals.open({ type: 'project', areaId: area.id })}>Crear proyecto</button>}>
          Registra los proyectos principales del área (no actividades).
        </EmptyState>
      ) : (
        <ul className="update-list">
          {projects.map((p) => (
            <UpdateRow key={p.id} p={p} updated={projectUpdatedThisWeek(data, p.id)} readOnly={!live} />
          ))}
        </ul>
      )}

      {live && projects.length > 0 && (
        <div className="complete-bar card">
          <label className="grow">
            <span className="field-label">Nota del área para la Weekly (opcional)</span>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Sin bloqueos nuevos; necesitamos decisión sobre…" />
          </label>
          <button className="btn btn-primary btn-lg" onClick={complete} data-testid="complete-area-update">
            <Flag size={18} aria-hidden /> {done ? 'Actualizar de nuevo' : 'Marcar actualización completada'}
          </button>
        </div>
      )}
    </div>
  );
}

function UpdateRow({ p, updated, readOnly }: { p: Project; updated: boolean; readOnly: boolean }) {
  const db = useDb();
  const services = useServices();
  const settings = useSettings();
  const modals = useModals();
  const { run, confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ estado: p.estado, responsable: p.responsable ?? '', fechaObjetivo: p.fechaObjetivo ?? '', impacto: p.impacto, urgencia: p.urgencia, dependencia: p.dependencia, comentario: '' });
  const dirty =
    d.estado !== p.estado ||
    d.responsable !== (p.responsable ?? '') ||
    d.fechaObjetivo !== (p.fechaObjetivo ?? '') ||
    d.impacto !== p.impacto ||
    d.urgencia !== p.urgencia ||
    d.dependencia !== p.dependencia ||
    !!d.comentario.trim();
  const preview = computePriority({ impacto: d.impacto, urgencia: d.urgencia, dependencia: d.dependencia, override: p.ajusteDireccion ? p.prioridadFinal : undefined });

  const save = () => {
    const r = run(
      () =>
        services.projects.update(
          p.id,
          { estado: d.estado, responsable: d.responsable || undefined, fechaObjetivo: d.fechaObjetivo || undefined, impacto: d.impacto, urgencia: d.urgencia, dependencia: d.dependencia },
          { origen: 'area', comentario: d.comentario },
        ),
      'Proyecto actualizado',
    );
    if (r) setD((x) => ({ ...x, comentario: '' }));
  };

  const closeOrArchive = async (estado: 'completado' | 'archivado') => {
    const ok = await confirm({
      title: estado === 'completado' ? 'Cerrar proyecto' : 'Archivar proyecto',
      message: `«${p.nombre}» saldrá de los proyectos activos. Su historial se conserva.`,
      confirmLabel: estado === 'completado' ? 'Cerrar' : 'Archivar',
    });
    if (ok) run(() => services.projects.setStatus(p.id, estado, { origen: 'area', comentario: d.comentario }), estado === 'completado' ? 'Proyecto cerrado' : 'Proyecto archivado');
  };

  return (
    <li className={`update-row card ${updated ? 'is-updated' : ''}`} data-testid="update-row">
      <div className="update-head">
        <PriorityBadge p={preview.prioridadFinal} override={preview.ajusteDireccion} />
        <div className="update-title">
          <strong>{p.nombre}</strong>
          <span className="small muted">
            Score {preview.score} · {personName(db.people, p.responsable)} {p.bloqueado && <BlockedChip />}
          </span>
        </div>
        {updated ? (
          <Chip tone="green" icon={<Check size={14} aria-hidden />}>
            Actualizado
          </Chip>
        ) : (
          <Chip tone="yellow">Por revisar</Chip>
        )}
        {!readOnly && (
          <div className="update-actions">
            <button className="btn btn-sm btn-secondary" onClick={() => run(() => services.projects.continue(p.id, d.comentario), 'Continúa sin cambios')} title="El proyecto sigue igual" data-testid="continue-btn">
              <Check size={15} aria-hidden /> Continuar
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />} Actualizar
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => modals.open({ type: 'block', projectId: p.id, origen: 'area' })}>
              <AlertOctagon size={15} aria-hidden /> Bloqueo
            </button>
          </div>
        )}
      </div>
      {open && !readOnly && (
        <div className="update-body">
          <div className="update-grid">
            <label>
              <span className="field-label">Estado</span>
              <select className="input" value={d.estado} onChange={(e) => setD({ ...d, estado: e.target.value as ProjectStatus })}>
                {PROJECT_STATUSES.filter((s) => s !== 'archivado' && s !== 'completado').map((s) => (
                  <option key={s} value={s}>
                    {settings.statusLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <PersonSelect label="Responsable" value={d.responsable} onValue={(v) => setD({ ...d, responsable: v })} areaHint={p.areaId} />
            <label>
              <span className="field-label">Fecha objetivo</span>
              <input className="input" type="date" value={d.fechaObjetivo} onChange={(e) => setD({ ...d, fechaObjetivo: e.target.value })} />
            </label>
            <LevelPicker label="Impacto" value={d.impacto} onChange={(v: Level) => setD({ ...d, impacto: v })} labels={IMPACT_LABELS} hints={IMPACT_HINTS} compact />
            <LevelPicker label="Urgencia" value={d.urgencia} onChange={(v: Level) => setD({ ...d, urgencia: v })} labels={URGENCY_LABELS} compact />
            <LevelPicker label="Dependencia" value={d.dependencia} onChange={(v: Level) => setD({ ...d, dependencia: v })} labels={DEPENDENCY_LABELS} compact />
            <label className="span-3">
              <span className="field-label">Comentario</span>
              <input className="input" value={d.comentario} onChange={(e) => setD({ ...d, comentario: e.target.value })} placeholder="Avance, riesgo o contexto" />
            </label>
          </div>
          <div className="row gap wrap">
            <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>
              <Save size={15} aria-hidden /> Guardar cambios
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => modals.open({ type: 'project', projectId: p.id })}>
              <Pencil size={15} aria-hidden /> Edición completa
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => closeOrArchive('completado')}>
              <CheckCircle2 size={15} aria-hidden /> Cerrar proyecto
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => closeOrArchive('archivado')}>
              <Archive size={15} aria-hidden /> Archivar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/proyectos/${p.id}`)}>
              Ver detalle
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
