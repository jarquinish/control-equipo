import { useState, type FormEvent } from 'react';
import { DEPENDENCY_LABELS, IMPACT_HINTS, IMPACT_LABELS, PROJECT_STATUSES, QUADRANT_LABELS, QUADRANTS, URGENCY_LABELS } from '../../domain/constants';
import { toISODate } from '../../domain/dates';
import { can } from '../../domain/permissions';
import { classifyContext, classifyProject } from '../../domain/priority';
import { computePriority, suggestQuadrant } from '../../domain/scoring';
import type { Level, Project, ProjectStatus, Quadrant, UpdateOrigin } from '../../domain/types';
import { ValidationError, type FieldErrors } from '../../domain/validation';
import { useApp, useCurrentUser, useDb, useServices, useSettings } from '../../state/app';
import { navigate } from '../../state/router';
import { AxisBadge, ClassBadge, LockBadge } from '../../ui/badges';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { AreaSelect, DependencySelect, LevelPicker, PersonSelect, SelectInput, TextArea, TextInput } from '../../ui/forms';
import { Modal } from '../../ui/Modal';

interface Props {
  projectId?: string;
  areaId?: string;
  origen?: UpdateOrigin;
  onClose: () => void;
}

export function ProjectFormModal({ projectId, areaId, origen, onClose }: Props) {
  const db = useDb();
  const services = useServices();
  const settings = useSettings();
  const { toast, confirm } = useFeedback();
  const { now } = useApp();
  const user = useCurrentUser();
  const existing = db.projects.find((p) => p.id === projectId);
  const locked = !!existing?.acuerdo?.bloqueado && !can(user, 'project.override');

  const [f, setF] = useState({
    nombre: existing?.nombre ?? '',
    descripcion: existing?.descripcion ?? '',
    areaId: existing?.areaId ?? areaId ?? '',
    responsable: existing?.responsable ?? '',
    fechaObjetivo: existing?.fechaObjetivo ?? '',
    impacto: (existing?.impacto ?? 2) as Level,
    urgencia: (existing?.urgencia ?? 2) as Level,
    dependencia: (existing?.dependencia ?? 1) as Level,
    eisenhower: (existing?.eisenhower ?? '') as Quadrant | '',
    estado: (existing?.estado ?? 'en_curso') as ProjectStatus,
    dependeDe: existing?.dependeDe ?? '',
    solicitante: existing?.solicitante ?? '',
    frente: existing?.frente ?? '',
    comentario: '',
    bloqueado: false,
    bDesc: '',
    bNecesidad: '',
    bDepende: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const scoring = computePriority({ impacto: f.impacto, urgencia: f.urgencia, dependencia: f.dependencia });
  const suggested = suggestQuadrant(f.impacto, f.urgencia);
  // Vista previa de la clasificación con los datos del formulario (Dirección prevalece).
  const draft = { ...(existing ?? { id: '', createdAt: now.toISOString(), bloqueado: false }), nombre: f.nombre, areaId: f.areaId, impacto: f.impacto, urgencia: f.urgencia, dependencia: f.dependencia, fechaObjetivo: f.fechaObjetivo || undefined, solicitante: f.solicitante || undefined, frente: f.frente || undefined } as Project;
  const preview = f.areaId ? classifyProject(draft, classifyContext(db, draft, toISODate(now), settings.priorityMatrix!, settings.criteria.umbralOperativoP1, settings.criteria.umbralOperativoP2)) : undefined;
  const solicitantes = [...(settings.priorityMatrix?.iniciativas ?? []).filter((i) => i.tipo === 'solicitante').map((i) => i.nombre), 'Dirección de Posicionamiento', ...db.areas.map((a) => a.nombre)];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: FieldErrors = {};
    if (f.bloqueado && !f.bDesc.trim()) errs.bDesc = 'Explica qué está bloqueando el proyecto.';
    if (Object.keys(errs).length) return setErrors(errs);
    try {
      const input = {
        nombre: f.nombre,
        descripcion: f.descripcion,
        areaId: f.areaId,
        responsable: f.responsable || undefined,
        fechaObjetivo: f.fechaObjetivo || undefined,
        impacto: f.impacto,
        urgencia: f.urgencia,
        dependencia: f.dependencia,
        eisenhower: (f.eisenhower || suggested) as Quadrant,
        estado: f.estado,
        dependeDe: f.dependeDe || undefined,
        solicitante: f.solicitante,
        frente: f.frente,
      };
      const opts = { origen: origen ?? 'area', comentario: f.comentario };
      const p = services.ctx.store.batch(() => {
        const saved = existing ? services.projects.update(existing.id, input, opts) : services.projects.create(input, opts);
        if (f.bloqueado) {
          services.blocks.create({ projectId: saved.id, descripcion: f.bDesc, necesidad: f.bNecesidad, areaDependencia: f.bDepende || f.dependeDe || undefined }, opts.origen);
        }
        if (existing && existing.estado !== f.estado && (f.estado === 'completado' || f.estado === 'archivado')) {
          services.projects.setStatus(saved.id, f.estado, opts);
        }
        return saved;
      });
      toast(existing ? 'Proyecto actualizado' : 'Proyecto creado');
      onClose();
      if (f.bloqueado) toast('Bloqueo registrado. Define una acción para destrabarlo.', 'info');
      if (!existing) navigate(`/proyectos/${p.id}`);
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors);
      else toast(friendlyError(err), 'error');
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: 'Eliminar proyecto',
      message: (
        <>
          <p>Se eliminará <strong>{existing.nombre}</strong> con sus bloqueos y compromisos.</p>
          <p>El historial de semanas cerradas se conserva. Si sólo quieres sacarlo del foco, usa <strong>Archivar</strong>.</p>
        </>
      ),
      confirmLabel: 'Eliminar definitivamente',
      danger: true,
    });
    if (!ok) return;
    services.projects.remove(existing.id);
    toast('Proyecto eliminado');
    onClose();
    navigate('/proyectos');
  };

  return (
    <Modal
      title={existing ? 'Editar proyecto' : 'Nuevo proyecto'}
      subtitle={existing ? existing.nombre : 'Trabajamos sobre proyectos, no actividades.'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {existing && (
            <button type="button" className="btn btn-ghost-danger mr-auto" onClick={remove}>
              Eliminar
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="project-form" className="btn btn-primary">
            {existing ? 'Guardar cambios' : 'Crear proyecto'}
          </button>
        </>
      }
    >
      <form id="project-form" className="form-grid" onSubmit={submit} noValidate>
        <TextInput label="Nombre" required value={f.nombre} onValue={(v) => set('nombre', v)} error={errors.nombre} placeholder="Ej. Campaña Convención" data-autofocus maxLength={120} className="span-2" />
        <TextArea label="Descripción breve" value={f.descripcion} onValue={(v) => set('descripcion', v)} className="span-2" placeholder="¿Qué resultado entrega este proyecto?" />
        <AreaSelect label="Área" required value={f.areaId} onValue={(v) => set('areaId', v)} error={errors.areaId} />
        <PersonSelect label="Responsable" value={f.responsable} onValue={(v) => set('responsable', v)} areaHint={f.areaId} />
        <TextInput label="Fecha objetivo" type="date" value={f.fechaObjetivo} onValue={(v) => set('fechaObjetivo', v)} error={errors.fechaObjetivo} />
        <SelectInput label="Estado" value={f.estado} onValue={(v) => set('estado', v as ProjectStatus)}>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {settings.statusLabels[s]}
            </option>
          ))}
        </SelectInput>

        <TextInput label="Solicitante" value={f.solicitante} onValue={(v) => set('solicitante', v)} list="solicitantes-list" placeholder="Quién pide el trabajo (Brokers, Dirección Comercial…)" disabled={locked} />
        <datalist id="solicitantes-list">
          {[...new Set(solicitantes)].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <TextInput label="Frente / proyecto padre" value={f.frente} onValue={(v) => set('frente', v)} placeholder="Ej. Convención SOC 2026" disabled={locked} />

        <div className="span-2 scoring-box">
          {locked && (
            <p className="small muted">
              <LockBadge /> Acuerdo de prioridad cerrado: sólo Dirección cambia impacto, urgencia, dependencia, solicitante y frente.
            </p>
          )}
          <div className="scoring-pickers">
            <LevelPicker label="Impacto" value={f.impacto} onChange={(v) => set('impacto', v)} labels={IMPACT_LABELS} hints={IMPACT_HINTS} disabled={locked} />
            <LevelPicker label="Urgencia" value={f.urgencia} onChange={(v) => set('urgencia', v)} labels={URGENCY_LABELS} disabled={locked} />
            <LevelPicker label="Dependencia" value={f.dependencia} onChange={(v) => set('dependencia', v)} labels={DEPENDENCY_LABELS} disabled={locked} />
          </div>
          <div className="scoring-result" aria-live="polite">
            <span className="muted">Score</span>
            <strong className="score-num" data-testid="score-preview">{scoring.score}</strong>
            {preview && (
              <span className="row gap wrap" data-testid="clasif-preview">
                <ClassBadge c={preview.integrada} size="lg" />
                <AxisBadge eje="estrategica" p={preview.estrategica} direccion={preview.fuenteEstrategica === 'direccion'} />
                <AxisBadge eje="operativa" p={preview.operativa} direccion={preview.fuenteOperativa === 'direccion'} />
              </span>
            )}
          </div>
          {preview && (
            <p className="small muted span-2">
              {preview.motivoEstrategica} {preview.motivoOperativa}
            </p>
          )}
        </div>

        <SelectInput
          label="Eisenhower"
          value={f.eisenhower}
          onValue={(v) => set('eisenhower', v as Quadrant)}
          hint="¿Es realmente prioritario o simplemente llegó con urgencia?"
        >
          <option value="">Sugerido: {QUADRANT_LABELS[suggested]}</option>
          {QUADRANTS.map((q) => (
            <option key={q} value={q}>
              {QUADRANT_LABELS[q]}
            </option>
          ))}
        </SelectInput>
        <DependencySelect label="¿De quién depende?" value={f.dependeDe} onValue={(v) => set('dependeDe', v)} excludeAreaId={f.areaId} />

        {!existing?.bloqueado && (
          <div className="span-2">
            <label className="check">
              <input type="checkbox" checked={f.bloqueado} onChange={(e) => set('bloqueado', e.target.checked)} />
              <span>¿Está bloqueado?</span>
            </label>
            {f.bloqueado && (
              <div className="form-grid nested">
                <TextInput label="¿Qué está bloqueando el proyecto?" required value={f.bDesc} onValue={(v) => set('bDesc', v)} error={errors.bDesc} className="span-2" />
                <TextInput label="¿Qué necesitamos para avanzar?" value={f.bNecesidad} onValue={(v) => set('bNecesidad', v)} />
                <DependencySelect label="¿De quién depende el desbloqueo?" value={f.bDepende} onValue={(v) => set('bDepende', v)} excludeAreaId={f.areaId} />
              </div>
            )}
          </div>
        )}
        {existing && <TextArea label="Comentario de la semana" value={f.comentario} onValue={(v) => set('comentario', v)} className="span-2" placeholder="Avance, riesgo o contexto para la Weekly" />}
      </form>
    </Modal>
  );
}
