# ADR-0003: Local Storage Strategy

**Status:** Accepted
**Date:** 2025-07-17
**Author:** Copilot (AI agent), based on local storage research
**Reviewers:** Pending human review

## Context

The Finance app requires a local storage strategy that meets the demands of an offline-first, multi-platform financial application. From the project's skill files:

- **Offline-first architecture** — all CRUD operations execute against the local database first; sync is opportunistic. The local database must be fully functional without network connectivity.
- **Financial precision** — money is stored as integer cents (never floating point). ISO 4217 currency codes. Banker's rounding for display. Complex aggregation queries are needed for budget calculations, net worth summaries, spending analysis, category breakdowns, and trend reporting.
- **Encryption at rest** — financial data must be encrypted on-device. This is non-negotiable for a finance app storing account numbers, balances, transaction history, and budget information.
- **Sync primitives** — the local database must support change tracking (`lastModified`, `syncVersion`), soft deletes (`deleted_at`), and sync queue management. These are the building blocks for the PowerSync integration described in ADR-0002.
- **Multi-platform** — iOS, Android, Web, and Windows (see ADR-0001). The storage layer must work across all targets with a shared schema definition and shared query logic.
- **Performance** — thousands of transactions with fast aggregations. Users expect instant category breakdowns, monthly summaries, and net worth calculations.

### Storage Categories

The app has two distinct storage needs:

| Category                          | Examples                                                                           | Requirements                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Relational/transactional data** | Transactions, accounts, categories, budgets, recurring rules                       | SQL queries, JOINs, aggregations, encryption, sync, migrations |
| **Key-value preferences**         | Auth tokens, feature flags, onboarding state, theme, last sync timestamp, UI state | Fast read/write, encryption, no sync needed, simple get/set    |

These two categories have fundamentally different access patterns and should use different storage engines.

## Decision

**Use SQLite via SQLDelight for relational data with SQLCipher encryption, and MMKV for key-value preferences.**

### Primary Storage: SQLDelight + SQLCipher

- **SQLDelight** generates type-safe Kotlin code from `.sq` SQL files. The schema and queries are defined once in `commonMain` and compiled to platform-specific drivers (Android, iOS/Native, JVM, JS/Wasm).
- **SQLCipher** provides AES-256-CBC encryption of the entire SQLite database file. All data is encrypted at rest with negligible performance impact.
- SQLDelight was created by **Cash App** (a financial app) specifically for Kotlin Multiplatform offline-first applications. It is the most battle-tested KMP database solution.

### Secondary Storage: MMKV

- **MMKV** (by Tencent) is an ultra-fast key-value store using memory-mapped files. It provides ~30x faster reads than AsyncStorage and supports built-in AES encryption.
- Used exclusively for preferences, tokens, and ephemeral state — **never** for transactional financial data.
- On platforms where MMKV isn't available (web), fall back to `multiplatform-settings` backed by `localStorage` or IndexedDB.

### Architecture

```
┌───────────────────────────────────────────────────────┐
│                    Data Layer                          │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │          SQLDelight (packages/models/)            │  │
│  │                                                   │  │
│  │  .sq files ──► Generated Kotlin ──► SQL queries   │  │
│  │  (schema)       (type-safe API)     (at runtime)  │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │                                 │
│          ┌───────────┼───────────┬──────────┐          │
│          │           │           │          │          │
│    ┌─────▼────┐ ┌────▼─────┐ ┌──▼───┐ ┌───▼──────┐   │
│    │ Android  │ │ iOS      │ │ JVM  │ │ JS/Wasm  │   │
│    │ Driver   │ │ Native   │ │Driver│ │ Driver   │   │
│    │          │ │ Driver   │ │      │ │          │   │
│    │ SQLCipher│ │ SQLCipher│ │SQLite│ │ wa-sqlite│   │
│    └──────────┘ └──────────┘ └──────┘ └──────────┘   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │                   MMKV                           │  │
│  │  Preferences, auth tokens, feature flags,        │  │
│  │  UI state, last sync timestamp                   │  │
│  │  (AES encrypted, synchronous access)             │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

### Example: SQLDelight Schema Definition

```sql
-- packages/models/src/commonMain/sqldelight/finance/db/Account.sq

CREATE TABLE account (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL,
    household_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'checking', 'savings', 'credit', 'investment', 'cash', 'loan'
    currency_code TEXT NOT NULL DEFAULT 'USD',
    balance_cents INTEGER NOT NULL DEFAULT 0,
    institution TEXT,
    is_active INTEGER AS Boolean NOT NULL DEFAULT 1,
    -- Sync metadata
    created_at INTEGER NOT NULL,  -- Unix epoch millis
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,           -- NULL = not deleted (soft delete)
    sync_version INTEGER NOT NULL DEFAULT 0,
    is_synced INTEGER AS Boolean NOT NULL DEFAULT 0
);

-- Indexes for common access patterns
CREATE INDEX idx_account_user ON account(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_account_sync ON account(user_id, sync_version) WHERE deleted_at IS NULL;
CREATE INDEX idx_account_household ON account(household_id) WHERE deleted_at IS NULL;

-- Queries (generate type-safe Kotlin functions)

selectAll:
SELECT * FROM account
WHERE user_id = ? AND deleted_at IS NULL
ORDER BY name ASC;

selectById:
SELECT * FROM account
WHERE id = ? AND deleted_at IS NULL;

selectByType:
SELECT * FROM account
WHERE user_id = ? AND type = ? AND deleted_at IS NULL
ORDER BY name ASC;

totalBalanceByCurrency:
SELECT currency_code, SUM(balance_cents) AS total_cents
FROM account
WHERE user_id = ? AND is_active = 1 AND deleted_at IS NULL
GROUP BY currency_code;

insert:
INSERT INTO account (id, user_id, household_id, name, type, currency_code,
    balance_cents, institution, is_active, created_at, updated_at, sync_version, is_synced)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0);

updateBalance:
UPDATE account
SET balance_cents = ?, updated_at = ?, sync_version = sync_version + 1, is_synced = 0
WHERE id = ?;

softDelete:
UPDATE account
SET deleted_at = ?, updated_at = ?, sync_version = sync_version + 1, is_synced = 0
WHERE id = ?;

unsyncedChanges:
SELECT * FROM account
WHERE is_synced = 0 AND user_id = ?
ORDER BY updated_at ASC;

markSynced:
UPDATE account SET is_synced = 1 WHERE id = ?;
```

```sql
-- packages/models/src/commonMain/sqldelight/finance/db/Transaction.sq

CREATE TABLE txn (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES account(id),
    category_id TEXT REFERENCES category(id),
    user_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,       -- Positive = income, negative = expense
    currency_code TEXT NOT NULL DEFAULT 'USD',
    description TEXT NOT NULL,
    notes TEXT,
    date TEXT NOT NULL,                  -- ISO 8601 date (YYYY-MM-DD)
    type TEXT NOT NULL,                  -- 'income', 'expense', 'transfer'
    is_reconciled INTEGER AS Boolean NOT NULL DEFAULT 0,
    transfer_pair_id TEXT,               -- Links two sides of a transfer
    -- Sync metadata
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    sync_version INTEGER NOT NULL DEFAULT 0,
    is_synced INTEGER AS Boolean NOT NULL DEFAULT 0
);

CREATE INDEX idx_txn_account ON txn(account_id, date) WHERE deleted_at IS NULL;
CREATE INDEX idx_txn_category ON txn(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_txn_user_date ON txn(user_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_txn_sync ON txn(user_id, sync_version) WHERE deleted_at IS NULL;

-- Financial reporting queries

spendingByCategory:
SELECT
    c.name AS category_name,
    c.icon AS category_icon,
    c.color AS category_color,
    SUM(t.amount_cents) AS total_cents,
    COUNT(*) AS transaction_count
FROM txn t
LEFT JOIN category c ON t.category_id = c.id
WHERE t.user_id = ?
    AND t.date BETWEEN ? AND ?
    AND t.type = 'expense'
    AND t.deleted_at IS NULL
GROUP BY t.category_id
ORDER BY total_cents ASC;

monthlyTrend:
SELECT
    substr(date, 1, 7) AS month,       -- 'YYYY-MM'
    SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) AS income_cents,
    SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS expense_cents,
    SUM(amount_cents) AS net_cents
FROM txn
WHERE user_id = ?
    AND date BETWEEN ? AND ?
    AND deleted_at IS NULL
GROUP BY substr(date, 1, 7)
ORDER BY month ASC;

searchTransactions:
SELECT t.*, a.name AS account_name, c.name AS category_name
FROM txn t
JOIN account a ON t.account_id = a.id
LEFT JOIN category c ON t.category_id = c.id
WHERE t.user_id = ?
    AND t.deleted_at IS NULL
    AND (t.description LIKE ? OR t.notes LIKE ?)
ORDER BY t.date DESC
LIMIT ? OFFSET ?;

recentTransactions:
SELECT t.*, a.name AS account_name, c.name AS category_name
FROM txn t
JOIN account a ON t.account_id = a.id
LEFT JOIN category c ON t.category_id = c.id
WHERE t.user_id = ?
    AND t.deleted_at IS NULL
ORDER BY t.date DESC, t.created_at DESC
LIMIT ?;

insertTransaction:
INSERT INTO txn (id, account_id, category_id, user_id, amount_cents, currency_code,
    description, notes, date, type, is_reconciled, transfer_pair_id,
    created_at, updated_at, sync_version, is_synced)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0);

unsyncedChanges:
SELECT * FROM txn
WHERE is_synced = 0 AND user_id = ?
ORDER BY updated_at ASC;
```

### Example: Generated Kotlin Usage

```kotlin
// packages/core/src/commonMain/kotlin/finance/repository/TransactionRepository.kt
import finance.db.FinanceDatabase

class TransactionRepository(private val db: FinanceDatabase) {

    fun getSpendingByCategory(
        userId: String,
        startDate: String,
        endDate: String
    ): List<CategorySpending> {
        // Type-safe — compiler catches column name typos, type mismatches
        return db.transactionQueries
            .spendingByCategory(userId, startDate, endDate)
            .executeAsList()
            .map { row ->
                CategorySpending(
                    categoryName = row.category_name ?: "Uncategorized",
                    categoryIcon = row.category_icon,
                    categoryColor = row.category_color,
                    totalCents = row.total_cents,
                    transactionCount = row.transaction_count
                )
            }
    }

    fun getMonthlyTrend(
        userId: String,
        startDate: String,
        endDate: String
    ): List<MonthlyTrend> {
        return db.transactionQueries
            .monthlyTrend(userId, startDate, endDate)
            .executeAsList()
            .map { row ->
                MonthlyTrend(
                    month = row.month,
                    incomeCents = row.income_cents,
                    expenseCents = row.expense_cents,
                    netCents = row.net_cents
                )
            }
    }

    suspend fun addTransaction(txn: Transaction) {
        db.transactionQueries.insertTransaction(
            id = txn.id,
            account_id = txn.accountId,
            category_id = txn.categoryId,
            user_id = txn.userId,
            amount_cents = txn.amountCents,
            currency_code = txn.currencyCode,
            description = txn.description,
            notes = txn.notes,
            date = txn.date,
            type = txn.type.name.lowercase(),
            is_reconciled = txn.isReconciled,
            transfer_pair_id = txn.transferPairId,
            created_at = Clock.System.now().toEpochMilliseconds(),
            updated_at = Clock.System.now().toEpochMilliseconds()
        )
    }
}
```

### Example: Database Driver Creation per Platform

```kotlin
// packages/models/src/commonMain/kotlin/finance/db/DriverFactory.kt
import app.cash.sqldelight.db.SqlDriver

expect class DriverFactory {
    fun createDriver(): SqlDriver
}

// packages/models/src/androidMain/kotlin/finance/db/DriverFactory.kt
import android.content.Context
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

actual class DriverFactory(private val context: Context) {
    actual fun createDriver(): SqlDriver {
        // SQLCipher encryption — key from Android Keystore
        val passphrase = getEncryptionKey(context) // From Android Keystore
        val factory = SupportOpenHelperFactory(passphrase.toByteArray())
        return AndroidSqliteDriver(
            schema = FinanceDatabase.Schema,
            context = context,
            name = "finance.db",
            factory = factory
        )
    }
}

// packages/models/src/iosMain/kotlin/finance/db/DriverFactory.kt
import app.cash.sqldelight.driver.native.NativeSqliteDriver
import co.touchlab.sqliter.DatabaseConfiguration

actual class DriverFactory {
    actual fun createDriver(): SqlDriver {
        return NativeSqliteDriver(
            schema = FinanceDatabase.Schema,
            name = "finance.db",
            onConfiguration = { config ->
                config.copy(
                    extendedConfig = DatabaseConfiguration.Extended(
                        // SQLCipher key — retrieved from iOS Keychain
                        foreignKeyConstraints = true
                    )
                )
            }
        )
    }
}

// packages/models/src/jvmMain/kotlin/finance/db/DriverFactory.kt
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver

actual class DriverFactory(private val dbPath: String) {
    actual fun createDriver(): SqlDriver {
        val driver = JdbcSqliteDriver("jdbc:sqlite:$dbPath")
        FinanceDatabase.Schema.create(driver)
        return driver
    }
}
```

## Alternatives Considered

### Alternative 1: Realm (MongoDB Atlas Device SDK)

Object-oriented embedded database with built-in sync (Atlas Device Sync).

- **Pros:**
  - **Built-in encryption** — AES-256 at rest with a single config flag
  - **Atlas Device Sync was excellent** — automatic offline-first sync with conflict resolution (when it was active)
  - **Zero-copy architecture** — fast object reads, efficient memory usage
  - **Automatic schema migration** for additive changes

- **Cons:**
  - **⚠️ DEPRECATED** — MongoDB deprecated Atlas Device Sync and Device SDKs in September 2024, with end-of-life September 30, 2025. No guaranteed security patches, no official maintenance, uncertain community future.
  - **No web support** — cannot run in the browser
  - **Limited Windows support** — UWP only, not WinUI 3
  - **Object-based queries, not SQL** — no JOINs, limited aggregations. Financial reporting (category breakdowns, trend analysis, budget vs. actual) requires SQL-level query power
  - **Proprietary query language** — less understood by LLMs than SQL, reducing AI tooling effectiveness

- **Why rejected:** The deprecation is an absolute dealbreaker. Adopting Realm in 2025 would require a full migration within 1–2 years. Even without the deprecation, the lack of web support and limited query power for financial reporting would eliminate it. The project cannot depend on a database that is actively being sunset.

### Alternative 2: WatermelonDB

High-performance reactive database built on SQLite, designed for React Native with built-in sync primitives.

- **Pros:**
  - **Built-in sync primitives** — `synchronize()` with `pullChanges`/`pushChanges`, Last-Write-Wins by default, tracks created/updated/deleted records. Proven in production (Nozbe Teams).
  - **Excellent performance** — lazy loading, native-thread queries. 53ms for 1,000 reads vs. 81ms Realm, 242ms AsyncStorage. Designed for 10K+ records.
  - **React Native optimized** — decorator-based models integrate naturally with React components
  - **Good migration support** — version-based schema migrations via `schemaMigrations()`

- **Cons:**
  - **No built-in encryption** — significant gap for financial data. Must encrypt at field level or use a custom SQLite build with SQLCipher, which is not straightforward
  - **Web uses LokiJS, not SQLite** — different storage engine on web means potential behavior differences, query inconsistencies, and a non-unified data layer
  - **Limited query power** — query builder API, not raw SQL. No JOINs, no complex aggregations. Financial reports with `SUM/GROUP BY/date ranges` would need raw SQL escape hatches or JavaScript-side processing
  - **Windows support untested** — risk for the platform matrix
  - **React Native specific** — does not work with KMP (ADR-0001 selects KMP). Would require choosing React Native as the framework

- **Why rejected:** WatermelonDB is tightly coupled to React Native, which conflicts with the KMP decision in ADR-0001. Even if using React Native, the absence of built-in encryption and limited query power for financial reporting would be significant gaps. The LokiJS web backend creates a split data layer that undermines cross-platform consistency.

### Alternative 3: Native Per-Platform (Room + Core Data + WinUI SQLite + IndexedDB)

Use each platform's native database abstraction: Room (Android), Core Data/SwiftData (iOS), native SQLite (Windows), and IndexedDB (Web).

- **Pros:**
  - **Best-in-class per-platform performance** — each database is optimized for its platform
  - **Full encryption support per platform** — Android EncryptedSharedPreferences + SQLCipher, iOS Data Protection API + SQLCipher, Windows DPAPI
  - **Strong per-platform query capabilities** — Room supports full SQL, Core Data supports NSPredicate/fetch requests
  - **Mature migration support** — Room versioned migrations, Core Data lightweight + heavyweight migrations

- **Cons:**
  - **4 separate implementations** — massive code duplication. Every table, every query, every migration, every test must be written and maintained 4 times
  - **No shared data layer** — sync logic, schema definitions, and business rules are duplicated per platform. A schema change requires coordinated updates across 4 codebases
  - **Testing multiplied 4x** — every feature must be independently tested on every platform
  - **Inconsistency risk** — different query semantics (SQL vs. NSPredicate), different migration behaviors, different edge cases. A bug fixed on Android might not be fixed on iOS
  - **IndexedDB on web has no encryption** — data stored in plaintext in the browser. Manual Web Crypto API encryption breaks indexing and querying
  - **Conflicts with KMP architecture** — KMP's value is shared code in `commonMain`. Per-platform databases negate this benefit

- **Why rejected:** The maintenance cost of 4 separate database implementations far outweighs any per-platform performance benefit. The entire point of KMP (ADR-0001) is to share business logic — splitting the data layer across platforms undermines the architecture. SQLDelight provides a single schema definition that compiles to all platforms, making per-platform databases unnecessary.

## Consequences

### Positive

- **Consistent SQL across all platforms** — the same `.sq` files define the schema and queries for Android, iOS, Desktop, and Web. No platform-specific query languages, no behavior differences, no schema drift.
- **Type-safe queries at compile time** — SQLDelight generates Kotlin functions from SQL. Column name typos, type mismatches, and missing parameters are caught by the compiler, not at runtime. This is especially important for financial queries where a wrong column could produce incorrect balance calculations.
- **Encrypted at rest on all platforms** — SQLCipher provides AES-256 encryption of the entire database file. Keys are managed via platform keystores (Android Keystore, iOS Keychain, Windows DPAPI). No financial data is ever stored in plaintext on-device.
- **Full SQL power for financial reporting** — JOINs, subqueries, window functions, `SUM/GROUP BY/HAVING`, date range filters. The spending-by-category, monthly-trend, and net-worth queries shown above are natural SQL — no ORM limitations, no JavaScript-side post-processing.
- **Sync-ready schema** — every table includes `created_at`, `updated_at`, `deleted_at`, `sync_version`, and `is_synced` columns. The `unsyncedChanges` query feeds directly into the PowerSync integration (ADR-0002).
- **Battle-tested in financial apps** — SQLDelight was created by Cash App for exactly this use case. SQLite is the most deployed database engine in the world. SQLCipher is used by Signal, Wickr, and other security-critical applications.
- **AI tooling excellence** — SQL schemas and queries are the most LLM-friendly database interface. Copilot can generate migrations, queries, and reporting logic with high accuracy because SQL is universally represented in training data.
- **MMKV for fast preferences** — auth tokens, feature flags, and UI state are read synchronously with ~30x less latency than SQLite. Built-in AES encryption. No overhead of a full database for simple key-value access.

### Negative

- **SQLDelight learning curve** — developers unfamiliar with SQLDelight must learn the `.sq` file format, code generation pipeline, and driver configuration. This is a one-time cost but adds to onboarding.
- **SQLite WASM on web is experimental** — web persistence depends on OPFS (Origin Private File System) or IndexedDB backing. Browser support varies, and SharedArrayBuffer headers may be required. This is the weakest platform for the SQLite strategy.
- **SQLCipher key management complexity** — encryption keys must be securely generated, stored in platform keystores, and managed across app updates. Key rotation and recovery add complexity. A lost key means lost data (by design, for security).
- **No built-in reactive streams** — SQLDelight provides `asFlow()` extensions via `sqldelight-coroutines`, but it's not as automatic as WatermelonDB's lazy-loading reactive queries. UI observation of database changes requires explicit Flow collection.
- **MMKV has no web support** — must fall back to `multiplatform-settings` or `localStorage` on the web target. This creates a minor platform split for the preferences layer.
- **Migration management is manual** — SQLDelight supports versioned migrations via numbered `.sqm` files, but migrations must be written by hand (no automatic diff-based migration generation like Drift or Room auto-migrations).

### Risks

| Risk                               | Severity | Mitigation                                                                                                                                                                                   |
| ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite WASM web persistence        | Medium   | Use OPFS backend (supported in Chrome, Firefox, Safari). Fall back to IndexedDB persistence. PowerSync's web SDK handles this abstraction. Test persistence across browsers in CI.           |
| SQLCipher key loss                 | High     | Store encryption keys in platform keystores (not in the database). Document recovery procedures. On first launch, generate a random 256-bit key and store it securely. Never hardcode keys.  |
| Schema migration errors            | Medium   | Test migrations against real data in CI. SQLDelight validates SQL at compile time. Use a versioned migration strategy: `1.sqm`, `2.sqm`, etc. Never alter existing migration files.          |
| MMKV web fallback inconsistency    | Low      | Abstract key-value storage behind a `Settings` interface in `commonMain`. Use `multiplatform-settings` library which provides platform-appropriate backends.                                 |
| SQLite concurrent write contention | Low      | SQLite uses WAL mode by default, supporting concurrent reads with serialized writes. For a single-user app, write contention is not a concern. Batch writes in transactions for performance. |

## Implementation Notes

### Package Structure

```
packages/models/
├── src/
│   ├── commonMain/
│   │   ├── kotlin/finance/
│   │   │   ├── db/
│   │   │   │   ├── DriverFactory.kt       ← expect class for platform drivers
│   │   │   │   └── DatabaseProvider.kt     ← Singleton database instance
│   │   │   ├── repository/
│   │   │   │   ├── AccountRepository.kt
│   │   │   │   ├── TransactionRepository.kt
│   │   │   │   └── CategoryRepository.kt
│   │   │   └── models/
│   │   │       ├── Transaction.kt          ← Domain model (not DB entity)
│   │   │       ├── Account.kt
│   │   │       └── CategorySpending.kt
│   │   └── sqldelight/
│   │       └── finance/db/
│   │           ├── Account.sq              ← Schema + queries
│   │           ├── Transaction.sq
│   │           ├── Category.sq
│   │           └── migrations/
│   │               ├── 1.sqm               ← v1 → v2 migration
│   │               └── 2.sqm               ← v2 → v3 migration
│   ├── androidMain/
│   │   └── kotlin/finance/db/
│   │       └── DriverFactory.kt            ← AndroidSqliteDriver + SQLCipher
│   ├── iosMain/
│   │   └── kotlin/finance/db/
│   │       └── DriverFactory.kt            ← NativeSqliteDriver + SQLCipher
│   ├── jvmMain/
│   │   └── kotlin/finance/db/
│   │       └── DriverFactory.kt            ← JdbcSqliteDriver
│   └── jsMain/
│       └── kotlin/finance/db/
│           └── DriverFactory.kt            ← WebWorkerDriver (wa-sqlite)
├── build.gradle.kts
└── README.md
```

### SQLDelight Gradle Configuration

```kotlin
// packages/models/build.gradle.kts
plugins {
    kotlin("multiplatform")
    id("app.cash.sqldelight") version libs.versions.sqldelight
}

kotlin {
    androidTarget()
    iosX64()
    iosArm64()
    iosSimulatorArm64()
    jvm()
    js(IR) { browser() }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.sqldelight.runtime)
            implementation(libs.sqldelight.coroutines)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.datetime)
        }
        androidMain.dependencies {
            implementation(libs.sqldelight.android.driver)
            implementation(libs.sqlcipher.android)
        }
        val iosMain by creating {
            dependencies {
                implementation(libs.sqldelight.native.driver)
            }
        }
        jvmMain.dependencies {
            implementation(libs.sqldelight.jvm.driver)
        }
        jsMain.dependencies {
            implementation(libs.sqldelight.js.driver)
        }
    }
}

sqldelight {
    databases {
        create("FinanceDatabase") {
            packageName.set("finance.db")
            schemaOutputDirectory.set(file("src/commonMain/sqldelight/finance/db/schema"))
            verifyMigrations.set(true)
        }
    }
}
```

### MMKV Integration

```kotlin
// packages/core/src/commonMain/kotlin/finance/preferences/AppPreferences.kt
expect class AppPreferences {
    fun getString(key: String, default: String = ""): String
    fun putString(key: String, value: String)
    fun getLong(key: String, default: Long = 0L): Long
    fun putLong(key: String, value: Long)
    fun getBoolean(key: String, default: Boolean = false): Boolean
    fun putBoolean(key: String, value: Boolean)
    fun remove(key: String)
    fun clear()
}

// Standard keys
object PreferenceKeys {
    const val LAST_SYNC_TIMESTAMP = "last_sync_timestamp"
    const val SELECTED_ACCOUNT_ID = "selected_account_id"
    const val THEME_MODE = "theme_mode"           // "light", "dark", "system"
    const val ONBOARDING_COMPLETE = "onboarding_complete"
    const val CURRENCY_DEFAULT = "currency_default"
    const val BIOMETRIC_ENABLED = "biometric_enabled"
}

// packages/core/src/androidMain/kotlin/finance/preferences/AppPreferences.kt
import com.tencent.mmkv.MMKV

actual class AppPreferences(context: Context) {
    init { MMKV.initialize(context) }
    private val mmkv = MMKV.defaultMMKV(MMKV.SINGLE_PROCESS_MODE, "finance-encryption-key")

    actual fun getString(key: String, default: String): String = mmkv.decodeString(key, default) ?: default
    actual fun putString(key: String, value: String) { mmkv.encode(key, value) }
    actual fun getLong(key: String, default: Long): Long = mmkv.decodeLong(key, default)
    actual fun putLong(key: String, value: Long) { mmkv.encode(key, value) }
    actual fun getBoolean(key: String, default: Boolean): Boolean = mmkv.decodeBool(key, default)
    actual fun putBoolean(key: String, value: Boolean) { mmkv.encode(key, value) }
    actual fun remove(key: String) { mmkv.removeValueForKey(key) }
    actual fun clear() { mmkv.clearAll() }
}
```

### Migration Strategy

SQLDelight migrations are versioned `.sqm` files applied sequentially:

```sql
-- packages/models/src/commonMain/sqldelight/finance/db/migrations/1.sqm
-- Migration v1 → v2: Add recurring transactions

CREATE TABLE recurring_rule (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES account(id),
    category_id TEXT REFERENCES category(id),
    amount_cents INTEGER NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    description TEXT NOT NULL,
    frequency TEXT NOT NULL,      -- 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'
    start_date TEXT NOT NULL,
    end_date TEXT,
    next_occurrence TEXT NOT NULL,
    is_active INTEGER AS Boolean NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    sync_version INTEGER NOT NULL DEFAULT 0,
    is_synced INTEGER AS Boolean NOT NULL DEFAULT 0
);

CREATE INDEX idx_recurring_user ON recurring_rule(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recurring_next ON recurring_rule(next_occurrence) WHERE is_active = 1 AND deleted_at IS NULL;
```

### Key Dependencies

```kotlin
// gradle/libs.versions.toml (additions for local storage)
[versions]
sqldelight = "2.1.0"
sqlcipher-android = "4.6.0"
mmkv = "1.3.5"
multiplatform-settings = "1.2.0"

[libraries]
sqldelight-runtime = { module = "app.cash.sqldelight:runtime", version.ref = "sqldelight" }
sqldelight-coroutines = { module = "app.cash.sqldelight:coroutines-extensions", version.ref = "sqldelight" }
sqldelight-android-driver = { module = "app.cash.sqldelight:android-driver", version.ref = "sqldelight" }
sqldelight-native-driver = { module = "app.cash.sqldelight:native-driver", version.ref = "sqldelight" }
sqldelight-jvm-driver = { module = "app.cash.sqldelight:sqlite-driver", version.ref = "sqldelight" }
sqldelight-js-driver = { module = "app.cash.sqldelight:web-worker-driver", version.ref = "sqldelight" }
sqlcipher-android = { module = "net.zetetic:sqlcipher-android", version.ref = "sqlcipher-android" }
mmkv = { module = "com.tencent:mmkv", version.ref = "mmkv" }
multiplatform-settings = { module = "com.russhwolf:multiplatform-settings", version.ref = "multiplatform-settings" }
```

## References

- [SQLDelight Documentation](https://cashapp.github.io/sqldelight/)
- [SQLDelight KMP Guide](https://cashapp.github.io/sqldelight/2.0.2/multiplatform_sqlite/)
- [SQLCipher by Zetetic](https://www.zetetic.net/sqlcipher/)
- [SQLCipher Android](https://github.com/nicoleduran/sqlcipher-android)
- [MMKV by Tencent](https://github.com/Tencent/MMKV)
- [Multiplatform Settings](https://github.com/russhwolf/multiplatform-settings)
- [SQLite WASM Persistence](https://www.powersync.com/blog/sqlite-persistence-on-the-web)
- [WatermelonDB](https://watermelondb.dev/)
- [Realm Deprecation Discussion](https://github.com/realm/realm-js/discussions/6884)
- Research: `research-local-storage.md` (project research document, 2025)
