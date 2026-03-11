---
name: edge-sync
description: >
  Knowledge about edge computing, offline-first architecture, and data
  synchronization patterns. Use for topics related to sync, offline,
  conflict resolution, CRDT, delta sync, replication, or edge computing.
---

# Edge Sync Skill

This skill provides domain knowledge for implementing the edge-first data synchronization architecture used by the Finance application.

## Architecture Overview

Finance follows an edge-first / offline-first architecture:

```
┌─────────────────┐         ┌─────────────────┐
│  Client Device   │  sync   │   Backend API    │
│  (edge compute)  │◄───────►│  (sync layer)    │
│                  │         │                  │
│  ┌────────────┐  │         │  ┌────────────┐  │
│  │ Local DB   │  │         │  │ Central DB │  │
│  │ (SQLite/   │  │         │  │ (PostgreSQL│  │
│  │  Realm/etc)│  │         │  │  or similar)│ │
│  └────────────┘  │         │  └────────────┘  │
└─────────────────┘         └─────────────────┘
```

## Key Patterns

### Offline-First

- The app must be fully functional without network connectivity
- All CRUD operations happen against the local database first
- Sync is opportunistic — happens when connectivity is available
- User should never be blocked by network state

### Conflict Resolution Strategy

- Use **last-write-wins (LWW) with vector clocks** for simple fields
- Use **operational transforms or CRDTs** for complex data (budgets, shared items)
- Present merge conflicts to the user only when automatic resolution isn't possible
- Always preserve both versions in conflict — never silently discard data

### Delta Sync Protocol

- Track changes with monotonic sequence numbers per client
- Sync only changed records since last successful sync
- Use checksum verification to detect data corruption
- Support full re-sync as a recovery mechanism

### Sync Queue

- Maintain an ordered queue of pending changes
- Retry with exponential backoff on failure
- Deduplicate operations before sending
- Support batch operations to minimize network calls

## Implementation Guidelines

1. **Local database** — Use a platform-appropriate embedded database (SQLite, Realm, Core Data, Room)
2. **Change tracking** — Every mutable record needs a `lastModified` timestamp and `syncVersion` counter
3. **Soft deletes** — Never hard-delete synced records; mark as deleted and propagate
4. **Idempotency** — All sync operations must be idempotent (safe to retry)
5. **Compression** — Compress sync payloads for bandwidth efficiency
6. **Background sync** — Use platform background task APIs (BackgroundTasks on iOS, WorkManager on Android)

## Testing Approach

- Test offline scenarios (create while offline, sync when online)
- Test conflict scenarios (same record modified on two devices)
- Test interruption scenarios (sync interrupted mid-transfer)
- Test large dataset sync (performance with thousands of transactions)
- Simulate network conditions (latency, packet loss, disconnection)
