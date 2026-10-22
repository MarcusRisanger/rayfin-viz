import { describe, expect, it } from 'vitest';
import { validateSpec } from 'graphein';
import type { CachedQueryResult } from '@microsoft/fabric-app-data';

import { chartDomain, compare, createTrendSpec, evaluateStatus, previousMonth, scenarios, toKpiPoints } from './kpi';

describe('KPI query contract', () => {
  it('maps the SDK positional rows and unknown metadata without losing nulls', () => {
    const points = toKpiPoints(scenarios.gaps.result);
    expect(points[0].actual).toBe(268000);
    expect(points[1].actual).toBeNull();
    expect(points.at(-1)?.actual).toBeNull();
  });

  it('maps columns by exact name even when reordered', () => {
    const result = structuredClone(scenarios.good.result);
    if (result.status !== 'success') throw new Error('Expected success fixture');
    result.table.columns.reverse();
    result.table.rows.forEach((row) => row.reverse());
    expect(toKpiPoints(result).at(-1)?.actual).toBe(428000);
  });

  it('rejects missing fields, malformed rows, and unsafe measures', () => {
    const result = structuredClone(scenarios.good.result);
    if (result.status !== 'success') throw new Error('Expected success fixture');
    result.table.columns[1].name = '[Wrong measure]';
    expect(() => toKpiPoints(result)).toThrow('exactly one column');
    result.table.columns[1].name = '[Revenue]';
    result.table.rows[0][1] = Infinity;
    expect(() => toKpiPoints(result)).toThrow('finite');
    result.table.rows[0].pop();
    expect(() => toKpiPoints(result)).toThrow('width');
  });

  it('accepts Arrow metadata and numeric strings while preserving zero', () => {
    const result = structuredClone(scenarios.good.result);
    if (result.status !== 'success') throw new Error('Expected success fixture');
    result.table.columns[1].dataType = 'Double';
    result.table.rows[0][1] = '0';
    expect(toKpiPoints(result)[0].actual).toBe(0);
  });

  it('keeps query errors distinct from empty results', () => {
    expect(toKpiPoints(scenarios.empty.result)).toEqual([]);
    expect(() => toKpiPoints(scenarios.error.result as CachedQueryResult)).toThrow('could not be completed');
  });
});

describe('KPI evaluation', () => {
  const higher = { kind: 'higher', tolerance: 2 } as const;
  it('evaluates all four states and the exact tolerance boundary', () => {
    expect(evaluateStatus(428000, 400000, higher)).toBe('good');
    expect(evaluateStatus(392000, 400000, higher)).toBe('neutral');
    expect(evaluateStatus(391999, 400000, higher)).toBe('bad');
    expect(evaluateStatus(428000, 400000, { kind: 'none' })).toBe('unrated');
    expect(evaluateStatus(null, 400000, higher)).toBe('unrated');
  });

  it('supports lower-is-better and within-range rules', () => {
    expect(evaluateStatus(350000, 400000, { kind: 'lower', tolerance: 2 })).toBe('good');
    expect(evaluateStatus(405000, 400000, { kind: 'lower', tolerance: 2 })).toBe('neutral');
    expect(evaluateStatus(428000, null, { kind: 'range', minimum: 400000, maximum: 450000 })).toBe('good');
  });

  it('allows good target attainment and negative month-on-month change', () => {
    const points = toKpiPoints(scenarios.mixed.result);
    expect(evaluateStatus(points.at(-1)!.actual, points.at(-1)!.target, higher)).toBe('good');
    expect(compare(points.at(-1)!.actual, previousMonth(points)!.actual)?.difference).toBe(-27000);
  });

  it('does not invent percentage changes or a missing previous month', () => {
    expect(compare(100, 0)).toEqual({ difference: 100, percent: null });
    expect(compare(100, null)).toBeNull();
    const points = toKpiPoints(scenarios.good.result);
    expect(previousMonth(points.filter((point) => !point.date.startsWith('2026-05')))).toBeUndefined();
  });
});

describe('KPI trend spec', () => {
  it('includes zero and the target without clipping negative observations', () => {
    const points = toKpiPoints(scenarios.good.result);
    expect(chartDomain(points, 'zero', true)).toEqual([0, 500000]);
    points[0].actual = -100000;
    const [minimum, maximum] = chartDomain(points, 'zero', true);
    expect(minimum).toBeLessThan(-100000);
    expect(maximum).toBeGreaterThan(428000);
  });

  it('validates every nonempty fixture and only fills a zero-based scale', () => {
    for (const scenario of Object.values(scenarios)) {
      if (scenario.result.status !== 'success' || !scenario.result.table.rows.length) continue;
      for (const mode of ['zero', 'detail'] as const) {
        const spec = createTrendSpec(toKpiPoints(scenario.result), {
          mode, showTarget: true, color: '#17805c', referenceColor: '#68716d', theme: 'light',
        });
        expect(validateSpec(spec).errors).toEqual([]);
        expect(spec.area).toBe(mode === 'zero');
      }
    }
  });
});