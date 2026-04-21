---
name: edge-sync
description: >
  Knowledge about edge computing, offline-first architecture, and data
  synchronization patterns. Use for topics related to sync, offline,
  conflict resolution, delta sync, replication, or edge computing.
---

# Edge Sync Skill

## Architecture: Offline-First Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ Client Device (edge)                                     │
│  SQLite (local DB) ←→ MutationQueue ←→ SyncEngine       │
│       ↕                                    ↕             │
│  UI / Repositories              DeltaSyncManager         │
└───────────────────────────────────┬─────────────────────┘
                                    │ PowerSync protocol
┌───────────────────────────────────┴─────────────────────┐
│ PowerSync Service                                        │
│  sync-rules.yaml → bucket-based selective replication    │
└───────────────────────────────────┬─────────────────────┘
                                    │
┌───────────────────────────────────┴─────────────────────┐
│ Supabase PostgreSQL (source of truth)                    │
│  RLS policies → household_id isolation                   │
└─────────────────────────────────────────────────────────┘
```

**Key principle**: All reads/writes happen against local SQLite. Network is only for sync.

## File Locations

| Component                    | Path                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| Shared sync engine           | `packages/sync/src/commonMain/kotlin/com/finance/sync/`                   |
| Conflict resolvers           | `packages/sync/src/commonMain/.../sync/conflict/`                         |
| Delta sync                   | `packages/sync/src/commonMain/.../sync/delta/`                            |
| Mutation queue               | `packages/sync/src/commonMain/.../sync/queue/`                            |
| Crypto (envelope, shredding) | `packages/sync/src/commonMain/.../sync/crypto/`                           |
| Auth (PKCE, tokens)          | `packages/sync/src/commonMain/.../sync/auth/`                             |
| Android wiring               | `apps/android/src/.../di/SyncModule.kt`, `.../sync/AndroidSyncManager.kt` |
| Web offline queue            | `apps/web/src/db/sync/`                                                   |
| Service worker replay        | `apps/web/src/sw/service-worker.ts`                                       |
| PowerSync rules              | `services/api/powersync/sync-rules.yaml`                                  |

## Shared Sync Components

- **`SyncEngine.kt`** — Connection lifecycle, status flow (`Disconnected → Connecting → Connected → Syncing`)
- **`SyncProvider.kt`** — Backend abstraction (PowerSync-compatible without hard-coding SDK)
- **`SyncClient.kt`** — Production client coordinating engine + queue + delta manager
- **`QueueProcessor.kt`** — Drains mutations with exponential backoff, dead-letters after retry ceiling
- **`DeltaSyncManager.kt`** — Per-table sequence tracking, gap detection, `__checksum` validation

## PowerSync Sync Rules

```yaml
# services/api/powersync/sync-rules.yaml
bucket_definitions:
  by_household:
    parameters:
      - SELECT household_id FROM household_members
        WHERE user_id = token_parameters.user_id AND deleted_at IS NULL
    data:
      - SELECT * FROM accounts WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM transactions WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM budgets WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM goals WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM categories WHERE household_id = bucket.household_id AND deleted_at IS NULL
  user_profile:
    parameters:
      - SELECT id AS user_id FROM users WHERE id = token_parameters.user_id
    data:
      - SELECT * FROM users WHERE id = bucket.user_id AND deleted_at IS NULL
      - SELECT * FROM household_members WHERE user_id = bucket.user_id AND deleted_at IS NULL
```

**Sync rules patterns**:

- Every data query must include `WHERE deleted_at IS NULL` (soft deletes)
- Parameters derive from `token_parameters.user_id` (JWT claim)
- Adding a new table requires: add data query → update KMP schema → update platform data layer

## Conflict Resolution

Four strategies in `packages/sync/src/commonMain/.../sync/conflict/`:

| Strategy          | Resolver                   | Default For                      | Logic                                            |
| ----------------- | -------------------------- | -------------------------------- | ------------------------------------------------ |
| `LAST_WRITE_WINS` | `LastWriteWinsResolver.kt` | Most tables                      | Compares `updated_at` timestamps                 |
| `MERGE`           | `MergeResolver.kt`         | `budgets`, `goals`, `households` | Field-level reconciliation; flags true conflicts |
| `CLIENT_WINS`     | `ClientWinsResolver.kt`    | User preferences                 | Always picks local record                        |
| `SERVER_WINS`     | `ServerWinsResolver.kt`    | Admin-managed data               | Always picks remote record                       |

```kotlin
// Usage pattern
val resolver = ConflictStrategy.resolverFor(tableName)
val resolved = resolver.resolve(localRecord, remoteRecord)
```

**When to use which**:

- Simple CRUD entities → `LAST_WRITE_WINS` (default)
- Complex records with sub-fields (budgets, goals) → `MERGE`
- User-local settings → `CLIENT_WINS`
- Server-authoritative data → `SERVER_WINS`

## Offline Mutation Queue

### KMP Shared Layer

- `MutationQueue.kt` + `InMemoryMutationQueue.kt` — Ordered offline buffering with entity-key deduplication
- `QueueProcessor.kt` — Exponential backoff retry; drops permanently failed mutations after ceiling

### Web Implementation

- `apps/web/src/db/sync/MutationQueue.ts` — IndexedDB-backed durable queue
- `enqueueMutation.ts` — Records writes, requests replay on connectivity
- `replayMutations.ts` — Batch replay, acknowledges successes, dead-letters exhausted
- `apps/web/src/sw/service-worker.ts` — Background Sync replay with online-event fallback

### Android Implementation

- `SyncModule.kt` — Koin wiring for `SyncConfig`, `DeltaSyncManager`, `MutationQueue`, `AndroidSyncManager`
- `AndroidSyncManager.kt` — Wraps shared `SyncEngine`, exposes `StateFlow` for Compose UI
- Endpoint from `BuildConfig.POWERSYNC_URL`

## Delta Sync

- `DeltaSyncManager.kt` tracks per-table sequence numbers via `SequenceTracker`
- Detects gaps in sequences and validates `__checksum` before advancing state
- Can request table-level or global full resync on checksum mismatch
- Tombstones preserved for proper delete propagation

## Cryptography (Sync Layer)

`packages/sync/src/commonMain/.../sync/crypto/`:

- **`EnvelopeEncryption.kt`** — DEK/KEK envelope pattern
- **`FieldEncryptor.kt`** — Field-level encryption for sensitive data (notes, payees)
- **`CryptoShredder.kt`** — GDPR erasure by destroying household DEK
- **`HouseholdKeyManager.kt`** — Per-household key lifecycle and rotation

## Auth Integration

`packages/sync/src/commonMain/.../sync/auth/`:

- `AuthManager.kt` — Cross-platform auth orchestrator
- `TokenManager.kt` — JWT refresh and caching
- `PKCEHelper.kt` — OAuth PKCE flow support
- Platform-specific token storage + SHA-256 in `iosMain`, `androidMain`, `jsMain`, `jvmMain`

## Testing

- **35+ test files** in `packages/sync/src/commonTest/`
- `SyncIntegrationTestHarness.kt` — Simulated multi-device integration tests
- `DefaultSyncEngineTest.kt`, `SyncClientTest.kt` — Engine lifecycle
- `OfflineResilienceTest.kt`, `SyncScenarioTest.kt` — Edge-case scenarios

## Common Patterns

### Adding a new synced table

1. Add Supabase migration (`services/api/supabase/migrations/`)
2. Add to `sync-rules.yaml` data queries
3. Add SQLDelight `.sq` file in `packages/core/`
4. Add KMP model in `packages/models/`
5. Add conflict strategy mapping in `ConflictStrategy.kt`
6. Update platform data layers

### Handling sync errors in UI

```kotlin
// Observe sync state from AndroidSyncManager
val syncState by syncManager.syncState.collectAsState()
when (syncState) {
    SyncStatus.CONNECTED -> // normal
    SyncStatus.SYNCING -> // show subtle indicator
    SyncStatus.ERROR -> // show retry banner
    SyncStatus.DISCONNECTED -> // show offline banner
}
```
