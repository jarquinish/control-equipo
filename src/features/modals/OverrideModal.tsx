import { useState, type FormEvent } from 'react';
import { PRIORITIES } from '../../domain/constants';
import { can } from '../../domain/permissions';
import { isActiveProject, sortProjectsByPriority } from '../../domain/selectors';
import type { Priority, PriorityAxis, UpdateOrigin } from '../../domain/types';
import { useCurrentUser, useDb, useServices, useSettings } from '../../state/app';
import { AxisBadge, ClassBadge } from '../../ui/badges';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { Modal } from '../../ui/Modal';

type Choice = Priority | 'auto';

const AXES: { eje: PriorityAxis; titulo: string }[] = [
  { eje: 'estrategica', titulo: 'Prioridad estratégica' },
  { eje: 'operativa', titulo: 'Prioridad operativa (urgente)' },
];

/**
 * Validación directiva: Dirección fija la prioridad estratégica y/o operativa
 * (prevalece sobre el cálculo), con motivo obligatorio y registro en bitácora.
 * Regla 8: si un nuevo P1 supera el máximo de la gerencia, ¿qué prioridad desplaza?
 */
export function OverrideModal({ projectId, sessionId, origen, onClose }: { projectId: string; sessionId?: string; origen?: UpdateOrigin; onClose: () => void }) {
  const db = useDb();
  const settings = useSettings();
  const user = useCurrentUser();
  const services = useServices();
  const { toast } = useFeedback();
  const p = db.projects.find((x) => x.id === projectId);
  const dir = p?.prioridadDireccion ?? {};
  const [choice, setChoice] = useState<Record<PriorityAxis, Choice>>({ estrategica: dir.estrategica ?? 'auto', operativa: dir.operativa ?? 'auto' });
  const [motivo, setMotivo] = useState<Record<PriorityAxis, string>>({ estrategica: dir.motivoEstrategica ?? '', operativa: dir.motivoOperativa ?? '' });
  const [displace, setDisplace] = useState<Record<PriorityAxis, string>>({ estrategica: '', operativa: '' });
  const [error, setError] = useState('');
  if (!p) return null;
  const c = p.clasif;
  const allowed = can(user, 'project.override');
  const area = db.areas.find((a) => a.id === p.areaId);

  const calc = (eje: PriorityAxis) => (eje === 'estrategica' ? c?.estrategicaCalc : c?.operativaCalc) ?? p.prioridadCalculada;
  const current = (eje: PriorityAxis): Choice => (eje === 'estrategica' ? dir.estrategica : dir.operativa) ?? 'auto';
  const changed = (eje: PriorityAxis) => choice[eje] !== current(eje);
  const finalOf = (eje: PriorityAxis) => (choice[eje] === 'auto' ? calc(eje) : choice[eje]) as Priority;
  const others = (eje: PriorityAxis) =>
    db.projects
      .filter((x) => x.id !== p.id && x.areaId === p.areaId && isActiveProject(x) && x.clasif?.[eje] === 'P1')
      .sort(sortProjectsByPriority);
  const max = (eje: PriorityAxis) => (eje === 'estrategica' ? settings.criteria.maxP1EstrategicosPorArea : settings.criteria.maxP1UrgentesPorArea);
  const becomesP1 = (eje: PriorityAxis) => finalOf(eje) === 'P1' && c?.[eje] !== 'P1';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const pending = AXES.filter(({ eje }) => changed(eje));
    if (!pending.length) return onClose();
    const sinMotivo = pending.find(({ eje }) => !motivo[eje].trim());
    if (sinMotivo) return setError(`Escribe el motivo del cambio de la ${sinMotivo.titulo.toLowerCase()}.`);
    try {
      services.ctx.store.batch(() => {
        for (const { eje } of pending) {
          const valor = choice[eje] === 'auto' ? null : (choice[eje] as Priority);
          services.priority.setDirective(p.id, eje, valor, motivo[eje], sessionId ? 'junta' : 'pantalla');
          if (becomesP1(eje) && displace[eje]) services.priority.displace(p.id, displace[eje], eje, sessionId);
        }
      });
      toast('Prioridad validada por Dirección');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
    void origen;
  };

  return (
    <Modal
      title="Validación directiva"
      subtitle={`${p.nombre} · ${area?.nombre ?? ''}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="ovr-form" className="btn btn-primary" disabled={!allowed}>
            Validar prioridad
          </button>
        </>
      }
    >
      {!allowed && <p className="alert alert-yellow">Sólo Dirección o Administración pueden validar prioridades.</p>}
      <form id="ovr-form" onSubmit={submit} noValidate className="directive-form">
        {c && (
          <p className="small muted">
            Clasificación actual <ClassBadge c={c.integrada} /> · lo que fije Dirección prevalece sobre el cálculo y queda en la bitácora.
          </p>
        )}
        {AXES.map(({ eje, titulo }) => {
          const list = others(eje);
          const over = becomesP1(eje) && list.length >= max(eje);
          return (
            <fieldset key={eje} className="directive-axis" data-testid={`directive-${eje}`}>
              <legend className="field-label">{titulo}</legend>
              <p className="small muted">
                Calculada <AxisBadge eje={eje} p={calc(eje)} /> — {eje === 'estrategica' ? c?.motivoEstrategica : c?.motivoOperativa}
              </p>
              <div className="radio-cards" role="radiogroup" aria-label={titulo}>
                <label className={`radio-card ${choice[eje] === 'auto' ? 'on' : ''}`}>
                  <input type="radio" name={`ovr-${eje}`} checked={choice[eje] === 'auto'} onChange={() => setChoice({ ...choice, [eje]: 'auto' })} />
                  Calculada ({calc(eje)})
                </label>
                {PRIORITIES.map((x) => (
                  <label key={x} className={`radio-card ${choice[eje] === x ? 'on' : ''}`}>
                    <input type="radio" name={`ovr-${eje}`} checked={choice[eje] === x} onChange={() => setChoice({ ...choice, [eje]: x })} aria-label={`${titulo} ${x}`} />
                    {x}
                  </label>
                ))}
              </div>
              {changed(eje) && (
                <label className="field">
                  <span className="field-label">
                    Motivo del cambio <span aria-hidden className="req">*</span>
                  </span>
                  <input className="input" value={motivo[eje]} onChange={(e) => setMotivo({ ...motivo, [eje]: e.target.value })} placeholder="Ej. Compromiso con Dirección General" aria-label={`Motivo ${titulo.toLowerCase()}`} />
                </label>
              )}
              {becomesP1(eje) && list.length > 0 && (
                <div className={`displace ${over ? 'warn' : ''}`}>
                  <p className="displace-q">
                    <strong>Regla 8 · ¿Qué prioridad desplaza?</strong>
                    <br />
                    {over
                      ? `${area?.nombre} ya tiene ${list.length} proyectos P1 ${eje === 'estrategica' ? 'estratégicos' : 'urgentes'} (máximo recomendado: ${max(eje)}).`
                      : 'Si aparece una nueva prioridad, identifiquemos cuál se desplaza.'}
                  </p>
                  <div className="displace-list" role="radiogroup" aria-label={`Proyecto desplazado (${titulo.toLowerCase()})`}>
                    <label className={`radio-row ${displace[eje] === '' ? 'on' : ''}`}>
                      <input type="radio" name={`disp-${eje}`} checked={displace[eje] === ''} onChange={() => setDisplace({ ...displace, [eje]: '' })} />
                      No desplazar (convive como P1 adicional)
                    </label>
                    {list.map((o) => (
                      <label key={o.id} className={`radio-row ${displace[eje] === o.id ? 'on' : ''}`}>
                        <input type="radio" name={`disp-${eje}`} checked={displace[eje] === o.id} onChange={() => setDisplace({ ...displace, [eje]: o.id })} />
                        <span>
                          Bajar a P2: <strong>{o.nombre}</strong>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>
          );
        })}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
