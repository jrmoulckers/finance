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

Each KMP module follows the standard source-set hierarchy:

```
packages/core/
├── build.gradle.kts
└── src/
    ├── commonMain/kotlin/      # Shared business logic (pure Kotlin)
    ├── commonTest/kotlin/      # Shared tests
    ├── androidMain/kotlin/     # Android-specific implementations
    ├── iosMain/kotlin/         # iOS-specific implementations (via K/N)
    ├── jvmMain/kotlin/         # JVM desktop/server implementations
    ├── jsMain/kotlin/          # Kotlin/JS browser/Node implementations
    └── wasmJsMain/kotlin/      # Kotlin/Wasm (WasmJS) implementations
```

### Source-Set Dependency Graph

```
                  commonMain
                 /    |    \
            jvmMain iosMain  nativeMain
           /          |          \
    androidMain   iosArm64Main  linuxMain
                  iosX64Main
                  iosSimulatorArm64Main

    jsMain       wasmJsMain
```

- **commonMain** — Pure Kotlin only. No `java.*`, `android.*`, or platform imports allowed.
- **androidMain** — Android SDK access, Room/SQLite Android driver, WorkManager.
- **iosMain** — Intermediate source set shared across all iOS targets (arm64, x64, simulatorArm64).
- **jvmMain** — JVM-specific code for desktop or backend (JDBC driver, JVM coroutines).
- **jsMain** — Kotlin/JS for web, compiled to JavaScript via IR backend.
- **wasmJsMain** — Kotlin/Wasm targeting browser via WasmJS, shares APIs with jsMain where possible.

## Gradle Configuration Patterns

### Version Catalogs

All dependency versions are centralized in `gradle/libs.versions.toml`:

```toml
[versions]
kotlin = "2.1.21"
coroutines = "1.10.2"
sqldelight = "2.0.2"
ktor = "3.1.3"
serialization = "1.8.1"
datetime = "0.6.2"

[libraries]
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
kotlinx-datetime = { module = "org.jetbrains.kotlinx:kotlinx-datetime", version.ref = "datetime" }
sqldelight-runtime = { module = "app.cash.sqldelight:runtime", version.ref = "sqldelight" }
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }

[plugins]
kotlin-multiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }
sqldelight = { id = "app.cash.sqldelight", version.ref = "sqldelight" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
```

### Composite Builds

The monorepo uses Gradle composite builds (included builds) so that convention plugins and shared build logic are developed as standalone projects:

```kotlin
// settings.gradle.kts
includeBuild("build-logic")   // convention plugins
include(":packages:core")
include(":packages:models")
include(":packages:sync")
include(":apps:android")
include(":apps:ios-export")
```

### Convention Plugins

Reusable build configuration lives in `build-logic/`:

```kotlin
// build-logic/src/main/kotlin/finance.kmp-library.gradle.kts
plugins {
    id("org.jetbrains.kotlin.multiplatform")
}

kotlin {
    androidTarget()
    iosArm64()
    iosX64()
    iosSimulatorArm64()
    jvm()
    js(IR) { browser(); nodejs() }
    wasmJs { browser() }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
```

Apply in module `build.gradle.kts`:

```kotlin
plugins {
    id("finance.kmp-library")
}
```

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

// wasmJsMain
actual fun randomUUID(): String = js("crypto.randomUUID()").toString()
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

## Swift Export Configuration for iOS

### Exporting the KMP Framework

```kotlin
// packages/ios-export/build.gradle.kts
kotlin {
    listOf(iosArm64(), iosX64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "FinanceShared"
            isStatic = true
            export(project(":packages:core"))
            export(project(":packages:models"))
        }
    }
}
```

### Swift-Friendly API Design

- Use `@ObjCName` to give Kotlin declarations Swift-friendly names.
- Wrap `Flow` emissions with a Swift-consumable helper (e.g., `CFlow` or `SKIE`).
- Avoid generics at the API boundary — Swift interop with Kotlin generics is limited.
- Use sealed classes/interfaces carefully; they map to Swift enums via SKIE or manual wrappers.

```kotlin
@ObjCName("FinanceAccount")
data class Account(
    val id: AccountId,
    val name: String,
    val balanceCents: Long,
)
```

### SKIE Integration

SKIE (by Touchlab) improves Swift interop for Kotlin `Flow`, sealed classes, and suspend functions:

```kotlin
// build.gradle.kts
plugins {
    id("co.touchlab.skie") version "0.10.1"
}
```

## Kotlin/JS and Kotlin/Wasm Configuration for Web

### Kotlin/JS

```kotlin
kotlin {
    js(IR) {
        browser {
            commonWebpackConfig {
                cssSupport { enabled.set(true) }
                outputFileName = "finance.js"
            }
            testTask {
                useKarma { useChromeHeadless() }
            }
        }
        binaries.executable()
    }
}
```

### Kotlin/Wasm (WasmJS)

```kotlin
kotlin {
    wasmJs {
        browser {
            commonWebpackConfig {
                outputFileName = "finance.wasm.js"
            }
        }
        binaries.executable()
    }
}
```

### Shared Web Source Set

To share code between jsMain and wasmJsMain:

```kotlin
kotlin {
    sourceSets {
        val webMain by creating {
            dependsOn(commonMain.get())
        }
        jsMain.get().dependsOn(webMain)
        wasmJsMain.get().dependsOn(webMain)
    }
}
```

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

## Conflict Resolution

The sync engine uses `ConflictStrategy.resolverFor(tableName)` to select the correct resolver per table:

- **`LastWriteWinsResolver`** — Default for most tables. Compares `updated_at` timestamps; newest write wins.
- **`MergeResolver`** — Used for complex records (e.g., budgets with multiple sub-fields). Merges non-conflicting field changes and flags true conflicts for user resolution.

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

### java.* in commonMain

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
├── core/                          # Business logic & database
│   ├── build.gradle.kts          # Applies finance.kmp-library plugin
│   └── src/
│       ├── commonMain/kotlin/dev/finance/core/
│       │   ├── repository/       # AccountRepository, TransactionRepository
│       │   ├── usecase/          # Domain use cases
│       │   └── di/              # Koin/manual DI modules
│       ├── commonMain/sqldelight/finance/db/
│       │   ├── Account.sq
│       │   ├── Transaction.sq
│       │   └── Budget.sq
│       ├── androidMain/kotlin/   # Android SQLite driver
│       └── iosMain/kotlin/       # Native SQLite driver
│
├── models/                        # Pure data models (no platform deps)
│   ├── build.gradle.kts
│   └── src/
│       └── commonMain/kotlin/dev/finance/models/
│           ├── Account.kt        # Account data class + AccountId
│           ├── Transaction.kt    # Transaction + TransactionId + Money
│           ├── Budget.kt         # Budget + BudgetId + BudgetPeriod
│           └── Household.kt     # Household + HouseholdId
│
├── sync/                          # PowerSync / sync engine integration
│   ├── build.gradle.kts
│   └── src/
│       ├── commonMain/kotlin/dev/finance/sync/
│       │   ├── SyncEngine.kt    # Sync orchestration
│       │   ├── SyncStatus.kt    # Connected, Syncing, Error states
│       │   └── ConflictResolver.kt
│       ├── androidMain/kotlin/   # Android background sync (WorkManager)
│       └── iosMain/kotlin/       # iOS background sync (BGTaskScheduler)
```
