# iOS Alert Center & Actionable Finance Alert Rules — Finance

> **Status:** PROPOSED — both design decisions maintainer-confirmed 2026-06-20; pending merge
> **Epic:** #2163 · **Closes:** #2595, #2597 · **Refs:** #1239 (native blocker)
> **WCAG Target:** 2.2 Level AA (AAA where practical)
> **Priority:** P1 (`priority:high`)
> **Last Updated:** 2026-06-20
> **Platforms:** iOS (SwiftUI / UserNotifications) — design-only

---

## Status & boundary note

Native Swift/SwiftUI/UserNotifications implementation is **blocked by Apple Developer enrollment
#1239**. This document is a **design/breakdown deliverable only** — it specifies the in-app alert
center, the platform-neutral alert-rule engine, and the deep-link routing so that, once unblocked,
a native implementation can proceed without re-deriving the contract. No Swift code ships with this
doc; the Swift fragments below are illustrative shapes, not compiled source.

This doc mirrors the structure resolved for sibling epic #2113 in
`docs/design/ios-chart-accessibility.md` (PR #2834): a status header, a native/KMP boundary note, a
shared-model section, a per-surface application map, a state-coverage table, and a test plan that
separates runnable-today shared `commonTest` work from native iOS tests deferred until #1239.

> **Scope distinction.** `docs/architecture/alerting-rules.md` is the **operational / infrastructure**
> alerting runbook (P0–P3 service-health alerts — health-check failures, sync-queue depth, RLS
> denials; lines 29–252). It is _not_ the user-facing system. This document defines **consumer
> finance alerts** (budget over-limit, low balance, bill due, goal milestone) surfaced inside the
> app. They share the word "alert" and nothing else; do not conflate them.

**Native/KMP boundary (applies to every rule and surface below):**

- **Platform-neutral business rules** — alert-rule _evaluation_ (which financial states cross which
  thresholds), severity assignment, dedup/rate-limit keys, quiet-hours suppression, and
  masking-aware summary phrasing — belong in `packages/core` / `packages/models` so **iOS, Android,
  Web, and Windows generate the exact same alerts from one source of truth**. The web app already
  proves the rule shapes in `apps/web/src/lib/notifications/` (§2); the gap today is that iOS
  re-derives them in Swift (`NotificationSchedulerService.generateSmartAlerts(...)`,
  `apps/ios/Finance/Services/NotificationSchedulerService.swift:36–40`), which will drift from web.
- **Apple-framework integration** — the alert-center SwiftUI views, `UNUserNotificationCenter`
  scheduling/permission, `.onOpenURL` deep-link handling, Dynamic Type layout, and VoiceOver
  semantics — live in `apps/ios`.

The shared rule engine in §4 is **proposed for `@native-app-engineer`** (it touches `packages/core`,
outside the iOS agent's ownership). This doc specifies the contract; it does not implement it.

---

## Table of Contents

1. [Why an alert center](#1-why-an-alert-center)
2. [The cross-platform contract we are mirroring](#2-the-cross-platform-contract-we-are-mirroring)
3. [The two halves of this epic](#3-the-two-halves-of-this-epic)
4. [Shared alert-rule engine (packages/core)](#4-shared-alert-rule-engine-packagescore)
5. [Alert rule catalog](#5-alert-rule-catalog-grounded-thresholds--deep-links)
6. [Surface application map](#6-surface-application-map-center-entry--deep-link-routing)
7. [State coverage](#7-state-coverage-empty-unread-stale-permission-error-dynamic-type-privacy)
8. [Test plan](#8-test-plan)
9. [Cross-references & resolved decisions](#9-cross-references--resolved-decisions)

---

## 1. Why an alert center

Notification preferences today are **scattered toggles**. On iOS the user configures alerts through
`NotificationSettingsView` (`apps/ios/Finance/Screens/NotificationSettingsView.swift`) and a
per-bill reminder flow, and smart alerts are computed ad-hoc inside an actor
(`NotificationSchedulerService.generateSmartAlerts(budgets:transactions:goals:)`,
`apps/ios/Finance/Services/NotificationSchedulerService.swift:36–40`). There is **no single place a
user can go to see "what does the app want to tell me about my money right now?"** — alerts fire as
transient system notifications and are then lost.

The web app already solved the _display_ half: a bell-with-dropdown
`NotificationCenter` (`apps/web/src/components/notifications/NotificationCenter.tsx:73`) showing an
unread count, a read/unread list, mark-as-read / mark-all / dismiss, and a per-item action callback
(lines 151–165). iOS has the _scheduling_ half but not the _center_.

This epic delivers both, natively and accessibly:

- **#2595** — an **in-app alert center**: a navigable, grouped, read/unread, screen-reader-friendly
  list that replaces the buried toggles as the home for finance alerts.
- **#2597** — **actionable alert rules + deep links**: the rule types that generate alerts, each
  carrying a deep-link to the surface that resolves it and optional inline actions.

The rule _evaluation_ is specified as shared `packages/core` logic so every platform's center shows
the same alerts; the iOS doc covers the center UI, the deep-link routing, and how rules map to
native `UNUserNotificationCenter` notifications.

## 2. The cross-platform contract we are mirroring

The web notification system is the reference implementation. iOS must produce the **same alert
model, the same thresholds, and the same severity vocabulary** — then express them through Apple
APIs instead of React + the DOM.

**The canonical alert model** (`apps/web/src/lib/notifications/types.ts`):

- `AlertType` union (lines 28–44) — 16 rule categories: `bill_due`, `budget_threshold`,
  `goal_milestone`, `goal_nudge`, `goal_streak`, `balance_low`, `balance_overdraft`,
  `spending_pace`, `predictive_overspend`, `transaction_confirmation`, `batch_confirmation`,
  `scam_check`, `spending_digest`, `subscription_price_change`, `warranty_deadline`,
  `return_window_deadline`.
- `NotificationSeverity` (line 25) — `'info' | 'success' | 'warning' | 'critical'`.
- `NotificationStatus` (line 50) — `'unread' | 'read' | 'dismissed'`.
- `AppNotification` (lines 57–80) — `id`, `type`, `severity`, `title`, `message`, `createdAt`,
  `status`, `entityId`, `entityType` (`'bill' | 'budget' | 'goal' | 'account' | 'transaction'`,
  line 75), `actionLabel`, `deduplicationKey`. **`entityType` + `entityId` are the deep-link
  payload** — the center builds a navigation target from them (§6).

**The rule evaluators** (`apps/web/src/lib/notifications/alert-engine.ts`) — these are the functions
the shared engine (§4) must mirror so iOS matches web exactly:

| Web evaluator (`alert-engine.ts`) | Line | Produces                    |
| --------------------------------- | ---- | --------------------------- |
| `evaluateBudgetThresholds(...)`   | 81   | `budget_threshold` alerts   |
| `evaluateGoalMilestones(...)`     | 203  | `goal_milestone` alerts     |
| `evaluateBalanceThreshold(...)`   | 298  | `balance_low` alerts        |
| `calculateSpendingPace(...)`      | 360  | `SpendingPace` model        |
| `evaluateSpendingPaceAlert(...)`  | 421  | `spending_pace` alerts      |
| `isInQuietHours(...)`             | 521  | suppression gate            |
| `shouldDeliverNotification(...)`  | 552  | channel/DND/quiet gate      |
| `rateLimitNotifications(...)`     | 591  | dedup by `deduplicationKey` |

**The delivery defaults** (`types.ts:325–342`, `DEFAULT_NOTIFICATION_PREFERENCES`): rule _classes_
are **on by default** with the `in_app` channel only (`DEFAULT_CHANNEL_PREFERENCES`, lines 301–316);
per-entity configs (`billReminders`, `balanceAlerts`) are **empty by default = opt-in per bill /
account** (lines 330, 336). iOS adopts this posture verbatim — it is the established product
decision, not a new one (see §9, decision 3).

iOS must render the **same `AppNotification` list** from the **same shared rules**, then express the
center through SwiftUI + VoiceOver and the per-alert deep link through `.onOpenURL`.

## 3. The two halves of this epic

### 3a. The alert center (#2595) — navigation & summary

A dedicated `AlertCenterView` (new; deferred per #1239) presents finance alerts as a grouped,
read/unread list. It is the iOS analogue of the web bell+dropdown
(`NotificationCenter.tsx`), but rendered as a **pushed full-screen list** rather than a popover, so
it reflows under Dynamic Type (§7) and supports VoiceOver list navigation.

Behaviors mirrored from the web center
(`NotificationCenter.tsx`): an **unread badge** on the entry point (`bellLabel`, line 165), tapping
an item **marks it read and fires its action** (`handleItemClick`, lines 151–161), **dismissed**
items are filtered from the list (line 163), and **mark-all-as-read** is available. Relative
timestamps use the same phrasing rules as `formatRelativeTime` (lines 44–60: "Just now", "5m ago",
"3h ago", "2d ago", then absolute date).

**Grouping & summary (resolved 2026-06-20, decision 4).** Alerts are grouped by **severity then
recency**: `critical` first, then `warning`, then `info`/`success`, newest within each band. The
center header shows a **one-line spoken summary** — e.g. _"3 alerts need attention: 1 critical, 2
warnings."_ — assembled by shared logic so it is identical across platforms and masking-aware (§7).
The summary is the `accessibilityLabel` of the header so VoiceOver announces the state on entry.

### 3b. Actionable rules + deep links (#2597)

Each alert is **actionable**: it carries a deep link to the surface that resolves it and, where a
one-tap resolution exists, an inline action. The `actionLabel` field already exists on the model
(`types.ts:77`). The deep-link target is derived from `entityType` + `entityId` (§6). Inline
actions are bounded, non-destructive, and never mutate financial data without confirmation (§5).

## 4. Shared alert-rule engine (packages/core)

> **Proposed for `@native-app-engineer`.** This namespace does not exist yet. iOS consumes it via the KMP
> bridge; it must not be re-implemented in Swift (the drift risk this epic exists to remove).

Add a platform-neutral `packages/core/.../alerts` namespace that evaluates financial state into a
list of shared `FinanceAlert` values. Each existing engine already computes the underlying
threshold; the new layer **maps those into alerts** rather than re-deriving them:

| Threshold source (existing shared code)                                                                   | Feeds rule                                   |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/core/.../budget/BudgetCalculator.kt:127–135` (`BudgetHealth`)                                   | `budget_threshold` (near / over)             |
| `packages/core/.../prediction/BalancePredictionEngine.kt:308` (`isNegativeProjection`)                    | `balance_overdraft` / `predictive_overspend` |
| `packages/core/.../recurring/BillReminderEngine.kt:37–60` (`scheduleNotifications`), `:143` (`isOverdue`) | `bill_due`                                   |
| `packages/core/.../savings/SavingsEngine.kt:103–104` (`increasePercent >= 20.0`)                          | large/unusual-spend (`spending_pace`)        |
| `packages/core/.../insights/InsightsEngine.kt:33–34` (`STABILITY_THRESHOLD_PERCENT = 5.0`)                | trend classification for digests             |
| `Goal` progress vs. elapsed time (no engine today — see §5, decision 2)                                   | `goal_milestone` / behind-pace               |

**Proposed shared type (Kotlin, illustrative):**

```kotlin
data class FinanceAlert(
    val id: String,
    val type: AlertType,              // mirror of web AlertType union (types.ts:28)
    val severity: AlertSeverity,      // Info, Success, Warning, Critical (types.ts:25)
    val title: String,                // non-shaming, masking-aware
    val message: String,              // masking-aware (no raw amount when balances hidden)
    val createdAt: Instant,
    val entityType: EntityType?,      // Bill, Budget, Goal, Account, Transaction (types.ts:75)
    val entityId: SyncId?,            // → deep-link target (§6)
    val actionLabel: String? = null,  // inline action, if any
    val deduplicationKey: String,     // rate-limit key (alert-engine.ts:591)
)
```

- `severity`, the dedup key, and quiet-hours/DND suppression MUST be produced by shared logic that
  mirrors `shouldDeliverNotification` (`alert-engine.ts:552`) and `rateLimitNotifications`
  (`:591`), so a budget-100% alert is `critical` on every platform and never double-fires.
- `title`/`message` MUST use the masking-aware formatter (the iOS `CurrencyLabel` /
  `MaskingMode` analogue) so VoiceOver and the notification banner never speak an absolute amount
  the user has hidden (§7, Privacy).
- The engine is **pure** (no I/O, no platform deps), exactly like `BillReminderEngine` ("All
  functions are pure and deterministic", `BillReminderEngine.kt:16–18`) and
  `BalancePredictionEngine` ("Pure commonMain — no platform dependencies",
  `BalancePredictionEngine.kt:17`). This is what makes rule evaluation **runnable-today in
  `commonTest`** (§8) even while the native UI is blocked.

**Feature-flag gating.** Add a flag to the registry following the existing pattern in
`packages/core/.../featureflags/FeatureFlags.kt` (e.g. `BUDGET_ROLLOVER =
FeatureFlagKey("budgets.rollover.enabled")`, line 16):

```kotlin
// proposed, FeatureFlags.kt
val ALERTS_CENTER = FeatureFlagKey("alerts.center.enabled")
```

The center entry point and rule scheduling are gated on this flag (default off until server
enables), consistent with how every other surface ships.

## 5. Alert rule catalog (grounded thresholds & deep-links)

Each rule is grounded in a **real threshold source** (no invented numbers). Thresholds reuse the
already-shipped web canon (`types.ts`) so all platforms agree (§9, decision 3). "Deep-link target"
is the §6 destination; "Inline action" is the optional one-tap resolution.

| #   | Rule (`AlertType`)                 | Trigger — grounded source                                                                                                                                    | Severity       | Deep-link target        | Inline action      |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------------- | ------------------ |
| 1   | `budget_threshold` (near limit)    | `BudgetHealth.WARNING` at 75–99% (`BudgetCalculator.kt:127–135`; web `BudgetThreshold` 75/90, `types.ts:87`)                                                 | warning        | Budget category (§6)    | "Adjust budget"    |
| 2   | `budget_threshold` (over budget)   | `isOverBudget` ≥ 100% (`BudgetCalculator.kt:46,125`; web threshold 100, `types.ts:87`)                                                                       | critical       | Budget category         | "Review spending"  |
| 3   | `balance_low`                      | Account balance < per-account `thresholdCents` (`BalanceAlertConfig`, `types.ts:128–137`; `evaluateBalanceThreshold` `alert-engine.ts:298`)                  | warning        | Account detail          | —                  |
| 4   | `balance_overdraft`                | `BalancePrediction.isNegativeProjection` (`BalancePredictionEngine.kt:308`)                                                                                  | critical       | Account detail          | "See forecast"     |
| 5   | `predictive_overspend`             | Projected month-end below threshold w/ `confidence ≥ MEDIUM` (`BalancePredictionEngine.kt:102–106,305`)                                                      | warning        | Account detail          | —                  |
| 6   | `bill_due`                         | `scheduleNotifications` at lead days 7/3/0 (`BillReminderEngine.kt:37–60`; `BillReminderLeadDays`, `types.ts:93`)                                            | info → warning | Bill detail             | "Mark paid"        |
| 7   | `bill_due` (overdue)               | `isOverdue = !isPaid && dueDate < today` (`BillReminderEngine.kt:143`)                                                                                       | critical       | Bill detail             | "Mark paid"        |
| 8   | `goal_milestone`                   | Progress crosses 25/50/75/100% (`GoalMilestone`, `types.ts:90`; `evaluateGoalMilestones` `alert-engine.ts:203`; iOS `GoalItem.progress` `GoalItem.swift:61`) | success        | Goal detail             | —                  |
| 9   | goal behind-pace (`goal_nudge`)    | Elapsed-time fraction − progress fraction > pace band (new shared calc; see decision 2)                                                                      | warning        | Goal detail             | "Add contribution" |
| 10  | `spending_pace` (unusual spend)    | Category spend ≥ 20% over 3-month avg (`SavingsEngine.kt:103–104`)                                                                                           | warning        | Transactions (filtered) | "Review"           |
| 11  | `transaction_confirmation` (large) | Amount ≥ `largeTransactionThresholdCents` (default 50 000¢; `types.ts:280,338`)                                                                              | info           | Transaction detail      | "Confirm" / "Flag" |

**Inline-action safety.** Actions that mutate data ("Mark paid", "Add contribution") open the target
surface with the action _pre-staged_ and require an explicit confirm on that surface — the center
never silently writes. Read-only actions ("See forecast", "Review") just deep-link. This keeps the
center safe for the financial-data trust boundary.

**Severity → presentation.** Severity is **never color-only** — it carries an SF Symbol + text per
the canonical vocabulary in `docs/design/ios-noncolor-state-cues.md` §4 (#2121): `critical`/`warning`
→ `exclamationmark.triangle` (`warning` token) + label; over-budget may add `arrow.up.forward`
(`trendUp`); a stale alert uses `clock.badge.exclamationmark` (`stale` token). The center reuses that
vocabulary rather than redefining it.

## 6. Surface application map (center entry & deep-link routing)

### 6a. Center entry point

iOS today has a **fixed 5-tab bar** — `dashboard, accounts, transactions, budgets, goals`
(`MainTabView.Tab`, `apps/ios/Finance/Navigation/MainTabView.swift:26–27`) — with **no Settings tab
and no notification surface in the nav**. Per decision 1 (§9), the alert center is reached via a
**toolbar "bell" button with an unread badge in the Dashboard navigation bar**, pushing
`AlertCenterView` onto the Dashboard's `NavigationStack`. This mirrors the web header bell
(`NotificationCenter.tsx:73`) and avoids consuming a sixth tab slot.

| Surface             | Entry                                           | Notes                                                              |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Alert center        | Bell button in Dashboard nav bar (unread badge) | Pushed full-screen `AlertCenterView`; not a popover (Dynamic Type) |
| Deep link to center | `finance://alerts` (new; §6b)                   | Opens the center from a tapped system notification                 |

### 6b. Per-alert deep-link routing

The deep-link router is `DeepLinkHandler` (`apps/ios/Finance/Navigation/DeepLinkHandler.swift`),
which parses Universal Links (`finance.app`, lines 73–76) and the custom scheme `finance://`
(line 79) into the `AppDeepLink` enum (lines 28–53) and drives navigation by setting
`selectedTab` + a pending entity id (`handle(_:)`, line 137; `consume*` methods, lines 234–268).

**The enum is missing the destinations these alerts need.** Today `AppDeepLink` supports
`account(id:)`, `transaction(id:)`, and `budgetCategory(id:)` (lines 37, 40, 49) — but **no goal,
bill, or alert-center route**, and the Goals tab has no deep-link target despite existing in the tab
bar. The following **additions are proposed** (parity with the web routes in
`apps/web/src/routes.tsx`):

| Alert `entityType`          | Proposed `AppDeepLink` case     | Proposed path constant          | Lands on tab / view                | Web route parity (`routes.tsx`) |
| --------------------------- | ------------------------------- | ------------------------------- | ---------------------------------- | ------------------------------- |
| `budget` (rules 1–2)        | `budgetCategory(id:)` ✅ exists | `/budget/category/{id}` (`:89`) | `.budgets` (`:204`)                | `/budgets/:id` (`:325`)         |
| `account` (rules 3–5)       | `account(id:)` ✅ exists        | `/account/{id}` (`:85`)         | `.accounts` (`:166`)               | `/accounts/:id` (`:277`)        |
| `transaction` (rules 10–11) | `transaction(id:)` ✅ exists    | `/transaction/{id}` (`:86`)     | `.transactions` (`:178`)           | `/transactions/:id` (`:297`)    |
| `bill` (rules 6–7)          | **`bill(id:)` — NEW**           | **`/bill/{id}`**                | **needs Bills surface** (no tab)   | `/bills/:id` (`:563`)           |
| `goal` (rules 8–9)          | **`goal(id:)` — NEW**           | **`/goal/{id}`**                | `.goals` (exists, no route today)  | `/goals/:id` (`:355`)           |
| center (system notif tap)   | **`alertCenter` — NEW**         | **`/alerts`**                   | Dashboard → push `AlertCenterView` | (web: header bell)              |

> **Bills gap (flagged for `@architect` / `@native-app-engineer`).** Web has full `/bills`, `/bills/:id`,
> `/bills/new` routes (`routes.tsx:543–563`) but iOS has **no Bills tab and no bill detail surface**
> in `MainTabView`. A `bill_due` deep link therefore has nowhere to land today. The minimum to make
> rules 6–7 actionable is a bill-detail surface reachable from the deep link; until it exists, the
> `bill(id:)` link should fall back to the Dashboard. This is a prerequisite, noted here, not solved
> in this doc.

Each new case follows the existing parse + `consume*` pattern (e.g. `consumeBudgetCategoryNavigation`,
`DeepLinkHandler.swift:265–268`): set the pending id, switch `selectedTab`, let the destination view
observe and clear it.

### 6c. Rule → native notification mapping

When the app is backgrounded, shared rules also schedule **system notifications** via the existing
actor `NotificationSchedulerService` (`apps/ios/Finance/Services/NotificationSchedulerService.swift`):
`requestPermission()` (line 21) gates delivery; `scheduleNotification(_:)` (line 27) registers with
`UNUserNotificationCenter` (line 58). The notification's tap action carries the alert's deep link
(§6b) so tapping a banner opens the resolving surface. The **rule evaluation moves to `packages/core`
(§4)**; `generateSmartAlerts(...)` (lines 36–40) becomes a thin adapter that maps shared
`FinanceAlert`s into `UNNotificationRequest`s instead of computing thresholds in Swift.

## 7. State coverage (empty, unread, stale, permission, error, Dynamic Type, privacy)

| State                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty / all-read**  | When there are zero non-dismissed alerts, the center shows an on-screen empty state ("You're all caught up.") and the entry-point bell shows **no badge**; the header summary reads "No alerts." VoiceOver announces the empty state, not silence.                                                                                                                                                                          |
| **Unread badge**      | The bell exposes the unread count via an accessibility label, mirroring web `bellLabel` ("Notifications, N unread", `NotificationCenter.tsx:165`). The badge is **count + label**, never color-only (a red dot alone fails 1.4.1, per #2121).                                                                                                                                                                               |
| **Stale**             | If alert inputs are from a failed/late sync, the affected alert is prefixed "Data may be out of date as of <time>." and shows the **non-color staleness cue** (`clock.badge.exclamationmark`, `stale` token) per `docs/design/ios-noncolor-state-cues.md` §4 (#2121).                                                                                                                                                       |
| **Permission-denied** | If the user denied `UNUserNotificationCenter` permission (`authorizationStatus()`, `NotificationSchedulerService.swift:24`), the **in-app center still works** (it does not need OS permission); a dismissible banner explains that _system_ banners are off and links to Settings. The center never becomes inert because OS notifications are denied.                                                                     |
| **Error**             | If rule evaluation fails to load inputs, the center exposes "Unable to load alerts." with a labeled, focusable **Retry** button — no silent empty list.                                                                                                                                                                                                                                                                     |
| **Dynamic Type**      | The center list and per-alert rows reflow to stacked layouts at accessibility sizes (AX1–AX5) with no truncated amounts, per `docs/design/ios-dynamic-type-reflow.md` (#2119). It is a pushed full-screen list (not a popover) **specifically so it can reflow**.                                                                                                                                                           |
| **Privacy (masking)** | When balances are masked, alert `title`/`message`, the header summary, and any amount use the masking-aware formatter; VoiceOver and system banners never speak an absolute amount the UI hides. Relative/threshold phrasing ("over budget", "75% used", "behind pace") **is** spoken — parity with the chart-masking decision in `docs/design/ios-chart-accessibility.md` §6 (a percentage discloses no absolute balance). |
| **VoiceOver row**     | Each alert row is a single coherent element announcing severity + title + relative time + action, following the announcement composition in `docs/design/ios-transaction-row-voiceover.md` (#2117). Inline actions are exposed as accessibility custom actions, not separate swipe-only affordances.                                                                                                                        |

## 8. Test plan

The rule-evaluation / threshold logic is the **prime runnable-today target**: it is pure
`commonMain` (§4), so it can be fully tested in `commonTest` now, independent of the #1239 native
block.

**Shared (KMP `commonTest`, runnable today — not blocked by #1239):**

- `FinanceAlert` rule evaluation, one fixture per rule in §5:
  - budget near-limit fires at 75% and not at 74%; over-budget at 100% → `critical`
    (parity with `BudgetCalculator.kt:127–135`).
  - `balance_overdraft` fires when `isNegativeProjection` is true
    (`BalancePredictionEngine.kt:308`); `predictive_overspend` requires `confidence ≥ MEDIUM`.
  - `bill_due` fires at lead days 7/3/0 and `bill_due` overdue when `dueDate < today`
    (`BillReminderEngine.kt:143`).
  - `goal_milestone` fires once per 25/50/75/100 crossing (no duplicate on re-eval).
  - goal behind-pace fires when the elapsed−progress gap exceeds the medium band (decision 2);
    does **not** fire for an on-pace goal.
  - large-transaction fires at ≥ `largeTransactionThresholdCents` and respects per-account
    overrides (`types.ts:280,338,140–145`).
- Severity assignment, `deduplicationKey` stability, quiet-hours/DND suppression — mirror
  `shouldDeliverNotification` / `rateLimitNotifications` (`alert-engine.ts:552,591`) and assert
  parity with the web suite (`apps/web/src/lib/notifications/alert-engine.test.ts`).
- Masking-aware phrasing: masked mode emits no raw amount in `title`/`message`.
- Header summary string generation (counts by severity) for empty / mixed fixtures.
- Place beside existing `packages/core/src/commonTest/.../` engine tests.

**Native (iOS, deferred until #1239 unblocks):**

- `AlertCenterView` snapshot: grouped by severity, unread styling, empty state, error state.
- Deep-link routing: each new `AppDeepLink` case (`bill`, `goal`, `alertCenter`) parses from both
  Universal Link and `finance://` forms and sets the correct `selectedTab` + pending id
  (extend `DeepLinkHandlerTests`).
- Tapping a row marks it read and triggers its action (parity with `handleItemClick`,
  `NotificationCenter.tsx:151–161`).
- Permission-denied: center still renders; banner appears; in-app alerts unaffected.
- Dynamic Type AX5: list reflows with no clipped amounts (#2119).
- Masked-balances mode: no raw amount in the accessibility tree or notification banner.

## 9. Cross-references & resolved decisions

**Related docs (do not duplicate their scope):**

- `docs/design/ios-chart-accessibility.md` (#2113, PR #2834) — the structural pilot; this doc mirrors
  its layout and reuses its masking-aware summary principle.
- `docs/design/ios-noncolor-state-cues.md` (#2121) — **canonical** non-color cue vocabulary; this doc
  defers to its §4 for every severity / trend / stale icon+text pairing.
- `docs/design/ios-dynamic-type-reflow.md` (#2119) — list reflow contract for the center.
- `docs/design/ios-transaction-row-voiceover.md` (#2117) — row announcement composition for alert rows.
- Web reference contract: `apps/web/src/lib/notifications/types.ts`,
  `apps/web/src/lib/notifications/alert-engine.ts`,
  `apps/web/src/components/notifications/NotificationCenter.tsx`.
- `docs/architecture/alerting-rules.md` — **operational** alerting (P0–P3 infra); explicitly _not_
  this system (see boundary note).

**Resolved design decisions (maintainer-confirmed, 2026-06-20):**

1. **Center entry point** — a toolbar bell button (unread badge) in the Dashboard nav bar pushing a
   full-screen `AlertCenterView`, mirroring the web header bell, rather than consuming a sixth tab
   slot (iOS has a fixed 5-tab bar, `MainTabView.swift:26–27`). Full-screen (not popover) so it
   reflows under Dynamic Type (§6a, §7). _Considered and rejected:_ adding a sixth "Alerts" tab to
   `MainTabView` — rejected because the 5-tab bar is already at the iOS comfortable limit, a sixth tab
   crowds smaller devices and demotes a primary surface, and the web reference uses a header bell
   (`NotificationCenter.tsx`) so the bell keeps cross-platform parity. The toolbar bell is therefore
   preferred over the tab.
2. **Goal behind-pace definition** — no goal-pace engine exists in `packages/core` or iOS today
   (`GoalItem.swift` only computes `progress`, line 61). The new shared rule defines "behind pace"
   as: the elapsed-time fraction of `(targetDate − createdAt)` exceeds the progress fraction by more
   than the `paceSensitivity` band (medium = 10 percentage points), modelled on the budget
   `SpendingPace` shape (`types.ts:152–185`). Proposed for `@native-app-engineer` (§4, §5 rule 9).
3. **Thresholds & opt-in posture = web parity, not new invention** — budget 50/75/90/100
   (`types.ts:87`), goal 25/50/75/100 (`:90`), bill lead days 7/3/0 (`:93`), large-transaction
   50 000¢ (`:280,338`). Rule classes on-by-default in-app; per-entity bill/balance configs opt-in
   (`DEFAULT_NOTIFICATION_PREFERENCES`, `:325–342`). Reusing the shipped web canon is what keeps the
   four platforms in agreement.
4. **Grouping & summary** — alerts grouped by severity (critical → warning → info/success) then
   recency; the center header carries a masking-aware one-line summary that is also its VoiceOver
   label (§3a, §7).
5. **Rule evaluation is shared, not per-platform** — the engine lives in `packages/core` (§4);
   `NotificationSchedulerService.generateSmartAlerts(...)` (`:36–40`) becomes a thin adapter, removing
   the web/iOS drift that motivated this epic.

**Open items flagged for humans / other agents (not guessed):**

- **Bills surface gap** — iOS has no Bills tab or bill-detail view; `bill(id:)` deep links have
  nowhere to land. Prerequisite for rules 6–7 (§6b). For `@architect` / `@native-app-engineer`.
- **`packages/core` alert engine** — §4 is proposed-for-`@native-app-engineer`; this iOS doc specifies the
  contract but does not implement `packages/*` code.
