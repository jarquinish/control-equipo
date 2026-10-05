import { useState, type FormEvent } from 'react';
import { addDaysISO, toISODate } from '../../domain/dates';
import { isActiveProject, isBlockOpen, sortProjectsByPriority } from '../../domain/selectors';
import { ValidationError, type FieldErrors } from '../../domain/validation';
import { useApp, useDb, useServices } from '../../state/app';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { PersonSelect, SelectInput, TextArea, TextInput } from '../../ui/forms';
import { Modal } from '../../ui/Modal';

interface Props {
  projectId?: string;
  blockId?: string;
  sessionId?: string;
  commitmentId?: string;
  onClose: () => void;
}

export function CommitmentFormModal({ projectId, blockId, sessionId, commitmentId, onClose }: Props) {
  const db = useDb();
  const { now } = useApp();
  const services = useServices();
  const { toast } = useFeedback();
  const existing = db.commitments.find((c) => c.id === commitmentId);

  const [f, setF] = useState({
    projectId: existing?.projectId ?? projectId ?? '',
    blockId: existing?.blockId ?? blockId ?? '',
    accion: existing?.accion ?? '',
    responsable: existing?.responsable ?? '',
    apoyo: existing?.apoyo ?? '',
    fecha: existing?.fecha ?? addDaysISO(toISODate(now), 2),
    hora: existing?.hora ?? '11:00',
    comentario: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const project = db.projects.find((p) => p.id === f.projectId);
  const blocks = db.blocks.filter((b) => b.projectId === f.projectId && (isBlockOpen(b) || b.id === f.blockId));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (existing) {
        services.commitments.update(existing.id, { accion: f.accion, responsable: f.responsable, apoyo: f.apoyo, blockId: f.blockId || undefined });
        toast('Compromiso actualizado');
      } else {
        services.commitments.create({ ...f, blockId: f.blockId || undefined }, { sessionId });
        toast('Compromiso creado');
      }
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors);
      else toast(friendlyError(err), 'error');
    }
  };

  return (
    <Modal
      title={existing ? 'Editar compromiso' : 'Nuevo compromiso'}
      subtitle="Toda acción debe tener responsable + fecha + hora."
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="commitment-form" className="btn btn-primary">
            {existing ? 'Guardar' : 'Crear compromiso'}
          </button>
        </>
      }
    >
      <form id="commitment-form" className="form-grid" onSubmit={submit} noValidate>
        {!projectId && !existing ? (
          <SelectInput label="Proyecto" required value={f.projectId} onValue={(v) => setF((x) => ({ ...x, projectId: v, blockId: '' }))} error={errors.projectId} className="span-2">
            <option value="">Selecciona…</option>
            {db.projects
              .filter(isActiveProject)
              .sort(sortProjectsByPriority)
              .map((p) => (
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
        {blocks.length > 0 && (
          <SelectInput label="¿Destraba un bloqueo?" value={f.blockId} onValue={(v) => set('blockId', v)} className="span-2">
            <option value="">No, es un compromiso de avance</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.descripcion}
              </option>
            ))}
          </SelectInput>
        )}
        <TextInput label="Acción" required value={f.accion} onValue={(v) => set('accion', v)} error={errors.accion} className="span-2" placeholder="Verbo + entregable concreto" data-autofocus />
        <PersonSelect label="Responsable" required value={f.responsable} onValue={(v) => set('responsable', v)} error={errors.responsable} areaHint={project?.areaId} />
        <TextInput label="Apoyo" value={f.apoyo} onValue={(v) => set('apoyo', v)} placeholder="Persona o área que ayuda" />
        {!existing ? (
          <>
            <TextInput label="Fecha" required type="date" value={f.fecha} onValue={(v) => set('fecha', v)} error={errors.fecha} />
            <TextInput label="Hora" required type="time" value={f.hora} onValue={(v) => set('hora', v)} error={errors.hora} />
            <TextArea label="Comentario" value={f.comentario} onValue={(v) => set('comentario', v)} className="span-2" />
          </>
        ) : (
          <p className="span-2 small muted">Para cambiar fecha u hora usa «Reprogramar»: así se conserva la fecha original y el motivo.</p>
        )}
      </form>
    </Modal>
  );
}
