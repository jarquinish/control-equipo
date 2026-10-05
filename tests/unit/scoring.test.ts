import { describe, expect, it } from 'vitest';
import { calcScore, computePriority, priorityFromScore, suggestQuadrant } from '../../src/domain/scoring';
import { isoWeek, isValidDate, isValidTime } from '../../src/domain/dates';

describe('ponderación', () => {
  it('SCORE = impacto + urgencia + dependencia', () => {
    expect(calcScore(3, 3, 3)).toBe(9);
    expect(calcScore(1, 1, 1)).toBe(3);
    expect(calcScore(2, 3, 1)).toBe(6);
  });

  it('8–9 → P1, 6–7 → P2, 3–5 → P3', () => {
    expect([9, 8].map(priorityFromScore)).toEqual(['P1', 'P1']);
    expect([7, 6].map(priorityFromScore)).toEqual(['P2', 'P2']);
    expect([5, 4, 3].map(priorityFromScore)).toEqual(['P3', 'P3', 'P3']);
  });

  it('rechaza valores fuera de rango', () => {
    // @ts-expect-error valor inválido a propósito
    expect(() => calcScore(4, 1, 1)).toThrow();
    // @ts-expect-error valor inválido a propósito
    expect(() => calcScore(0, 1, 1)).toThrow();
    expect(() => priorityFromScore(10)).toThrow();
    expect(() => priorityFromScore(2)).toThrow();
  });

  it('override de Dirección conserva la prioridad calculada', () => {
    const r = computePriority({ impacto: 3, urgencia: 3, dependencia: 2, override: 'P2' });
    expect(r).toEqual({ score: 8, prioridadCalculada: 'P1', prioridadFinal: 'P2', ajusteDireccion: true });
    const same = computePriority({ impacto: 3, urgencia: 3, dependencia: 2, override: 'P1' });
    expect(same.ajusteDireccion).toBe(false);
  });

  it('sugiere cuadrante Eisenhower', () => {
    expect(suggestQuadrant(3, 3)).toBe('hacer');
    expect(suggestQuadrant(3, 1)).toBe('planificar');
    expect(suggestQuadrant(1, 3)).toBe('delegar');
    expect(suggestQuadrant(1, 1)).toBe('eliminar');
  });
});

describe('fechas', () => {
  it('valida fecha y hora', () => {
    expect(isValidDate('2026-10-05')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('05/10/2026')).toBe(false);
    expect(isValidTime('13:00')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
  });
  it('calcula semana ISO', () => {
    expect(isoWeek(new Date(2026, 9, 5))).toEqual({ year: 2026, week: 41 });
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
  });
});
