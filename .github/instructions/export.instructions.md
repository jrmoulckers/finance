---
applyTo: 'packages/core/**/export/**'
---

# Instructions for Data Export Module

You are working in the data export module, which handles GDPR data portability.

## Key Types

- `DataExportService` — orchestrator object singleton
- `ExportSerializer` — interface for format implementations
- `JsonExportSerializer` / `CsvExportSerializer` — format implementations
- `ExportData` — input container
- `ExportResult`, `ExportMetadata`, `ExportProgress` — output types
- `ExportOutcome` / `ExportError` — sealed result types

## Rules

- Never include `syncVersion` or `isSynced` in exported data.
- Monetary values: `Cents(Long)` → display as decimal with currency.
- All dates must be ISO 8601.
- Compute a SHA-256 checksum for every export.
- User IDs must be anonymized via SHA-256 hash.
