# iOS Transaction-Row VoiceOver Label Pattern — Finance

> **Status:** PROPOSED — design decisions resolved in-session 2026-06-20; pending human review & merge
> **Epic:** #2117 · **Closes:** #2544 · **Refs:** #2113 (sibling pilot), #1239 (native blocker)
> **WCAG Target:** 2.2 Level AA (AAA where practical)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI) — design-only

---

## Status & boundary note

Native Swift/SwiftUI implementation is **blocked by Apple Developer enrollment #1239**.
This document is a **design/breakdown deliverable only** — it specifies the pattern and the
per-surface application so that, once unblocked, a native implementation can proceed without
re-deriving the contract. **No Swift code ships with this doc**; the Swift fragments below are
illustrative shapes, not compiled source.

**Native/KMP boundary (applies to every surface below):**

- **Platform-neutral business rules** — the canonical transaction field set, the relative-date
  phrasing rules, status/type/recurring vocabulary, and privacy masking — live in
  `packages/core` / `packages/models` so every platform composes the same announcement from one
  source of truth.
- **Apple-framework integration** — `accessibilityElement`, `accessibilityLabel` /
  `accessibilityValue` composition, Dynamic Type layout, and rotor/custom-action wiring — live
  in `apps/ios` (planned; the row views named in §6 exist but their a11y labels are incomplete
  today — see §1).

This doc mirrors the structure resolved for sibling epic #2113 in
`docs/design/ios-chart-accessibility.md` (PR #2834): a status header, a native/KMP boundary
note, a shared-model section, a per-surface application map, a state-coverage table, and a test
plan that separates runnable-today shared `commonTest` work from native iOS tests deferred until
#1239.

---

## Table of Contents

1. [Why this pattern](#1-why-this-pattern)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [The grounded field set (shared model)](#3-the-grounded-field-set-shared-model)
4. [The iOS pattern: one coherent element](#4-the-ios-pattern-one-coherent-element)
5. [Status, transfer, recurring & split — conveyed non-visually](#5-status-transfer-recurring--split--conveyed-non-visually)
6. [Surface application map](#6-surface-application-map)
7. [State coverage](#7-state-coverage-dynamic-type-privacy-stale-error-empty)
8. [Test plan](#8-test-plan)
9. [Cross-references & resolved decisions](#9-cross-references--resolved-decisions)

---

## 1. Why this pattern

A transaction row encodes meaning across five visual fragments — an icon and tint for type
(`TransactionRowView.swift:16`), a payee line with a recurring glyph and a colored "Pending"
capsule (`TransactionRowView.swift:20-24`), a category·account caption
(`TransactionRowView.swift:25`), inline tag chips (`TransactionRowView.swift:27-29`), and a
right-aligned amount (`TransactionRowView.swift:32`). A VoiceOver user perceives none of the
color, position, or glyph cues. WCAG 2.2 AA (1.3.1 Info and Relationships, 1.4.1 Use of Color,
4.1.2 Name/Role/Value) requires an equivalent text announcement.

**Today's gap (the reason #2544 exists).** Every transaction surface collapses the row with
`.accessibilityElement(children: .combine)` and then **overrides** the merged label with a
hand-built string that includes only payee, category, and account:

```swift
// apps/ios/Finance/Components/TransactionRowView.swift:33-45 (current)
}.padding(.vertical, 2).accessibilityElement(children: .combine)
  .accessibilityLabel(accessibilityLabelText)            // payee, category, account[, tags]
  .accessibilityHint("Tap to view details. Swipe for more actions.")

private var accessibilityLabelText: String {
    var label = [transaction.payee, transaction.category, transaction.accountName]
        .joined(separator: ", ")
    // … tags only
    return label
}
```

Because the explicit `.accessibilityLabel` replaces what `.combine` would have produced, the
**amount is dropped** (the `CurrencyLabel` child is no longer voiced), the **status is dropped**
(the "Pending" capsule is purely visual — orange text on an orange tint), and the **date is
never present** (rows render no date `Text`; the date lives only in the section header). The same
incomplete pattern is duplicated in at least three more places —
`TransactionsView.swift:274-280`, `DashboardView.swift:215-244` (`recentTransactionsSection`),
and `AccountDetailView.swift:348` (`transactionRow`). A VoiceOver user hears
_"Whole Foods, Groceries, Checking"_ — not how much, not when, not whether it has cleared.

This doc defines the **single reusable announcement contract** that every transaction row adopts,
composed from the real shared model and the existing masking-aware formatter.

## 2. The cross-platform contract we are mirroring

The web app already presents the field set we must voice, and it is **privacy-aware**:

- **Identity / description fallback** —
  `apps/web/src/pages/TransactionsPage.tsx:176-182` `getTransactionLabel(transaction)` resolves
  the human-readable name as `payee → note → ("Transfer" | "Transaction")`. iOS must use the
  same precedence so a payee-less transfer is never announced as an empty string.
- **Row semantics** — each row is a single `role="listitem"`
  (`TransactionsPage.tsx:1189`), and every per-row control derives its accessible name from that
  one label (`aria-label={`View details for ${transactionLabel}`}` at
  `TransactionsPage.tsx:1220`, edit/delete at `:1246`/`:1254`). The row is one nameable unit, not
  five fragments — the same goal `.combine`/`.ignore` serves on iOS.
- **Privacy masking** — the canonical money path is
  `apps/web/src/lib/ui/privacy/masking.ts`: `MaskingMode` ∈ {`Visible`, `Bucketed`, `Percent`,
  `Dots`} (`masking.ts:11-16`), with `formatAmount` (`masking.ts:143-165`) and `formatRange`
  (`masking.ts:168-186`) returning the dot mask `•••` (`masking.ts:38`) in `Dots` mode.
  `privacyMode` toggles `Dots` vs `Visible` (`apps/web/src/lib/ui/privacy/state.ts:146`).

Crucially, **iOS already has the matching formatter**: `apps/ios/Shared/WidgetPrivacy.swift`
defines `WidgetMaskingMode` (`:6-11`) and `WidgetMoneyFormatter.formatAmount` / `formatRange`
(`:23-86`), a one-to-one mirror of the web masker (same `•••` mask, same bucket bounds, same
`Progress only` percent fallback). The transaction-row announcement must route its amount through
this formatter (or its app-target equivalent), **not** through `CurrencyLabel`'s current
`accessibilityDescription`, which is masking-_unaware_ (it always speaks the raw figure as
_"Income of $X" / "Expense of $X"_ — `CurrencyLabel.swift:78-89`).

## 3. The grounded field set (shared model)

The announcement is composed strictly from fields that exist on the shared transaction model —
`packages/models/src/commonMain/kotlin/com/finance/models/Transaction.kt:19-53`:

| Concept           | Shared field (`Transaction.kt`)                                           | iOS UI mirror (`TransactionItem.swift`)                                    | Used in announcement as          |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| Amount            | `amount: Cents` (`:27`), `currency` (`:28`)                               | `amountMinorUnits`, `currencyCode` (`:77-78`)                              | **value** (masking-aware, §4)    |
| Direction         | `type: TransactionType` EXPENSE/INCOME/TRANSFER (`:13`,`:25`)             | `type: TransactionTypeUI` (`:14-48`)                                       | sign + "Income/Expense/Transfer" |
| Date              | `date: LocalDate` (`:31`)                                                 | `date: Date` (`:79`)                                                       | relative + absolute (§4)         |
| Payee/description | `payee: String?` (`:29`), `note` (`:30`)                                  | `payee`, `notes` (`:74`,`:82`)                                             | identity (web precedence, §2)    |
| Category          | `categoryId: SyncId?` (`:24`)                                             | `category: String` (`:75`)                                                 | context                          |
| Account           | `accountId: SyncId` (`:23`)                                               | `accountName: String` (`:76`)                                              | context                          |
| Status            | `status: TransactionStatus` PENDING/CLEARED/RECONCILED/VOID (`:16`,`:26`) | `status: TransactionStatusUI` pending/cleared/reconciled/voided (`:53-64`) | status phrase (§5)               |
| Transfer link     | `transferAccountId` (`:32`), `transferTransactionId` (`:33`)              | (derived from `type == .transfer`)                                         | "Transfer to/from …" (§5)        |
| Recurring         | `isRecurring: Boolean` (`:34`), `recurringRuleId` (`:35`)                 | `isRecurring: Bool` (`:85`)                                                | "Recurring" qualifier (§5)       |
| Tags              | `tags: List<String>` (`:36`)                                              | `tags: [Tag]` (`:87`)                                                      | trailing, optional               |

**Status vocabulary is the real enum, not the colloquial set.** The model's status domain is
exactly `PENDING`, `CLEARED`, `RECONCILED`, `VOID` (`Transaction.kt:16`). The epic's informal
list ("pending / cleared / failed / scheduled / transfer") maps onto real concepts as follows —
this mapping is a **resolved decision** (§9), made to avoid inventing fields:

- **pending → `PENDING`**, **cleared → `CLEARED`**, plus **`RECONCILED`** (a distinct, real
  state the informal list omitted but VoiceOver must still announce).
- **failed → `VOID`** — there is no `FAILED` status; `VOID` is the nearest real analogue and is
  what the row must voice for a cancelled/voided transaction.
- **transfer → _not a status_** — it is `type == TRANSFER` (`Transaction.kt:13`,`:25`), announced
  as a direction/relationship qualifier (§5).
- **scheduled → _not a status_** — it is the recurring flag `isRecurring` / `recurringRuleId`
  (`Transaction.kt:34-35`), announced as a "Recurring" qualifier (§5).

**Split transactions are not modeled today.** The shared schema has no split/parent linkage
field (only `transferTransactionId` for transfer pairs and `recurringRuleId` for recurrence).
§5 specifies the intended split announcement, but it is **gated on a future schema addition** and
must not be implemented by inventing a field. This is called out as an open dependency in §9.

## 4. The iOS pattern: one coherent element

Every transaction row exposes **exactly one** accessibility element whose announcement is
composed deterministically from §3. Two sub-decisions define it.

### 4.1 Element grouping — `combine` vs explicit composition (described, not coded)

`.accessibilityElement(children: .combine)` merges descendant labels **in layout order** and then
lets an explicit `.accessibilityLabel` override the result. Today's code takes the override path
and loses the amount, status, and date (§1). Two correct options exist; this doc selects the
second:

- **`.combine` + no override** — VoiceOver concatenates child labels left-to-right. Rejected:
  it (a) speaks `CurrencyLabel`'s masking-_unaware_ description (`CurrencyLabel.swift:78-89`),
  (b) cannot inject the date (no date `Text` exists in the row), and (c) yields a brittle,
  layout-dependent word order.
- **`.accessibilityElement(children: .ignore)` + explicit `label` + `value`** — **selected.**
  The row ignores its visual children and the row view builds the announcement itself from the
  model, routing the amount through the masking-aware formatter (§2). Word order is controlled,
  the date is injected, and the masked/visible decision is made in exactly one place. This is the
  same "collapse to one element, compose the string from the shared model" approach the chart
  pattern uses (`ios-chart-accessibility.md` §3, Layer 1).

### 4.2 Label vs value split & composition order

Mirroring the chart pattern's label/value split (label = identity/context, value = the headline
figure):

```swift
// Illustrative shape — implementation deferred per #1239. Not compiled source.
row
  .accessibilityElement(children: .ignore)
  .accessibilityLabel(Text(rowA11y.label))   // identity + date + context + status/qualifiers
  .accessibilityValue(Text(rowA11y.value))   // masking-aware amount phrase
  .accessibilityHint(Text("Double-tap to view details. Actions available."))
  // plus .accessibilityCustomAction(…) for edit/delete/categorize swipe actions
```

- **`accessibilityLabel` — composition order (identity → when → where → state):**
  1. **Payee/description** — web precedence `payee → note → "Transfer"/"Transaction"`
     (§2; `TransactionsPage.tsx:176-182`).
  2. **Relative date**, then **absolute date** — e.g. _"Yesterday, June 19"_. Relative phrasing
     ("Today", "Yesterday", "Last Tuesday") is the primary cue with the absolute date appended
     for unambiguous reference. The relative/absolute rule is platform-neutral and belongs in
     `packages/core` so web, Android, and iOS phrase dates identically.
  3. **Category**, then **account** — context, matching the visual caption
     (`TransactionRowView.swift:25`).
  4. **Status & qualifiers** — status phrase (§5) and any recurring/transfer/split qualifier,
     spoken **last** so the headline (who/how-much/when) is heard first.
  5. **Tags** — trailing and optional, only when present (parity with today's tag suffix,
     `TransactionRowView.swift:40-43`).
- **`accessibilityValue` — the amount**, always routed through the masking-aware formatter so the
  value honors `Visible`/`Bucketed`/`Percent`/`Dots` (§2, §7). Direction colors the phrasing,
  not the color: _"Expense of $42.99"_, _"Income of $1,200.00"_, _"Transfer of $300.00"_ — never
  relying on red/green (`TransactionItem.swift:41-47`). When masked, the value is the dot mask
  `•••` (or a bucket/percent per mode) and the absolute figure is never spoken (§7).

**Why amount is `value`, not `label`:** keeping the figure in `accessibilityValue` (a) matches
the chart pattern's label/value contract, (b) lets the row read as _"&lt;what & when&gt;, value:
&lt;amount&gt;"_, and (c) leaves a natural slot for future inline-edit / adjustable semantics
without restructuring the label. It also localizes the single masking decision to one property.

**Worked example (visible):** _"Whole Foods, yesterday June 19, Groceries, Checking, pending.
Value: Expense of $42.99. Recurring."_
**Worked example (masked, `Dots`):** _"Whole Foods, yesterday June 19, Groceries, Checking,
pending. Value: •••. Recurring."_ — identity, date, and status remain; only the absolute figure
is suppressed (§7, consistent with #2834's masking decision).

## 5. Status, transfer, recurring & split — conveyed non-visually

Each visual-only signal in the row gets an explicit spoken equivalent. **None may rely on color
or glyph alone** (WCAG 1.4.1).

| Signal             | Visual today                                                                       | Spoken equivalent (in `accessibilityLabel`, §4.2 step 4)                                  |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Pending**        | Orange "Pending" capsule (`TransactionRowView.swift:23`)                           | "pending" (and `.accessibilityAddTraits` are not used to convey it — the word carries it) |
| **Cleared**        | _no visual badge_                                                                  | "cleared" — spoken even though silent visually, so status is never ambiguous              |
| **Reconciled**     | _no visual badge_                                                                  | "reconciled"                                                                              |
| **Void**           | _strikethrough / dimmed_                                                           | "void" (the resolved mapping for the epic's informal "failed", §3)                        |
| **Transfer**       | Blue transfer glyph + tint (`TransactionItem.swift:29`,`:45`)                      | "Transfer to &lt;account&gt;" / "Transfer from &lt;account&gt;" using the linked account  |
| **Recurring**      | Recurring glyph, `accessibilityLabel("Recurring")` (`TransactionRowView.swift:22`) | "Recurring" qualifier folded into the single row element (not a separate focus stop)      |
| **Split** (future) | _not modeled_                                                                      | "Split transaction, &lt;n&gt; parts" — **gated on a schema field**, see §3 & §9           |

Notes:

- **Transfer phrasing** uses direction. A transfer's sign and the `transferAccountId`
  (`Transaction.kt:32`) determine "to" vs "from"; the counterpart account name is spoken so the
  user knows both ends. When `payee` is null on a transfer, the description falls back to
  "Transfer" (web precedence, §2).
- **Recurring must not become a second element.** The standalone
  `IconView(.recurring).accessibilityLabel("Recurring")` (`TransactionRowView.swift:22`) is a
  separate a11y element today; under the `.ignore` + explicit-composition model (§4.1) it folds
  into the one row announcement so VoiceOver makes a single stop per row.
- **Split, when added,** announces the parent summary line ("Split transaction, 3 parts") with
  the individual splits exposed on the detail screen, not inline in the row — kept out of scope
  here beyond the spoken shape, pending the schema decision in §9.

## 6. Surface application map

Every surface that renders a transaction row adopts the §4 element and the §5 status vocabulary.
The first three already render rows with the incomplete label described in §1; the contract below
replaces each.

| Surface                       | iOS entry point (file:line)                                               | Row source today                     | What the announcement adds vs today                          |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| **Transaction list**          | `TransactionsView.swift:12` (date-grouped, `.searchable` `:47`)           | `transactionRow` + label `:274-280`  | amount (value), relative+absolute date, status, recurring    |
| **Account detail**            | `AccountDetailView.swift:56-58`, `transactionRow` `:348`                  | per-group `ForEach` rows             | same; account is implicit but still spoken for unambiguity   |
| **Dashboard recent-activity** | `DashboardView.swift:215-244` (`recentTransactionsSection`)               | `transactionRow(transaction)` `:237` | amount, date, status — currently only payee/category spoken  |
| **Search results**            | `TransactionsView.swift:40,47` (filtered list / `ContentUnavailableView`) | same rows as the list, filtered      | identical row contract; result count exposed via live region |

- **Search results** are the transaction list filtered by `viewModel.searchText`
  (`TransactionsView.swift:47`); rows reuse the **same** §4 element. The result count and the
  empty `ContentUnavailableView.search` (`TransactionsView.swift:40`) are announced via a polite
  live region (the established announcement pattern, `accessibility-patterns.md §3.2`), not by
  changing the per-row label.
- **Shared composer, not four copies.** Because the same incomplete label is duplicated across
  `TransactionRowView`, `TransactionsView`, `DashboardView`, and `AccountDetailView`, the
  string-building logic should live once — in `packages/core` (relative-date + status/qualifier
  vocabulary + masking-aware value) consumed via the KMP bridge — so all four surfaces stay in
  lockstep and the date/status rules are unit-tested in `commonTest` (§8).

## 7. State coverage (Dynamic Type, privacy, stale, error, empty)

| State            | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic Type** | Row text uses scalable text styles (already `.body`/`.caption` — `TransactionRowView.swift:21`,`:25`); the announcement is independent of truncation, so a visually clipped payee/amount is still spoken in full. At accessibility sizes the row must remain a single a11y element (no per-fragment focus stops) and honor `largeContentViewer` for the tappable row.                                                                                                                                                                                                      |
| **Privacy**      | The amount (`accessibilityValue`) is produced by the masking-aware formatter (`WidgetPrivacy.swift:23-86`), never `CurrencyLabel.accessibilityDescription` (which is masking-unaware, `CurrencyLabel.swift:78-89`). In `Dots` mode VoiceOver speaks `•••`; in `Bucketed` it speaks the range; in `Percent` it speaks "Progress only". **Inherited from #2834:** relative/trend phrasing and percentages may still be spoken while masked — but a transaction row carries no absolute figure when masked. Identity, date, category, account, and status are **not** masked. |
| **Stale**        | If the row's data is from a failed/late sync, prepend a non-color staleness cue to the label — "May be out of date." — paired with the on-screen indicator owned by #2121 (icon + text). Never convey staleness by dimming alone.                                                                                                                                                                                                                                                                                                                                          |
| **Error**        | A row that fails to load its amount/details exposes "Details unavailable" rather than a silent or zero amount, with the retry affordance as a labeled, focusable control. No row is left nameless.                                                                                                                                                                                                                                                                                                                                                                         |
| **Empty**        | The list/search empty states use `ContentUnavailableView` (`TransactionsView.swift:40`) and a polite live-region announcement of the count; no phantom rows are exposed to the a11y tree.                                                                                                                                                                                                                                                                                                                                                                                  |

## 8. Test plan

Smallest set required before a native implementation of this pattern is accepted. The shared
tests are **runnable today** (not blocked by #1239); the native tests are deferred.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

Place beside existing model/formatting tests
(`packages/models/src/commonTest/.../TransactionTest.kt`,
`packages/core/src/commonTest/.../currency`):

- **Description precedence** — `payee → note → "Transfer"/"Transaction"` matches web
  `getTransactionLabel` (`TransactionsPage.tsx:176-182`) for payee-present, note-only, and
  bare-transfer fixtures.
- **Relative + absolute date phrasing** — "Today", "Yesterday", and an older date each render
  relative-then-absolute; verify against fixed clock fixtures and locale.
- **Status vocabulary** — each of `PENDING/CLEARED/RECONCILED/VOID` (`Transaction.kt:16`) maps to
  the exact spoken token (including "void" for the epic's "failed", §3); transfer and recurring
  emit qualifiers, not statuses.
- **Masking-aware value** — for `Visible/Bucketed/Percent/Dots` the composed value matches the
  formatter output (`WidgetPrivacy.swift` / web `masking.ts:143-186`); in `Dots` the announcement
  contains **no** raw digits (parity with web `masking.test.ts`).
- **Qualifier composition** — recurring, transfer-to/from, and (when the schema lands) split
  produce the §5 phrasing in the correct order; tags are trailing and omitted when empty.

**Native (iOS, deferred until #1239 unblocks):**

- Snapshot/UI test: each surface in §6 exposes **exactly one** a11y element per row with the
  expected `accessibilityLabel` + `accessibilityValue` (no separate "Recurring" element, no
  dropped amount).
- VoiceOver order check: identity → date → category → account → status, value = amount.
- Masked mode: the a11y tree contains no raw amount on any row (`Dots`).
- Dynamic Type XXL: row stays one element; full payee/amount are spoken despite visual clipping.
- Swipe actions (edit/delete/categorize) are reachable as `accessibilityCustomAction`s rather
  than hidden gestures.

## 9. Cross-references & resolved decisions

**Related epics (do not duplicate their scope):**

- **#2113 (#2534, #2537)** — chart text-alternative pattern; the pilot whose structure and
  masking decision this doc mirrors (`docs/design/ios-chart-accessibility.md`, PR #2834).
- **#2121 (#2552, #2554)** — semantic non-color state cues (status/staleness icon + text);
  referenced for the visual side of the status and stale indicators (§5, §7).
- **Web reference contract** — `apps/web/src/pages/TransactionsPage.tsx` (row semantics,
  `getTransactionLabel`), `apps/web/src/lib/ui/privacy/masking.ts` (masking).
- **Existing iOS masking** — `apps/ios/Shared/WidgetPrivacy.swift` (`WidgetMoneyFormatter`),
  reused for the row's masking-aware value.

**Resolved design decisions (in-session, 2026-06-20):**

1. **One element, explicit composition** — rows use
   `.accessibilityElement(children: .ignore)` + explicit `accessibilityLabel`/`accessibilityValue`
   composed from the shared model, replacing today's `.combine` + override that drops amount,
   date, and status (§1, §4.1).
2. **Label/value split** — `accessibilityLabel` carries identity + relative/absolute date +
   category + account + status/qualifiers (in that order); `accessibilityValue` carries the
   masking-aware amount phrase (§4.2), mirroring the chart pattern.
3. **Status vocabulary is the real enum** — announce `Pending/Cleared/Reconciled/Void`
   (`Transaction.kt:16`); map the epic's informal "failed" → `Void`; treat **transfer** (type)
   and **scheduled/recurring** (`isRecurring`/`recurringRuleId`) as **qualifiers**, not statuses
   (§3, §5).
4. **Masking-aware value via the existing formatter** — the amount routes through
   `WidgetMoneyFormatter` semantics, never `CurrencyLabel`'s masking-unaware description; masked
   rows never speak the absolute figure, but identity/date/status remain (§7, inherited from
   #2834).
5. **Single shared composer** — the relative-date + status + masking logic lives once in
   `packages/core` and is consumed by all four surfaces (§6), so the four duplicated labels
   converge and are unit-tested in `commonTest` (§8).

**Open dependency (flagged, not decided here):**

- **Split-transaction announcement** depends on a shared-schema field that does not yet exist
  (only `transferTransactionId` and `recurringRuleId` are modeled — `Transaction.kt:32-35`). §5
  specifies the intended spoken shape ("Split transaction, &lt;n&gt; parts"); the field itself
  must be added by `@backend-engineer` + `@kmp-engineer` as a coordinated schema change before
  this part is implemented. Until then, split rows fall back to the standard §4 announcement.
