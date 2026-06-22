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
import kotlin.math.abs

@JvmInline
value class Cents(val amount: Long) {
    operator fun plus(other: Cents) = Cents(amount + other.amount)
    operator fun minus(other: Cents) = Cents(amount - other.amount)
    fun toDollars(): String {
        val sign = if (amount < 0) "-" else ""
        return "$sign\$${abs(amount) / 100}.${(abs(amount) % 100).toString().padStart(2, '0')}"
    }

    companion object {
        fun fromDecimalString(input: String): Cents {
            val trimmed = input.trim()
            require(trimmed.isNotEmpty()) { "Amount is required" }
            val negative = trimmed.startsWith("-")
            val unsigned = trimmed.removePrefix("+").removePrefix("-")
            val parts = unsigned.split('.', limit = 2)
            val wholeDigits = parts[0].ifEmpty { "0" }
            val fractionDigits = parts.getOrNull(1).orEmpty()
            require(wholeDigits.all(Char::isDigit) && fractionDigits.all(Char::isDigit)) {
                "Amount must be a decimal string"
            }

            val cents = wholeDigits.toLong() * 100 + fractionDigits.take(2).padEnd(2, '0').toLong()
            val thirdDigit = fractionDigits.getOrNull(2)?.digitToIntOrNull() ?: 0
            val hasNonZeroRemainder = fractionDigits.drop(3).any { it != '0' }
            val shouldRoundUp =
                thirdDigit > 5 || (thirdDigit == 5 && (hasNonZeroRemainder || cents % 2L == 1L))
            val rounded = cents + if (shouldRoundUp) 1L else 0L
            return Cents(if (negative) -rounded else rounded)
        }

        val ZERO = Cents(0L)
    }
}
```

```typescript
// Web helper (apps/web): parse decimal strings with integer math and banker's rounding.
export function centsFromDecimalString(input: string): number {
  const match = input.trim().match(/^([+-])?(\d*)(?:\.(\d*))?$/);
  if (!match || (!match[2] && !match[3])) throw new Error('Amount must be a decimal string');

  const [, sign = '', wholeRaw = '0', fractionRaw = ''] = match;
  const wholeCents = Number.parseInt(wholeRaw || '0', 10) * 100;
  const centsDigits = (fractionRaw.slice(0, 2) || '0').padEnd(2, '0');
  const baseCents = wholeCents + Number.parseInt(centsDigits, 10);
  const thirdDigit = Number.parseInt(fractionRaw[2] ?? '0', 10);
  const hasNonZeroRemainder = [...fractionRaw.slice(3)].some((digit) => digit !== '0');
  const shouldRoundUp =
    thirdDigit > 5 || (thirdDigit === 5 && (hasNonZeroRemainder || baseCents % 2 === 1));
  const rounded = baseCents + (shouldRoundUp ? 1 : 0);

  if (!Number.isSafeInteger(rounded)) throw new Error('Amount exceeds safe integer cents range');
  return sign === '-' ? -rounded : rounded;
}
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

- [ ] Rounding boundaries, including banker's rounding ties (e.g., `1.225` → `122` cents, `1.235` → `124` cents)
- [ ] Negative amounts, zero values, high-value totals (`Long.MAX_VALUE` proximity)
- [ ] Serializer output: deterministic ordering, stable schemas
- [ ] Checksum generation with known fixtures
- [ ] Exported data never includes sync fields or raw user IDs
- [ ] Budget rollover carry-forward clamped to zero
- [ ] Goal status transitions are one-way (no `completed → active`)
