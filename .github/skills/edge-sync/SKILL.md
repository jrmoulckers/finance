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

- `packages/sync/src/commonMain/kotlin/com/finance/sync/conflict/ConflictStrategy.kt` ships four production strategies:
  - `LAST_WRITE_WINS` via `LastWriteWinsResolver.kt`
  - `MERGE` via `MergeResolver.kt`
  - `CLIENT_WINS` via `ClientWinsResolver.kt`
  - `SERVER_WINS` via `ServerWinsResolver.kt`
- Table defaults: `budgets`, `goals`, and `households` use merge; other tables fall back to last-write-wins. `CLIENT_WINS` and `SERVER_WINS` are available for custom override.
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

## Sync Client and Auth

- `SyncClient.kt` provides the production sync client coordinating `SyncEngine`, `MutationQueue`, and `DeltaSyncManager`.
- `packages/sync/src/commonMain/kotlin/com/finance/sync/auth/` contains `AuthManager.kt`, `AuthSession.kt`, `AuthCredentials.kt`, `PKCEHelper.kt`, and `TokenManager.kt` for cross-platform auth integration.
- Platform-specific token storage and SHA-256 implementations live in `iosMain`, `androidMain`, `jsMain`, and `jvmMain`.

## Cryptography

- `packages/sync/src/commonMain/kotlin/com/finance/sync/crypto/` contains envelope encryption (`EnvelopeEncryption.kt`), field-level encryption (`FieldEncryptor.kt`), crypto-shredding (`CryptoShredder.kt`), household key management (`HouseholdKeyManager.kt`), and key derivation/rotation.

## Test Harness

- `packages/sync/src/commonTest/` contains 35+ test files covering all sync modules.
- `SyncIntegrationTestHarness.kt` provides a simulated `SyncClient` for multi-device integration tests.
- `DefaultSyncEngineTest.kt` and `SyncClientTest.kt` verify the production engine lifecycle.
- `OfflineResilienceTest.kt` and `SyncScenarioTest.kt` cover integration scenarios.
- Treat code under `packages/sync/src/` as the source of truth for sync capabilities.
