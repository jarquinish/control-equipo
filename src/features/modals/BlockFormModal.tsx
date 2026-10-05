import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { addDaysISO, toISODate } from '../../domain/dates';
import { blockIsManaged, isActiveProject, sortProjectsByPriority } from '../../domain/selectors';
import type { UpdateOrigin } from '../../domain/types';
import { ValidationError, validateBlock, validateCommitment, type FieldErrors } from '../../domain/validation';
import { useApp, useDb, useServices } from '../../state/app';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { DependencySelect, PersonSelect, SelectInput, TextArea, TextInput } from '../../ui/forms';
import { Modal } from '../../ui/Modal';

interface Props {
  projectId?: string;
  blockId?: string;
  sessionId?: string;
  origen?: UpdateOrigin;
  onClose: () => void;
}

/**
 * DESTRABAR Y COMPROMETER: las 5 preguntas del bloqueo + el compromiso
 * (acción + responsable + apoyo + fecha + hora).
 */
export function BlockFormModal({ projectId, blockId, sessionId, origen, onClose }: Props) {
  const db = useDb();
  const { now } = useApp();
  const services = useServices();
  const { toast } = useFeedback();
  const existing = db.blocks.find((b) => b.id === blockId);
  const managed = existing ? blockIsManaged(existing, db.commitments) : false;

  const [f, setF] = useState({
    projectId: existing?.projectId ?? projectId ?? '',
    descripcion: existing?.descripcion ?? '',
    necesidad: existing?.necesidad ?? '',
    areaDependencia: existing?.areaDependencia ?? '',
    dependeDe: existing?.dependeDe ?? '',
    quienPuedeAyudar: existing?.quienPuedeAyudar ?? '',
    responsableGestion: existing?.responsableGestion ?? '',
    withCommitment: !managed,
    accion: '',
    responsable: '',
    apoyo: '',
    fecha: addDaysISO(toISODate(now), 2),
    hora: '11:00',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const project = db.projects.find((p) => p.id === f.projectId);
  const projects = db.projects.filter(isActiveProject).sort(sortProjectsByPriority);
  const commitmentTouched = !!(f.accion || f.responsable);
  const commitmentComplete = !!(f.accion.trim() && f.responsable && f.fecha && f.hora);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: FieldErrors = { ...validateBlock(f) };
    if (f.withCommitment && commitmentTouched) Object.assign(errs, validateCommitment({ ...f, projectId: f.projectId || 'x' }));
    if (Object.keys(errs).length) return setErrors(errs);
    try {
      const o = origen ?? (sessionId ? 'junta' : 'area');
      services.ctx.store.batch(() => {
        const block = existing
          ? services.blocks.update(existing.id, f)
          : services.blocks.create({ ...f, responsableGestion: f.responsableGestion || undefined }, o);
        if (f.withCommitment && commitmentComplete) {
          services.commitments.create(
            { projectId: f.projectId, blockId: block.id, accion: f.accion, responsable: f.responsable, apoyo: f.apoyo, fecha: f.fecha, hora: f.hora },
            { sessionId },
          );
        }
      });
      toast(f.withCommitment && commitmentComplete ? 'Bloqueo gestionado con compromiso' : existing ? 'Bloqueo actualizado' : 'Bloqueo registrado');
      if (!managed && !(f.withCommitment && commitmentComplete)) toast('⚠ Bloqueo sin compromiso: define acción, responsable, fecha y hora.', 'info');
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors);
      else toast(friendlyError(err), 'error');
    }
  };

  return (
    <Modal
      title={existing ? 'Destrabar bloqueo' : 'Registrar bloqueo'}
      subtitle="Un bloqueo no identifica culpables; identifica dónde necesita ayuda el proyecto."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="block-form" className="btn btn-primary">
            {f.withCommitment && commitmentComplete ? 'Guardar y comprometer' : 'Guardar bloqueo'}
          </button>
        </>
      }
    >
      <form id="block-form" className="form-grid" onSubmit={submit} noValidate>
        {!projectId && !existing ? (
          <SelectInput label="Proyecto" required value={f.projectId} onValue={(v) => set('projectId', v)} error={errors.projectId} className="span-2">
            <option value="">Selecciona…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prioridadFinal} · {p.nombre}
              </option>
            ))}
          </SelectInput>
        ) : (
          <p className="span-2 block-project">
            <span className="muted">Proyecto</span> <strong>{project?.nombre}</strong>
          </p>
        )}
        <TextArea label="¿Qué está bloqueando el proyecto?" required value={f.descripcion} onValue={(v) => set('descripcion', v)} error={errors.descripcion} className="span-2" data-autofocus />
        <TextInput label="¿Qué necesitamos para avanzar?" value={f.necesidad} onValue={(v) => set('necesidad', v)} placeholder="Ej. KV final, presupuesto aprobado" className="span-2" />
        <DependencySelect label="¿De quién depende? (área)" value={f.areaDependencia} onValue={(v) => set('areaDependencia', v)} excludeAreaId={project?.areaId} />
        <TextInput label="¿De quién depende? (persona / rol)" value={f.dependeDe} onValue={(v) => set('dependeDe', v)} placeholder="Ej. Dirección Comercial" />
        <TextInput label="¿Quién puede ayudar?" value={f.quienPuedeAyudar} onValue={(v) => set('quienPuedeAyudar', v)} />
        <PersonSelect label="¿Quién gestionará el desbloqueo?" value={f.responsableGestion} onValue={(v) => set('responsableGestion', v)} areaHint={project?.areaId} />

        <div className="span-2 commit-box">
          <div className="commit-box-head">
            <h3>Compromiso para destrabar</h3>
            {managed ? (
              <span className="chip chip-green"><CheckCircle2 size={14} aria-hidden /> Ya tiene compromiso</span>
            ) : commitmentComplete ? (
              <span className="chip chip-green"><CheckCircle2 size={14} aria-hidden /> Completo</span>
            ) : (
              <span className="chip chip-red"><AlertTriangle size={14} aria-hidden /> Bloqueo sin compromiso</span>
            )}
          </div>
          <p className="small muted">Todo bloqueo debe terminar en una acción con responsable + fecha + hora.</p>
          {managed && (
            <label className="check">
              <input type="checkbox" checked={f.withCommitment} onChange={(e) => set('withCommitment', e.target.checked)} />
              <span>Agregar otro compromiso</span>
            </label>
          )}
          {f.withCommitment && (
            <div className="form-grid nested">
              <TextInput label="Acción" required value={f.accion} onValue={(v) => set('accion', v)} error={errors.accion} className="span-2" placeholder="Verbo + entregable concreto" />
              <PersonSelect label="Responsable" required value={f.responsable} onValue={(v) => set('responsable', v)} error={errors.responsable} areaHint={project?.areaId} />
              <TextInput label="Apoyo" value={f.apoyo} onValue={(v) => set('apoyo', v)} placeholder="Persona o área que ayuda" />
              <TextInput label="Fecha" required type="date" value={f.fecha} onValue={(v) => set('fecha', v)} error={errors.fecha} />
              <TextInput label="Hora" required type="time" value={f.hora} onValue={(v) => set('hora', v)} error={errors.hora} />
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
