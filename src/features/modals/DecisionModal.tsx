import { useState, type FormEvent } from 'react';
import { isActiveProject, sortProjectsByPriority } from '../../domain/selectors';
import { ValidationError, type FieldErrors } from '../../domain/validation';
import { useDb, useServices } from '../../state/app';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { PersonSelect, SelectInput, TextArea } from '../../ui/forms';
import { Modal } from '../../ui/Modal';

export function DecisionModal({ projectId, sessionId, onClose }: { projectId?: string; sessionId?: string; onClose: () => void }) {
  const db = useDb();
  const services = useServices();
  const { toast } = useFeedback();
  const [f, setF] = useState({ projectId: projectId ?? '', descripcion: '', responsable: '' });
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      services.sessions.addDecision(sessionId, f);
      toast('Decisión registrada');
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors);
      else toast(friendlyError(err), 'error');
    }
  };

  return (
    <Modal
      title="? Registrar decisión"
      subtitle="Decisiones concretas, no minuta."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="dec-form" className="btn btn-primary">
            Registrar decisión
          </button>
        </>
      }
    >
      <form id="dec-form" className="form-grid" onSubmit={submit} noValidate>
        <SelectInput label="Proyecto" value={f.projectId} onValue={(v) => setF({ ...f, projectId: v })} className="span-2">
          <option value="">Tema general</option>
          {db.projects
            .filter(isActiveProject)
            .sort(sortProjectsByPriority)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.prioridadFinal} · {p.nombre}
              </option>
            ))}
        </SelectInput>
        <TextArea label="Decisión" required value={f.descripcion} onValue={(v) => setF({ ...f, descripcion: v })} error={errors.descripcion} className="span-2" data-autofocus />
        <PersonSelect label="Responsable de ejecutarla" value={f.responsable} onValue={(v) => setF({ ...f, responsable: v })} />
      </form>
    </Modal>
  );
}
