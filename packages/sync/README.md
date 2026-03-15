# Sync

Data synchronisation engine for the Finance app.

## Overview

`packages/sync` implements offline-first data synchronisation between local
SQLite databases and the remote backend. It depends on `packages/models` for
entity definitions and is consumed by every platform client (iOS, Android,
Web, Desktop).

The sync layer follows a **pull → conflict resolution → push** cycle:

1. **Pull** — fetch remote changes via delta sync (only records newer than
   the last-known sequence per table).
2. **Conflict Resolution** — detect overlapping edits between local mutations
   and server changes, then resolve them using a configurable strategy
   (last-write-wins, merge, server-wins, or client-wins).
3. **Push** — drain the local mutation queue by sending batched mutations to
   the server.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        SyncClient                           │
│  (high-level facade: auth + lifecycle + reactive state)     │
├─────────────────────────────────────────────────────────────┤
│                     DefaultSyncEngine                       │
│  (orchestrator: connect / sync loop / credential refresh)   │
├──────────────┬──────────────────────┬───────────────────────┤
│ DeltaSyncManager │  ConflictResolver  │   MutationQueue      │
│ (pull + push +   │  (LWW / merge /    │   (offline queue +   │
│  seq tracking)   │  server/client wins)│   coalescing)        │
├──────────────┴──────────────────────┴───────────────────────┤
│                       SyncProvider                          │
│  (backend abstraction — PowerSync or compatible service)    │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Core Types
- **`SyncConfig`** — connection parameters, intervals, retry policy
- **`SyncStatus`** — sealed class for engine state (Idle, Connecting, Syncing, Connected, Error, Disconnected)
- **`SyncCredentials`** — bearer token, user ID, expiry, refresh token
- **`SyncMutation`** — pending local mutation (INSERT / UPDATE / DELETE)
- **`SyncChange`** — server-originated change with sequence number and checksum
- **`SyncResult`** — sealed outcome of a sync cycle (Success / Failure)

### Auth Module (`auth/`)
- **`AuthCredentials`** — sealed hierarchy (EmailPassword, OAuth+PKCE, Passkey, RefreshToken)
- **`AuthSession`** — access + refresh tokens with expiry tracking
- **`AuthManager`** — interface for sign-in / sign-out / token refresh
- **`TokenManager`** — secure token storage and auto-refresh scheduling
- **`PKCEHelper`** — code verifier / challenge generation for OAuth flows

### Conflict Resolution (`conflict/`)
- **`ConflictResolver`** — interface for resolving local vs. server conflicts
- **`ConflictStrategy`** — per-table strategy mapping with four built-in resolvers:
  - `LastWriteWinsResolver` — server timestamp comparison
  - `MergeResolver` — field-level merge for complex entities
  - `ServerWinsResolver` — always accept server version
  - `ClientWinsResolver` — always keep local version

### Offline Queue (`queue/`)
- **`MutationQueue`** — interface with FIFO ordering and operation-aware coalescing
- **`InMemoryMutationQueue`** — thread-safe in-memory implementation using `Mutex`
- **`QueueProcessor`** — batch processing with exponential backoff and dead-letter support

### Delta Sync (`delta/`)
- **`DeltaSyncManager`** — incremental pull with pagination, conflict detection, batched push
- **`SequenceTracker`** — persists per-table sync versions for resumable sync
- **`SyncChecksum`** — CRC-32 integrity verification for pulled changes

### Encryption (`crypto/`)
- **`FieldEncryptor`** — field-level AES-256-GCM encryption for sensitive financial data
- **`EnvelopeEncryption`** — envelope pattern with data encryption keys (DEKs)
- **`HouseholdKeyManager`** — per-household key management and rotation
- **`CryptoShredder`** — secure data deletion via key destruction

### Public API
- **`SyncEngine`** — interface for the sync lifecycle (connect / disconnect / sync)
- **`DefaultSyncEngine`** — production orchestrator with periodic sync loop, credential refresh, exponential backoff, and health monitoring
- **`SyncClient`** — high-level facade combining auth + sync engine + mutation queue

## Usage

### Add the dependency

```kotlin
commonMain.dependencies {
    implementation(project(":packages:sync"))
}
```

### Basic setup

```kotlin
// 1. Configure sync
val config = SyncConfig(
    endpoint = "https://sync.example.com",
    databaseName = "finance.db",
    syncIntervalMs = 30_000L,
)

// 2. Create components
val provider: SyncProvider = // platform-specific implementation
val mutationQueue = InMemoryMutationQueue()
val sequenceTracker = InMemorySequenceTracker()

val deltaSyncManager = DeltaSyncManager(provider, sequenceTracker, config)

val syncEngine = DefaultSyncEngine(
    config = config,
    provider = provider,
    mutationQueue = mutationQueue,
    deltaSyncManager = deltaSyncManager,
)

// 3. Create the client
val syncClient = SyncClient(
    config = config,
    authManager = authManager,
    syncEngine = syncEngine,
    mutationQueue = mutationQueue,
)
```

### Sign in and start syncing

```kotlin
// Sign in with email/password and start the periodic sync loop
val result = syncClient.signInAndSync(
    AuthCredentials.EmailPassword(email, password),
)

result.onSuccess { println("Sync started") }
result.onFailure { error -> println("Sign-in failed: $error") }
```

### Observe sync status

```kotlin
syncClient.syncStatus.collect { status ->
    when (status) {
        is SyncStatus.Idle -> showIdle()
        is SyncStatus.Connecting -> showConnecting()
        is SyncStatus.Syncing -> showProgress(status.progress)
        is SyncStatus.Connected -> showConnected()
        is SyncStatus.Error -> showError(status.error)
        is SyncStatus.Disconnected -> showDisconnected()
    }
}
```

### Force an immediate sync

```kotlin
val result = syncClient.syncNow()
when (result) {
    is SyncResult.Success -> println(
        "Synced: ${result.changesApplied} pulled, ${result.mutationsPushed} pushed"
    )
    is SyncResult.Failure -> println("Sync failed: ${result.error}")
}
```

### Sign out

```kotlin
syncClient.signOut()  // stops sync, clears tokens, clears mutation queue
```

### Health monitoring integration

```kotlin
val healthMonitor = SyncHealthMonitor()

val syncEngine = DefaultSyncEngine(
    config = config,
    provider = provider,
    mutationQueue = mutationQueue,
    deltaSyncManager = deltaSyncManager,
    healthListener = object : SyncHealthListener {
        override fun onSyncSuccess(durationMs: Long, pendingMutations: Int) {
            healthMonitor.recordSyncSuccess(durationMs)
            healthMonitor.updatePendingMutations(pendingMutations)
        }

        override fun onSyncFailure(error: SyncError) {
            healthMonitor.recordSyncFailure()
        }

        override fun onPendingMutationsChanged(count: Int) {
            healthMonitor.updatePendingMutations(count)
        }
    },
)
```

### Automatic credential refresh

```kotlin
val syncEngine = DefaultSyncEngine(
    config = config,
    provider = provider,
    mutationQueue = mutationQueue,
    deltaSyncManager = deltaSyncManager,
    credentialRefresher = {
        val session = authManager.refreshToken().getOrThrow()
        session.toSyncCredentials()
    },
)
```

## Development

```bash
# Build
node tools/gradle.js :packages:sync:build

# Run tests
node tools/gradle.js :packages:sync:allTests
```

## Status

✅ **Implemented** — all core modules are production-ready with comprehensive test coverage.
