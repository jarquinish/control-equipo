import { ClipboardCheck } from 'lucide-react';
import { ALERT_CATEGORY_LABELS, type AlertCategory } from '../../../domain/investment/alerts';
import { useCanEdit } from '../../../state/app';
import { Link, useQuery } from '../../../state/router';
import { Section } from '../../../ui/common';
import { useModals } from '../../modals/ModalHost';
import type { InvestmentData } from '../shared';
import { SeverityChip } from './chips';

const ORDER: AlertCategory[] = [
  'estrategico_retrasado',
  'bloqueo_directivo',
  'sobrepresupuesto',
  'kpi_debajo',
  'inversion_sin_resultado',
  'presupuesto_sin_proyecto',
  'proyecto_sin_kpi',
  'resultado_sin_inversion',
  'pendiente_autorizacion',
  'calidad_dato',
];

export function DecisionesView({ data, areaId }: { data: InvestmentData; areaId: string }) {
  const [q, setQ] = useQuery();
  const modals = useModals();
  const canEdit = useCanEdit();
  const sev = q.get('sev') ?? '';
  const cat = q.get('cat') ?? '';
  const alerts = data.alerts.filter((a) => (!areaId || a.areaId === areaId) && (!sev || a.severidad === sev) && (!cat || a.categoria === cat));
  const groups = ORDER.map((c) => ({
    c,
    items: alerts.filter((a) => a.categoria === c),
  })).filter((g) => g.items.length);

  return (
    <div className="stack">
      <div className="filters card" aria-label="Filtros de alertas">
        <select className="input" aria-label="Severidad" value={sev} onChange={(e) => setQ({ sev: e.target.value })}>
          <option value="">Todas las severidades</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <select className="input" aria-label="Tipo de alerta" value={cat} onChange={(e) => setQ({ cat: e.target.value })}>
          <option value="">Todos los tipos</option>
          {ORDER.map((c) => (
            <option key={c} value={c}>
              {ALERT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <span className="small muted">{alerts.length} alerta(s). Se recalculan con cada cambio.</span>
      </div>
      {groups.length === 0 && <p className="muted">Sin alertas con estos filtros.</p>}
      {groups.map((g) => (
        <Section key={g.c} title={`${ALERT_CATEGORY_LABELS[g.c]} · ${g.items.length}`}>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col">Severidad</th>
                  <th scope="col">Tema</th>
                  <th scope="col">Responsable</th>
                  <th scope="col">Causa</th>
                  <th scope="col">Impacto</th>
                  <th scope="col">Siguiente acción</th>
                  {canEdit && <th scope="col" />}
                </tr>
              </thead>
              <tbody>
                {g.items.map((a) => (
                  <tr key={a.id} data-testid="exec-alert">
                    <td>
                      <SeverityChip s={a.severidad} />
                    </td>
                    <td>{a.link ? <Link to={a.link}>{a.titulo}</Link> : a.titulo}</td>
                    <td className="small">{a.responsable}</td>
                    <td className="small">{a.causa}</td>
                    <td className="small">{a.impacto}</td>
                    <td className="small">{a.accion}</td>
                    {canEdit && (
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            modals.open({
                              type: 'decision',
                              projectId: a.projectId,
                            })
                          }
                          title="Registrar la decisión en la bitácora de decisiones de la semana"
                        >
                          <ClipboardCheck size={14} aria-hidden /> Decisión
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
    </div>
  );
}
