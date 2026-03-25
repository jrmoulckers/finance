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

## Monitoring Interfaces

`packages/core/src/commonMain/kotlin/com/finance/core/monitoring/` contains cross-platform monitoring contracts:

- **`CrashReporter`** — Error/crash reporting interface. Implement per-platform (Crashlytics on Android, MetricKit on iOS).
- **`MetricsCollector`** — Performance metrics collection (sync durations, query latency).
- **`SyncHealthMonitor`** — Sync engine health tracking (connection state, last-sync time, error rates).

These are `commonMain` interfaces — platform `actual` implementations live in `androidMain`, `iosMain`, etc. When adding new monitoring capabilities, define the interface in `commonMain` first.

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

## Approved Model Additions

The following fields must be added to shared models in `packages/models` and corresponding `.sq` schemas in `packages/core`:

- **Transaction**: `transferTransactionId: String?` (paired transfer leg), `recurringRuleId: String?` (originating rule)
- **Budget**: `isRollover: Boolean` (default `false`) — carry unused budget to next period
- **Goal**: `accountId: String?` (linked funding account), `status: GoalStatus` (sealed/enum: `Active`, `Completed`, `Archived`)
