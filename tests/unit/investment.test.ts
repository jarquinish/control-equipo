import { describe, expect, it } from 'vitest';
import { budgetSummary } from '../../src/domain/investment/budget';
import { evaluateScope } from '../../src/domain/investment/efficiency';
import { aggregate, evaluateKpi } from '../../src/domain/investment/kpis';
import { executiveAlerts } from '../../src/domain/investment/alerts';
import { DEFAULT_INVESTMENT_PRIORITY, priorityConfigErrors, priorityIndexMap } from '../../src/domain/investment/priorityIndex';
import { parseContable } from '../../src/domain/investment/contable';
import type { EfficiencyScope, Kpi, ResultRecord } from '../../src/domain/types';
import { ValidationError } from '../../src/domain/validation';
import { setup } from './helpers';

// Cifras ficticias: las reales viven fuera del repositorio (paquete de datos).
const T = '2026-01-01T00:00:00.000Z';
const base = { createdAt: T, updatedAt: T };
const fuente = { fuente: 'prueba', estado: 'CONFIRMADO' as const };
const per = (inicio: string, fin: string) => ({ inicio, fin });

async function seeded() {
  const s = await setup();
  const inv = s.svc.investment;
  inv.save('budgetLines', {
    id: 'L1',
    clave: '01',
    nombre: 'Digital',
    original: 1000,
    categoriasContables: ['Google'],
    orden: 1,
    ...fuente,
  });
  inv.save('budgetLines', {
    id: 'L2',
    clave: '02',
    nombre: 'Branding',
    original: 500,
    categoriasContables: ['Branding'],
    orden: 2,
    ...fuente,
  });
  inv.save('budgetLines', {
    id: 'L3',
    clave: '03',
    nombre: 'Herramientas',
    original: 100,
    categoriasContables: ['Herramientas'],
    orden: 3,
    ...fuente,
  });
  inv.save('budgetMovements', {
    id: 'M1',
    folio: 'M1',
    tipo: 'transferencia',
    deLineaId: 'L1',
    aLineaId: 'L2',
    monto: 200,
    concepto: 'x',
    ...fuente,
  });
  inv.save('budgetMovements', {
    id: 'M2',
    folio: 'M2',
    tipo: 'ampliacion',
    aLineaId: 'L1',
    monto: 50,
    concepto: 'x',
    ...fuente,
  });
  inv.save('budgetMovements', {
    id: 'M3',
    folio: 'M3',
    tipo: 'ampliacion',
    aLineaId: 'L3',
    monto: 999,
    concepto: 'pendiente',
    fuente: 'x',
    estado: 'PENDIENTE',
  });
  inv.save('budgetMovements', {
    id: 'R1',
    folio: 'R1',
    tipo: 'reclasificacion',
    deLineaId: 'L3',
    aLineaId: 'L2',
    monto: 60,
    concepto: 'x',
    fuente: 'x',
    estado: 'PENDIENTE',
  });
  inv.save('budgetMovements', {
    id: 'R2',
    folio: 'R2',
    tipo: 'reclasificacion',
    deCategoria: 'Content',
    aLineaId: 'L2',
    concepto: 'x',
    fuente: 'x',
    estado: 'PENDIENTE',
  });
  for (const [cat, mes, monto] of [
    ['Google', '2026-01', 300],
    ['Google', '2026-02', 100],
    ['Branding', '2026-01', 50],
    ['Herramientas', '2026-01', 150],
    ['Content', '2026-02', 40],
  ] as const)
    inv.save('spend', { categoria: cat, mes, monto, ...fuente });
  return s;
}

describe('control presupuestal', () => {
  it('vigente, ejercido, sin partida y reclasificaciones sin doble conteo', async () => {
    const { store } = await seeded();
    const b = budgetSummary(store.getState());
    const l = Object.fromEntries(b.lines.map((x) => [x.line.id, x]));
    expect(l.L1.vigente).toBe(850); // 1000 − 200 + 50
    expect(l.L2.vigente).toBe(700);
    expect(l.L3.vigente).toBe(100); // la ampliación pendiente no cuenta
    expect(l.L1.ejercido).toBe(400);
    expect(l.L3.semaforo).toBe('sobre');
    // Reclasificaciones pendientes: sólo en «con propuestas»
    expect(l.L2.ejercido).toBe(50);
    expect(l.L2.ejercidoConPropuestas).toBe(150); // 50 + 60 (R1) + 40 (Content completo)
    expect(l.L3.ejercidoConPropuestas).toBe(90);
    expect(b.sinPartida).toEqual([
      {
        categoria: 'Content',
        monto: 40,
        reclasPendiente: 40,
        reclasConfirmada: 0,
      },
    ]);
    expect(b.totales.ejercido).toBe(640);
    expect(b.totales.gastoTotalFuente).toBe(640);
    expect(b.totales.ejercidoConPropuestas).toBe(640);
    expect(b.totales.vigente).toBe(1650);
    expect(b.checks.every((c) => c.ok)).toBe(true);
    expect(b.movimientosPendientes.map((m) => m.folio).sort()).toEqual(['M3', 'R1', 'R2']);
  });

  it('una reclasificación confirmada mueve gasto oficial y el total no cambia', async () => {
    const { store, svc } = await seeded();
    svc.investment.save('budgetMovements', {
      ...store.get('budgetMovements', 'R2')!,
      estado: 'CONFIRMADO',
    });
    const b = budgetSummary(store.getState());
    expect(b.lines.find((x) => x.line.id === 'L2')!.ejercido).toBe(90);
    expect(b.sinPartida[0].reclasConfirmada).toBe(40);
    expect(b.totales.ejercido).toBe(640);
  });

  it('no asigna a proyectos más que el vigente ni compromete más que el disponible', async () => {
    const { svc, areas } = await seeded();
    const p = svc.projects.create({
      nombre: 'Campaña',
      areaId: areas['Marketing Digital'],
      impacto: 3,
      urgencia: 2,
      dependencia: 1,
    });
    svc.investment.save('budgetAllocations', {
      lineaId: 'L1',
      projectId: p.id,
      monto: 800,
      estado: 'CONFIRMADO',
    });
    const p2 = svc.projects.create({
      nombre: 'Otra',
      areaId: areas['Diseño'],
      impacto: 1,
      urgencia: 1,
      dependencia: 1,
    });
    expect(() =>
      svc.investment.save('budgetAllocations', {
        lineaId: 'L1',
        projectId: p2.id,
        monto: 51,
        estado: 'CONFIRMADO',
      }),
    ).toThrow(/sólo tiene/);
    expect(() =>
      svc.investment.save('budgetAllocations', {
        lineaId: 'L1',
        projectId: p.id,
        monto: 1,
        estado: 'CONFIRMADO',
      }),
    ).toThrow(/ya tiene asignación/);
    // Disponible L1 = 850 − 400 = 450
    expect(() =>
      svc.investment.save('budgetCommitments', {
        lineaId: 'L1',
        concepto: 'pauta',
        monto: 451,
        fecha: '2026-03-01',
        situacion: 'comprometido',
        ...fuente,
      }),
    ).toThrow(/disponible/);
    svc.investment.save('budgetCommitments', {
      lineaId: 'L1',
      projectId: p.id,
      concepto: 'pauta',
      monto: 450,
      fecha: '2026-03-01',
      situacion: 'comprometido',
      ...fuente,
    });
  });

  it('valida movimientos, duplicados de gasto y categorías repetidas', async () => {
    const { svc } = await seeded();
    expect(() =>
      svc.investment.save('budgetMovements', {
        folio: 'X',
        tipo: 'transferencia',
        deLineaId: 'L1',
        aLineaId: 'L1',
        monto: 1,
        concepto: 'x',
        ...fuente,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      svc.investment.save('budgetMovements', {
        folio: 'X',
        tipo: 'transferencia',
        deLineaId: 'L3',
        aLineaId: 'L1',
        monto: 101,
        concepto: 'x',
        ...fuente,
      }),
    ).toThrow(/negativo/);
    expect(() =>
      svc.investment.save('spend', {
        categoria: 'google',
        mes: '2026-01',
        monto: 1,
        ...fuente,
      }),
    ).toThrow(/dos veces/);
    expect(() =>
      svc.investment.save('budgetLines', {
        clave: '09',
        nombre: 'Otra',
        original: 1,
        categoriasContables: ['Google'],
        orden: 9,
        ...fuente,
      }),
    ).toThrow(/dos veces/);
  });
});

const kpi = (over: Partial<Kpi> = {}): Kpi => ({
  id: 'K',
  clave: 'K',
  nombre: 'Leads',
  definicion: 'x',
  grupo: 'B',
  tipo: 'actividad',
  areaIds: [],
  unidad: 'leads',
  sentido: 'mayor',
  agregacion: 'suma',
  fuente: 'x',
  estado: 'CONFIRMADO',
  activo: true,
  ...base,
  ...over,
});
const res = (id: string, inicio: string, fin: string, valor: number, over: Partial<ResultRecord> = {}): ResultRecord => ({
  id,
  kpiId: 'K',
  metrica: 'm',
  valor,
  unidad: 'leads',
  periodo: per(inicio, fin),
  ...fuente,
  ...base,
  ...over,
});

describe('KPIs', () => {
  it('suma los meses dentro de la meta trimestral y califica', () => {
    const results = [res('a', '2026-01-01', '2026-01-31', 30), res('b', '2026-02-01', '2026-02-28', 30), res('c', '2026-03-01', '2026-03-31', 30)];
    const e = evaluateKpi(
      kpi(),
      [
        {
          id: 't',
          kpiId: 'K',
          periodo: per('2026-01-01', '2026-03-31'),
          meta: 100,
          ...fuente,
          ...base,
        },
      ],
      results,
      '2026-04-10',
    );
    expect(e.real).toBe(90);
    expect(e.cumplimiento).toBeCloseTo(0.9);
    expect(e.estado).toBe('en_riesgo');
  });

  it('no suma dos veces un trimestre y sus meses; detecta traslapes irregulares', () => {
    const results = [res('q', '2026-01-01', '2026-03-31', 90), res('a', '2026-01-01', '2026-01-31', 30), res('b', '2026-02-01', '2026-02-28', 30), res('c', '2026-03-01', '2026-03-31', 30)];
    expect(aggregate(kpi(), results, per('2026-01-01', '2026-03-31')).valor).toBe(90); // el del periodo exacto manda
    expect(aggregate(kpi(), results, per('2026-01-01', '2026-06-30')).valor).toBe(90); // serie mensual, sin duplicar el trimestre
    const raros = [res('x', '2026-01-01', '2026-02-15', 10), res('y', '2026-02-01', '2026-03-31', 10)];
    expect(aggregate(kpi(), raros, per('2026-01-01', '2026-03-31')).traslape).toBe(true);
  });

  it('periodo en curso: meta proporcional; menor es mejor; sin meta', () => {
    const e = evaluateKpi(
      kpi(),
      [
        {
          id: 't',
          kpiId: 'K',
          periodo: per('2026-01-01', '2026-12-31'),
          meta: 1200,
          ...fuente,
          ...base,
        },
      ],
      [res('a', '2026-01-01', '2026-06-30', 500)],
      '2026-07-15',
    );
    expect(e.metaProporcional).toBeCloseTo(595.07, 1);
    expect(e.estado).toBe('debajo'); // 500 / 595 = 84 %
    const m = evaluateKpi(
      kpi({ sentido: 'menor' }),
      [
        {
          id: 't',
          kpiId: 'K',
          periodo: per('2026-01-01', '2026-01-31'),
          meta: 100,
          ...fuente,
          ...base,
        },
      ],
      [res('a', '2026-01-01', '2026-01-31', 80)],
      '2026-02-10',
    );
    expect(m.estado).toBe('cumplido');
    expect(evaluateKpi(kpi(), [], [res('a', '2026-01-01', '2026-01-31', 5)], '2026-02-01').estado).toBe('sin_meta');
  });
});

describe('eficiencia y rentabilidad', () => {
  const kpis = ['leads', 'mql', 'sql', 'cierres'].map((k) => kpi({ id: k, clave: k }));
  const results = [
    res('l1', '2026-01-01', '2026-01-31', 100, { kpiId: 'leads' }),
    res('l2', '2026-02-01', '2026-02-28', 100, { kpiId: 'leads' }),
    res('m', '2026-01-01', '2026-02-28', 50, { kpiId: 'mql' }),
    res('s', '2026-01-01', '2026-02-28', 10, {
      kpiId: 'sql',
      estado: 'PENDIENTE',
    }),
    res('c', '2026-01-01', '2026-01-31', 2, { kpiId: 'cierres' }),
  ];
  const scope: EfficiencyScope = {
    id: 'S',
    nombre: 'Franquicias',
    projectIds: [],
    lineaIds: [],
    periodo: per('2026-01-01', '2026-02-28'),
    inversion: 10000,
    etapas: { leads: 'leads', mql: 'mql', sql: 'sql', cierres: 'cierres' },
    ...fuente,
    ...base,
  };

  it('calcula costos con inversión y resultados del mismo periodo', () => {
    const e = evaluateScope(scope, { kpis, results, revenues: [] });
    const m = Object.fromEntries(e.metrics.map((x) => [x.key, x]));
    expect(m.cpl.valor).toBe(50);
    expect(m.cpmql.valor).toBe(200);
    expect(m.cpsql.valor).toBe(1000);
    expect(m.cpcierre.valor).toBeNull(); // los cierres sólo cubren enero
    expect(m.cpcierre.motivo).toMatch(/no todo el periodo/);
    expect(m.cpa.motivo).toMatch(/no define la etapa/);
    expect(m.roas.motivo).toMatch(/No calculable con los datos disponibles/);
    expect(m.roi.motivo).toMatch(/colocación hipotecaria no son beneficio/);
    expect(e.conversiones.find((c) => c.de === 'Leads' && c.a === 'MQL')!.valor).toBe(25);
    expect(e.advertencias.join(' ')).toMatch(/SQL: incluye resultados pendientes/);
  });

  it('sin inversión no hay costos; ROI exige criterio y beneficio del mismo periodo', () => {
    expect(evaluateScope({ ...scope, inversion: null }, { kpis, results, revenues: [] }).metrics.every((m) => m.valor === null)).toBe(true);
    const revenues = [
      {
        id: 'b',
        concepto: 'Margen',
        tipo: 'beneficio_economico' as const,
        monto: 15000,
        periodo: scope.periodo,
        scopeId: 'S',
        ...fuente,
        ...base,
      },
    ];
    const sinCriterio = evaluateScope(scope, {
      kpis,
      results,
      revenues,
    }).metrics.find((x) => x.key === 'roi')!;
    expect(sinCriterio.valor).toBeNull();
    const roi = evaluateScope({ ...scope, criterioRoi: 'Margen de regalías año 1' }, { kpis, results, revenues }).metrics.find((x) => x.key === 'roi')!;
    expect(roi.valor).toBe(50);
  });
});

describe('permisos, integridad y alertas', () => {
  it('una gerencia no toca cifras ni confirma resultados; sí vincula y captura pendientes', async () => {
    const { svc, store, ana, areas } = await seeded();
    svc.investment.save('kpis', kpi({ id: 'K1', clave: 'K1' }) as never);
    const p = svc.projects.create({
      nombre: 'Campaña',
      areaId: areas['Diseño'],
      impacto: 3,
      urgencia: 3,
      dependencia: 1,
    });
    store.identity = ana.id;
    store.role = 'GERENTE';
    expect(() =>
      svc.investment.save('budgetLines', {
        clave: '9',
        nombre: 'x',
        original: 1,
        categoriasContables: [],
        orden: 9,
        ...fuente,
      }),
    ).toThrow(/Sólo Dirección/);
    expect(() =>
      svc.investment.save('results', {
        kpiId: 'K1',
        metrica: 'm',
        valor: 1,
        unidad: 'u',
        periodo: per('2026-01-01', '2026-01-31'),
        ...fuente,
      }),
    ).toThrow(/Sólo Dirección confirma/);
    const r = svc.investment.save('results', {
      kpiId: 'K1',
      metrica: 'm',
      valor: 1,
      unidad: 'u',
      periodo: per('2026-01-01', '2026-01-31'),
      fuente: 'x',
      estado: 'PENDIENTE',
    });
    svc.investment.save('projectKpis', {
      projectId: p.id,
      kpiId: 'K1',
      contribucion: 'directa',
    });
    expect(() =>
      svc.investment.save('results', {
        kpiId: 'K1',
        metrica: 'otra',
        valor: 2,
        unidad: 'u',
        periodo: per('2026-01-01', '2026-01-31'),
        fuente: 'x',
        estado: 'PENDIENTE',
      }),
    ).toThrow(/duplicarlo/);
    store.role = 'DIRECTOR';
    svc.investment.save('results', {
      ...store.get('results', r.id)!,
      estado: 'CONFIRMADO',
    });
    store.role = 'GERENTE';
    expect(() =>
      svc.investment.save('results', {
        ...store.get('results', r.id)!,
        valor: 5,
      }),
    ).toThrow(/sólo Dirección lo modifica/);
    expect(() => svc.investment.remove('kpis', 'K1')).toThrow(/Sólo Dirección/);
    store.role = 'DIRECTOR';
    expect(() => svc.investment.remove('kpis', 'K1')).toThrow(/resultado/);
  });

  it('rechaza KPIs sin fuente y la colocación hipotecaria como ingreso', async () => {
    const { svc } = await seeded();
    expect(() =>
      svc.investment.save('kpis', {
        ...kpi({ id: 'K2', clave: 'K2', fuente: ' ' }),
      } as never),
    ).toThrow(/sin fuente/);
    expect(() =>
      svc.investment.save('revenues', {
        concepto: 'Colocación hipotecaria de la red',
        tipo: 'beneficio_economico',
        monto: 1,
        periodo: per('2026-01-01', '2026-01-31'),
        fuente: 'x',
        estado: 'PENDIENTE',
      }),
    ).toThrow(/no es ingreso de SOC/);
  });

  it('alertas: sobreejercicio, gasto sin partida, pendientes y P1 sin KPI', async () => {
    const { store, svc, areas } = await seeded();
    svc.projects.create({
      nombre: 'SOC TV · temporada',
      areaId: areas['Contenido'],
      impacto: 3,
      urgencia: 3,
      dependencia: 1,
    });
    const db = store.getState();
    const alerts = executiveAlerts(db, {
      today: '2026-10-05',
      budget: budgetSummary(db),
      kpis: [],
      scopes: [],
    });
    const cats = new Set(alerts.map((a) => a.categoria));
    expect(alerts.find((a) => a.id === 'sobre:L3')?.causa).toMatch(/Reclasificación pendiente/);
    expect(alerts.some((a) => a.id === 'sinpartida:Content')).toBe(true);
    expect(cats.has('pendiente_autorizacion')).toBe(true);
    expect(cats.has('proyecto_sin_kpi')).toBe(true);
    expect(cats.has('presupuesto_sin_proyecto')).toBe(true);
    svc.investment.save('budgetLines', { ...store.get('budgetLines', 'L1')!, discrepancia: 'La referencia la nombra «Paid».' });
    const db2 = store.getState();
    expect(executiveAlerts(db2, { today: '2026-10-05', budget: budgetSummary(db2), kpis: [], scopes: [] }).find((a) => a.id === 'discrepancia:L1')?.causa).toMatch(/Paid/);
  });

  it('el paquete sólo agrega: lo existente se conserva y no se duplica', async () => {
    const { svc, store, areas } = await seeded();
    const pkg = {
      app: 'alignment-unblock' as const,
      tipo: 'paquete-inversion' as const,
      version: 1 as const,
      generado: 'x',
      descripcion: 'x',
      fuentes: [],
      discrepancias: [],
      data: {
        budgetLines: [
          {
            id: 'L1',
            clave: '01',
            nombre: 'OTRO NOMBRE',
            original: 1,
            categoriasContables: [],
            orden: 1,
            ...fuente,
            ...base,
          },
        ],
        kpis: [
          {
            ...kpi({
              id: 'KN',
              clave: 'KN',
              areaIds: ['area:Diseño' as string],
            }),
          },
        ],
      },
    };
    const { plan } = svc.investment.planImport(pkg, {
      Diseño: areas['Diseño'],
    });
    const lines = plan.find((p) => p.collection === 'budgetLines')!;
    expect(lines.nuevos).toHaveLength(0);
    expect(lines.distintos).toEqual(['L1']);
    expect(svc.investment.applyImport(plan)).toBe(1);
    expect(store.get('budgetLines', 'L1')!.nombre).toBe('Digital');
    expect(store.get('kpis', 'KN')!.areaIds).toEqual([areas['Diseño']]);
    expect(svc.investment.applyImport(svc.investment.planImport(pkg, { Diseño: areas['Diseño'] }).plan)).toBe(0);
  });

  it('índice complementario: la inversión no supera al impacto y tiene tope', async () => {
    expect(priorityConfigErrors(DEFAULT_INVESTMENT_PRIORITY)).toEqual([]);
    expect(
      priorityConfigErrors({
        ...DEFAULT_INVESTMENT_PRIORITY,
        pesos: {
          ...DEFAULT_INVESTMENT_PRIORITY.pesos,
          impacto: 5,
          inversion: 25,
        },
      }).join(' '),
    ).toMatch(/no puede pesar más que el impacto/);
    const { svc, store, areas } = await seeded();
    const caro = svc.projects.create({
      nombre: 'Caro',
      areaId: areas['Diseño'],
      impacto: 1,
      urgencia: 1,
      dependencia: 1,
    });
    const clave = svc.projects.create({
      nombre: 'Clave',
      areaId: areas['Diseño'],
      impacto: 3,
      urgencia: 1,
      dependencia: 1,
    });
    svc.investment.save('budgetAllocations', {
      lineaId: 'L1',
      projectId: caro.id,
      monto: 800,
      estado: 'CONFIRMADO',
    });
    const idx = priorityIndexMap(store.getState(), '2026-10-05', DEFAULT_INVESTMENT_PRIORITY);
    expect(idx.get(clave.id)!.total).toBeGreaterThan(idx.get(caro.id)!.total);
  });
});

describe('reporte contable', () => {
  const wb = (rows: (string | number | null)[][]) => ({
    date1904: false,
    sheets: [{ name: 'RESUMEN', rows }],
  });
  it('lee categorías y meses y valida el cuadre', () => {
    const r = parseContable(wb([['Título'], ['REPORTE MKT', 'Enero', 'Febrero', 'Marzo', 2026], ['Google', 10, 20, 0, 30], ['Branding', 5, 0, 0, 5], [2026, 15, 20, 0, 35]]), 2026);
    expect(r.meses).toEqual(['2026-01', '2026-02']);
    expect(r.corte).toBe('2026-02');
    expect(r.total).toBe(35);
    expect(() =>
      parseContable(
        wb([
          ['REPORTE MKT', 'Enero', 2026],
          ['Google', 10, 11],
          [2026, 10, 11],
        ]),
        2026,
      ),
    ).toThrow(/no cuadra/);
  });

  it('agrega meses nuevos y sólo corrige meses previos si se confirma', async () => {
    const { svc, store } = await seeded();
    const report = parseContable(
      wb([
        ['REPORTE MKT', 'Enero', 'Febrero', 'Marzo', 2026],
        ['Google', 300, 110, 70, 480],
        [2026, 300, 110, 70, 480],
      ]),
      2026,
    );
    const plan = svc.investment.planSpend(report, 'contable.xlsx');
    expect(plan.nuevos.map((n) => n.mes)).toEqual(['2026-03']);
    expect(plan.cambios).toHaveLength(1);
    expect(plan.iguales).toBe(1);
    svc.investment.applySpend(plan, false);
    expect(store.getState().spend.find((s) => s.categoria === 'Google' && s.mes === '2026-02')!.monto).toBe(100);
    svc.investment.applySpend(svc.investment.planSpend(report, 'contable.xlsx'), true);
    const feb = store.getState().spend.find((s) => s.categoria === 'Google' && s.mes === '2026-02')!;
    expect(feb.monto).toBe(110);
    expect(feb.nota).toMatch(/antes 100/);
    expect(store.get('settings', 'settings')!.corteContable).toBe('2026-03');
  });
});
