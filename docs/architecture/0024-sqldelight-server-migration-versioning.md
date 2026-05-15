# ADR-0024: SQLDelight and Server Migration Versioning Coordination

## Status

Proposed

## Date

2026-05-15

## Context

Finance has **three synchronized schema layers** that must evolve together (as documented in ADR-0019):

1. **SQLDelight schemas** (`packages/models/`, `packages/core/`) — define the local SQLite database on all client platforms (iOS, Android, Web, Windows).
2. **Supabase PostgreSQL migrations** (`services/api/supabase/migrations/`) — define the server-side schema. Currently 40+ migration files using `YYYYMMDDHHMMSS_<description>.sql` naming.
3. **PowerSync sync rules** (`services/api/powersync/sync-rules.yaml`) — define which columns sync between server and client. Acts as a schema allowlist.

### Current Problems

1. **No formal coordination protocol.** When a new column is added (e.g., `is_rollover` on `budgets`), three files must change: the SQLDelight `.sq` schema, a Supabase migration, and the PowerSync sync rules. There is no mechanism to ensure all three are updated together.

2. **Version number collision risk.** SQLDelight uses integer version numbers (1, 2, 3…) for schema migrations. Supabase uses timestamp-based filenames (`20260326000003_…`). These versioning schemes are independent, making it impossible to tell which client schema version corresponds to which server migration.

3. **Backwards compatibility is undefined.** When a new server migration adds a column, old clients that haven't updated continue syncing. If the new column has a `NOT NULL` constraint without a default, old clients will fail. The current process doesn't validate this.

4. **Rollback risk.** If a client app version is rolled back (e.g., App Store rejection), the local database may have been migrated forward. SQLDelight does not support backward migrations. The server migration may have a `down` migration, but the client does not.

5. **Review ownership is unclear.** Schema changes touch both `packages/` (owned by `@kmp-engineer`) and `services/api/` (owned by `@backend-engineer`). In fleet mode, these are different agents that may work in parallel without coordination.

### Current Migration Inventory

- **Server**: 40+ migrations in `services/api/supabase/migrations/`, timestamp-named.
- **Client**: SQLDelight schemas in `packages/` — integer-versioned migrations.
- **Sync rules**: Single `sync-rules.yaml` file — column allowlist per table.

## Decision

**Use independent versioning for client and server schemas, coordinated through a documented compatibility matrix, migration validation in CI, and a mandatory co-change protocol for schema modifications.**

### 1. Compatibility Matrix

Maintain a `docs/architecture/schema-compatibility.md` file that maps client schema versions to minimum server migration versions and sync rule versions:

```markdown
| Client Schema Version | Min Server Migration             | Sync Rules Hash | Notes                 |
| --------------------- | -------------------------------- | --------------- | --------------------- |
| 1                     | 20260306000001_initial_schema    | abc123          | Initial release       |
| 2                     | 20260326000002_add_transfer      | def456          | Added transfer fields |
| 3                     | 20260326000005_standardize_owner | ghi789          | Added owner_id        |
```

This matrix is the **single source of truth** for which client versions work with which server versions. It is human-readable and machine-parseable.

### 2. Migration Co-Change Protocol

Every schema change follows this sequence:

```
1. Server migration FIRST (additive, with defaults)
   → services/api/supabase/migrations/YYYYMMDDHHMMSS_<desc>.sql
   → Both UP and DOWN scripts

2. Sync rules SECOND (add new columns to allowlist)
   → services/api/powersync/sync-rules.yaml

3. Client schema THIRD (SQLDelight .sq files)
   → packages/models/ or packages/core/ .sq files
   → SQLDelight migration file (e.g., 3.sqm)

4. Compatibility matrix LAST (document the mapping)
   → docs/architecture/schema-compatibility.md

5. All four changes in the SAME PR
```

**Ownership during fleet execution:** Schema PRs are assigned to `@kmp-engineer` as lead, with `@backend-engineer` providing the server migration. Both changes go in a single coordinated PR, not separate PRs.

### 3. Server-First, Additive-Only Rule

All server schema changes must be **additive and backwards-compatible**:

- New columns MUST have a `DEFAULT` value or be nullable.
- Column renames are NOT allowed — add a new column, migrate data, deprecate the old one.
- Column type changes are NOT allowed — add a new column with the new type.
- Column drops require a two-phase deprecation: (1) stop reading/writing in all clients, (2) drop in a future migration after all clients have updated.

This ensures that clients on older schema versions continue to function after a server migration deploys.

### 4. CI Validation

Add automated checks to the CI pipeline:

**a. Sync rules coverage check:**
Verify that every column in the SQLDelight schema for sync-enabled tables appears in `sync-rules.yaml`. Flag missing columns as CI errors.

**b. Server migration reversibility check:**
Verify that every `UP` migration in `services/api/supabase/migrations/` has a corresponding `DOWN` migration in the `down/` directory.

**c. Compatibility matrix freshness check:**
If any `.sq`, `.sqm`, or migration `.sql` file changed in the PR, require that `schema-compatibility.md` was also updated.

**d. Default value check:**
Parse new `ALTER TABLE ... ADD COLUMN` statements in server migrations and verify they include `DEFAULT` or `NULL`.

### 5. Client Rollback Safety

Since SQLDelight does not support backward migrations, client rollback safety is handled at the application level:

- The app stores the current schema version in a metadata table.
- On startup, if the detected schema version is higher than the app's expected version (rollback scenario), the app operates in **read-only degraded mode** and prompts the user to update.
- This is preferable to attempting a backward migration, which risks data corruption.

## Alternatives Considered

### Shared Version Counter

Use a single monotonically increasing version number across both client and server schemas (e.g., "schema version 7" means the same thing on client and server).

**Rejected because:**

- Client and server schemas are not identical — the server has columns (RLS policies, triggers, indexes) that don't exist on the client, and vice versa.
- A shared counter creates artificial coupling — a server-only change (e.g., adding an index) would bump the client version for no reason.
- Different deployment cadences: server migrations deploy immediately; client updates roll out over days/weeks through app stores.

### Schema Hash Comparison

Generate a hash of the effective schema on both client and server, and compare during sync handshake.

**Rejected because:**

- Hash comparison is binary (match/no-match) — it doesn't tell you what changed or whether the difference is backwards-compatible.
- PostgreSQL and SQLite have different type systems, so the "same" schema produces different hashes.
- Adds sync handshake latency for a check that could be done at build time.

### Automated Schema Sync Generation

Generate SQLDelight schemas from the Supabase PostgreSQL schema (or vice versa) to ensure they're always in sync.

**Rejected because:**

- PostgreSQL and SQLite have meaningfully different type systems, constraint syntax, and feature sets (e.g., SQLite has no native `UUID`, `ENUM`, or `JSONB`).
- The client schema is intentionally a subset of the server schema — not all server columns are relevant locally.
- Code generation adds build complexity and makes it harder to reason about the actual local schema.

## Consequences

### Positive

- The compatibility matrix provides a clear, auditable record of which versions work together — invaluable for debugging sync failures in production.
- Server-first, additive-only rule eliminates the most common class of breaking changes.
- CI validation catches schema coordination mistakes before they reach production.
- The co-change protocol prevents partial schema changes from being merged.
- Degraded read-only mode on client rollback protects data integrity without requiring backward migrations.

### Negative

- The compatibility matrix is a manual artifact — it can become stale if the CI freshness check is bypassed.
- The additive-only rule means the server schema accumulates deprecated columns over time, requiring periodic cleanup sprints.
- Single-PR requirement for schema changes may slow down development when client and server engineers work at different paces.
- CI validation scripts must be maintained as the schema structure evolves.

## Implementation Notes

- **Compatibility matrix file**: Create `docs/architecture/schema-compatibility.md` with the initial mapping from the current schema state.
- **CI scripts**: Add schema validation scripts to `tools/` — implement as Node.js scripts that parse `.sq`, `.sql`, and `.yaml` files.
- **PR template update**: Add a "Schema Change Checklist" section to the PR template for PRs that modify schema files.
- **Fleet coordination**: Add schema PRs to the fleet coordination rules in `AGENTS.md` — specifically: "Schema changes are serialized — only `@backend-engineer` writes Supabase migrations; only `@kmp-engineer` writes SQLDelight `.sq` files. Both must be in sync (a single coordinated sprint task, not two independent ones)."
- **Rollback detection**: Implement version check in the app's database initialization code — compare `PRAGMA user_version` (SQLite) against the app's compiled schema version.
- **Down migrations directory**: Ensure `services/api/supabase/migrations/down/` exists and contains reversals for all migrations. Validate in CI.
