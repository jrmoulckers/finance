---
name: kmp-development
description: >
  Kotlin Multiplatform project structure, configuration, and development
  patterns for the Finance monorepo. Use for topics related to KMP, Kotlin,
  multiplatform, commonMain, expect actual, SQLDelight, Ktor, Gradle, or
  shared code.
---

# KMP Development Skill

This skill provides domain knowledge for building and maintaining the Kotlin Multiplatform modules in the Finance monorepo.

## KMP Project Structure

Use the checked-in package layouts rather than generic KMP source-set examples.

```
packages/core/src/
├── commonMain
├── commonTest
├── iosMain
├── jsMain
└── jvmMain

packages/models/src/
├── androidMain
├── commonMain
├── commonTest
├── iosMain
├── jsMain
└── jvmMain

packages/sync/src/
├── androidMain
├── commonMain
├── commonTest
├── iosMain
├── jsMain
├── jsTest
└── jvmMain
```

### Source-Set Notes

- `commonMain` stays platform-neutral: no `java.*`, `android.*`, or Apple framework imports.
- `packages/core` currently has no checked-in `src/androidMain` directory, although `packages/core/build.gradle.kts` conditionally adds `androidMain` dependencies when the Android SDK is available.
- `packages/models` and `packages/sync` both carry Android-specific code under `androidMain`.
- `jsMain` in the shared packages is for browser-safe shared Kotlin code, not the primary web UI. `apps/web/` is currently TypeScript + React.
- There is no checked-in `wasmJsMain` target today.

## Gradle Configuration Patterns

### Version Catalogs

Dependency versions remain centralized in `gradle/libs.versions.toml`.

### Composite Builds

The monorepo currently includes the shared packages, the Windows app, and the Android app when the SDK is available:

```kotlin
// settings.gradle.kts
includeBuild("build-logic")
include(":packages:core")
include(":packages:models")
include(":packages:sync")
include(":apps:windows")

if (androidSdkAvailable) {
    include(":apps:android")
}
```

### Convention Plugins

Reusable build configuration lives in `build-logic/src/main/kotlin/finance.kmp.library.gradle.kts`:

```kotlin
plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("org.jetbrains.kotlinx.kover")
}

val androidSdkAvailable = ...
project.extra["androidSdkAvailable"] = androidSdkAvailable

kotlin {
    jvmToolchain(21)
    jvm()
    if (androidSdkAvailable) {
        androidTarget()
    }
    iosArm64()
    iosSimulatorArm64()
    iosX64()
    js(IR) {
        browser()
    }
    applyDefaultHierarchyTemplate()
}
```

Current implications:

- All shared packages apply `id("finance.kmp.library")`.
- Android targets are enabled only when the SDK is available via environment variables or `local.properties`.
- The current convention plugin does **not** configure `nodejs()` or `wasmJs()`.
- Package build files add their own source-set dependencies on top of the shared convention.

## Expect/Actual Declaration Patterns

Use `expect`/`actual` to abstract platform-specific APIs behind a common interface.

### Example: UUID Generation

```kotlin
// commonMain
expect fun randomUUID(): String

// androidMain
import java.util.UUID
actual fun randomUUID(): String = UUID.randomUUID().toString()

// iosMain
import platform.Foundation.NSUUID
actual fun randomUUID(): String = NSUUID().UUIDString()

// jvmMain
import java.util.UUID
actual fun randomUUID(): String = UUID.randomUUID().toString()

// jsMain
actual fun randomUUID(): String = js("crypto.randomUUID()") as String
```

### Example: Platform Logger

```kotlin
// commonMain
expect class PlatformLogger() {
    fun debug(tag: String, message: String)
    fun error(tag: String, message: String, throwable: Throwable? = null)
}

// androidMain
actual class PlatformLogger actual constructor() {
    actual fun debug(tag: String, message: String) {
        android.util.Log.d(tag, message)
    }
    actual fun error(tag: String, message: String, throwable: Throwable?) {
        android.util.Log.e(tag, message, throwable)
    }
}

// iosMain
actual class PlatformLogger actual constructor() {
    actual fun debug(tag: String, message: String) {
        platform.Foundation.NSLog("DEBUG [$tag]: $message")
    }
    actual fun error(tag: String, message: String, throwable: Throwable?) {
        platform.Foundation.NSLog("ERROR [$tag]: $message ${throwable?.message.orEmpty()}")
    }
}
```

### Best Practices for expect/actual

- Keep `expect` declarations **minimal** — prefer interfaces and dependency injection over expect/actual when possible.
- Use `expect`/`actual` for **platform primitives** (file I/O, crypto, logging, database drivers).
- Never put business logic in `actual` implementations; keep it in `commonMain`.

## SQLDelight Setup

### Directory Layout

```
packages/core/
├── build.gradle.kts
└── src/
    └── commonMain/
        └── sqldelight/
            └── finance/
                └── db/
                    ├── Account.sq
                    ├── Transaction.sq
                    ├── Budget.sq
                    ├── Goal.sq
                    └── migrations/
                        ├── 1.sqm
                        ├── 2.sqm
                        └── 3.sqm
```

### Gradle Configuration

```kotlin
sqldelight {
    databases {
        create("FinanceDatabase") {
            packageName.set("dev.finance.db")
            schemaOutputDirectory.set(file("src/commonMain/sqldelight/databases"))
            verifyMigrations.set(true)
        }
    }
}
```

### Example .sq File

```sql
-- Account.sq

CREATE TABLE account (
    id         TEXT NOT NULL PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL,        -- "checking", "savings", "credit"
    balance    INTEGER NOT NULL DEFAULT 0,  -- cents (Long)
    currency   TEXT NOT NULL DEFAULT 'USD',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT              -- soft delete
);

selectAll:
SELECT * FROM account WHERE deleted_at IS NULL ORDER BY name;

selectById:
SELECT * FROM account WHERE id = ?;

insert:
INSERT INTO account (id, name, type, balance, currency, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?);

updateBalance:
UPDATE account SET balance = ?, updated_at = ? WHERE id = ?;

softDelete:
UPDATE account SET deleted_at = ?, updated_at = ? WHERE id = ?;

-- Transaction.sq

CREATE TABLE `transaction` (
    id                      TEXT NOT NULL PRIMARY KEY,
    account_id              TEXT NOT NULL,
    category_id             TEXT,
    amount_cents            INTEGER NOT NULL,          -- Long (cents)
    currency_code           TEXT NOT NULL DEFAULT 'USD',
    payee                   TEXT,
    note                    TEXT,
    date                    TEXT NOT NULL,             -- ISO 8601 date
    -- Nullable self-reference linking the paired leg of an account transfer
    transfer_transaction_id TEXT,
    -- Nullable FK to recurring_rule that generated this transaction
    recurring_rule_id       TEXT,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    deleted_at              TEXT,
    sync_version            INTEGER NOT NULL DEFAULT 0,
    is_synced               INTEGER NOT NULL DEFAULT 0  -- Boolean (0/1)
);

selectAll:
SELECT * FROM `transaction` WHERE deleted_at IS NULL ORDER BY date DESC;

selectByAccount:
SELECT * FROM `transaction`
WHERE account_id = ? AND deleted_at IS NULL
ORDER BY date DESC;

selectTransfers:
SELECT * FROM `transaction`
WHERE transfer_transaction_id IS NOT NULL AND deleted_at IS NULL;

insert:
INSERT INTO `transaction` (
    id, account_id, category_id, amount_cents, currency_code, payee, note, date,
    transfer_transaction_id, recurring_rule_id, created_at, updated_at, sync_version, is_synced
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0);

softDelete:
UPDATE `transaction` SET deleted_at = ?, updated_at = ?, sync_version = 1, is_synced = 0
WHERE id = ?;

-- Budget.sq

CREATE TABLE budget (
    id            TEXT NOT NULL PRIMARY KEY,
    category_id   TEXT NOT NULL,
    amount_cents  INTEGER NOT NULL,   -- Long (cents)
    currency_code TEXT NOT NULL DEFAULT 'USD',
    period        TEXT NOT NULL,      -- "monthly", "weekly", etc.
    start_date    TEXT NOT NULL,
    end_date      TEXT,
    -- When true, unused budget amount carries forward into the next period
    is_rollover   INTEGER NOT NULL DEFAULT 0,  -- Boolean (0/1)
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT,
    sync_version  INTEGER NOT NULL DEFAULT 0,
    is_synced     INTEGER NOT NULL DEFAULT 0
);

selectAll:
SELECT * FROM budget WHERE deleted_at IS NULL ORDER BY start_date DESC;

selectRolloverBudgets:
SELECT * FROM budget WHERE is_rollover = 1 AND deleted_at IS NULL;

insert:
INSERT INTO budget (
    id, category_id, amount_cents, currency_code, period, start_date, end_date,
    is_rollover, created_at, updated_at, sync_version, is_synced
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0);

softDelete:
UPDATE budget SET deleted_at = ?, updated_at = ?, sync_version = 1, is_synced = 0
WHERE id = ?;

-- Goal.sq

CREATE TABLE goal (
    id              TEXT NOT NULL PRIMARY KEY,
    -- Optional FK to a specific account funding this goal
    account_id      TEXT,
    name            TEXT NOT NULL,
    target_cents    INTEGER NOT NULL,   -- Long (cents)
    current_cents   INTEGER NOT NULL DEFAULT 0,
    currency_code   TEXT NOT NULL DEFAULT 'USD',
    target_date     TEXT,
    -- Lifecycle: active | completed | archived
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,
    sync_version    INTEGER NOT NULL DEFAULT 0,
    is_synced       INTEGER NOT NULL DEFAULT 0
);

selectAll:
SELECT * FROM goal WHERE deleted_at IS NULL ORDER BY target_date ASC;

selectActive:
SELECT * FROM goal WHERE status = 'active' AND deleted_at IS NULL;

selectByAccount:
SELECT * FROM goal WHERE account_id = ? AND deleted_at IS NULL;

insert:
INSERT INTO goal (
    id, account_id, name, target_cents, current_cents, currency_code, target_date,
    status, created_at, updated_at, sync_version, is_synced
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0);

updateStatus:
UPDATE goal SET status = ?, updated_at = ?, sync_version = 1, is_synced = 0
WHERE id = ?;

softDelete:
UPDATE goal SET deleted_at = ?, updated_at = ?, sync_version = 1, is_synced = 0
WHERE id = ?;
```

### Platform Drivers

```kotlin
// commonMain — expect factory
expect class DriverFactory {
    fun createDriver(): SqlDriver
}

// androidMain
actual class DriverFactory(private val context: Context) {
    actual fun createDriver(): SqlDriver =
        AndroidSqliteDriver(FinanceDatabase.Schema, context, "finance.db")
}

// iosMain
actual class DriverFactory {
    actual fun createDriver(): SqlDriver =
        NativeSqliteDriver(FinanceDatabase.Schema, "finance.db")
}

// jvmMain
actual class DriverFactory {
    actual fun createDriver(): SqlDriver =
        JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
            .also { FinanceDatabase.Schema.create(it) }
}
```

### Migration Strategy

- Migrations are numbered `.sqm` files (1.sqm, 2.sqm, ...).
- Each migration contains `ALTER TABLE`, `CREATE TABLE`, or `CREATE INDEX` statements.
- Set `verifyMigrations = true` in Gradle to validate migration chains at build time.
- Always add columns as nullable or with defaults to avoid breaking existing data.
- Test migrations by running `FinanceDatabase.Schema.migrate(driver, oldVersion, newVersion)`.

## kotlinx Libraries Usage Patterns

### kotlinx-serialization

```kotlin
@Serializable
data class TransactionDto(
    val id: String,
    val accountId: String,
    @SerialName("amount_cents")
    val amountCents: Long,
    val description: String,
    @Serializable(with = InstantSerializer::class)
    val date: Instant,
)

// Usage
val json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    prettyPrint = false
}
val dto = json.decodeFromString<TransactionDto>(jsonString)
```

### kotlinx-datetime

```kotlin
import kotlinx.datetime.*

// Current instant
val now: Instant = Clock.System.now()

// Convert to local date in user's timezone
val tz = TimeZone.currentSystemDefault()
val localDate: LocalDate = now.toLocalDate(tz)

// Date arithmetic
val oneMonthAgo = localDate.minus(1, DateTimeUnit.MONTH)

// ISO formatting for storage
val isoString: String = now.toString()  // "2025-01-15T10:30:00Z"
val parsed: Instant = Instant.parse(isoString)
```

### kotlinx-coroutines

```kotlin
// Repository pattern with Flow
class TransactionRepository(private val db: FinanceDatabase) {
    fun observeAll(): Flow<List<Transaction>> =
        db.transactionQueries.selectAll()
            .asFlow()
            .mapToList(Dispatchers.Default)

    suspend fun insert(txn: Transaction) = withContext(Dispatchers.Default) {
        db.transactionQueries.insert(
            id = txn.id.value,
            accountId = txn.accountId.value,
            amountCents = txn.amount.cents,
            description = txn.description,
            createdAt = Clock.System.now().toString(),
            updatedAt = Clock.System.now().toString(),
        )
    }
}
```

## iOS Interop Status

### Swift Export Is Planned, Not Current

- The iOS app is currently described as pure SwiftUI in the repo instructions.
- Do not assume a checked-in `packages/ios-export/` module exists today.
- Treat Swift Export and SKIE guidance as future-facing design notes until an actual export module is added.

### When iOS Interop Work Starts

- Keep Swift-facing APIs small and explicit.
- Prefer wrapper types for `Flow`, suspend functions, and sealed hierarchies.
- Export only the shared modules that truly need to cross the bridge.

## JavaScript Target Notes for Shared Modules

### Shared Kotlin JS Target

- The current convention plugin configures `js(IR) { browser() }` for shared packages.
- Use `jsMain` for browser-safe shared Kotlin logic and multiplatform tests.
- `packages/sync` additionally includes `jsTest` for JS-specific verification.

### Current Web Reality

- `apps/web/` is a TypeScript + React application, not a Kotlin/JS UI.
- Shared KMP JS targets support library code and future integration points, but the primary web product surface lives in the web workspace.
- There is no checked-in `wasmJsMain` source set or Kotlin/Wasm target in the current build logic.

## Testing Patterns

### kotlin.test

```kotlin
// commonTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertFailsWith

class AccountTest {
    @Test
    fun `balance is stored in cents`() {
        val account = Account(
            id = AccountId("acc-1"),
            name = "Checking",
            balanceCents = 150_00L,  // $150.00
        )
        assertEquals(150_00L, account.balanceCents)
    }

    @Test
    fun `negative balance throws for savings accounts`() {
        assertFailsWith<IllegalArgumentException> {
            Account.createSavings(balanceCents = -1L)
        }
    }
}
```

### Turbine for Flow Testing

```kotlin
import app.cash.turbine.test

class TransactionRepositoryTest {
    @Test
    fun `emits updated list when transaction is inserted`() = runTest {
        val repo = TransactionRepository(testDb)
        repo.observeAll().test {
            assertEquals(emptyList(), awaitItem())

            repo.insert(sampleTransaction)
            val updated = awaitItem()
            assertEquals(1, updated.size)
            assertEquals(sampleTransaction.id, updated.first().id)

            cancelAndIgnoreRemainingEvents()
        }
    }
}
```

### Test Organization

- Place shared tests in `commonTest` — they run on **all** targets.
- Use `androidUnitTest` for Android-specific tests needing Robolectric.
- Use `iosTest` for tests requiring Darwin APIs.
- Prefer fakes/stubs over mocks in multiplatform code (mocking libraries are platform-specific).

## Monitoring Interfaces (packages/core)

The `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/` directory defines cross-platform monitoring contracts:

- **`CrashReporter`** — Interface for crash/error reporting. Platform `actual` implementations wrap Crashlytics (Android), MetricKit (iOS), etc.
- **`MetricsCollector`** — Interface for collecting app performance metrics (sync duration, query latency, UI frame times).
- **`SyncHealthMonitor`** — Tracks sync engine health: connection state, last-sync timestamps, error rates, retry counts.

These are `commonMain` interfaces with `expect`/`actual` platform bindings — keep implementations in the appropriate platform source sets.

## Data Export Module (packages/core)

`packages/core/src/commonMain/kotlin/com/finance/core/export/` is the current shared export module.

- `DataExportService.kt` orchestrates client-side export generation.
- `ExportSerializer.kt` defines the serializer contract.
- `JsonExportSerializer.kt` and `CsvExportSerializer.kt` implement the current formats.
- `ExportData.kt` and `ExportTypes.kt` define the input/output model.
- `Sha256.kt` provides the checksum and anonymized user-hash primitive used by exports.

## Conflict Resolution

The sync engine uses `ConflictStrategy.resolverFor(tableName)` to select the correct resolver per table:

- **`LastWriteWinsResolver`** — Default for most tables. Compares `updated_at` timestamps; newest write wins.
- **`MergeResolver`** — Used for complex records (e.g., budgets with multiple sub-fields). Merges non-conflicting field changes and flags true conflicts for user resolution.
- **`ClientWinsResolver`** — Always picks the local record. Useful for user-preference data.
- **`ServerWinsResolver`** — Always picks the remote record. Useful for admin-managed data.

```kotlin
// Usage in sync engine
val resolver = ConflictStrategy.resolverFor(tableName)
val resolved = resolver.resolve(localRecord, remoteRecord)
```

## Version Catalog Additions

The `gradle/libs.versions.toml` catalog includes these platform-specific dependencies:

```toml
[libraries]
koin-android = { module = "io.insert-koin:koin-android", version.ref = "koin" }
koin-compose-viewmodel = { module = "io.insert-koin:koin-compose-viewmodel", version.ref = "koin" }
timber = { module = "com.jakewharton.timber:timber", version = "5.0.1" }
```

- **Koin 4.0.1** — Dependency injection framework, used in `androidMain` and Compose ViewModels.
- **Timber 5.0.1** — Android logging library, used as the `actual` implementation backing `PlatformLogger` on Android.

## Common Pitfalls

### java.\* in commonMain

**Problem:** Accidentally using `java.util.UUID`, `java.time.*`, or other JVM APIs in `commonMain`.

**Solution:** The Kotlin compiler will error on non-JVM targets, but catch this early by building all targets in CI. Use kotlinx equivalents:

- `java.util.UUID` → custom `expect fun randomUUID()` or `kotlin.uuid.Uuid` (Kotlin 2.0+)
- `java.time.*` → `kotlinx-datetime`
- `java.io.*` → `kotlinx-io` or `okio`
- `java.util.concurrent.*` → `kotlinx-coroutines`

### Platform-Specific Leaks

**Problem:** A `commonMain` interface returns a platform type that doesn't exist on all targets.

**Solution:** Keep all public API types in `commonMain` as pure Kotlin types. Wrap platform types behind `expect`/`actual` or interfaces.

### Coroutine Dispatcher Misuse

**Problem:** Using `Dispatchers.IO` in `commonMain` — it doesn't exist on all platforms.

**Solution:** Inject dispatchers or use `Dispatchers.Default`. For IO-like work on native, use `newSingleThreadContext` or `Dispatchers.Default`.

### K/N Memory Model

**Problem:** Kotlin/Native's new memory model is the default since Kotlin 1.7.20, but some older libraries may not be compatible.

**Solution:** Ensure all dependencies support the new memory model. Avoid `@SharedImmutable` and `freeze()` — they are deprecated.

## Financial-Specific Patterns

### Value Classes for IDs

Prevent accidental mixing of ID types by wrapping them in inline value classes:

```kotlin
@JvmInline
value class AccountId(val value: String)

@JvmInline
value class TransactionId(val value: String)

@JvmInline
value class BudgetId(val value: String)

@JvmInline
value class HouseholdId(val value: String)
```

This ensures you can never pass a `TransactionId` where an `AccountId` is expected.

### Long for Cents (Money Representation)

**Never use floating-point types for money.** Use `Long` representing the smallest currency unit (cents for USD):

```kotlin
@JvmInline
value class Money(val cents: Long) {
    operator fun plus(other: Money) = Money(cents + other.cents)
    operator fun minus(other: Money) = Money(cents - other.cents)

    fun formatUSD(): String {
        val dollars = cents / 100
        val remainder = (cents % 100).absoluteValue
        val sign = if (cents < 0) "-" else ""
        return "$sign\$$dollars.${remainder.toString().padStart(2, '0')}"
    }

    companion object {
        fun fromDollars(dollars: Double): Money =
            Money((dollars * 100).roundToLong())
        val ZERO = Money(0L)
    }
}
```

### Timestamp Conventions

- Store all timestamps as ISO-8601 UTC strings (`Instant.toString()`).
- Convert to local time only at the UI layer.
- Use `kotlinx.datetime.Instant` throughout the codebase.

## Example Module Structure

```
packages/
├── core/
│   ├── build.gradle.kts
│   └── src/
│       ├── commonMain/kotlin/com/finance/core/
│       │   ├── export/
│       │   │   ├── DataExportService.kt
│       │   │   ├── ExportSerializer.kt
│       │   │   ├── JsonExportSerializer.kt
│       │   │   ├── CsvExportSerializer.kt
│       │   │   └── Sha256.kt
│       │   ├── monitoring/
│       │   └── validation/
│       ├── iosMain/kotlin/com/finance/core/
│       ├── jsMain/kotlin/com/finance/core/
│       └── jvmMain/kotlin/com/finance/core/
│
├── models/
│   ├── build.gradle.kts
│   └── src/
│       ├── androidMain/kotlin/com/finance/
│       ├── commonMain/kotlin/com/finance/models/
│       ├── iosMain/kotlin/com/finance/
│       ├── jsMain/kotlin/com/finance/
│       └── jvmMain/kotlin/com/finance/
│
└── sync/
    ├── build.gradle.kts
    └── src/
        ├── androidMain/kotlin/com/finance/sync/
        ├── commonMain/kotlin/com/finance/sync/
        │   ├── conflict/
        │   ├── delta/
        │   └── queue/
        ├── iosMain/kotlin/com/finance/sync/
        ├── jsMain/kotlin/com/finance/sync/
        └── jvmMain/kotlin/com/finance/sync/
```
