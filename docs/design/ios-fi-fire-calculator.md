# iOS FI / FIRE Calculator Flow & Accessible Results — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20 against the existing web contract; pending human review & merge
> **Epic:** #2114 · **Closes:** #2556, #2558 · **Refs:** #1239
> **WCAG Target:** 2.2 Level AA (AAA where practical)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI) — design-only; financial math is platform-neutral (`packages/core`)

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies the FI/FIRE calculator
input flow, the assumptions model, the math contract, and the accessible results + goal
integration so that, once unblocked, a native implementation can proceed without re-deriving the
contract. **No Swift code ships with this doc.**

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral financial rules** — the FI number, Coast-FI target, years-to-FI projection,
  savings-rate, SWR sensitivity band, scenario comparison, and warning derivation — **must live in
  `packages/core`** (a new `fire` engine, §6) so iOS, Android, Windows, and Web share one source of
  truth. Today this math exists **only in web TypeScript** (`apps/web/src/lib/investment/`,
  §2) — porting it to shared Kotlin is the central prerequisite this doc establishes.
- **Apple-framework integration** — SwiftUI form layout, `@Observable` view models, VoiceOver
  semantics, Dynamic Type layout, and SF Symbol state cues — live in `apps/ios` (planned; the goal
  and dashboard surfaces named in §3 and §8 exist today but must NOT be edited under #1239).

All money is **integer cents** (`com.finance.models.types.Cents`,
`packages/models/src/commonMain/kotlin/com/finance/models/types/Cents.kt:15`). **Never** use
floating-point money. The only permitted `Double` use is the intermediate growth/discount factor
inside a projection, immediately re-quantized to cents via banker's rounding
(`MoneyOperations.bankersRound`, `packages/core/src/commonMain/kotlin/com/finance/core/money/MoneyOperations.kt:53`).

---

## Table of Contents

1. [Why this calculator](#1-why-this-calculator)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [The iOS calculator flow](#3-the-ios-calculator-flow)
4. [Inputs & editable assumptions](#4-inputs--editable-assumptions)
5. [The math contract (FI number, Coast-FI, years-to-FI, SWR)](#5-the-math-contract-fi-number-coast-fi-years-to-fi-swr)
6. [Shared FI engine (packages/core)](#6-shared-fi-engine-packagescore)
7. [Accessible results & goal integration (#2558)](#7-accessible-results--goal-integration-2558)
8. [Surface application map](#8-surface-application-map)
9. [State coverage](#9-state-coverage-dynamic-type-privacy-stale-error-empty)
10. [Test plan](#10-test-plan)
11. [Cross-references & resolved decisions](#11-cross-references--resolved-decisions)

---

## 1. Why this calculator

Epic #2114 delivers a Financial-Independence calculator with **years-to-FI**, **Coast-FI**, and
**SWR-based FI number** modeling. The web beta already ships this math and a calculator UI
(`apps/web/src/lib/investment/fire-calculator.ts`, `fire-planning.ts`, `fire-planning-view.ts`,
and the `useRetirementPlanner` hook). iOS needs the **same numbers** expressed through native
SwiftUI and Apple accessibility APIs, with the financial logic moved into shared Kotlin so the
four platforms can never drift.

Two child issues split the work:

- **#2556** — the **input flow + assumptions**: which inputs the user provides, sensible editable
  defaults, and the math contract for years-to-FI, Coast-FI, and the SWR-based FI number.
- **#2558** — the **accessible results + goal integration**: how results are presented
  (years-to-FI, FI number, Coast-FI status), scenario comparison, and turning an FI target into a
  first-class `Goal`.

This doc keeps the **financial math platform-neutral** and specifies only the **iOS surface** that
consumes it. The accessibility of the results surface defers to the wave-1 a11y docs (§7) rather
than re-deriving Dynamic Type, non-color cue, or chart text-alternative patterns.

## 2. The cross-platform contract we are mirroring

The web reference establishes the canonical input shape, the math, the defaults, and the
disclaimer. iOS must produce **identical outputs** from the **same shared engine**.

**Math primitives** — `apps/web/src/lib/investment/fire-calculator.ts`:

| Function                           | Location                 | Contract                                                      |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------- |
| `calculateFINumber(exp, swr)`      | `fire-calculator.ts:30`  | `FI = annualExpenses / (swr/100)`; at 4% SWR = expenses × 25  |
| `calculateFIPercent(port, fi)`     | `fire-calculator.ts:47`  | `current / fi × 100`, may exceed 100 (over-saved)             |
| `calculateCoastFI(fi, ret, years)` | `fire-calculator.ts:63`  | `fi / (1 + ret/100)^yearsToRetirement` — discount FI to today |
| `calculateSavingsRate(sav, inc)`   | `fire-calculator.ts:82`  | `annualSavings / annualIncome × 100`                          |
| `calculateYearsToFI(...)`          | `fire-calculator.ts:107` | iterate `portfolio = portfolio·(1+r) + savings` until ≥ FI    |
| `calculateFIREMetrics(input)`      | `fire-calculator.ts:138` | bundles all of the above + projected FI date, passive income  |

**Scenario + SWR-sensitivity layer** — `apps/web/src/lib/investment/`:

- `shared-fire.ts:70` `calculateSharedFirePlan` emits an **SWR sensitivity band** at
  **3.5 / 4 / 4.5 %** (`shared-fire.ts:90`), each with its own FI number and years-to-FI.
- `fire-planning.ts:90` `calculateFirePlan` and `fire-planning.ts:131` `compareFirePlans` produce
  per-scenario `FirePlanResult` (`fire-planning.ts:33`) with `fireAge`, `canReachFIByTargetAge`,
  `isCoastFI`, and `warnings` (`getFirePlanningWarnings`, `fire-planning.ts:75`).

**Defaults, scenarios & disclaimer** — `apps/web/src/lib/investment/fire-planning-view.ts`:

- `DEFAULT_FIRE_PLANNING_ASSUMPTIONS` (`fire-planning-view.ts:57`): expenses **$48,000**,
  contributions **$12,000**, income **$75,000**, currentAge **35**, targetRetirementAge **65**,
  expected **real** return **5 %**, withdrawal rate **4 %**.
- `FIRE_VIEW_SCENARIOS` (`fire-planning-view.ts:67`): Standard FIRE, Coast-FIRE, Save more,
  Lower return.
- `FIRE_PLANNING_DISCLAIMER` (`fire-planning-view.ts:54`): _"FIRE projections are estimates for
  planning only, not financial advice."_ — iOS must surface this verbatim on every results surface.

**Input/output type shapes** — `apps/web/src/lib/investment/types.ts`: `FIREInput`
(`types.ts:178`) and `FIREMetrics` (`types.ts:198`). The shared Kotlin types in §6 mirror these
field-for-field.

## 3. The iOS calculator flow

A three-step flow, each step a distinct SwiftUI surface (planned under `apps/ios/Finance/Screens/`,
mirroring the existing `GoalCreateView.swift` → `GoalsView.swift` → `DashboardView.swift`
architecture; do **not** edit those files under #1239):

### Step 1 — Assumptions form (input)

A `Form` collecting the inputs in §4. Pre-populated with the §4 defaults, **plus** smart defaults
derived from existing local data where available (current invested assets from
`SAVINGS`/`INVESTMENT` accounts, mirroring `useRetirementPlanner.ts:233`; annual expenses from the
spend aggregator). Every derived default is **editable** and visibly labeled as an estimate
(see the stale-estimate warnings in `fire-planning-view.ts:184`).

### Step 2 — Results (output, accessible)

Renders the computed `FirePlan` (§6): FI number, FI %, years-to-FI / projected FI age, Coast-FI
status, savings rate, and the SWR sensitivity band. Accessibility contract in §7.

### Step 3 — Scenario comparison & goal integration

A horizontally-scrolling set of scenario cards (Standard FIRE, Coast-FIRE, Save more, Lower return —
`fire-planning-view.ts:67`) plus a **"Set as goal"** action that materializes the FI number as a
`Goal` (§7). The assumptions persist locally (the web analogue keys on
`finance.firePlanning.assumptions.v1`, `fire-planning-view.ts:52`); iOS persists the equivalent via
its settings/UserDefaults store.

## 4. Inputs & editable assumptions

All inputs map 1:1 to `FIREInput` (`apps/web/src/lib/investment/types.ts:178`) /
`FirePlanningInput` (`fire-planning.ts:13`). Money inputs are entered in the user's currency and
stored as `Cents`; ages are integers; rates are percentages on a 0–100 scale.

| Input                          | Type    | Default                     | Source of default                                                 | Editable |
| ------------------------------ | ------- | --------------------------- | ----------------------------------------------------------------- | -------- |
| Current net worth / invested   | `Cents` | sum of SAVINGS + INVESTMENT | `useRetirementPlanner.ts:233` (accounts), else 0                  | ✅       |
| Annual expenses                | `Cents` | $48,000                     | `fire-planning-view.ts:57`, else spend aggregator                 | ✅       |
| Annual savings / contributions | `Cents` | $12,000                     | `fire-planning-view.ts:57`                                        | ✅       |
| Annual gross income            | `Cents` | $75,000                     | `fire-planning-view.ts:57`                                        | ✅       |
| Expected **real** return       | `%`     | **5 %**                     | `fire-planning-view.ts:63`                                        | ✅       |
| Withdrawal rate (SWR)          | `%`     | **4 %**                     | `fire-planning-view.ts:64` / `FIREInput` default (`types.ts:194`) | ✅       |
| Current age                    | `Int`   | 35                          | `fire-planning-view.ts:61`                                        | ✅       |
| Target retirement age          | `Int`   | 65                          | `fire-planning-view.ts:62`                                        | ✅       |

**Normalization & guard rails** (mirror `normalizeFirePlanningAssumptions`,
`fire-planning-view.ts:82`): money clamped ≥ 0; ages clamped 0–120; expected real return clamped
−25…25 %; withdrawal rate clamped 0–20 %. These bounds belong in the **shared** engine (§6), not in
SwiftUI, so every platform validates identically.

**Assumptions are real-return based.** The expected return is an **expected _real_ (inflation-
adjusted) return** (`expectedRealReturnPercent`, `fire-planning.ts:20`). This is why FI numbers and
Coast-FI can be expressed in today's dollars without a separate inflation input on this surface.

## 5. The math contract (FI number, Coast-FI, years-to-FI, SWR)

The shared engine (§6) reproduces these exactly. All amounts are `Cents`; the only floating-point
is the intermediate growth/discount factor, re-quantized via
`MoneyOperations.bankersRound` (`MoneyOperations.kt:53`).

1. **SWR-based FI number** — `fiNumber = annualExpenses / (swr / 100)`. At 4 % SWR this is the
   "25× rule" (expenses × 25). `swr ≤ 0 ⇒ 0`. (`fire-calculator.ts:30`.)
2. **FI progress** — `fiPercent = currentInvested / fiNumber × 100`, may exceed 100.
   (`fire-calculator.ts:47`.)
3. **Coast-FI target** — the amount needed **today** so that, with **zero further contributions**,
   market growth alone reaches the FI number by `targetRetirementAge`:
   `coastFI = fiNumber / (1 + realReturn/100)^(targetRetirementAge − currentAge)`. If years ≤ 0,
   `coastFI = fiNumber`. The user **is Coast-FI** when `currentInvested ≥ coastFI`.
   (`fire-calculator.ts:63`, `fire-planning.ts:101`.) **Coast-FI uses the user's editable expected
   real return — not a hard-coded constant** (resolved decision, §11).
4. **Years-to-FI** — iterate annually `portfolio = portfolio·(1 + r) + annualSavings` and return
   the first year `portfolio ≥ fiNumber`; `0` if already there; capped at `maxYears = 100` if
   unreachable (no positive savings and non-positive return). (`fire-calculator.ts:107`,
   `shared-fire.ts:50`.) `projectedFiAge = currentAge + yearsToFI` (`fire-planning.ts:125`).
5. **Savings rate** — `annualSavings / annualIncome × 100`; `income ≤ 0 ⇒ 0`.
   (`fire-calculator.ts:82`.)
6. **SWR sensitivity band** — recompute the FI number and years-to-FI at **3.5 / 4 / 4.5 %** so the
   results surface can show how sensitive the plan is to the withdrawal assumption.
   (`shared-fire.ts:90`.)
7. **`canReachFIByTargetAge`** — `yearsToFI ≤ (targetRetirementAge − currentAge)`.
   (`fire-planning.ts:126`.)
8. **Warnings** — expenses ≤ 0, SWR ≤ 0, SWR > 8 %, real return outside −10…15 %, target age before
   current age, negative invested assets. (`getFirePlanningWarnings`, `fire-planning.ts:75`.)

## 6. Shared FI engine (packages/core)

**There is no FI/FIRE engine in `packages/core` today** — the math above lives only in web
TypeScript. The first deliverable once #1239 unblocks (and a runnable-today task in its own right,
§10) is to port it into a new platform-neutral namespace, e.g.
`packages/core/src/commonMain/kotlin/com/finance/core/fire/`, consumed by iOS via the KMP bridge.
This sits beside the existing retirement-adjacent engines (`forecast/OperatingCashForecast.kt`,
`prediction/BalancePredictionEngine.kt`, `savings/SavingsEngine.kt`).

**Proposed shared types (Kotlin, illustrative — mirrors `types.ts:178` / `:198` and
`shared-fire.ts`):**

```kotlin
data class FireInput(
    val currentInvestedCents: Cents,
    val annualExpensesCents: Cents,
    val annualSavingsCents: Cents,
    val annualIncomeCents: Cents,
    val expectedRealReturnPercent: Double, // editable real return; default 5.0
    val withdrawalRatePercent: Double,     // SWR; default 4.0
    val currentAge: Int,
    val targetRetirementAge: Int,
)

data class SwrSensitivityPoint(
    val withdrawalRatePercent: Double, // 3.5, 4.0, 4.5
    val fiNumberCents: Cents,
    val yearsToFi: Int,
)

data class FirePlan(
    val fiNumberCents: Cents,
    val fiProgressPercent: Double,
    val coastFiTargetCents: Cents,
    val isCoastFi: Boolean,
    val savingsRatePercent: Double,
    val yearsToFi: Int,            // capped at 100 when unreachable
    val projectedFiAge: Int,
    val canReachFiByTargetAge: Boolean,
    val swrSensitivity: List<SwrSensitivityPoint>,
    val warnings: List<FireWarning>, // enum, not free text — localized on-device
)
```

- `FirePlan.warnings` is an **enum** (e.g. `HIGH_WITHDRAWAL_RATE`, `NO_POSITIVE_SAVINGS`,
  `NEGATIVE_RETURN_ASSUMPTION`, `TARGET_AGE_BEFORE_CURRENT`), mapped to localized copy on-device —
  not the raw English strings the web currently pushes (`shared-fire.ts:103`). This lets the
  non-color cue layer (§7) attach an icon + tone per warning class.
- The engine is **pure** (no I/O, no clock): `projectedFiAge` is derived from ages, not from
  `Date.now()`, so it is deterministic and trivially unit-testable (contrast the web
  `calculateFIREMetrics` which reads `new Date()`, `fire-calculator.ts:169` — the shared engine
  takes "today" as a parameter where a calendar date is genuinely needed).

## 7. Accessible results & goal integration (#2558)

### Results presentation — defers to wave-1 a11y docs (cite, don't duplicate)

The results surface is a set of labeled metric rows + optional projection chart. Its accessibility
is **fully specified by the wave-1 docs** — this doc only states which pattern each element adopts:

- **Dynamic Type & reflow** — every metric row (FI number, years-to-FI, Coast-FI status, savings
  rate) and the SWR sensitivity table follow the reflow contract in
  `docs/design/ios-dynamic-type-reflow.md` (scalable text styles; the sensitivity table collapses
  to stacked rows at accessibility sizes / `isAccessibilitySize`; no truncated currency).
- **Non-color state cues** — Coast-FI **on-track vs not-yet** and per-scenario tone
  (`on-track` / `attention` / `warning`, `fire-planning-view.ts:230`) are conveyed with an
  **icon + text label + tone**, never color alone, per
  `docs/design/ios-noncolor-state-cues.md` (§4 canonical cue vocabulary). The `FireWarning` enum
  (§6) maps directly onto that vocabulary.
- **Projection chart (if shown)** — a years-to-FI growth chart adopts the spoken-summary +
  data-table text-alternative pattern in `docs/design/ios-chart-accessibility.md` (the FI growth
  series feeds a `ChartAccessibilityDescriptor`; point-by-point navigation is owned by epic #2115).

The `FIRE_PLANNING_DISCLAIMER` (`fire-planning-view.ts:54`) is exposed as a persistent, VoiceOver-
readable footnote on the results and scenario surfaces.

### Goal integration — FI target as a `Goal`

"Set as goal" materializes the FI number as a real `Goal`
(`packages/models/src/commonMain/kotlin/com/finance/models/Goal.kt:16`), using the model's **actual
fields**:

| `Goal` field    | FI-target value                                                        | Real field ref      |
| --------------- | ---------------------------------------------------------------------- | ------------------- |
| `name`          | e.g. "Financial Independence" (user-editable)                          | `Goal.kt:20`        |
| `targetAmount`  | `FirePlan.fiNumberCents` (must be positive — model `init` requires it) | `Goal.kt:21`, `:37` |
| `currentAmount` | current invested assets (drives `progress`, `Goal.kt:41`)              | `Goal.kt:22`        |
| `targetDate`    | projected FI date derived from `projectedFiAge` (nullable)             | `Goal.kt:24`        |
| `status`        | `ACTIVE` → `COMPLETED` when `currentAmount ≥ targetAmount`             | `Goal.kt:13`, `:25` |
| `accountId`     | optional funding account (the invested/savings account)                | `Goal.kt:28`        |
| `icon`/`color`  | a FI-specific icon; **color is decorative only** (state via §7 cues)   | `Goal.kt:26`, `:27` |

The existing iOS goal surfaces consume this unchanged: `GoalItem` already exposes `progress`,
`isComplete`, and `remainingMinorUnits` (`apps/ios/Finance/Models/GoalItem.swift:48`), rendered by
`GoalsView.swift` / `GoalCreateView.swift` and summarized on `DashboardView.swift`
(view models `GoalsViewModel.swift`, `GoalCreateViewModel.swift`, `DashboardViewModel.swift`;
data via `GoalRepository.swift` / `KMP/KMPGoalRepository.swift`). **An FI goal is just a `Goal`** —
no new persistence surface, no Swift edits required by this design.

> **Goal-status enum note (flagged, not resolved here):** the live KMP model is
> `GoalStatus { ACTIVE, PAUSED, COMPLETED, CANCELLED }` (`Goal.kt:13`) and iOS mirrors it
> (`GoalStatusUI`, `GoalItem.swift:14`). The repo's Schema-Alignment note targets a Supabase
> `status` enum of `active / completed / archived`. FI-target-as-goal only needs `ACTIVE` and
> `COMPLETED`, so it is unaffected either way, but the `PAUSED`/`CANCELLED` ↔ `archived` mismatch
> is a backend/schema decision (owner: `@backend-engineer` + `@kmp-engineer`), not an iOS one — see
> §11.

## 8. Surface application map

| Surface (planned `apps/ios/Finance/Screens/`) | Consumes (shared)             | Key elements                                                              | A11y pattern (cite)                                                        |
| --------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| FI Assumptions form (Step 1)                  | `FireInput` defaults + clamps | 8 labeled inputs (§4); derived-default "estimate" badges                  | `ios-dynamic-type-reflow.md` (form reflow); estimate badge = non-color cue |
| FI Results (Step 2)                           | `FirePlan` (§6)               | FI number, FI %, years-to-FI / projected age, Coast-FI status, save rate  | `ios-noncolor-state-cues.md` (Coast-FI on-track cue); disclaimer footnote  |
| SWR sensitivity table                         | `FirePlan.swrSensitivity`     | rows for 3.5 / 4 / 4.5 % → FI number + years-to-FI                        | `ios-dynamic-type-reflow.md` (table → stacked rows at AX sizes)            |
| Scenario comparison cards (Step 3)            | `compareFirePlans` analogue   | Standard / Coast / Save more / Lower return cards; per-card tone+headline | `ios-noncolor-state-cues.md` (tone = icon+label, not color)                |
| FI projection chart (optional, Step 2/3)      | FI growth series              | years-to-FI growth curve                                                  | `ios-chart-accessibility.md` (spoken summary + data-table alternative)     |
| "Set as goal" → Goals/Dashboard               | `Goal` (§7)                   | FI goal card with `progress` / `remaining`                                | existing goal-surface a11y; color decorative only                          |

All currency tokens above render through the masking-aware formatter; under privacy masking,
absolute amounts (FI number, invested, remaining) are suppressed while **relative** phrasing
(FI %, "on track", years-to-FI) is still spoken — parity with the chart-accessibility privacy rule
(`ios-chart-accessibility.md` §6) and §9 below.

## 9. State coverage (Dynamic Type, privacy, stale, error, empty)

| State            | Requirement                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Type** | All inputs, metric rows, scenario cards, and the SWR table use scalable text styles and reflow to stacked layouts at accessibility sizes / `isAccessibilitySize`; no truncated currency. Defers to `docs/design/ios-dynamic-type-reflow.md`.                                                                                                                                          |
| **Privacy**      | When balances are masked, the FI number, invested assets, Coast-FI target, and remaining amounts are formatted through the masking-aware formatter and never spoken/shown as raw amounts. **Relative** outputs (FI %, years-to-FI, "Coast-FI reached", savings rate %) remain visible — a percentage/age discloses no absolute balance (parity with `ios-chart-accessibility.md` §6). |
| **Stale**        | If a derived default (invested assets / expenses) is stale or estimated, the input shows a non-color "estimate" indicator (icon + text, per `ios-noncolor-state-cues.md`) and the results surface prepends an "uses estimated inputs" note — mirroring the web stale warnings (`fire-planning-view.ts:184`).                                                                          |
| **Error**        | Invalid assumptions (caught by the shared clamps/warnings, §5.8) surface as labeled, focusable inline messages tied to the offending field; the results surface degrades to "Enter your assumptions to see your FI estimate." rather than showing NaN/∞. No silent failure.                                                                                                           |
| **Empty**        | With no inputs yet (and no derivable defaults), Step 2 shows an explicit empty state ("Add your numbers to project your path to FI") and the "Set as goal" action is disabled until a positive FI number exists (the `Goal` model requires `targetAmount > 0`, `Goal.kt:37`).                                                                                                         |

## 10. Test plan

The FI/SWR/Coast-FI math is **prime runnable-today material** — it has no Apple dependency and is
**not blocked by #1239**. The deferred half is the native SwiftUI surface only.

**Shared (KMP `commonTest`, runnable today — port the web vitest vectors to Kotlin):**

Place beside existing engine tests under
`packages/core/src/commonTest/kotlin/com/finance/core/fire/`. Each test asserts **numeric parity**
with the existing web vectors in `apps/web/src/lib/investment/fire-calculator.test.ts` and
`shared-fire.test.ts`:

- **FI number** — `fiNumber($40,000, 4%) == $1,000,000` (25× rule); `fiNumber($40,000, 3.5%) ≈
$1,142,857.14`; `swr ≤ 0 ⇒ 0`; negative SWR ⇒ 0. (Parity with `fire-calculator.test.ts:26`.)
- **FI progress** — 50 % at half the FI number; 100 % at the FI number; > 100 % when over-saved;
  `fiNumber == 0 ⇒ 0`.
- **Coast-FI** — for a known fixture (FI, real return, years-to-retirement) the discounted target
  matches the web vector; `yearsToRetirement ≤ 0 ⇒ coastFI == fiNumber`; `isCoastFi` boundary is
  inclusive (`currentInvested == coastFi ⇒ true`).
- **Years-to-FI** — `0` when already at/over FI; correct iteration count for a known
  savings+return fixture; **caps at 100** when savings ≤ 0 and return ≤ 0 (unreachable); growth-only
  (savings = 0, return > 0) still converges.
- **Savings rate** — `savings/income × 100`; `income ≤ 0 ⇒ 0`.
- **SWR sensitivity band** — exactly three points at 3.5 / 4 / 4.5 %, each with the correct FI
  number and years-to-FI; monotonic (lower SWR ⇒ higher FI number ⇒ ≥ years-to-FI).
- **Clamps & warnings** — out-of-range inputs are clamped to §4 bounds; the §5.8 warning enum fires
  for each trigger (SWR > 8 %, real return outside −10…15 %, target age < current age, etc.).
- **Cents integrity** — every monetary output is whole `Cents`; banker's rounding matches
  `MoneyOperations.bankersRound` (no floating-point cents leak).
- **Determinism** — `projectedFiAge` derives from ages, not the wall clock (no `Date.now()` in the
  engine).

**Native (iOS, deferred until #1239 unblocks):**

- Snapshot/UI test: the Assumptions form renders 8 labeled inputs pre-filled with the §4 defaults;
  each derived default shows an "estimate" badge.
- Results surface exposes FI number, FI %, years-to-FI/projected age, Coast-FI status, and savings
  rate as labeled accessibility elements; the disclaimer is present and VoiceOver-readable.
- Coast-FI on-track vs not-yet is distinguishable **without color** (icon + label assertion).
- SWR sensitivity table reflows to stacked rows at Dynamic Type XXL with no clipped values.
- Masked-balances mode: no raw FI number / invested / remaining amount appears in the accessibility
  tree; FI %, years-to-FI, and Coast-FI status remain.
- "Set as goal" creates a `Goal` whose `targetAmount == FirePlan.fiNumberCents`, `status == ACTIVE`,
  and (if chosen) `accountId` set; it then appears on `GoalsView` / `DashboardView`.

## 11. Cross-references & resolved decisions

**Related epics & docs (do not duplicate their scope):**

- `docs/design/ios-dynamic-type-reflow.md` (#2119) — Dynamic Type reflow + `isAccessibilitySize`;
  owns the form/table reflow contract this doc references.
- `docs/design/ios-noncolor-state-cues.md` (#2121) — canonical non-color cue vocabulary; owns the
  Coast-FI / scenario-tone / estimate-badge cues.
- `docs/design/ios-chart-accessibility.md` (#2113) — chart text-alternative + spoken summary; owns
  the optional FI projection chart's accessibility.
- Web reference contract: `apps/web/src/lib/investment/fire-calculator.ts`, `shared-fire.ts`,
  `fire-planning.ts`, `fire-planning-view.ts`, `types.ts`, and `useRetirementPlanner.ts`.
- Goal model: `packages/models/src/commonMain/kotlin/com/finance/models/Goal.kt`. Cents:
  `packages/models/src/commonMain/kotlin/com/finance/models/types/Cents.kt`. Rounding:
  `packages/core/src/commonMain/kotlin/com/finance/core/money/MoneyOperations.kt`.

**Resolved design decisions (grounded in the existing web contract, 2026-06-20):**

1. **Default SWR = 4 %.** Confirmed by the live default (`fire-planning-view.ts:64`, `FIREInput`
   doc `types.ts:194`) and the 25×-rule test (`fire-calculator.test.ts:27`). The results surface
   additionally shows a **3.5 / 4 / 4.5 %** sensitivity band (`shared-fire.ts:90`) so the choice is
   transparent, not hidden.
2. **Coast-FI uses the user's editable expected _real_ return, not a fixed constant.**
   `calculateCoastFI` takes the return as a parameter (`fire-calculator.ts:63`) and the calculator
   feeds it the editable `expectedRealReturnPercent` (default 5 %, `fire-planning-view.ts:63`).
   No hard-coded real-return assumption is introduced.
3. **Financial math lives in shared `packages/core` (new `fire` engine), not in SwiftUI.** Today it
   exists only in web TS; porting it (with parity tests, §10) is the prerequisite. iOS consumes
   `FirePlan` via the KMP bridge and renders Layers per §7–§9.
4. **FI target is a plain `Goal`** using real fields (`targetAmount`, `currentAmount`, `accountId`,
   `status`, §7) — no new model or persistence surface.

**Flagged for owners (not an iOS design decision):** the `GoalStatus` enum mismatch between the live
KMP model (`ACTIVE/PAUSED/COMPLETED/CANCELLED`, `Goal.kt:13`) and the Schema-Alignment target
(`active/completed/archived`). FI-target-as-goal only uses `ACTIVE`/`COMPLETED` and is unaffected,
but the reconciliation is owned by `@backend-engineer` + `@kmp-engineer`.
