---
name: edge-sync
description: >
  Knowledge about edge computing, offline-first architecture, and data
  synchronization patterns. Use for topics related to sync, offline,
  conflict resolution, delta sync, replication, or edge computing.
---

# Edge Sync Skill

This skill provides implementation-aware guidance for the Finance app's current offline-first sync stack.

## Current Sync Footprint

- Shared sync primitives live in `packages/sync/src/commonMain/kotlin/com/finance/sync/`.
- Android wiring lives in `apps/android/src/main/kotlin/com/finance/android/sync/` and `apps/android/src/main/kotlin/com/finance/android/di/SyncModule.kt`.
- Web offline replay lives in `apps/web/src/db/sync/` plus `apps/web/src/sw/service-worker.ts`.
- PowerSync selective replication rules live in `services/api/powersync/sync-rules.yaml`.

## Shared Sync Components

- `SyncEngine.kt` defines the connection lifecycle and status flow.
- `SyncProvider.kt` abstracts the backend implementation so the shared layer stays PowerSync-compatible without hard-coding a single SDK.
- `SyncMutation.kt`, `SyncChange.kt`, `SyncStatus.kt`, `SyncConfig.kt`, and `SyncCredentials.kt` hold the cross-platform sync contract.
- `QueueProcessor.kt` drains queued mutations with retry and exponential backoff.
- `DeltaSyncManager.kt` tracks per-table sequence numbers, detects gaps, and validates `__checksum` fields before advancing state.

## Conflict Resolution

- `packages/sync/src/commonMain/kotlin/com/finance/sync/conflict/ConflictStrategy.kt` currently ships two production strategies:
  - `LAST_WRITE_WINS` via `LastWriteWinsResolver.kt`
  - `MERGE` via `MergeResolver.kt`
- Table defaults: `budgets`, `goals`, and `households` use merge; other tables fall back to last-write-wins.
- There are no checked-in `ClientWins` or `ServerWins` strategy classes today, so do not assume those implementations exist.
- `MergeResolver.kt` performs field-level reconciliation and flags unresolved collisions; `LastWriteWinsResolver.kt` uses timestamp/server ordering.

## Queue and Delta Sync Details

- `MutationQueue.kt` plus `InMemoryMutationQueue.kt` provide ordered offline buffering with entity-key deduplication.
- `QueueProcessor.kt` retries failed pushes with exponential backoff and drops permanently failed mutations after the retry ceiling.
- `DeltaSyncManager.kt` works with `SequenceTracker` implementations such as `InMemorySequenceTracker` and can request table-level or global full resyncs.

## Android Integration

- `apps/android/src/main/kotlin/com/finance/android/di/SyncModule.kt` wires `SyncConfig`, `DeltaSyncManager`, `MutationQueue`, token storage, and `AndroidSyncManager`.
- Android reads the sync endpoint from `BuildConfig.POWERSYNC_URL` in `apps/android/build.gradle.kts`.
- `AndroidSyncManager.kt` wraps the shared `SyncEngine` for Compose and WorkManager-friendly lifecycle control and exposes `StateFlow` sync state.
- PowerSync is currently represented as the configured endpoint and sync-rules contract; the shared package still talks through `SyncProvider` rather than a hard-coded PowerSync client type.

## Web Offline Mutation Queue

- `apps/web/src/db/sync/MutationQueue.ts` implements a durable `WebMutationQueue` backed by IndexedDB.
- `enqueueMutation.ts` records local writes and requests replay when the browser regains connectivity.
- `replayMutations.ts` replays batches, acknowledges successes, retries failures, and dead-letters exhausted mutations.
- `apps/web/src/sw/service-worker.ts` replays queued mutations from the service worker, with an online-event fallback on the main thread.
- `apps/web/README.md` documents the queue architecture and replay lifecycle.

## Test Harness and Current Limits

- `packages/sync/src/commonTest/kotlin/com/finance/sync/integration/SyncIntegrationTestHarness.kt` contains a simulated `SyncClient` used for multi-device integration tests.
- No checked-in `DefaultSyncEngine` implementation exists yet. If you need a production engine, start from `SyncEngine` and `SyncProvider` instead of referencing a nonexistent file.
- `packages/sync/README.md` still says the package is scaffolded; treat code under `packages/sync/src/` as the source of truth.
