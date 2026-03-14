# Models

Shared data models, value types, and database schemas for the Finance app.

## Overview

`packages/models` defines every domain entity, type-safe value classes, SQLDelight schemas, and database migration infrastructure. It has no dependencies on other Finance packages — both `packages/core` and `packages/sync` depend on it. All models use `kotlinx-serialization` for serialization and `kotlinx-datetime` for temporal values.

This is a Kotlin Multiplatform (KMP) library with SQLDelight generating the `FinanceDatabase` in package `com.finance.db`.

## Key Components

### Domain Models (`com.finance.models`)

| File                                            | Description                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `Transaction.kt`                                | Expense, income, and transfer records with status tracking and recurring support |
| `Account.kt`                                    | Bank accounts, credit cards, loans, etc.                                         |
| `Budget.kt`                                     | Budget definitions with period and amount                                        |
| `Category.kt`                                   | Transaction categories                                                           |
| `Goal.kt`                                       | Savings goals                                                                    |
| `User.kt`, `Household.kt`, `HouseholdMember.kt` | Multi-user household model                                                       |

### Value Types (`com.finance.models.types`)

| Type       | Description                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `Cents`    | `@JvmInline value class` wrapping `Long` — overflow-safe arithmetic operators, `fromDollars()` conversion |
| `Currency` | ISO 4217 currency code with minor-unit decimal places (e.g., `JPY` → 0, `USD` → 2, `BHD` → 3)             |
| `SyncId`   | Opaque UUID wrapper for type-safe entity identification                                                   |

### Database (`com.finance.db`)

- **SQLDelight schemas** (`.sq` files): `Account.sq`, `Transaction.sq`, `Budget.sq`, `Category.sq`, `Goal.sq`, `User.sq`, `Household.sq`, `HouseholdMember.sq`
- **`DatabaseFactory`**: `expect`/`actual` factory for creating encrypted (SQLCipher) database instances per platform
- **`EncryptionKeyProvider`**: Platform-specific secure key retrieval
- **Migrations** (`com.finance.db.migration`): Versioned `Migration` data class with up/down SQL, `MigrationExecutor`, and `MigrationRegistry`

## Usage

Add the dependency in `build.gradle.kts`:

```kotlin
commonMain.dependencies {
    implementation(project(":packages:models"))
}
```

```kotlin
import com.finance.models.Transaction
import com.finance.models.types.Cents
import com.finance.models.types.Currency

val amount = Cents.fromDollars(42.50)
val usd = Currency.USD
```

## Development

```bash
# Build (generates SQLDelight code)
node tools/gradle.js :packages:models:build

# Run tests
node tools/gradle.js :packages:models:allTests
```

After modifying `.sq` files, rebuild to regenerate the database code. New schema changes should include a corresponding migration in `com.finance.db.migration.migrations`.
