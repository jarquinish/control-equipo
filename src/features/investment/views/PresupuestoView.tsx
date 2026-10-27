import { Fragment, useState } from 'react';
import { CheckCircle2, Download, Plus, XCircle } from 'lucide-react';
import { isActiveProject, sortProjectsByPriority } from '../../../domain/selectors';
import type { BudgetCommitment, BudgetMovement, ID } from '../../../domain/types';
import { useApp, useServices } from '../../../state/app';
import { Link, useQuery } from '../../../state/router';
import { Chip } from '../../../ui/badges';
import { downloadFile, KpiCard, Section } from '../../../ui/common';
import { useFeedback } from '../../../ui/feedback';
import { toISODate } from '../../../domain/dates';
import { Bar, money, moneyShort, pct, RecordModal, SeriesBars, toCsv, toNum, toStr, VALIDACION_OPTIONS, ValidChip, type FieldSpec, type InvestmentData, type PeriodOption } from '../shared';
import { SEMAFORO } from './chips';

const TIPO_LABELS: Record<BudgetMovement['tipo'], string> = {
  ampliacion: 'Ampliación',
  reduccion: 'Reducción',
  transferencia: 'Transferencia',
  reclasificacion: 'Reclasificación de gasto',
};

type Dialog = { kind: 'movimiento'; item?: BudgetMovement } | { kind: 'compromiso'; lineaId?: ID; item?: BudgetCommitment } | { kind: 'asignacion'; lineaId?: ID; id?: ID } | null;

export function PresupuestoView({ data, periodo }: { data: InvestmentData; periodo: PeriodOption }) {
  const { db, budget, budgetFull } = data;
  const services = useServices();
  const { now } = useApp();
  const { run, confirm } = useFeedback();
  const director = services.investment.canManageFinance();
  const [q, setQ] = useQuery();
  const sel = q.get('partida') ?? '';
  const [dialog, setDialog] = useState<Dialog>(null);
  const t = budget.totales;
  const lineName = (id?: ID) => db.budgetLines.find((l) => l.id === id)?.nombre ?? '—';
  const projectName = (id?: ID) => db.projects.find((p) => p.id === id)?.nombre ?? '—';
  const lineOptions = db.budgetLines.map((l) => ({
    value: l.id,
    label: `${l.clave} · ${l.nombre}`,
  }));
  const projectOptions = db.projects
    .filter(isActiveProject)
    .sort(sortProjectsByPriority)
    .map((p) => ({
      value: p.id,
      label: `${p.ref ? `${p.ref} · ` : ''}${p.nombre}`,
    }));

  const monthly = budget.meses.map((m) => ({
    label: m.slice(5),
    value: db.spend.filter((s) => s.mes === m).reduce((x, s) => x + s.monto, 0),
  }));
  const byProject = new Map<ID, number>();
  for (const a of db.budgetAllocations) byProject.set(a.projectId, (byProject.get(a.projectId) ?? 0) + a.monto);
  const maxProject = Math.max(1, ...byProject.values());

  const setEstado = (m: BudgetMovement, estado: 'CONFIRMADO' | 'PROPUESTA') =>
    run(() => services.investment.save('budgetMovements', { ...m, estado }), estado === 'CONFIRMADO' ? 'Movimiento autorizado' : 'Movimiento devuelto a propuesta');

  const exportCsv = () =>
    downloadFile(
      `control-presupuestal-${budget.corte ?? 'sin-corte'}.csv`,
      toCsv(
        [
          'Clave',
          'Partida',
          'Autorizado inicial',
          'Ampliaciones',
          'Reducciones',
          'Transferencias netas',
          'Vigente',
          'Ejercido contable',
          'Reclasificaciones confirmadas',
          'Ejercido',
          'Reclasificaciones pendientes',
          'Ejercido con propuestas',
          'Comprometido',
          'Disponible',
          'Asignado a proyectos',
          '% ejecución',
          'Semáforo',
          'Validación',
          'Discrepancia',
        ],
        budget.lines.map((l) => [
          l.line.clave,
          l.line.nombre,
          l.original,
          l.ampliaciones,
          l.reducciones,
          l.transferenciasEntrada - l.transferenciasSalida,
          l.vigente,
          l.ejercidoContable,
          l.reclasConfirmadas,
          l.ejercido,
          l.reclasPendientes,
          l.ejercidoConPropuestas,
          l.comprometido,
          l.disponible,
          l.asignado,
          l.ejecucion === null ? '' : Math.round(l.ejecucion * 1000) / 10,
          SEMAFORO[l.semaforo].label,
          l.line.estado,
          l.line.discrepancia,
        ]),
      ),
      'text/csv;charset=utf-8',
    );

  return (
    <div className="stack">
      <div className="kpis kpis-6">
        <KpiCard label="Autorizado inicial" value={moneyShort(t.original)} hint={money(t.original)} />
        <KpiCard label="Vigente" value={moneyShort(t.vigente)} hint={`${money(t.vigente)} · +${money(t.ampliaciones)} ampliaciones · −${money(t.reducciones)} reducciones`} tone="brand" />
        <KpiCard label="Ejercido" value={moneyShort(t.ejercido)} hint={budget.corte ? `${money(t.ejercido, true)} · contable al ${budget.corte}` : 'Sin gasto'} />
        <KpiCard label="Comprometido" value={moneyShort(t.comprometido)} hint={money(t.comprometido)} />
        <KpiCard
          label="Disponible"
          value={moneyShort(t.disponible)}
          hint={`${money(t.disponible, true)} · vigente − ejercido (incluye gasto sin partida) − comprometido`}
          tone={t.disponible < 0 ? 'red' : 'green'}
        />
        <KpiCard label="Asignado a proyectos" value={moneyShort(t.asignado)} hint={`${pct(t.vigente ? t.asignado / t.vigente : null, 0)} del vigente`} />
      </div>
      {periodo.periodo && periodo.key !== 'anio' && (
        <p className="alert alert-yellow small">El presupuesto es anual; el gasto se muestra acumulado hasta el fin de {periodo.label}. No se compara contra una fracción del presupuesto.</p>
      )}

      <Section
        title="Partidas presupuestales"
        actions={
          <>
            {director && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'movimiento' })}>
                  <Plus size={14} aria-hidden /> Movimiento
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'compromiso' })}>
                  <Plus size={14} aria-hidden /> Gasto comprometido
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'asignacion' })}>
                  <Plus size={14} aria-hidden /> Asignar a proyecto
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
              <Download size={14} aria-hidden /> CSV
            </button>
          </>
        }
      >
        <div className="table-wrap">
          <table className="table table-hover table-compact">
            <thead>
              <tr>
                <th scope="col">Partida</th>
                <th scope="col" className="num">
                  Inicial
                </th>
                <th scope="col" className="num">
                  Movimientos
                </th>
                <th scope="col" className="num">
                  Vigente
                </th>
                <th scope="col" className="num">
                  Ejercido
                </th>
                <th scope="col">Ejecución</th>
                <th scope="col" className="num">
                  Comprometido
                </th>
                <th scope="col" className="num">
                  Disponible
                </th>
                <th scope="col" className="num">
                  Asignado a proyectos
                </th>
                <th scope="col">Semáforo</th>
              </tr>
            </thead>
            <tbody>
              {budget.lines.map((l) => {
                const mov = l.ampliaciones - l.reducciones + l.transferenciasEntrada - l.transferenciasSalida;
                const open = sel === l.line.id;
                return (
                  <Fragment key={l.line.id}>
                    <tr className={open ? 'inv-row-open' : undefined} onClick={() => setQ({ partida: open ? undefined : l.line.id })} style={{ cursor: 'pointer' }} data-testid="budget-row">
                      <td>
                        <button className="link-btn cell-title" aria-expanded={open}>
                          {l.line.clave} · {l.line.nombre}
                        </button>
                        {l.line.discrepancia && <span className="small warn-text block">⚠ {l.line.discrepancia}</span>}
                      </td>
                      <td className="num">{money(l.original)}</td>
                      <td className={`num ${mov < 0 ? 'warn-text' : ''}`}>{mov ? `${mov > 0 ? '+' : ''}${money(mov)}` : '—'}</td>
                      <td className="num">
                        <strong>{money(l.vigente)}</strong>
                      </td>
                      <td className="num">
                        {money(l.ejercido, true)}
                        {l.reclasPendientes !== 0 && <span className="small muted block">con propuestas {money(l.ejercidoConPropuestas, true)}</span>}
                      </td>
                      <td>
                        <Bar
                          value={l.ejercido}
                          max={Math.max(l.vigente, l.ejercido)}
                          tone={l.semaforo === 'sobre' ? 'red' : l.semaforo === 'sin_ejercer' ? 'gray' : l.semaforo === 'revolvente' ? 'yellow' : 'brand'}
                        />
                        <span className="small">{pct(l.ejecucion, 0)}</span>
                      </td>
                      <td className="num">{l.comprometido ? money(l.comprometido) : '—'}</td>
                      <td className={`num ${l.disponible < 0 ? 'warn-text' : ''}`}>{money(l.disponible, true)}</td>
                      <td className="num">{l.asignado ? money(l.asignado) : <span className="muted">—</span>}</td>
                      <td>
                        <Chip tone={SEMAFORO[l.semaforo].tone}>{SEMAFORO[l.semaforo].label}</Chip>
                      </td>
                    </tr>
                    {open && (
                      <tr className="inv-detail">
                        <td colSpan={10}>
                          <LineDetail
                            data={data}
                            lineaId={l.line.id}
                            director={director}
                            onAsignar={() =>
                              setDialog({
                                kind: 'asignacion',
                                lineaId: l.line.id,
                              })
                            }
                            onComprometer={() =>
                              setDialog({
                                kind: 'compromiso',
                                lineaId: l.line.id,
                              })
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="num">{money(t.original)}</td>
                <td className="num">{money(t.vigente - t.original)}</td>
                <td className="num">
                  <strong>{money(t.vigente)}</strong>
                </td>
                <td className="num">{money(t.ejercido, true)}</td>
                <td className="small">{pct(t.vigente ? t.ejercido / t.vigente : null)}</td>
                <td className="num">{money(t.comprometido)}</td>
                <td className="num">{money(t.vigente - t.ejercido - t.comprometido, true)}</td>
                <td className="num">{money(t.asignado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {budget.sinPartida.length > 0 && (
          <div className="alert alert-yellow small">
            <strong>Gasto contable sin partida autorizada</strong> (incluido en el total ejercido):{' '}
            {budget.sinPartida.map((s) => (
              <span key={s.categoria} className="block">
                {s.categoria}: {money(s.monto, true)}
                {s.reclasPendiente ? ` · reclasificación propuesta a Branding/otra partida pendiente de formalizar (${money(s.reclasPendiente, true)})` : ''}
              </span>
            ))}
          </div>
        )}
      </Section>

      <div className="two-col">
        <Section title="Movimientos presupuestales">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th scope="col">Folio</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Origen → destino</th>
                  <th scope="col" className="num">
                    Monto
                  </th>
                  <th scope="col">Estado</th>
                  {director && <th scope="col" />}
                </tr>
              </thead>
              <tbody>
                {db.budgetMovements.map((m) => (
                  <tr key={m.id}>
                    <td>{m.folio}</td>
                    <td className="small">
                      {TIPO_LABELS[m.tipo]}
                      <span className="block muted">{m.concepto}</span>
                    </td>
                    <td className="small">
                      {m.deCategoria ? `Categoría «${m.deCategoria}»` : m.deLineaId ? lineName(m.deLineaId) : '—'} → {m.aLineaId ? lineName(m.aLineaId) : '—'}
                    </td>
                    <td className="num">{m.monto !== undefined ? money(m.monto, true) : <span className="small">Gasto completo de la categoría</span>}</td>
                    <td>
                      <ValidChip estado={m.estado} />
                      {m.nota && <span className="small muted block">{m.nota}</span>}
                    </td>
                    {director && (
                      <td className="row-actions">
                        {m.estado !== 'CONFIRMADO' ? (
                          <button
                            className="btn btn-ok-soft btn-sm"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: `Autorizar ${m.folio}`,
                                  message:
                                    m.tipo === 'reclasificacion'
                                      ? 'El gasto oficial por partida incluirá esta reclasificación. Hazlo sólo si Contabilidad ya la formalizó.'
                                      : 'El presupuesto vigente incluirá este movimiento.',
                                  confirmLabel: 'Autorizar',
                                })
                              )
                                setEstado(m, 'CONFIRMADO');
                            }}
                          >
                            <CheckCircle2 size={14} aria-hidden /> Autorizar
                          </button>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'movimiento', item: m })}>
                            Editar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            Una transferencia es un solo registro (origen → destino) y no cambia el total. Una reclasificación mueve gasto contable entre partidas; mientras esté pendiente sólo aparece como «con
            propuestas».
          </p>
        </Section>

        <div className="stack">
          <Section title="Gasto contable mensual">
            <SeriesBars items={monthly} unidad="MXN" />
            <p className="small muted">Fuente: reporte contable · {budget.corte ? `corte ${budget.corte}` : 'sin corte'}. No se asume gasto validado posterior al corte.</p>
          </Section>
          <Section title="Validaciones de cuadre">
            <ul className="inv-checks-list">
              {budgetFull.checks.map((c) => (
                <li key={c.id} className={c.ok ? 'ok' : 'bad'}>
                  {c.ok ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />} {c.texto}
                  <span className="small muted block">{c.detalle}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Section title="Distribución por proyecto">
        {byProject.size ? (
          <div className="inv-exec-grid">
            {[...byProject.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([pid, monto]) => (
                <Link key={pid} to={`/proyectos/${pid}`} className="inv-exec-row">
                  <span className="inv-exec-name">{projectName(pid)}</span>
                  <Bar value={monto} max={maxProject} />
                  <span className="inv-exec-num small">{money(monto)}</span>
                </Link>
              ))}
          </div>
        ) : (
          <p className="muted">Aún no hay partidas asignadas a proyectos. {director ? 'Usa «Asignar a proyecto» para relacionar cada partida con los proyectos que financia.' : ''}</p>
        )}
      </Section>

      {dialog?.kind === 'movimiento' && (
        <RecordModal
          title={dialog.item ? `Movimiento ${dialog.item.folio}` : 'Nuevo movimiento presupuestal'}
          collection="budgetMovements"
          note="Los movimientos quedan como «Pendiente» hasta que los autorices. Las transferencias no cambian el total."
          fields={[
            { key: 'folio', label: 'Folio', type: 'text', required: true },
            {
              key: 'tipo',
              label: 'Tipo',
              type: 'select',
              options: Object.entries(TIPO_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
            {
              key: 'deLineaId',
              label: 'Partida de origen',
              type: 'select',
              options: lineOptions,
              optional: true,
              hint: 'Reducción, transferencia o reclasificación',
            },
            {
              key: 'deCategoria',
              label: 'Categoría contable de origen',
              type: 'text',
              optional: true,
              hint: 'Sólo reclasificaciones de una categoría sin partida',
            },
            {
              key: 'aLineaId',
              label: 'Partida de destino',
              type: 'select',
              options: lineOptions,
              optional: true,
              hint: 'Ampliación, transferencia o reclasificación',
            },
            {
              key: 'monto',
              label: 'Monto (MXN)',
              type: 'number',
              optional: true,
            },
            {
              key: 'concepto',
              label: 'Concepto',
              type: 'text',
              required: true,
              full: true,
            },
            { key: 'fecha', label: 'Fecha', type: 'date', optional: true },
            {
              key: 'autorizadoPor',
              label: 'Autorizado por',
              type: 'text',
              optional: true,
            },
            {
              key: 'fuente',
              label: 'Fuente / documento',
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
            tipo: 'transferencia',
            estado: 'PENDIENTE',
            fuente: '',
            ...dialog.item,
          }}
          toInput={(v) => ({
            ...dialog.item,
            ...v,
            deLineaId: toStr(v.deLineaId),
            aLineaId: toStr(v.aLineaId),
            deCategoria: toStr(v.deCategoria),
            monto: toNum(v.monto) ?? undefined,
            fecha: toStr(v.fecha),
            nota: toStr(v.nota),
          })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'compromiso' && (
        <RecordModal
          title="Gasto comprometido"
          subtitle="Compromisos de pago aún no ejercidos (o gasto con proyecto identificado)."
          collection="budgetCommitments"
          fields={
            [
              {
                key: 'lineaId',
                label: 'Partida',
                type: 'select',
                options: lineOptions,
                required: true,
              },
              {
                key: 'projectId',
                label: 'Proyecto',
                type: 'select',
                options: projectOptions,
                optional: true,
              },
              {
                key: 'concepto',
                label: 'Concepto',
                type: 'text',
                required: true,
                full: true,
              },
              {
                key: 'monto',
                label: 'Monto (MXN)',
                type: 'number',
                required: true,
              },
              { key: 'fecha', label: 'Fecha', type: 'date', required: true },
              {
                key: 'situacion',
                label: 'Situación',
                type: 'select',
                options: [
                  { value: 'comprometido', label: 'Comprometido' },
                  {
                    value: 'ejercido',
                    label: 'Ejercido (detalle por proyecto)',
                  },
                  { value: 'cancelado', label: 'Cancelado' },
                ],
              },
              {
                key: 'fuente',
                label: 'Fuente / documento',
                type: 'text',
                required: true,
              },
              {
                key: 'estado',
                label: 'Estado',
                type: 'select',
                options: VALIDACION_OPTIONS,
              },
            ] as FieldSpec[]
          }
          initial={{
            lineaId: dialog.lineaId ?? lineOptions[0]?.value,
            situacion: 'comprometido',
            fecha: toISODate(now),
            estado: 'PENDIENTE',
            fuente: '',
            ...dialog.item,
          }}
          toInput={(v) => ({
            ...dialog.item,
            ...v,
            projectId: toStr(v.projectId),
            monto: toNum(v.monto),
          })}
          onClose={() => setDialog(null)}
          note="«Ejercido» aquí es sólo el detalle por proyecto de un gasto que ya está en el reporte contable: no se suma otra vez al ejercido de la partida."
        />
      )}
      {dialog?.kind === 'asignacion' && (
        <RecordModal
          title="Asignar partida a proyecto"
          subtitle="Cuánto de la partida financia el proyecto. Un proyecto puede usar varias partidas y una partida financiar varios proyectos."
          collection="budgetAllocations"
          fields={[
            {
              key: 'lineaId',
              label: 'Partida',
              type: 'select',
              options: lineOptions,
              required: true,
            },
            {
              key: 'projectId',
              label: 'Proyecto',
              type: 'select',
              options: projectOptions,
              required: true,
            },
            {
              key: 'monto',
              label: 'Monto asignado (MXN)',
              type: 'number',
              required: true,
            },
            {
              key: 'estado',
              label: 'Estado',
              type: 'select',
              options: VALIDACION_OPTIONS,
            },
            {
              key: 'nota',
              label: 'Nota',
              type: 'text',
              optional: true,
              full: true,
            },
          ]}
          initial={{
            lineaId: dialog.lineaId ?? lineOptions[0]?.value,
            projectId: projectOptions[0]?.value,
            estado: 'CONFIRMADO',
          }}
          toInput={(v) => ({
            ...v,
            monto: toNum(v.monto),
            nota: toStr(v.nota),
          })}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function LineDetail({ data, lineaId, director, onAsignar, onComprometer }: { data: InvestmentData; lineaId: ID; director: boolean; onAsignar: () => void; onComprometer: () => void }) {
  const { db, budget } = data;
  const services = useServices();
  const { run, confirm } = useFeedback();
  const l = budget.lines.find((x) => x.line.id === lineaId)!;
  const allocs = db.budgetAllocations.filter((a) => a.lineaId === lineaId);
  const commits = db.budgetCommitments.filter((c) => c.lineaId === lineaId);
  const movs = db.budgetMovements.filter((m) => m.deLineaId === lineaId || m.aLineaId === lineaId);
  return (
    <div className="inv-line-detail">
      <div>
        <h3>Trazabilidad</h3>
        <p className="small">
          Fuente: {l.line.fuente} · <ValidChip estado={l.line.estado} />
        </p>
        {l.line.nota && <p className="small muted">{l.line.nota}</p>}
        <p className="small">Categorías contables: {l.line.categoriasContables.length ? l.line.categoriasContables.join(', ') : 'ninguna'}</p>
        {l.line.revolvente && <p className="small warn-text">Fondo revolvente: el gasto se concilia contra ventas, cobranza, inventario y reinversión; no se califica como sobreejercicio.</p>}
        <SeriesBars
          items={Object.entries(l.mensual)
            .sort()
            .map(([m, v]) => ({ label: m.slice(5), value: v }))}
          unidad="MXN"
          height={60}
        />
        {movs.length > 0 && <p className="small">Movimientos: {movs.map((m) => `${m.folio} (${m.estado === 'CONFIRMADO' ? 'autorizado' : 'pendiente'})`).join(', ')}</p>}
      </div>
      <div>
        <h3>Proyectos que financia</h3>
        {allocs.length ? (
          <ul className="inv-mini-list">
            {allocs.map((a) => (
              <li key={a.id}>
                <Link to={`/proyectos/${a.projectId}`}>{db.projects.find((p) => p.id === a.projectId)?.nombre ?? 'Proyecto eliminado'}</Link> · {money(a.monto)}
                {director && (
                  <button
                    className="btn btn-ghost-danger btn-sm"
                    aria-label="Quitar asignación"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (
                        await confirm({
                          title: 'Quitar asignación',
                          message: 'El proyecto dejará de mostrar esta inversión.',
                          confirmLabel: 'Quitar',
                          danger: true,
                        })
                      )
                        run(() => services.investment.remove('budgetAllocations', a.id), 'Asignación eliminada');
                    }}
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">Sin proyectos asignados.</p>
        )}
        <p className="small">
          Sin asignar: <strong>{money(l.sinAsignar)}</strong>
        </p>
        {director && (
          <button className="btn btn-secondary btn-sm" onClick={onAsignar}>
            <Plus size={14} aria-hidden /> Asignar a proyecto
          </button>
        )}
      </div>
      <div>
        <h3>Gasto comprometido</h3>
        {commits.length ? (
          <ul className="inv-mini-list">
            {commits.map((c) => (
              <li key={c.id}>
                {c.concepto} · {money(c.monto)} · {c.situacion}
                {c.projectId && <span className="small muted"> · {db.projects.find((p) => p.id === c.projectId)?.nombre}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">Sin compromisos registrados.</p>
        )}
        {director && (
          <button className="btn btn-secondary btn-sm" onClick={onComprometer}>
            <Plus size={14} aria-hidden /> Registrar compromiso
          </button>
        )}
      </div>
    </div>
  );
}
