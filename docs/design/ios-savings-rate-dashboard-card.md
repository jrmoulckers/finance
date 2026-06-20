# iOS Savings-Rate Dashboard Card — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20; pending human review & merge
> **Epic:** #2162 · **Closes:** #2589 · **Refs:** #1239 (Apple Developer enrollment, blocking native impl)
> **WCAG Target:** 2.2 Level AA (1.4.1 Use of Color; 1.1.1 Non-text Content; 1.4.10 Reflow)
> **Priority:** P1 (`priority:high`, `effort:s`) · **Milestone:** v1.0
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies the savings-rate card
contract, its placement on the Dashboard, the spoken summary, and per-state behavior so that,
once unblocked, a native implementation can proceed without re-deriving the contract. No Swift
code ships with this doc.

The persona this serves is the **FIRE saver** (#2162): _"I need savings rate front and center on
the iOS dashboard."_ The savings rate is the single number that tells them whether they are on
track, so it is promoted to a first-class card rather than buried in Insights.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — the savings-rate math (income − expense ÷ income),
  the divide-by-zero guard, trend classification (improving / declining / flat) vs. the prior
  period, target comparison, and masking-aware string assembly — live in `packages/core` /
  `packages/models` so all platforms share one source of truth. The savings-rate **math already
  exists and is shared** (`FinancialAggregator.savingsRate`, §3); only the composite **card
  descriptor** (rate + trend + target + spoken summary) is new and is specified — not written —
  here (§4).
- **Apple-framework integration** — the SwiftUI card layout, VoiceOver semantics, Dynamic Type
  reflow, and SF Symbol trend glyph — live in `apps/ios` (planned; the card itself is currently
  absent — the data it needs is already on the view model, §5).

---

## Table of Contents

1. [Why this card](#1-why-this-card)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [The savings-rate calculation (shared engine)](#3-the-savings-rate-calculation-shared-engine)
4. [Shared card descriptor (packages/core)](#4-shared-card-descriptor-packagescore)
5. [Surface application map](#5-surface-application-map)
6. [State coverage](#6-state-coverage-dynamic-type-privacy-stale-error-empty)
7. [Test plan](#7-test-plan)
8. [Cross-references & resolved decisions](#8-cross-references--resolved-decisions)

---

## 1. Why this card

Savings rate — _what fraction of income you keep_ — is the headline metric for a FIRE saver, and
the one number that compresses a whole month of income and spending into "on track / off track."
The iOS Dashboard already computes and caches it
(`DashboardViewModel.savingsRate`, `apps/ios/Finance/ViewModels/DashboardViewModel.swift:64–66,
93–97`) but **never renders it** — the visible cards are net worth and a three-column
Income / Expenses / Net summary (`DashboardView.swift:38–39, 66–106`). #2589 promotes the rate to
its own card.

A rate card carries three accessibility obligations that this doc resolves once:

- **It encodes a trend (improving / declining / flat).** Direction must never be conveyed by
  color (green/red) alone — WCAG 2.2 **1.4.1 Use of Color**. The trend needs a shape + text cue,
  defined in `docs/design/ios-noncolor-state-cues.md` (§4 trend vocabulary), not re-derived here.
- **It must survive privacy masking.** A percentage discloses no absolute balance, so the rate
  and trend stay visible even when amounts are hidden (§6) — this is the established #2834
  decision, not a new call.
- **It must reflow under Dynamic Type.** The card lives on the same Dashboard whose summary row
  is already graded for AX reflow in `docs/design/ios-dynamic-type-reflow.md` (§5).

This document is the **single reusable iOS contract** for the savings-rate card required by
#2589, applied to the Dashboard surface and grounded in the existing shared engine.

## 2. The cross-platform contract we are mirroring

The web app already ships a savings-rate dashboard summary and an insights analysis; iOS mirrors
their **shape** so all platforms speak the same numbers and the same trend language.

- `apps/web/src/lib/dashboard/savings-rate-summary.ts` →
  `buildSavingsRateDashboardSummary(rows, currentMonth)` returns `{ current, prior,
trailingThreeMonth }` where each period summary is
  `{ month, incomeCents, expenseCents, savingsCents, savingsRatePercent }`.
  - Period unit is the **calendar month** (the `month` key; `current` = `currentMonth`,
    `prior` = the immediately preceding month, `trailingThreeMonth` = last 3 months).
  - Divide-by-zero guard: `incomeCents === 0 ? 0 : …` (`savings-rate-summary.ts:33`).
- `apps/web/src/lib/insights/savingsRate.ts` → `analyzeSavingsRate(transactions, period, now)`
  returns `{ currentRate, previousRate, rateChangePoints, change, … , history }`.
  - `change` is the trend classification, produced by `compareValues(current, previous)`
    (`apps/web/src/lib/insights/helpers.ts:51–60`): `up` / `down` / `flat`.
  - `rateChangePoints` is the **percentage-point delta** vs. the prior period (`savingsRate.ts:58`).
- The rate itself comes from `calculateRate(income, spending)`
  (`apps/web/src/lib/insights/helpers.ts:127–133`), whose guard is `if (income <= 0) return 0;`
  then `((income − spending) / income) * 100` rounded to one decimal.

iOS must produce the **same rate, same trend, and the same percentage-point delta** from the
**same shared math**, then express them through Apple accessibility APIs instead of the DOM.

## 3. The savings-rate calculation (shared engine)

**The math already exists in shared code and is already bridged to iOS.** Do not re-implement it
on the platform.

`packages/core/.../aggregation/FinancialAggregator.kt`:

```kotlin
// FinancialAggregator.kt:166–171
fun savingsRate(transactions: List<Transaction>, from: LocalDate, to: LocalDate): Double {
    val income = totalIncome(transactions, from, to)
    if (income.isZero()) return 0.0                          // ← divide-by-zero guard
    val expenses = totalSpending(transactions, from, to)
    return ((income.amount - expenses.amount).toDouble() / income.amount) * 100.0
}
```

- **Cents arithmetic.** `totalIncome` (`:83–92`) and `totalSpending` (`:69–78`) each return
  `Cents` (Long-backed minor units) summed via `it.amount.abs().amount`. The ratio is the only
  floating-point step, and only for the displayed percentage — no money is ever stored as a
  `Double`.
- **Divide-by-zero guard.** `if (income.isZero()) return 0.0` (`:168`). Zero income → rate `0.0`,
  never `NaN`/`Infinity`. This is the **zero-income / first-month** state in §6.
- **Denominator = recorded income.** Income is the sum of `TransactionType.INCOME` transactions
  in range that are not deleted and not `VOID` (`:85–90`). The app has no gross/net-of-tax
  distinction at the transaction layer, so the denominator is **income as the user recorded it**
  — this is **code-forced**, not a preference. A net-of-tax (post-tax) denominator would require a
  **future schema field** to tag/derive tax withholding on income transactions; that field does
  not exist today and is explicitly **not invented** by this card (see resolved decision 2, §8).
- **Period = calendar month.** The iOS view model already calls `savingsRate` with
  `from = startOfMonth … to = endOfMonth`
  (`DashboardViewModel.swift:77–79, 93–97`), matching the web summary's calendar-month unit and
  the KMP `SavingsEngine` income-allocation rule
  (`packages/core/.../savings/SavingsEngine.kt:184–205`, same
  `((income − expenses) / income) * 100` shape with an `income <= 0` guard). The card uses the
  **same calendar month**; trend compares against the **prior calendar month** (resolved
  decision 1, §8).

**What is missing (and is the only new shared work):** `savingsRate` returns a single `Double`
for one window. The card additionally needs the **prior-period rate**, the **trend
classification**, the **percentage-point delta**, an optional **target**, and a **masking-aware
spoken summary**. Those are assembled by the proposed descriptor in §4 — they are **not** new math,
just composition over the existing `savingsRate`/`totalIncome`/`totalSpending` calls.

## 4. Shared card descriptor (packages/core)

Add a platform-neutral descriptor so the on-screen figure, the trend cue, and the VoiceOver
summary are all derived once and shared with web parity. **Proposed — owned by @kmp-engineer; not
implemented in this doc.** Home: the same cross-cutting `packages/core/.../accessibility`
namespace introduced by the chart-accessibility pattern (`docs/design/ios-chart-accessibility.md`
§4), so the trend cue type is shared rather than re-declared per surface.

**Proposed shared type (Kotlin, illustrative):**

```kotlin
// packages/core/.../savings/SavingsRateCardDescriptor.kt (proposed, @kmp-engineer)
data class SavingsRateCardDescriptor(
    val periodLabel: String,        // "This month" / "June 2026"
    val currentRatePercent: Double, // FinancialAggregator.savingsRate(current month)
    val priorRatePercent: Double?,  // savingsRate(prior month); null if no prior data
    val changePoints: Double?,      // currentRate − priorRate, percentage points (web: rateChangePoints)
    val trend: TrendDirection?,     // Improving / Declining / Flat — null when no prior period
    val targetPercent: Double? = null, // optional user/FIRE target (e.g. 20%, the SavingsEngine threshold)
    val hasIncome: Boolean,         // false → zero-income/first-month empty state (§6)
    val spokenSummary: String,      // masking-aware VoiceOver sentence (below)
)

enum class TrendDirection { IMPROVING, DECLINING, FLAT } // maps to trendUp/trendDown/trendFlat cues
```

- `currentRatePercent` / `priorRatePercent` are produced **only** by
  `FinancialAggregator.savingsRate` for the current and prior calendar month — no parallel
  formula.
- `trend` is derived exactly like the web `compareValues` (`helpers.ts:51–60`): strictly greater →
  `IMPROVING`, strictly less → `DECLINING`, equal → `FLAT`. It maps to the **canonical
  `trendUp` / `trendDown` / `trendFlat` cue tokens** defined in
  `docs/design/ios-noncolor-state-cues.md` (§4 _Investment / trend states_; §5.2 proposed token
  table). A higher savings rate is good, so `IMPROVING → trendUp` even though many "up" cues are
  warnings elsewhere — the **tone** differs, the **shape/label** are reused.
- `targetPercent` defaults to the **20% threshold** the shared `SavingsEngine` already uses to
  flag an income-allocation opportunity (`SavingsEngine.kt:207`), giving the card a sensible
  default goal line without inventing a new constant.
- `spokenSummary` is masking-aware: it always speaks the **percentage and trend** (a rate is
  relative; §6), and only suppresses absolute currency figures when balances are masked. Template:

  > _"Savings rate this month: 32%. Improving, up 4 points from last month. Target 20%, on track."_
  > Zero-income: _"Savings rate this month: not available yet — no income recorded this month."_

Extending the descriptor over the existing aggregator calls is the smallest shared change; iOS
consumes it via the KMP bridge (the same bridge already serving `DashboardViewModel.savingsRate`)
and renders the card.

## 5. Surface application map

The card has exactly one home in v1.0: the iOS **Dashboard**, directly under the existing monthly
summary so the FIRE saver sees the rate "front and center" (#2162).

| Surface                            | File / anchor                                                                        | Card placement                                                                                         | Data source (already present)                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard — net worth**          | `DashboardView.swift:66–84` (`net_worth_card`)                                       | unchanged (sits above)                                                                                 | `viewModel.netWorth`                                                                                                            |
| **Dashboard — savings rate (NEW)** | `DashboardView.swift` `VStack` at `:34–43`, inserted **after** `spendingSummaryCard` | New `savingsRateCard`, `accessibilityIdentifier("savings_rate_card")`, between summary & budget health | `viewModel.savingsRate`, `monthlyIncome`, `monthlyExpenses` (`DashboardViewModel.swift:59–97`) + proposed prior-month rate (§4) |
| **Dashboard — monthly summary**    | `DashboardView.swift:88–106` (`spending_summary_card`)                               | unchanged (sits above the new card; supplies the absolute Income/Expenses/Net)                         | `viewModel.monthlyIncome`, `viewModel.monthlyExpenses`                                                                          |

**Card anatomy (one VoiceOver element):**

- **Headline:** the current-period rate, e.g. "32%", as the large figure (mirrors the
  net-worth card's `largeTitle.bold()` treatment, `DashboardView.swift:71–76`).
- **Trend row:** SF Symbol trend glyph + signed point delta + word — e.g. `arrow.up.right`
  "+4 pts · Improving" — glyph + text + tone (never color alone), tokens per
  `ios-noncolor-state-cues.md` §4.
- **Target row (optional):** "Target 20% · On track" when a target is set.
- **Accessibility:** `.accessibilityElement(children: .combine)` exposing the §4
  `spokenSummary` as the value (consistent with how `net_worth_card` and `spending_summary_card`
  already combine children, `DashboardView.swift:81–83, 103–105`). The card must NOT expose the
  glyph and each label as separate unlabeled elements.

The card reads its absolute Income/Expenses context from the adjacent monthly summary; it does
**not** duplicate those figures, keeping the rate the single focus.

## 6. State coverage (Dynamic Type, privacy, stale, error, empty)

| State                                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dynamic Type**                      | Headline, trend row, and target row use scalable text styles. The trend glyph + delta + word reflow to a vertical stack at `dynamicTypeSize.isAccessibilitySize` (AX1–AX5) — the card is a sibling of the Dashboard monthly-summary row already graded **FAIL → must reflow to a stack** in `docs/design/ios-dynamic-type-reflow.md` (§5, R3 + R6); the new card adopts the same rule and must NOT ship with a fixed-height container or a one-line trend row. No truncation of the percentage.                                                        |
| **Privacy (masked)**                  | The **rate percentage and the trend cue stay visible** when balances are masked — a percentage and a direction disclose no absolute amount. This is the established decision in `ios-chart-accessibility.md` §6 / resolved decision #2, and `ios-noncolor-state-cues.md` §7 (_"the direction/trend cue and tone still show … the masked figure replaces the number"_). Only absolute currency (the adjacent Income/Expenses figures) is masked; `spokenSummary` speaks "Savings rate 32%, improving" but never an absolute dollar amount while masked. |
| **Stale**                             | If the underlying data is stale (failed/late sync), prepend "Data may be out of date as of <timestamp>." to `spokenSummary` and show the non-color staleness indicator (icon + text) defined in `ios-noncolor-state-cues.md` (§4/§5, `stale` token). The rate still renders from last-known data; it is not blanked.                                                                                                                                                                                                                                   |
| **Error**                             | On load failure the Dashboard already surfaces a retry alert (`DashboardView.swift:52–60`). The card itself, when it cannot compute, exposes "Savings rate unavailable." as a labeled element rather than a silent blank or a misleading "0%".                                                                                                                                                                                                                                                                                                         |
| **Empty — zero income / first month** | When no income is recorded in the period, `FinancialAggregator.savingsRate` returns `0.0` by guard (`:168`). The card MUST distinguish this from a genuine 0% rate using `hasIncome` (§4): render "Not available yet" / "Add income to see your savings rate," **not** "0%". This is the first-month / new-user state for the FIRE persona. No trend row is shown (no prior basis).                                                                                                                                                                    |
| **Negative savings rate**             | When expenses exceed income, the rate is negative (e.g. −15%). The card renders the signed value, the `trendDown`/declining cue when it worsened vs. prior, and a plain-language note ("Spending exceeded income this month"). Negative is a legitimate value — never clamp to 0 — but it is visually and in VoiceOver distinct from the zero-income empty state above.                                                                                                                                                                                |

## 7. Test plan

Smallest set of tests required before a native implementation of this card is accepted.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

- Savings-rate math (already shared — extend existing coverage):
  - **zero-income guard**: income = 0 → rate `0.0`, never `NaN`/`Infinity`
    (`FinancialAggregator.savingsRate:168`). Pair with the descriptor's `hasIncome = false` so the
    UI can tell "no income" apart from a real 0%.
  - known-fixture rate: income 5000.00, expenses 3400.00 → 32.0% (Cents in, percentage out).
  - **negative rate**: expenses > income → strictly negative percentage, not clamped.
  - exclusion rules honored: deleted (`deletedAt != null`) and `VOID` transactions are excluded
    from both income and expense sums (`:73–75, 87–89`).
  - Place beside existing `packages/core/src/commonTest/.../aggregation/FinancialAggregatorTest.kt`
    and `…/FinancialAggregatorEdgeCaseTest.kt`.
- `SavingsRateCardDescriptor` assembly (proposed type, §4):
  - trend classification at the boundary: current > prior → `IMPROVING`, `<` → `DECLINING`,
    `==` → `FLAT` (parity with web `compareValues`, `helpers.ts:51–60`).
  - `changePoints` equals `currentRate − priorRate` (parity with web `rateChangePoints`,
    `savingsRate.ts:58`).
  - **masking-aware summary**: masked mode emits the percentage + trend but no absolute currency
    (parity with the web masking contract and `ios-chart-accessibility.md` §6).
  - target comparison: `targetPercent` default = 20% (`SavingsEngine.kt:207`); "on track" vs.
    "below target" phrasing flips at the threshold.

**Native (iOS, deferred until #1239 unblocks):**

- Snapshot/UI test: the Dashboard exposes exactly one `savings_rate_card` a11y element with the
  expected combined `accessibilityLabel` + `accessibilityValue` (the §4 `spokenSummary`).
- Zero-income state renders "not available yet," not "0%".
- Negative-rate state renders the signed value + declining cue, distinct from the empty state.
- Dynamic Type AX5: trend row reflows to a stack; percentage is not clipped (per
  `ios-dynamic-type-reflow.md` §5 R3/R6).
- Masked-balances mode: the percentage and trend remain in the accessibility tree; no absolute
  amount appears.
- Non-color check: trend is distinguishable in grayscale (glyph + word present, not color alone).

## 8. Cross-references & resolved decisions

**Related docs (do not duplicate their scope):**

- `docs/design/ios-noncolor-state-cues.md` (#2121, PR #2838) — **canonical** trend (`trendUp` /
  `trendDown` / `trendFlat`) and `stale` cue vocabulary. This card consumes those **proposed**
  trend tokens (in-flight in PR #2838) for its trend and stale rows; it does not redefine them.
- `docs/design/ios-dynamic-type-reflow.md` (#2119) — Dashboard reflow audit; the new card adopts
  the monthly-summary row's R3/R6 reflow verdict (§5).
- `docs/design/ios-chart-accessibility.md` (#2113) — text-alternative + masking decision; cited
  if a sparkline/mini-trend is later added to the card (a sparkline would need the §1–§2
  text-alternative + audio-graph contract). This card ships **without** a chart in v1.0, so that
  contract is referenced, not applied yet.
- Web reference contract: `apps/web/src/lib/dashboard/savings-rate-summary.ts`,
  `apps/web/src/lib/insights/savingsRate.ts`, `apps/web/src/lib/insights/helpers.ts`
  (`calculateRate`, `compareValues`).
- Shared engine: `packages/core/.../aggregation/FinancialAggregator.kt` (`savingsRate`,
  `totalIncome`, `totalSpending`); `packages/core/.../savings/SavingsEngine.kt` (20% threshold).
- iOS host: `apps/ios/Finance/Screens/DashboardView.swift`,
  `apps/ios/Finance/ViewModels/DashboardViewModel.swift`.

**Resolved design decisions (grounded in existing shared behavior, 2026-06-20):**

1. **Period = calendar month; trend vs. the prior calendar month.** **Maintainer-confirmed
   2026-06-20.** Not a free choice — every existing implementation already uses the calendar
   month: the web dashboard summary (`savings-rate-summary.ts`, `current`/`prior`), the iOS view
   model (`DashboardViewModel.swift:77–79`), and the KMP `SavingsEngine` income rule
   (`SavingsEngine.kt:184–205`). The card matches them. A **trailing-3-month** smoothing view is a
   **documented future secondary view** (web `trailingThreeMonth`,
   `savings-rate-summary.ts:51–54`), out of scope for the v1.0 card. A **trailing-30-day** window
   was considered and **rejected** (it would diverge from web + KMP + the existing iOS view model).
2. **Denominator = income as recorded (gross of any tax modeling).** **Maintainer-confirmed
   2026-06-20 as code-forced.** The transaction layer has no gross/net-of-tax split; `totalIncome`
   sums `TransactionType.INCOME` transactions (`FinancialAggregator.kt:83–92`). The rate therefore
   uses income exactly as the user logged it, consistent across web and KMP. A net-of-tax
   denominator would require a **future schema field** to tag/derive tax on income; that field is
   **not invented here** — if post-tax savings rate is wanted later, it is a separate schema +
   engine change (proposed, @kmp-engineer), not a card-layer decision.
3. **Masked rate is still shown.** A savings rate is a percentage (relative), so it and its trend
   remain visible when absolute balances are masked; only absolute currency is suppressed. This is
   parity with `ios-chart-accessibility.md` §6 decision #2, not a new call (§6).
4. **Zero income ≠ 0% rate.** The shared guard returns `0.0` for zero income; the descriptor's
   `hasIncome` flag lets the UI render a distinct "not available yet" empty state instead of a
   misleading 0% (§6).
