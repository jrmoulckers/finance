# iPhone SE Compact-Width Dashboard, Bills & Transaction-Entry Layouts — Finance

> **Status:** PROPOSED — design decisions **maintainer-confirmed 2026-06-20** (compact-width breakpoint + stepper model both confirmed); pending human review & merge
> **Epic:** #2190 · **Closes:** #2607, #2608 · **Refs:** #1239 (Apple Developer enrollment, blocking native impl)
> **WCAG Target:** 2.2 Level AA (1.4.10 Reflow, 1.4.4 Resize Text, 2.5.5 Target Size)
> **Priority:** P1 (`priority:high`) · **Milestone:** v1.0
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies how the Dashboard, the
Bills list, and the transaction-create stepper must lay out at **375 pt** (the narrowest current
iPhone: SE 2nd/3rd gen and 13 mini) so that, once unblocked, a native implementation can proceed
without re-deriving the contract. **No Swift code ships with this doc**; the Swift fragments below
are illustrative shapes, not compiled source.

This is the **compact-width companion** to the Dynamic Type reflow audit
(`docs/design/ios-dynamic-type-reflow.md`, epic #2119). It does **not** re-derive the seven reflow
rules — it consumes them and specifies the **width** dimension those rules interact with: a layout
that passes at 390 pt + regular text can still fail at **375 pt + AX1**, because compact width and
large text **compound**. Where this doc cites an "R1–R7" rule it means the rule defined in
`ios-dynamic-type-reflow.md` §3.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — currency/label formatting, the savings-rate and net-worth
  math, the quick-add minimum-field set and default-selection logic, and masking decisions — live
  in `packages/core` / `packages/models` so all platforms share one source of truth. Compact-width
  layout adds **no** new financial math.
- **Apple-framework layout** — `ViewThatFits`, `@Environment(\.horizontalSizeClass)`,
  `@Environment(\.dynamicTypeSize)`, `@ScaledMetric`, `GeometryReader`, sheet presentation detents,
  and safe-area anchoring — live in `apps/ios` (the surfaces named in §5; planned per #1239).

---

## Table of Contents

1. [Why this matters](#1-why-this-matters)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [Compact-width breakpoints & the reflow toolkit](#3-compact-width-breakpoints--the-reflow-toolkit)
4. [Compact Dashboard & Bills (#2607)](#4-compact-dashboard--bills-2607)
5. [Surface application map](#5-surface-application-map)
6. [Compact transaction-create stepper (#2608)](#6-compact-transaction-create-stepper-2608)
7. [State coverage — compact width × Dynamic Type risk matrix](#7-state-coverage--compact-width--dynamic-type-risk-matrix)
8. [Test plan](#8-test-plan)
9. [Cross-references & resolved decisions](#9-cross-references--resolved-decisions)

---

## 1. Why this matters

The iPhone SE (2nd/3rd gen) and iPhone 13 mini render at **375 pt** logical width — the smallest
viewport the app must support and **15 pt narrower** than the 390 pt of the standard 12/13/14/15.
That 15 pt is the difference between a three-column summary that just fits and one that truncates a
balance. In a finance app a clipped amount (`$1,2…`) is not cosmetic — it withholds the exact
figure the user opened the app to read.

Compact width is **not** an independent axis from Dynamic Type — the two **compound**. A row that
survives 375 pt at the default text size can still overflow at 375 pt + AX1, because both the width
shrinks **and** the text grows. The #2119 audit graded every surface against text scale on a
nominal-width device; this doc adds the **width** variable and the explicit **compact × Dynamic
Type** interaction (§7) that neither doc covers alone. Together they define the acceptance criteria
for #2607 (Dashboard + Bills) and #2608 (transaction-create stepper) under epic #2190.

Three surfaces carry the most compact-width risk today, all with **fixed multi-column rows** that
were sized for a wider phone:

- **Dashboard** — a three-column Income / Expenses / Net summary with fixed-height dividers
  (`DashboardView.swift:88–114`).
- **Bills** — a three-column Due / Monthly Total / Bills summary with **larger** `.title3` amounts
  and **wider** 24 pt spacing than the Dashboard's (`BillsListView.swift:111–155`).
- **Transaction create** — a three-step stepper whose step-indicator labels and bottom action row
  must stay legible inside 375 pt (`TransactionCreateView.swift:58–86, 308–345`).

## 2. The cross-platform contract we are mirroring

The web app already resolves "the layout must survive the narrowest viewport" with a
**single-column Mobile tier**, and 375 pt sits **inside** it:

- `docs/design/responsive-breakpoints.md` (§ tier table, lines 16–19) defines **Tier 1 — Mobile,
  0–639 px**: _"Single-column, touch-first layout. Covers phones in portrait."_ Every iPhone in
  portrait — SE 375 pt through Pro Max 430 pt — falls in this one tier, so the web app renders the
  **same single column** at all of them. iOS's compact-width job is the native analogue: **never
  introduce a horizontal multi-column layout that a 375 pt phone cannot hold**, and collapse to a
  vertical stack when it cannot.
- The web proves the data and the single-column fallback already exist cross-platform; iOS owns
  the layout expression through `ViewThatFits` / size-class checks instead of CSS media queries.
- `docs/design/ios-dynamic-type-reflow.md` (§3 R3) already mandates HStack→VStack collapse **at
  accessibility sizes**; this doc extends the same collapse trigger to also fire **when the
  available width is too narrow** (375 pt), so the two triggers are OR-combined (§3).

The contract: **at 375 pt, fixed multi-column rows reflow to a single column exactly as the web
Mobile tier does; amounts never truncate; nothing scrolls horizontally except the one intentional
budget-ring carousel.**

## 3. Compact-width breakpoints & the reflow toolkit

### 3.1 Why `horizontalSizeClass` alone is insufficient

Every iPhone in portrait reports `horizontalSizeClass == .compact`, so the size class **cannot**
distinguish a 375 pt SE from a 430 pt Pro Max — both are `.compact`. A width-aware decision
therefore needs either the **actual available width** (via `GeometryReader` / a layout container)
or a **content-driven** fallback. This doc prefers content-driven reflow and reserves an explicit
numeric breakpoint only for decisions that content-fitting cannot make on its own (e.g. how many
columns a grid should have).

### 3.2 The breakpoints (maintainer-confirmed — §9 decision 1)

| Token (proposed)       | Value      | Meaning                                                                                     |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `CompactWidth.seBound` | **375 pt** | The narrowest supported width (SE 2nd/3rd gen, 13 mini). The design target of this doc.     |
| `CompactWidth.max`     | **390 pt** | At/below this, a surface is in the **compact tier** (SE/mini/standard). Above → wide phone. |

`CompactWidth.max = 390 pt` is the natural divider because 375 (SE/mini) and 390 (standard 12–15)
are the **real device widths**; a threshold between them gives the SE/mini tier the tighter layout
without a brittle exact-`== 375` check, and it nests entirely inside the web Mobile tier (< 640 px).
These are **layout tokens**, mirroring the web's token-encoded breakpoints
(`responsive-breakpoints.md` §"Token definitions").

### 3.3 The reflow toolkit (reuse, don't reinvent)

The #2119 audit already inventories the shipped primitives
(`apps/ios/Finance/Accessibility/DynamicTypeSupport.swift`); compact-width layout reuses them and
adds two width-aware patterns:

- **`AdaptiveFinanceStack`** (#2119 §4) — switches `HStack → VStack` when
  `dynamicTypeSize.isAccessibilitySize`. Compact width extends its trigger to **OR** a width test:
  collapse when `isAccessibilitySize` **or** available width ≤ `CompactWidth.max`. This is the
  single most-reused tool for the three-column summary rows (§4).
- **`ViewThatFits`** — the **primary, content-driven** reflow for the summary rows: declare the
  horizontal layout first and a vertical fallback second; SwiftUI picks the horizontal one only
  when it actually fits the proposed width, so 375 pt "just works" without reading a number.
- **`@ScaledMetric` tap targets** — keep every control ≥ 44×44 pt (WCAG 2.2 **2.5.5**) at 375 pt
  across all text sizes (#2119 R5).

```
// Illustrative summary-row reflow — implementation deferred per #1239. Not compiled source.
ViewThatFits(in: .horizontal) {
  HStack(spacing: 16) { incomeColumn; divider; expensesColumn; divider; netColumn }   // wide
  VStack(spacing: 12) { incomeColumn; expensesColumn; netColumn }                      // 375 pt / AX
}
```

The rule of thumb: **`ViewThatFits` for "does this row fit?"; the 390 pt breakpoint only for
"how many grid columns?"** (§4.3).

## 4. Compact Dashboard & Bills (#2607)

### 4.1 Dashboard — the three-column summary is the headline risk

`DashboardView.spendingSummaryCard` (`DashboardView.swift:88–114`) lays Income / Expenses / Net in
an `HStack(spacing: 16)` with two `Divider().frame(height: 44)` (lines 94, 96). At 375 pt the
`ScrollView` horizontal padding (`:44`, ~16 pt each side) plus the card's own `.padding()` (`:101`,
~16 pt each side) consume ≈ 64 pt, leaving ≈ 311 pt for **three** `.callout.bold()` amounts, two
dividers, and 2 × 16 pt spacing — ≈ 93 pt per amount. A value like `$1,234.56` is borderline at the
default size and **fails at 375 pt + AX1** (the #2119 R3/R6 finding, here intensified by the
narrower width). **Fix:** wrap the three columns in the `ViewThatFits` pattern (§3.3) so they stack
vertically at 375 pt / AX sizes, and hide the fixed-height `Divider`s when stacked (a 44 pt vertical
divider between stacked rows is meaningless and re-introduces the R6 fixed-height clip).

The **net-worth card** (`DashboardView.swift:66–84`) is already single-column and full-width
(`maxWidth: .infinity`, no fixed height) — it passes at 375 pt today (#2119 grades it PASS). The
**wave-2 net-worth trend card** (#2116, `ios-net-worth-trend-chart.md`) adds a sparkline +
projection; at 375 pt it must keep the headline amount on its own line above a full-width chart
that uses `minHeight` (never fixed `height`), and at accessibility sizes it degrades to the #2113
data-table per #2119 R4 — compact width does not change that trigger, it only makes the pre-AX
chart shorter.

### 4.2 The new wave-2 dashboard cards must be born compact-correct

These cards do not exist yet, so they must be **designed** for 375 pt from the start rather than
retrofitted:

- **Savings-rate card** (#2162, `ios-savings-rate-dashboard-card.md`). The rate is already computed
  and cached on the view model (`DashboardViewModel.savingsRate`, `DashboardViewModel.swift:64–66,
93–97`) but never rendered. As a **single percentage + trend glyph + delta**, it is inherently
  narrow-friendly: lay it out as one full-width card (rate as the headline, trend cue + "vs last
  month" delta on a second line) so it never needs a multi-column row at 375 pt. The trend
  direction uses the non-color cue from `ios-noncolor-state-cues.md` (glyph + text, never color
  alone).
- **Today Spend / Fun Money** (#2159, `ios-today-spend-funmoney-widget.md`). This is **primarily a
  WidgetKit surface** (Lock Screen `accessoryCircular`/`accessoryRectangular`, Home Screen
  `systemSmall`/`systemMedium`) and lays out within WidgetKit's own fixed family sizes — **outside**
  the in-app Dashboard scroll, so 375 pt app-width reflow does not apply to the widget itself. **If**
  the same metric is later surfaced as an in-app Dashboard card, it follows the savings-rate pattern
  above: one full-width card, no multi-column row.

### 4.3 Dashboard grid & list rows at 375 pt

- **Quick-access grid** (`DashboardView.swift:147–211`) is a `LazyVGrid` of **three** flexible
  columns. At 375 pt each card is ≈ `(375 − 32 − 2×12) / 3 ≈ 106 pt`; the title is
  `.lineLimit(1)` (`:206`), so "Investments" (the longest label) is at risk of truncation even at
  the default size and **will** truncate at AX. **Fix:** drop the column count from **3 → 2** when
  available width ≤ `CompactWidth.max` (390 pt) — this is exactly the case the numeric breakpoint
  exists for — and remove `.lineLimit(1)` so the label wraps (#2119 R2). Below 2 columns is not
  needed at 375 pt regular; the 2-up grid plus wrapping label holds.
- **Budget-health carousel** (`DashboardView.swift:118–143`) is an intentional **horizontal**
  `ScrollView` of fixed `.frame(width: 80)` ring cards (`:134, :137`). Horizontal scrolling here is
  a **deliberate carousel**, not a reflow failure — it is the one allowed exception to "no
  horizontal scrolling" (WCAG 1.4.10 permits scrolling content that is a 2-D data set / gallery).
  At 375 pt ≈ 4 cards are visible; **keep** the carousel, but ensure the ring `size: 60` and its
  `.caption` label scale with Dynamic Type so the card grows vertically rather than clipping
  (#2119 R6/R7). Do **not** convert it to a wrapping grid — that would bury later budgets.
- **Recent-transaction row** (`DashboardView.swift:249–265`) puts a fixed 32×32 icon (`:253`), a
  `.lineLimit(1)` payee (`:256`), a `Spacer`, and the amount in one `HStack`. At 375 pt a long
  payee truncates before the amount even at the default size. **Fix:** drop `.lineLimit(1)` on the
  payee (#2119 R2) and reflow the row to a stack at AX sizes (#2119 R3); the 32×32 icon is a
  decorative glyph and may stay fixed (#2119 R7 exception).

### 4.4 Bills — a worse three-column summary than the Dashboard

`BillsListView.summaryCard` (`BillsListView.swift:111–155`) is the **highest-risk** compact-width
surface in this doc. It lays Due / Monthly Total / Bills in an `HStack(spacing: 24)` (line 112) —
**wider** spacing than the Dashboard's 16 — with two `Divider().frame(height: 40)` (lines 125, 139)
and renders the two money columns at **`.title3.bold()`** (lines 121, 135), a **larger** type style
than the Dashboard summary's `.callout`. The arithmetic is unforgiving: ≈ 311 pt of content width −
48 pt spacing − 2 dividers ≈ 87 pt per column for a `.title3` amount such as `$2,450.00`. This is
likely to truncate or wrap awkwardly **even at the default size at 375 pt**, before Dynamic Type is
considered. **Fix:** apply the same `ViewThatFits` reflow (§3.3) — at 375 pt the three figures
stack into a single column (Due, then Monthly Total, then Bills count), dividers hidden when
stacked. This is the canonical "375 pt + large type compounds" case in the risk matrix (§7).

`BillsListView.billRow` (`BillsListView.swift:185–243`) carries a fixed 36×36 icon (`:190`), a
name, an inner `HStack(spacing: 4)` holding the payee plus an optional "Auto-pay" `Label` (`:197–
206`), a `Spacer`, and a trailing amount + due-date column. At 375 pt the payee + "Auto-pay" inner
row squeezes the trailing amount. **Fix:** let the name/payee block wrap (#2119 R2) and reflow the
leading-text / trailing-amount pairing to a stack at AX sizes (#2119 R3); the 36×36 icon is
decorative and may stay fixed (#2119 R7 exception). The bill **section headers**
(`BillsListView.swift:159–171`) already use a small color dot **plus** a text title plus a count, so
status is not conveyed by color alone — keep that (non-color cue, `ios-noncolor-state-cues.md`).

## 5. Surface application map

Verdict legend: **OK@375** = holds at 375 pt today · **REFLOW** = needs the width-aware
stack/grid change before it is correct at 375 pt (regular and/or AX).

| Surface (file:line)                                                   | Compact-width risk at 375 pt                                                                                                 | Fix (rule)                                                                                          | Verdict    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| **Dashboard — net-worth card** (`DashboardView.swift:66–84`)          | Single full-width amount; `maxWidth:.infinity`, no fixed height                                                              | None today; wave-2 trend card (#2116) keeps amount on its own line above a `minHeight` chart        | **OK@375** |
| **Dashboard — monthly summary** (`DashboardView.swift:88–114`)        | 3-col `HStack(16)` + two `Divider(height:44)`; ≈ 93 pt per `.callout` amount; fails at 375 + AX1                             | `ViewThatFits` → vertical stack; hide dividers when stacked (#2119 R3/R6)                           | **REFLOW** |
| **Dashboard — savings-rate card** (new, #2162)                        | Not built yet; data on `DashboardViewModel.savingsRate:64–66`                                                                | Born compact: one full-width card, rate headline + non-color trend on 2nd line; no multi-column row | **REFLOW** |
| **Dashboard — net-worth trend card** (new, #2116)                     | Adds sparkline/projection; chart must not use fixed `height`                                                                 | Full-width chart `minHeight`; degrade to #2113 table at AX (#2119 R4)                               | **REFLOW** |
| **Dashboard — quick-access grid** (`DashboardView.swift:147–211`)     | `LazyVGrid` 3 flexible cols ≈ 106 pt each; `.lineLimit(1)` titles truncate                                                   | 3→2 columns when width ≤ `CompactWidth.max` (390); drop `.lineLimit(1)` (#2119 R2)                  | **REFLOW** |
| **Dashboard — budget carousel** (`DashboardView.swift:118–143`)       | Intentional horizontal `ScrollView` of `width:80` rings                                                                      | Keep carousel (allowed 1.4.10 exception); scale ring + label with Dynamic Type (#2119 R6/R7)        | **OK@375** |
| **Dashboard — recent-tx row** (`DashboardView.swift:249–265`)         | 32×32 icon + `.lineLimit(1)` payee + amount; payee truncates at 375                                                          | Drop payee `.lineLimit(1)` (R2); stack at AX (R3); icon decorative (R7)                             | **REFLOW** |
| **Bills — summary card** (`BillsListView.swift:111–155`)              | **Worst case:** 3-col `HStack(24)` + two `Divider(height:40)`; two `.title3.bold()` amounts ≈ 87 pt — truncates @375 regular | `ViewThatFits` → vertical stack; hide dividers when stacked (#2119 R3/R6)                           | **REFLOW** |
| **Bills — bill row** (`BillsListView.swift:185–243`)                  | 36×36 icon + payee/"Auto-pay" inner `HStack` squeezes trailing amount                                                        | Wrap name/payee (R2); stack leading-text/trailing-amount at AX (R3); icon decorative (R7)           | **REFLOW** |
| **Bills — section header** (`BillsListView.swift:159–171`)            | Color dot + title + count                                                                                                    | Already non-color-safe (dot **and** text); keep                                                     | **OK@375** |
| **TxCreate — step indicator** (`TransactionCreateView.swift:58–86`)   | 3 dots + `.caption2` labels + 2 pt connector; labels/connector collide at 375 + AX                                           | Dots-only (drop labels) when width ≤ `CompactWidth.max` **or** `isAccessibilitySize` (§6.1)         | **REFLOW** |
| **TxCreate — details/keypad** (`TransactionCreateView.swift:128–264`) | 3-col keypad `minHeight:44` inside a `Form` scrolls with content; keypad leaves the thumb zone                               | Pin keypad + primary action to safe-area bottom (consistent with #2167 §3.1); keys keep ≥44 pt (R5) | **REFLOW** |
| **TxCreate — review rows** (`TransactionCreateView.swift:268–304`)    | `LabeledContent` label-left/value-right; long values (payee, joined tags, note) truncate at 375                              | Reflow to stacked label-over-value at AX (#2119 R3)                                                 | **REFLOW** |
| **TxCreate — bottom bar** (`TransactionCreateView.swift:308–345`)     | Back + Next/Save `HStack`, each `maxWidth:.infinity`; "Save Transaction" clips in ≈170 pt at AX                              | Stack the two buttons vertically at `isAccessibilitySize`; full-width primary on top (R3/R6)        | **REFLOW** |

## 6. Compact transaction-create stepper (#2608)

The transaction-create surface is **already a three-step stepper** — `type → details → review`
(`TransactionCreateViewModel.Step`, `TransactionCreateViewModel.swift:29–38`; switched in
`TransactionCreateView.swift:28–37`). #2608 is therefore **not** "build a stepper" but "make the
existing stepper fit 375 pt and make it consistent with the #2167 one-thumb quick-add defaults."

### 6.1 Keep the multi-step model at SE width (maintainer-confirmed — §9 decision 2)

**Do not collapse the stepper into a single long scroll at 375 pt.** The `details` step alone is a
multi-section `Form` (amount + keypad, payee, account, category, status, BNPL, tags, mood, date,
note — `TransactionCreateView.swift:128–264`); flattening type + details + review into one scroll
at 375 pt **plus** AX text would produce an extremely long scroll and push the keypad far below the
fold. The three-step model keeps each step to roughly one screen and keeps the amount + keypad in
the thumb zone — the same bottom-anchored ergonomics #2167 specifies. The **compact adaptations**
are:

- **Step indicator → dots-only.** `stepIndicator` (`TransactionCreateView.swift:58–86`) draws a
  12 pt `Circle` + a `.caption2` label per step + a 2 pt connector `Rectangle` (`:80–83`). At 375 pt
  the three labels ("Type" / "Details" / "Review") fit at the default size, but at AX sizes the
  `.caption2` labels grow and collide with the connectors. **Drop the text labels (dots-only)** when
  available width ≤ `CompactWidth.max` (390 pt) **or** `dynamicTypeSize.isAccessibilitySize`,
  exposing the step name through the existing `accessibilityLabel` (`:76`) instead — VoiceOver
  parity is preserved, visual collision is avoided.
- **Pin the keypad + primary action to the safe-area bottom.** Today the Venmo-style keypad
  (`TransactionCreateView.swift:142–164`, #1486) lives **inside** the `Form`, so it scrolls with the
  fields and can leave the thumb arc. The compact stepper anchors the amount readout + keypad +
  `Next`/`Save` to the bottom safe area exactly as #2167 §3.1 prescribes, with the rest of the
  `details` fields scrolling above it. This is the single biggest one-handed-ergonomics win at SE
  width and keeps the digits at a known thumb-reachable position.

### 6.2 Consistency with #2167 quick-add defaults

The compact stepper and the #2167 quick-add sheet must speak the same language so a user is not
re-learning entry per surface:

- **Same cents-first keypad.** Both reuse the #1486 keypad and the shared incremental amount model
  (`TransactionCreateViewModel.appendAmountDigit` / `removeLastAmountDigit`, cents-first: "4","5","0"
  → `$4.50`); no system decimal keyboard, so the bottom safe area is free for the Save action
  (#2167 §3.2). The readout uses `monospacedDigit` (`TransactionCreateView.swift:134`) so the figure
  does not reflow as digits are added.
- **Same minimum-field rule & defaults.** The stepper's `canAdvance` for the `details` step already
  requires the #2167 minimum set — `amountCents > 0 && selectedAccountId != nil && !payee.isEmpty`
  (`TransactionCreateViewModel.swift:78–84`); account/type/date defaults come from the same shared
  default-selection logic #2167 §4 defines. The compact stepper changes **layout**, not the field
  contract, so the two stay in sync.
- **Quick-add is the fast path; the stepper is the deliberate path.** #2167 is "log $4.50 coffee in
  two taps"; the compact stepper is the fully-specified entry (categories, tags, BNPL, status). Both
  must fit 375 pt; neither redefines the other's field set.

### 6.3 Keypad geometry at 375 pt

The keypad is a `LazyVGrid` of three flexible columns, spacing 12, keys `minHeight: 44`
(`TransactionCreateView.swift:142–164`). At 375 pt, after the surrounding insets (~16 pt each side),
each key is ≈ `(343 − 2×12) / 3 ≈ 106 pt` wide × ≥ 44 pt tall — comfortably above the 44 pt target
floor (WCAG 2.2 **2.5.5**, #2119 R5). The geometry is **already correct** at 375 pt; the required
change is **where** the keypad sits (pinned vs scrolling, §6.1), not its key sizing. Targets that
hold scaling glyphs use `@ScaledMetric` rather than a hardcoded 44 the label can outgrow (#2119 R5).

## 7. State coverage — compact width × Dynamic Type risk matrix

The core contribution of this doc: every surface must hold not just at 375 pt **or** at large text,
but at their **intersection**. The matrix grades the riskiest surfaces at 375 pt across the text
range. **375 pt + regular** is the new-device-floor case; **375 pt + AX1** is where compact width
and large text first compound; **375 pt + AX3/AX5** is the worst case.

| Surface                         | 375 pt + regular                         | 375 pt + AX1 (compounding begins)                         | 375 pt + AX3 / AX5 (worst case)    | Required behavior                                                                        |
| ------------------------------- | ---------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| **Dashboard monthly summary**   | 3 cols tight but legible                 | 3 `.callout` amounts overflow ≈ 93 pt columns             | severe clip without reflow         | `ViewThatFits` stacks to 1 column; dividers hidden when stacked                          |
| **Bills summary card**          | **already truncates** (`.title3`, 87 pt) | hard truncation                                           | hard truncation                    | `ViewThatFits` stacks to 1 column — must reflow even at regular                          |
| **Dashboard quick-access grid** | 3-up; `.lineLimit(1)` titles borderline  | titles truncate                                           | 2-up still tight                   | 3→2 columns ≤ 390 pt; drop `.lineLimit(1)` so labels wrap                                |
| **Recent-tx / bill rows**       | long payee truncates                     | payee + amount collide                                    | leading text must sit above amount | drop payee `.lineLimit(1)`; stack leading-text/trailing-amount at AX                     |
| **Stepper step indicator**      | 3 dots + labels fit                      | `.caption2` labels collide with connectors                | labels unreadable                  | dots-only ≤ 390 pt **or** `isAccessibilitySize`; name via `accessibilityLabel`           |
| **Stepper keypad**              | keys ≈ 106 × 44 pt — OK                  | keys grow vertically — OK if pinned, not if scrolled away | keypad must stay thumb-reachable   | pin keypad to safe-area bottom; keys keep ≥ 44 pt via `@ScaledMetric`                    |
| **Stepper bottom bar**          | Back + Save side-by-side fit             | "Save Transaction" clips in ≈ 170 pt                      | buttons unreadable side-by-side    | stack buttons vertically at `isAccessibilitySize`; full-width primary on top             |
| **Charts (net-worth trend)**    | visual chart                             | **auto-swap to #2113 data-table** (`isAccessibilitySize`) | data-table primary                 | chart frame `minHeight` not `height`; table per #2119 R4 — width does not change trigger |

Non-layout states inherit the #2119 §7 / #2113 §6 contracts and are **not** re-derived here:

- **Privacy (masking).** A masked placeholder (e.g. "••••") obeys the same reflow as a real amount;
  mask **first**, then lay out, so the reflow decision never depends on the unmasked width. A
  percentage (savings rate) discloses no absolute balance, so the rate/trend stay visible while
  masked (the established #2834 decision 2).
- **Stale.** A staleness cue (icon + text, `ios-noncolor-state-cues.md`) added to a card/row is
  inside the reflow budget — it wraps/stacks with the rest at 375 pt + AX, never pushing the amount
  off-screen.
- **Error / Empty.** `ErrorStateView` / `EmptyStateView` wrap their title/body/CTA at 375 pt; the
  retry/CTA keeps a ≥ 44 pt target (#2119 R5/R2). Bills empty state
  (`BillsListView.swift:34–41`) and Dashboard empty rows (`DashboardView.swift:228–233`) already use
  these components.

## 8. Test plan

Smallest set required before a native implementation of the compact-width layouts is accepted.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

- **Layout-math helpers (only if extracted).** If the column-count and reflow decisions are factored
  into a pure helper (e.g. `quickAccessColumnCount(width:) → 2 | 3` keyed on `CompactWidth.max`, or
  a `shouldStackSummary(width:isAccessibilitySize:)` predicate), assert it in `commonTest`: returns
  2 columns at ≤ 390 pt and 3 above; stacks when width ≤ 390 **or** `isAccessibilitySize`. These are
  the only compact-width decisions that are platform-neutral and unit-testable without a simulator.
- **String-width fixtures (mirrors #2119 §9).** Assert the longest realistic formatted amount and
  the longest payee/category/bill-name fixtures are produced correctly by the shared formatters —
  these are the exact strings the 375 pt layout must not clip. Masking-aware formatting emits a
  fixed-width placeholder so reflow is deterministic regardless of the underlying balance.
- Place beside the existing `packages/core` `commonTest` aggregation/formatting tests.

**Native (iOS, deferred until #1239 unblocks):**

- **Snapshot every REFLOW surface in §5 at 375 pt × `{ .large (regular), .accessibility1,
.accessibility3, .accessibility5 }`** — the four required compact-width × Dynamic Type cells.
  A surface FAILS if any amount/label is ellipsized or clipped, if a fixed multi-column row stays
  horizontal when it cannot fit, or if a chart still renders only as a plot at AX sizes.
- **Reflow assertion:** at 375 pt the Dashboard monthly summary and the **Bills summary card** render
  as a vertical stack (Bills must stack even at `.large` because it truncates at 375 pt regular);
  recent-tx / bill rows stack leading-text over amount at `.accessibility1`+.
- **Grid assertion:** the Dashboard quick-access grid renders **2** columns at 375 pt and **3** at a
  ≥ 414 pt width; titles wrap (no "…").
- **Stepper assertions:** step indicator is dots-only at 375 pt **or** `isAccessibilitySize`; the
  keypad + primary action remain pinned to the safe-area bottom (not scrolled off) on the `details`
  step; the bottom bar stacks its two buttons vertically at `.accessibility1`+; every keypad key and
  the Save/Next button report a ≥ 44×44 pt frame at `.accessibility5` (WCAG 2.2 2.5.5).
- **No-horizontal-scroll assertion:** at 375 pt no surface introduces horizontal scrolling **except**
  the intentional budget-ring carousel (WCAG 1.4.10).
- **VoiceOver order unchanged** after each reflow.

Because native execution is blocked by #1239, today's verdicts in §5/§7 are derived by **static
audit** of the cited code; the snapshot/probe steps above are the deferred native confirmation.

## 9. Cross-references & resolved decisions

**Consumed docs (do not duplicate their scope):**

- `docs/design/ios-dynamic-type-reflow.md` (epic #2119, PR #2836) — the R1–R7 reflow rules,
  `AdaptiveFinanceStack` / `@ScaledMetric` / `isAccessibilitySize`, and the chart→table auto-swap.
  This doc adds the **width** axis those rules interact with; it does not redefine them.
- `docs/design/ios-one-thumb-quick-add.md` (epic #2167, PR #2841) — the thumb-zone bottom-anchored
  layout, the #1486 cents-first keypad, and the minimum-field / default-selection contract the
  compact stepper stays consistent with (§6.2).
- `docs/design/ios-noncolor-state-cues.md` (epic #2121, PR #2838) — the trend / stale glyph + text
  cues reused by the savings-rate card and bill rows (never color alone).
- `docs/design/ios-net-worth-trend-chart.md` (#2116), `docs/design/ios-savings-rate-dashboard-card.md`
  (#2162), `docs/design/ios-today-spend-funmoney-widget.md` (#2159) — the wave-2 surfaces that must
  fit 375 pt (§4.1–§4.2).
- `docs/design/ios-chart-accessibility.md` (epic #2113, PR #2834) — the data-table alternative the
  net-worth trend chart degrades to at AX sizes, and the structural pilot this doc mirrors.
- `docs/design/responsive-breakpoints.md` — the web Mobile tier (0–639 px, single-column) inside
  which 375 pt nests; the cross-platform precedent for compact reflow (§2).

**Grounding (real code cited above):** `DashboardView.swift`, `BillsListView.swift`,
`TransactionCreateView.swift`, `DashboardViewModel.swift`, `TransactionCreateViewModel.swift`,
`apps/ios/Finance/Accessibility/DynamicTypeSupport.swift`.

**Resolved design decisions (maintainer-confirmed 2026-06-20):**

1. **Compact-width breakpoint (CONFIRMED hybrid)** — prefer **content-driven `ViewThatFits`** for the
   multi-column summary rows (auto-stack when they don't fit; no magic number; 375 pt "just works")
   **plus** **one** named numeric breakpoint, `CompactWidth.max = 390 pt`, only for the grid-column-count
   cases `ViewThatFits` cannot decide. `horizontalSizeClass` alone is insufficient because every iPhone
   portrait is `.compact` and cannot tell a 375 pt SE from a 430 pt Pro Max. **375 (SE 2nd/3rd gen, 13
   mini) and 390 (standard 12–15) are the real device widths**, which is what justifies 390 pt as the
   divider: ≤ 390 pt = SE/mini/standard tier → tighter column counts. This nests inside the web Mobile
   tier (< 640 px single-column, `responsive-breakpoints.md`). (§3.2, §4.3.)
2. **Stepper stays multi-step at SE width (CONFIRMED)** — keep the existing 3-step
   `type → details → review` model (`TransactionCreateView.swift:28–37`) at 375 pt; do **not** collapse
   to a single scroll (it would bury the keypad below the fold at 375 pt + AX). Confirmed compact
   adaptations: (a) the step indicator drops its `.caption2` text labels to **dots-only** at ≤ 390 pt
   **or** `isAccessibilitySize` (avoids connector collision, `stepIndicator:58–86`); (b) the keypad +
   primary action are **pinned to the safe-area bottom** instead of scrolling inside the `Form` (keeps
   the keypad in the thumb zone, consistent with #2167 §3.1). (§6.1.)
3. **Budget-ring carousel is the one allowed horizontal scroll** — the Dashboard budget-health
   `ScrollView(.horizontal)` is a deliberate gallery (WCAG 1.4.10 exception), kept at 375 pt rather
   than reflowed to a wrapping grid that would bury later budgets. (§4.3.)
