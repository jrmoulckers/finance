# iOS Non-Color Financial State Cues — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20; pending human review & merge
> **Epic:** #2121 · **Closes:** #2552, #2554
> **WCAG Target:** 2.2 Level AA (1.4.1 Use of Color; 1.4.11 Non-text Contrast)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it defines the semantic non-color
cue vocabulary and the per-surface application so that, once unblocked, a native implementation
can proceed without re-deriving the contract. No Swift code ships with this doc.

This doc is the **canonical definition** of the semantic state-cue vocabulary that sibling epics
defer to. The chart-accessibility pattern for epic #2113
(`docs/design/ios-chart-accessibility.md`) already references this epic (#2121) as the source of
the **trend up/down icons** and the **staleness icon** (see its §6 _Stale_ row and §8
cross-references); §4 below is where those icons are formally specified.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — the mapping from a financial state to its
  `(icon token, text label, tone)` triple, the threshold logic (e.g. budget ≥75% → warning,
  goal pace classification), and sign/trend derivation — live in `packages/core` /
  `packages/models` so all platforms share one source of truth. The web app already proves this
  pattern with `apps/web/src/lib/a11y.ts` (§2); iOS must consume the same shared resolver rather
  than re-deriving cues in SwiftUI.
- **Apple-framework integration** — SF Symbol rendering (`IconView` /
  `SFSymbolsMapping.swift`), Dynamic Type layout, and VoiceOver labels — live in `apps/ios`.

---

## Table of Contents

1. [Why this pattern](#1-why-this-pattern)
2. [The WCAG contract & the cross-platform baseline](#2-the-wcag-contract--the-cross-platform-baseline)
3. [The cue model: four redundant channels](#3-the-cue-model-four-redundant-channels)
4. [Semantic cue vocabulary (canonical)](#4-semantic-cue-vocabulary-canonical)
5. [Shared cue model (packages/core)](#5-shared-cue-model-packagescore)
6. [Per-surface application map](#6-per-surface-application-map)
7. [State coverage (Dynamic Type, VoiceOver, masking, empty)](#7-state-coverage-dynamic-type-voiceover-masking-empty)
8. [Test plan](#8-test-plan)
9. [Cross-references & resolved decisions](#9-cross-references--resolved-decisions)

---

## 1. Why this pattern

A meaningful share of users cannot rely on hue: ~8% of men have a form of color-vision
deficiency, and low-vision / high-contrast / grayscale users may perceive no red/green
distinction at all. WCAG 2.2 **1.4.1 Use of Color** requires that color is **never the only
visual means** of conveying information. The design system already states this rule —
`docs/design/accessibility-patterns.md` §5.3 _Never Convey Information by Color Alone_
(lines 826–844) — and the chart spec restates it in `docs/design/chart-component-specs.md`
(_Status Indicator Rules_, lines 171–180; _Financial Semantic Colors (Always with Icon + Text)_,
lines 420–428).

The problem is that the **iOS implementation has drifted from that rule**. Several state-bearing
surfaces still encode financial meaning in hue alone:

- **Positive amounts are green with no sign.** `CurrencyLabel.amountColor`
  (`apps/ios/Finance/Components/CurrencyLabel.swift:71–76`) returns `.green` for positive,
  `.red` for negative, `.primary` for zero. The visible text comes from a `.currency`
  `NumberFormatter` (lines 64–68), which renders a `−` on negatives but **no `+` on positives** —
  so a credit vs. debit is distinguishable _only_ by color for a sighted user.
- **Investment gain/loss is color-only.** `gainLossColor`
  (`apps/ios/Finance/Models/InvestmentModels.swift:97–101` and `133–137`) returns green/red/primary;
  the portfolio rows apply it directly to the return text
  (`apps/ios/Finance/Screens/InvestmentPortfolioView.swift:113, 284`) with no arrow or sign glyph.
- **Budget pace leans on hue.** `BudgetItem.progressColor`
  (`apps/ios/Finance/Models/BudgetItem.swift:37–41`) is red/orange/green by threshold, but
  `statusText` (lines 44–46) only emits **"Over budget"** or **"On track"** — the **75–99%
  warning band has no distinct text or icon**, so "near limit" reads as "On track" + orange.
- **Behind-pace goals have no warning cue.** `GoalStatusUI`
  (`apps/ios/Finance/Models/GoalItem.swift:14–43`) maps the persisted lifecycle
  (active/paused/completed/cancelled) to an icon + color, but an _active goal that is behind
  schedule_ is a **derived** state with no representation — it shows the same `flame` + blue as a
  goal that is ahead.

This document defines a **single reusable iOS cue contract** (required by #2552) and applies it
to every state-bearing surface (#2554), so meaning survives color-blindness, grayscale, and
high-contrast modes.

## 2. The WCAG contract & the cross-platform baseline

The web app is the reference implementation and is **already largely compliant** — it derives
non-color cues from a shared helper rather than from CSS color:

- `apps/web/src/lib/a11y.ts` exposes `getGoalStatusIndicator(percentComplete)` (lines 134–149)
  and `getBudgetStatusIndicator(percentUsed)` (lines 163–175). Each returns a structured
  **`{ icon: IconName; label: string; tone: 'positive' | 'warning' | 'negative' }`** — note that
  `tone` is a _semantic_ channel decoupled from any literal color, and an explicit `icon` +
  `label` accompany it.
- `apps/web/src/components/charts/chart-palette.ts` adds `buildChartDescription(...)`
  (lines 63–75) for the spoken/`.sr-only` text alternative, on top of a CVD-safe palette
  (lines 22–29).
- Status badges (e.g. `SyncIndicator.tsx`, `OfflineBanner.tsx`) pair color with a text `label`
  and `role="status"` per the inventory in §6.

The color tokens themselves are defined once and mirrored per platform — they are the
**enhancement layer**, not the signal:

| Concept            | Web token (`apps/web/src/theme/tokens.css`)                | iOS (`apps/ios/Finance/Theme/FinanceColors.swift`) |
| ------------------ | ---------------------------------------------------------- | -------------------------------------------------- |
| Positive / income  | `--semantic-amount-positive` / `-status-positive` (58, 54) | `statusPositive` (116), `amountPositive` (142)     |
| Negative / expense | `--semantic-amount-negative` / `-status-negative` (59, 55) | `statusNegative` (122), `amountNegative` (148)     |
| Warning            | `--semantic-status-warning` (56)                           | `statusWarning` (128)                              |

iOS must produce the **same `(icon, label, tone)` triple from the same shared logic**, then
render it through SF Symbols + SwiftUI text instead of `AppIcon` + CSS.

## 3. The cue model: four redundant channels

Every financial state is expressed through up to **four** channels. **At least two non-color
channels** (one of which is always text for VoiceOver) must be present; **color is channel 4 and
is never sufficient alone.**

| Channel                  | Purpose                                  | iOS expression                                                                                |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. **Icon / SF Symbol**  | At-a-glance, language-independent glyph  | `IconView(token)` → `SFSymbolsMapping` (`apps/ios/Finance/Components/SFSymbolsMapping.swift`) |
| 2. **Shape / direction** | Distinct silhouette even when monochrome | Up vs. down arrow, triangle vs. circle vs. check — _shape differs, not just tint_             |
| 3. **Text / sign**       | The authoritative, screen-reader channel | A visible label ("Over budget") and/or an explicit `+ / −` sign                               |
| 4. **Color (tone)**      | Enhancement for users who perceive hue   | `FinanceColors.*` — applied **in addition to** 1–3, never alone                               |

**Rule of two:** a passing surface presents the state in **icon/shape + text** at minimum, with
color layered on top. The good existing example is `OfflineBanner`
(`apps/ios/Finance/Components/OfflineBanner.swift`): `wifi.slash` symbol (33) + text (38) +
`statusWarning` background (47) + an explicit accessibility label (52). Every surface in §6 should
reach that bar.

## 4. Semantic cue vocabulary (canonical)

This is the canonical table other epics defer to. **"Color today"** records the current iOS hue;
**"Icon / shape (cue)"** is the SF Symbol (and its distinguishing silhouette); **"Text cue"** is
the required visible/spoken text. Tokens in **bold** are **new** additions proposed for the
shared `IconToken` enum (§5) — they do not exist today.

### Amount & transaction-type states

| State             | Color today        | Icon / shape (cue)                                                                  | Text cue                          | Token      |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------- | --------------------------------- | ---------- |
| Positive / credit | green (color-only) | _list:_ leading `arrow.down.circle` type icon · _standalone:_ explicit **`+`** sign | "+$1,250.00" · a11y "Income of …" | `income`   |
| Negative / debit  | red                | _list:_ leading `arrow.up.circle` type icon · _standalone:_ existing `−` sign       | "−$42.99" · a11y "Expense of …"   | `expense`  |
| Income (type)     | green              | `arrow.down.circle` (down-into-account)                                             | "Income"                          | `income`   |
| Expense (type)    | red                | `arrow.up.circle` (up-out-of-account)                                               | "Expense"                         | `expense`  |
| Transfer (type)   | blue               | `arrow.left.arrow.right` (bidirectional)                                            | "Transfer"                        | `transfer` |
| Zero / no change  | primary            | `minus` / em-dash                                                                   | "$0.00"                           | —          |

> **List vs. standalone amount (confirmed by maintainer 2026-06-20).** In a transaction **row /
> list**, the shape-distinct **leading type icon** (`arrow.down.circle` income vs.
> `arrow.up.circle` expense, via `SFSymbolsMapping.swift`) is the **sole** non-color cue for
> income vs. expense — do **not** add a second directional arrow on the amount (no redundant
> double-arrows). For a **standalone amount** with no accompanying type icon (dashboard net
> cashflow, investment gain/loss, summary cards), `CurrencyLabel` must render an explicit sign for
> **positives too**; today it signs only negatives (the 1.4.1 gap — see §6 and §9 decision 1).

### Transaction-status states (`TransactionStatus` — `packages/models/.../Transaction.kt:16`)

| State      | Color today    | Icon / shape (cue)             | Text cue     | Token     |
| ---------- | -------------- | ------------------------------ | ------------ | --------- |
| Pending    | orange capsule | `clock`                        | "Pending"    | `pending` |
| Cleared    | none today     | `checkmark`                    | "Cleared"    | `check`   |
| Reconciled | none today     | `checkmark.circle` (filled)    | "Reconciled" | `success` |
| Void       | none today     | `xmark.circle` / strikethrough | "Void"       | `error`   |

> Note: there is **no `FAILED` transaction status** in the model — the lifecycle is
> `PENDING / CLEARED / RECONCILED / VOID` (`Transaction.kt:16`). The "failed" concept in the
> epic brief is a **sync** state, not a transaction state, and is covered in the sync table below.

### Budget states (thresholds — `BudgetItem.swift:37–46`)

| State                     | Color today | Icon / shape (cue)                                 | Text cue      | Token                     |
| ------------------------- | ----------- | -------------------------------------------------- | ------------- | ------------------------- |
| On track (<75%)           | green       | `checkmark`                                        | "On track"    | `check`                   |
| Near limit (75–99%) ⚠ NEW | orange      | `exclamationmark.triangle`                         | "Near limit"  | `warning`                 |
| Over budget (≥100%)       | red         | `exclamationmark.triangle`/ **`arrow.up.forward`** | "Over budget" | `warning` / **`trendUp`** |

### Goal states (lifecycle `GoalStatus` — `Goal.kt:13`; pace is **derived**)

| State                 | Color today | Icon / shape (cue)         | Text cue          | Token     |
| --------------------- | ----------- | -------------------------- | ----------------- | --------- |
| Active — on pace      | blue        | `flame`                    | "On track"        | _derived_ |
| Active — behind ⚠ NEW | blue (none) | `exclamationmark.triangle` | "Behind schedule" | `warning` |
| Paused                | orange      | `pause.circle`             | "Paused"          | —         |
| Completed             | green       | `checkmark.circle.fill`    | "Completed"       | `success` |
| Cancelled             | gray        | `xmark.circle`             | "Cancelled"       | `error`   |

### Investment / trend states (gain/loss — `InvestmentModels.swift:97–137`)

| State             | Color today        | Icon / shape (cue)                     | Text cue           | Token           |
| ----------------- | ------------------ | -------------------------------------- | ------------------ | --------------- |
| Gain / trend up   | green (color-only) | **`arrow.up.right`** (up diagonal)     | "+3.2% · Up"       | **`trendUp`**   |
| Loss / trend down | red (color-only)   | **`arrow.down.right`** (down diagonal) | "−1.8% · Down"     | **`trendDown`** |
| Flat / break-even | primary            | **`arrow.right`** / `minus`            | "0.0% · No change" | **`trendFlat`** |

### Sync / data-freshness states

| State       | Color today     | Icon / shape (cue)                | Text cue                     | Token       |
| ----------- | --------------- | --------------------------------- | ---------------------------- | ----------- |
| Synced      | green           | `checkmark` / `wifi`              | "Synced"                     | `check`     |
| Syncing     | blue            | `arrow.triangle.2.circlepath`     | "Syncing…"                   | `sync`      |
| Stale ⚠ NEW | (none today)    | **`clock.badge.exclamationmark`** | "Updated <time> ago"         | **`stale`** |
| Offline     | warning (amber) | `wifi.slash`                      | "Offline"                    | `offline`   |
| Sync failed | red             | `exclamationmark.circle`          | "Sync failed — tap to retry" | `error`     |

All SF Symbols above already exist in `SFSymbolsMapping.swift` **except** the four bold tokens
(`trendUp`, `trendDown`, `trendFlat`, `stale`), which §5 proposes adding.

## 5. Shared cue model (packages/core)

The state→cue mapping must live in shared code, exactly as the web does it in `a11y.ts` (§2),
so iOS/Android/Windows/Web stay consistent and the thresholds are tested once.

### 5.1 Extend the shared `IconToken` vocabulary

> **Ownership boundary.** `packages/core` is owned by **@kmp-engineer**. This doc only
> **specifies** the additions; the enum/mapping edits are a **separate tracked task for
> @kmp-engineer** and are intentionally **not made in this design PR** (cross-file edits here would
> create fleet conflicts). The table below is the canonical spec that task implements.

`packages/core/src/commonMain/kotlin/com/finance/core/icons/IconToken.kt` (enum at line 5) and its
iOS mirror `apps/ios/Finance/Components/IconToken.swift` already define `income` (29), `expense`
(30), `sync` (48), `success`, `warning` (59), `error`, `pending` (62), `online`, `offline` (66) —
but they have **no trend or staleness tokens**. **Proposed additions (to be implemented by
@kmp-engineer):**

| New token   | SF Symbol (iOS mapping to add) | Lucide (standard pack) | Used for                     |
| ----------- | ------------------------------ | ---------------------- | ---------------------------- |
| `trendUp`   | `arrow.up.right`               | `trending-up`          | gain, over-budget, trend ↑   |
| `trendDown` | `arrow.down.right`             | `trending-down`        | loss, trend ↓                |
| `trendFlat` | `arrow.right`                  | `move-right` / `minus` | break-even, flat trend       |
| `stale`     | `clock.badge.exclamationmark`  | `clock-alert`          | out-of-date / late-sync data |

These are the canonical trend + staleness tokens that the chart-accessibility doc for **#2113**
(`docs/design/ios-chart-accessibility.md`, PR #2834) defers to. When implemented, follow the
existing add-an-icon procedure in `docs/design/icon-system-ios.md` (steps 1–6): add to the KMP enum

- mappings first, then mirror in the Swift `IconToken`, then add the SF Symbol to
  `SFSymbolsMapping.swift` and the Lucide name to `LucideMapping.swift`, and update `IconViewTests`.

### 5.2 Shared `StateCueResolver` (illustrative)

A platform-neutral resolver returns the same `(icon, label, tone)` triple the web `a11y.ts`
helpers return, so SwiftUI never re-derives thresholds:

```kotlin
// packages/core/.../accessibility/StateCueResolver.kt (proposed)
enum class CueTone { POSITIVE, WARNING, NEGATIVE, NEUTRAL }

data class StateCue(
    val icon: IconToken,   // shape/SF-symbol channel
    val label: String,     // text/VoiceOver channel (localized)
    val tone: CueTone,     // semantic tone → maps to color, NOT the signal itself
    val sign: Sign? = null // EXPLICIT_PLUS / EXPLICIT_MINUS / NONE for amounts
)

object StateCueResolver {
    fun amount(minorUnits: Long): StateCue        // + / − sign + income/expense icon
    fun budget(percentUsed: Double): StateCue     // ≥100 over, ≥75 near-limit, else on-track
    fun goalPace(percentComplete: Double, fractionOfPeriodElapsed: Double): StateCue // behind vs on-track
    fun gainLoss(minorUnits: Long): StateCue       // trendUp / trendDown / trendFlat
    fun sync(state: SyncState, ageSeconds: Long?): StateCue // synced/syncing/stale/offline/failed
}
```

- `tone` is consumed by the iOS layer to pick a `FinanceColors.*` value; the **icon + label**
  are what make the state perceivable without that color.
- `StateCueResolver.amount` resolves the §4 headline gap: it emits `Sign.EXPLICIT_PLUS` for
  positives, which `CurrencyLabel` renders so a credit is not green-only.
- Thresholds mirror the web (`getBudgetStatusIndicator`: >90 over, >75 near limit — `a11y.ts:168,171`)
  so the two platforms agree; reconcile the iOS `BudgetItem` 75%/100% bands to the shared values
  during implementation.

## 6. Per-surface application map

Each surface adopts the cue(s) for the states it can show. "Current gap" cites the verified
color-only or missing-cue condition; "Required cue" is the §4 row(s) to apply.

| Surface                  | File (verified)                                                                    | States shown                          | Current gap                                                                                                                                               | Required cue                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Transaction row          | `apps/ios/Finance/Components/TransactionRowView.swift:16–34`                       | income/expense/transfer; pending      | Leading type icon is shape-distinct (good), but the **amount** is green-only for credits; row `accessibilityLabel` (38–44) omits amount, type, and status | Explicit `+`/`−` sign on amount; keep type icon; add amount + status to a11y label (defer VO wording to #2117) |
| Currency amount (shared) | `apps/ios/Finance/Components/CurrencyLabel.swift:64–89`                            | positive/negative/zero                | Positive has **no `+` sign** (color-only); negative already signed                                                                                        | `StateCueResolver.amount` → `Sign.EXPLICIT_PLUS` for positives                                                 |
| Transaction detail       | `apps/ios/Finance/Screens/TransactionDetailView.swift:46–92`                       | type, amount, status                  | Amount/type rely on `type.color`                                                                                                                          | Type icon + signed amount; status row with `pending/cleared` icon + label                                      |
| Budgets list / card      | `apps/ios/Finance/Screens/BudgetsView.swift:170–185`                               | on-track / near-limit / over          | **75–99% "near limit" band has no distinct text/icon** (`BudgetItem.swift:44–46`)                                                                         | Three-state cue: `check` / `warning` + "Near limit" / `warning` + "Over budget"                                |
| Budget progress chart    | `apps/ios/Finance/Charts/BudgetProgressChart.swift:74`                             | over budget                           | Over-fill is `Color.red` only                                                                                                                             | Pair the red fill with an over-budget icon + label in the surrounding card                                     |
| Goals list / card        | `apps/ios/Finance/Screens/GoalsView.swift:99–149`                                  | lifecycle + derived pace + complete   | **Behind-pace active goal shows no warning** (only lifecycle has an icon)                                                                                 | Add derived `goalPace` cue (`warning` + "Behind schedule") alongside lifecycle                                 |
| Net-worth / dashboard    | `apps/ios/Finance/Screens/DashboardView.swift` (net-worth, income/expense columns) | net worth ±; period income vs expense | Net-worth amount via `CurrencyLabel` (green-only positive); income/expense columns undifferentiated                                                       | Signed amounts; `trendUp/Down` on net-worth delta; income/expense icons on columns                             |
| Investment portfolio     | `apps/ios/Finance/Screens/InvestmentPortfolioView.swift:113,284`                   | total & per-holding gain/loss         | `gainLossColor` applied to text **color-only** (`InvestmentModels.swift:97–137`)                                                                          | `trendUp/trendDown/trendFlat` icon + signed % beside each return                                               |
| Investment detail        | `apps/ios/Finance/Screens/InvestmentDetailView.swift` (return, daily %)            | gain/loss, daily return               | Daily % colored green/red only                                                                                                                            | Trend icon + signed % ; `CurrencyLabel(showSign:)` for the figure                                              |
| Offline banner           | `apps/ios/Finance/Components/OfflineBanner.swift:33–52`                            | offline                               | ✅ Compliant model (icon + text + a11y label)                                                                                                             | No change — use as the reference pattern                                                                       |
| Sync status badge        | `apps/ios/Finance/KMP/KMPSyncStatusAdapter.swift` (+ a new badge view)             | synced/syncing/stale/failed           | No dedicated synced/stale/failed badge today (only offline banner)                                                                                        | New badge using the sync table: `sync`/`stale`/`error` icon + label + `role`-equivalent a11y                   |

## 7. State coverage (Dynamic Type, VoiceOver, masking, empty)

| Concern                       | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Type**              | Icon + label cues use scalable SF Symbol sizing (`.imageScale` / symbol font) and Dynamic Type text styles; at accessibility sizes the icon must not be dropped to save space — labels may wrap (`fixedSize(horizontal:false, vertical:true)` as in `OfflineBanner:42`) but the cue stays. Branch on the accessibility-size threshold with the environment value `\.dynamicTypeSize` and `dynamicTypeSize.isAccessibilitySize` (or `\.sizeCategory.isAccessibilityCategory`) — e.g. stack an icon+label vertically once `isAccessibilitySize` is true rather than truncating. Cross-reference **#2119** (Dynamic Type). |
| **VoiceOver**                 | The text channel _is_ the VoiceOver channel. Every cue's `label` must be in the element's accessibility label, and the **amount, type, and status must be announced** — today `TransactionRowView` (38–44) drops them. Exact spoken phrasing/rotor is owned by **#2117**; this doc only requires the cue text be present and not color-dependent.                                                                                                                                                                                                                                                                       |
| **High-contrast / grayscale** | Because the signal is icon + shape + text, the surface remains fully legible with `differentiateWithoutColor` enabled and under a grayscale filter; color is removed without information loss. Honor `accessibilityDifferentiateWithoutColor` to optionally strengthen shape cues.                                                                                                                                                                                                                                                                                                                                      |
| **Privacy / masking**         | When balances are masked, the **direction/trend cue and tone still show** (an arrow or "Over budget" discloses no absolute amount), but the masked figure replaces the number — consistent with the chart doc's masking decision (`ios-chart-accessibility.md` §6). Sign cues attach to the masked placeholder only when a direction is independently known.                                                                                                                                                                                                                                                            |
| **Empty / unknown**           | When a state is indeterminate (no data, zero, break-even), use the neutral cue (`minus` / "—" / "No change") — never an absent cue that could read as a default positive/negative.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 8. Test plan

Smallest set of tests required before a native implementation of this pattern is accepted. The
shared layer is testable **today**; the native layer is deferred until #1239 unblocks the iOS
build/toolchain.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

- `StateCueResolver` mapping tests, placed beside the existing
  `packages/core/src/commonTest/.../` suites:
  - `amount(+n)` → icon `income`, `Sign.EXPLICIT_PLUS`, tone `POSITIVE`; `amount(−n)` →
    `expense`, `EXPLICIT_MINUS`, `NEGATIVE`; `amount(0)` → neutral, no sign.
  - `budget()` threshold boundaries: 74.9 → on-track, 75 → near-limit (`warning`), 100 → over
    (`warning`/`trendUp`) — and assert the thresholds equal the web `getBudgetStatusIndicator`
    values (parity with `apps/web/src/lib/a11y.ts`).
  - `goalPace()` classifies behind vs on-track from `(percentComplete, fractionOfPeriodElapsed)`.
  - `gainLoss()` → `trendUp` / `trendDown` / `trendFlat` at the zero boundary.
  - `sync()` → synced / syncing / stale (age threshold) / offline / failed.
  - **Every returned `StateCue` carries a non-empty `label`** (guarantees a non-color channel
    always exists) — a single parameterized test over all states.
- **Cross-platform parity:** a fixture test asserting the iOS-bound thresholds/labels match the
  web `a11y.ts` indicators for the same inputs, so the two implementations cannot drift.

**Native (iOS, deferred until #1239 unblocks):**

- **Color-blind simulation:** snapshot each surface in §6 under protanopia/deuteranopia/tritanopia
  filters and assert the state is still distinguishable (icon/shape/text present). This is the
  acceptance gate for 1.4.1.
- **Grayscale snapshot checks:** render each surface fully desaturated (and with
  `differentiateWithoutColor` on) and assert via snapshot that positive vs. negative, on-track vs.
  over-budget, gain vs. loss, and synced vs. stale remain visually distinct.
- **No-color-only audit (unit/UI):** assert that for each state the accessibility tree contains
  the cue label (i.e. removing color would not remove information) — e.g. a credit amount's a11y
  label includes "Income"/"+", an over-budget card includes "Over budget".
- **Dynamic Type XXL:** the icon cue is retained and labels wrap without clipping at the largest
  accessibility size (verifies #2119 interaction).
- **VoiceOver:** the amount, transaction type, and status are announced for a transaction row
  (verifies the §6 gap is closed; phrasing owned by #2117).

## 9. Cross-references & resolved decisions

**Related epics (do not duplicate their scope):**

- **#2113** (#2534, #2537) — chart text-alternative / spoken-summary pattern
  (`docs/design/ios-chart-accessibility.md`). It **consumes** this doc's `trendUp/trendDown` and
  `stale` cues for its `TrendDirection` and stale-data row; this doc owns the cue definitions, it
  owns the chart summary text.
- **#2117** — VoiceOver labels & announcements. Owns the exact spoken phrasing and rotor; this doc
  only requires the cue **text exists** in the accessibility tree and is not color-derived.
- **#2119** — Dynamic Type. Owns scalable layout; this doc requires the icon cue survive scaling
  (§7).
- **Design-system sources:** `docs/design/accessibility-patterns.md` §5.3 (lines 826–844);
  `docs/design/chart-component-specs.md` _Status Indicator Rules_ (171–180) & _Financial Semantic
  Colors_ (420–428); `docs/design/icon-system-ios.md` (icon-add procedure).
- **Web reference contract:** `apps/web/src/lib/a11y.ts` (`getGoalStatusIndicator` 134–149,
  `getBudgetStatusIndicator` 163–175); `apps/web/src/components/charts/chart-palette.ts` (63–75).

**Resolved design decisions (in-session, 2026-06-20):**

1. **Amount sign cue (headline 1.4.1 fix) — CONFIRMED by maintainer 2026-06-20, option (c).**
   Two distinct contexts:
   - **In lists/rows:** income vs. expense is conveyed by the already-shape-distinct **leading
     type icon** (`arrow.down.circle` income vs. `arrow.up.circle` expense, via
     `SFSymbolsMapping.swift`). Do **not** also add a directional arrow on the row amount — that
     would be a redundant double-arrow.
   - **For standalone amounts** (dashboard net cashflow, investment gain/loss, summary cards) where
     no type icon is present: `CurrencyLabel` must render an **explicit sign for positives too**.
     **The 1.4.1 violation today:** `CurrencyLabel.amountColor` (`CurrencyLabel.swift:71–76`)
     returns green for positive / red for negative, and the `.currency` `NumberFormatter`
     (`:64–68`) signs **only negatives** — so a positive value's positivity is carried by color
     alone. The design fix: positives gain a leading **`+`** (e.g. "+$1,250.00"). _Design-only —
     no Swift change ships in this PR (#1239 blocks the build); the intended behavior is
     documented for the implementer._
   - Color remains an **enhancement** layered on the icon/sign/text, never the sole signal.
2. **New shared tokens — proposed, owned by @kmp-engineer.** `trendUp`, `trendDown`, `trendFlat`,
   and `stale` should be added to the shared `IconToken` enum (and iOS `SFSymbolsMapping` /
   `LucideMapping`), because neither `IconToken.kt` nor `IconToken.swift` defines them today and
   #2113 references them as #2121-owned. **This design PR does not edit `IconToken.kt`** —
   `packages/core` is @kmp-engineer-owned, so the enum/mapping change is a **separate tracked
   task** for @kmp-engineer (spec in §5.1).
3. **"Failed" is a sync state, not a transaction state** — the model's `TransactionStatus` is
   `PENDING/CLEARED/RECONCILED/VOID` (`Transaction.kt:16`); the epic's "failed" cue is mapped to
   the **sync-failed** state, not a non-existent transaction status (§4).
4. **Budget "near limit" is a first-class state** — the 75–99% band gets its own `warning` icon +
   "Near limit" text, reconciled to the shared/web thresholds, rather than collapsing into
   "On track" as the current `BudgetItem.statusText` does (§4, §6).
5. **Derived goal pace is surfaced** — an active-but-behind goal gets a `warning` + "Behind
   schedule" cue; lifecycle status (`GoalStatus`) and pace are distinct channels (§4).
6. **Color is enhancement only** — `FinanceColors.*` tones layer on top of icon + shape + text;
   no surface may rely on `*.color` / `gainLossColor` / `progressColor` as the sole signal (§3).
