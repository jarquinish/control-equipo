import { isActiveProject, isBlockOpen, personName } from '../selectors';
import type { DbData, ID, ISODate, Project } from '../types';
import type { BudgetSummary } from './budget';
import { KPI_ESTADO_LABELS, type KpiEval } from './kpis';
import type { ScopeEval } from './efficiency';

/**
 * Centro de decisiones: alertas ejecutivas calculadas (no se guardan; se
 * recalculan con cada cambio). Cada una dice responsable, causa, impacto y
 * siguiente acción. Registrar la decisión usa la colección existente `decisions`.
 */

export type AlertCategory =
  | 'estrategico_retrasado'
  | 'kpi_debajo'
  | 'presupuesto_sin_proyecto'
  | 'proyecto_sin_kpi'
  | 'inversion_sin_resultado'
  | 'resultado_sin_inversion'
  | 'sobrepresupuesto'
  | 'bloqueo_directivo'
  | 'pendiente_autorizacion'
  | 'calidad_dato';

export const ALERT_CATEGORY_LABELS: Record<AlertCategory, string> = {
  estrategico_retrasado: 'Proyectos estratégicos retrasados',
  kpi_debajo: 'KPIs debajo de meta o en riesgo',
  presupuesto_sin_proyecto: 'Presupuesto sin proyecto asociado',
  proyecto_sin_kpi: 'Proyectos sin KPIs definidos',
  inversion_sin_resultado: 'Inversiones sin resultados vinculados',
  resultado_sin_inversion: 'Resultados sin inversión identificada',
  sobrepresupuesto: 'Riesgo de sobrepresupuesto',
  bloqueo_directivo: 'Bloqueos que requieren intervención directiva',
  pendiente_autorizacion: 'Pendientes de autorización',
  calidad_dato: 'Calidad y trazabilidad de datos',
};

export interface ExecAlert {
  id: string;
  categoria: AlertCategory;
  severidad: 'alta' | 'media' | 'baja';
  titulo: string;
  responsable: string;
  causa: string;
  impacto: string;
  accion: string;
  link?: string;
  projectId?: ID;
  areaId?: ID;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
const isStrategicP1 = (p: Project) => (p.clasif ? p.clasif.estrategica === 'P1' : p.prioridadFinal === 'P1');

export function executiveAlerts(
  db: DbData,
  input: {
    today: ISODate;
    budget: BudgetSummary;
    kpis: KpiEval[];
    scopes: ScopeEval[];
    diasBloqueo?: number;
  },
): ExecAlert[] {
  const { today, budget, kpis, scopes } = input;
  const diasBloqueo = input.diasBloqueo ?? 14;
  const out: ExecAlert[] = [];
  const areaName = (id?: ID) => db.areas.find((a) => a.id === id)?.nombre ?? 'Sin gerencia';
  const areaResp = (id?: ID) => {
    const a = db.areas.find((x) => x.id === id);
    return a ? `${a.nombre} · ${personName(db.people, a.responsable, 'sin responsable')}` : 'Dirección';
  };
  const projResp = (p: Project) => `${areaName(p.areaId)} · ${personName(db.people, p.responsable, 'sin responsable')}`;
  const active = db.projects.filter(isActiveProject);

  // 1. Estratégicos retrasados
  for (const p of active.filter((x) => isStrategicP1(x) && x.fechaObjetivo && x.fechaObjetivo < today)) {
    out.push({
      id: `retraso:${p.id}`,
      categoria: 'estrategico_retrasado',
      severidad: 'alta',
      titulo: p.nombre,
      responsable: projResp(p),
      causa: `Fecha objetivo ${p.fechaObjetivo} vencida; estado «${p.estado.replace('_', ' ')}»${p.bloqueado ? ' y bloqueado' : ''}.`,
      impacto: 'Prioridad estratégica P1 sin entregar a tiempo.',
      accion: 'Confirmar nueva fecha, destrabar o reprogramar en la Weekly.',
      link: `/proyectos/${p.id}`,
      projectId: p.id,
      areaId: p.areaId,
    });
  }

  // 2. KPIs debajo de meta / en riesgo
  for (const k of kpis.filter((x) => x.estado === 'debajo' || x.estado === 'en_riesgo')) {
    out.push({
      id: `kpi:${k.kpi.id}`,
      categoria: 'kpi_debajo',
      severidad: k.estado === 'debajo' ? 'alta' : 'media',
      titulo: `${k.kpi.clave} · ${k.kpi.nombre}`,
      responsable: k.kpi.areaIds.map(areaName).join(', ') || 'Sin gerencia',
      causa: `${KPI_ESTADO_LABELS[k.estado]}: ${k.real?.toLocaleString('es-MX')} vs meta ${(k.metaProporcional ?? k.meta)?.toLocaleString('es-MX')} ${k.kpi.unidad}.`,
      impacto: 'El objetivo estratégico asociado no se está alcanzando.',
      accion: 'Revisar los proyectos que contribuyen al KPI y ajustar plan o meta.',
      link: `/inversion?vista=kpis&kpi=${k.kpi.id}`,
    });
  }
  const kpisSinMeta = kpis.filter((k) => k.estado === 'sin_meta');
  if (kpisSinMeta.length) {
    out.push({
      id: 'kpi:sin-meta',
      categoria: 'kpi_debajo',
      severidad: 'baja',
      titulo: `${kpisSinMeta.length} KPI con resultado pero sin meta`,
      responsable: 'Dirección',
      causa: kpisSinMeta.map((k) => k.kpi.clave).join(', '),
      impacto: 'No es posible saber si el resultado es bueno o malo.',
      accion: 'Definir metas por periodo en Datos → Metas.',
      link: '/inversion?vista=kpis&estado=sin_meta',
    });
  }

  // 3. Presupuesto sin proyecto
  for (const l of budget.lines.filter((x) => x.vigente > 0 && x.sinAsignar > 0.5 && !x.line.reserva)) {
    out.push({
      id: `sinproy:${l.line.id}`,
      categoria: 'presupuesto_sin_proyecto',
      severidad: l.asignado === 0 ? 'media' : 'baja',
      titulo: `${l.line.clave} · ${l.line.nombre}`,
      responsable: l.line.areaId ? areaResp(l.line.areaId) : 'Dirección',
      causa: `${money(l.sinAsignar)} de ${money(l.vigente)} sin asignar a proyectos.`,
      impacto: 'No se puede medir qué resultados genera esa inversión.',
      accion: 'Asignar la partida a los proyectos que financia.',
      link: `/inversion?vista=presupuesto&partida=${l.line.id}`,
    });
  }

  // 4. Proyectos sin KPIs (P1 activos, uno por proyecto; el resto agregado por gerencia)
  const withKpi = new Set(db.projectKpis.map((l) => l.projectId));
  const sinKpi = active.filter((p) => !withKpi.has(p.id));
  for (const p of sinKpi.filter((x) => isStrategicP1(x))) {
    out.push({
      id: `sinkpi:${p.id}`,
      categoria: 'proyecto_sin_kpi',
      severidad: 'media',
      titulo: p.nombre,
      responsable: projResp(p),
      causa: 'Proyecto P1 estratégico sin KPI vinculado.',
      impacto: 'No hay forma de evaluar su contribución a los objetivos.',
      accion: 'Vincular el proyecto con los KPIs a los que contribuye.',
      link: `/proyectos/${p.id}`,
      projectId: p.id,
      areaId: p.areaId,
    });
  }
  const restoPorArea = new Map<ID, number>();
  for (const p of sinKpi.filter((x) => !isStrategicP1(x))) restoPorArea.set(p.areaId, (restoPorArea.get(p.areaId) ?? 0) + 1);
  for (const [areaId, n] of restoPorArea) {
    out.push({
      id: `sinkpi-area:${areaId}`,
      categoria: 'proyecto_sin_kpi',
      severidad: 'baja',
      titulo: `${areaName(areaId)}: ${n} proyecto(s) activos sin KPI`,
      responsable: areaResp(areaId),
      causa: 'Proyectos P2/P3 o sin prioridad estratégica P1 sin KPI vinculado.',
      impacto: 'Su contribución no se puede medir.',
      accion: 'Vincular KPIs cuando el proyecto tenga un resultado esperado medible.',
      link: `/inversion?vista=proyectos&area=${areaId}&sinkpi=1`,
      areaId,
    });
  }

  // 5. Inversión sin resultados: proyectos con presupuesto asignado cuyos KPIs no tienen resultados
  const resultsByKpi = new Set(db.results.filter((r) => r.kpiId).map((r) => r.kpiId));
  const asignadoPorProyecto = new Map<ID, number>();
  for (const a of db.budgetAllocations) asignadoPorProyecto.set(a.projectId, (asignadoPorProyecto.get(a.projectId) ?? 0) + a.monto);
  for (const [pid, monto] of asignadoPorProyecto) {
    const p = db.projects.find((x) => x.id === pid);
    if (!p) continue;
    const kids = db.projectKpis.filter((l) => l.projectId === pid).map((l) => l.kpiId);
    if (kids.some((k) => resultsByKpi.has(k))) continue;
    out.push({
      id: `invsinres:${pid}`,
      categoria: 'inversion_sin_resultado',
      severidad: 'media',
      titulo: p.nombre,
      responsable: projResp(p),
      causa: kids.length ? `${money(monto)} asignados; sus KPIs no tienen resultados registrados.` : `${money(monto)} asignados y sin KPI vinculado.`,
      impacto: 'Inversión sin evidencia de efectividad.',
      accion: kids.length ? 'Registrar resultados de sus KPIs o revisar la medición.' : 'Vincular KPIs y registrar resultados.',
      link: `/proyectos/${p.id}`,
      projectId: p.id,
      areaId: p.areaId,
    });
  }
  for (const s of scopes.filter((x) => (x.scope.inversion ?? 0) > 0 && x.metrics.slice(0, 5).every((m) => m.valor === null))) {
    out.push({
      id: `scope-sinres:${s.scope.id}`,
      categoria: 'inversion_sin_resultado',
      severidad: 'media',
      titulo: s.scope.nombre,
      responsable: areaResp(s.scope.areaId),
      causa: 'Inversión atribuible sin resultados del mismo periodo.',
      impacto: 'No se puede calcular el costo por resultado.',
      accion: 'Registrar los resultados del embudo para el periodo de la inversión.',
      link: `/inversion?vista=eficiencia`,
    });
  }

  // 6. Resultados sin inversión identificada / sin vínculo
  const sinKpiRes = db.results.filter((r) => !r.kpiId);
  if (sinKpiRes.length) {
    out.push({
      id: 'res:sin-vinculo',
      categoria: 'resultado_sin_inversion',
      severidad: 'baja',
      titulo: `${sinKpiRes.length} resultado(s) pendientes de vinculación`,
      responsable: 'Dirección',
      causa:
        sinKpiRes
          .slice(0, 4)
          .map((r) => r.metrica)
          .join(', ') + (sinKpiRes.length > 4 ? '…' : ''),
      impacto: 'El dato existe pero no se puede atribuir a una iniciativa.',
      accion: 'Vincular cada resultado con su KPI.',
      link: '/inversion?vista=kpis&vinculo=pendiente',
    });
  }
  const kpiConInversion = new Set<ID>();
  for (const l of db.projectKpis) if (asignadoPorProyecto.has(l.projectId)) kpiConInversion.add(l.kpiId);
  for (const s of scopes) if ((s.scope.inversion ?? 0) > 0) for (const id of Object.values(s.scope.etapas)) if (id) kpiConInversion.add(id);
  for (const k of db.kpis.filter((x) => x.activo && resultsByKpi.has(x.id) && !kpiConInversion.has(x.id) && x.grupo !== 'F')) {
    out.push({
      id: `ressininv:${k.id}`,
      categoria: 'resultado_sin_inversion',
      severidad: 'baja',
      titulo: `${k.clave} · ${k.nombre}`,
      responsable: k.areaIds.map(areaName).join(', ') || 'Sin gerencia',
      causa: 'Tiene resultados, pero ningún proyecto con presupuesto ni alcance de inversión lo respalda.',
      impacto: 'No se conoce cuánto cuesta lograr este resultado.',
      accion: 'Vincular el KPI con los proyectos y partidas que lo producen.',
      link: `/inversion?vista=kpis&kpi=${k.id}`,
    });
  }

  // 7. Sobrepresupuesto
  for (const l of budget.lines) {
    if (l.line.revolvente) {
      if (l.ejercido > l.vigente)
        out.push({
          id: `revolv:${l.line.id}`,
          categoria: 'sobrepresupuesto',
          severidad: 'media',
          titulo: `${l.line.nombre} (fondo revolvente)`,
          responsable: l.line.areaId ? areaResp(l.line.areaId) : 'Dirección',
          causa: `Gasto ${money(l.ejercido)} vs capital ${money(l.vigente)}.`,
          impacto: 'No es sobreejercicio si se repone con ventas: requiere conciliación.',
          accion: 'Conciliar ventas, cobranza, inventario y reinversión.',
          link: `/inversion?vista=presupuesto&partida=${l.line.id}`,
        });
      continue;
    }
    if (l.ejercido > l.vigente + 0.5) {
      out.push({
        id: `sobre:${l.line.id}`,
        categoria: 'sobrepresupuesto',
        severidad: 'alta',
        titulo: `${l.line.clave} · ${l.line.nombre}`,
        responsable: l.line.areaId ? areaResp(l.line.areaId) : 'Dirección',
        causa: `Ejercido ${money(l.ejercido)} vs vigente ${money(l.vigente)} (sobreejercicio ${money(l.ejercido - l.vigente)}).${l.reclasPendientes ? ` Reclasificación pendiente: ${money(l.reclasPendientes)}.` : ''}`,
        impacto: 'Presión sobre el presupuesto total.',
        accion: l.reclasPendientes ? 'Formalizar la reclasificación con Contabilidad o autorizar una transferencia.' : 'Autorizar transferencia o detener gasto.',
        link: `/inversion?vista=presupuesto&partida=${l.line.id}`,
      });
    } else if (l.ejercido + l.comprometido > l.vigente + 0.5) {
      out.push({
        id: `riesgo:${l.line.id}`,
        categoria: 'sobrepresupuesto',
        severidad: 'media',
        titulo: `${l.line.clave} · ${l.line.nombre}`,
        responsable: l.line.areaId ? areaResp(l.line.areaId) : 'Dirección',
        causa: `Ejercido + comprometido ${money(l.ejercido + l.comprometido)} supera el vigente ${money(l.vigente)}.`,
        impacto: 'Se sobreejercerá si se pagan los compromisos.',
        accion: 'Revisar compromisos o autorizar transferencia.',
        link: `/inversion?vista=presupuesto&partida=${l.line.id}`,
      });
    }
  }
  for (const s of budget.sinPartida.filter((x) => x.monto - x.reclasConfirmada > 0.5)) {
    out.push({
      id: `sinpartida:${s.categoria}`,
      categoria: 'sobrepresupuesto',
      severidad: 'alta',
      titulo: `Gasto sin partida: ${s.categoria}`,
      responsable: 'Dirección · Contabilidad',
      causa: `${money(s.monto)} registrados en una categoría contable sin partida autorizada.${s.reclasPendiente ? ' Reclasificación propuesta pendiente de formalizar.' : ''}`,
      impacto: 'Gasto fuera del presupuesto autorizado.',
      accion: 'Formalizar la reclasificación o asignarlo a una partida.',
      link: '/inversion?vista=presupuesto',
    });
  }

  // 8. Bloqueos que requieren intervención directiva
  const limite = new Date(new Date(`${today}T00:00:00`).getTime() - diasBloqueo * 86_400_000).toISOString();
  for (const b of db.blocks.filter(isBlockOpen)) {
    const p = db.projects.find((x) => x.id === b.projectId);
    if (!p) continue;
    const directiva = b.estado === 'escalado' || /direcci/i.test(b.dependeDe) || /direcci/i.test(b.areaDependencia) || (isStrategicP1(p) && b.createdAt < limite);
    if (!directiva) continue;
    out.push({
      id: `bloq:${b.id}`,
      categoria: 'bloqueo_directivo',
      severidad: b.estado === 'escalado' || isStrategicP1(p) ? 'alta' : 'media',
      titulo: `${p.nombre}: ${b.descripcion}`,
      responsable: projResp(p),
      causa:
        b.estado === 'escalado' ? `Escalado${b.escaladoA ? ` a ${b.escaladoA}` : ''}.` : b.createdAt < limite ? `Abierto desde ${b.createdAt.slice(0, 10)} en un P1.` : `Depende de ${b.dependeDe}.`,
      impacto: b.necesidad ? `Se necesita: ${b.necesidad}` : 'El proyecto no avanza.',
      accion: 'Decidir en la Weekly quién destraba y con qué fecha.',
      link: `/proyectos/${p.id}`,
      projectId: p.id,
      areaId: p.areaId,
    });
  }

  // 9. Pendientes de autorización (movimientos y reclasificaciones)
  for (const m of budget.movimientosPendientes) {
    out.push({
      id: `mov:${m.id}`,
      categoria: 'pendiente_autorizacion',
      severidad: 'media',
      titulo: `${m.folio} · ${m.concepto}`,
      responsable: 'Dirección · Contabilidad',
      causa: `${m.tipo === 'reclasificacion' ? 'Reclasificación de gasto' : 'Movimiento presupuestal'} ${m.estado === 'PROPUESTA' ? 'propuesto' : 'pendiente de autorización'}.`,
      impacto: m.tipo === 'reclasificacion' ? 'El gasto oficial por partida no la incluye hasta formalizarla.' : 'El presupuesto vigente no lo incluye hasta autorizarlo.',
      accion: 'Autorizar o rechazar.',
      link: '/inversion?vista=presupuesto&tab=movimientos',
    });
  }

  // 10. Calidad de datos: discrepancias entre fuentes (se muestran hasta que Dirección las resuelva)
  const conDiscrepancia: { id: string; titulo: string; texto: string; link: string }[] = [
    ...db.budgetLines.filter((l) => l.discrepancia).map((l) => ({ id: l.id, titulo: `Partida ${l.clave} · ${l.nombre}`, texto: l.discrepancia!, link: `/inversion?vista=presupuesto&partida=${l.id}` })),
    ...db.kpis.filter((k) => k.discrepancia).map((k) => ({ id: k.id, titulo: `KPI ${k.clave}`, texto: k.discrepancia!, link: `/inversion?vista=kpis&kpi=${k.id}` })),
    ...db.results.filter((r) => r.discrepancia).map((r) => ({ id: r.id, titulo: `Resultado ${r.metrica}`, texto: r.discrepancia!, link: r.kpiId ? `/inversion?vista=kpis&kpi=${r.kpiId}` : '/inversion?vista=kpis' })),
    ...db.spend.filter((x) => x.discrepancia).map((x) => ({ id: x.id, titulo: `Gasto ${x.categoria} ${x.mes}`, texto: x.discrepancia!, link: '/inversion?vista=presupuesto' })),
  ];
  for (const d of conDiscrepancia) {
    out.push({
      id: `discrepancia:${d.id}`,
      categoria: 'calidad_dato',
      severidad: 'media',
      titulo: d.titulo,
      responsable: 'Dirección',
      causa: d.texto,
      impacto: 'Dos fuentes no coinciden: la cifra no es definitiva.',
      accion: 'Resolver con el área responsable y borrar la discrepancia del registro.',
      link: d.link,
    });
  }

  // 11. Calidad de datos: KPIs sin fuente
  const sinFuente = db.kpis.filter((k) => k.activo && !k.fuente?.trim());
  if (sinFuente.length) {
    out.push({
      id: 'kpi:sin-fuente',
      categoria: 'calidad_dato',
      severidad: 'baja',
      titulo: `${sinFuente.length} KPI sin fuente`,
      responsable: 'Dirección',
      causa: sinFuente.map((k) => k.clave).join(', '),
      impacto: 'Sin fuente no hay trazabilidad.',
      accion: 'Registrar la fuente de cada KPI.',
      link: '/inversion?vista=kpis',
    });
  }
  return out;
}
