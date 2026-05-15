# ADR-0022: Conflict Resolution Beyond Last-Write-Wins

## Status

Proposed

## Date

2026-05-15

## Context

Finance's sync architecture (ADR-0002) uses PowerSync for bidirectional delta sync between local SQLite and Supabase PostgreSQL. The current conflict resolution infrastructure in `packages/sync/src/commonMain/kotlin/com/finance/sync/conflict/` already defines a `ConflictResolver` interface, a `ConflictStrategy` enum, and four resolver implementations:

- **`LastWriteWinsResolver`** — timestamp comparison; latest write wins.
- **`MergeResolver`** — field-level merge; non-conflicting fields are combined.
- **`ServerWinsResolver`** — server always wins.
- **`ClientWinsResolver`** — client always wins.

The `ConflictStrategy` companion maps tables to strategies: `budgets`, `goals`, and `households` use `MERGE`; all others default to `LAST_WRITE_WINS`.

### Problem: LWW is Unsafe for Financial Data

Last-write-wins silently discards data. In a household finance app where multiple members edit shared records, this causes real financial harm:

**Scenario 1 — Concurrent Budget Edits:**
Alice changes the grocery budget from $500 → $600. Bob changes it from $500 → $450 and adds a note. With LWW, one edit is silently lost.

**Scenario 2 — Goal Contribution from Multiple Devices:**
A user adds $50 on their phone (`current_cents` = 5050) and $30 on their tablet (`current_cents` = 5030), both starting from 5000. LWW picks 5030 (latest), losing the $50 contribution entirely. The correct answer is 5080.

**Scenario 3 — Concurrent Category Reorganization:**
Two members move "Dining" to different parent categories simultaneously — a tree conflict that field-level merge cannot resolve.

### Existing Infrastructure Strengths

The current `ConflictResolver` and `SyncConflict` types are well-designed:

- `SyncConflict` captures both local and server data, versions, timestamps, and operations.
- `ConflictResolution` is a sealed class with `AcceptServer`, `AcceptLocal`, `Merged`, and `Delete` variants.
- `MergeResolver` already stores rejected values in `__conflict_<field>` annotation keys.
- `resolveAll()` enables cross-record resolution logic.

The infrastructure supports richer strategies — what's missing is the **policy layer** that classifies fields and entities by risk level.

## Decision

**Implement a tiered conflict resolution strategy based on field sensitivity, with field-level merge for most data and mandatory user resolution for monetary amounts on shared entities.**

### Tier 1: Safe Auto-Merge (No User Intervention)

Fields where independent edits are semantically independent and can be combined without risk:

| Entity      | Fields                                                         | Strategy          |
| ----------- | -------------------------------------------------------------- | ----------------- |
| All         | `name`, `note`, `icon`, `color`, `sort_order`                  | Field-level merge |
| Account     | `is_archived`                                                  | Field-level merge |
| Transaction | `payee`, `note`, `tags`, `category_id`, `status`               | Field-level merge |
| Budget      | `name`, `start_date`, `end_date`, `is_rollover`                | Field-level merge |
| Goal        | `name`, `target_date`, `icon`, `color`, `status`, `account_id` | Field-level merge |
| Category    | `is_income`, `is_system`                                       | Field-level merge |
| Household   | `name`                                                         | Field-level merge |

When both sides modify the same non-monetary field, the **server version wins** as a deterministic tiebreaker, and the local value is preserved in `__conflict_<field>` for audit.

### Tier 2: Additive Merge (Automatic with Special Logic)

Fields representing cumulative values where concurrent edits should be **summed**, not overwritten:

| Entity | Field           | Strategy                                                                                                   |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------- |
| Goal   | `current_cents` | **Delta merge**: compute each side's delta from the last-synced base value; apply both deltas to the base. |

**Delta merge algorithm:**

```
base = last_synced_value  (stored in sync metadata)
local_delta = local_value - base
server_delta = server_value - base
resolved = base + local_delta + server_delta
```

This requires storing the `last_synced_base` value per field in the sync metadata table. The sync engine already tracks `sync_version` per row; extend with a `base_snapshot` JSON column for delta-mergeable fields.

### Tier 3: User Resolution Required (Monetary Conflicts on Shared Entities)

When two household members concurrently modify a monetary amount on a shared entity, automatic resolution risks financial incorrectness. These conflicts require explicit user resolution:

| Entity      | Fields          | Trigger                                           |
| ----------- | --------------- | ------------------------------------------------- |
| Budget      | `amount`        | Both sides modified; entity is shared (household) |
| Transaction | `amount`        | Both sides modified; entity is shared             |
| Goal        | `target_amount` | Both sides modified                               |

**Resolution flow:**

1. The sync engine detects the conflict and emits a `ConflictResolution.PendingUserReview` (new sealed variant).
2. The conflicting record is stored in a local `pending_conflicts` table with both versions.
3. A non-blocking notification is surfaced in the UI (badge on sync status indicator).
4. The user sees both values side-by-side and chooses one, edits to a new value, or dismisses.
5. The resolved value is committed as a new mutation and synced normally.
6. Until resolved, the **server value is displayed** (consistent across devices) with a visual conflict indicator.

### Tier 4: Structural Conflicts (Requires Server Arbitration)

Conflicts that cannot be resolved client-side because they involve structural integrity:

| Conflict Type            | Example                                          | Resolution                                                    |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| Tree/hierarchy conflicts | Two members move a category to different parents | Server-wins + notification                                    |
| Role-based access change | Member demoted while offline edits are queued    | Server-wins; reject queued mutations with expired permissions |
| Delete vs. edit          | One side deletes a record; the other edits it    | Delete wins (preserve audit trail)                            |

## Alternatives Considered

### Full CRDT-Based Resolution

Replace all conflict resolution with CRDTs (e.g., Automerge, Yjs) for automatic merge of all data types.

**Rejected because:**

- CRDTs add significant complexity and bundle size for a use case with low write contention (personal/household finance, not real-time collaboration).
- PowerSync's sync model is change-based, not CRDT-based — integrating CRDTs would require replacing the sync engine.
- The semantic correctness problem (which budget amount is "right"?) cannot be solved by CRDTs — they guarantee convergence, not correctness.

### Operational Transform (OT)

Track operations (deltas) rather than state, and transform concurrent operations for consistent application order.

**Rejected because:**

- OT requires a centralized transform server — contradicts edge-first architecture.
- Operational history grows unbounded without compaction, increasing storage and sync overhead.
- The problem space (infrequent concurrent edits to shared financial records) doesn't justify OT's complexity.

### Always Require Manual Resolution

Show a conflict dialog for every conflicting field, not just monetary amounts.

**Rejected because:**

- Creates excessive UX friction for low-risk conflicts (e.g., both sides changed a note).
- Users would become desensitized to conflict dialogs, increasing the risk of dismissing monetary conflicts carelessly.
- Field-level merge already handles independent non-monetary edits safely.

## Consequences

### Positive

- Monetary values on shared entities are never silently overwritten — users always see and resolve conflicts.
- Goal contributions from multiple devices are correctly summed via delta merge, eliminating the most common data loss scenario.
- Low-risk field edits resolve automatically without user friction.
- The existing `ConflictResolver` infrastructure is extended, not replaced — minimal disruption.
- Conflict audit trail (`__conflict_<field>` annotations, `pending_conflicts` table) enables debugging and support.

### Negative

- Delta merge requires storing base snapshot values, increasing local storage slightly (~100 bytes per delta-mergeable row).
- The `pending_conflicts` table and resolution UI add implementation complexity on all four platforms.
- Users must understand and resolve monetary conflicts — an unfamiliar interaction pattern for most finance apps.
- Edge case: if a user ignores pending conflicts for an extended period, the displayed (server) value may diverge significantly from their intended value.

## Implementation Notes

- **New sealed variant**: Add `PendingUserReview(val localData: Map<String, String?>, val serverData: Map<String, String?>)` to `ConflictResolution` in `packages/sync/`.
- **Pending conflicts table**: Add a `pending_conflicts` SQLDelight schema in `packages/sync/` with columns: `id`, `table_name`, `record_id`, `local_data` (JSON), `server_data` (JSON), `detected_at`, `resolved_at`, `resolution`.
- **Delta merge fields**: Extend `ConflictStrategy` companion with a `DELTA_FIELDS` map: `mapOf("goals" to setOf("current_cents"))`.
- **Base snapshot storage**: Add `sync_base_snapshot TEXT` column to sync metadata, populated on each successful sync.
- **UI component**: Each platform implements a `ConflictResolutionSheet` / `ConflictResolutionDialog` showing both values with "Keep Mine", "Keep Theirs", and "Edit" options.
- **Feature flag**: Gate Tier 2 (delta merge) and Tier 3 (user resolution) behind `conflict_resolution_v2` feature flag for gradual rollout.
- **Test scenarios**: Add integration tests in `packages/sync/src/commonTest/` reproducing all four problem scenarios from the Context section.
