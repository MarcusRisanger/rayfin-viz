# Purpose: Rayfin Visual Lab

Handoff date: 2026-10-29.

## Mission

This repository is an offline design and engineering lab for reusable, polished
analytics visuals that can later be integrated into a real Rayfin/Fabric app.
Keep the platform's authentication, permissions, connections, and query execution;
improve how the resulting data is presented. The goal is more expressive visuals
without losing trustworthy scales, clear comparisons, accessibility, or backend
compatibility.

The first experiment is an improved KPI tile inspired by Power BI's KPI visual.
This is a React application component, not a packaged Power BI custom visual
(`.pbiviz`), a replacement backend, or a new DAX engine.

This document records the project-specific intent discussed after environment
setup. It complements [AGENTS.md](AGENTS.md), whose Universal App guidance is
largely starter-template documentation. Node installation and terminal setup are
not the purpose of this project.

## Platform and Data Boundary

The development machine cannot authenticate against a live Fabric instance.
Synthetic data is therefore intentional, not a temporary authentication workaround.
The visual lab must run without a Fabric deployment or sign-in.

The intended production flow is:

```text
Authenticated Fabric query -> SDK query result -> validated field bindings
                          -> visual spec / component -> rendered visual
```

The offline flow substitutes deterministic fixtures at the query-result boundary.
Visual components must not own credentials, connection IDs, or DAX construction.
The production query layer supplies DAX and handles filtering; the SDK executes
queries, but does not automatically invent the required business queries.

Use the actual `CachedQueryResult` type from `@microsoft/fabric-app-data`:

- Success: `status: "success"`, `requestId`, `fromCache`, and one `table`.
- `table.columns`: ordered metadata containing `name` and `dataType`.
- `table.rows`: positional `unknown[][]`; each cell corresponds to a column index.
- Error: `status: "error"` plus structured error information, not an empty success.
- The SDK's default JSON protocol reports `dataType: "unknown"`; Arrow can provide
  richer types. Do not design adapters around typed Arrow metadata alone.

This SDK result differs from the raw Power BI REST `results[].tables[].rows`
envelope. Fixtures should exercise the contract the application actually consumes.
Resolve qualified names such as `Date[Month]` and `[Revenue]` explicitly; preserve
nulls, numeric values, and model-date semantics rather than preformatting them.

There is no single "Rayfin visual spec": backend compatibility and renderer
compatibility are separate. This template uses Graphein `ChartSpec` through its
React binding. Keep that path initially. Microsoft `fabric-visuals` / Vega-Lite was
researched as a possible alternative if supported Graphein specs prove too limiting;
switching renderers is an experiment to evaluate, not an agreed requirement.

## First Visual: KPI With Context

### Problem to solve

The user finds the standard Power BI KPI backdrop misleading when its area plot
silently scales between the observed minimum and maximum. The plot's range lacks
context, and the visual offers insufficient flexibility for comparisons against
both a target and a previous period.

### Agreed design direction

- A prominent current-value callout with its reporting period and units.
- A trend backdrop covering the selected period, visually part of the same tile.
- Visible scale bounds and units, meaningful date labels, and a labelled target.
- A meaningful baseline by default: zero for the revenue/count example, or a
  configured domain appropriate to the metric. Include displayed targets in the
  domain and allow negative observations where applicable.
- An optional, explicitly labelled detail/cropped scale. Use a line without area
  fill in that mode so a cropped baseline does not imply a zero-based magnitude.
- Simultaneous, independently optional comparisons against target and previous
  period. Show reference values, absolute differences, and percentage differences.
- A clear distinction between movement and performance: increasing is not always
  good. Support higher-is-better, lower-is-better, within-range, and no-rule modes.
- One explicit rule drives the tile's overall status. A comparison can disagree:
  beating target while declining from the prior month is a valid mixed outcome.
- High-contrast primary text, restrained status accents and area fill, and status
  text/icons in addition to color. Do not make a whole saturated tile the only
  status signal.

### Semantic guardrails

The callout, target, previous value, and trend must have compatible grains. The
prototype uses the latest supplied calendar month, not the sum of all visible
months, and compares it with the immediately preceding calendar month. Missing
current data must not silently become an older "latest nonblank" value.

For a future selected-period total, supply matching period comparisons and an
appropriate cumulative trend/target trajectory. Keep business measures in the
query layer; do not casually sum ratios or reproduce DAX semantics in charts.

Preserve missing observations as gaps, not zeros. A zero reference permits an
absolute difference but not a meaningful percentage change. Distinguish missing
data and query errors from an unrated, otherwise valid measurement.

## Company Styling Requirements

**Lato is the company font.** Use it throughout, including chart labels, and bundle
it locally so the prototype does not depend on Google Fonts or other font CDNs.

All visuals must use a common global CSS palette, currently in
[src/main.css](src/main.css). The required semantic categories are:

| State | Color | Meaning | Token family |
| --- | --- | --- | --- |
| Good | Green | Favorable under the configured rule | `--color-status-good` |
| Neutral | Yellow | Within the configured neutral tolerance | `--color-status-neutral` |
| Bad | Red | Unfavorable under the configured rule | `--color-status-bad` |
| Unrated | Grey | No evaluation rule configured | `--color-status-unrated` |

Share readable text and soft-fill variants as well as the primary status colors.
Yellow especially needs a contrasting text variant on light backgrounds. Support
light/dark themes. React UI and canvas rendering must consume the same resolved
CSS tokens; no visual-specific hardcoded palettes. In the destination app, map
these semantics into its global theme instead of creating a competing theme system.

## Dashboard Target: Not Yet Implemented

The real use case is **two rows by three columns of KPI tiles**, fitting comfortably
on a **2560 x 1440 screen at 150% display scaling**. At 100% browser zoom, that is
approximately **1707 x 960 CSS pixels before browser chrome**. Fabric navigation,
page headings, and margins consume additional space.

During the sizing investigation, the current tile measured about 588 CSS pixels
tall at widths of 440-540 pixels. Two rows therefore do not fit as-is. Those were
single-tile measurements, not certification of a six-tile dashboard.

The proposed next iteration is a compact dashboard variant:

- Approximately 460-540 pixels wide and 320-350 pixels tall per tile, subject to
  the real host's available content area.
- A 40-44 pixel callout, a 120-140 pixel trend, and tighter padding.
- Container-aware responsiveness rather than relying only on viewport media
  queries. Preserve readable text and comparison information; do not shrink the
  entire component with CSS transforms.
- Fewer date ticks at narrower widths, and a two-column/one-column fallback when
  the available space genuinely cannot support three columns.
- A proposed "Single tile / 3 x 2 dashboard" preview switch to verify the layout.

These are design targets, not implemented guarantees. The configuration sidebar
and raw-data inspector are lab tools, not required production-dashboard furniture.

## What Exists Today

| File | Responsibility |
| --- | --- |
| [src/pages/HomePage.tsx](src/pages/HomePage.tsx) | Offline single-tile playground: scenarios, period, rules, scale, comparison toggles, theme, and query-result inspector. |
| [src/components/KpiTile.tsx](src/components/KpiTile.tsx) | KPI presentation, comparison sections, and CSS-to-chart theme integration. |
| [src/lib/kpi.ts](src/lib/kpi.ts) | Typed fixtures, field bindings, validation, status evaluation, comparisons, domains, formatting, and trend spec factory. |
| [src/lib/kpi.test.ts](src/lib/kpi.test.ts) | Focused data-contract, comparison, status, and chart-spec tests. |
| [src/components/Chart.tsx](src/components/Chart.tsx) | Existing Graphein React rendering wrapper. |
| [src/components/useChart.ts](src/components/useChart.ts) | Chart lifecycle, updates, and selection integration. |
| [src/main.css](src/main.css) | Global palette, Lato, tile styles, and playground layout. |

Fixtures cover good, neutral, bad, unrated, mixed outcomes, missing observations,
empty results, and query errors. The sample is monthly USD revenue for January
through June 2026, with a fixed $400,000 monthly target. Those values, dates,
currency, labels, and formatting are demonstration choices, not business requirements.

The component is a reusable starting point, not yet a general-purpose KPI package.
Before transfer, parameterize metric formatting, accessible descriptions, date
grain, comparison labels, and target behavior as needed. The current target line
uses the latest target as a constant reference; time-varying targets need an
appropriate series, not an assumption that all target values are identical.

## Production Handoff and Verification

1. Reuse the tile, its contract tests, field-binding pattern, and semantic theme
   decisions. Do not copy the whole playground into the production dashboard.
2. Connect the destination app's authenticated query provider to the same adapter
   boundary. Use version-matched SDK types and docs. Keep synthetic mode explicit
   and separate; never fall back to fixtures on a production authentication error.
3. Confirm metric grain, what counts as a complete/current period, target rules,
   neutral thresholds, previous-period alignment, units, and formatting with the
   actual model. Avoid carrying sample revenue assumptions into other metrics.
4. Build and verify the six-tile compact layout in the real host content area.
5. Test adapters against reordered/missing columns, blanks, zeros, negative values,
   precision limits, and both metadata-rich and `unknown`-typed results. Test
   display and comparisons with missing periods and contradictory performance signals.
6. Validate Graphein specs and inspect rendered output. Add reproducible browser
   screenshots and interaction checks across tile sizes, themes, keyboard access,
   and reduced motion. Keep fonts, fixtures, and test environment deterministic.
7. When Fabric access is available, compare sanitized live results with fixtures
   and separately verify DAX semantics, authentication, permissions/RLS, and host
   embedding. Offline visual tests cannot certify any of those platform behaviors.

For local review, `npm run preview` currently starts the offline Vite app. Focused
checks are `npm test -- src/lib/kpi.test.ts` and `npm run lint`; the current
`npm run build:fabric` script builds without deploying. Consult
[package.json](package.json) before reusing commands: the dormant analytics pack
can change script meanings. Do not deploy merely to review this offline lab.

Success means a visually distinctive, semantically honest KPI that remains readable
in a six-tile dashboard and can consume live authenticated query results without
rewriting its presentation layer.