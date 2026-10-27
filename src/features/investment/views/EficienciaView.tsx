import { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { KPI_TIPOS, periodLabel } from '../../../domain/investment/kpis';
import { NO_CALCULABLE } from '../../../domain/investment/efficiency';
import type { EfficiencyScope } from '../../../domain/types';
import { useServices } from '../../../state/app';
import { Section } from '../../../ui/common';
import { money, num, RecordModal, toNum, toStr, useAreaName, VALIDACION_OPTIONS, ValidChip, type InvestmentData } from '../shared';

const fmtMetric = (v: number | null, u: 'MXN' | 'x' | '%') => (v === null ? '—' : u === 'MXN' ? money(v, true) : u === '%' ? `${num(v, 2)}%` : `${num(v, 2)}x`);

export function EficienciaView({ data, areaId }: { data: InvestmentData; areaId: string }) {
  const { db, scopes, kpis } = data;
  const services = useServices();
  const director = services.investment.canManageFinance();
  const areaName = useAreaName();
  const [dialog, setDialog] = useState<{ kind: 'alcance'; item?: EfficiencyScope } | { kind: 'ingreso'; scopeId: string } | null>(null);
  const list = scopes.filter((s) => !areaId || s.scope.areaId === areaId);
  const porTipo = Object.entries(KPI_TIPOS).map(([k, label]) => ({
    label,
    n: kpis.filter((e) => e.kpi.tipo === k).length,
    conDato: kpis.filter((e) => e.kpi.tipo === k && e.real !== null).length,
  }));
  const kpiOptions = db.kpis.map((k) => ({
    value: k.id,
    label: `${k.clave} · ${k.nombre}`,
  }));

  return (
    <div className="stack">
      <Section title="Metodología">
        <div className="inv-method">
          <div>
            <p className="small">
              Cada indicador de eficiencia se calcula sobre un <strong>alcance</strong>: una inversión atribuible y los resultados que produjo, del <strong>mismo alcance y periodo</strong>. Si falta
              un dato o los periodos no coinciden, el sistema muestra «{NO_CALCULABLE}» y el motivo; nunca usa estimaciones como resultados reales.
            </p>
            <ul className="small">
              <li>CPL = inversión atribuible / leads · Costo por MQL, SQL y cierre = inversión / etapa · CPA = inversión / clientes adquiridos.</li>
              <li>ROAS = ingresos atribuibles a publicidad / gasto publicitario.</li>
              <li>ROI = (beneficio económico atribuible − inversión) / inversión × 100. El beneficio es margen o utilidad, no ingreso bruto. La colocación hipotecaria no es ingreso de SOC.</li>
              <li>Las iniciativas de posicionamiento no se evalúan sólo por conversiones: tienen indicadores de marca propios.</li>
            </ul>
          </div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col">Tipo de indicador</th>
                  <th scope="col" className="num">
                    KPIs
                  </th>
                  <th scope="col" className="num">
                    Con dato
                  </th>
                </tr>
              </thead>
              <tbody>
                {porTipo.map((t) => (
                  <tr key={t.label}>
                    <td>{t.label}</td>
                    <td className="num">{t.n}</td>
                    <td className="num">{t.conDato}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {director && (
        <div>
          <button className="btn btn-secondary" onClick={() => setDialog({ kind: 'alcance' })}>
            <Plus size={16} aria-hidden /> Nuevo alcance de eficiencia
          </button>
        </div>
      )}

      {list.length === 0 && <p className="muted">No hay alcances de eficiencia en el periodo seleccionado.</p>}
      {list.map((s) => (
        <Section
          key={s.scope.id}
          title={s.scope.nombre}
          actions={
            director && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'ingreso', scopeId: s.scope.id })}>
                  <Plus size={14} aria-hidden /> Ingreso o beneficio
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'alcance', item: s.scope })}>
                  Editar
                </button>
              </>
            )
          }
        >
          <p className="small">
            {periodLabel(s.scope.periodo)} · {areaName(s.scope.areaId)} · Inversión atribuible: <strong>{s.scope.inversion === null ? 'no identificada' : money(s.scope.inversion, true)}</strong>{' '}
            <ValidChip estado={s.scope.estado} />
            <span className="block muted">
              Fuente: {s.scope.fuente}
              {s.scope.inversionIncluye ? ` · Incluye: ${s.scope.inversionIncluye}` : ''}
            </span>
          </p>
          <div className="inv-funnel" aria-label="Embudo">
            {s.etapas
              .filter((e) => s.scope.etapas[e.key])
              .map((e) => (
                <div key={e.key} className="inv-funnel-step">
                  <span className="kpi-label">{e.nombre}</span>
                  <strong>{e.valor === null ? '—' : num(e.valor)}</strong>
                  {e.motivo && <span className="small warn-text">{e.motivo}</span>}
                </div>
              ))}
          </div>
          {s.conversiones.length > 0 && <p className="small">Conversión: {s.conversiones.map((c) => `${c.de} → ${c.a} ${num(c.valor, 2)}%`).join(' · ')}</p>}
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col" className="num">
                    Valor
                  </th>
                  <th scope="col">Fórmula</th>
                  <th scope="col">Cálculo / motivo</th>
                </tr>
              </thead>
              <tbody>
                {s.metrics.map((m) => (
                  <tr key={m.key} data-testid={`metric-${m.key}`}>
                    <td>{m.nombre}</td>
                    <td className="num">
                      <strong>{fmtMetric(m.valor, m.unidad)}</strong>
                    </td>
                    <td className="small">{m.formula}</td>
                    <td className={`small ${m.valor === null ? 'muted' : ''}`}>{m.valor === null ? m.motivo : m.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.advertencias.length > 0 && (
            <ul className="alert alert-yellow small">
              {s.advertencias.map((a) => (
                <li key={a}>
                  <AlertTriangle size={13} aria-hidden /> {a}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ))}

      {dialog?.kind === 'alcance' && (
        <RecordModal
          title={dialog.item ? 'Editar alcance de eficiencia' : 'Nuevo alcance de eficiencia'}
          subtitle="Inversión atribuible y resultados del mismo alcance y periodo."
          collection="efficiencyScopes"
          fields={[
            {
              key: 'nombre',
              label: 'Nombre',
              type: 'text',
              required: true,
              full: true,
            },
            {
              key: 'areaId',
              label: 'Gerencia',
              type: 'select',
              options: db.areas.map((a) => ({ value: a.id, label: a.nombre })),
              optional: true,
            },
            {
              key: 'inicio',
              label: 'Periodo: inicio',
              type: 'date',
              required: true,
            },
            { key: 'fin', label: 'Periodo: fin', type: 'date', required: true },
            {
              key: 'inversion',
              label: 'Inversión atribuible (MXN)',
              type: 'number',
              optional: true,
              hint: 'Vacío = no identificada',
            },
            {
              key: 'gastoPublicitario',
              label: 'Gasto publicitario (para ROAS)',
              type: 'number',
              optional: true,
            },
            {
              key: 'inversionIncluye',
              label: 'Qué incluye la inversión',
              type: 'text',
              optional: true,
              full: true,
            },
            {
              key: 'leads',
              label: 'KPI de leads',
              type: 'select',
              options: kpiOptions,
              optional: true,
            },
            {
              key: 'mql',
              label: 'KPI de MQL',
              type: 'select',
              options: kpiOptions,
              optional: true,
            },
            {
              key: 'sql',
              label: 'KPI de SQL',
              type: 'select',
              options: kpiOptions,
              optional: true,
            },
            {
              key: 'cierres',
              label: 'KPI de cierres',
              type: 'select',
              options: kpiOptions,
              optional: true,
            },
            {
              key: 'clientes',
              label: 'KPI de clientes adquiridos',
              type: 'select',
              options: kpiOptions,
              optional: true,
            },
            {
              key: 'lineaIds',
              label: 'Partidas que financian el alcance',
              type: 'multiselect',
              options: db.budgetLines.map((l) => ({
                value: l.id,
                label: l.nombre,
              })),
            },
            {
              key: 'criterioRoi',
              label: 'Criterio de ROI (costos y beneficios considerados)',
              type: 'textarea',
              optional: true,
            },
            {
              key: 'fuente',
              label: 'Fuente de la inversión',
              type: 'text',
              required: true,
            },
            {
              key: 'estado',
              label: 'Estado',
              type: 'select',
              options: VALIDACION_OPTIONS,
            },
            { key: 'nota', label: 'Nota', type: 'textarea', optional: true },
          ]}
          initial={{
            nombre: dialog.item?.nombre ?? '',
            areaId: dialog.item?.areaId ?? '',
            inicio: dialog.item?.periodo.inicio ?? '',
            fin: dialog.item?.periodo.fin ?? '',
            inversion: dialog.item?.inversion ?? '',
            gastoPublicitario: dialog.item?.gastoPublicitario ?? '',
            inversionIncluye: dialog.item?.inversionIncluye ?? '',
            ...dialog.item?.etapas,
            lineaIds: dialog.item?.lineaIds ?? [],
            criterioRoi: dialog.item?.criterioRoi ?? '',
            fuente: dialog.item?.fuente ?? '',
            estado: dialog.item?.estado ?? 'PENDIENTE',
            nota: dialog.item?.nota ?? '',
          }}
          toInput={(v) => ({
            ...dialog.item,
            nombre: v.nombre,
            areaId: toStr(v.areaId),
            periodo: { ...dialog.item?.periodo, inicio: v.inicio, fin: v.fin },
            inversion: toNum(v.inversion),
            gastoPublicitario: toNum(v.gastoPublicitario),
            inversionIncluye: toStr(v.inversionIncluye),
            etapas: {
              leads: toStr(v.leads),
              mql: toStr(v.mql),
              sql: toStr(v.sql),
              cierres: toStr(v.cierres),
              clientes: toStr(v.clientes),
            },
            projectIds: dialog.item?.projectIds ?? [],
            lineaIds: v.lineaIds,
            criterioRoi: toStr(v.criterioRoi),
            fuente: v.fuente,
            estado: v.estado,
            nota: toStr(v.nota),
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'ingreso' && (
        <RecordModal
          title="Ingreso o beneficio atribuible"
          subtitle="Sólo cifras propias de SOC, verificables y del mismo periodo del alcance."
          collection="revenues"
          note="ROAS usa «ingreso atribuible a publicidad». ROI usa «beneficio económico» (margen o utilidad, no ingreso bruto). La colocación hipotecaria no es ingreso de SOC."
          fields={[
            {
              key: 'concepto',
              label: 'Concepto',
              type: 'text',
              required: true,
              full: true,
            },
            {
              key: 'tipo',
              label: 'Tipo',
              type: 'select',
              options: [
                {
                  value: 'ingreso_publicidad',
                  label: 'Ingreso atribuible a publicidad (ROAS)',
                },
                {
                  value: 'beneficio_economico',
                  label: 'Beneficio económico atribuible (ROI)',
                },
              ],
            },
            {
              key: 'monto',
              label: 'Monto (MXN)',
              type: 'number',
              required: true,
            },
            {
              key: 'inicio',
              label: 'Periodo: inicio',
              type: 'date',
              required: true,
            },
            { key: 'fin', label: 'Periodo: fin', type: 'date', required: true },
            { key: 'fuente', label: 'Fuente', type: 'text', required: true },
            {
              key: 'estado',
              label: 'Estado',
              type: 'select',
              options: VALIDACION_OPTIONS,
            },
          ]}
          initial={(() => {
            const sc = db.efficiencyScopes.find((x) => x.id === dialog.scopeId);
            return {
              tipo: 'ingreso_publicidad',
              inicio: sc?.periodo.inicio ?? '',
              fin: sc?.periodo.fin ?? '',
              fuente: '',
              estado: 'PENDIENTE',
            };
          })()}
          toInput={(v) => ({
            concepto: v.concepto,
            tipo: v.tipo,
            monto: toNum(v.monto),
            periodo: { inicio: v.inicio, fin: v.fin },
            fuente: v.fuente,
            estado: v.estado,
            scopeId: dialog.scopeId,
          })}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
