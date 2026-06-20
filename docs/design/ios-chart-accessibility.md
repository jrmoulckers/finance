# iOS Chart Text-Alternative & Spoken-Summary Pattern — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20; pending human review & merge
> **Epic:** #2113 · **Closes:** #2534, #2537
> **WCAG Target:** 2.2 Level AA (AAA where practical)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI / Swift Charts) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies the pattern and the
per-surface application so that, once unblocked, a native implementation can proceed without
re-deriving the contract. No Swift code ships with this doc.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — summary-string assembly, extrema/total/average
  computation, trend classification, forecast-confidence phrasing, and privacy masking — live
  in `packages/core` / `packages/models` so all platforms share one source of truth.
- **Apple-framework integration** — Swift Charts layout, VoiceOver semantics, audio-graph
  descriptors, and Dynamic Type layout — live in `apps/ios` (planned; currently absent).

---

## Table of Contents

1. [Why this pattern](#1-why-this-pattern)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [The iOS pattern: three layers](#3-the-ios-pattern-three-layers)
4. [Shared summary model (packages/core)](#4-shared-summary-model-packagescore)
5. [Surface application map](#5-surface-application-map)
6. [State coverage](#6-state-coverage-dynamic-type-privacy-stale-error-empty)
7. [Test plan](#7-test-plan)
8. [Cross-references & resolved decisions](#8-cross-references--resolved-decisions)

---

## 1. Why this pattern

Charts encode data positionally and by color. A VoiceOver user, a user who has disabled
images/animations, or a user under high cognitive load receives none of that. WCAG 2.2 AA
(1.1.1 Non-text Content, 1.4.1 Use of Color) requires an equivalent text alternative. The web
app already satisfies this with a screen-reader description plus a "View as table" toggle on
every chart. iOS needs the native equivalent, expressed once and reused across every analytics
surface rather than re-authored per screen.

This pattern is the **single reusable iOS contract** required by #2534, applied to the
investment/report surfaces by #2537.

## 2. The cross-platform contract we are mirroring

The web reference establishes the canonical summary shape and — importantly — that the summary
is **privacy-aware** (it honors balance masking):

- `apps/web/src/components/charts/chart-palette.ts` → `buildChartDescription(chartType, dataPoints, currency, maskingMode)`
  - Empty → `"<chartType> with no data."`
  - Otherwise → `"<chartType> showing <n> categories totalling <total>. <label: value>, …."`
  - Currency is formatted through `formatChartCurrency(…, maskingMode)` so masked balances are
    never spoken aloud.
- Consumed with `role="figure"` + an `.sr-only` description and a data-table alternative in
  `SpendingBarChart.tsx`, `CategoryPieChart.tsx`, `BudgetDonutChart.tsx`.

iOS must produce the **same sentence** from the **same shared model**, then express it through
Apple accessibility APIs instead of ARIA.

## 3. The iOS pattern: three layers

Every chart surface adopts all three layers. Layers 1 and 2 are mandatory for AA; layer 3 is
the AAA enhancement.

### Layer 1 — Spoken summary (mandatory)

The chart container is a single accessibility element that ignores its visual children and
exposes the shared summary string:

```
// SwiftUI shape (illustrative — implementation deferred per #1239)
chartView
  .accessibilityElement(children: .ignore)
  .accessibilityLabel(Text(descriptor.title))        // "Spending trends"
  .accessibilityValue(Text(descriptor.spokenSummary)) // shared buildChartDescription output
  .accessibilityHint(Text("Double-tap to view as a table"))
```

- `accessibilityLabel` = what the chart is (the title).
- `accessibilityValue` = the shared summary sentence (§4).
- The chart must NOT expose dozens of unlabeled sub-elements; collapse to one element plus the
  table alternative (Layer 2).

### Layer 2 — Data-table alternative (mandatory)

A "View as table" control toggles a native `Table` (regular width) / `List` of rows (compact
width) rendering the underlying series. This is the iOS equivalent of the web "View as table"
toggle and is the **primary** non-visual path for exploring exact values.

- Toggle is a labeled button in the chart's header accessory.
- Table columns are defined per surface in §5.
- The table reflows under Dynamic Type (§6) and respects privacy masking (§6).

### Layer 3 — Audio graph descriptor (enhancement)

For time-series and continuous charts (TrendChart, PredictionChart, net-worth, investment
performance), expose an `AXChartDescriptor` (`accessibilityChartDescriptor`) so VoiceOver's
Audio Graph and point-by-point reading work. Point-by-point **navigation** semantics (rotor,
per-point announcements) are owned by epic #2115 (#2540, #2542) — this doc only requires that
the descriptor's axes/series are populated from the same shared model; it does not redefine the
navigation rotor.

## 4. Shared summary model (packages/core)

Add a platform-neutral descriptor so the spoken summary, table headers, and audio-graph axes
are all derived once. **Home: a dedicated `packages/core/.../accessibility` namespace**
(decided 2026-06-20), not the analytics layer — the descriptor is consumed by several engines
(analytics, insights, investment, prediction, forecast), so a cross-cutting namespace avoids
forcing `investment`/`prediction` to depend on `analytics` just for the descriptor type. Each
engine maps its series **into** this shared type:

| Series source (existing shared code)                      | Feeds surface                |
| --------------------------------------------------------- | ---------------------------- |
| `packages/core/.../analytics/SpendingInsight.kt`          | Insights, category breakdown |
| `packages/core/.../insights/InsightsEngine.kt`            | Insights                     |
| `packages/core/.../analytics/MonthlyComparison.kt`        | Analytics                    |
| `packages/core/.../analytics/NetWorthSnapshot.kt`         | Net-worth trend (epic #2116) |
| `packages/core/.../prediction/BalancePredictionEngine.kt` | PredictionChart              |
| `packages/core/.../forecast/OperatingCashForecast.kt`     | Forecast/report charts       |
| `packages/core/.../investment/InvestmentEngine.kt`        | InvestmentDetailView (#2537) |
| `packages/core/.../analytics/ReportGenerator.kt`          | Report result charts (#2537) |

**Proposed shared type (Kotlin, illustrative):**

```kotlin
data class ChartAccessibilityDescriptor(
    val title: String,                 // "Spending trends"
    val chartKind: ChartKind,          // Line, Bar, Pie, Donut, Area, Candlestick
    val spokenSummary: String,         // buildChartDescription equivalent (masking-aware)
    val tableColumns: List<String>,    // e.g. ["Month", "Spent"]
    val tableRows: List<List<String>>, // pre-formatted, masking-aware cells
    val extrema: Extrema?,             // min/max points with labels
    val total: String?,                // masking-aware
    val trend: TrendDirection?,        // Up, Down, Flat (non-color cue, see #2121)
    val forecastConfidence: String? = null // "High confidence", "±$120 range" (#2537)
)
```

- `spokenSummary` MUST be produced by shared logic that mirrors `buildChartDescription`,
  including the empty-data sentence and **masking-aware** currency formatting (privacy, §6).
- Extending each engine's output to this descriptor is the smallest shared change; iOS consumes
  the descriptor via the KMP bridge and renders Layers 1–3.

## 5. Surface application map

### From #2534 — core analytics surfaces

| Surface            | Chart kind  | Spoken summary template                                                                 | Table columns                |
| ------------------ | ----------- | --------------------------------------------------------------------------------------- | ---------------------------- |
| Insights           | mixed/cards | "<n> insights. Top: <insight title>. <savings/overspend figure>."                       | Insight, Impact              |
| Analytics          | bar/line    | "<metric> over <range>. Total <total>. Highest <label> at <value>, lowest <label>."     | Period, Value                |
| TrendChart         | line/area   | "<metric> from <start> to <end>. <trend> <delta>. Peak <value> on <date>."              | Date, Value                  |
| PredictionChart    | line + band | "Projected <metric> through <date>. Expected <value>, <confidence>."                    | Date, Projected, Low, High   |
| Category breakdown | pie/donut   | mirrors `buildChartDescription`: "<n> categories totalling <total>. <label: value>, …." | Category, Amount, % of total |

### From #2537 — investment & report surfaces

| Surface                | Chart kind       | Spoken summary template                                                        | Table columns                        |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| InvestmentDetailView   | line/candlestick | "<holding> <range>. <trend> <pct>. Range <low>–<high>. Now <value>."           | Date, Open, High, Low, Close, Change |
| Investment performance | line/area        | "Portfolio <range>. <trend> <pct>. Best <date> <value>, worst <date> <value>." | Date, Value, Return                  |
| Report result charts   | bar/line         | "<report name>, <range>. Total <total>. <trend> vs prior period <delta>."      | Period, Value, Δ vs prior            |
| Forecast (report)      | line + band      | "Forecast <metric> through <date>. <value>, <confidence>."                     | Date, Forecast, Low, High            |

All "value"/"total"/"price" tokens above are rendered through the masking-aware formatter, never
raw amounts when the user has balances hidden (§6).

**Candlestick summaries (decided 2026-06-20):** the spoken summary for candlestick charts is
**close + range (low–high) + trend** only — full per-period Open/High/Low/Close is _not_ read
aloud (it would overwhelm). The complete OHLC detail lives in the data-table alternative
(Layer 2), whose columns are shown above. This satisfies AA (a complete text alternative exists)
while keeping the spoken summary digestible.

## 6. State coverage (Dynamic Type, privacy, stale, error, empty)

| State            | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Type** | Summary text and table use scalable text styles; tables switch to stacked `List` rows at accessibility sizes / compact width; no truncation of values. Honor `largeContentViewer` for chart header controls.                                                                                                                                                                                                                                                                                                                                              |
| **Privacy**      | When balances are masked, `spokenSummary` and every table cell use the masking-aware formatter (the web `MaskingMode` analogue); VoiceOver must never read an absolute amount the screen hides. **Signed off 2026-06-20:** relative/trend phrasing **including percentages** ("up 12%", "trending up", "range narrowed") **is** spoken while masked — this is parity with on-screen behavior (the line/trend shape is still drawn when amounts are masked) and a percentage discloses no absolute balance. Only absolute currency figures are suppressed. |
| **Stale**        | If data is stale (failed/late sync), prepend "Data may be out of date as of <timestamp>." to the summary and show a non-color staleness indicator (icon + text, per #2121).                                                                                                                                                                                                                                                                                                                                                                               |
| **Error**        | On load failure, the chart element exposes "Unable to load <metric>." with the retry control as a labeled, focusable button; no silent empty chart.                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Empty**        | Mirror `buildChartDescription`'s empty path: "<chartType> with no data." plus an on-screen empty state; the "View as table" toggle is hidden when there are zero rows.                                                                                                                                                                                                                                                                                                                                                                                    |

## 7. Test plan

Smallest set of tests required before a native implementation of this pattern is accepted:

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

- `ChartAccessibilityDescriptor` summary generation:
  - empty series → exact "no data" sentence
  - total/extrema correctness for a known fixture
  - masking-aware formatting: masked mode emits no raw amounts (parity with web
    `chart-palette.test.ts`)
  - trend classification (Up/Down/Flat) thresholds
  - forecast-confidence phrasing for prediction/report descriptors (#2537)
- Place beside existing `packages/core/src/commonTest/.../analytics` tests.

**Native (iOS, deferred until #1239 unblocks):**

- Snapshot/UI test: each surface in §5 exposes exactly one chart a11y element with the expected
  `accessibilityLabel` + `accessibilityValue`.
- "View as table" toggle reveals a table whose row count == series length; columns match §5.
- VoiceOver audio-graph descriptor present for time-series surfaces (Layer 3).
- Dynamic Type XXL: table reflows to stacked rows with no clipped values.
- Masked-balances mode: no raw amount appears in the accessibility tree.

## 8. Cross-references & resolved decisions

**Related epics (do not duplicate their scope):**

- #2115 (#2540, #2542) — VoiceOver point-by-point navigation / chart descriptor adapters. This
  doc populates the descriptor's data from the shared model; #2115 owns the navigation rotor and
  per-point announcement semantics.
- #2121 (#2552, #2554) — semantic non-color state cues (trend up/down icons, staleness icon).
  Referenced for trend/stale indicators above.
- #2116 (#2562, #2564) — net-worth trend chart surface; consumes this pattern.
- Web reference contract: `apps/web/src/components/charts/chart-palette.ts`,
  `docs/design/chart-component-specs.md` (§ Accessibility Contract).

**Resolved design decisions (in-session, 2026-06-20):**

1. **Descriptor home** — `ChartAccessibilityDescriptor` lives in a dedicated
   `packages/core/.../accessibility` namespace, not the analytics layer, to avoid cross-engine
   coupling (§4).
2. **Masked-chart audio** — relative/trend phrasing, including percentages, **is** spoken while
   balances are masked; only absolute currency figures are suppressed. Parity with on-screen
   trend visibility; a percentage discloses no absolute balance (§6, Privacy).
3. **Candlestick summary depth** — spoken summary is close + range + trend; full OHLC lives in
   the data-table alternative, not the spoken summary (§5).
