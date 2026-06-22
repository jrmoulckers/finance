# iOS Dynamic Type Reflow Audit — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20; pending human review & merge
> **Epic:** #2119 · **Closes:** #2548 · **Refs:** #1239
> **WCAG Target:** 2.2 Level AA (1.4.4 Resize Text, 1.4.10 Reflow, 1.4.12 Text Spacing)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is an **audit / breakdown deliverable only** — it inventories every core iOS
finance surface, specifies the Dynamic Type reflow contract each must satisfy across the full
range up to the accessibility sizes (AX1–AX5), and records a per-surface pass/fail verdict
against the **code that exists today** so that, once unblocked, the fixes can proceed without
re-deriving the audit. No Swift code ships with this doc.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — currency formatting source data, masking decisions,
  summary-string assembly, and the chart data-table model (see epic #2113) — live in
  `packages/core` / `packages/models` so all platforms share one source of truth.
- **Apple-framework layout** — Dynamic Type font resolution, `@ScaledMetric` sizing,
  `ViewThatFits` / `@Environment(\.dynamicTypeSize)` reflow, and Swift Charts degradation —
  live in `apps/ios` (the surfaces audited below).

---

## Table of Contents

1. [Why this audit](#1-why-this-audit)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [The reflow rules (the contract every surface must satisfy)](#3-the-reflow-rules-the-contract-every-surface-must-satisfy)
4. [Existing iOS Dynamic Type infrastructure](#4-existing-ios-dynamic-type-infrastructure)
5. [Audited surface map](#5-audited-surface-map)
6. [Per-surface pass/fail checklist](#6-per-surface-passfail-checklist)
7. [State coverage](#7-state-coverage-dynamic-type-privacy-stale-error-empty)
8. [Audit method](#8-audit-method)
9. [Test plan](#9-test-plan)
10. [Cross-references & resolved decisions](#10-cross-references--resolved-decisions)

---

## 1. Why this audit

A low-vision user who raises the system text size to an accessibility setting (AX1–AX5) must
still be able to read every currency amount, label, and control. iOS exposes these sizes through
`DynamicTypeSize.accessibility1 … .accessibility5`; at AX5 body text is roughly **310%** of the
default. WCAG 2.2 requires that content remain usable at this scale: **1.4.4 Resize Text**
(no loss of content/function), **1.4.10 Reflow** (no two-dimensional scrolling / clipping), and
**1.4.12 Text Spacing**.

The risk in a finance app is specific and high-stakes: a truncated balance ("$1,2…") or a
clipped expense row is not a cosmetic bug — it withholds the exact figure the user opened the app
to read. This audit enumerates the core finance surfaces, identifies where today's layouts clip
or truncate at AX sizes, and specifies the reflow rule that resolves each case. It is the
breakdown required by #2548 under epic #2119.

This doc pairs with the chart accessibility pilot (#2113, `docs/design/ios-chart-accessibility.md`):
where a chart cannot be made legible at the largest sizes, it **degrades to that doc's data-table
alternative** rather than scrolling a squeezed plot (§3, §5).

## 2. The cross-platform contract we are mirroring

The web app already solves "the layout must survive extreme scaling" with responsive breakpoints
and a reflow-to-single-column rule, and the chart specs already define a non-visual table path.
iOS Dynamic Type is the native analogue of the web's text-zoom + breakpoint behavior — the same
intent ("amounts never truncate; multi-column rows collapse to one column; charts offer a table")
expressed through Apple APIs instead of CSS.

- `docs/design/responsive-breakpoints.md` — the web surface inventory / column-collapse analogue
  this audit mirrors per surface.
- `docs/design/chart-component-specs.md` (§ Accessibility Contract, lines 111–113, 499–501) — every
  chart ships a **"View as table"** toggle and an `.sr-only` text description. iOS must provide the
  same table path (owned by epic #2113) and present it automatically at the largest sizes.
- `docs/design/accessibility-patterns.md` — existing cross-platform a11y guidance, including the
  Dynamic Type entry (`FinanceTextStyle` enum + `.financeFont()`, line 1256) and the
  touch-target rule (44pt iOS / 48dp Android, line 1300) that this audit applies per surface.

The contract: **scale-up must reflow, never truncate, and never clip.** The web proves the data
model and the table fallback already exist; iOS owns the layout expression.

## 3. The reflow rules (the contract every surface must satisfy)

Every audited surface is graded against these seven rules across AX1–AX5. They are the normative
acceptance criteria for #2119.

| #   | Rule                        | Requirement at AX1–AX5                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **No currency truncation**  | Monetary amounts never ellipsize or clip. Prefer wrapping or reflow over `.minimumScaleFactor` shrink; if shrink is unavoidable it must floor at a legible size (≥ ~14pt) and never use `.lineLimit(1)` + tight width on an amount that can grow (e.g. large balances).                                                                                                                                                                    |
| R2  | **Labels wrap, not clip**   | Payee, category, account, goal, and budget names wrap to multiple lines rather than ellipsize. Replace `.lineLimit(1)` on content labels with multi-line + `.fixedSize(horizontal: false, vertical: true)` (or no limit).                                                                                                                                                                                                                  |
| R3  | **Rows reflow to stacks**   | Horizontal `label … value` rows (transaction rows, summary columns, key/value detail rows) collapse to a vertical stack at `dynamicTypeSize.isAccessibilitySize`. Use `AdaptiveFinanceStack` or `ViewThatFits`.                                                                                                                                                                                                                            |
| R4  | **Charts degrade to table** | When `dynamicTypeSize.isAccessibilitySize` is true (AX1–AX5) the chart auto-presents the #2113 data-table alternative as the **primary** content (axis labels + plotting area are no longer legible by then); standard sizes through xxxLarge keep the visual chart. The "View as table" toggle — and the VoiceOver/audio-graph alternatives — remain available at **all** sizes. Chart frames must use `minHeight`, never fixed `height`. |
| R5  | **44pt tap targets**        | Interactive controls keep a ≥ 44×44pt hit area at every size; targets that hold scaling text/glyphs scale with `@ScaledMetric` rather than a hardcoded 44 that the label can outgrow.                                                                                                                                                                                                                                                      |
| R6  | **No clipping containers**  | No fixed-`height` container wraps scalable text. Cards, rows, buttons, and dividers that bound text must size to content (`minHeight` or intrinsic) so AX text is never cut off.                                                                                                                                                                                                                                                           |
| R7  | **SF Symbols scale**        | Icons paired with text use a relative/text-style font or `@ScaledMetric` so they grow with the label; purely decorative avatar/chip glyphs may stay fixed but must not crowd out wrapping text.                                                                                                                                                                                                                                            |

## 4. Existing iOS Dynamic Type infrastructure

The codebase already ships the scaffolding this audit's fixes should build on — the gap is
**adoption**, not invention. Key building blocks in
`apps/ios/Finance/Accessibility/DynamicTypeSupport.swift`:

- `FinanceTextStyle` enum maps design tokens → Dynamic-Type-aware system fonts; **"never hardcode
  point sizes"** is already the documented rule (lines 20–49). Applied via the `financeFont(_:)`
  view modifier (lines 56–58).
- `ClampedScaledMetric` property wrapper scales a value but clamps min/max so figures never shrink
  below readable or overflow at AX5 (lines 116–138).
- `SizeConstrainedCurrencyText` renders an amount with a 14–52pt clamp, `.minimumScaleFactor(0.7)`,
  and `.lineLimit(1)` (lines 149–162) — usable for **single-line fixed-width** amounts, but note
  R1: it must not be applied to amounts that should be allowed to wrap.
- `AdaptiveFinanceStack` switches `HStack → VStack` when
  `@Environment(\.dynamicTypeSize).isAccessibilitySize` is true (lines 181–192) — this is the
  primary tool for R3 and is currently **defined but not yet consumed by any screen**.
- `DynamicTypeMetrics` demonstrates `@ScaledMetric` icon/padding/tap-target sizing including a
  44pt base (lines 90–102) — the tool for R5/R7.

`CurrencyLabel` (`apps/ios/Finance/Components/CurrencyLabel.swift`) already uses Dynamic Type fonts
with **no hardcoded sizes** and no `.lineLimit`, so the amount itself wraps cleanly (lines 43–48) —
it passes R1 **in isolation**. The failures below are almost always the **container** denying it
room (fixed heights, single-line siblings, or non-reflowing horizontal rows), not the label.

## 5. Audited surface map

Verdict legend: **PASS** = adapts today · **PARTIAL** = adapts but has a specific AX-size gap ·
**FAIL** = clips/truncates at AX sizes, needs layout change.

### Core finance surfaces

| Surface                                                               | Longest / riskiest content                                                                                           | AX5 risk                                                                                                                                                   | Reflow rule (fix)                                                                                                                       | Status      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Transaction row** (`Components/TransactionRowView.swift`)           | Long payee + category·account + amount in one `HStack`                                                               | `Text(payee).lineLimit(1)` (line 21) truncates; category/account row `.lineLimit(1)` (line 25); amount competes for width and can clip                     | R2 + R3: drop `lineLimit(1)` on labels; wrap the row in `AdaptiveFinanceStack` so amount drops below text at AX sizes                   | **FAIL**    |
| **Dashboard — net worth card** (`Screens/DashboardView.swift`)        | Large balance via `CurrencyLabel` `.largeTitle.bold()` (lines 71–76)                                                 | Single large amount; container is `maxWidth:.infinity` with vertical padding, no fixed height → wraps OK                                                   | R1: already compliant; verify wrap at AX5 (no `lineLimit`)                                                                              | **PASS**    |
| **Dashboard — monthly summary** (`Screens/DashboardView.swift`)       | Income / Expenses / Net, three currency columns                                                                      | 3-column `HStack` (lines 92–98) won't fit three amounts; `Divider().frame(height: 44)` (lines 94, 96) is fixed and won't grow with taller columns          | R3 + R6: reflow the three columns to a vertical stack at AX sizes; remove the fixed 44pt divider height (or hide dividers when stacked) | **FAIL**    |
| **Accounts list** (`Screens/AccountsView.swift`)                      | Account name + balance row, 36×36 type glyph (lines 165, 181)                                                        | Name + balance horizontal row risks the same squeeze as transaction rows; glyph circle fixed but decorative                                                | R2 + R3: wrap name, reflow name/balance at AX sizes; glyph stays fixed (R7 decorative exception)                                        | **PARTIAL** |
| **Budgets list** (`Screens/BudgetsView.swift`)                        | Category name + spent/limit + `ProgressRing`; month-nav chevrons `.frame(width: 44, height: 44)` (lines 110, 120)    | Ring label shrinks (see below); chevrons hold 44pt but use a fixed frame, not `@ScaledMetric`; name/amount row squeeze                                     | R3 + R5: reflow name/amount; keep 44pt floor but scale via `@ScaledMetric`                                                              | **PARTIAL** |
| **Goals list** (`Screens/GoalsView.swift`)                            | Goal name + current/target + progress capsule `.frame(height: 10)` (lines 123, 129)                                  | Capsule height is decorative (fine, R6 exception); name/amount horizontal pairing risks truncation                                                         | R2 + R3 on the name/amount pairing; capsule exempt                                                                                      | **PARTIAL** |
| **Progress ring** (`Components/ProgressRing.swift`)                   | `%` or label text inside a fixed `size` circle                                                                       | `.minimumScaleFactor(0.5).lineLimit(1)` (lines 48, 52) shrinks the % to 50% — below legible at AX5; ring `size` is a plain `CGFloat`, not scaled (line 55) | R1 + R6: raise the floor (e.g. 0.7), and make `size` a `@ScaledMetric` so the ring grows with text                                      | **FAIL**    |
| **Currency label** (`Components/CurrencyLabel.swift`)                 | Any amount, any currency                                                                                             | None in isolation — token font, no `lineLimit`, wraps (lines 43–48)                                                                                        | R1: compliant; risk lives in callers that constrain it                                                                                  | **PASS**    |
| **Transaction detail** (`Screens/TransactionDetailView.swift`)        | Key/value detail rows (amount, payee, category, notes)                                                               | Horizontal key/value rows can truncate the value at AX sizes; 64×64 header glyph fixed (line 49)                                                           | R2 + R3 on each detail row; header glyph decorative                                                                                     | **PARTIAL** |
| **Transaction create / edit** (`Screens/TransactionCreateView.swift`) | Form fields, segmented type picker, 44×44 picker cells (line 102), `Color.clear.frame(height: 44)` spacer (line 145) | Picker cells hold 44pt; step indicator `.frame(height: 2)` decorative; field labels may truncate                                                           | R2 on field labels; 44pt cells keep floor (R5)                                                                                          | **PARTIAL** |

### Analytics, investment & report surfaces (chart-bearing)

| Surface                                                            | Longest / riskiest content                                                                   | AX5 risk                                                                                                                      | Reflow rule (fix)                                                                                          | Status   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| **Spending chart** (`Charts/SpendingChart.swift`)                  | Bar chart, currency axis labels `.caption2` / `.caption` (lines 57, 67)                      | `.frame(minHeight: 220)` (line 69) grows OK, but the plotting area + axis labels become unreadable; **no iOS table path yet** | R4: at accessibility sizes (AX1+) present the #2113 data-table alternative; add the "View as table" toggle | **FAIL** |
| **Trend chart** (`Charts/TrendChart.swift`)                        | Time-series line, axis labels                                                                | Same as spending chart — plot does not reflow; labels collide at AX sizes                                                     | R4: degrade to table at accessibility sizes (AX1+)                                                         | **FAIL** |
| **Prediction chart** (`Charts/PredictionChart.swift`)              | Line + confidence band, axis labels                                                          | Same; band/legend text overlaps at AX sizes                                                                                   | R4: degrade to table at accessibility sizes (AX1+) (table includes Low/High columns per #2113 §5)          | **FAIL** |
| **Category breakdown** (`Charts/CategoryBreakdownChart.swift`)     | Pie/donut + legend rows with 10×10 swatch (line 105)                                         | Legend label truncation; swatch fixed (decorative OK); donut center label can clip                                            | R2 + R4: wrap legend labels, degrade to table at accessibility sizes (AX1+)                                | **FAIL** |
| **Budget progress chart** (`Charts/BudgetProgressChart.swift`)     | Per-budget bars + currency labels                                                            | Same chart-reflow gap; bar labels collide                                                                                     | R4: degrade to table at accessibility sizes (AX1+)                                                         | **FAIL** |
| **Analytics screen** (`Screens/AnalyticsView.swift`)               | Hosts charts + summary stat rows, 32×32 glyph (line 289)                                     | Inherits chart gaps; stat rows risk horizontal squeeze                                                                        | R3 + R4: reflow stat rows, charts degrade                                                                  | **FAIL** |
| **Insights screen** (`Screens/InsightsView.swift`)                 | Insight cards + inline charts `.frame(height: 200)` / `.frame(height: 180)` (lines 178, 264) | **Fixed `height:`** on chart containers (not `minHeight`) clips scaled content; legend swatch 10×10 (line 187)                | R4 + R6: change fixed chart heights to `minHeight`; degrade to table at accessibility sizes (AX1+)         | **FAIL** |
| **Health score** (`Screens/HealthScoreView.swift`)                 | Score gauge `.frame(height: 180)` (line 174) + factor rows                                   | Fixed-height gauge container clips scaled center text; factor key/value rows squeeze                                          | R3 + R6: gauge container to `minHeight`/intrinsic; reflow factor rows                                      | **FAIL** |
| **Investment detail** (`Screens/InvestmentDetailView.swift`)       | Holding name + OHLC/price chart + key stats                                                  | Chart-reflow gap; price stat rows (open/high/low/close) truncate horizontally                                                 | R3 + R4: reflow stat rows, chart degrades to OHLC table (#2113 §5)                                         | **FAIL** |
| **Investment portfolio** (`Screens/InvestmentPortfolioView.swift`) | Holdings list (name + value + return%) + performance chart                                   | Three-value horizontal rows squeeze; chart gap                                                                                | R3 + R4                                                                                                    | **FAIL** |
| **Report result** (`Screens/ReportResultView.swift`)               | Generated report charts + tabular figures, 10×10 swatch (lines 117, 282)                     | Chart gap; report value rows truncate                                                                                         | R3 + R4: reflow value rows, charts degrade to table                                                        | **FAIL** |

### Surfaces that already adapt (spot-checked, no change required)

| Surface                                                                                        | Why it passes                                                                                |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Components/CurrencyLabel.swift`                                                               | Token font, no `lineLimit`, no fixed size — wraps freely (lines 43–48). R1 ✓                 |
| `Screens/DashboardView.swift` net-worth card                                                   | `maxWidth:.infinity` + padding, no fixed height; single amount wraps (lines 71–84). R1/R6 ✓  |
| Avatar / type-glyph circles (e.g. `AccountsView.swift:165/181`, `TransactionRowView.swift:18`) | Decorative fixed glyphs; SF Symbol inside scales via its own font. R7 decorative exception ✓ |
| Decorative dividers/capsules (`GoalsView.swift:123/129`, `TransactionCreateView.swift:82`)     | Non-text decorative elements; fixed dimension acceptable. R6 exception ✓                     |

## 6. Per-surface pass/fail checklist

For each surface, all applicable boxes must be checked at **AX5** before the surface is accepted.
This is the runnable acceptance list once #1239 unblocks native snapshot testing (§9).

- [ ] **R1** No currency amount is ellipsized, clipped, or shrunk below ~14pt.
- [ ] **R2** Every content label (payee, category, account, goal/budget name, legend) wraps; none ends in "…".
- [ ] **R3** Multi-column `label … value` rows have collapsed to a vertical stack.
- [ ] **R4** Charts present the data-table alternative at accessibility sizes (AX1+); the "View as table" toggle is reachable at all sizes; chart frames use `minHeight`.
- [ ] **R5** Every interactive control still has a ≥ 44×44pt hit area.
- [ ] **R6** No text is cut off by a fixed-`height` container (cards, rows, buttons, dividers).
- [ ] **R7** Text-paired SF Symbols have grown with their label.
- [ ] No horizontal scrolling is introduced (WCAG 1.4.10 Reflow).
- [ ] VoiceOver reading order is unchanged after reflow.

**Surfaces requiring layout changes (FAIL/PARTIAL):** transaction row, dashboard monthly summary,
progress ring, all chart surfaces (spending, trend, prediction, category breakdown, budget
progress), analytics, insights (fixed chart heights), health score (fixed gauge height),
investment detail/portfolio, report result, accounts/budgets/goals/transaction-detail/create
rows.

**Surfaces already adapting (PASS):** currency label, dashboard net-worth card, decorative
glyph/divider/capsule elements.

## 7. State coverage (Dynamic Type, privacy, stale, error, empty)

The reflow rules must hold in every data state, not just the happy path.

| State            | Requirement at AX1–AX5                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Type** | The core requirement of this doc: at AX5 every amount and label is fully readable; rows reflow (R3); charts degrade (R4); nothing clips (R6). Verified by snapshot at `.accessibility5` (§8).                                                         |
| **Privacy**      | When balances are masked, the masked placeholder (e.g. "••••") still obeys R1/R6 — it must not be clipped either, and the reflow decision must not depend on the unmasked string width (mask first, then lay out). Mirrors #2113 §6 privacy handling. |
| **Stale**        | A staleness indicator (icon + text, per #2121) added to a row/card must be included in the reflow budget — it wraps or stacks with the rest of the row at AX sizes, never pushing the amount off-screen.                                              |
| **Error**        | Error/retry rows (`Components/ErrorStateView.swift`) keep the retry control at a ≥ 44pt target (R5) and wrap the error message (R2) at AX sizes.                                                                                                      |
| **Empty**        | Empty states (`Components/EmptyStateView.swift`) — title + body + CTA — wrap rather than truncate; the illustration may stay fixed (decorative) but must not crowd out the wrapped text (R6/R7).                                                      |

## 8. Audit method

The method below is how each surface's verdict in §5–§6 was derived and how it will be re-verified
once #1239 unblocks the simulator.

1. **Override the size per preview/test** with
   `.environment(\.dynamicTypeSize, .accessibility5)` (and a sweep over `.xLarge`, `.accessibility1`,
   `.accessibility3`, `.accessibility5`). SwiftUI `#Preview` blocks already exist for most
   components and gain an AX5 variant.
2. **Snapshot at AX5** for each surface and diff against the AX1 / default snapshot. A surface
   FAILS if any amount/label is ellipsized or clipped, if a row stays horizontal, or if a chart
   still renders only as a plot.
3. **Reflow probe:** read `@Environment(\.dynamicTypeSize).isAccessibilitySize` in the surface and
   confirm the layout branches (HStack→VStack via `AdaptiveFinanceStack`, or `ViewThatFits`).
4. **Tap-target probe:** measure each interactive frame ≥ 44×44pt at every size (R5).
5. **Container probe:** grep the surface for `.frame(height:` on any container that wraps text;
   any hit that is not purely decorative is an R6 finding (already enumerated in §5).
6. **Chart degradation probe:** confirm the surface swaps to the #2113 data-table when
   `isAccessibilitySize` is true (AX1+), that the "View as table" toggle is reachable at every size
   below AX1, and that the VoiceOver/audio-graph alternatives remain available at all sizes.

Because native execution is blocked by #1239, today's verdicts are derived by **static audit of the
code cited in §5**; the snapshot/probe steps above are the deferred native confirmation.

## 9. Test plan

Smallest set of tests required before the reflow fixes are accepted.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

- Currency/label string formatting that feeds the layout is platform-neutral; assert in
  `packages/core` `commonTest` that the longest realistic formatted amount and the longest
  category/payee fixtures are produced correctly (these are the strings the layout must not clip).
- Masking-aware formatting parity (mirrors #2113): masked mode emits a fixed-width placeholder so
  reflow is deterministic regardless of the underlying balance.
- Chart data-table model (shared with #2113): assert the table rows/columns the iOS degraded view
  renders at accessibility sizes (AX1+) are generated from the shared descriptor, so the table path is validated without
  a simulator.

**Native (iOS, deferred until #1239 unblocks):**

- Snapshot test each surface in §5 across `DynamicTypeSize` cases `[.large, .xxxLarge,
.accessibility1, .accessibility3, .accessibility5]`; assert no clipped/ellipsized amount or label.
- Reflow assertion: at `.accessibility1`+ (`isAccessibilitySize`) the transaction row, dashboard
  monthly summary, and detail/stat rows render as vertical stacks (R3).
- Chart degradation: at `.accessibility1`+ (`isAccessibilitySize`) each chart surface renders the
  data-table alternative as primary content; the "View as table" toggle and the VoiceOver/audio-graph
  alternatives remain present at `.large` too (R4).
- Tap-target assertion: every interactive element reports a ≥ 44×44pt frame at `.accessibility5` (R5).
- Container assertion: no text-bearing container clips at `.accessibility5` (R6) — specifically the
  insights/health-score fixed-height chart frames once converted to `minHeight`.

## 10. Cross-references & resolved decisions

**Related epics / docs (do not duplicate their scope):**

- #2113 (`docs/design/ios-chart-accessibility.md`, merged-ready as PR #2834) — the chart
  **data-table alternative** that R4 degrades to. This audit consumes that table layer; it does not
  redefine the table contract or the spoken summary. **Consistency note:** #2834 specifies that the
  chart data tables "switch to stacked List rows **at accessibility sizes**" — i.e. the AX1
  (`isAccessibilitySize`) boundary. R4's chart auto-swap threshold (§3, §10 decision 1) is
  deliberately keyed on the **same** boundary so the two docs agree; an earlier AX3 draft would have
  contradicted #2834.
- #2121 (#2552, #2554) — semantic non-color state cues (staleness icon). Referenced in §7 (Stale).
- `docs/design/accessibility-patterns.md` — Dynamic Type entry (`FinanceTextStyle` /
  `.financeFont()`, line 1256) and the 44pt iOS touch-target rule (line 1300).
- `docs/design/chart-component-specs.md` (§ Accessibility Contract) and
  `docs/design/responsive-breakpoints.md` — the web "View as table" + column-collapse contract this
  audit mirrors natively (§2).
- Infrastructure to build on: `apps/ios/Finance/Accessibility/DynamicTypeSupport.swift`
  (`AdaptiveFinanceStack`, `ClampedScaledMetric`, `SizeConstrainedCurrencyText`).

**Resolved design decisions (in-session, 2026-06-20):**

1. **Chart → table auto-swap threshold** — charts keep the visual plot through the standard sizes
   (up to xxxLarge) and **auto-present the #2113 data-table alternative as the primary content when
   `dynamicTypeSize.isAccessibilitySize` is true (≥ AX1)**, because the Swift Charts plotting area
   and axis labels are no longer legible by the accessibility sizes. The **"View as table" toggle —
   and the VoiceOver/audio-graph alternatives — remain available at all sizes** so users below AX1
   can opt in. **Maintainer decision (2026-06-20):** key the rule on SwiftUI's canonical
   `isAccessibilitySize` breakpoint (AX1), not a numeric AX3 cutoff — this is Apple's documented
   signal for switching to an accessibility-optimized layout, and it keeps this doc **consistent
   with the #2834 pilot**, whose table rule fires "at accessibility sizes" (the same AX1 boundary).
   (§3 R4, §5.)
2. **Currency at AX sizes — wrap over shrink** — amounts that can grow (balances, totals) must
   **wrap or reflow**, not be locked to `.lineLimit(1)` + `.minimumScaleFactor`. The existing
   `SizeConstrainedCurrencyText` (single-line clamp) is reserved for genuinely fixed-width slots
   (e.g. a compact ring center), not list/detail amounts. (§3 R1, §4.)
3. **Decorative fixed dimensions are exempt** — avatar/type-glyph circles, progress capsules, and
   step-indicator bars may keep fixed sizes (R6/R7 decorative exception) provided they do not crowd
   out wrapping text. Only **text-bearing** containers must size to content. (§5, §6.)
4. **Reuse, don't reinvent** — fixes adopt the already-shipped `AdaptiveFinanceStack` (R3) and
   `@ScaledMetric` (R5/R7) rather than new per-screen logic; the audit gap is adoption, not missing
   primitives. (§4.)
