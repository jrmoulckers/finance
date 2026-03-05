---
applyTo: "packages/**"
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

## KMP (Kotlin Multiplatform) Requirements

- Code must compile for **all** KMP targets: `commonMain`, `iosMain`, `androidMain`, `jvmMain`, `jsMain`
- Use `expect`/`actual` declarations for platform-specific APIs — keep `expect` in `commonMain`, `actual` in each target source set
- Use **SQLDelight** for all database access — define schemas and queries in `.sq` files, never write raw SQL strings in Kotlin
- Use **kotlinx-datetime** for all date/time operations — no `java.time` or platform date APIs in shared code
- Use **kotlinx-serialization** for all serialization — annotate models with `@Serializable`
- All monetary values must be `Long` (cents) — enforce with Kotlin value classes (e.g., `@JvmInline value class Cents(val amount: Long)`)
- Test with **kotlin.test** — all tests must pass on every target (`commonTest`, `iosTest`, `androidTest`, `jvmTest`, `jsTest`)
