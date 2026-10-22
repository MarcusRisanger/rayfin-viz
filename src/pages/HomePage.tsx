import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Braces, ChevronDown, CircleHelp, Database, Moon, RotateCcw, SlidersHorizontal, Sun, TriangleAlert } from 'lucide-react';
import type { CachedQueryResult } from '@microsoft/fabric-app-data';

import { KpiTile } from '@/components/KpiTile';
import { formatMoney, monthLabel, scenarios, statusLabels, toKpiPoints, type KpiRule, type ScenarioId, type ScaleMode } from '@/lib/kpi';

export function HomePage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [scenario, setScenario] = useState<ScenarioId>('good');
  const [period, setPeriod] = useState(6);
  const [scale, setScale] = useState<ScaleMode>('zero');
  const [ruleKind, setRuleKind] = useState<KpiRule['kind']>('higher');
  const [tolerance, setTolerance] = useState(2);
  const [minimum, setMinimum] = useState(360000);
  const [maximum, setMaximum] = useState(440000);
  const [showTarget, setShowTarget] = useState(true);
  const [showPrevious, setShowPrevious] = useState(true);
  const [inspector, setInspector] = useState<'rows' | 'json'>('rows');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const result: CachedQueryResult = useMemo(() => {
    const source = scenarios[scenario].result;
    return source.status === 'success'
      ? { ...source, table: { ...source.table, rows: source.table.rows.slice(-period) } }
      : source;
  }, [scenario, period]);
  const points = useMemo(() => result.status === 'success' ? toKpiPoints(result) : [], [result]);
  const rule: KpiRule = ruleKind === 'none' ? { kind: 'none' }
    : ruleKind === 'range' ? { kind: 'range', minimum, maximum } : { kind: ruleKind, tolerance };

  function chooseScenario(next: ScenarioId) {
    setScenario(next);
    setRuleKind(next === 'unrated' ? 'none' : 'higher');
  }

  function reset() {
    chooseScenario('good'); setPeriod(6); setScale('zero'); setTolerance(2);
    setMinimum(360000); setMaximum(440000); setShowTarget(true); setShowPrevious(true);
  }

  return (
    <div className="visual-lab" data-theme={theme}>
      <header className="lab-header">
        <a className="lab-brand" href="#main"><span className="lab-brand-icon"><Activity size={20} /></span>Visual Lab<span className="lab-brand-divider" />KPI / 01</a>
        <div className="lab-header-actions">
          <span className="lab-source"><span />Offline fixtures</span>
          <button className="lab-icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      <main id="main" className="lab-main">
        <div className="lab-page-heading">
          <div><p className="lab-eyebrow">PERFORMANCE / REVENUE</p><h1>Revenue overview<span>.</span></h1></div>
          <div className="lab-dataset-label"><Database size={15} /><span>Demo sales model<br /><b>USD / monthly</b></span></div>
        </div>

        <div className="lab-workspace">
          <section className="lab-preview" aria-label="KPI preview">
            <div className="lab-section-heading">
              <div><span className="lab-section-index">01</span><h2>Monthly performance</h2></div>
              <label className="lab-period"><span className="sr-only">Selected period</span>
                <select aria-label="Selected period" value={period} onChange={(event) => setPeriod(Number(event.target.value))}>
                  <option value={6}>Jan - Jun 2026</option><option value={3}>Apr - Jun 2026</option>
                </select><ChevronDown size={14} aria-hidden="true" />
              </label>
            </div>
            {result.status === 'error' ? (
              <div className="lab-error" role="alert"><TriangleAlert size={30} /><h2>Revenue unavailable</h2><p>{result.error.message}</p>
                <button className="lab-command" onClick={() => chooseScenario('good')}><RotateCcw size={16} />Reload sample</button>
              </div>
            ) : <KpiTile title="Monthly revenue" points={points} rule={rule} scale={scale} theme={theme} showTarget={showTarget} showPrevious={showPrevious} />}
            <div className="lab-preview-caption"><span><span className="lab-live-dot" />Synthetic data</span><span>Reporting month: June 2026</span></div>

            <details className="lab-inspector">
              <summary><span><Braces size={16} />Query result</span><span>{points.length} rows<ChevronDown size={15} /></span></summary>
              <div className="lab-inspector-body">
                <div className="lab-inspector-toolbar"><div className="lab-segmented" aria-label="Result format">
                  <button aria-pressed={inspector === 'rows'} onClick={() => setInspector('rows')}>Rows</button>
                  <button aria-pressed={inspector === 'json'} onClick={() => setInspector('json')}>SDK JSON</button>
                </div><span>{result.requestId}</span></div>
                {inspector === 'json' || result.status === 'error' ? <pre>{JSON.stringify(result, null, 2)}</pre> : (
                  <div className="lab-table-scroll"><table><caption className="sr-only">Monthly revenue observations and targets</caption>
                    <thead><tr><th scope="col">Month</th><th scope="col">Revenue</th><th scope="col">Target</th></tr></thead>
                    <tbody>{points.map((point) => <tr key={point.date}><th scope="row">{monthLabel(point.date)}</th><td>{formatMoney(point.actual, false)}</td><td>{formatMoney(point.target, false)}</td></tr>)}</tbody>
                  </table></div>
                )}
              </div>
            </details>
          </section>

          <aside className="lab-settings" aria-label="Visual configuration">
            <div className="lab-settings-heading"><h2><SlidersHorizontal size={17} />Configuration</h2><button className="lab-icon-button" title="Reset configuration" aria-label="Reset configuration" onClick={reset}><RotateCcw size={15} /></button></div>
            <fieldset className="lab-control-group"><legend>Sample data</legend>
              <div className="lab-status-options">{(['good', 'neutral', 'bad', 'unrated'] as const).map((state) => (
                <button key={state} data-status={state} className="lab-status-option" aria-pressed={scenario === state} onClick={() => chooseScenario(state)}>
                  <span className="lab-swatch">{scenario === state && <span />}</span><span>{statusLabels[state]}</span>
                </button>
              ))}</div>
              <label className="lab-field">Scenario<select value={scenario} onChange={(event) => chooseScenario(event.target.value as ScenarioId)}>
                {Object.entries(scenarios).map(([key, entry]) => <option key={key} value={key}>{entry.label}</option>)}
              </select></label>
            </fieldset>

            <fieldset className="lab-control-group"><legend>Evaluation</legend>
              <label className="lab-field">Good when<select value={ruleKind} onChange={(event) => setRuleKind(event.target.value as KpiRule['kind'])}>
                <option value="higher">Higher than or equal to target</option><option value="lower">Lower than or equal to target</option><option value="range">Within an expected range</option><option value="none">No rule</option>
              </select></label>
              {(ruleKind === 'higher' || ruleKind === 'lower') && <label className="lab-field lab-inline-field">Neutral tolerance<div className="lab-number-input"><input aria-label="Neutral tolerance" type="number" min="0" max="50" step="0.5" value={tolerance} onChange={(event) => setTolerance(Math.min(50, Math.max(0, Number(event.target.value))))} /><span>%</span></div></label>}
              {ruleKind === 'range' && <div className="lab-range-fields">
                <label className="lab-field">Minimum ($)<input type="number" value={minimum} step="10000" onChange={(event) => setMinimum(Number(event.target.value))} /></label>
                <label className="lab-field">Maximum ($)<input type="number" value={maximum} step="10000" onChange={(event) => setMaximum(Number(event.target.value))} /></label>
                {minimum > maximum && <p className="lab-field-error" role="alert">Minimum must not exceed maximum.</p>}
              </div>}
            </fieldset>

            <fieldset className="lab-control-group"><legend>Trend scale</legend>
              <div className="lab-segmented"><button aria-pressed={scale === 'zero'} onClick={() => setScale('zero')}>Zero baseline</button><button aria-pressed={scale === 'detail'} onClick={() => setScale('detail')}>Detail</button></div>
              <div className="lab-control-note"><CircleHelp size={14} /><span>{scale === 'zero' ? 'Baseline: $0' : 'Baseline: visible-period minimum, padded'}</span></div>
            </fieldset>

            <fieldset className="lab-control-group"><legend>Comparisons</legend>
              <label className="lab-toggle"><span>Versus target</span><input type="checkbox" role="switch" checked={showTarget} onChange={(event) => setShowTarget(event.target.checked)} /><span className="lab-switch" /></label>
              <label className="lab-toggle"><span>Versus previous month</span><input type="checkbox" role="switch" checked={showPrevious} onChange={(event) => setShowPrevious(event.target.checked)} /><span className="lab-switch" /></label>
            </fieldset>
            <div className="lab-rule-summary"><ArrowUpRight size={17} /><span>Reference target<strong>$400,000 / month</strong></span></div>
          </aside>
        </div>
        <footer className="lab-page-footer"><span>VISUAL LAB <b>/</b> KPI WITH CONTEXT</span><span>MONTHLY OBSERVATIONS <b>/</b> USD</span></footer>
      </main>
    </div>
  );
}
