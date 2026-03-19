---
name: financial-modeling
description: >
  Financial calculation and modeling knowledge for budgeting, transaction
  processing, goal tracking, reporting, and data export. Use for topics related
  to money, budget, transaction, currency, financial calculation, balance, or
  accounting.
---

# Financial Modeling Skill

This skill provides domain knowledge for implementing correct financial calculations, reporting, and export flows in the Finance application.

## Money Representation

### The Golden Rule: No Floating Point

```
WRONG: let balance = 19.99          // floating point — will cause rounding errors
RIGHT: let balanceCents = 1999      // integer cents — exact representation
RIGHT: let balance = Decimal("19.99") // fixed-precision decimal
```

- Store monetary values as integers in the smallest currency unit.
- Keep the ISO 4217 currency code alongside every amount.
- Convert `Cents` to a decimal display string only when serializing or rendering.

## Current Export Module

The repository now has a dedicated export module in `packages/core/src/commonMain/kotlin/com/finance/core/export/`.

### Core Types

- `DataExportService.kt` — object singleton that orchestrates export generation.
- `ExportSerializer.kt` — format contract for export implementations.
- `JsonExportSerializer.kt` — JSON envelope serializer.
- `CsvExportSerializer.kt` — multi-section CSV serializer.
- `ExportData.kt` — input container for accounts, transactions, categories, budgets, and goals.
- `ExportTypes.kt` — `ExportResult`, `ExportMetadata`, `ExportProgress`, `ExportOutcome`, and `ExportError`.
- `Sha256.kt` — multiplatform SHA-256 implementation used for checksums and anonymized user IDs.

### DataExportService Responsibilities

- Runs the export pipeline in four phases: `GATHERING_DATA`, `SERIALIZING`, `COMPUTING_CHECKSUM`, and `COMPLETE`.
- Builds `ExportMetadata` with entity counts, schema version, export timestamp, and a SHA-256 user hash.
- Computes a SHA-256 checksum for every export payload before returning `ExportResult`.
- Returns `ExportOutcome.Success` or `ExportOutcome.Failure` instead of throwing business-logic errors.

## Serialization Rules

- `ExportSerializer` implementations are responsible for stripping sync-internal fields such as `syncVersion` and `isSynced`.
- Dates and timestamps are serialized as ISO 8601 strings.
- JSON exports wrap data in an envelope with metadata and entity counts.
- CSV exports emit metadata plus separate sections for accounts, transactions, categories, budgets, and goals.
- Monetary values are serialized as decimal display strings paired with currency codes.

## Integrity and Privacy

- `Sha256.hexDigest(...)` is the canonical checksum implementation for exports.
- `DataExportService.hashUserId(...)` prefixes anonymized IDs as `sha256:<digest>`.
- Export checksums are returned with `ExportResult` so downstream consumers can verify integrity.
- Export callers must pre-filter soft-deleted records before constructing `ExportData`.

## Financial Modeling Guidance

### Budgeting

- Use zero-based or envelope-style allocation semantics for category budgets.
- Keep rollover and overspending rules explicit rather than implicit.
- Recalculate availability from allocations, spending, and carry-over values.

### Goals

- Track goal amounts in minor units.
- Recompute projections whenever contributions, deadlines, or funding sources change.
- Show both percentage progress and absolute values.

### Reporting

- Net worth remains: assets minus liabilities.
- Spending analysis should compare actuals to budget and highlight pacing over time.
- Export output is part of the reporting surface because portability is a compliance feature, not just a transport concern.

## Testing Focus

- Test rounding boundaries, negative amounts, zero values, and high-value totals.
- Test serializer output for deterministic ordering and stable schemas.
- Test checksum generation with known fixtures.
- Test that exported data never includes sync-only fields or raw user IDs.
