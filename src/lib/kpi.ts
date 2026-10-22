import type { CachedQueryResult } from '@microsoft/fabric-app-data';
import type { LineSpec, ThemeInput } from 'graphein';

export type KpiStatus = 'good' | 'neutral' | 'bad' | 'unrated';
export type ScaleMode = 'zero' | 'detail';
export type KpiRule =
  | { kind: 'higher' | 'lower'; tolerance: number }
  | { kind: 'range'; minimum: number; maximum: number }
  | { kind: 'none' };

export interface KpiPoint {
  date: string;
  actual: number | null;
  target: number | null;
}

export interface KpiBindings {
  date: string;
  actual: string;
  target: string;
}

export const revenueBindings: KpiBindings = {
  date: 'Date[Month]',
  actual: '[Revenue]',
  target: '[Revenue Target]',
};

export const statusLabels: Record<KpiStatus, string> = {
  good: 'Good', neutral: 'Neutral', bad: 'Bad', unrated: 'Unrated',
};

function fixture(values: (number | null)[], id: string): CachedQueryResult {
  return {
    status: 'success', requestId: `fixture-${id}`, fromCache: false,
    table: {
      columns: Object.values(revenueBindings).map((name) => ({ name, dataType: 'unknown' })),
      rows: values.map((actual, index) => [
        `2026-${String(index + 1).padStart(2, '0')}-01T00:00:00.000`, actual, 400000,
      ]),
    },
  };
}

export const scenarios = {
  good: { label: 'Above target', result: fixture([268000, 308000, 294000, 356000, 380000, 428000], 'good') },
  neutral: { label: 'Near target', result: fixture([290000, 315000, 360000, 372000, 399000, 394000], 'neutral') },
  bad: { label: 'Below target', result: fixture([410000, 390000, 405000, 375000, 360000, 332000], 'bad') },
  unrated: { label: 'No evaluation rule', result: fixture([268000, 308000, 294000, 356000, 380000, 428000], 'unrated') },
  mixed: { label: 'Above target, down from May', result: fixture([268000, 308000, 294000, 410000, 455000, 428000], 'mixed') },
  gaps: { label: 'Missing observations', result: fixture([268000, null, 294000, 356000, 380000, null], 'gaps') },
  empty: { label: 'No observations', result: fixture([], 'empty') },
  error: {
    label: 'Query error',
    result: {
      status: 'error', requestId: 'fixture-error', fromCache: false,
      error: { category: 'query', message: 'The revenue query could not be completed.' },
    } satisfies CachedQueryResult,
  },
};

export type ScenarioId = keyof typeof scenarios;

function numericValue(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER) {
    throw new Error('Expected a finite, safely representable numeric measure.');
  }
  return parsed;
}

export function toKpiPoints(result: CachedQueryResult, bindings = revenueBindings): KpiPoint[] {
  if (result.status === 'error') throw new Error(result.error.message);
  const indexes = [bindings.date, bindings.actual, bindings.target].map((name) => {
    const matches = result.table.columns.flatMap((column, index) => column.name === name ? [index] : []);
    if (matches.length !== 1) throw new Error(`Expected exactly one column named ${name}.`);
    return matches[0];
  });
  const dates = new Set<string>();
  return result.table.rows.map((row) => {
    if (row.length !== result.table.columns.length) throw new Error('Query row width does not match its columns.');
    const date = row[indexes[0]];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(date)) {
      throw new Error('Expected a timezone-unaware model date.');
    }
    const parsed = new Date(`${date}Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date.slice(0, 10)) {
      throw new Error('Invalid model date.');
    }
    if (dates.has(date)) throw new Error('Expected one observation per month.');
    dates.add(date);
    return { date, actual: numericValue(row[indexes[1]]), target: numericValue(row[indexes[2]]) };
  }).sort((first, second) => first.date.localeCompare(second.date));
}

export function evaluateStatus(value: number | null, target: number | null, rule: KpiRule): KpiStatus {
  if (value == null || rule.kind === 'none') return 'unrated';
  if (rule.kind === 'range') {
    if (rule.minimum > rule.maximum) return 'unrated';
    return value >= rule.minimum && value <= rule.maximum ? 'good' : 'bad';
  }
  if (target == null || rule.tolerance < 0 || !Number.isFinite(rule.tolerance)) return 'unrated';
  const favorableDifference = (value - target) * (rule.kind === 'higher' ? 1 : -1);
  if (favorableDifference >= 0) return 'good';
  return -favorableDifference <= Math.abs(target) * rule.tolerance / 100 ? 'neutral' : 'bad';
}

export function compare(value: number | null, reference: number | null) {
  if (value == null || reference == null) return null;
  const difference = value - reference;
  return { difference, percent: reference === 0 ? null : difference / Math.abs(reference) * 100 };
}

export function previousMonth(points: KpiPoint[]): KpiPoint | undefined {
  const latest = points.at(-1);
  if (!latest) return undefined;
  const [year, month] = latest.date.slice(0, 7).split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
  return points.find((point) => point.date.startsWith(previous));
}

export function chartDomain(points: KpiPoint[], mode: ScaleMode, includeTarget: boolean): [number, number] {
  const values = points.flatMap((point) => [point.actual, ...(includeTarget ? [point.target] : [])])
    .filter((value): value is number => value != null);
  if (!values.length) return [0, 1];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.15, Math.abs(maximum) * 0.05, 1);
  const low = mode === 'zero' ? Math.min(0, minimum - (minimum < 0 ? padding : 0)) : minimum - padding;
  const high = mode === 'zero' ? Math.max(0, maximum + padding) : maximum + padding;
  const step = 10 ** Math.floor(Math.log10(Math.max(high - low, 1))) / 2;
  return [Math.floor(low / step) * step, Math.ceil(high / step) * step];
}

export function formatMoney(value: number | null, compact = true): string {
  if (value == null) return 'Not available';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function monthLabel(date: string, short = false): string {
  return new Intl.DateTimeFormat('en-US', { month: short ? 'short' : 'long', year: short ? undefined : 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

export function createTrendSpec(points: KpiPoint[], options: {
  mode: ScaleMode; showTarget: boolean; color: string; referenceColor: string; theme: ThemeInput;
}): LineSpec {
  const domain = chartDomain(points, options.mode, options.showTarget);
  const latest = points.at(-1);
  const target = latest?.target;
  return {
    type: 'line',
    data: points.map((point) => ({ date: point.date, actual: point.actual })),
    description: 'Monthly revenue in USD. Missing observations are gaps. The current month is the final point.',
    encoding: {
      x: { field: 'date', type: 'temporal', format: '%b %Y' },
      y: { field: 'actual', type: 'quantitative', format: '$,.0f', scale: { domain, nice: false, zero: options.mode === 'zero' } },
    },
    curve: 'linear', area: options.mode === 'zero', points: true,
    palette: [options.color], theme: options.theme,
    axes: {
      x: { grid: false, ticks: 6, format: '%b', title: '' },
      y: { grid: true, tickValues: [domain[0], (domain[0] + domain[1]) / 2, domain[1]], format: '$.3s', title: '' },
    },
    padding: { top: 18, right: 20, bottom: 6, left: 4 },
    legend: false, tooltip: { focus: false }, animation: { duration: 550 },
    annotations: [
      ...(options.showTarget && target != null ? [{ type: 'line' as const, axis: 'y' as const, value: target,
        label: `Target ${formatMoney(target)}`, color: options.referenceColor, strokeDash: [5, 5], labelPosition: 'start' as const }] : []),
      ...(latest?.actual != null ? [{ type: 'point' as const, x: latest.date, y: latest.actual,
        markerRadius: 5, color: options.color }] : []),
    ],
  };
}