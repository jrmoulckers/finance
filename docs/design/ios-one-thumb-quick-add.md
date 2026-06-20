# iOS One-Thumb Quick-Add Expense Capture — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20; pending human review & merge
> **Epic:** #2167 · **Closes:** #2599 · **Refs:** #2113 (sibling pilot), #1239 (native blocker)
> **WCAG Target:** 2.2 Level AA (AAA where practical)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies the one-thumb quick-add
flow and its per-surface application so that, once unblocked, a native implementation can proceed
without re-deriving the contract. **No Swift code ships with this doc**; the Swift fragments below
are illustrative shapes, not compiled source.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — the minimum-field rule, default-selection logic
  (last-used account, today's date, default type/status), category auto-suggestion, and the
  save / save-and-add-another contract — belong in `packages/core` / `packages/models` so web,
  Android, iOS, and Windows compose the same quick-add from one source of truth.
- **Apple-framework integration** — thumb-zone layout, the custom numeric keypad, sheet
  presentation detents, haptics, Dynamic Type layout, and the VoiceOver / Switch Control path —
  live in `apps/ios` (the surfaces named in §5; planned per #1239).

This doc mirrors the structure resolved for sibling epic #2113 in
`docs/design/ios-chart-accessibility.md` (PR #2834): a status header, a native/KMP boundary note,
a shared-model section, a per-surface application map, a state-coverage table, and a test plan that
separates runnable-today shared `commonTest` work from native iOS tests deferred until #1239.

---

## Table of Contents

1. [Why this pattern](#1-why-this-pattern)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [The iOS one-thumb flow: reachability, amount, minimum fields, non-pointer path](#3-the-ios-one-thumb-flow-reachability-amount-minimum-fields-non-pointer-path)
4. [Shared model & defaults (packages/core)](#4-shared-model--defaults-packagescore)
5. [Surface application map](#5-surface-application-map)
6. [State coverage](#6-state-coverage-dynamic-type-validation-empty-success-save-and-add-another-offline-error)
7. [Test plan](#7-test-plan)
8. [Cross-references & resolved decisions](#8-cross-references--resolved-decisions)

---

## 1. Why this pattern

The highest-frequency action in a personal-finance app is capturing a single expense in the moment
— at the register, in the cab, leaving the café. On a modern large-screen iPhone the user is
usually holding the phone in one hand, and the **primary save action and the digits must sit inside
the thumb's reachable arc** (the bottom ~⅓ of the screen). Today's iOS create flow is a
**three-step sheet** — type → details → review — that requires a top-bar "Next" tap on each step
and a final "Save Transaction" on a review screen
(`apps/ios/Finance/Screens/TransactionCreateView.swift:28-37`, bottom bar `:308-345`). That is the
right surface for a deliberate, fully-specified entry, but it is too many round-trips for a
one-handed "log $4.50 coffee" capture.

The web app already solved the minimal-friction case with a dedicated **Quick Add** panel
(`apps/web/src/components/forms/QuickEntry.tsx`, issue #319) whose stated goal is _"2-tap entry:
type amount → tap Add"_ (`QuickEntry.tsx:13`). iOS needs the native equivalent, **optimized for the
thumb** and — critically — built so the one-thumb optimizations never regress assistive tech: a
VoiceOver or Switch Control user must reach every control without depending on the thumb-zone
geometry or a custom-keypad gesture.

This doc defines that single reusable iOS quick-add flow required by #2599 under epic #2167. It
reuses infrastructure that **already ships** — the Venmo-style cents-first keypad (#1486,
`TransactionCreateView.swift:142-164`), the `applyQuickEntry` fast-path
(`TransactionCreateViewModel.swift:204-224`), and the `LogTransactionIntent` defaults
(`apps/ios/Finance/Intents/LogTransactionIntent.swift:108-133`) — rather than inventing a parallel
entry stack.

## 2. The cross-platform contract we are mirroring

The web **Quick Add** panel is the canonical minimal-friction contract; iOS expresses the same
intent through native controls.

- **Minimum field set** — _"reduces the full TransactionForm to just the essential fields: amount,
  description, and transaction type. All other fields (account, category, date) are auto-populated
  from sensible defaults and auto-categorization."_ (`QuickEntry.tsx:5-10`). iOS adopts the same
  reduction.
- **Default selection (platform-neutral rules):**
  - **Account** — auto-select the **last-used** account, falling back to the first available
    (`QuickEntry.tsx:174-177`; persisted under `LAST_ACCOUNT_KEY`, `:48`,`:90-104`).
  - **Type** — remember the **last-used** type, defaulting to `EXPENSE`
    (`QuickEntry.tsx:106-116`,`:178`; `LAST_TYPE_KEY` `:51`).
  - **Date** — **today** (`todayISO()` `:85-88`, applied at submit `:279`).
  - **Category** — **auto-suggested** from the description and applied only when present; otherwise
    left `null` (`QuickEntry.tsx:203-211`,`:258-261`,`:280`).
- **Validation** — amount must be non-zero; account must resolve
  (`QuickEntry.tsx:240-243`,`:251-255`). (Web additionally requires a description — the one point
  where iOS deliberately diverges; see §4 and the resolved decision in §8.)
- **Save-and-add-another** — the panel **stays open** after submit, resets the amount/description,
  keeps the type+account for rapid re-entry, and shows a live _"N added"_ counter
  (`QuickEntry.tsx:223-233`,`:288-289`, counter `:323-327`).
- **Accessibility** — focus trap + restore, `Escape` closes / `Enter` submits, `role="dialog"`
  `aria-modal`, `aria-required` amount, and a polite `role="status"` live region for the counter
  (`QuickEntry.tsx:169`,`:213-221`,`:312-327`,`:374-377`).

iOS already mirrors the web's **incremental cents-first amount model**: the web uses
`useAmountInput({ mode: 'incremental', maxCents: 99_999_999 })` (`QuickEntry.tsx:156-162`) and iOS
ships the identical model in `appendAmountDigit` / `removeLastAmountDigit` with the same
`99_999_999` cap (`TransactionCreateViewModel.swift:96-107`). The quick-add flow reuses it directly.

## 3. The iOS one-thumb flow: reachability, amount, minimum fields, non-pointer path

The quick-add surface is a **bottom sheet** (a medium presentation detent) that opens with the
amount focused and the keypad already up. It has four design pillars.

### 3.1 Thumb-zone reachability

All **primary** actions live in the bottom reachable arc; the top of the sheet is reserved for
non-critical chrome only.

- **Bottom (reachable) — primary:** the large amount readout, the custom numeric keypad, and a
  full-width **Save** (primary) plus **Save & add another** (secondary) action row pinned to the
  safe-area bottom. This is the same bottom-bar slot today's review step uses for its primary action
  (`TransactionCreateView.swift:308-345`).
- **Top (non-reachable) — non-critical only:** a **Cancel/close** affordance and the expense/income
  segmented control. Reachability is a convenience, **not** the only path — every top control is
  also reachable by VoiceOver/Switch Control (§3.4) and one-handed via the system Reachability
  gesture, so nothing is _lost_ by being at the top, it is merely _less convenient_ to reach by
  thumb.
- **Tap targets** keep a ≥ 44×44pt hit area (the keypad keys already use `minHeight: 44`,
  `TransactionCreateView.swift:156`); per the Dynamic Type audit
  (`docs/design/ios-dynamic-type-reflow.md` §3, rule R5) targets that hold scaling glyphs grow with
  `@ScaledMetric` rather than a hardcoded 44 the label can outgrow.

```
// Illustrative bottom-anchored layout — implementation deferred per #1239. Not compiled source.
VStack(spacing: 0) {
  TypeToggle(selection: $vm.transactionType)        // top: non-critical
  Spacer()
  AmountReadout(text: vm.formattedAmount)            // reachable arc begins
  QuickAddKeypad(onDigit: vm.appendAmountDigit,      // reuses #1486 keypad
                 onDelete: vm.removeLastAmountDigit)
  HStack { SaveButton(); SaveAndAddAnotherButton() } // pinned to safe-area bottom
}
```

### 3.2 Amount entry — the custom cents-first keypad (resolved: custom, not system)

The amount is entered with the **existing custom Venmo-style cents-first keypad** (#1486,
`TransactionCreateView.swift:142-164`), **not** the system decimal keyboard. This is a **resolved
decision by precedent** (§8): the app already ships this keypad, the web Quick Add uses the same
incremental cents-first model (`QuickEntry.tsx:156-162`), and a custom keypad (a) keeps the digits
inside the thumb arc at a known position, (b) needs no decimal point (cents-first: "4","5","0" →
`$4.50`, `TransactionCreateViewModel.swift:88-93`), and (c) frees the bottom safe-area for the Save
actions instead of yielding it to the system keyboard. The readout uses a `monospacedDigit` style so
the figure does not reflow as digits are added (`TransactionCreateView.swift:134`).

The keypad keys already carry full labels/hints — `accessibilityLabel(key)` and
`"Adds digit \(key)"` / `"Removes the last digit"` (`TransactionCreateView.swift:160-161`) — so the
custom keypad is **not** a VoiceOver dead-end (§3.4).

### 3.3 The minimum fields to save

| Field        | Quick-add behavior                                                                                 | Grounding                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Amount**   | **Required.** Non-zero, cents-first keypad. The _only_ field that blocks save.                     | `Transaction.kt:45` (`amount != 0`); `TransactionValidator.kt:29-31`; `TransactionCreateViewModel.swift:283-287`      |
| **Type**     | Defaulted to **last-used**, else `expense`; toggled by the top segmented control.                  | `QuickEntry.tsx:106-116`; `TransactionCreateViewModel.swift:40`; `TransactionType` `Transaction.kt:13`                |
| **Account**  | Defaulted to **last-used**, else first available; inline picker, never blocks if a default exists. | `QuickEntry.tsx:174-177`; `TransactionValidator.kt:33-36` (account must exist)                                        |
| **Category** | **Optional** — auto-suggested from payee via the categorization engine; left null if none.         | `categorizationEngine.suggest` `TransactionCreateViewModel.swift:195-200`; `categoryId: SyncId?` `Transaction.kt:24`  |
| **Date**     | Defaulted to **today**; editable only via "More details".                                          | `date = Date()` `TransactionCreateViewModel.swift:45`; `todayISO()` `QuickEntry.tsx:85-88`                            |
| **Payee**    | **Optional** — if blank, falls back to the suggested category name, then "Expense"/"Income".       | `LogTransactionIntent.swift:117-120`; `payee: String?` `Transaction.kt:29`; not required by `TransactionValidator.kt` |
| **Status**   | Defaulted to **pending** for fast capture (clears later on reconcile).                             | `selectedStatus = .pending` `TransactionCreateViewModel.swift:51`                                                     |
| **Note**     | **Optional**, not shown in quick-add; available via "More details".                                | `note` `Transaction.kt:30`; `TransactionCreateView.swift:258-262`                                                     |

**Payee is optional in quick-add** (resolved decision, §8): the shared `TransactionValidator` does
**not** require it (`TransactionValidator.kt` only length-checks payee, `:64-68`), the model field is
nullable (`Transaction.kt:29`), and `LogTransactionIntent.makeTransaction` already establishes the
blank-payee → category-name fallback (`LogTransactionIntent.swift:117-120`). Requiring a text field
would force the system keyboard up and break the thumb-zone numeric flow, defeating "one-thumb." A
"More details" affordance promotes the entry into the full three-step
`TransactionCreateView`/`TransactionCreateViewModel` (payee, category picker, status, tags, mood,
note, date) without re-keying the amount.

### 3.4 The non-pointer path (VoiceOver / Switch Control) — never regress assistive tech

"One-thumb" is a pointer-ergonomics optimization; it must add zero cost for users who do not drive
the screen by touch position.

- **Logical focus order**, not spatial: type → amount → keypad (or numeric value) → account →
  Save / Save & add another. VoiceOver moves through this order regardless of where controls sit in
  the thumb arc.
- **Keypad is fully labeled** (`TransactionCreateView.swift:160-161`); additionally, VoiceOver and
  Switch Control users may enter the amount via the standard numeric value (the model accepts any
  integer-cents input, `TransactionCreateViewModel.swift:96-102`) — the custom keypad is an
  _accelerator_, never the _only_ way to set the amount.
- **Save & add another** announces success via a polite live region — the web counter analogue
  (`role="status" aria-live="polite"`, `QuickEntry.tsx:324`) — so a non-visual user hears
  _"Saved. 3 added."_ and focus returns to the amount, mirroring the web reset-and-refocus
  (`QuickEntry.tsx:230-232`). Use the established announcement pattern
  (`docs/design/accessibility-patterns.md`, polite live region) rather than moving focus abruptly.
- **Switch Control / Full Keyboard Access** reach every control because they are real focusable
  buttons (not gesture-only); there are **no** swipe-only or reachability-only actions in the
  critical path.
- **Dynamic Type** — the sheet reflows at large sizes per `docs/design/ios-dynamic-type-reflow.md`
  (§3 rules R1/R3/R6): the amount never truncates, the type/account rows collapse to vertical stacks
  at `dynamicTypeSize.isAccessibilitySize`, and no fixed-height container clips the keypad or the
  Save row. At accessibility sizes the bottom action row may wrap to two full-width rows rather than
  clip.

A saved quick-add transaction is then announced in lists by the transaction-row VoiceOver contract
(`docs/design/ios-transaction-row-voiceover.md`, #2117) — this doc does not redefine how a saved row
is read; it only produces a row that conforms to that contract.

## 4. Shared model & defaults (packages/core)

Quick-add composes **only** fields that exist on the shared model
(`packages/models/.../Transaction.kt:19-53`) and routes its save through the shared validator
(`packages/core/.../validation/TransactionValidator.kt`). The two pieces of logic that should live in
`packages/core` (so all platforms behave identically and are unit-testable today) are:

1. **Default-selection** — `lastUsedAccountId ?? firstAccount`, `lastUsedType ?? EXPENSE`,
   `date = today`, `status = PENDING`, `categoryId = suggest(payee) ?? null`. Web implements these
   ad hoc in the component (`QuickEntry.tsx:106-178`); iOS has them split across the view model and
   `LogTransactionIntent`. Promoting a single `QuickAddDefaults` resolver into `packages/core` is the
   smallest shared change and removes three divergent copies.
2. **Minimum-field / save rule** — amount non-zero **is the only blocking rule**; payee falls back to
   `categoryName → "Expense"/"Income"` (`LogTransactionIntent.swift:117-120`); category may be null.
   This mirrors `TransactionValidator.validate` (`TransactionValidator.kt:21-77`), which already
   blocks only on zero amount, unknown account, and (when provided) unknown category — **not** on a
   missing payee.

**Proposed shared shape (Kotlin, illustrative):**

```kotlin
// packages/core/.../quickadd — illustrative; not compiled with this doc.
data class QuickAddDefaults(
    val accountId: SyncId,                 // last-used ?? first
    val type: TransactionType,             // last-used ?? EXPENSE
    val date: LocalDate,                   // today
    val status: TransactionStatus,         // PENDING
    val suggestedCategoryId: SyncId?,      // categorization engine ?? null
)

// payee resolution shared by web QuickEntry, iOS quick-add, and LogTransactionIntent
fun resolveQuickAddPayee(raw: String?, categoryName: String?, type: TransactionType): String? =
    raw?.trim()?.takeIf { it.isNotEmpty() }
        ?: categoryName
        ?: null   // a null payee is valid; the row falls back to "Expense"/"Income" (#2117 §2)
```

The amount itself is `Cents` (`Transaction.kt:27`), entered as integer minor units by the cents-first
keypad (`amountCents`, `TransactionCreateViewModel.swift:62`), exactly as the web incremental input
produces `amountInput.cents` (`QuickEntry.tsx:209`,`:239`).

## 5. Surface application map

Every entry point routes into the **same** quick-add sheet and the same shared defaults (§4). The
quick-add sheet is an _additional_, friction-reduced surface — it does **not** remove the existing
three-step `TransactionCreateView`, which remains the "More details" target.

| Surface                      | iOS entry point (file:line)                                                                                                                   | What quick-add does                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Transactions toolbar `+`** | `TransactionsView.swift:73-94` (Menu: "Manual Entry" / "Quick Add (NLP)")                                                                     | Add a third item — **"Quick Add"** — that presents the one-thumb sheet; "Manual Entry" still opens the full form |
| **Quick-add sheet**          | new sheet beside `TransactionsView.swift:96-105` (`showingCreateTransaction`)                                                                 | Medium detent, amount focused, keypad up, Save / Save & add another in the bottom arc (§3)                       |
| **Empty state CTA**          | `TransactionsView.swift:32-38` ("Add your first transaction")                                                                                 | Route the CTA to quick-add for the fastest first capture                                                         |
| **Lock-screen / deep-link**  | `applyQuickEntry(action:)` `TransactionCreateViewModel.swift:204-224`; `deepLinkHandler.pendingQuickEntryAction` `TransactionsView.swift:103` | Already jumps to the amount step with payee/category pre-filled; re-target it to the quick-add sheet             |
| **App Intent / Shortcuts**   | `LogTransactionIntent.swift:31-98` (widgets, Spotlight, Shortcuts)                                                                            | Headless analogue: same defaults + blank-payee fallback (`:108-133`); no UI, but the same shared resolver        |

- **Type-direction icons** come from `TransactionTypeUI` (`TransactionItem.swift:25-47`:
  `.expense → arrow.up.right`/red, `.income → arrow.down.left`/green, `.transfer →
arrow.left.arrow.right`/blue) and the `IconToken` map in
  `apps/ios/Finance/Components/SFSymbolsMapping.swift:30-32`. The segmented control must convey
  direction by **label + icon**, never color alone (WCAG 1.4.1). _(Named for reference; this doc
  edits no Swift.)_
- **Transfer is out of scope for quick-add.** A transfer needs a destination account
  (`Transaction.kt:49-51`; `TransactionValidator.kt:44-54`), which is more than the minimum field
  set; quick-add offers expense/income only (parity with web Quick Add's two-way toggle,
  `QuickEntry.tsx:346-365`) and defers transfers to the full form.

## 6. State coverage (Dynamic Type, validation, empty, success, save-and-add-another, offline, error)

| State                   | Requirement                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Type**        | Amount readout, keypad keys, and the Save row use scalable text styles and never truncate (`docs/design/ios-dynamic-type-reflow.md` R1/R6). At `isAccessibilitySize` the type/account rows collapse to vertical stacks (R3) and the Save / Save & add another row wraps to two full-width buttons rather than clip.                                                   |
| **Validation (amount)** | Save is disabled while `amountCents == 0`; the existing rule `amountCents > 0` (`TransactionCreateViewModel.swift:81`,`:283-287`) gates it, paired with a non-color inline hint ("Enter an amount", mirroring web `"Enter a valid amount."` `QuickEntry.tsx:241`) and a `HapticManager.validationWarning()` on a blocked attempt (`TransactionCreateView.swift:325`). |
| **Empty**               | First-ever capture: the Transactions empty state (`TransactionsView.swift:32-38`) routes to quick-add; the account picker defaults to the first available account, so a brand-new user with one account types an amount and saves with no picker interaction.                                                                                                         |
| **Save success**        | On a successful single save the sheet dismisses and the list reloads (`TransactionsView.swift:96-99`), with `HapticManager.transactionSaved()` (`TransactionCreateView.swift:322`); VoiceOver hears a polite "Saved" announcement.                                                                                                                                    |
| **Save & add another**  | The sheet **stays open**, resets amount (and payee) but **keeps type + account** for rapid re-entry (web parity, `QuickEntry.tsx:223-233`), increments a polite live-region "N added" counter (`QuickEntry.tsx:288-289`,`:323-327`), and returns focus to the amount.                                                                                                 |
| **Offline**             | Saves are local-first: `createTransaction` persists to the local store and syncs later (`isSynced` defaults false, `Transaction.kt:41`); quick-add must succeed offline with no spinner-block, and the "N added" counter increments normally. No network state gates a quick-add save.                                                                                |
| **Error**               | A repository failure surfaces the existing validation alert (`validationMessage` / `showingValidationError`, `TransactionCreateViewModel.swift:274-278`; alert `TransactionCreateView.swift:47-51`) as a focusable, announced `role="alert"`-equivalent; the entered amount is **retained**, never silently dropped.                                                  |

## 7. Test plan

Smallest set required before a native quick-add implementation is accepted. The shared tests are
**runnable today** (not blocked by #1239); the gesture/reachability tests are native and deferred.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

Place beside existing model/validation tests
(`packages/core/src/commonTest/.../validation`, `packages/models/src/commonTest/.../TransactionTest`):

- **Default-selection** — `QuickAddDefaults` resolves account = last-used ?? first, type = last-used
  ?? `EXPENSE`, date = today (fixed-clock fixture), status = `PENDING`, category = `suggest(payee) ??
null` (parity with `QuickEntry.tsx:106-178`).
- **Minimum-field / save rule** — amount non-zero is the **only** blocking rule; assert a save with
  a valid amount, a defaulted account, and a **blank payee** is accepted (no error), matching
  `TransactionValidator.validate` (`TransactionValidator.kt:21-77`) which blocks only on zero amount /
  unknown account / unknown category.
- **Payee fallback** — `resolveQuickAddPayee(blank, categoryName, type)` → category name; with no
  category → null; with text → trimmed text (mirrors `LogTransactionIntent.swift:117-120`).
- **Amount model** — cents-first append/delete produces correct minor units and respects the
  `99_999_999` cap (parity between `appendAmountDigit` `TransactionCreateViewModel.swift:96-102` and
  web `useAmountInput` `QuickEntry.tsx:160`).
- **Sign by type** — expense stores a negative amount, income positive
  (`TransactionCreateViewModel.swift:252`; web `normalizeTransactionAmount` `QuickEntry.tsx:126-136`).
- **Validator integration** — the composed quick-add candidate passes `TransactionValidator` for a
  valid fixture and fails with the expected `ValidationError` for zero amount / unknown account.

**Native (iOS, deferred until #1239 unblocks):**

- **Thumb-zone layout** — snapshot test asserting Save, Save & add another, the keypad, and the
  amount readout all render within the bottom reachable arc at common device sizes.
- **Save & add another** — UI test: submit keeps the sheet open, resets the amount, keeps type +
  account, and increments the "N added" live region.
- **Non-pointer path** — VoiceOver focus order is type → amount → keypad/value → account → Save;
  every keypad key and both Save actions are reachable; Switch Control reaches all controls (no
  gesture-only critical path).
- **Custom keypad a11y** — each key exposes its digit label and the delete key its "Removes the last
  digit" hint (`TransactionCreateView.swift:160-161`); the amount is also settable via the standard
  numeric value.
- **Dynamic Type XXL/AX5** — amount never truncates; type/account rows stack; the Save row wraps,
  not clips (`docs/design/ios-dynamic-type-reflow.md` R1/R3/R6).
- **Offline save** — with the network disabled, a quick-add save succeeds locally and the counter
  increments.

## 8. Cross-references & resolved decisions

**Related work (do not duplicate its scope):**

- **#2113 (#2534, #2537)** — chart text-alternative pattern; the pilot whose structure this doc
  mirrors (`docs/design/ios-chart-accessibility.md`, PR #2834).
- **#2117 (#2544)** — transaction-row VoiceOver contract; how a **saved** quick-add row is announced
  (`docs/design/ios-transaction-row-voiceover.md`). Quick-add produces rows that conform to it; it
  does not redefine the row announcement.
- **#2119 (#2548)** — Dynamic Type reflow audit; the reflow rules the quick-add sheet must satisfy
  (`docs/design/ios-dynamic-type-reflow.md`).
- **Web reference contract** — `apps/web/src/components/forms/QuickEntry.tsx` (#319, minimal-friction
  Quick Add), `apps/web/src/components/forms/TransactionForm.tsx` (full form analogue).
- **Existing iOS infrastructure reused** — the #1486 cents-first keypad and `applyQuickEntry`
  fast-path (`TransactionCreateView.swift:142-164`, `TransactionCreateViewModel.swift:204-224`), and
  `LogTransactionIntent` defaults/fallback (`LogTransactionIntent.swift:108-133`).

**Resolved design decisions (in-session, 2026-06-20):**

1. **Payee is optional in one-thumb quick-add** — only the amount blocks a save. A blank payee falls
   back to the suggested category name, then "Expense"/"Income"
   (`LogTransactionIntent.swift:117-120`; nullable `payee` `Transaction.kt:29`; not required by
   `TransactionValidator.kt`). Requiring a text field would force the system keyboard and break the
   thumb-zone numeric flow. _(iOS deliberately diverges from web Quick Add, which requires a
   description — `QuickEntry.tsx:246-249` — because that web choice predates the one-thumb
   constraint; the shared validator sides with optional. Recommended default flagged to the
   orchestrator 2026-06-20; this section is updated if the maintainer decides otherwise.)_
2. **Custom cents-first keypad, not the system decimal keypad** — resolved by precedent: the app
   already ships the #1486 Venmo-style keypad (`TransactionCreateView.swift:142-164`) and the web
   uses the same incremental cents-first model (`QuickEntry.tsx:156-162`). A custom keypad keeps the
   digits in the thumb arc, needs no decimal point, and frees the bottom safe-area for the Save
   actions (§3.2). It is fully labeled for VoiceOver and is an accelerator, not the only input path.
3. **Category is optional and never blocks save** — auto-suggested from the payee via the
   categorization engine (`TransactionCreateViewModel.swift:195-200`) and left `null` ("Uncategorized")
   when there is no suggestion, matching the nullable schema field (`Transaction.kt:24`) and the web
   behavior (`QuickEntry.tsx:258-261`,`:280`). No "select a category" gate.
4. **Quick-add is additive, not a replacement** — the existing three-step `TransactionCreateView`
   remains the "More details" target for payee/category/status/tags/mood/note/date; quick-add adds a
   fast path and shares the same defaults and shared validator (§4, §5).
5. **Transfers are out of scope for quick-add** — a transfer requires a destination account
   (`Transaction.kt:49-51`; `TransactionValidator.kt:44-54`), beyond the minimum field set; quick-add
   is expense/income only and defers transfers to the full form (§5).

**Open dependency (flagged, not decided here):**

- The **payee-optional** decision (#1) is the one genuine product call; it was raised to the
  orchestrator with the recommended default baked in above. If the maintainer rules that quick-add
  must require a payee, only §3.3, §6 (validation), §7 (the blank-payee test), and decision #1 change
  — the rest of the flow is unaffected.
- Promoting the shared `QuickAddDefaults` / `resolveQuickAddPayee` helpers into `packages/core` (§4)
  is a small shared-code change that removes three divergent copies (web component, iOS view model,
  `LogTransactionIntent`); it is implementation work to be scheduled, not a design question.
