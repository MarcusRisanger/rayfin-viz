import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, CircleHelp, Minus, TriangleAlert } from 'lucide-react';
import type { ThemeInput } from 'graphein';

import { Chart } from '@/components/Chart';
import {
  chartDomain, compare, createTrendSpec, evaluateStatus, formatMoney, monthLabel,
  previousMonth, statusLabels, type KpiPoint, type KpiRule, type KpiStatus, type ScaleMode,
} from '@/lib/kpi';

const statusIcons = { good: Check, neutral: Minus, bad: TriangleAlert, unrated: CircleHelp };

export interface KpiTileProps {
  title: string;
  points: KpiPoint[];
  rule: KpiRule;
  scale: ScaleMode;
  theme: 'light' | 'dark';
  showTarget: boolean;
  showPrevious: boolean;
}

interface ChartPalette {
  theme: ThemeInput;
  statusColors: Record<KpiStatus, string>;
  reference: string;
}

function Comparison({ label, value, reference, caption, status }: {
  label: string; value: number | null; reference: number | null; caption: string; status: KpiStatus;
}) {
  const delta = compare(value, reference);
  const Icon = !delta || delta.difference === 0 ? Minus : delta.difference > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="kpi-comparison" data-status={status}>
      <span className="kpi-overline">{label}</span>
      <div className="kpi-comparison-value">
        <Icon size={19} aria-hidden="true" />
        <strong>{delta ? `${delta.difference > 0 ? '+' : delta.difference < 0 ? '-' : ''}${formatMoney(Math.abs(delta.difference))}` : 'Not available'}</strong>
        {delta?.percent != null && <span>{delta.percent > 0 ? '+' : ''}{delta.percent.toFixed(1)}%</span>}
      </div>
      <span className="kpi-comparison-reference">{caption} <b>{formatMoney(reference)}</b></span>
      {delta?.percent === null && <span className="kpi-comparison-reference">Percentage unavailable: reference is zero.</span>}
    </div>
  );
}

export function KpiTile({ title, points, rule, scale, theme, showTarget, showPrevious }: KpiTileProps) {
  const tileRef = useRef<HTMLElement>(null);
  const [palette, setPalette] = useState<ChartPalette | null>(null);
  const latest = points.at(-1);
  const current = latest?.actual ?? null;
  const target = latest?.target ?? null;
  const previous = previousMonth(points);
  const status = evaluateStatus(current, target, rule);
  const StatusIcon = statusIcons[status];
  const previousStatus = rule.kind === 'higher' || rule.kind === 'lower'
    ? evaluateStatus(current, previous?.actual ?? null, { ...rule, tolerance: 0 }) : 'unrated';
  const domain = chartDomain(points, scale, showTarget);

  useLayoutEffect(() => {
    if (!tileRef.current) return;
    const styles = getComputedStyle(tileRef.current);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const statusColors = Object.fromEntries(
      (['good', 'neutral', 'bad', 'unrated'] as const).map((state) => [state, token(`--color-status-${state}`)]),
    ) as Record<KpiStatus, string>;
    setPalette({
      statusColors, reference: token('--color-reference'),
      theme: {
        base: theme,
        color: {
          background: token('--color-surface'), surface: token('--color-surface'),
          text: token('--color-ink'), textMuted: token('--color-ink-muted'),
          axis: token('--color-rule'), grid: token('--color-grid'), border: token('--color-rule'),
          positive: statusColors.good, negative: statusColors.bad,
        },
        font: { family: token('--font-sans'), size: { small: 12, tiny: 11, base: 13 } },
      },
    });
  }, [theme]);

  const spec = useMemo(() => palette ? createTrendSpec(points, {
    mode: scale, showTarget, color: palette.statusColors[status], referenceColor: palette.reference, theme: palette.theme,
  }) : null, [points, scale, showTarget, status, palette]);

  const ruleLabel = rule.kind === 'none' ? 'No evaluation rule'
    : rule.kind === 'range' ? `Expected ${formatMoney(rule.minimum)} to ${formatMoney(rule.maximum)}`
    : `${rule.kind === 'higher' ? 'Higher' : 'Lower'} is better`;

  return (
    <article className="kpi-tile" data-status={status} ref={tileRef} aria-label={`${title} KPI`}>
      <header className="kpi-heading">
        <h2>{title}</h2>
        <span className="kpi-status"><StatusIcon size={15} aria-hidden="true" />{current == null ? 'No current value' : statusLabels[status]}</span>
      </header>
      <div className="kpi-callout">
        <div className={`kpi-number${current == null ? ' kpi-number-missing' : ''}`}>{formatMoney(current)}</div>
        <div className="kpi-current-period">{latest ? monthLabel(latest.date) : 'No observations'}<span className="kpi-dot" />USD</div>
      </div>
      <div className="kpi-trend-meta">
        <span>Monthly actuals</span>
        <span>{scale === 'detail' ? 'Cropped scale' : 'Zero-based scale'} <b>{formatMoney(domain[0])} to {formatMoney(domain[1])}</b></span>
      </div>
      <div className="kpi-chart">
        {spec && points.length > 0 ? <Chart spec={spec} /> : <div className="kpi-no-data">No observations in this period</div>}
      </div>
      {(showTarget || showPrevious) && (
        <div className="kpi-comparisons">
          {showTarget && <Comparison label="Vs. target" value={current} reference={target} caption="Target" status={status} />}
          {showPrevious && <Comparison label="Vs. previous month" value={current} reference={previous?.actual ?? null}
            caption={previous ? monthLabel(previous.date, true) : 'Previous month'} status={previousStatus} />}
        </div>
      )}
      <footer className="kpi-footer">
        <span><span className="kpi-status-dot" />{ruleLabel}</span>
        <span>{rule.kind === 'higher' || rule.kind === 'lower' ? `${rule.tolerance}% neutral band` : 'Monthly grain'}</span>
      </footer>
    </article>
  );
}