import { Lock, LockOpen, Scale } from 'lucide-react';
import { fmtDateTime } from '../../domain/dates';
import { can } from '../../domain/permissions';
import { FUENTE_LABELS } from '../../domain/priority';
import { personName } from '../../domain/selectors';
import type { PriorityAxis, Project } from '../../domain/types';
import { useAttention, useCurrentUser, useDb, useServices, useSettings } from '../../state/app';
import { AxisBadge, ClassBadge, LockBadge } from '../../ui/badges';
import { Section } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { useModals } from '../modals/ModalHost';

const NIVEL_TEXTO: Record<number, string> = {
  1: 'Nivel 1 · P1 Crítico',
  2: 'Nivel 2 · P1 Urgente',
  3: 'Nivel 3 · P1 Estratégico',
  4: 'Nivel 4 · P2',
  5: 'Nivel 5 · P3',
};

const FUENTE_LOG = { pantalla: 'Pantalla', excel: 'Excel', junta: 'Weekly' } as const;

/** «¿Por qué esta prioridad?»: ejes, fuente, motivo, orden de atención, vínculos con la matriz y bitácora. */
export function PriorityPanel({ p }: { p: Project }) {
  const db = useDb();
  const settings = useSettings();
  const user = useCurrentUser();
  const services = useServices();
  const modals = useModals();
  const attention = useAttention();
  const { run, confirm } = useFeedback();
  const c = p.clasif;
  const director = can(user, 'project.override');
  const att = attention.get(p.id);
  const iniciativas = new Map((settings.priorityMatrix?.iniciativas ?? []).map((i) => [i.key, i.nombre]));
  const logs = services.priority.logs(p.id);

  if (!c) {
    return (
      <Section title="¿Por qué esta prioridad?">
        <p className="muted">La clasificación se calcula en unos segundos.</p>
      </Section>
    );
  }

  const axis = (eje: PriorityAxis) => {
    const est = eje === 'estrategica';
    const fuente = est ? c.fuenteEstrategica : c.fuenteOperativa;
    return (
      <div className="why-axis" data-testid={`why-${eje}`}>
        <dt>
          {est ? 'Prioridad estratégica' : 'Prioridad operativa'} <AxisBadge eje={eje} p={est ? c.estrategica : c.operativa} direccion={fuente === 'direccion'} />
        </dt>
        <dd>
          <span className="small muted">Fuente: {FUENTE_LABELS[fuente]}</span>
          <span className="block">{est ? c.motivoEstrategica : c.motivoOperativa}</span>
        </dd>
      </div>
    );
  };

  const toggleLock = async () => {
    const cerrar = !p.acuerdo?.bloqueado;
    const ok = await confirm({
      title: cerrar ? 'Cerrar acuerdo de prioridad' : 'Reabrir acuerdo de prioridad',
      message: cerrar ? (
        <p>
          La gerencia ya no podrá cambiar impacto, urgencia, dependencia, solicitante ni frente de <strong>{p.nombre}</strong>. Sólo Dirección podrá ajustarlos. El avance, compromisos y bloqueos siguen abiertos.
        </p>
      ) : (
        <p>
          La gerencia podrá volver a cambiar la ponderación de <strong>{p.nombre}</strong>.
        </p>
      ),
      confirmLabel: cerrar ? 'Cerrar acuerdo' : 'Reabrir',
    });
    if (ok) run(() => services.priority.setLock([p.id], cerrar), cerrar ? 'Acuerdo cerrado' : 'Acuerdo reabierto');
  };

  const vinculo = (key: string, estado: 'validado' | 'descartado' | null) =>
    run(() => services.priority.setVinculo(p.id, key, estado), estado === 'validado' ? 'Vínculo validado' : estado === 'descartado' ? 'Vínculo descartado' : 'Vínculo en automático');

  const manual = p.vinculos ?? [];
  const keys = [...new Set([...c.iniciativas, ...c.porValidar, ...manual.map((v) => v.iniciativa)])];

  return (
    <Section
      title="¿Por qué esta prioridad?"
      actions={
        director ? (
          <div className="row gap wrap">
            <button className="btn btn-sm btn-secondary" onClick={() => modals.open({ type: 'override', projectId: p.id })}>
              <Scale size={14} aria-hidden /> Validación directiva
            </button>
            <button className="btn btn-sm btn-ghost" onClick={toggleLock} data-testid="lock-toggle">
              {p.acuerdo?.bloqueado ? <LockOpen size={14} aria-hidden /> : <Lock size={14} aria-hidden />} {p.acuerdo?.bloqueado ? 'Reabrir acuerdo' : 'Cerrar acuerdo'}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="why" data-testid="why-priority">
        <p className="why-head row gap wrap">
          <ClassBadge c={c.integrada} size="lg" />
          {att && (
            <span className="small">
              <strong>Orden de atención #{att.posicion}</strong> · {NIVEL_TEXTO[att.nivel]}
              {att.desatendido && ` (P1 Estratégico sin avance en ${settings.criteria.diasDesatendido} días: sube a nivel 2)`}
              {att.vencido && ' · compromiso vencido'}
            </span>
          )}
          {p.acuerdo?.bloqueado && <LockBadge />}
        </p>
        <dl className="why-axes">
          {axis('estrategica')}
          {axis('operativa')}
        </dl>
        {c.integrada !== c.integradaCalc && (
          <p className="small">
            Calculada: <ClassBadge c={c.integradaCalc} /> → Dirección: <ClassBadge c={c.integrada} /> (prevalece Dirección).
          </p>
        )}
        {c.avisos.length > 0 && (
          <ul className="why-avisos small" data-testid="why-avisos">
            {c.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}

        {keys.length > 0 && (
          <div className="why-inic">
            <h3 className="field-label">Iniciativas de la matriz directiva</h3>
            <ul className="plain-list">
              {keys.map((k) => {
                const m = manual.find((v) => v.iniciativa === k);
                const estado = m?.estado === 'descartado' ? 'Descartado por Dirección' : m?.estado === 'validado' ? 'Validado por Dirección' : c.iniciativas.includes(k) ? 'Reconocido' : 'Por validar';
                return (
                  <li key={k} className="row gap wrap" data-testid="why-iniciativa">
                    <strong>{iniciativas.get(k) ?? k}</strong>
                    <span className="small muted">{estado}</span>
                    {director && (
                      <span className="row gap">
                        {m?.estado !== 'validado' && (
                          <button className="btn btn-sm btn-secondary" onClick={() => vinculo(k, 'validado')}>
                            Validar
                          </button>
                        )}
                        {m?.estado !== 'descartado' && (
                          <button className="btn btn-sm btn-ghost" onClick={() => vinculo(k, 'descartado')}>
                            No corresponde
                          </button>
                        )}
                        {m && (
                          <button className="btn btn-sm btn-ghost" onClick={() => vinculo(k, null)}>
                            Automático
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <details className="why-log" open={logs.length > 0 && logs.length <= 3}>
          <summary className="field-label">Bitácora de prioridad ({logs.length})</summary>
          {logs.length === 0 ? (
            <p className="small muted">Sin cambios de Dirección registrados.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-compact" data-testid="priority-log">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Cambio</th>
                    <th scope="col">Anterior → nuevo</th>
                    <th scope="col">Motivo</th>
                    <th scope="col">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="small">{fmtDateTime(l.createdAt)}</td>
                      <td className="small">
                        {l.tipo === 'prioridad' ? `Prioridad ${l.eje === 'estrategica' ? 'estratégica' : 'operativa'}` : l.tipo === 'acuerdo' ? 'Acuerdo' : 'Iniciativa'} · {FUENTE_LOG[l.fuente]}
                      </td>
                      <td className="small">
                        {l.anterior ?? '—'} → <strong>{l.nuevo}</strong>
                      </td>
                      <td className="small">{l.motivo}</td>
                      <td className="small">{personName(db.people, l.responsable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </div>
    </Section>
  );
}
