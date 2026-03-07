# Sync

Data synchronization engine for the Finance app.

## Overview

`packages/sync` will handle offline-first data synchronization between local SQLite databases and the remote backend. It depends on `packages/models` for entity definitions. This package is currently **scaffolded but not yet implemented** — the source directory contains only a `.gitkeep` placeholder.

The planned approach uses PowerSync for conflict resolution and delta sync.

## Planned Components

- **Sync client** — Manages connection to the PowerSync service and handles push/pull cycles
- **Conflict resolution** — Deterministic strategy for resolving concurrent edits across devices
- **Offline queue** — Buffers local mutations while offline for replay on reconnect
- **Delta sync** — Transfers only changed records using `syncVersion` fields on each model

## Usage

Once implemented, add the dependency in `build.gradle.kts`:

```kotlin
commonMain.dependencies {
    implementation(project(":packages:sync"))
}
```

## Development

```bash
# Build
node tools/gradle.js :packages:sync:build

# Run tests
node tools/gradle.js :packages:sync:allTests
```

## Status

🚧 **Scaffolded** — no production code yet. See the project roadmap for timeline.
