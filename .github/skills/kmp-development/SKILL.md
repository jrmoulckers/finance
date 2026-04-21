---
name: kmp-development
description: >
  Kotlin Multiplatform project structure, configuration, and development
  patterns for the Finance monorepo. Use for topics related to KMP, Kotlin,
  multiplatform, commonMain, expect actual, SQLDelight, Ktor, Gradle, or
  shared code.
---

# KMP Development Skill

## Current KMP State

The Finance monorepo ships **3 KMP packages** with these capabilities:

- **5 AI engines**: categorization, balance prediction, subscription detection, savings, budget recommendations
- **Feature flag system**: `FeatureFlagEngine` with evaluation contexts
- **Environment configs**: typed dev/staging/production configs
- **i18n framework**: `StringProvider` + `Locale` + `NumberFormatting`
- **Monitoring interfaces**: `CrashReporter`, `MetricsCollector`, `SyncHealthMonitor`
- **Security hardening**: RASP, device attestation, biometric crypto binding
- **Data export**: JSON/CSV with SHA-256 checksums and anonymized user IDs

## Project Structure

```
packages/core/src/
├── commonMain/             # Business logic, AI engines, config
├── commonTest/             # Tests for all targets
├── iosMain/                # Apple platform actuals
├── jsMain/                 # Browser-safe shared logic
└── jvmMain/                # JVM/Android shared actuals

packages/models/src/
├── androidMain/            # Android-specific models
├── commonMain/             # Shared data models
├── commonTest/
├── iosMain/
├── jsMain/
└── jvmMain/

packages/sync/src/
├── androidMain/            # Android sync wiring
├── commonMain/             # Sync engine, conflict resolution, crypto
├── commonTest/             # 35+ test files
├── iosMain/
├── jsMain/
├── jsTest/                 # JS-specific sync tests
└── jvmMain/
```

**Source-set rules**:

- `commonMain` — pure Kotlin only; no `java.*`, `android.*`, or Apple imports
- `packages/core` has no checked-in `androidMain` (conditionally added when SDK available)
- No `wasmJsMain` target currently exists

## Gradle Configuration

### Version Catalog

All versions in `gradle/libs.versions.toml` — never hardcode versions in build files.

### Convention Plugin

`build-logic/src/main/kotlin/finance.kmp.library.gradle.kts`:

- All packages apply `id("finance.kmp.library")`
- Targets: `jvm()`, `iosArm64()`, `iosSimulatorArm64()`, `iosX64()`, `js(IR) { browser() }`
- `androidTarget()` enabled only when Android SDK is available
- `jvmToolchain(21)`

### Composite Builds

```kotlin
// settings.gradle.kts
includeBuild("build-logic")
include(":packages:core", ":packages:models", ":packages:sync", ":apps:windows")
if (androidSdkAvailable) include(":apps:android")
```

## Expect/Actual Pattern Catalog

### UUID Generation

```kotlin
// commonMain
expect fun randomUUID(): String

// jvmMain / androidMain
actual fun randomUUID(): String = java.util.UUID.randomUUID().toString()

// iosMain
actual fun randomUUID(): String = platform.Foundation.NSUUID().UUIDString()

// jsMain
actual fun randomUUID(): String = js("crypto.randomUUID()") as String
```

### Platform Logger

```kotlin
// commonMain
expect class PlatformLogger() {
    fun debug(tag: String, message: String)
    fun error(tag: String, message: String, throwable: Throwable? = null)
}

// androidMain → android.util.Log
// iosMain → platform.Foundation.NSLog
// jvmMain → java.util.logging.Logger
```

### Driver Factory (SQLDelight)

```kotlin
// commonMain
expect class DriverFactory { fun createDriver(): SqlDriver }

// androidMain → AndroidSqliteDriver(FinanceDatabase.Schema, context, "finance.db")
// iosMain → NativeSqliteDriver(FinanceDatabase.Schema, "finance.db")
// jvmMain → JdbcSqliteDriver(IN_MEMORY).also { Schema.create(it) }
```

### Best Practices

- Keep `expect` declarations **minimal** — prefer interfaces + DI over expect/actual
- Use expect/actual for **platform primitives**: file I/O, crypto, logging, DB drivers
- **Never** put business logic in `actual` implementations

## SQLDelight

### Schema Location

```
packages/core/src/commonMain/sqldelight/finance/db/
├── Account.sq
├── Transaction.sq
├── Budget.sq
├── Goal.sq
└── migrations/ (1.sqm, 2.sqm, 3.sqm)
```

### Key Schema Patterns

```sql
-- Money as cents (BIGINT/INTEGER)
amount_cents INTEGER NOT NULL,

-- Soft deletes
deleted_at TEXT,
WHERE deleted_at IS NULL  -- always filter

-- Sync columns
sync_version INTEGER NOT NULL DEFAULT 0,
is_synced    INTEGER NOT NULL DEFAULT 0

-- Transfer support (approved schema)
transfer_transaction_id TEXT,  -- self-FK linking paired transfer leg
recurring_rule_id       TEXT,  -- FK to recurring rule

-- Budget rollover (approved schema)
is_rollover INTEGER NOT NULL DEFAULT 0

-- Goal lifecycle (approved schema)
account_id TEXT,           -- optional FK to funding account
status     TEXT NOT NULL DEFAULT 'active'  -- active | completed | archived
```

### Migration Strategy

- Numbered `.sqm` files: `1.sqm`, `2.sqm`, ...
- `verifyMigrations = true` in Gradle
- Always add columns as **nullable or with defaults**
- Test: `FinanceDatabase.Schema.migrate(driver, oldVersion, newVersion)`

## AI Engines (packages/core)

| Engine                       | Path              | Purpose                       |
| ---------------------------- | ----------------- | ----------------------------- |
| `SmartCategorizationEngine`  | `categorization/` | ML-style tx categorization    |
| `BalancePredictionEngine`    | `prediction/`     | Future balance forecasting    |
| `SubscriptionDetector`       | `subscription/`   | Recurring charge detection    |
| `SavingsEngine`              | `savings/`        | Savings opportunity analysis  |
| `BudgetRecommendationEngine` | `recommendation/` | Budget allocation suggestions |

All pure Kotlin in `commonMain` — no platform dependencies. Extend via input data.

## Feature Flags

`packages/core/src/commonMain/.../featureflags/`:

- `FeatureFlag.kt` / `FeatureFlags.kt` — flag definitions
- `FeatureFlagEngine.kt` — evaluation with `EvaluationContext.kt`
- `FeatureFlagProvider.kt` — platform-specific flag sources
- Gate at **use-case layer**, not UI

## Environment Configuration

`packages/core/src/commonMain/.../config/`:

- `EnvironmentConfig.kt` — typed config per environment (dev/staging/prod)
- `BuildEnvironment.kt` — current environment detection
- `ConfigProvider.kt` — abstract config access

## i18n Framework

`packages/core/src/commonMain/.../i18n/`:

- `Strings.kt` / `StringBundle.kt` / `StringProvider.kt` — string catalog
- `EnglishStrings.kt` — default locale
- `Locale.kt` / `NumberFormatting.kt` — locale-aware formatting

## Monitoring Interfaces

`packages/core/src/commonMain/.../monitoring/`:

- **`CrashReporter`** — Crash reporting (Crashlytics on Android, MetricKit on iOS)
- **`MetricsCollector`** — Performance metrics (sync duration, query latency)
- **`SyncHealthMonitor`** — Connection state, last-sync, error rates

## Security Hardening

`packages/core/src/commonMain/.../security/`:

- `RuntimeIntegrityChecker.kt` — RASP tamper detection
- `DeviceAttestor.kt` — Platform attestation (PlayIntegrity, TPM)
- `BiometricCryptoBinding.kt` — Biometric → crypto key binding

## kotlinx Library Usage

### Serialization

```kotlin
@Serializable
data class TransactionDto(
    val id: String,
    @SerialName("amount_cents") val amountCents: Long,
    @Serializable(with = InstantSerializer::class) val date: Instant,
)

val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
```

### Datetime

```kotlin
val now: Instant = Clock.System.now()
val localDate = now.toLocalDate(TimeZone.currentSystemDefault())
val isoString = now.toString()  // "2025-01-15T10:30:00Z"
```

### Coroutines (Repository pattern)

```kotlin
fun observeAll(): Flow<List<Transaction>> =
    db.transactionQueries.selectAll().asFlow().mapToList(Dispatchers.Default)
```

## Financial Value Patterns

### Value Classes for IDs

```kotlin
@JvmInline value class AccountId(val value: String)
@JvmInline value class TransactionId(val value: String)
@JvmInline value class HouseholdId(val value: String)
```

### Money as Cents

```kotlin
@JvmInline
value class Money(val cents: Long) {
    operator fun plus(other: Money) = Money(cents + other.cents)
    operator fun minus(other: Money) = Money(cents - other.cents)
    companion object {
        fun fromDollars(d: Double) = Money((d * 100).roundToLong())
        val ZERO = Money(0L)
    }
}
```

### Timestamps

- Store as ISO-8601 UTC strings (`Instant.toString()`)
- Convert to local time only at UI layer
- Use `kotlinx.datetime.Instant` everywhere

## Testing

```kotlin
// commonTest — runs on ALL targets
class AccountTest {
    @Test fun alance stored in cents() {
        assertEquals(150_00L, account.balanceCents)
    }
}

// Turbine for Flow testing
repo.observeAll().test {
    assertEquals(emptyList(), awaitItem())
    repo.insert(sample)
    assertEquals(1, awaitItem().size)
}
```

- `commonTest` → all targets; `androidUnitTest` → Robolectric; `iosTest` → Darwin APIs
- Prefer fakes/stubs over mocks (mocking libs are platform-specific)

## Common Pitfalls

| Pitfall                         | Fix                                                |
| ------------------------------- | -------------------------------------------------- |
| `java.*` in commonMain          | Use kotlinx equivalents (datetime, io, coroutines) |
| Platform type in public API     | Wrap behind expect/actual or interfaces            |
| `Dispatchers.IO` in commonMain  | Use `Dispatchers.Default` or inject dispatchers    |
| `@SharedImmutable` / `freeze()` | Deprecated since Kotlin 1.7.20; remove             |

## Lesson Learned: owner_id Migration

When adding `owner_id` to all sync-enabled tables:

- Must be added to **both** Supabase migration AND SQLDelight schema simultaneously
- Backend migration: `ALTER TABLE ... ADD COLUMN owner_id UUID REFERENCES auth.users(id)`
- SQLDelight: add to `.sq` CREATE TABLE + all INSERT statements
- RLS policies must be updated to use `owner_id` for direct user queries
- **Serialization order**: backend migration → KMP schema → platform data layer

## iOS Interop Status

- Swift Export is **planned, not current** — no `packages/ios-export/` exists
- When it starts: keep Swift-facing APIs small, wrap `Flow`/`suspend`, export minimal modules

## JavaScript Target

- Convention plugin configures `js(IR) { browser() }`
- `jsMain` is for shared Kotlin logic, not web UI (`apps/web/` is TypeScript + React)
- No `wasmJsMain` target currently exists
