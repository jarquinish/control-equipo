import { Download, Upload } from 'lucide-react';
import { useDb, useServices } from '../../state/app';
import { Link } from '../../state/router';
import { EmptyState, PageHeader } from '../../ui/common';
import { useInvestment, useInvestmentFilters } from './shared';
import { ResumenView } from './views/ResumenView';
import { GerenciasView } from './views/GerenciasView';
import { ProyectosView } from './views/ProyectosView';
import { PresupuestoView } from './views/PresupuestoView';
import { KpisView } from './views/KpisView';
import { EficienciaView } from './views/EficienciaView';
import { DecisionesView } from './views/DecisionesView';
import { DatosView } from './views/DatosView';

export const INVESTMENT_VIEWS = [
  { key: 'resumen', label: 'Resumen ejecutivo' },
  { key: 'gerencias', label: 'Desempeño por gerencia' },
  { key: 'proyectos', label: 'Proyectos e inversión' },
  { key: 'presupuesto', label: 'Control presupuestal' },
  { key: 'kpis', label: 'KPIs y resultados' },
  { key: 'eficiencia', label: 'Eficiencia y rentabilidad' },
  { key: 'decisiones', label: 'Centro de decisiones' },
  { key: 'datos', label: 'Datos y configuración' },
] as const;
export type InvestmentViewKey = (typeof INVESTMENT_VIEWS)[number]['key'];

/**
 * Inversión, KPIs y Resultados: conecta la operación de cada gerencia (proyectos,
 * prioridades, bloqueos) con el presupuesto, los indicadores y los resultados.
 */
export function InvestmentPage() {
  const db = useDb();
  const services = useServices();
  const f = useInvestmentFilters();
  const data = useInvestment(f.periodo.periodo);
  const vista = (INVESTMENT_VIEWS.find((v) => v.key === f.q.get('vista'))?.key ?? 'resumen') as InvestmentViewKey;
  const director = services.investment.canManageFinance();
  const vacio = !db.budgetLines.length && !db.kpis.length;
  const alertas = data.alerts.filter((a) => a.severidad === 'alta').length;

  return (
    <div className="page inv-page">
      <PageHeader
        eyebrow="Inteligencia de gestión"
        title="Inversión, KPIs y Resultados"
        subtitle="Qué hacemos, quién responde, qué prioridad tiene, cuánto invertimos, qué indicadores movemos y qué resultados obtenemos."
      />

      <div className="tabs inv-tabs" role="tablist" aria-label="Vistas de Inversión, KPIs y Resultados">
        {INVESTMENT_VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={vista === v.key}
            className={`tab ${vista === v.key ? 'on' : ''}`}
            onClick={() =>
              f.setQ({
                vista: v.key === 'resumen' ? undefined : v.key,
                kpi: undefined,
                partida: undefined,
                tab: undefined,
              })
            }
          >
            {v.label}
            {v.key === 'decisiones' && alertas > 0 && <span className="count-pill">{alertas}</span>}
          </button>
        ))}
      </div>

      {vista !== 'datos' && (
        <div className="filters card" role="search" aria-label="Filtros del módulo">
          <select
            className="input"
            aria-label="Periodo"
            value={f.periodo.key}
            onChange={(e) =>
              f.setQ({
                periodo: e.target.value === 'anio' ? undefined : e.target.value,
              })
            }
          >
            {f.opts.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <select className="input" aria-label="Gerencia" value={f.area} onChange={(e) => f.setQ({ area: e.target.value })}>
            <option value="">Todas las gerencias</option>
            {db.areas
              .filter((a) => a.activo)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
          </select>
          {data.budget.corte && (
            <span className="small muted inv-corte">
              Corte contable: <strong>{data.budget.corte}</strong>
            </span>
          )}
        </div>
      )}

      {vacio && vista !== 'datos' ? (
        <EmptyState
          icon={<Download size={28} />}
          title="Aún no hay información de inversión ni KPIs"
          action={
            director ? (
              <Link to="/inversion?vista=datos" className="btn btn-primary">
                <Upload size={16} aria-hidden /> Cargar paquete de datos validados
              </Link>
            ) : undefined
          }
        >
          {director
            ? 'Carga el paquete con el presupuesto 2026, el gasto contable, los movimientos, el catálogo de KPIs y los resultados validados. Sólo agrega información: no modifica proyectos ni prioridades.'
            : 'Dirección todavía no carga el presupuesto ni los indicadores.'}
        </EmptyState>
      ) : (
        <>
          {vista === 'resumen' && <ResumenView data={data} areaId={f.area} periodo={f.periodo} />}
          {vista === 'gerencias' && <GerenciasView data={data} areaId={f.area} />}
          {vista === 'proyectos' && <ProyectosView data={data} areaId={f.area} />}
          {vista === 'presupuesto' && <PresupuestoView data={data} periodo={f.periodo} />}
          {vista === 'kpis' && <KpisView data={data} areaId={f.area} periodo={f.periodo} />}
          {vista === 'eficiencia' && <EficienciaView data={data} areaId={f.area} />}
          {vista === 'decisiones' && <DecisionesView data={data} areaId={f.area} />}
          {vista === 'datos' && <DatosView data={data} />}
        </>
      )}
    </div>
  );
}
