---
applyTo: 'packages/**'
---

# Instructions for Shared Packages

You are working in the `packages/` directory, which contains shared libraries consumed by all platform apps.

## Package Subdirectories

- `packages/core/` — Core business logic (budgeting, categorization, goal tracking, analytics)
- `packages/models/` — Shared data models and schemas (accounts, transactions, budgets, goals)
- `packages/sync/` — Data synchronization engine (conflict resolution, offline queue, delta sync)

## Guidelines

- Code here must be platform-agnostic — no platform-specific APIs or UI code
- Prefer pure functions and immutable data structures
- Every public API must have comprehensive documentation comments
- Write thorough unit tests for all business logic (target >90% coverage)
- Use semantic versioning for package interfaces
- Data models must support schema migration/evolution
- The sync engine must handle conflict resolution deterministically
- Financial calculations must use appropriate precision (avoid floating point for money)
- All monetary values should use the smallest currency unit (cents, not dollars)

## Shared-Code Ownership

- `@native-app-engineer` leads `packages/core/`, `packages/models/`, `packages/sync/`, `packages/import/`, `gradle/libs.versions.toml`, and `settings.gradle.kts`.
- `@finance-domain` remains the correctness lead for money algorithms only: integer minor units, rounding, budgets, goals, recurrence, categorization, reports, and currency behavior. It does not own source-set structure, schemas, repositories, or Gradle configuration.
- `@data-engineer` co-reviews only product telemetry contracts in `AnalyticsEvent.kt`, `AnalyticsTracker.kt`, and `BufferedAnalyticsTracker.kt`. Financial reports, balances, transactions, and the domain event bus are not telemetry.
- `packages/design-tokens/` remains owned by `@design-engineer` and follows `tokens.instructions.md`.
- Client SQLDelight schemas and migrations remain shared/native code. Cloud PostgreSQL migrations, RLS, seed data, and PowerSync bucket rules belong to `@database-engineer`; schema changes must be serialized across both owners.
- Financial chart and category palettes must use color-vision-deficiency-safe semantic tokens. Positive, negative, warning, and neutral states must remain distinguishable without color through labels, icons, patterns, or direct values.

## Monitoring Interfaces

`packages/core/src/commonMain/kotlin/com/finance/core/monitoring/` contains cross-platform monitoring contracts:

- **`CrashReporter`** — Error/crash reporting interface. Implement per-platform (Crashlytics on Android, MetricKit on iOS).
- **`MetricsCollector`** — Performance metrics collection (sync durations, query latency).
- **`SyncHealthMonitor`** — Sync engine health tracking (connection state, last-sync time, error rates).

These are `commonMain` interfaces — platform `actual` implementations live in `androidMain`, `iosMain`, etc. When adding new monitoring capabilities, define the interface in `commonMain` first.

## i18n Framework

`packages/core` includes an internationalization framework for multi-language financial terminology. All user-facing strings in shared business logic must use the i18n layer rather than hardcoded English strings.

## KMP (Kotlin Multiplatform) Requirements

- Code must compile for applicable KMP targets per package:
  - **packages/core** (business logic): `commonMain`, `iosMain`, `jvmMain`, `jsMain`
  - **packages/models** (data models): `commonMain`, `iosMain`, `androidMain`, `jvmMain`, `jsMain`
  - **packages/sync** (sync engine): `commonMain`, `iosMain`, `androidMain`, `jvmMain`, `jsMain`
- Use `expect`/`actual` declarations for platform-specific APIs — keep `expect` in `commonMain`, `actual` in each target source set
- Use **SQLDelight** for all database access — define schemas and queries in `.sq` files, never write raw SQL strings in Kotlin
- Use **kotlinx-datetime** for all date/time operations — no `java.time` or platform date APIs in shared code
- Use **kotlinx-serialization** for all serialization — annotate models with `@Serializable`
- All monetary values must be `Long` (cents) — enforce with Kotlin value classes (e.g., `@JvmInline value class Cents(val amount: Long)`)
- Test with **kotlin.test** — all tests must pass on every target (`commonTest`, `iosTest`, `androidTest`, `jvmTest`, `jsTest`)
- Kotlin lint: **detekt** runs in CI via GitHub Actions workflow. Follow detekt rules for code style and complexity.

## Financial and Telemetry Boundaries

- Treat `Cents(Long)` as integer currency minor units and carry the ISO 4217 currency/scale with every amount; never assume every currency has two decimal places.
- Money-affecting multiplication, division, allocation, conversion, and percentages require exact integer/rational handling, checked overflow, and `HALF_EVEN` rounding.
- Product telemetry must be consent-gated, bounded-cardinality, and free of PII, account identifiers, balances, transaction details, and raw financial amounts.
- Monitoring contracts may report durations, counts, states, and error categories, but never financial payloads.

## Approved Model Additions

The following fields must be added to shared models in `packages/models` and corresponding `.sq` schemas in `packages/core`:

- **All models**: `ownerId: String` — references the authenticated user; required on all sync-enabled models
- **Transaction**: `transferTransactionId: String?` (paired transfer leg), `recurringRuleId: String?` (originating rule)
- **Budget**: `isRollover: Boolean` (default `false`) — carry unused budget to next period
- **Goal**: `accountId: String?` (linked funding account), `status: GoalStatus` (sealed/enum: `Active`, `Completed`, `Archived`)
