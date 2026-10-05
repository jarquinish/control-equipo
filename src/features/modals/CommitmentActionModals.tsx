import { useState, type FormEvent } from 'react';
import { fmtDate, fmtDateTime } from '../../domain/dates';
import { isBlockOpen, personName } from '../../domain/selectors';
import { ValidationError, type FieldErrors } from '../../domain/validation';
import { useDb, useServices, useSettings } from '../../state/app';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { TextArea, TextInput } from '../../ui/forms';
import { Modal } from '../../ui/Modal';

interface Base {
  commitmentId: string;
  sessionId?: string;
  onClose: () => void;
}

function useCommitment(id: string) {
  const db = useDb();
  const c = db.commitments.find((x) => x.id === id);
  const project = db.projects.find((p) => p.id === c?.projectId);
  return { db, c, project };
}

function Footer({ onClose, label, form, danger }: { onClose: () => void; label: string; form: string; danger?: boolean }) {
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        Cancelar
      </button>
      <button type="submit" form={form} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>
        {label}
      </button>
    </>
  );
}

export function RescheduleModal({ commitmentId, sessionId, onClose }: Base) {
  const { c, project } = useCommitment(commitmentId);
  const services = useServices();
  const { toast } = useFeedback();
  const [f, setF] = useState({ fecha: c?.fecha ?? '', hora: c?.hora ?? '', motivo: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  if (!c) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      services.commitments.reschedule(c.id, f, { sessionId });
      toast('Compromiso reprogramado');
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors);
      else toast(friendlyError(err), 'error');
    }
  };

  return (
    <Modal title="↻ Reprogramar compromiso" subtitle={`${project?.nombre ?? ''} · ${c.accion}`} onClose={onClose} footer={<Footer onClose={onClose} label="Reprogramar" form="resched-form" />}>
      <form id="resched-form" className="form-grid" onSubmit={submit} noValidate>
        <p className="span-2 small muted">
          Original: <strong>{fmtDate(c.fechaOriginal)} {c.horaOriginal}</strong> · Actual: <strong>{fmtDate(c.fecha)} {c.hora}</strong> · Reprogramaciones: <strong>{c.reprogramaciones}</strong>
        </p>
        <TextInput label="Nueva fecha" type="date" required value={f.fecha} onValue={(v) => setF({ ...f, fecha: v })} error={errors.fecha} data-autofocus />
        <TextInput label="Nueva hora" type="time" required value={f.hora} onValue={(v) => setF({ ...f, hora: v })} error={errors.hora} />
        <TextArea label="Motivo" required value={f.motivo} onValue={(v) => setF({ ...f, motivo: v })} error={errors.motivo} className="span-2" placeholder="¿Qué cambió? (sin buscar culpables)" />
      </form>
    </Modal>
  );
}

export function EscalateModal({ commitmentId, sessionId, onClose }: Base) {
  const { c, project } = useCommitment(commitmentId);
  const services = useServices();
  const settings = useSettings();
  const { toast } = useFeedback();
  const [f, setF] = useState({ escaladoA: 'Dirección General', comentario: '' });
  if (!c) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      services.commitments.escalate(c.id, f.escaladoA, { sessionId, comentario: f.comentario });
      toast('Compromiso escalado');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  return (
    <Modal title="↑ Escalar" subtitle={`${project?.nombre ?? ''} · ${c.accion}`} onClose={onClose} footer={<Footer onClose={onClose} label="Escalar" form="esc-form" />}>
      <form id="esc-form" className="form-grid" onSubmit={submit} noValidate>
        <TextInput label="¿A quién se escala?" value={f.escaladoA} onValue={(v) => setF({ ...f, escaladoA: v })} list="escalate-targets" className="span-2" data-autofocus />
        <datalist id="escalate-targets">
          {['Dirección de Posicionamiento', ...settings.externalDependencies].map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <TextArea label="¿Qué se necesita de quien recibe el escalamiento?" value={f.comentario} onValue={(v) => setF({ ...f, comentario: v })} className="span-2" />
      </form>
    </Modal>
  );
}

export function EscalateBlockModal({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const db = useDb();
  const b = db.blocks.find((x) => x.id === blockId);
  const services = useServices();
  const settings = useSettings();
  const { toast } = useFeedback();
  const [to, setTo] = useState(b?.escaladoA ?? 'Dirección General');
  if (!b) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      services.blocks.escalate(b.id, to);
      toast('Bloqueo escalado');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };
  return (
    <Modal title="↑ Escalar bloqueo" subtitle={b.descripcion} onClose={onClose} size="sm" footer={<Footer onClose={onClose} label="Escalar" form="escb-form" />}>
      <form id="escb-form" onSubmit={submit} noValidate>
        <TextInput label="¿A quién se escala?" value={to} onValue={setTo} list="escb-targets" data-autofocus />
        <datalist id="escb-targets">
          {['Dirección de Posicionamiento', ...settings.externalDependencies].map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </form>
    </Modal>
  );
}

export function CommentModal({ commitmentId, onClose }: Base) {
  const { db, c, project } = useCommitment(commitmentId);
  const services = useServices();
  const { toast } = useFeedback();
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string>();
  if (!c) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      services.commitments.addComment(c.id, texto);
      setTexto('');
      setError(undefined);
      toast('Comentario agregado');
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : friendlyError(err));
    }
  };

  return (
    <Modal title="Comentarios" subtitle={`${project?.nombre ?? ''} · ${c.accion}`} onClose={onClose} footer={<Footer onClose={onClose} label="Agregar comentario" form="cmt-form" />}>
      <ul className="timeline">
        {c.historial.map((h, i) => (
          <li key={i}>
            <span className="tl-date">{fmtDateTime(h.fecha)}</span>
            <span className="tl-type">{h.tipo}</span>
            {h.detalle && <span className="tl-detail">{h.detalle}</span>}
            {h.autor && <span className="tl-author">· {personName(db.people, h.autor, '')}</span>}
          </li>
        ))}
      </ul>
      <form id="cmt-form" onSubmit={submit} noValidate>
        <TextArea label="Nuevo comentario" value={texto} onValue={setTexto} error={error} data-autofocus />
      </form>
    </Modal>
  );
}

export function CompleteModal({ commitmentId, sessionId, onClose }: Base) {
  const { db, c, project } = useCommitment(commitmentId);
  const services = useServices();
  const { toast } = useFeedback();
  const [comentario, setComentario] = useState('');
  if (!c) return null;
  const block = db.blocks.find((b) => b.id === c.blockId && isBlockOpen(b));

  const done = (resolveBlock: boolean) => {
    try {
      services.commitments.complete(c.id, { sessionId, resolveBlock, comentario });
      toast(resolveBlock ? 'Compromiso cumplido y bloqueo resuelto' : 'Compromiso cumplido');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  return (
    <Modal
      title="✓ Compromiso cumplido"
      subtitle={`${project?.nombre ?? ''} · ${c.accion}`}
      onClose={onClose}
      size="sm"
      footer={
        block ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => done(false)}>
              No, sigue bloqueado
            </button>
            <button type="button" className="btn btn-primary" data-autofocus onClick={() => done(true)}>
              Sí, resolver bloqueo
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" data-autofocus onClick={() => done(false)}>
              Marcar cumplido
            </button>
          </>
        )
      }
    >
      {block && (
        <p>
          ¿El bloqueo <strong>«{block.descripcion}»</strong> quedó resuelto?
        </p>
      )}
      <TextArea label="Comentario (opcional)" value={comentario} onValue={setComentario} />
    </Modal>
  );
}

export function FailModal({ commitmentId, sessionId, onClose }: Base) {
  const { c, project } = useCommitment(commitmentId);
  const services = useServices();
  const { toast } = useFeedback();
  const [comentario, setComentario] = useState('');
  if (!c) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      services.commitments.fail(c.id, { sessionId, comentario });
      toast('Compromiso marcado como incumplido', 'info');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };
  return (
    <Modal title="✕ Incumplido" subtitle={`${project?.nombre ?? ''} · ${c.accion}`} onClose={onClose} size="sm" footer={<Footer onClose={onClose} label="Marcar incumplido" form="fail-form" danger />}>
      <form id="fail-form" onSubmit={submit} noValidate>
        <p className="small muted">No buscamos culpables: registra qué impidió cumplirlo para destrabarlo.</p>
        <TextArea label="¿Qué lo impidió?" value={comentario} onValue={setComentario} data-autofocus />
      </form>
    </Modal>
  );
}
