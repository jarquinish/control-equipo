import { useState, type FormEvent } from 'react';
import { PRIORITIES } from '../../domain/constants';
import { can } from '../../domain/permissions';
import { isActiveProject, sortProjectsByPriority } from '../../domain/selectors';
import type { Priority, UpdateOrigin } from '../../domain/types';
import { useCurrentUser, useDb, useServices, useSettings } from '../../state/app';
import { PriorityBadge } from '../../ui/badges';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { TextInput } from '../../ui/forms';
import { Modal } from '../../ui/Modal';

/** Ajuste de prioridad por Dirección + regla 8 (¿qué prioridad desplaza?). */
export function OverrideModal({ projectId, sessionId, origen, onClose }: { projectId: string; sessionId?: string; origen?: UpdateOrigin; onClose: () => void }) {
  const db = useDb();
  const settings = useSettings();
  const user = useCurrentUser();
  const services = useServices();
  const { toast } = useFeedback();
  const p = db.projects.find((x) => x.id === projectId);
  const [choice, setChoice] = useState<Priority | 'auto'>(p?.ajusteDireccion ? p.prioridadFinal : 'auto');
  const [motivo, setMotivo] = useState(p?.motivoAjuste ?? '');
  const [displace, setDisplace] = useState<string>('');
  if (!p) return null;

  const allowed = can(user, 'project.override');
  const otherP1 = db.projects.filter((x) => x.id !== p.id && isActiveProject(x) && x.prioridadFinal === 'P1').sort(sortProjectsByPriority);
  const finalPriority = choice === 'auto' ? p.prioridadCalculada : choice;
  const becomesP1 = finalPriority === 'P1' && p.prioridadFinal !== 'P1';
  const overLimit = becomesP1 && otherP1.length >= settings.criteria.maxP1;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      services.ctx.store.batch(() => {
        services.projects.setOverride(p.id, choice === 'auto' ? null : choice, motivo, { origen: origen ?? (sessionId ? 'junta' : 'area') });
        if (becomesP1 && displace) services.sessions.displace(sessionId, p.id, displace);
      });
      toast(displace ? 'Prioridad ajustada y desplazamiento registrado' : 'Prioridad ajustada');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  return (
    <Modal
      title="Ajuste de Dirección"
      subtitle={p.nombre}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="ovr-form" className="btn btn-primary" disabled={!allowed}>
            Aplicar
          </button>
        </>
      }
    >
      {!allowed && <p className="alert alert-yellow">Sólo Dirección o Administración pueden ajustar prioridades. Cambia de usuario en la barra superior.</p>}
      <form id="ovr-form" onSubmit={submit} noValidate>
        <p className="small muted">
          Score {p.score} → prioridad calculada <PriorityBadge p={p.prioridadCalculada} />
        </p>
        <fieldset className="radio-cards">
          <legend className="field-label">Prioridad final</legend>
          <label className={`radio-card ${choice === 'auto' ? 'on' : ''}`}>
            <input type="radio" name="ovr" checked={choice === 'auto'} onChange={() => setChoice('auto')} />
            Calculada ({p.prioridadCalculada})
          </label>
          {PRIORITIES.map((x) => (
            <label key={x} className={`radio-card ${choice === x ? 'on' : ''}`}>
              <input type="radio" name="ovr" checked={choice === x} onChange={() => setChoice(x)} />
              <PriorityBadge p={x} />
            </label>
          ))}
        </fieldset>
        {choice !== 'auto' && choice !== p.prioridadCalculada && <TextInput label="Motivo (opcional)" value={motivo} onValue={setMotivo} placeholder="Ej. Compromiso con Dirección General" />}

        {becomesP1 && otherP1.length > 0 && (
          <div className={`displace ${overLimit ? 'warn' : ''}`}>
            <p className="displace-q">
              <strong>Regla 8 · ¿Qué prioridad desplaza?</strong>
              <br />
              {overLimit
                ? `Ya hay ${otherP1.length} proyectos P1 (máximo recomendado: ${settings.criteria.maxP1}). No todo puede ser P1.`
                : 'Si aparece una nueva prioridad crítica, debemos identificar qué prioridad desplaza.'}
            </p>
            <div className="displace-list" role="radiogroup" aria-label="Proyecto desplazado">
              <label className={`radio-row ${displace === '' ? 'on' : ''}`}>
                <input type="radio" name="disp" checked={displace === ''} onChange={() => setDisplace('')} />
                No desplazar (convive como P1 adicional)
              </label>
              {otherP1.map((o) => (
                <label key={o.id} className={`radio-row ${displace === o.id ? 'on' : ''}`}>
                  <input type="radio" name="disp" checked={displace === o.id} onChange={() => setDisplace(o.id)} />
                  <span>
                    Bajar a P2: <strong>{o.nombre}</strong> <span className="muted">· score {o.score}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
