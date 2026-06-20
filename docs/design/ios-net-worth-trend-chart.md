# iOS Net-Worth Trend Chart & Projection Surface — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20; pending human review & merge
> **Epic:** #2116 · **Closes:** #2562, #2564 · **Refs:** #1239
> **WCAG Target:** 2.2 Level AA (AAA where practical)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI / Swift Charts) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies the minimal net-worth
trend surface (#2562) and the projection overlay + point-inspection UX (#2564) so that, once
unblocked, a native implementation can proceed without re-deriving the contract. No Swift code
ships with this doc.

This is a **chart surface**, so it does **not** re-derive accessibility behaviour. It consumes the
four wave-1 chart-accessibility pattern docs as-is and only specifies the net-worth-specific
application:

- `docs/design/ios-chart-accessibility.md` (epic #2113 / PR #2834) — the three-layer pattern
  (spoken summary, data-table alternative, audio-graph descriptor) and the shared
  `ChartAccessibilityDescriptor`. **NetWorthSnapshot is already listed there as a descriptor feeder**
  (§4, "Net-worth trend (epic #2116)").
- `docs/design/voiceover-chart-navigation.md` (epic #2115 / PR #2835) — `AXChartDescriptor`
  adapter, the custom rotor, the per-point announcement format, and the rule that a confidence band
  is **not** a separately navigable series.
- `docs/design/ios-dynamic-type-reflow.md` (epic #2119 / PR #2836) — the chart→table auto-swap at
  `dynamicTypeSize.isAccessibilitySize` (≥ AX1).
- `docs/design/ios-noncolor-state-cues.md` (epic #2121 / PR #2838) — the proposed `trendUp` /
  `trendDown` / `trendFlat` / `stale` tokens and the non-color "rule of two".

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — the net-worth series, the asset/liability split, the
  forward projection and its confidence, summary-string assembly, and privacy masking — live in
  `packages/core` / `packages/models` so all platforms share one source of truth. These engines
  **already exist** (§5); this surface composes them, it does not add new financial math beyond the
  one proposed projection adapter (§4, §9 decision 1).
- **Apple-framework integration** — Swift Charts layout, the range-selector control, VoiceOver
  semantics, the audio-graph descriptor, scrub/tap inspection, and Dynamic Type layout — live in
  `apps/ios` (`TrendChart.swift` exists; the net-worth detail screen is planned, §6).

---

## Table of Contents

1. [Why this surface](#1-why-this-surface)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [The minimal net-worth trend surface (#2562)](#3-the-minimal-net-worth-trend-surface-2562)
4. [The projection overlay & point-inspection UX (#2564)](#4-the-projection-overlay--point-inspection-ux-2564)
5. [Grounding in the shared engines (packages/core)](#5-grounding-in-the-shared-engines-packagescore)
6. [Surface application map](#6-surface-application-map)
7. [State coverage](#7-state-coverage-dynamic-type-privacy-stale-error-emptyseed)
8. [Test plan](#8-test-plan)
9. [Cross-references & resolved decisions](#9-cross-references--resolved-decisions)

---

## 1. Why this surface

Net worth = **assets − liabilities**. Today iOS shows it as a single static number: the dashboard
net-worth card renders `viewModel.netWorth` through one `CurrencyLabel`
(`apps/ios/Finance/Screens/DashboardView.swift:66–84`, `showSign: false`, `.largeTitle.bold()`) —
no trend, no history, no projection. The web app already goes further with a net-worth sparkline
(`apps/web/src/components/insights/NetWorthChart.tsx`) and a dedicated `NetWorthPage`. A user
opening the app to answer "is my net worth growing, and where is it headed?" gets a point-in-time
figure and nothing else.

Epic #2116 closes that gap with a **clean, minimal** net-worth growth chart (#2562) plus a
**projection overlay and point-inspection UX** (#2564). Because it is a continuous time-series
chart, it must be reachable by VoiceOver, legible at accessibility text sizes, masking-aware, and
distinguishable without color — all of which the wave-1 docs already specify. This document's job
is to wire the **existing shared net-worth and projection engines** (§5) into that pattern, name
the surfaces (§6), and cover the states (§7) — not to re-author accessibility behaviour.

## 2. The cross-platform contract we are mirroring

The web app already defines the shared shapes this surface reuses:

- **Spoken summary** — `apps/web/src/components/charts/chart-palette.ts` → `buildChartDescription(...)`
  (lines 63–75): empty → `"<chartType> with no data."`; otherwise a totalled, per-point sentence,
  with every amount routed through `formatChartCurrency(...)` (`apps/web/src/lib/currency.ts:192`)
  so masked balances are never spoken. iOS produces the **same sentence** from the **same shared
  model** (the `ChartAccessibilityDescriptor` of #2834), then expresses it through Apple APIs.
- **Asset/liability split** — `apps/web/src/lib/insights/netWorthTracker.ts`:
  `getCurrentNetWorthTotals` (lines 13–31) treats `CREDIT_CARD` / `LOAN` as liabilities
  (`isLiabilityType`, lines 7–11) and everything else as assets; `getNetWorthAtDate` (lines 33–47)
  derives an earlier net worth by reversing later cash flow. The KMP engines (§5) are the canonical
  implementation of exactly this rule.
- **Masking primitives** — `MaskingMode` (`apps/web/src/lib/ui/privacy/masking.ts:11`,
  `Visible` / `Masked`), `formatRange(...)` for band bounds, and the masked placeholder
  `"$•••.••"` / SR label `"Amount hidden for privacy"` (`apps/web/src/lib/enhancements/privacy-mode.ts:10,13`).

**One contract gap iOS must NOT copy.** The web `NetWorthChart` is a bare sparkline:
`role="img"` + `aria-label="Net worth trend sparkline"` with the period labels
`aria-hidden="true"` (`NetWorthChart.tsx:36–45`) — it has **no `.sr-only` text description and no
"View as table" path**. That is below the #2834 bar. The iOS net-worth chart must adopt the full
three-layer pattern (summary + table + audio graph), not the sparkline's reduced contract.

## 3. The minimal net-worth trend surface (#2562)

The historical chart is a single-series time-series line. It adopts, without redefinition:

- the **three layers** of #2834 (spoken summary, "View as table", audio-graph descriptor);
- the **audio graph + rotor** of #2835 for point-by-point reading;
- the **chart→table swap at AX1** of #2836;
- the **non-color cues** of #2838 (line-style and direction, never hue alone).

What is **net-worth-specific** and specified here:

### 3a. One restrained series

Per `docs/design/data-visualization.md` and `docs/design/chart-component-specs.md`, the minimal
surface draws **one** "Net Worth" line over month-end points — no stacked asset/liability bands on
the primary view (those live in the data table and the per-point inspection, §4). This maps onto the
existing `TrendChart` data model (`apps/ios/Finance/Charts/TrendChart.swift:16–23`,
`TrendDataPoint(date, value, series: "Net Worth")`), whose header already names it
"Line chart for net-worth or spending trends" (line 6). The chart frame uses `minHeight`, never a
fixed `height` (`TrendChart.swift:135`), per #2836 rule R4.

### 3b. Time-range selection

A labeled segmented control selects the window — **3M / 6M / 1Y / All** — which drives the `months`
argument of `ReportGenerator.netWorthOverTime(...)` (`packages/core/.../analytics/ReportGenerator.kt:102`).
Requirements:

- The control is a single accessibility element with a clear label ("Net-worth time range") and the
  selected value spoken; it is **not** drag-only.
- On range change the chart crossfades (250ms, per `chart-component-specs.md:371`) **and** the
  Layer-1 spoken summary + the data table + the audio-graph descriptor all regenerate from the new
  series, so non-visual users perceive the change too.
- "All" maps to the count of available month-end snapshots; ranges longer than the available history
  clamp to what exists (no fabricated points).

### 3c. The three layers, instantiated for net worth

| Layer                          | Net-worth instantiation                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Spoken summary**         | `"Net worth, <range>. <trend> <delta>. Now <netWorth> on <date>. Peak <value> on <date>."` — masking-aware; trend phrasing/percentage still spoken when masked (#2834 decision 2).           |
| **2 — Data-table alt**         | Columns **Month · Net worth · Assets · Liabilities**, one row per `NetWorthSnapshot` (`NetWorthSnapshot.kt:13–18`). This is the iOS analogue of the web "View as table" the sparkline lacks. |
| **3 — Audio-graph descriptor** | Numeric X (month/epoch) + numeric Y (net worth) from the same series; populated per #2835 §4. Net worth can be negative, so the Y axis is **not** clamped to ≥ 0.                            |

## 4. The projection overlay & point-inspection UX (#2564)

### 4a. Projection overlay (visually & non-visually distinct)

The forecast is drawn as a **dashed line plus a confidence band**, mirroring the existing
`PredictionChart` (`apps/ios/Finance/Charts/PredictionChart.swift`): a dashed `LineMark`
(`StrokeStyle(lineWidth: 2, dash: [6, 4])`, lines 60–74) for the projected net worth and an
`AreaMark` from lower to upper bound for the band (lines 43–57). Distinction from the historical
line is carried by **line style + a labeled "today" boundary**, not color alone (per #2838's
shape/rule-of-two channel); the projected series announces the series name **"Projected net worth"**
so VoiceOver and the rotor separate it from "Net worth" without relying on the dashed style.

**Projection derivation (proposed — see §9 decision 1).** Net-worth projection is a **forward
net-cash-flow extrapolation**: project net worth forward by the expected net cash flow over the
horizon, reusing `BalancePredictionEngine.computeDailyAverage` (income − expense daily averages,
`BalancePredictionEngine.kt:227–242`) and its `PredictionConfidence` ladder
(`BalancePredictionEngine.kt:102–106`). This is the exact mirror of how
`ReportGenerator.netWorthOverTime` already derives _historical_ net worth **backward** — by
subtracting each following month's `netCashFlow` (`ReportGenerator.kt:149–152`). The shared output
shape is the existing `DailyBalanceForecast(date, projectedBalance)` /
`BalancePrediction(predictedBalance, confidence, projectedChange)` (`BalancePredictionEngine.kt:288–318`),
re-expressed as a net-worth series. The confidence band bounds reuse the web `formatRange(...)`
formatter so masking applies uniformly. The proposed thin adapter
(`packages/core/.../prediction/NetWorthProjection`) is **owned by @kmp-engineer / @finance-domain**
and is **not** added in this design PR (file-ownership rule); this section is the spec it implements.

### 4b. Confidence band is not a separate navigable series

Inherited from #2835 §4c: the band is **not** a second series the user steps through. Each projected
point's announcement carries the band inline —
`"<month>, projected <value>, range <low> to <high>, <confidence>"` (e.g. "Sep 2026, projected
$48,200, range $44,000 to $52,400, medium confidence") — sourced from the projection's
`predictedBalance` + bounds + `PredictionConfidence`. The band **edges** remain reachable as
discrete entries in the **"Key points"** rotor for users who want them. The visual band `AreaMark`
is marked `.accessibilityHidden(true)` exactly as `PredictionChart.swift:56` already does.

### 4c. Point inspection (tap / scrub)

Tapping or scrubbing a point shows a callout with **date + net worth** (and, for projected points,
the band range + confidence; for historical points, the **delta vs the previous point**). Today both
`TrendChart` and `PredictionChart` gate this behind a `DragGesture(minimumDistance: 0)`
(`TrendChart.swift:115–134`, `PredictionChart.swift:102–121`) — which #2835 §2 flags as failing WCAG
**2.5.7 Dragging Movements** and being wholly unreachable under VoiceOver. The inspection UX
therefore provides **two parallel paths**:

1. **Pointer path (sighted)** — the existing drag/scrub overlay and `RuleMark` + `PointMark`
   highlight (`TrendChart.swift:77–95`) **stay**, but the overlay rectangle is marked
   `.accessibilityHidden(true)` per #2835 §3c so VoiceOver routes through the descriptor instead of
   an empty drag target.
2. **Non-drag path (VoiceOver / keyboard)** — the audio graph + the "Chart data points" / "Key
   points" rotors of #2835 deliver the same per-point value with no gesture required.

The callout string is the **same masking-aware shared string** as the rotor announcement — assembled
once in shared code, never re-derived on device.

## 5. Grounding in the shared engines (packages/core)

Every value on this surface already has a shared, tested source. No surface-specific financial math
is introduced beyond the §4a projection adapter.

| Surface concern               | Shared source (verified)                                                                                                                           | Notes                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Current net worth             | `FinancialAggregator.netWorth(accounts)` / `netWorth(accounts, liabilities)` (`aggregation/FinancialAggregator.kt:20,34`)                          | `CREDIT_CARD` / `LOAN` count negative; archived/deleted excluded.                                                                    |
| Historical series             | `ReportGenerator.netWorthOverTime(...)` (`analytics/ReportGenerator.kt:102,177`) → `List<NetWorthSnapshot>`, chronological                         | Month-end snapshots; earlier months derived by reversing `netCashFlow`; asset/liability split estimated when no per-account history. |
| Snapshot shape                | `NetWorthSnapshot(date, totalAssets, totalLiabilities, netWorth)` (`analytics/NetWorthSnapshot.kt:13`)                                             | Invariant `netWorth = totalAssets − totalLiabilities`; assets/liabilities are non-negative.                                          |
| Projection + confidence       | `BalancePredictionEngine` (`prediction/BalancePredictionEngine.kt`): `predictAtDate`, `dailyForecast`, `BalancePrediction`, `PredictionConfidence` | Forecasts account balance today; §4a wraps it into a net-worth forward extrapolation.                                                |
| Exact arithmetic              | `Cents` (`models/types/Cents.kt:15`)                                                                                                               | Long-backed, overflow-checked `plus`/`minus`/`times`; `ZERO`, `abs()`, `isNegative()`.                                               |
| Spoken summary / table / axes | `ChartAccessibilityDescriptor` (#2834 §4) — `NetWorthSnapshot` is a listed feeder                                                                  | Net-worth series maps **into** this shared type; the descriptor, not the chart, owns the text.                                       |

**Privacy note on the value objects.** `NetWorthSnapshot` is a derived analytics value object with no
`ownerId` — it is computed on-device from `Account` / `Transaction`, which **do** carry `ownerId`.
The surface never persists a snapshot; masking is applied at format time (§7), not at storage time.

## 6. Surface application map

| Surface                      | File (verified / planned)                                                                                                             | Chart kind                        | Spoken summary template                                                                                    | Range control           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Dashboard net-worth card** | `apps/ios/Finance/Screens/DashboardView.swift:66–84` (exists)                                                                         | compact trend preview (sparkline) | `"Net worth <value>. <trend> <delta> over <range>."` (preview, no projection)                              | none (fixed default 6M) |
| **Net-worth detail**         | planned iOS surface — analogue of `apps/web/src/pages/NetWorthPage.tsx` (not present today; `TrendChart.swift` exists but is unwired) | line + projection overlay         | `"Net worth, <range>. <trend> <delta>. Now <value> on <date>. Projected <value> by <date>, <confidence>."` | 3M / 6M / 1Y / All      |

Notes:

- The **dashboard card stays minimal** (§9 decision 2): it gains a small, tappable trend preview but
  **no** projection overlay and **no** range control — tapping it opens the detail surface. This keeps
  the primary dashboard clean per `docs/design/information-architecture.md`.
- The **net-worth detail surface does not exist on iOS yet.** `TrendChart.swift` is the reusable
  chart; it is currently only exercised by previews (`TrendChart.swift:187–221`) and is not wired to a
  net-worth screen. Building that screen is the implementation work this doc unblocks (gated on #1239).
- Both surfaces render absolute amounts through the masking-aware formatter (§7), never raw `Cents`.

## 7. State coverage (Dynamic Type, privacy, stale, error, empty/seed)

| State            | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dynamic Type** | Per #2836 R4, at `dynamicTypeSize.isAccessibilitySize` (≥ AX1) the chart auto-presents the Layer-2 **Month · Net worth · Assets · Liabilities** table as the primary content; standard sizes keep the visual line. The "View as table" toggle, audio graph, and rotor stay reachable at all sizes. Chart frame uses `minHeight` (`TrendChart.swift:135`).                                                                                                                                                                                                                                                                |
| **Privacy**      | When balances are masked, the **trend shape stays drawn** and the spoken summary still speaks trend/percentage/delta (#2834 decision 2), but every absolute figure — line values, table cells, the callout, the projection value, and the band bounds (`formatRange`) — renders the masked placeholder (`"$•••.••"` / "Amount hidden for privacy"). VoiceOver never reads an amount the screen hides.                                                                                                                                                                                                                    |
| **Stale**        | If the underlying balances are stale (failed/late sync), prepend `"Data may be out of date as of <timestamp>."` to the summary and show the non-color **`stale`** cue (`clock.badge.exclamationmark` + text, #2838 §4). The projection is suppressed while stale (a forecast off stale inputs is misleading) and replaced with a "projection unavailable — data out of date" note.                                                                                                                                                                                                                                       |
| **Error**        | On load failure the chart element exposes `"Unable to load net worth."` with a labeled, focusable **Retry** control (the dashboard already wires a Retry alert, `DashboardView.swift:52–57`); no silent empty chart.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Empty / seed** | New user with **fewer than two** month-end snapshots → seed state: a friendly empty message ("Your net-worth trend will appear as history builds"), the current figure shown as a single point, **no line and no projection**. The projection also stays hidden until confidence clears `LOW` — `BalancePrediction.confidence` is `LOW` when `historicalTxnCount < 10` (`BalancePredictionEngine.kt:102–106`), so a too-thin history shows the historical line without a forecast rather than a wide meaningless band. The "View as table" toggle is hidden at zero rows (mirrors `buildChartDescription`'s empty path). |

## 8. Test plan

Smallest set required before a native implementation of this surface is accepted.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

- `ReportGenerator.netWorthOverTime` series correctness against a known fixture: chronological order,
  month-end dates, `netWorth = totalAssets − totalLiabilities` per snapshot, correct clamp for a
  history shorter than the requested range. Place beside the existing `analytics` suites.
- Net-worth **projection** adapter (§4a): forward extrapolation equals current net worth plus
  expected net cash flow over the horizon; `PredictionConfidence` ladder (`LOW` < 10 txns,
  `MEDIUM`, `HIGH`) matches `BalancePredictionEngine`; band bounds ordered `low ≤ predicted ≤ high`.
- `ChartAccessibilityDescriptor` net-worth summary: empty series → exact "no data" sentence; trend
  (Up/Down/Flat) classification; **masking-aware** formatting emits no raw amount in masked mode
  (parity with `apps/web/src/components/charts/chart-palette.test.ts`); per-projected-point string
  includes range + confidence.
- `Cents` edge cases already covered by `CentsArithmeticEdgeCaseTest` — assert net-worth aggregation
  does not overflow on large/negative balances.

**Native (iOS, deferred until #1239 unblocks):**

- Each surface in §6 exposes exactly **one** chart a11y element with the expected
  `accessibilityLabel` + `accessibilityValue` (the shared summary).
- "View as table" reveals a table whose row count == snapshot count; columns == Month / Net worth /
  Assets / Liabilities.
- The audio-graph `AXChartDescriptor` is present for the net-worth line and the projection (Layer 3).
- Range control: changing 3M→1Y regenerates summary, table, and descriptor (not just the visual line).
- Projected vs historical points are distinguishable **non-visually** (series name "Projected net
  worth"; the band is `accessibilityHidden`).
- Masked-balances mode: no raw amount appears anywhere in the accessibility tree; trend/delta still spoken.
- Dynamic Type AX1+: chart auto-swaps to the data table with no clipped values.

## 9. Cross-references & resolved decisions

**Related epics (do not duplicate their scope):**

- #2113 (PR #2834) `docs/design/ios-chart-accessibility.md` — the three-layer pattern, the shared
  descriptor, and the masking decision. This surface **consumes** it and provides the net-worth feeder.
- #2115 (PR #2835) `docs/design/voiceover-chart-navigation.md` — owns the rotor, per-point
  announcements, and the "band is not a separate series" rule applied in §4b.
- #2119 (PR #2836) `docs/design/ios-dynamic-type-reflow.md` — owns the chart→table threshold used in §7.
- #2121 (PR #2838) `docs/design/ios-noncolor-state-cues.md` — owns the `trendUp/trendDown/trendFlat`
  and `stale` cues used in §4a and §7.
- Web reference: `apps/web/src/lib/insights/netWorthTracker.ts`,
  `apps/web/src/components/insights/NetWorthChart.tsx`, `apps/web/src/pages/NetWorthPage.tsx`,
  `apps/web/src/components/charts/chart-palette.ts`, `docs/design/chart-component-specs.md`.

**Resolved design decisions (in-session, 2026-06-20):**

1. **Net-worth projection derivation** — a **forward net-cash-flow extrapolation** of net worth,
   reusing `BalancePredictionEngine`'s daily-average mechanism and confidence ladder (the mirror of
   `netWorthOverTime`'s backward derivation), rather than summing per-account `predictAtDate` (which
   double-counts transfers and has no net-worth-level confidence). The thin shared adapter is owned
   by @kmp-engineer / @finance-domain and is **not** added in this design PR. _Recommended default —
   flagged to the orchestrator for confirmation; §4a/§9 will be updated if the per-account approach
   is preferred._
2. **Dashboard stays minimal** — the dashboard net-worth card gains only a compact, tappable trend
   preview (no projection overlay, no range control); the full chart + projection + inspection live
   on the dedicated net-worth detail surface (§6).
3. **Accessibility behaviour is inherited, not redefined** — masking rule, chart→table threshold,
   rotor/audio-graph navigation, and non-color cues are taken as-is from the wave-1 docs; this doc
   only specifies the net-worth-specific summary templates, table columns, and surface map.
4. **Confidence band is not a separately navigable series** — inherited from #2835 §4c; each
   projected point carries its band inline, with band edges in the "Key points" rotor (§4b).
