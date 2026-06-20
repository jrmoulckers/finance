# VoiceOver Point-by-Point Chart Navigation Pattern — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20; pending human review & merge
> **Epic:** #2115 · **Closes:** #2540, #2542
> **WCAG Target:** 2.2 Level AA (AAA where practical)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI / Swift Charts) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies the navigation pattern
and per-surface application so that, once unblocked, a native implementation can proceed without
re-deriving the contract. No Swift code ships with this doc.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — the ordered, navigable per-point series (numeric x/y plus a
  preformatted, masking-aware per-point label), extrema, trend classification, and the
  per-point announcement strings — are derived once in `packages/core` / `packages/models` so all
  platforms share one source of truth.
- **Apple-framework integration** — the `AXChartDescriptor` adapter, the VoiceOver Audio Graph,
  the custom `accessibilityRotor`, and per-point announcement delivery — live in `apps/ios`
  (planned; the navigation layer is currently absent — see §1).

**Scope relative to epic #2113 (pilot PR #2834).** #2113 defines the three-layer pattern (Layer 1
spoken summary, Layer 2 data-table alternative, Layer 3 audio-graph descriptor) and explicitly
**defers the deep navigation of Layer 3 — the rotor and per-point announcement semantics — to this
epic** (see `docs/design/ios-chart-accessibility.md` §3, §8). This document owns exactly that: the
Swift Charts `AXChartDescriptor` adapters (#2542) and point-by-point VoiceOver navigation without
drag gestures (#2540). It does **not** redefine the spoken summary, the table alternative, the
shared descriptor's home namespace, the masking rule, or the candlestick summary depth — those are
inherited from #2834 and applied as-is.

---

## Table of Contents

1. [Why this pattern](#1-why-this-pattern)
2. [The barrier today: drag-only inspection](#2-the-barrier-today-drag-only-inspection)
3. [The navigation model: audio graph + custom rotor](#3-the-navigation-model-audio-graph--custom-rotor)
4. [AXChartDescriptor adapter design (#2542)](#4-axchartdescriptor-adapter-design-2542)
5. [Per-data-point announcement format](#5-per-data-point-announcement-format)
6. [Feeding adapters from the shared descriptor](#6-feeding-adapters-from-the-shared-descriptor)
7. [Surface application map](#7-surface-application-map)
8. [State coverage](#8-state-coverage-dynamic-type-privacy-stale-error-empty)
9. [Test plan](#9-test-plan)
10. [Cross-references & resolved decisions](#10-cross-references--resolved-decisions)

---

## 1. Why this pattern

A sighted user reads a chart by scanning it — hover, glance at the peak, compare two months. The
Finance web app gives keyboard users an equivalent: `useArrowKeyNavigation` lets them step through
individual data points with arrow keys
(`docs/design/accessibility-patterns.md` §7.2 "Strategy 4: Keyboard Navigable Data Points",
line 1090). **iOS has no equivalent.** A VoiceOver user today can hear the chart's one-line summary
but cannot walk the series point-by-point, because the only way to select an individual point is a
**drag gesture** the screen reader intercepts (§2). WCAG 2.2 AA requires this:

- **1.1.1 Non-text Content** — a complete text alternative for the data (the table, from #2113).
- **2.1.1 Keyboard / 2.5.7 Dragging Movements (new in 2.2)** — any function operated by a drag must
  have a single-pointer / non-drag alternative. The chart's point selection is drag-only, so it
  fails 2.5.7 for everyone and is wholly unreachable under VoiceOver.
- **1.4.5 / AAA audio graph** — VoiceOver's Audio Graph (`AXChartDescriptor`) lets users _hear_ the
  shape of a trend, which a static summary cannot convey.

This pattern is the **single reusable iOS navigation contract** required by #2540, with the Swift
Charts descriptor adapters that power it specified by #2542. It is applied to every analytics,
prediction, investment, and report chart surface listed in §7.

## 2. The barrier today: drag-only inspection

Every interactive Finance iOS chart gates per-point inspection behind a gesture VoiceOver cannot
perform:

| Chart (`apps/ios/Finance/Charts`)      | Selection mechanism today                                           | VoiceOver reachable? |
| -------------------------------------- | ------------------------------------------------------------------- | -------------------- |
| `TrendChart.swift` (line/area)         | `.chartOverlay` + `DragGesture(minimumDistance: 0)` (lines 115–134) | ❌ drag-only         |
| `PredictionChart.swift` (line + band)  | `.chartOverlay` + `DragGesture` (lines 102–121)                     | ❌ drag-only         |
| `CategoryBreakdownChart.swift` (donut) | `.chartAngleSelection(value:)` (line 60)                            | ❌ angle drag        |
| `SpendingChart.swift` (bar)            | none — per-bar `.accessibilityLabel`/`.accessibilityValue` only     | ⚠️ no ordered walk   |

Two distinct gaps:

1. **Drag-selected detail is unreachable.** `TrendChart`/`PredictionChart` expose the _selected_
   point only while a finger drags across the plot; VoiceOver never fires that gesture, so the
   highlighted-value path (e.g. `TrendChart.swift` lines 85–95) is dead for screen-reader users.
2. **No ordered, navigable traversal.** `SpendingChart` attaches a label to each `BarMark`
   (lines 47–50) and the container uses `.accessibilityElement(children: .contain)`
   (line 71), so VoiceOver _can_ swipe through bars — but there is no guaranteed reading order,
   no extrema rotor, and no audio graph. `PredictionChart`'s header comment even claims it
   "supports VoiceOver audio graphs" (line 7), but no `accessibilityChartDescriptor` is attached
   anywhere in the file — the capability is asserted, not implemented.

The fix is a non-drag navigation model (§3) fed by a descriptor adapter (§4), both derived from the
shared model so the reading order, extrema, and announcements match the visual chart exactly.

## 3. The navigation model: audio graph + custom rotor

Point-by-point navigation is delivered through **two complementary, gesture-free affordances**.
Both are mandatory for every time-series / categorical surface in §7; neither relies on a drag.

### 3a. Audio graph descriptor (`AXChartDescriptor`) — #2542

Attaching an `AXChartDescriptor` via `.accessibilityChartDescriptor(...)` gives the chart container
VoiceOver's built-in **"Describe Chart" / Audio Graph** action. From there the user can:

- hear a tonal sweep of the series (pitch = value, pan = x position) — conveys shape without sight;
- step through points one at a time with the standard VoiceOver gestures **or** the rotor, with no
  drag required;
- read per-point values that VoiceOver formats from the descriptor's `value` + axis labels.

The descriptor is the _data contract_; its axes and data points are populated entirely from the
shared model (§4, §6), so the spoken values, order, and bounds are identical to Layer 1's summary.

### 3b. Custom VoiceOver rotor (`accessibilityRotor`) — #2540

The Audio Graph is excellent for _traversal_ but users also need _targeted jumps_. Each chart
surface exposes a custom rotor titled **"Chart data points"** plus, where meaningful, a
**"Key points"** rotor that lands directly on the series extrema and notable points:

- **Chart data points** — every point in reading order; swipe up/down on the rotor steps through them.
- **Key points** — highest, lowest, latest, and (for predictions/forecasts) the first projected
  point and the confidence-band edges.

The rotor reuses the existing rotor-heading infrastructure already in the app
(`apps/ios/Finance/Accessibility/AccessibilityModifiers.swift` — `financeHeading()` adds the
`.isHeader` rotor trait, line 67; `announceForAccessibility(_:)` posts transient announcements,
line 93). Rotor entries are built from the same ordered series the descriptor uses, so the rotor and
the audio graph never disagree.

```
// SwiftUI shape (illustrative — implementation deferred per #1239)
chartView
  .accessibilityChartDescriptor(ChartDescriptorAdapter(descriptor))   // §4, Audio Graph
  .accessibilityRotor(Text("Chart data points")) {                    // §3b, ordered walk
      ForEach(descriptor.series.flatMap(\.points)) { point in
          AccessibilityRotorEntry(Text(point.spokenLabel), id: point.id)
      }
  }
  .accessibilityRotor(Text("Key points")) {                           // §3b, targeted jumps
      ForEach(descriptor.keyPoints) { point in
          AccessibilityRotorEntry(Text(point.spokenLabel), id: point.id)
      }
  }
```

### 3c. Relationship to the drag overlay

The existing `.chartOverlay` + `DragGesture` (TrendChart/PredictionChart) and `.chartAngleSelection`
(CategoryBreakdownChart) **stay** for sighted/pointer users — this pattern adds a parallel path, it
does not remove the visual one. The drag overlay must, however, be marked `.accessibilityHidden(true)`
so VoiceOver routes through the descriptor + rotor rather than an empty drag target. (The selection
`RuleMark`/`PointMark` are already `.accessibilityHidden(true)` — TrendChart lines 83, 91 region;
PredictionChart line 81 — so only the overlay rectangle needs hiding.)

## 4. AXChartDescriptor adapter design (#2542)

`AXChartDescriptor` is the Swift Charts accessibility data model
(`AXChartDescriptor`, `AXDataSeriesDescriptor`, `AXDataPoint`, `AXNumericDataAxisDescriptor` /
`AXCategoricalDataAxisDescriptor`). The adapter is a thin, pure mapping from the shared
`ChartAccessibilityDescriptor` (§6) to those Apple types — it holds **no business logic**; all
values, ordering, bounds, and labels arrive precomputed and masking-aware.

### 4a. Adapter responsibilities

| Concern                | Source (shared, platform-neutral)                             | Apple type produced                                               |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Chart title            | `descriptor.title`                                            | `AXChartDescriptor.title`                                         |
| Chart kind → summary   | `descriptor.chartKind` + `descriptor.spokenSummary`           | `AXChartDescriptor.summary`                                       |
| X axis (time/category) | `series.points[].x` + per-point `xLabel`                      | `AXNumericDataAxisDescriptor` / `AXCategoricalDataAxisDescriptor` |
| Y axis (amount)        | `series.yMin` / `series.yMax` + `yAxisLabel`                  | `AXNumericDataAxisDescriptor`                                     |
| Data series + points   | `descriptor.series[]` (ordered) → `point.x`, `point.y`, label | `AXDataSeriesDescriptor` + `[AXDataPoint]`                        |

### 4b. One adapter, three chart shapes

A single `ChartDescriptorAdapter` covers all Finance chart kinds by switching axis descriptor type
on `chartKind`:

- **Line / Area (time series)** — `TrendChart`, `PredictionChart`, investment performance,
  net-worth, report/forecast lines: numeric X (time, as epoch seconds or day index) + numeric Y
  (amount). Multi-series charts (income vs spending in `TrendChart`, historical vs predicted in
  `PredictionChart`) map each shared series to one `AXDataSeriesDescriptor`, so the rotor and audio
  graph announce the series name (e.g. "Income", "Predicted spending") per the existing
  `.symbol(by:)` grouping (`TrendChart.swift` line 62).
- **Bar (categorical)** — `SpendingChart`: categorical X (category name) + numeric Y (amount); one
  data point per category, in the chart's render order.
- **Pie / Donut (categorical, part-to-whole)** — `CategoryBreakdownChart`: categorical X
  (category) + numeric Y (amount), with the per-point label carrying the percent-of-total so the
  audio graph and rotor speak "Food, $520, 28%" matching the on-screen legend
  (`CategoryBreakdownChart.swift` lines 119–121).

### 4c. Confidence bands (prediction / forecast)

For `PredictionChart` and report forecasts, the confidence band (`AreaMark` from `lowerBound` to
`upperBound`, `PredictionChart.swift` lines 43–57) is **not** a separately navigable series — that
would double the points a user steps through. Instead each predicted point's `AXDataPoint` carries
the band as part of its spoken label ("Predicted $3,900, range $3,400 to $4,200, 90% confidence"),
sourced from `BalancePredictionEngine`'s `BalancePrediction` (`predictedBalance`, and the
`PredictionConfidence` enum — `packages/core/.../prediction/BalancePredictionEngine.kt`). The band
edges are reachable as discrete entries in the **"Key points"** rotor (§3b) for users who want them.

## 5. Per-data-point announcement format

Every navigable point — whether reached via the audio graph or a rotor — speaks a single
**masking-aware** string assembled in shared code, never on the device. The format mirrors the web
per-point label (`aria-label={`${entry.name}: ${formatChartCurrency(entry.amount, currency)}`}` —
`docs/design/accessibility-patterns.md` line 1086) and the shared `buildChartDescription` contract
(`apps/web/src/components/charts/chart-palette.ts` line 63, which already accepts a `maskingMode`).

**Canonical point templates:**

| Chart kind          | Per-point announcement template                                                      | Example                                                               |
| ------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Line/Area (time)    | `"<xLabel>, <value>[, <delta vs previous>]"`                                         | "March 2026, $1,240, up $90 from February"                            |
| Bar (category)      | `"<category>, <value>, <ordinalOrShare>"`                                            | "Food, $520, highest category"                                        |
| Pie/Donut           | `"<category>, <value>, <percent> of total"`                                          | "Transport, $310, 17% of total"                                       |
| Prediction/Forecast | `"<xLabel>, predicted <value>, range <low> to <high>, <confidence>"`                 | "May 2026, predicted $3,900, range $3,400 to $4,200, high confidence" |
| Candlestick (OHLC)  | `"<xLabel>, close <value>, range <low> to <high>, <trend>"` (full OHLC in the table) | "Apr 12, close $182, range $176 to $185, up"                          |

**Rules (all inherited from #2834, applied to the per-point grain):**

- **Masking.** When balances are hidden, absolute currency in the per-point string is suppressed
  and spoken as "amount hidden"; the **relative delta and any percentage are still spoken**
  ("up 7%", "17% of total") — per #2834 resolved decision #2, a percentage discloses no absolute
  balance and matches what the masked chart still draws. The audio-graph tone (pitch = value) is
  preserved while masked because it conveys shape, not an absolute figure.
- **Candlestick depth.** Per #2834 resolved decision #3, the spoken per-point string for a
  candlestick is **close + range + trend** only; full Open/High/Low/Close lives in the Layer 2
  data table, whose columns are defined in #2834 §5.
- **Trend/extrema cues are non-color.** "up"/"down"/"highest"/"lowest" are spoken words (and pair
  with the trend icons owned by #2121), never color alone.
- **Localized & currency-correct.** Amounts route through the same locale-aware currency formatter
  used by Layer 1 (`apps/ios/Finance/Accessibility/AccessibilityModifiers.swift` `formatCurrency`,
  lines 104–117); x-labels use the chart's existing date formatting (`TrendChart.swift` line 159).

## 6. Feeding adapters from the shared descriptor

The adapter (§4) and rotor (§3b) consume a **navigable extension** of the shared
`ChartAccessibilityDescriptor` introduced by #2113 (which lives in the dedicated
`packages/core/.../accessibility` namespace — #2834 resolved decision #1). #2113's descriptor is
summary/table-shaped (`spokenSummary`, `tableColumns`, `tableRows`, `extrema`, `total`, `trend`); it
does not carry the ordered, numeric per-point data an `AXChartDescriptor` needs. This epic adds that
data **to the same type** as an **optional** field, so all three layers derive from one source of
truth. The field is a **#2115-driven addition to a #2113-owned type**: #2113 continues to own
`ChartAccessibilityDescriptor`, and this epic only contributes (and consumes) the new optional
`series` field — captured here so the cross-epic ownership is explicit.

> **Resolved 2026-06-20 — confirmed by the maintainer:** extend the shared
> `ChartAccessibilityDescriptor` with an **optional** `series: List<NavigableSeries>` field rather
> than introducing a sibling type. Each point carries a numeric `x`, numeric `y`, and a
> preformatted, masking-aware `spokenLabel`. Guardrails baked in: (1) the field is **optional**
> (defaults empty) so summary-only / non-time-series charts that need no point-by-point traversal
> do not carry it; (2) every per-point `spokenLabel` is built by the **same masking-aware
> formatter** as Layer 1 (#2834 decision #2 — relative/percentage phrasing spoken while masked,
> absolute amounts suppressed); (3) the addition is explicitly a **#2115-driven extension of the
> #2113-owned type** — #2113 keeps ownership, #2115 only populates/consumes the new field. Rationale:
> keeps a single source of truth feeding Layers 1–3 ("derived once"), consistent with #2834
> decision #1 (one accessibility namespace).

**Proposed additive shared shape (Kotlin, illustrative):**

```kotlin
// Added to the existing packages/core/.../accessibility/ChartAccessibilityDescriptor
data class ChartAccessibilityDescriptor(
    // …existing #2113 fields: title, chartKind, spokenSummary, tableColumns, tableRows,
    //   extrema, total, trend, forecastConfidence…
    val series: List<NavigableSeries> = emptyList(), // NEW — powers audio graph + rotor (#2115)
)

data class NavigableSeries(
    val name: String,                 // "Income", "Predicted spending", "" for single-series
    val yMin: Double,                 // axis bounds for AXNumericDataAxisDescriptor
    val yMax: Double,
    val yAxisLabel: String,           // "Amount"
    val points: List<NavigablePoint>, // ordered in reading order == visual order
)

data class NavigablePoint(
    val id: String,                   // stable id for AccessibilityRotorEntry
    val x: Double,                    // numeric (epoch seconds / day index / category ordinal)
    val xLabel: String,               // "March 2026", "Food"
    val y: Double,                    // numeric value for the audio-graph tone
    val spokenLabel: String,          // fully assembled, masking-aware (§5)
    val kind: PointKind = PointKind.DATA, // DATA, HIGH, LOW, LATEST, PREDICTED, BAND_EDGE
)
```

- `series` is **optional** (defaults to `emptyList()`): summary-only or non-time-series charts that
  expose no point-by-point traversal simply omit it and still render Layers 1–2. A chart with an
  empty `series` attaches **no** audio graph and **no** rotor (§8, Empty).
- `spokenLabel` is produced by the **same shared masking-aware logic** that builds
  `buildChartDescription`, including the empty path and masking-aware currency — the device never
  re-formats currency, and masked points emit no absolute amount (#2834 decision #2).
- `keyPoints` for the "Key points" rotor (§3b) are simply `series.flatMap { it.points }.filter { it.kind != DATA }`, so extrema stay in sync with `descriptor.extrema`.
- Each engine in #2113 §4 (analytics, insights, prediction, forecast, investment, report) maps its
  series into `NavigableSeries` once; iOS reads it via the KMP bridge
  (`apps/ios/Finance/KMP/*`) and the adapter turns it into Apple types. No per-surface logic on iOS.

## 7. Surface application map

Each surface below adopts §3 (audio graph + both rotors) and §5 (per-point announcements). "Series →
AX axes" shows how the shared `NavigableSeries` maps onto the descriptor; "Key-point rotor entries"
lists what the "Key points" rotor lands on.

### From #2540 — point-by-point navigation across the core chart surfaces

| Surface (`apps/ios/Finance`)                 | Chart kind        | Series → AX axes                                     | Key-point rotor entries                  |
| -------------------------------------------- | ----------------- | ---------------------------------------------------- | ---------------------------------------- |
| `Charts/TrendChart` (Analytics, net-worth)   | line/area, multi  | X numeric (date) · Y numeric (amount); 1 series/name | Highest, lowest, latest per series       |
| `Charts/SpendingChart` (Analytics)           | bar, categorical  | X categorical (category) · Y numeric (amount)        | Highest, lowest category                 |
| `Charts/CategoryBreakdownChart` (Insights)   | donut, part-whole | X categorical (category) · Y numeric (amount)        | Largest, smallest slice                  |
| `Charts/PredictionChart` (Insights/Forecast) | line + band       | X numeric (date) · Y numeric; historical + predicted | Last actual, first predicted, band edges |
| `Screens/AnalyticsView` host                 | hosts above       | inherits per embedded chart                          | inherits                                 |
| `Screens/InsightsView` host                  | hosts above       | inherits per embedded chart                          | inherits                                 |

### From #2542 — descriptor adapters for the investment & report surfaces

| Surface (`apps/ios/Finance/Screens`)    | Chart kind                 | Series → AX axes                                                  | Key-point rotor entries                |
| --------------------------------------- | -------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| `InvestmentDetailView` (price history)  | line (today) / candlestick | X numeric (date) · Y numeric (price); `LineMark` at lines 158–166 | High, low, latest close; OHLC in table |
| `InvestmentPortfolioView` (performance) | line/area                  | X numeric (date) · Y numeric (portfolio value)                    | Best, worst, latest day                |
| `ReportResultView` (report charts)      | bar/line                   | X (period) · Y numeric (value)                                    | Highest, lowest period; Δ vs prior     |
| `ReportResultView` (forecast section)   | line + band                | X numeric (date) · Y numeric (forecast)                           | First forecast point, band edges       |

All "value"/"price"/"amount" tokens render through the masking-aware formatter (§5); none speak a
raw amount when balances are hidden. `InvestmentDetailView` currently renders a `LineMark` price
history (line 158) — the adapter targets that today; the candlestick columns/labels in the table are
inherited from #2834 §5 and apply once an OHLC `Holding` price series is wired up.

## 8. State coverage (Dynamic Type, privacy, stale, error, empty)

| State            | Requirement (navigation-specific)                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Type** | Rotor entry text and per-point announcements use scalable text styles and are never truncated by VoiceOver. At accessibility sizes the visual chart may simplify, but the descriptor's point set is unchanged — navigation does not lose points when the chart shrinks. Honor `largeContentViewer` for the rotor-invoking controls. |
| **Privacy**      | When balances are masked, every `spokenLabel` suppresses absolute currency ("amount hidden") while **keeping** relative deltas and percentages (#2834 decision #2). The audio-graph Y values still drive the tonal sweep (shape, not absolute figures). No `AXDataPoint.value` text exposes an amount the screen hides.             |
| **Stale**        | If data is stale, the descriptor's `summary` is prefixed with "Data may be out of date as of <timestamp>." (matching Layer 1) and the first rotor entry announces staleness once, pairing with the non-color staleness icon owned by #2121. Points are still navigable.                                                             |
| **Error**        | On load failure no descriptor/rotor is attached; the chart element exposes "Unable to load <metric>." with a labeled, focusable retry button (per #2113). VoiceOver must not present an empty, point-less audio graph.                                                                                                              |
| **Empty**        | With zero points, the audio graph and both rotors are **not** attached (an empty rotor traps focus); the container speaks the shared empty sentence "<chartType> with no data." (mirrors `buildChartDescription`'s empty path). The "View as table" toggle is hidden, consistent with #2113.                                        |

## 9. Test plan

Smallest set of tests required before a native implementation of this navigation pattern is accepted.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

- `NavigableSeries` / `NavigablePoint` generation:
  - point order equals visual order for each chart kind (line, bar, donut, prediction);
  - `x`/`y` numeric values match the source engine series (fixture-based);
  - `spokenLabel` content per §5 templates, including the delta-vs-previous and percent-of-total;
  - **masking-aware**: masked mode emits no raw amount in any `spokenLabel` but still emits
    percentages/deltas (parity with web `chart-palette.test.ts`);
  - `kind` tagging of extrema matches `descriptor.extrema` (HIGH/LOW/LATEST), and `keyPoints`
    derivation returns exactly the non-`DATA` points;
  - empty series → no points, empty-sentence summary, no key points;
  - prediction/forecast points carry band edges + `PredictionConfidence` phrasing.
- Place beside the existing `packages/core/src/commonTest/.../analytics` (and `prediction`,
  `investment`) tests.

**Native (iOS, deferred until #1239 unblocks):**

- Each surface in §7 attaches an `AXChartDescriptor` whose series count and per-series point count
  equal the source `NavigableSeries`; axis types match the chart kind (numeric vs categorical).
- VoiceOver UI test: with the visual drag overlay `.accessibilityHidden(true)`, the user can reach
  **every** point via the "Chart data points" rotor and land on extrema via "Key points" — **no
  drag gesture is required** (regression guard for WCAG 2.5.7 / the §2 barrier).
- Per-point announcement strings equal the shared `spokenLabel` (no on-device reformatting).
- Masked-balances mode: no `AXDataPoint` value or rotor entry reads an absolute amount; percentages
  and deltas still announce.
- Multi-series (`TrendChart` income vs spending; `PredictionChart` historical vs predicted): series
  names announce and each series is independently traversable.
- Empty/error: no audio graph or rotor is attached; container speaks the empty/error sentence.

## 10. Cross-references & resolved decisions

**Related epics (do not duplicate their scope):**

- #2113 (#2534, #2537) — iOS chart text-alternative & spoken-summary pattern (pilot, PR #2834).
  Owns Layer 1 (spoken summary), Layer 2 (data table), the shared `ChartAccessibilityDescriptor`
  type and its namespace, the masking rule, and the candlestick summary depth. **This doc owns the
  Layer 3 deep navigation #2113 defers**: the `AXChartDescriptor` adapters and point-by-point rotor.
  See `docs/design/ios-chart-accessibility.md` §3, §8.
- #2121 (#2552, #2554) — semantic non-color state cues (trend up/down icons, staleness icon).
  Referenced for the spoken trend/extrema words and the stale indicator above.
- #2116 (#2562, #2564) — net-worth trend chart surface; consumes this navigation pattern via
  `TrendChart`.
- #1239 — Apple Developer enrollment; blocks the native (iOS) half of this work.
- Web reference contract: `apps/web/src/components/charts/chart-palette.ts` (`buildChartDescription`,
  masking-aware), `docs/design/accessibility-patterns.md` §7.2 (chart a11y strategies, incl.
  keyboard point navigation), `docs/design/chart-component-specs.md` (§ Accessibility Contract).
- iOS grounding: `apps/ios/Finance/Charts/{TrendChart,PredictionChart,SpendingChart,CategoryBreakdownChart}.swift`,
  `apps/ios/Finance/Accessibility/AccessibilityModifiers.swift`,
  `apps/ios/Finance/Screens/InvestmentDetailView.swift`.

**Resolved design decisions (in-session, 2026-06-20):**

1. **Navigable data home** — the ordered per-point series is added to the **existing**
   `ChartAccessibilityDescriptor` as an **optional** `series: List<NavigableSeries>` field
   (confirmed by the maintainer 2026-06-20), not a sibling type, so all three layers derive from
   one source of truth and #2834 decision #1 (single accessibility namespace) is preserved (§6).
   The field is optional so summary-only charts don't carry it; per-point labels go through the
   same masking-aware formatter (#2834 decision #2). This is a **#2115-driven addition to the
   #2113-owned type** — #2113 keeps ownership, #2115 only populates/consumes the new field.
2. **Two affordances, not one** — both an `AXChartDescriptor` audio graph (#2542) **and** custom
   `accessibilityRotor`s ("Chart data points" + "Key points") (#2540) are required; the audio graph
   gives traversal + shape, the rotors give targeted jumps to extrema (§3).
3. **Confidence band is a label, not a series** — prediction/forecast band edges ride on each
   predicted point's spoken label and as discrete "Key points" rotor entries, rather than doubling
   the navigable point count with a separate band series (§4c).
4. **Drag overlay retained but hidden** — the existing `.chartOverlay`/`DragGesture` and
   `.chartAngleSelection` stay for pointer users but are marked `.accessibilityHidden(true)` so
   VoiceOver routes through the descriptor + rotor; this satisfies WCAG 2.5.7 without removing the
   visual interaction (§3c).

**Inherited from #2834 (applied, not re-litigated):** descriptor namespace (decision #1); masked
charts speak relative/percentage phrasing but suppress absolute amounts (decision #2); candlestick
spoken depth = close + range + trend with full OHLC in the table (decision #3).
