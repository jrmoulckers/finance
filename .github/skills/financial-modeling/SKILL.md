---
name: financial-modeling
description: >
  Financial calculation and modeling knowledge for budgeting, transaction
  processing, goal tracking, reporting, and data export. Use for topics related
  to money, budget, transaction, currency, financial calculation, balance, or
  accounting.
---

# Financial Modeling Skill

## Purpose

This skill covers **financial calculation and domain modeling** — money representation in cents, currency handling, budgeting models, transaction and recurring processing, goal tracking, net-worth/reporting, and data-export semantics. Sync transport, backend schema, and pricing live in the related skills below.

## Out of Scope

- Offline sync, mutation queues, and conflict resolution → use `edge-sync`.
- PostgreSQL schema, RLS, migrations, and Edge Functions → use `supabase-powersync`.
- Kotlin source-set layout, SQLDelight syntax, and Gradle targets → use `kmp-development`.
- Pricing tiers, IAP, and subscription entitlements → use `monetization`.

## Money Representation — The Golden Rule

**Never use floating-point for money.** Finance stores integer currency minor units in `Long`/`BIGINT`. The existing `Cents` name is a compatibility type name; its value means the currency's minor-unit quantity, which is not always two decimal places.

```kotlin
@JvmInline
value class Cents(val amount: Long)

data class Money(
    val cents: Cents,
    val currency: CurrencyCode,
)
```

**Rules**:

- Carry an ISO 4217 currency code and minor-unit scale with every amount; support zero- and three-decimal currencies.
- Addition/subtraction require the same currency and checked overflow.
- Multiplication, division, percentages, allocations, and decimal parsing use exact integer/rational operations with `HALF_EVEN` rounding at the declared boundary.
- Reconcile allocation remainders deterministically so distributed parts equal the original total.
- Store as `INTEGER`/`BIGINT` in SQLite/PostgreSQL and as `Long` in KMP. TypeScript may use integer `number` only while `Number.isSafeInteger` remains true.
- Convert to localized decimal display only at the UI boundary using the currency scale; never hardcode division by 100.
- Historical FX valuation uses the rate effective at the transaction timestamp and retains rate provenance. Missing/stale rates are explicit errors or domain states, never an implicit `1:1` conversion.

## AI-Powered Financial Engines

Five on-device engines in `packages/core/src/commonMain/kotlin/com/finance/core/`:

| Engine                         | Module            | Input                          | Output                                        |
| ------------------------------ | ----------------- | ------------------------------ | --------------------------------------------- |
| **SmartCategorizationEngine**  | `categorization/` | Transaction payee + history    | Predicted `Category`                          |
| **BalancePredictionEngine**    | `prediction/`     | Account transaction history    | Projected future balances (linear regression) |
| **SubscriptionDetector**       | `subscription/`   | Transaction list               | Detected recurring charges with frequency     |
| **SavingsEngine**              | `savings/`        | Spending history + categories  | Savings opportunities with estimated amounts  |
| **BudgetRecommendationEngine** | `recommendation/` | Income + spending distribution | Suggested per-category budget allocations     |

**Usage pattern**:

```kotlin
// All engines are pure Kotlin — no platform dependencies
val engine = SmartCategorizationEngine()
val category = engine.categorize(transaction, historicalTransactions)

val predictions = BalancePredictionEngine().predict(
    account, transactions, forecastDays = 30
)

val subscriptions = SubscriptionDetector().detect(transactions)
val savings = SavingsEngine().analyze(transactions, budgets)
val recommendations = BudgetRecommendationEngine().recommend(income, spending)
```

**Design rules**:

- All engines run on-device (edge-first, no server calls) — privacy advantage
- Extend via input data, not new standalone calculators
- Keep heuristics in `commonMain`; inject platform data sources via interfaces
- Check if an existing engine handles your use case before creating a new one

## Budget Modeling

### Rollover Logic

When `is_rollover = true` on a budget:

1. Compute carry-forward: `previous_budget_cents - previous_spent_cents`
2. Clamp to zero minimum (never carry negative overspend forward)
3. Add carry-forward to new period's available amount
4. Formula: `available = budget_cents + max(0, carry_forward) - current_spent`

All subtraction/addition is checked for overflow. Rollover policy must explicitly define negative carry behavior instead of relying on arithmetic truncation.

### Budget Periods

- `monthly`, `weekly`, `biweekly`, `yearly`
- Recalculate availability from: allocations + carry-over − spending

### Schema

```sql
-- packages/core SQLDelight
CREATE TABLE budget (
    id TEXT NOT NULL PRIMARY KEY,
    category_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,  -- Long (cents)
    is_rollover INTEGER NOT NULL DEFAULT 0,  -- Boolean
    period TEXT NOT NULL,
    ...
);
```

## Goal Tracking

### Status Lifecycle

```
active → completed  (when current_cents >= target_cents)
active → archived   (manual dismissal)
```

- Completed/archived goals excluded from active projections, retained for history
- When `account_id` is set → progress driven by account balance changes
- When `account_id` is null → tracks manual contributions only

### Projection

- Validate positive targets and periods before division.
- Use checked integer/rational calculations and `HALF_EVEN` rounding at the output boundary.
- Treat non-positive savings rates as unreachable/indeterminate; do not encode them as sentinel dates or `Long.MAX_VALUE`.
- Define overfunded progress and negative contributions explicitly rather than inheriting integer truncation behavior.

## Recurring Transactions

- Use `LocalDate` for calendar anchors and preserve the original anchor across short months and leap years.
- Support interval, count, end-date, skip-date, pause/resume, and positional-weekday semantics deterministically.
- Generate stable occurrence IDs so retries, devices, and sync replay remain idempotent.
- Test month-end anchors, February/leap years, timezone transitions, skipped dates, termination boundaries, and duplicate generation.

## Data Export Module

Located at `packages/core/src/commonMain/kotlin/com/finance/core/export/`:

| File                      | Purpose                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| `DataExportService.kt`    | Orchestrator (4 phases: GATHERING → SERIALIZING → CHECKSUM → COMPLETE) |
| `ExportSerializer.kt`     | Format contract                                                        |
| `JsonExportSerializer.kt` | JSON envelope with metadata                                            |
| `CsvExportSerializer.kt`  | Multi-section CSV                                                      |
| `ExportData.kt`           | Input container                                                        |
| `ExportTypes.kt`          | Result types (`ExportOutcome.Success`/`Failure`)                       |
| `Sha256.kt`               | Checksums + anonymized user IDs                                        |

**Export rules**:

- **Never** include `syncVersion` or `isSynced` in exported data
- Monetary values → decimal display string with currency code
- Dates → ISO 8601
- User IDs → anonymized via `sha256:<digest>`
- SHA-256 checksum computed for every export payload
- Callers must pre-filter soft-deleted records before constructing `ExportData`

## Reporting

- **Net worth** = assets − liabilities (sum account balances by type)
- **Spending analysis** = actuals vs. budget, pacing over time
- **Category breakdown** = spending grouped by category with period comparison
- Report primitives: `KpiMetrics`, `MonthlyComparison`, `NetWorthSnapshot`, `SpendingInsight` in `packages/core/.../analytics/`

## Testing Checklist

- [ ] `HALF_EVEN` boundaries for positive/negative ties and zero-, two-, and three-decimal currencies
- [ ] Negative amounts, zero values, high-value totals (`Long.MAX_VALUE` proximity)
- [ ] Checked overflow and deterministic allocation remainders
- [ ] Currency mismatch and historical FX-rate timestamp/provenance behavior
- [ ] Recurrence anchors, leap years, skips, pauses, termination, and idempotent IDs
- [ ] Serializer output: deterministic ordering, stable schemas
- [ ] Checksum generation with known fixtures
- [ ] Exported data never includes sync fields or raw user IDs
- [ ] Budget rollover carry-forward clamped to zero
- [ ] Goal status transitions are one-way (no `completed → active`)
