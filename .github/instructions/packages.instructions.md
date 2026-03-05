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
