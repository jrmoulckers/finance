---
name: financial-modeling
description: >
  Financial calculation and modeling knowledge for budgeting, transaction
  processing, goal tracking, reporting, and data export. Use for topics related
  to money, budget, transaction, currency, financial calculation, balance, or
  accounting.
---

# Financial Modeling Skill

## Money Representation — The Golden Rule

**Never use floating-point for money.** All monetary values are `Long` cents.

```kotlin
// KMP value class (packages/models)
@JvmInline
value class Cents(val amount: Long) {
    operator fun plus(other: Cents) = Cents(amount + other.amount)
    operator fun minus(other: Cents) = Cents(amount - other.amount)
    fun toDollars(): String {
        val sign = if (amount < 0) "-" else ""
        return "$sign\$${abs(amount) / 100}.${(abs(amount) % 100).toString().padStart(2, '0')}"
    }
    companion object {
        fun fromDollars(d: Double) = Cents((d * 100).roundToLong())
        val ZERO = Cents(0L)
    }
}
```

```typescript
// Web helper (apps/web)
const cents = (dollars: number): number => Math.round(parseFloat(String(dollars)) * 100);
```

**Rules**:

- Store as `INTEGER`/`BIGINT` (cents) in SQLite and PostgreSQL
- Keep ISO 4217 currency code alongside every amount
- Convert to display only at the UI rendering layer
- Use `Cents` value class in KMP, `number` (cents) in TypeScript

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

```kotlin
// Time to goal at current savings rate
val monthlyRate = recentContributions.sum() / months
val remaining = goal.targetCents - goal.currentCents
val monthsToGoal = if (monthlyRate > 0) remaining / monthlyRate else Long.MAX_VALUE
```

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

- [ ] Rounding boundaries (e.g., `Cents(1)` + `Cents(1)` = `Cents(2)`, not 0.02 float)
- [ ] Negative amounts, zero values, high-value totals (`Long.MAX_VALUE` proximity)
- [ ] Serializer output: deterministic ordering, stable schemas
- [ ] Checksum generation with known fixtures
- [ ] Exported data never includes sync fields or raw user IDs
- [ ] Budget rollover carry-forward clamped to zero
- [ ] Goal status transitions are one-way (no `completed → active`)
