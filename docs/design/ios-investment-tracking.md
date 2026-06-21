# iOS Investment Tracking — KMP-Backed Data & Contribution-Aware Projections

> **Status:** Design spec (implementation blocked) · **Milestone:** v1.0 (design-spec)
> **Epic:** #2118 — Trustworthy investment tracking with real data and compound-growth projections
> **Closes:** #2568 (KMP-backed iOS investment data, replacing mocks) · #2570 (Contribution-aware portfolio metrics and projections)
> **Owner:** @ios-engineer · **Shared work proposed for:** @kmp-engineer
> **Blocked by:** #1239 (Apple Developer Program enrollment) — **no Swift implementation lands until this clears.** This document is a design-only deliverable; it ships **one** new doc and touches no Swift or `packages/*` code.
> **Consumes (does not duplicate):** [`ios-chart-accessibility.md`](./ios-chart-accessibility.md), [`voiceover-chart-navigation.md`](./voiceover-chart-navigation.md), [`ios-noncolor-state-cues.md`](./ios-noncolor-state-cues.md), [`ios-dynamic-type-reflow.md`](./ios-dynamic-type-reflow.md), [`ios-net-worth-trend-chart.md`](./ios-net-worth-trend-chart.md).

This spec follows the wave-1 pilot structure established by [`ios-chart-accessibility.md`](./ios-chart-accessibility.md): a status blockquote, an anchored table of contents, numbered sections, a per-surface application map, a state-coverage table, and a commonTest-vs-native-deferred test plan. Accessibility behaviour (chart text alternatives, VoiceOver point navigation, non-color gain/loss cues, Dynamic Type reflow) is **referenced by path**, not re-derived.

---

## Table of contents

1. [Context and scope](#1-context-and-scope)
2. [Current state (grounded in code)](#2-current-state-grounded-in-code)
3. [KMP-backed investment data model (#2568)](#3-kmp-backed-investment-data-model-2568)
4. [Contribution-aware portfolio metrics (#2570)](#4-contribution-aware-portfolio-metrics-2570)
5. [Compound-growth projection and confidence treatment (#2570)](#5-compound-growth-projection-and-confidence-treatment-2570)
6. [Per-surface application map](#6-per-surface-application-map)
7. [State coverage](#7-state-coverage)
8. [Accessibility and non-color cues](#8-accessibility-and-non-color-cues)
9. [Proposed shared additions (for @kmp-engineer)](#9-proposed-shared-additions-for-kmp-engineer)
10. [Test plan](#10-test-plan)
11. [Cross-references and resolved decisions](#11-cross-references-and-resolved-decisions)

---

## 1. Context and scope

Epic #2118 has two deliverables that this document designs together because they share the same data path and surfaces:

- **#2568 — Real data, not mocks.** The iOS investment surfaces currently render hardcoded sample holdings and a randomly-generated performance series. This spec designs the KMP-backed data model (real holdings/positions, cost basis, current value, gain/loss) grounded in the shared investment engine, and the repository swap that replaces the mock.
- **#2570 — Contribution-aware metrics + projection.** Today's "return" treats every dollar of cost basis identically, so money the user _deposited_ inflates portfolio value and can be misread as a _gain_. This spec designs contribution-adjusted metrics (so deposits aren't mistaken for gains) plus a compound-growth projection with a confidence treatment consistent with the net-worth trend chart.

**Out of scope:** live market-price ingestion (a separate sync concern), tax-lot disposal/wash-sale reporting (already modelled on web — see §3.3), and any Swift code (blocked by #1239). All monetary math in this spec is specified in `Cents` (`Long`-backed); floating-point is permitted **only** for unitless ratios (percentages, growth rates), never for money.

---

## 2. Current state (grounded in code)

### 2.1 Shared engine — what exists

`InvestmentEngine` is a pure `commonMain` object with holding/portfolio models and synchronous performance math:

- Models: `Holding`, `Portfolio`, `HoldingPerformance`, `PortfolioSummary`, `AssetClass` — `packages/core/src/commonMain/kotlin/com/finance/core/investment/InvestmentEngine.kt:67-88`.
- Per-holding metrics: `totalReturnPercent` (`:18`), `unrealisedGainLoss` (`:23`), `dailyReturnPercent` (`:25`).
- Portfolio aggregates: `portfolioValue`/`portfolioCostBasis`/`portfolioGainLoss` (`:30-32`), `portfolioReturnPercent` (`:34`), `assetAllocation` (`:40`), `topGainers`/`topLosers` (`:51-59`), `summary` (`:61`).
- `Holding.gainLoss` / `Holding.isProfit` computed properties — `InvestmentEngine.kt:76-77`.

The engine is well-tested (`packages/core/src/commonTest/kotlin/com/finance/core/investment/InvestmentEngineTest.kt`) and uses `Cents` arithmetic with overflow guards (`packages/models/src/commonMain/kotlin/com/finance/models/types/Cents.kt:13-54`). `Cents.fromDollars` (`Cents.kt:64`) is explicitly documented as display/input-only.

**Gap for #2570:** every return figure is `(currentValue − costBasis) / costBasis` (`InvestmentEngine.kt:20`, `:37`). There is **no** concept of a time-ordered cash-flow series, no contribution-adjusted return, and no projection. Confirmed by search: no `projection`, `compound`, `contribution`, `moneyWeighted`, `timeWeighted`, or `annualized` symbols exist anywhere under `packages/core/.../investment/`.

### 2.2 Persistence — what is missing

`packages/models/src/commonMain/sqldelight/com/finance/db/` contains `Account.sq`, `Transaction.sq`, `Budget.sq`, `Goal.sq`, `Liability.sq`, `Category.sq`, `Household.sq`, `User.sq` — but **no** `Holding`/`Investment`/`Lot` table. Investment holdings exist only as in-memory engine models and as TypeScript types on web. So #2568's persistence layer is genuinely new shared work (see §3.2), not a wiring exercise.

### 2.3 iOS surfaces — what renders today

| File                                                                 | Role                                                                                                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ios/Finance/Models/InvestmentModels.swift`                     | `HoldingItem`, `PortfolioItem`, `AllocationSlice`, `PerformanceDataPoint`, `AssetClassUI`. Mirrors KMP types in minor units.                                               |
| `apps/ios/Finance/Screens/InvestmentPortfolioView.swift`             | Summary card, **performance line chart** (`:144-163`), allocation list, holdings list.                                                                                     |
| `apps/ios/Finance/Screens/InvestmentDetailView.swift`                | Header, metrics grid, **price-history line chart** (`:158-165`), details.                                                                                                  |
| `apps/ios/Finance/ViewModels/InvestmentViewModel.swift`              | `@Observable` VM; `loadPortfolios` (`:61`), `loadPerformanceHistory` (`:80`), allocation compute (`:92`). Already bridges via `SwiftExportFormatterModule` (`:23`, `:54`). |
| `apps/ios/Finance/Repositories/InvestmentRepository.swift`           | Protocol contract (`:18-37`); swap point for the KMP-backed impl.                                                                                                          |
| `apps/ios/Finance/Repositories/Mocks/MockInvestmentRepository.swift` | **The mock to replace** — explicit TODO at `:7-8`; six hardcoded holdings (`:17-60`); randomised performance series (`:85-97`).                                            |

**Live color-only gap (#2121).** `HoldingItem.gainLossColor` (`InvestmentModels.swift:97-101`) and `PortfolioItem.gainLossColor` (`:133-137`) return `.green` / `.red` / `.primary` with **no** non-color companion. They are consumed for the return percentage in `InvestmentPortfolioView.swift:113` and `:284`, in `InvestmentDetailView.swift:68`, and the daily-change figure uses a bare `dailyPct >= 0 ? .green : .red` at `InvestmentDetailView.swift:75`. The detail price-history chart even colours the **entire line** by `holding.gainLossColor` (`InvestmentDetailView.swift:163`), so a red/green line is the _only_ signal of loss vs gain. This is exactly the gap [`ios-noncolor-state-cues.md`](./ios-noncolor-state-cues.md) addresses; §8 maps the fix onto each surface.

### 2.4 Cross-platform contract (web)

Web carries the richest investment contract and is the reference for parity:

- Lot-level cost basis and `CostBasisMethod` (`FIFO`/`LIFO`/`SPECIFIC_ID`/`AVERAGE_COST`) — `apps/web/src/types/investment.ts:88-112`.
- Account taxonomy + tax treatment (`TAXABLE`/`TAX_DEFERRED`/`TAX_FREE`) — `investment.ts:19-51`.
- Repositories `apps/web/src/db/repositories/investments.ts` and `investment-lots.ts`; hook `apps/web/src/hooks/useInvestments.ts`; pages `InvestmentsPage.tsx`, `InvestmentDetailPage.tsx`.
- CVD-safe chart palette and the masking-aware `buildChartDescription` — `apps/web/src/components/charts/chart-palette.ts:22-29`, `:63-75`.

The KMP-backed model in §3 deliberately mirrors the web lot model so all four platforms compute identical figures from one engine.

---

## 3. KMP-backed investment data model (#2568)

### 3.1 Goal

Replace `MockInvestmentRepository` with a repository that reads **real** persisted holdings and lots through the shared KMP layer, surfaced to SwiftUI via the existing Swift Export bridge — with **zero** change to `InvestmentViewModel` or the views, because the swap happens behind the `InvestmentRepository` protocol (`InvestmentRepository.swift:18-37`).

### 3.2 Proposed persistence (SQLDelight, for @kmp-engineer)

New `commonMain` SQLDelight tables, following the sync-table conventions already used by `Account.sq` (every sync-enabled table carries `owner_id` referencing `auth.uid()` and `household_id` for household-level RLS isolation — see the repo schema-alignment standard):

- **`Investment`** — one row per security position: `id`, `owner_id`, `household_id`, `account_id` (FK → `Account`), `symbol`, `name`, `asset_class` (maps `AssetClass`, `InvestmentEngine.kt:67`), `quantity`, `current_value_cents`, `previous_close_cents` (nullable), `currency`, `last_updated`, `created_at`/`updated_at`/`deleted_at` (soft-delete parity with `Portfolio`, `InvestmentEngine.kt:84`).
- **`InvestmentLot`** — purchase lots for cost basis, mirroring web's `Lot` (`investment.ts:99-112`): `id`, `investment_id` (FK), `purchase_date`, `shares`, `cost_per_share_cents`, `total_cost_cents`, `cost_basis_method`. Per-holding `costBasis` is then `Σ lot.total_cost_cents`, never a stored denormalised guess.
- **`InvestmentCashFlow`** — the new series that makes #2570 possible: `id`, `account_id`, `flow_date`, `amount_cents` (signed: `+` deposit/buy contribution, `−` withdrawal/sell proceeds), `kind` (`CONTRIBUTION`/`WITHDRAWAL`/`DIVIDEND`/`FEE`). Without this table, contributions cannot be separated from gains.

> Schema changes are serialized: only @backend-engineer writes the matching Supabase migration and only @kmp-engineer writes the `.sq` files, as a single coordinated task. This doc only _proposes_ the shape.

### 3.3 Repository and bridge path

```
SQLDelight (Investment, InvestmentLot, InvestmentCashFlow)
        │
        ▼
InvestmentRepository (commonMain)  ──┐  pure Kotlin; returns Holding / Portfolio (InvestmentEngine.kt models)
        │                            │
        ▼                            │  Swift Export bridge (same mechanism as SwiftExportFormatterModule,
KmpInvestmentRepository (iosMain)    │  InvestmentViewModel.swift:23,:54)
        │                            │
        ▼                            ▼
iOS InvestmentRepository protocol  →  InvestmentViewModel  →  Views
(InvestmentRepository.swift:18-37)     (unchanged)             (unchanged)
```

The new `KmpInvestmentRepository: InvestmentRepository` implements the six protocol methods (`getPortfolios`, `getPortfolio`, `getHoldings`, `getHolding`, `getPerformanceHistory`, `deleteAllInvestments`) by delegating to the shared repo and mapping engine models → `HoldingItem`/`PortfolioItem`. `deleteAllInvestments()` (`InvestmentRepository.swift:36`) maps to a soft-delete/purge on the new tables and **must** be wired into the existing GDPR "Delete Everything" path (the mock's no-op at `MockInvestmentRepository.swift:99` is a privacy gap that real data closes).

`MockInvestmentRepository` is **retained** as a `#if DEBUG` preview/test double only (it still backs `#Preview` in `InvestmentPortfolioView.swift:303-306` and `InvestmentDetailView.swift:256`), but is removed from `RepositoryProvider.shared.investments` in release builds.

### 3.4 Real performance history replaces the random series

`MockInvestmentRepository.getPerformanceHistory` fabricates a series with `Int64.random` growth (`MockInvestmentRepository.swift:91-95`). The KMP-backed `getPerformanceHistory` instead reconstructs **actual** historical portfolio value from valuation snapshots + cash flows (see §4), returning the same `[PerformanceDataPoint]` (`InvestmentModels.swift:150-157`) the chart already consumes — so the view at `InvestmentPortfolioView.swift:144` needs no change.

---

## 4. Contribution-aware portfolio metrics (#2570)

### 4.1 The problem, precisely

If a user starts at $10,000, deposits $5,000, and ends at $15,500, the naive figure `(15,500 − 10,000)` reads as a **$5,500 gain** when the true gain is **$500**. Today every iOS return number is exposed to this error because it derives from `costBasis`/value deltas only (`InvestmentEngine.kt:20`, `InvestmentModels.swift:85-88`). The fix is to net out contributions.

### 4.2 Recommended metrics (proposed default — pending orchestrator confirmation)

Two complementary, Cents-exact metrics, layered from simplest to most rigorous:

1. **Net-contribution-adjusted gain (headline, lifetime).**
   `netInvested = Σ contributions − Σ withdrawals` (from `InvestmentCashFlow`).
   `adjustedGain = currentValue − netInvested` (Cents subtraction, `Cents.kt:25`).
   `adjustedReturnPercent = adjustedGain.amount / netInvested.amount × 100` (ratio → `Double`).
   This is the figure that replaces the misleading headline and is trivially exact and testable.

2. **Modified Dietz money-weighted return (period / annualized).**
   A closed-form, timing-aware money-weighted return — no iterative root-finding, fully deterministic, ideal for `commonTest`:

   ```
   R = (endValue − startValue − netFlows) / (startValue + Σ (weight_i × flow_i))
   weight_i = (periodDays − dayOfFlow_i) / periodDays
   ```

   All numerator/denominator terms are `Cents`; only the final division yields a `Double`. Annualize with `(1 + R)^(365 / periodDays) − 1`.

**Why not full XIRR for v1?** True money-weighted IRR (XIRR) requires Newton/bisection iteration. Modified Dietz is the industry-standard closed-form approximation, captures cash-flow _timing_ (which simple net-contribution does not), and is far easier to pin down with exact test vectors. XIRR is proposed as an optional fast-follow in §9. **Time-weighted return (TWR)** is deliberately excluded from v1: it removes the investor's contribution-timing on purpose (it is for benchmark comparison), which is the opposite of what #2570 needs.

> **Open design decision flagged to orchestrator (§11):** confirm v1 = _net-contribution-adjusted gain + Modified Dietz_, deferring XIRR. Recommended default baked into this doc.

### 4.3 Where each metric surfaces

- Portfolio summary card headline gain (`InvestmentPortfolioView.swift:98-104`) → **net-contribution-adjusted gain**, with a secondary "Money-weighted return (annualized)" line from Modified Dietz.
- Holding row / detail return % (`InvestmentPortfolioView.swift:281-285`, `InvestmentDetailView.swift:65-69`) → keep simple total return at the _lot_ level (a single holding's cost basis already equals its contributions) but label it "Total return" to distinguish from the portfolio-level adjusted return.
- A new "Contributions vs. growth" breakdown on the summary card: `netInvested` and `adjustedGain` shown side by side so the user sees how much of their balance they _put in_ vs. _earned_.

---

## 5. Compound-growth projection and confidence treatment (#2570)

### 5.1 Precedent to follow

Two in-repo precedents anchor this design so we stay consistent:

- **Net-worth forward projection + confidence band** — [`ios-net-worth-trend-chart.md`](./ios-net-worth-trend-chart.md) (PR #2842). The investment projection chart reuses its forward-projection visual language (solid historical line → dashed projected line → shaded confidence band) and its VoiceOver treatment.
- **Shared prediction engine pattern** — `packages/core/.../prediction/BalancePredictionEngine.kt:20` already models a forecast with a discrete `PredictionConfidence` enum (`BalancePredictionEngine.kt:56`) and Cents-based roll-forward (`:37-60`). The projection adapter mirrors this structure (deterministic, pure `commonMain`, Cents in / Cents out). `SavingsEngine.estimatedAnnualSavings` (`SavingsEngine.kt:310`) is the precedent for Cents-based annualization.

### 5.2 Compound-growth model (proposed default — pending confirmation)

Project portfolio value forward month-by-month with monthly compounding and continued contributions:

```
value_{m+1} = value_m × (1 + annualRate/12) + monthlyContribution     // all Cents; rate is unitless
```

- **`monthlyContribution`** default = trailing-12-month average net contribution from `InvestmentCashFlow` (continue saving at current pace), user-overridable.
- **`annualRate` (expected scenario)** default = the portfolio's own **Modified Dietz annualized return** (§4.2) when ≥ 12 months of history exist; otherwise a conservative **6% nominal** fallback.
- Rounding: contributions and compounding are computed in Cents each step; the growth term rounds half-to-even to the nearest cent before accumulation (no floating-point drift across the horizon).

> **Open design decision flagged to orchestrator (§11):** confirm the default `annualRate` policy (derive-from-history-else-6%) and the contribution default. Conservative defaults are baked in; trivially changed if the orchestrator picks a different rate (e.g., asset-allocation-weighted blend).

### 5.3 Confidence treatment

Match the net-worth doc's three-scenario band rather than inventing a new visual:

| Scenario     | Rate           | Visual                     | VoiceOver               |
| ------------ | -------------- | -------------------------- | ----------------------- |
| Conservative | expected − 2pp | lower bound of shaded band | "conservative estimate" |
| Expected     | expected       | dashed center line         | "expected"              |
| Optimistic   | expected + 2pp | upper bound of shaded band | announced as a range    |

The projection is **explicitly labelled an estimate, not a guarantee** (compliance + trust requirement for a financial app). The chart text alternative and per-point navigation follow [`voiceover-chart-navigation.md`](./voiceover-chart-navigation.md) (projection chart text-alt + point navigation + confidence band); the band is announced as a spread ("between $X and $Y"), never as a single false-precision number.

### 5.4 New iOS surface

A **Projection** section is added to `InvestmentPortfolioView` below the existing historical `performanceChart` (`InvestmentPortfolioView.swift:69`). It renders the historical series (solid) continuing into the projected series (dashed) with the shaded band — one continuous Swift Charts plot. The horizon control (e.g., 5/10/20/30 yr) drives the engine. Empty/insufficient-history handling is in §7.

---

## 6. Per-surface application map

Each iOS surface, the data it now binds, and the spec sections that govern it.

| Surface (file)                                                           | Data binding (replaces mock)                                                | Metrics applied                                                 | New/changed elements                                                          | Governing sections |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| Portfolio summary card — `InvestmentPortfolioView.swift:80-128`          | `PortfolioItem` from `KmpInvestmentRepository` (§3.3)                       | Net-contribution-adjusted gain + Modified Dietz annualized (§4) | "Contributions vs. growth" split; non-color cue on return                     | §3, §4, §8         |
| Performance chart (historical) — `InvestmentPortfolioView.swift:132-189` | Real `[PerformanceDataPoint]` from valuation+cashflow reconstruction (§3.4) | —                                                               | text-alt + point nav                                                          | §3.4, §8           |
| **Projection chart (new)** — added below `:69`                           | Engine projection series (§5)                                               | Compound-growth + 3-scenario band (§5)                          | dashed projected line, shaded band, horizon picker, "estimate" label          | §5, §8             |
| Allocation list — `InvestmentPortfolioView.swift:193-232`                | Real holdings grouped by `AssetClass` (`InvestmentEngine.kt:40`)            | `assetAllocation`                                               | unchanged logic; icon already non-color (`:206`)                              | §3                 |
| Holdings list/row — `InvestmentPortfolioView.swift:236-299`              | Real `[HoldingItem]`                                                        | Lot-level total return                                          | non-color gain/loss cue at `:284`                                             | §3, §8             |
| Detail header — `InvestmentDetailView.swift:39-88`                       | Real `HoldingItem`                                                          | Total return + daily                                            | non-color cue at `:68`, `:75`                                                 | §3, §8             |
| Detail metrics grid — `InvestmentDetailView.swift:92-118`                | Real cost basis from lots (§3.2)                                            | —                                                               | "Cost basis" now lot-derived                                                  | §3                 |
| Detail price-history chart — `InvestmentDetailView.swift:146-191`        | Real series                                                                 | —                                                               | **line no longer color-only** (`:163`); add non-color trend marker + text-alt | §8                 |

---

## 7. State coverage

Every surface must define behaviour for these states. Detailed rendering rules for Dynamic Type reflow and masking come from the referenced docs; this table fixes the **data semantics** per state.

| State                                         | Trigger                                                                                               | Required behaviour                                                                                                                                                                                                                                           | Reference                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **Empty (no portfolios)**                     | `portfolios.isEmpty && !isLoading` (`InvestmentViewModel.swift:38`)                                   | Existing `EmptyStateView` (`InvestmentPortfolioView.swift:38-43`) retained; projection section hidden entirely.                                                                                                                                              | —                                                                                             |
| **Empty (holdings but no cash-flow history)** | `InvestmentCashFlow` empty                                                                            | Show net-contribution metrics with `netInvested = costBasis` fallback; hide Modified Dietz + projection; show "Add deposit history to see contribution-adjusted returns."                                                                                    | §4.2, §5.2                                                                                    |
| **Insufficient projection history**           | < 12 months of flows                                                                                  | Projection uses 6% fallback rate (§5.2) and shows an explicit "estimate based on default assumptions" caption; never silently implies precision.                                                                                                             | §5.2, §5.3                                                                                    |
| **Stale**                                     | `lastUpdated` older than freshness threshold (`HoldingItem.lastUpdated`, `InvestmentModels.swift:76`) | Surface a stale badge + "as of <date>"; values shown but flagged; projection disabled while stale. Stale cue is **non-color** per referenced doc.                                                                                                            | [`ios-noncolor-state-cues.md`](./ios-noncolor-state-cues.md)                                  |
| **Error**                                     | repository throws (`InvestmentViewModel.swift:72-76`)                                                 | Existing retry/dismiss alert (`InvestmentPortfolioView.swift:51-59`) retained; no partial/garbage numbers rendered.                                                                                                                                          | —                                                                                             |
| **Privacy masking**                           | Balance-privacy toggle active                                                                         | All Cents figures (headline, gain, contributions, projection, chart axis, **chart text alternatives**) honour the masking mode, mirroring web's masking-aware `buildChartDescription` (`chart-palette.ts:63-75`). Masked values must not leak via VoiceOver. | [`voiceover-chart-navigation.md`](./voiceover-chart-navigation.md), web `chart-palette.ts:67` |
| **Dynamic Type (xL → AX5)**                   | User text-size setting                                                                                | Summary "Contributions vs. growth" split and projection legend reflow vertically; charts keep min-height and legible axis labels; no truncation of money values.                                                                                             | [`ios-dynamic-type-reflow.md`](./ios-dynamic-type-reflow.md)                                  |

---

## 8. Accessibility and non-color cues

Accessibility behaviour is **owned by the referenced wave-1 docs**; this section only maps their patterns onto investment surfaces and records the concrete gaps to close. Do not re-specify here.

1. **Gain/loss non-color cues (#2121).** Replace every color-only signal with a color **plus** a non-color companion (sign glyph / arrow / "+"/"−" prefix), per [`ios-noncolor-state-cues.md`](./ios-noncolor-state-cues.md):
   - `HoldingItem.gainLossColor` / `PortfolioItem.gainLossColor` (`InvestmentModels.swift:97-101`, `:133-137`) — color stays for users who rely on it, but is never the sole cue.
   - Return % at `InvestmentPortfolioView.swift:113`, `:284`; detail header `InvestmentDetailView.swift:68`; daily change `InvestmentDetailView.swift:75`.
   - Detail price-history chart line colored solely by `gainLossColor` (`InvestmentDetailView.swift:163`) — add a non-color trend indicator (e.g., directional caption / shape marker) so loss vs. gain survives grayscale and CVD.
2. **Chart text alternatives + point navigation.** Both the historical chart (`InvestmentPortfolioView.swift:144`) and the new projection chart follow [`voiceover-chart-navigation.md`](./voiceover-chart-navigation.md): an accessible summary string, per-point navigation, and confidence-band announcement as a spread. The current combine-only label (`InvestmentPortfolioView.swift:183-184`) is upgraded accordingly.
3. **CVD-safe palette.** Allocation/asset colors already route through `ChartColorPalette` (`InvestmentModels.swift:46-57`), the iOS twin of web's IBM CVD-safe palette (`chart-palette.ts:22-29`). The projection band uses opacity/pattern, not hue alone, to separate scenarios.
4. **Dynamic Type.** Reflow per [`ios-dynamic-type-reflow.md`](./ios-dynamic-type-reflow.md) — see §7.

---

## 9. Proposed shared additions (for @kmp-engineer)

All pure `commonMain`, Cents-exact, deterministic. Framed as proposals; this doc does not implement them.

1. **`InvestmentCashFlow` model + SQLDelight tables** (§3.2) — `Investment`, `InvestmentLot`, `InvestmentCashFlow`, with the matching Supabase migration owned by @backend-engineer (serialized schema task).
2. **Contribution-aware metric functions** on (or alongside) `InvestmentEngine`:
   - `netInvested(flows): Cents`
   - `netContributionAdjustedGain(currentValue, flows): Cents`
   - `modifiedDietzReturn(startValue, endValue, flows, periodDays): Double`
   - `annualizedReturn(periodReturn, periodDays): Double`
     Returning `Cents` for money and `Double` only for ratios, matching the engine's existing return-type conventions (`InvestmentEngine.kt:18-38`).
3. **Projection adapter** `InvestmentProjectionEngine` mirroring `BalancePredictionEngine`'s shape (`BalancePredictionEngine.kt:20,:37`): inputs `(currentValue: Cents, monthlyContribution: Cents, annualRate: Double, months: Int)`, output a `Cents` series + a `ProjectionConfidence`/scenario triple analogous to `PredictionConfidence` (`BalancePredictionEngine.kt:56`).
4. **Optional fast-follow:** `xirr(flows): Double` (bisection, bounded iterations) if money-weighted IRR is preferred over Modified Dietz after the §11 decision.

These functions are the prime **runnable-today** `commonTest` targets (§10) and unblock all four platforms at once, keeping iOS/Android/Web/Windows numerically identical.

---

## 10. Test plan

### 10.1 Runnable today — `commonTest` (no Apple toolchain, not blocked by #1239)

The metric and projection math is platform-agnostic and must be locked down with exact `Cents` vectors now, in the style of `InvestmentEngineTest.kt`:

| Test                                              | Assertion (exact, Cents-based)                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `netInvested_sumsSignedFlows`                     | deposits − withdrawals = expected `Cents`.                                                                                               |
| `adjustedGain_excludesContributions`              | $10k start + $5k deposit → $15.5k ⇒ `adjustedGain == Cents(50000)` (**$500**, not $5,500). The canonical "deposits aren't gains" vector. |
| `adjustedReturnPercent_zeroNetInvested_null`      | guards divide-by-zero like `totalReturnPercent` (`InvestmentEngine.kt:19`, mirrored by `InvestmentEngineTest.kt:19`).                    |
| `modifiedDietz_midPeriodFlow_weights`             | known textbook vector; flow at 50% of period weighted 0.5; result within 1e-6.                                                           |
| `modifiedDietz_noFlows_equalsSimpleReturn`        | with zero flows, Modified Dietz == `(end−start)/start`.                                                                                  |
| `annualizedReturn_halfYear`                       | 10% over 182.5 days annualizes to ≈ 21% (`(1.1)^2 − 1`).                                                                                 |
| `projection_compoundsMonthly_withContributions`   | 12 months, fixed rate + contribution → exact `Cents` series; final value matches hand-computed roll-forward; no floating drift.          |
| `projection_confidenceBand_ordering`              | conservative ≤ expected ≤ optimistic at every step.                                                                                      |
| `projection_insufficientHistory_usesFallbackRate` | < 12 months ⇒ 6% default applied (§5.2).                                                                                                 |
| `cents_overflow_guards_hold`                      | large portfolios don't silently overflow (`Cents.kt:16-40`).                                                                             |

These extend the existing suites (`InvestmentEngineTest.kt`, `InvestmentTrackingVerificationTest.kt`) and run in CI on every platform.

### 10.2 Deferred until #1239 clears — native iOS

XCUITest / SwiftUI snapshot coverage that requires the Apple toolchain and a provisioning profile:

- `KmpInvestmentRepository` returns real data; `MockInvestmentRepository` no longer in the release `RepositoryProvider`.
- Non-color cue snapshots in grayscale + CVD simulation for every surface in §6.
- VoiceOver rotor/point-navigation tests on the projection chart per [`voiceover-chart-navigation.md`](./voiceover-chart-navigation.md).
- Dynamic Type AX5 reflow snapshots per [`ios-dynamic-type-reflow.md`](./ios-dynamic-type-reflow.md).
- Masking: confirm masked figures never leak through chart text alternatives or VoiceOver.
- `deleteAllInvestments()` purges real tables (GDPR path), replacing the mock no-op (`MockInvestmentRepository.swift:99`).

---

## 11. Cross-references and resolved decisions

### Consumed documents (cited, not duplicated)

- [`ios-chart-accessibility.md`](./ios-chart-accessibility.md) — pilot structure; chart accessibility baseline.
- [`voiceover-chart-navigation.md`](./voiceover-chart-navigation.md) — projection chart text-alt, point navigation, confidence-band announcement.
- [`ios-noncolor-state-cues.md`](./ios-noncolor-state-cues.md) — #2121 gain/loss non-color cues (the live `gainLossColor` gap).
- [`ios-dynamic-type-reflow.md`](./ios-dynamic-type-reflow.md) — Dynamic Type reflow rules.
- [`ios-net-worth-trend-chart.md`](./ios-net-worth-trend-chart.md) — forward-projection + confidence-band precedent (PR #2842).

### Grounding sources

- `packages/core/src/commonMain/kotlin/com/finance/core/investment/InvestmentEngine.kt`
- `packages/core/src/commonMain/kotlin/com/finance/core/prediction/BalancePredictionEngine.kt`, `.../savings/SavingsEngine.kt`
- `packages/models/src/commonMain/kotlin/com/finance/models/types/Cents.kt`
- `apps/web/src/types/investment.ts`, `apps/web/src/components/charts/chart-palette.ts`
- `apps/ios/Finance/{Models,Screens,ViewModels,Repositories}/Investment*.swift`

### Resolved decisions (defaults baked in; confirmation requested from orchestrator)

| #   | Decision                            | Recommended default in this doc                                                                                     | Status                                        |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| D1  | Contribution-adjusted return method | Net-contribution-adjusted gain (lifetime) **+** Modified Dietz money-weighted (annualized); defer XIRR; exclude TWR | **Flagged to orchestrator** (§4.2)            |
| D2  | Default projection growth rate      | Portfolio's own Modified Dietz annualized return when ≥ 12 months of history, else 6% nominal fallback              | **Flagged to orchestrator** (§5.2)            |
| D3  | Default contribution assumption     | Trailing-12-month average monthly net contribution, user-overridable                                                | Recommended (§5.2)                            |
| D4  | Confidence treatment                | Three-scenario band (expected ± 2pp), labelled an estimate, band announced as a spread                              | Resolved — follows net-worth precedent (§5.3) |
| D5  | Mock retention                      | Keep `MockInvestmentRepository` as `#if DEBUG` preview/test double only; remove from release `RepositoryProvider`   | Resolved (§3.3)                               |

D1 and D2 are genuine design decisions; the orchestrator has been messaged with these recommendations. The defaults above are baked in so implementation (post-#1239) is unblocked, and will be updated in place if the orchestrator selects different options.
