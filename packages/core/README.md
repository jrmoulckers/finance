# Core

Platform-agnostic business logic for the Finance app.

## Overview

`packages/core` contains all financial calculations, budgeting logic, categorization, aggregation, and validation. It depends on `packages/models` for data types and is consumed by every platform app. All monetary arithmetic uses `Long`-based `Cents` to avoid floating-point precision errors.

This is a Kotlin Multiplatform (KMP) library targeting `commonMain`, `iosMain`, `jvmMain`, and `jsMain`.

## Key Components

| Module           | File                                                              | Purpose                                                                                                         |
| ---------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `money`          | `MoneyOperations.kt`                                              | Banker's rounding, allocation (equal splits, ratio-weighted), percentage and division with financial precision  |
| `budget`         | `BudgetCalculator.kt`                                             | Budget utilization, period boundaries (weekly through yearly), remaining amount, daily spending rate            |
| `categorization` | `CategorizationEngine.kt`                                         | Rule-based transaction categorization — exact, contains, and starts-with matching with learning from history    |
| `aggregation`    | `FinancialAggregator.kt`                                          | Net worth, total spending/income, cash flow, spending-by-category, daily/monthly trends, savings rate           |
| `validation`     | `TransactionValidator.kt`                                         | Pre-persist validation — checks amounts, account/category existence, transfer rules, date bounds, field lengths |
| `currency`       | `CurrencyConverter.kt`, `CurrencyFormatter.kt`, `ExchangeRate.kt` | Multi-currency conversion and display formatting                                                                |
| `events`         | `DomainEvent.kt`, `EventBus.kt`                                   | Sealed domain event hierarchy (transaction, budget, account, goal events) with coroutine-based `SharedFlow` bus |

## Usage

Add the dependency in another package or app `build.gradle.kts`:

```kotlin
commonMain.dependencies {
    implementation(project(":packages:core"))
}
```

Then import and use:

```kotlin
import com.finance.core.money.MoneyOperations
import com.finance.core.budget.BudgetCalculator
import com.finance.core.aggregation.FinancialAggregator

val parts = MoneyOperations.allocate(Cents(1000), 3) // [$3.34, $3.33, $3.33]
val status = BudgetCalculator.calculateStatus(budget, transactions, today)
val netWorth = FinancialAggregator.netWorth(accounts)
```

## Development

```bash
# Build this package
node tools/gradle.js :packages:core:build

# Run tests (all KMP targets)
node tools/gradle.js :packages:core:allTests
```

Tests use `kotlin.test`, `kotlinx-coroutines-test`, and [Turbine](https://github.com/cashapp/turbine) for Flow testing.
