# iOS Grocery Safe-to-Spend — "Can I afford this?" Card — Finance

> **Status:** PROPOSED — design decisions D1/D2/D6 maintainer-confirmed (2026-06-20); pending human review & merge
> **Epic:** #2199 · **Closes:** #2610 · **Refs:** #2199, #1239
> **WCAG Target:** 2.2 Level AA (1.4.1 Use of Color; 1.4.4 Resize Text; 1.4.10 Reflow)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies the grocery-store
"can I afford this?" card and its per-surface application so that, once unblocked, a native
implementation can proceed without re-deriving the contract. **No Swift code ships with this
doc**, and it edits no `packages/*` code.

**This card invents no new math.** The "can I afford this?" answer is the **same safe-to-spend
engine** designed for the wave-2 Today Spend / Fun Money widget
(`docs/design/ios-today-spend-funmoney-widget.md`, #2159 / PR #2843). The grocery card is a
**focused, glanceable presentation of safe-to-spend in a checkout moment** — it consumes the
existing shared contract rather than deriving a parallel calculation.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — the safe-to-spend amount, the prospective "remaining
  after this basket" arithmetic, the affordability verdict, staleness, and masking decisions —
  live in `packages/core` / `packages/models` so all platforms share one tested source of truth.
  The contract already exists cross-platform in the web app (`apps/web/src/lib/dashboard/`, §3).
- **Apple-framework integration** — the SwiftUI card, the numeric basket input, SF Symbol
  rendering, Dynamic Type layout, and VoiceOver semantics — live in `apps/ios` (planned;
  currently absent).

---

## Table of Contents

1. [Goals & scope](#1-goals--scope)
2. [Glossary: what "can I afford this?" means](#2-glossary-what-can-i-afford-this-means)
3. [Grounding in real code](#3-grounding-in-real-code)
4. [Per-surface application map (entry point + card)](#4-per-surface-application-map-entry-point--card)
5. [Glanceable layout specs](#5-glanceable-layout-specs)
6. [The affordability answer is never color-only](#6-the-affordability-answer-is-never-color-only)
7. [Prospective basket input & "remaining after" math](#7-prospective-basket-input--remaining-after-math)
8. [Privacy masking in a public place](#8-privacy-masking-in-a-public-place)
9. [State coverage](#9-state-coverage-dynamic-type-privacy-stale-error-empty)
10. [Test plan](#10-test-plan-runnable-today-vs-native-deferred)
11. [Open questions](#11-open-questions)
12. [Cross-references & resolved decisions](#12-cross-references--resolved-decisions)

---

## 1. Goals & scope

One glanceable iOS surface, designed but **not built** (blocked on #1239):

- **Grocery safe-to-spend card** — a fast, high-contrast "can I afford this?" answer for use at
  the store. It shows the current safe-to-spend amount, **optionally** lets the user type a
  prospective basket amount, and returns an **immediate yes/no verdict plus the
  remaining-after-this amount** through a large, accessible, non-color affordability indicator.

The card answers exactly one question at the checkout line: _"If I buy this, am I still okay?"_

**In scope:** quick access (reachable in 1–2 taps), the optional basket-amount input, the
non-color verdict, privacy masking for a screen visible to people behind you in line, and the
empty / no-budget-configured state.

**Out of scope (and why):**

- **Re-deriving safe-to-spend math** — consumed from the shared engine (§3), never re-invented.
- **A WidgetKit / Lock Screen grocery widget** — the glanceable widget surfaces are owned by
  #2159 (`ios-today-spend-funmoney-widget.md`); this is an **in-app** card. A lock-screen
  _quick glance_ entry is noted as a follow-up in §4, not specified here.
- **Editing `packages/*`** — the shared "remaining after" helper (§7) is **proposed for
  @kmp-engineer** as a separate, non-blocked task; it is not written in this design PR.
- **Barcode / price scanning** — the user types or speaks the basket total; itemized scanning is
  a separate future epic.

---

## 2. Glossary: what "can I afford this?" means

These are **not** new invented metrics. They are the iOS rendering of a contract that already
exists cross-platform in the web app, so the card shows the same numbers as the web dashboard.

### Safe-to-spend (the headline number)

The money you can spend through the end of the period **after** everything already committed —
unpaid critical bills, planned savings, discretionary already spent, and pinned-category
reserves. This is **already a first-class concept** in the shared web contract:

```ts
// apps/web/src/lib/dashboard/safe-to-spend-shared.ts:69
safeToSpendCents =
  normalizeCents(expectedIncomeCents)
  − remainingCriticalBillsCents      // unpaid, critical, due today…periodEnd (lines 52–60)
  − normalizeCents(plannedSavingsCents)
  − normalizeCents(discretionarySpentCents)
  − pinnedCategoryReserveCents;      // Σ max(0, budget − spent) over pinned cats (lines 61–68)
```

`SharedSafeToSpendSummary { safeToSpendCents, remainingCriticalBillsCents,
pinnedCategoryReserveCents, dailyAllowanceUntilPaydayCents, staleData, warnings }`
(`safe-to-spend-shared.ts:30`) is exactly the payload the card consumes. It also exposes
`dailyAllowanceUntilPaydayCents = floor(safeToSpendCents / daysUntilPayday)` (line 85) and the
`warnings: ['overspent','stale-data']` signals (lines 78–79) the card reuses.

> **Decision D1 — "safe to spend" here means the bills/payday-aware period figure, not just
> today's allowance.** **Maintainer-confirmed (2026-06-20).** A grocery basket is frequently a weekly shop — larger than one day's
> allowance — so the affordability answer is grounded in `safeToSpendCents`
> (`calculateSharedSafeToSpend`), **not** the simpler single-day Fun Money. Today's
> `funMoneyCents` / `canSpendToday` (`today-spend.ts:28,34`) and
> `dailyAllowanceUntilPaydayCents` are shown as a **secondary** "per-day until payday" line, so
> both the period view and the daily pace are available. This intentionally chooses the richer
> variant the widget's open question Q-C deferred for a glanceable _daily_ widget — checkout is
> exactly the moment the payday-aware figure matters.

### "Remaining after" (the prospective answer)

When the user enters a basket total, the card answers with the amount **left over if they buy
it**:

```
remainingAfterCents = safeToSpendCents − basketCents
canAfford           = basketCents ≤ safeToSpendCents     // i.e. remainingAfterCents ≥ 0
```

Note the boundary: `canAfford` uses **`≤` (inclusive)** — a basket that costs **exactly**
safe-to-spend is affordable, leaving `$0`. This is deliberately distinct from the widget's
`canSpendToday = funMoneyCents > 0` (strict `>`, `today-spend.ts:34`), which answers a different
question ("is there _any_ discretionary headroom right now?"). For "can I afford _this specific
basket_?", spending your last safe dollar on it is a **yes**. The exact-zero boundary is the
prime test case in §10.

### No budget configured

If income was never set up (`expectedIncomeCents == 0`), safe-to-spend is not computable → the
card renders the **no-budget-configured** state (§9), **not** `$0`. Showing `$0` would imply
"you have nothing to spend" when the truth is "we don't know yet." This mirrors the widget
spec's resolution of the same case (`ios-today-spend-funmoney-widget.md` §2).

---

## 3. Grounding in real code

Everything below translates existing, shipped logic. The card invents no new math.

| Concern                           | Source of truth (cited)                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safe-to-spend (headline)          | `calculateSharedSafeToSpend(...)` → `safeToSpendCents`, `dailyAllowanceUntilPaydayCents`, `staleData`, `warnings` — `apps/web/src/lib/dashboard/safe-to-spend-shared.ts:49,69,85`                    |
| Critical-bill reserve             | unpaid + critical + due `today…periodEnd` — `safe-to-spend-shared.ts:52`                                                                                                                             |
| Pinned-category reserve           | `Σ max(0, budgetCents − spentCents)` over `pinned` — `safe-to-spend-shared.ts:61`                                                                                                                    |
| Over-budget / stale signals       | `warnings.push('overspent')` when `< 0`; `staleData = daysBetween(lastUpdatedAt, today) > 3` — `safe-to-spend-shared.ts:76,78`                                                                       |
| Input normalization               | `normalizeCents` clamps non-finite / negative to `≥ 0` — `safe-to-spend-shared.ts:41`; `nonNegative` twin — `today-spend.ts:18`                                                                      |
| Today's Fun Money (secondary)     | `calculateTodaySpendSummary(...)` → `funMoneyCents`, `canSpendToday` — `apps/web/src/lib/dashboard/today-spend.ts:22,28,34`                                                                          |
| Single-card retiree variant       | `calculateSafeToSpend(...)` (monthly, no payday) — `apps/web/src/lib/dashboard/safe-to-spend.ts:35`                                                                                                  |
| Money type / arithmetic           | `Cents` value class, overflow-checked `+ − ×`; `fromDollars` for input only — `packages/models/src/commonMain/kotlin/com/finance/models/types/Cents.kt:15,16,25,34,60`                               |
| Safe division (daily allowance)   | `MoneyOperations.divide(amount, divisor)` (banker's rounding, rejects `÷0`) — `packages/core/src/commonMain/kotlin/com/finance/core/money/MoneyOperations.kt:27`                                     |
| Spent so far (discretionary)      | `FinancialAggregator.dailySpending(...)` filters `EXPENSE`, non-deleted, non-`VOID` — `packages/core/src/commonMain/kotlin/com/finance/core/aggregation/FinancialAggregator.kt:126`                  |
| Budget status / over-budget       | `BudgetCalculator.calculateStatus(...)`; `healthLevel` HEALTHY `<0.75` / WARNING `0.75–1.0` / OVER `>1.0` — `packages/core/src/commonMain/kotlin/com/finance/core/budget/BudgetCalculator.kt:22,128` |
| Budget model                      | `Budget { categoryId, amount: Cents, period, isRollover }` — `packages/models/src/commonMain/kotlin/com/finance/models/Budget.kt:16`                                                                 |
| Entry point host (Dashboard)      | `DashboardView.quickAccessSection` "More" grid + `quickAccessCard(...)` — `apps/ios/Finance/Screens/DashboardView.swift:147,197`                                                                     |
| Default tab is Dashboard          | `TabView(selection:)` with `.dashboard` first/default — `apps/ios/Finance/Navigation/MainTabView.swift:22,51`                                                                                        |
| Deep-link router                  | `AppDeepLink` enum + `DeepLinkHandler.parse(...)`, custom scheme `finance://`, identifier-only routes — `apps/ios/Finance/Navigation/DeepLinkHandler.swift:28,79,285`                                |
| Currency renderer                 | `CurrencyLabel(amountInMinorUnits:currencyCode:showSign:font:)` — `apps/ios/Finance/Components/CurrencyLabel.swift:20`                                                                               |
| Color-only sign gap (to avoid)    | `CurrencyLabel.amountColor` returns `.green`/`.red` with **no `+` sign** on positives — `apps/ios/Finance/Components/CurrencyLabel.swift:71`                                                         |
| Progress ring / empty state       | `ProgressRing` — `apps/ios/Finance/Components/ProgressRing.swift:10`; `EmptyStateView(systemImage:title:message:)` — `apps/ios/Finance/Components/EmptyStateView.swift:10`                           |
| Non-color cue glyphs              | `IconView(IconToken)` → `SFSymbolsMapping.swift`; vocabulary in `docs/design/ios-noncolor-state-cues.md` §4                                                                                          |
| App already behind biometric gate | `AuthGateView` (`.authenticated` / `.unauthenticated`) — `apps/ios/Finance/Screens/AuthGateView.swift:31,62`                                                                                         |
| Existing masking system (widget)  | `WidgetMaskingMode {visible,bucketed,percent,dots}`, `WidgetMoneyFormatter` — `apps/ios/Shared/WidgetPrivacy.swift:6` (widget-side only; see §8)                                                     |

> **Note for the build phase:** the web `safe-to-spend-shared.ts` math is TypeScript. To keep
> parity exact and testable today, §10 **proposes (for @kmp-engineer)** a KMP
> `SafeToSpendCalculator` + a thin `GroceryAffordability` helper in `packages/core` mirroring
> `safe-to-spend-shared.ts`, so all platforms share one tested implementation. That KMP work is
> a **separate, non-blocked task** and is **not** done in this design PR — this PR adds only this
> one doc and edits no `packages/*` code.

---

## 4. Per-surface application map (entry point + card)

Two surfaces: the **entry point** (how you reach it in 1–2 taps) and the **card** itself.

| Surface                                          | Where it lives (cited)                                                                                                                                                                                                        | Tap cost                                                                                                | Renders                                                                                                                           | Absolute amount shown?                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Entry — Dashboard quick-access card**          | New `quickAccessCard("Can I afford this?", iconToken: .budgets/cart, …)` in `DashboardView.quickAccessSection` (`DashboardView.swift:147,197`)                                                                                | **1 tap** from app open (Dashboard is the default tab, `MainTabView.swift:51`); 2 taps from another tab | Tappable card → presents the affordability sheet/screen                                                                           | n/a (label only)                          |
| **Entry — deep link (proposed)**                 | New `AppDeepLink.groceryAffordability` case + `finance://safe-to-spend` route alongside `budgetCategory` (`DeepLinkHandler.swift:48,89`); lock-screen quick-glance precedent `quickEntry` (#1605, `DeepLinkHandler.swift:45`) | **1 tap** from a Shortcut / Home-Screen icon / future complication                                      | Opens the card directly; URL carries **identifiers only, never money** (parity with existing routes, `DeepLinkHandler.swift:156`) | n/a                                       |
| **Card — `GroceryAffordabilityView` (proposed)** | New SwiftUI view presented as a sheet/full-screen cover; uses `CurrencyLabel` (`CurrencyLabel.swift:20`), `ProgressRing` (`ProgressRing.swift:10`), `IconView`, `EmptyStateView` (`EmptyStateView.swift:10`)                  | —                                                                                                       | Big safe-to-spend amount + verdict; optional basket field + "remaining after"; secondary daily-allowance line                     | **Yes by default** (§8), maskable one-tap |

The entry-point card reuses the **exact** `quickAccessCard(title:iconToken:color:)` pattern
already shipping for Investments / Bills / Reports (`DashboardView.swift:158–192,197`), so the
grocery entry is a one-cell addition to an existing grid — not a new navigation paradigm. Deep
links follow the existing "identifiers only" rule; no route ever carries a dollar amount.

---

## 5. Glanceable layout specs

Design rules (all translate existing conventions):

- **One number, one verdict.** The card answers a single question. Headline = safe-to-spend; with
  a basket entered, the verdict ("Yes — $84 left" / "Over by $12") is the largest element on
  screen.
- **High contrast, large type at the checkout line.** The verdict word and amount use a
  `.largeTitle`/`.title` scalable style. Glanceability under fluorescent store lighting and at
  arm's length is the priority — this is why absolutes are visible by default (§8) rather than
  masked.
- **Ring encodes "how much of safe-to-spend this basket uses."** Reuse `ProgressRing`
  (`ProgressRing.swift:10`); `progress = basketCents / safeToSpendCents` (clamped `0…1`, pinned
  at 100% with an over-tick when over). The ring is a relative cue that survives masking — the
  amount can be hidden without losing the glance.
- **Secondary line is the daily pace.** Below the headline: "≈ $N/day until payday" from
  `dailyAllowanceUntilPaydayCents` (`safe-to-spend-shared.ts:85`).
- **Currency comes from `CurrencyLabel`** (`CurrencyLabel.swift:20`) with the period/locale
  formatter it already owns — never a hand-rolled string.

### Card sketch — no basket entered

```
┌─────────────────────────────────────────────┐
│ Can I afford this?                       👁  │  ← title + one-tap mask toggle (§8)
│                                              │
│            ✓  $213 safe to spend             │  ← headline (icon + text + color)
│            ≈ $30/day until payday            │  ← secondary daily pace
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  Enter a basket amount         $____    │ │  ← optional numeric field (§7)
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Card sketch — basket entered, affordable

```
┌─────────────────────────────────────────────┐
│ Basket  $129                             👁  │
│                                              │
│        ◕   ✓  Yes — $84 left                 │  ← ring (129÷213) + check + verdict text
│            of $213 safe to spend             │
└─────────────────────────────────────────────┘
```

### Card sketch — basket entered, over

```
┌─────────────────────────────────────────────┐
│ Basket  $240                             👁  │
│                                              │
│        ⛔  ⚠  Over by $27                     │  ← ring pinned 100% + over-tick + triangle
│            $213 safe to spend                │
└─────────────────────────────────────────────┘
```

The verdict (✓ / ⚠ glyph **and** the words "Yes — … left" / "Over by …") is never conveyed by
color alone (§6).

---

## 6. The affordability answer is never color-only

The yes/no answer **must not** be color-only. This card adopts the canonical cue vocabulary from
`docs/design/ios-noncolor-state-cues.md` (#2121): every state is expressed through **shape +
glyph + text**, with color as the **fourth, non-sufficient** channel (its §3 "rule of two":
icon/shape + text at minimum, color layered on top).

| Affordability state          | Trigger                                           | SF Symbol / shape (cue)               | Text cue (authoritative)              | Tone (color, layered) | Token (`ios-noncolor-state-cues.md` §4) |
| ---------------------------- | ------------------------------------------------- | ------------------------------------- | ------------------------------------- | --------------------- | --------------------------------------- |
| **Affordable**               | `basketCents < safeToSpendCents`                  | `checkmark.circle` (check shape)      | "Yes — $84 left"                      | `statusPositive`      | `check` / `success`                     |
| **Just affordable (zero)**   | `basketCents == safeToSpendCents`                 | `checkmark.circle`                    | "Yes — $0 left"                       | `statusPositive`      | `check` / `success`                     |
| **Over budget**              | `basketCents > safeToSpendCents`                  | `exclamationmark.triangle` (triangle) | "Over by $27"                         | `statusNegative`      | `warning`                               |
| **No basket entered**        | basket field empty                                | `checkmark.circle` on the headline    | "$213 safe to spend"                  | `statusPositive`      | `check`                                 |
| **Over already (no basket)** | `safeToSpendCents < 0` (`warnings:['overspent']`) | `exclamationmark.triangle`            | "Over budget — nothing safe to spend" | `statusNegative`      | `warning`                               |

Notes:

- The **check vs. triangle silhouettes differ in shape**, not just tint, so the verdict reads in
  grayscale / high-contrast / color-blind modes (WCAG 1.4.1).
- The verdict **text** ("Yes — … left" / "Over by …") is the VoiceOver-authoritative channel and
  is always present; the value inside it is rendered by `CurrencyLabel` (masking-aware, §8).
- This card **avoids the existing `CurrencyLabel` color-only-sign gap** (`amountColor` greens a
  positive with no `+`, `CurrencyLabel.swift:71`): the verdict carries explicit words, and the
  "Over by $27" case states the deficit in text rather than relying on a red amount. That gap is
  itself tracked for repair by #2121 §4/§9.
- Decorative glyphs (e.g. the mask toggle's eye) carry their own accessibility label; the verdict
  glyph is folded into the combined verdict element, not announced twice.

---

## 7. Prospective basket input & "remaining after" math

### 7.1 The input

- A single **numeric, decimal-pad** field ("Enter a basket amount"), optional — the card is fully
  useful (shows safe-to-spend) with no input.
- Input is **major-currency-unit text → minor units** via `Cents.fromDollars(...)`, which the
  model marks "Only use for display/input conversion" (`Cents.kt:60`). All downstream math is
  integer `Cents` (minor units), never `Double`.
- The field is **ephemeral** — the basket amount is a throwaway what-if, **not persisted** and
  **not synced** (data minimization: nothing the card doesn't need is stored). _Recommended
  default; see §11._
- Dictation-friendly: the field accepts voice input, so "forty-two fifty" can be spoken at the store.

### 7.2 The math (proposed shared helper — for @kmp-engineer)

> **Ownership boundary.** `packages/core` is owned by **@kmp-engineer**. This doc only
> **specifies** the helper; the Kotlin lives in a **separate, non-blocked task** and is **not**
> written in this design PR (cross-package edits here would create fleet conflicts).

```kotlin
// PROPOSED for packages/core — mirrors safe-to-spend-shared.ts; NOT written in this PR.
data class GroceryAffordability(
    val safeToSpendCents: Cents,   // from SafeToSpendCalculator (mirror of safe-to-spend-shared.ts:69)
    val basketCents: Cents,        // normalized ≥ 0 (mirror of normalizeCents, :41)
    val remainingAfterCents: Cents,// safeToSpendCents − basketCents   (signed)
    val canAfford: Boolean,        // basketCents ≤ safeToSpendCents   (INCLUSIVE — see §2)
)

fun affordability(safeToSpend: Cents, basketInput: Cents): GroceryAffordability {
    val basket = if (basketInput.isNegative()) Cents.ZERO else basketInput   // clamp like :41
    val remaining = safeToSpend - basket                                     // Cents.minus, overflow-checked :25
    return GroceryAffordability(safeToSpend, basket, remaining, basket <= safeToSpend)
}
```

Key properties (all become tests in §10):

- **Inclusive boundary:** `basket == safeToSpend` → `remainingAfter == 0`, `canAfford == true`.
  Spending your last safe dollar on the basket is a **yes**. (Contrast with `canSpendToday > 0`.)
- **Signed remainder:** when over, `remainingAfterCents` is **negative**; the card renders its
  absolute value as "Over by $27" (the sign drives the verdict, the magnitude is the deficit).
- **Overflow-safe:** an absurd basket (e.g. pasted `99999999999`) flows through `Cents.minus`,
  which **throws** on `Long` overflow rather than wrapping (`Cents.kt:25`) — the UI catches and
  shows an input error, never a wrong "Yes".
- **Clamped input:** negative / non-finite basket input clamps to `≥ 0`, matching the web
  `normalizeCents` (`safe-to-spend-shared.ts:41`), so bad input can never _increase_ what looks
  affordable.

The headline `safeToSpendCents` itself is computed once by the shared `SafeToSpendCalculator`
(mirror of `calculateSharedSafeToSpend`, `safe-to-spend-shared.ts:49`) and passed in — the
grocery helper only does the prospective subtraction, so there is **one** safe-to-spend
implementation across web, the #2159 widget, and this card.

---

## 8. Privacy masking in a public place

The card is meant to be looked at **at a checkout line** — a screen a stranger behind you may
glance at. The privacy posture follows the project's _minimum data + default-private_ principle,
balanced against the card's reason to exist (a fast, glanceable answer).

### 8.1 Current reality (grounded)

- **There is no in-app balance masking today.** A grep of `apps/ios/Finance` for
  `privacySensitive` / `hideBalance` / `redact` / `blur` / `privacyMode` returns **nothing** —
  every in-app amount (e.g. `DashboardView` net-worth and spending cards, `DashboardView.swift:71,111`)
  renders in the clear. The only masking system that exists is **widget-side**:
  `WidgetMaskingMode {visible,bucketed,percent,dots}` + `WidgetMoneyFormatter`
  (`apps/ios/Shared/WidgetPrivacy.swift:6`), which does not cover in-app views.
- **The app is already behind a biometric gate.** Reaching any in-app screen — including this
  card — requires passing `AuthGateView`'s `.authenticated` path
  (`apps/ios/Finance/Screens/AuthGateView.swift:31,62`). The person standing behind you in line
  has **not** unlocked the device; the masking concern is purely "shoulder-surfing a screen the
  owner already unlocked."

### 8.2 The design

> **Decision D2 — verdict always visible; absolute amounts visible by default with a one-tap
> mask, masked-by-default when the global hide-balances flag is ON.** **Maintainer-confirmed
> (2026-06-20).**

- **The affordability verdict and its non-color cue are _always_ shown** — "Yes — left" / "Over
  by" with the ✓ / ⚠ glyph and the ring. The verdict is the card's whole purpose and discloses no
  absolute balance on its own.
- **Absolute dollar figures are visible by default** once inside the unlocked app — a masked
  default would force a Face ID prompt before every checkout glance and defeat the 1–2-tap
  glanceable goal.
- **A prominent one-tap "hide amounts" (eye) toggle** sits in the card header. Tapping it swaps
  every absolute for a redacted placeholder while keeping the verdict and ring — for the moment
  you hand the cashier your phone or sense someone behind you. The toggle is a labeled control
  ("Hide amounts" / "Show amounts").
- **Honor the global "Hide balances" flag — the _same single_ flag the widget spec proposes, not
  a new one.** The widget spec proposes a global app-group flag, default OFF, stored in the
  `group.com.finance.app` container alongside `WidgetPrivacySettings`
  (`apps/ios/Shared/WidgetPrivacy.swift`; suggested key `finance:widget-hide-balances`,
  `ios-today-spend-funmoney-widget.md` §9.3). When that flag is ON, this card **starts masked**
  (absolutes hidden, verdict + ring shown) without a per-use tap. This generalizes the widget's
  D1 / the chart pilot's decision #2 (_relative/verdict visible, absolutes masked_) to an in-app
  surface.

> **Decision D6 — one global "Hide balances" setting, read by BOTH the widget extension and
> in-app sensitive cards (do not invent a parallel in-app flag).** **Maintainer-confirmed
> (2026-06-20).** #2199 **broadens** the semantics of the #2159 flag from _widget-only_ to
> _app-wide_: the same app-group key (`finance:widget-hide-balances` in the
> `group.com.finance.app` suite, `apps/ios/Shared/WidgetPrivacy.swift`) should be **generalized
> to a single "Hide balances" preference** consumed by the widget extension **and** by in-app
> sensitive surfaces such as this card. The owners (**@kmp-engineer**, who own the shared masking
> work in §8.3) must **reconcile #2199 and #2159 onto this one setting** — not two divergent
> flags. (A future rename of the key to drop the `widget-` prefix is optional cleanup and out of
> scope here; the contract is "one flag, two readers.") Cross-reference:
> `ios-today-spend-funmoney-widget.md` §9.3.

### 8.3 Proposed shared masking (for @kmp-engineer)

Because no in-app masking exists, the build phase needs a masking-aware formatter for in-app
amounts. Frame it as a **shared `MaskingMode` + formatter in `packages/core`** (mirroring the web
`MaskingMode` the chart spec already references, and conceptually the widget's
`WidgetMaskingMode`), consumed by both the widget and in-app `CurrencyLabel`, and **driven by the
single global "Hide balances" flag of D6 (§8.2)** — not a second widget-only flag. **Proposed for
@kmp-engineer; not built or edited in this PR.** Specifying it here keeps one masking rule across
surfaces rather than a second widget-only copy.

### 8.4 Data minimization

The card reads only the scalars it renders (`safeToSpendCents`, `dailyAllowanceUntilPaydayCents`,
`staleData`) plus the ephemeral basket the user types. No payees, account names, or
category-level transactions are surfaced. The basket amount is never persisted, synced, or placed
in a deep link (§7.1, §4).

---

## 9. State coverage (Dynamic Type, privacy, stale, error, empty)

Every state below must be defined for the card.

| State                          | Trigger                                                                                            | Card rendering                                                                                                                                           | Affordability indicator                               | Absolutes?            |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------- |
| **Affordable**                 | basket entered, `basketCents < safeToSpendCents`                                                   | Ring `basket÷safe`, "Yes — $N left", secondary daily line                                                                                                | `checkmark.circle` + "Yes — … left"                   | Default visible (§8)  |
| **Just affordable (exact $0)** | `basketCents == safeToSpendCents`                                                                  | Ring at 100% (no over-tick), "Yes — $0 left"                                                                                                             | `checkmark.circle` + "Yes — $0 left"                  | Default visible       |
| **Over budget (basket)**       | `basketCents > safeToSpendCents`                                                                   | Ring pinned 100% + over-tick, "Over by $N"                                                                                                               | `exclamationmark.triangle` + "Over by …"              | Default visible       |
| **Already over (no basket)**   | `safeToSpendCents < 0` → `warnings:['overspent']` (`safe-to-spend-shared.ts:78`)                   | Headline "Over budget — nothing safe to spend"; basket field still usable but every answer is Over                                                       | `exclamationmark.triangle`                            | Default visible       |
| **No budget configured**       | `expectedIncomeCents == 0` / no income set (§2)                                                    | `EmptyStateView` "Set up your income" CTA (`EmptyStateView.swift:10`); **no `$0`**, no ring                                                              | n/a                                                   | n/a                   |
| **Masked / public**            | eye toggle ON, or global `finance:widget-hide-balances` ON (§8.2)                                  | Verdict + ring shown; every absolute → redacted placeholder; secondary line hidden                                                                       | Verdict + ring only, **no $**                         | **Never**             |
| **Stale**                      | `daysBetween(lastUpdatedAt, today) > 3` → `warnings:['stale-data']` (`safe-to-spend-shared.ts:76`) | Dimmed card + "Updated N days ago" (non-color `stale` cue, `ios-noncolor-state-cues.md` §4); **suppress a green "Yes"** affirmation against day-old data | Verdict shown but de-emphasized + staleness icon/text | As normal, but dimmed |
| **Error**                      | safe-to-spend load failed, or basket input overflows (`Cents.kt:25`)                               | "Couldn't calculate right now" with a labeled Retry (mirrors `DashboardView` error alert, `DashboardView.swift:52`); input error for overflow            | none / input error                                    | n/a                   |
| **Empty / loading**            | data still loading on first open                                                                   | `ProgressView` with "Loading" label (mirrors `DashboardView.swift:29`)                                                                                   | none                                                  | n/a                   |

**Dynamic Type (consume `docs/design/ios-dynamic-type-reflow.md`, #2119):** the verdict word and
amount use scalable text styles and must remain readable across AX1–AX5. At accessibility sizes
the layout reflows (stacked, `ViewThatFits`) and **the verdict word is never truncated** — if
space is tight, the secondary daily line drops first, then the "of $213 safe to spend" caption,
then the absolute wraps; the "Yes — left" / "Over by" verdict always survives. No currency value
is ever clipped (1.4.4 / 1.4.10). Do not duplicate that doc's audit here; the card is a new
surface that must pass its checklist.

---

## 10. Test plan: runnable-today vs native-deferred

Split by what can be verified **now in CI** (pure KMP/shared logic) vs what needs the **blocked**
iOS runtime (#1239).

### 10.1 Runnable today — KMP `commonTest` (pure math, no SwiftUI)

The affordability arithmetic and the safe-to-spend base are platform-agnostic and must be covered
by shared tests so every platform shares one verified implementation. The web equivalents already
exist and pass — `apps/web/src/lib/dashboard/safe-to-spend-shared.test.ts` and
`today-spend.test.ts` — and serve as the **parity oracle**.

Proposed `commonTest` cases for a `SafeToSpendCalculator` + `GroceryAffordability` helper in
`packages/core` (mirrors `safe-to-spend-shared.ts` + §7). **The calculator + tests are proposed
for @kmp-engineer as a separate, non-blocked task — they are not part of this design PR, which
adds no `packages/*` code:**

| #   | Case                                                                                                         | Asserts                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | **Affordability verdict:** `canAfford == basket ≤ safeToSpend`                                               | inclusive `≤`, not `<` (§2, §7)                                                                       |
| 2   | **Exact-zero boundary (PRIME):** `basket == safeToSpend` → `remainingAfter == 0` **and** `canAfford == true` | the headline boundary this card hinges on                                                             |
| 3   | **One cent over boundary:** `basket == safeToSpend + 1¢` → `remainingAfter == −1¢`, `canAfford == false`     | the verdict flips exactly at the boundary                                                             |
| 4   | **Remaining-after math:** `remainingAfter == safeToSpend − basket` (signed)                                  | over → negative magnitude is the "Over by N" deficit                                                  |
| 5   | **No basket entered:** `basket == 0` → headline is `safeToSpend`, no verdict computed                        | card shows safe-to-spend alone                                                                        |
| 6   | **Safe-to-spend parity:** the `825_00` fixture from `safe-to-spend-shared.test.ts:31`                        | `safeToSpendCents`, reserves, `dailyAllowanceUntilPaydayCents`, `staleData`, `warnings` all match web |
| 7   | **Already over:** `safeToSpend < 0` → `warnings:['overspent']`; any basket → `canAfford == false`            | `safe-to-spend-shared.ts:78`                                                                          |
| 8   | **No income configured:** `expectedIncome == 0` → "no-budget-configured", **not** `safeToSpend == 0` verdict | §2 decision                                                                                           |
| 9   | **Clamped / non-finite basket:** negative or NaN basket clamps to `≥ 0`                                      | parity with `normalizeCents` (`safe-to-spend-shared.ts:41`) — can't inflate affordability             |
| 10  | **`Cents` overflow:** enormous basket / income throws, not wraps                                             | `Cents.kt:25,16` overflow guards                                                                      |
| 11  | **Staleness boundary:** `daysBetween(updatedAt, today) == 3` → not stale; `> 3` → stale                      | `safe-to-spend-shared.ts:76`                                                                          |
| 12  | **Masking-aware formatting:** masked mode emits no raw absolute, verdict still derivable                     | parity with the shared masking rule (§8.3)                                                            |

These run in the existing `packages/core` / `packages/models` `commonTest` suites alongside
`BudgetCalculatorTest`, `CentsTest`, etc. — green in CI today, no device required.

### 10.2 Native-deferred — needs the iOS runtime (blocked on #1239)

Captured now as a checklist so the build phase is mechanical:

- **Reachability:** the Dashboard quick-access card opens the affordability surface in **≤ 2
  taps** from app launch; the proposed `finance://safe-to-spend` deep link opens it in 1.
- **Verdict semantics:** VoiceOver reads the verdict as one element — "Yes, eighty-four dollars
  left" / "Over by twenty-seven dollars" — never as an unlabeled icon.
- **Basket input:** entering a value (typed or dictated) recomputes the verdict live; clearing it
  returns to the headline-only state; overflow shows an input error, not a wrong "Yes".
- **Non-color (#2121):** check vs. triangle render distinctly in grayscale / Smart Invert /
  Increase Contrast; the verdict survives with color removed.
- **Masking (§8):** the eye toggle hides every absolute while keeping verdict + ring; with the
  global hide-balances flag ON the card starts masked; VoiceOver never speaks a hidden amount.
- **Dynamic Type (#2119):** at AX5 the verdict word is never truncated; the absolute wraps /
  drops first; no currency value is clipped.
- **States:** no-budget-configured shows the CTA (never `$0`); stale dims + "Updated N days ago"
  and suppresses a green "Yes"; error shows a labeled Retry.
- **Deep link:** `finance://safe-to-spend` carries identifiers only, no amount
  (`DeepLinkHandler.swift:156` privacy rule).

---

## 11. Open questions

| ID  | Question                                                                                             | Recommended default (baked into this spec)                                                                                                    | Status                                 |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Q-A | Does "safe to spend" here mean **today's allowance** or the **full-period discretionary remaining**? | **Full-period `safeToSpendCents`** (`calculateSharedSafeToSpend`), with today's Fun Money / daily allowance as a secondary line (D1, §2).     | **Maintainer-confirmed (2026-06-20).** |
| Q-B | **Default masking** for a screen visible in a public checkout line?                                  | **Absolutes visible by default + one-tap mask; masked-by-default when the global hide-balances flag is ON; verdict always visible** (D2, §8). | **Maintainer-confirmed (2026-06-20).** |
| Q-C | Is the typed basket amount **ephemeral** or remembered between visits?                               | **Ephemeral** — never persisted or synced (data minimization, §7.1).                                                                          | Recommendation; revisit post-beta.     |
| Q-D | Should the card also offer a **lock-screen quick glance** (widget/complication) entry?               | Out of scope here; the glanceable widget surfaces are owned by #2159. Noted as a follow-up entry point (§4), not specified.                   | Deferred to #2159 follow-up.           |

Q-A and Q-B were genuine design decisions; the maintainer/orchestrator was messaged with these
plus the recommended defaults above, and **both were confirmed (2026-06-20)** with the defaults as
written (D1, D2, and the single-flag generalization D6). Work continued with the defaults baked in
so the doc is internally consistent. The affected sections (§2 for Q-A; §8/§9 for Q-B) remain the
single points to update should anything change.

---

## 12. Cross-references & resolved decisions

**Resolved decisions captured by this spec:**

- **D1 — Grocery "safe to spend" = the bills/payday-aware `safeToSpendCents`** (§2), grounded in
  `apps/web/src/lib/dashboard/safe-to-spend-shared.ts:69`, with today's Fun Money
  (`today-spend.ts:28,34`) as a secondary line. Resolves Q-A. **Maintainer-confirmed (2026-06-20).**
- **D2 — Verdict always visible; absolutes visible by default with a one-tap mask; masked-by-default
  under the global hide-balances flag** (§8). Generalizes the chart pilot's decision #2
  and the widget's D1 (_relative/verdict visible, absolutes masked_) to an in-app surface.
  Resolves Q-B. **Maintainer-confirmed (2026-06-20).**
- **D3 — Inclusive affordability boundary:** `canAfford = basket ≤ safeToSpend` (§2, §7) — a
  basket costing exactly safe-to-spend is a **yes** with `$0` left, deliberately distinct from the
  widget's strict `canSpendToday > 0` (`today-spend.ts:34`). The exact-zero boundary is the prime
  `commonTest` (§10, case 2).
- **D4 — No new math:** the headline is computed by the **same shared safe-to-spend engine** as
  the #2159 widget; the only new shared code is a thin "remaining after" subtraction, **proposed
  for @kmp-engineer**, not written here (§7).
- **D5 — Basket input is ephemeral and never leaves the device** (§7.1, §8.4); money stays in
  `Cents` minor units end-to-end (`Cents.kt:15`), converted only for input/display
  (`Cents.kt:60`).
- **D6 — One global "Hide balances" setting, two readers** (§8.2). This card reuses the **same
  single app-group flag** the #2159 widget proposes (suggested key `finance:widget-hide-balances`
  in the `group.com.finance.app` suite, `apps/ios/Shared/WidgetPrivacy.swift`) rather than
  inventing a parallel in-app flag — but **broadens its semantics from widget-only to app-wide**.
  The owners (**@kmp-engineer**) must reconcile #2199 and #2159 onto a single "Hide balances"
  preference read by **both** the widget extension and in-app sensitive cards. Resolves the
  cross-doc-consistency requirement. Cross-reference:
  `ios-today-spend-funmoney-widget.md` §9.3. **Maintainer-confirmed (2026-06-20).**

**Cross-references (consumed — not duplicated):**

- `docs/design/ios-today-spend-funmoney-widget.md` (#2159, PR #2843) — the wave-2 safe-to-spend /
  Fun Money widget; **the source of the shared math this card presents**, plus the global
  hide-balances flag (§8.2) and the no-budget-configured resolution (§2).
- `docs/design/ios-noncolor-state-cues.md` (#2121) — the canonical non-color cue vocabulary; the
  yes/no verdict's icon + shape + text (§6) defers to it.
- `docs/design/ios-dynamic-type-reflow.md` (#2119) — the Dynamic Type reflow contract this new
  surface must satisfy (§9).
- `docs/design/ios-chart-accessibility.md` (#2113, the "#2834 pilot") — the status-blockquote +
  application-map + state-coverage + commonTest/native-deferred structure mirrored here, and its
  decision #2 (_absolutes masked_) generalized in §8.
- `apps/web/src/lib/dashboard/` — `safe-to-spend-shared.ts`, `today-spend.ts`, `safe-to-spend.ts`
  (cross-platform contract + parity oracle for the §10 tests).
- `packages/core` / `packages/models` — `BudgetCalculator.kt`, `FinancialAggregator.kt`,
  `MoneyOperations.kt`, `types/Cents.kt`, `Budget.kt` (the shared engine and money type).
- `apps/ios/Finance/Screens/DashboardView.swift`, `Navigation/MainTabView.swift`,
  `Navigation/DeepLinkHandler.swift`, `Components/{CurrencyLabel,ProgressRing,EmptyStateView}.swift`,
  `Screens/AuthGateView.swift` — the existing iOS surfaces the entry point and card extend
  (named, **not edited** in this design PR).

**Blocked-by:** #1239 (Apple Developer Program enrollment) — gates all native SwiftUI work in
§10.2. **Closes:** #2610. **Refs:** #2199 (epic), #1239.
