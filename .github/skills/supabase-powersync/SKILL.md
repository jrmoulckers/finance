---
name: supabase-powersync
description: >
  Supabase backend and PowerSync sync engine configuration and development
  for the Finance app. Use for topics related to Supabase, PostgreSQL, RLS,
  Edge Functions, PowerSync, sync rules, migration, or database schema.
---

# Supabase & PowerSync Skill

This skill provides domain knowledge for configuring and developing against the Supabase backend and PowerSync sync engine used by the Finance application.

## Supabase Project Setup and Configuration

### Project Structure

```
services/api/
├── openapi.yaml
├── powersync/
│   └── sync-rules.yaml
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 20260306000001_initial_schema.sql
    │   ├── 20260306000002_rls_policies.sql
    │   ├── 20260306000003_auth_config.sql
    │   └── 20260315000001_export_audit_log.sql
    └── functions/
        ├── _shared/
        │   ├── auth.ts
        │   ├── cors.ts
        │   ├── logger.ts
        │   └── response.ts
        ├── health-check/
        ├── auth-webhook/
        ├── account-deletion/
        ├── household-invite/
        ├── passkey-register/
        ├── passkey-authenticate/
        └── data-export/
```

### Local Development

```bash
cd services/api

# Start local Supabase stack
supabase start

# Apply pending migrations to the running stack
supabase migration up

# Serve current Edge Functions locally
supabase functions serve data-export --env-file .env.local
supabase functions serve health-check --env-file .env.local
```

### Environment Configuration

```toml
# supabase/config.toml
[api]
port = 54321
schemas = ["public", "auth", "storage"]

[db]
port = 54322

[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["https://localhost:3000"]
```

## PostgreSQL Schema Design for Financial Data

### Core Principles

- **BIGINT for money** — All monetary values stored as cents (BIGINT), never floating-point.
- **UUID primary keys** — All tables use `gen_random_uuid()` for globally unique IDs suitable for offline-first sync.
- **Soft deletes** — `deleted_at TIMESTAMPTZ` column on all user-facing tables; never hard-delete synced records.
- **Audit timestamps** — Every table has `created_at` and `updated_at` columns.
- **Household isolation** — Every user-facing table has a `household_id` FK for multi-user household support.

### Schema Definition

```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    avatar_url    TEXT,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE households (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id  UUID NOT NULL REFERENCES households(id),
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    balance_cents BIGINT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    sync_version  BIGINT NOT NULL DEFAULT 0,
    is_synced     BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID NOT NULL REFERENCES households(id),
    account_id          UUID NOT NULL REFERENCES accounts(id),
    category_id         UUID REFERENCES categories(id),
    amount_cents        BIGINT NOT NULL,
    currency_code       TEXT NOT NULL DEFAULT 'USD',
    payee               TEXT,
    note                TEXT,
    date                DATE NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    sync_version        BIGINT NOT NULL DEFAULT 0,
    is_synced           BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE budgets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id  UUID NOT NULL REFERENCES households(id),
    category_id   UUID NOT NULL REFERENCES categories(id),
    amount_cents  BIGINT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    period        TEXT NOT NULL,
    start_date    DATE NOT NULL,
    end_date      DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    sync_version  BIGINT NOT NULL DEFAULT 0,
    is_synced     BOOLEAN NOT NULL DEFAULT false
);
```

## Row-Level Security (RLS) Policy Patterns

### Household Isolation Pattern

All RLS policies follow the same pattern: the authenticated user can only access rows tied to one of their active household memberships.

```sql
CREATE OR REPLACE FUNCTION auth.household_ids()
RETURNS UUID[] AS $$
    SELECT COALESCE(array_agg(household_id), ARRAY[]::UUID[])
    FROM household_members
    WHERE user_id = auth.uid()
      AND deleted_at IS NULL
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Account Policies

```sql
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_select ON accounts
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY accounts_insert ON accounts
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY accounts_update ON accounts
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));
```

### Transaction Policies

```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_select ON transactions
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY transactions_insert ON transactions
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY transactions_update ON transactions
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));
```

### Budget Policies

```sql
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY budgets_select ON budgets
    FOR SELECT
    USING (household_id = ANY(auth.household_ids()));

CREATE POLICY budgets_insert ON budgets
    FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));

CREATE POLICY budgets_update ON budgets
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));
```

### Service Role Bypass

Edge Functions that need cross-household access (e.g., scheduled aggregation jobs) use the `service_role` key, which bypasses RLS.

## Supabase Auth Configuration

### Passkeys (WebAuthn)

```toml
# config.toml
[auth]
[auth.mfa]
max_enrolled_factors = 10

[auth.mfa.web_authn]
enabled = true
```

Passkey registration and login are handled via the Supabase Auth JS/Kotlin SDK:

```kotlin
// Kotlin (Android/JVM)
val supabase = createSupabaseClient(url, key) {
    install(Auth)
    install(GoTrue) {
        flowType = FlowType.PKCE
    }
}
```

### OAuth Providers

Configure in the Supabase Dashboard or `config.toml`:

```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"

[auth.external.apple]
enabled = true
client_id = "env(APPLE_CLIENT_ID)"
secret = "env(APPLE_CLIENT_SECRET)"
```

### Auth Flow

1. User authenticates via Passkey or OAuth.
2. On first login, a trigger creates a `user_profile` record and assigns/creates a `household`.
3. JWT includes the user's `id` — RLS uses `auth.uid()` to look up `household_id`.

## Edge Functions Patterns

### Structure (Deno + TypeScript)

```typescript
// functions/data-export/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('data-export');

  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ code: 'METHOD_NOT_ALLOWED' }), {
        status: 405,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const user = await requireAuth(req);
    logger.setUserId(user.id);

    const supabase = createAdminClient();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Unhandled edge function error', {
      errorMessage: error instanceof Error ? error.message : 'unknown',
    });
    return new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
```

### Shared CORS Configuration

- `services/api/supabase/functions/_shared/cors.ts` parses `ALLOWED_ORIGINS` from the environment.
- Use `getCorsHeaders(req)` to echo back only approved origins.
- Use `handleCorsPreflightRequest(req)` for `OPTIONS` requests.
- Never use wildcard `Access-Control-Allow-Origin: *` in production Edge Functions.

### Structured Logging

- `services/api/supabase/functions/_shared/logger.ts` emits structured JSON logs with `timestamp`, `level`, `message`, `requestId`, `function`, optional `userId`, and `duration_ms`.
- Create one logger per request with `createLogger(functionName)` and enrich it after auth with `setUserId(...)`.

### Health Check Edge Function

- `services/api/supabase/functions/health-check/index.ts` is the current public uptime endpoint.
- It checks database connectivity plus Supabase Auth availability and returns `healthy` or `degraded` without exposing schema details.
- It uses the same shared CORS and structured-logging helpers as the other Edge Functions.

### Validation Pattern

Always validate inputs at the Edge Function boundary before touching the database:

- Check auth header is present and valid.
- Parse and validate JSON body with explicit type checks.
- Use Supabase client with the user's auth token (not service role) unless cross-household access is needed.

## PowerSync Sync Rules Configuration

### Sync Rules File

PowerSync uses a YAML-based sync rules file to define which data syncs to each client:

```yaml
# services/api/powersync/sync-rules.yaml
bucket_definitions:
  by_household:
    parameters:
      - SELECT household_id FROM household_members WHERE user_id = token_parameters.user_id AND deleted_at IS NULL
    data:
      - SELECT * FROM accounts WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM transactions WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM categories WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM budgets WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM goals WHERE household_id = bucket.household_id AND deleted_at IS NULL
  user_profile:
    parameters:
      - SELECT id AS user_id FROM users WHERE id = token_parameters.user_id AND deleted_at IS NULL
    data:
      - SELECT * FROM users WHERE id = bucket.user_id AND deleted_at IS NULL
      - SELECT * FROM household_members WHERE user_id = bucket.user_id AND deleted_at IS NULL
```

### Key Sync Rules Concepts

- **Buckets** define groups of data that sync together. A client subscribes to one or more buckets.
- **Parameters** determine which buckets a user subscribes to (derived from the auth token).
- **Data queries** define which rows belong to each bucket instance.
- PowerSync automatically tracks changes (INSERT, UPDATE, DELETE) and syncs deltas.

## PowerSync Client Integration

### Android Wiring

- `apps/android/build.gradle.kts` injects `BuildConfig.POWERSYNC_URL` so the app can point at the configured sync endpoint.
- `apps/android/src/main/kotlin/com/finance/android/di/SyncModule.kt` wires `SyncConfig`, `DeltaSyncManager`, `MutationQueue`, token storage, and `AndroidSyncManager`.
- `apps/android/src/main/kotlin/com/finance/android/sync/AndroidSyncManager.kt` wraps the shared `SyncEngine` and exposes sync state plus pending mutation counts as `StateFlow` values for the UI.

### Shared Sync Abstractions

- `packages/sync/src/commonMain/kotlin/com/finance/sync/SyncProvider.kt` keeps the shared layer backend-agnostic.
- `packages/sync/src/commonMain/kotlin/com/finance/sync/delta/DeltaSyncManager.kt` handles incremental sequence tracking and checksum verification.
- `packages/sync/src/commonMain/kotlin/com/finance/sync/queue/QueueProcessor.kt` pushes queued mutations with retry/backoff behavior.

### Web Offline Replay

- `apps/web/src/db/sync/MutationQueue.ts` implements the IndexedDB-backed offline mutation queue.
- `apps/web/src/db/sync/replayMutations.ts` replays queued writes when connectivity returns.
- `apps/web/src/sw/service-worker.ts` runs replay from the service worker when Background Sync is available.

## Conflict Resolution Strategy

The checked-in shared sync layer currently uses `packages/sync/src/commonMain/kotlin/com/finance/sync/conflict/ConflictStrategy.kt`.

### Current Strategies

- `LAST_WRITE_WINS` via `LastWriteWinsResolver.kt` is the default for most tables.
- `MERGE` via `MergeResolver.kt` is used for `budgets`, `goals`, and `households`.
- There are no checked-in `ClientWins`, `ServerWins`, or CRDT-based budget implementations today.

### Practical Rules

1. Simple records fall back to timestamp-based last-write-wins.
2. Shared/complex records use field-level merge when possible.
3. Delta sync should preserve tombstones and checksum validation so bad batches can trigger a full resync.
4. If you document future conflict strategies, label them clearly as planned rather than current.

## Migration Patterns

### Numbered Migrations

```
services/api/supabase/migrations/
├── 20260306000001_initial_schema.sql
├── 20260306000002_rls_policies.sql
├── 20260306000003_auth_config.sql
└── 20260315000001_export_audit_log.sql
```

### Migration Best Practices

- **Timestamp prefix** — `YYYYMMDDHHMMSS_description.sql` for ordering.
- **Reversible** — Include both `-- migrate:up` and `-- migrate:down` sections.
- **Zero-downtime** — Never rename/drop columns directly. Use the expand-contract pattern:
  1. Add the new column (nullable or with default).
  2. Deploy code that writes to both old and new columns.
  3. Backfill the new column.
  4. Deploy code that reads only from the new column.
  5. Drop the old column in a later migration.
- **Idempotent** — Use `IF NOT EXISTS` / `IF EXISTS` guards.

### Example Migration

```sql
-- 20260315000001_export_audit_log.sql
CREATE TABLE IF NOT EXISTS data_export_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    export_format TEXT NOT NULL CHECK (export_format IN ('json', 'csv')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
    error_message TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE data_export_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own export logs"
    ON data_export_audit_log FOR SELECT
    USING (auth.uid() = user_id);
```

## Backup and Recovery Strategy

### Automated Backups

- **Supabase Pro** provides daily automated backups with point-in-time recovery (PITR).
- Configure PITR retention in the Supabase Dashboard (up to 7 days on Pro, 28 days on Enterprise).

### Manual Backups

```bash
# Full database dump
pg_dump "$DATABASE_URL" --no-owner --no-acl -F c -f finance_backup_$(date +%Y%m%d).dump

# Restore from dump
pg_restore -d "$DATABASE_URL" --no-owner --no-acl finance_backup_20250115.dump
```

### Recovery Procedure

1. Identify the incident timestamp.
2. Use PITR to restore to the moment before the incident.
3. Verify data integrity with checksums and row counts.
4. PowerSync clients will automatically re-sync after the backend recovers.

## Performance Optimization

### Indexes

```sql
-- Partial indexes (only index non-deleted rows)
CREATE INDEX idx_transactions_household_date
    ON transactions(household_id, date DESC)
    WHERE deleted_at IS NULL;

-- Composite index for common query patterns
CREATE INDEX idx_transactions_account_date
    ON transactions(account_id, date DESC)
    WHERE deleted_at IS NULL;

-- GIN index for text search over user-entered notes
CREATE INDEX idx_transactions_note_fts
    ON transactions USING GIN (to_tsvector('english', coalesce(note, '')));
```

### Materialized Views for Reports

```sql
-- Monthly spending summary per category
CREATE MATERIALIZED VIEW monthly_spending AS
SELECT
    household_id,
    date_trunc('month', date::timestamp) AS month,
    category_id,
    SUM(amount_cents) AS total_cents,
    COUNT(*) AS transaction_count
FROM transactions
WHERE deleted_at IS NULL AND amount_cents < 0
GROUP BY household_id, date_trunc('month', date::timestamp), category_id;

CREATE UNIQUE INDEX idx_monthly_spending_unique
    ON monthly_spending(household_id, month, category_id);

-- Refresh on a schedule (e.g., every hour via pg_cron)
SELECT cron.schedule('refresh-monthly-spending', '0 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_spending');
```

### Query Optimization Tips

- Always filter by `household_id` first (matches RLS and indexes).
- Use `WHERE deleted_at IS NULL` to leverage partial indexes.
- Paginate large result sets with keyset pagination (`WHERE date < $last_date ORDER BY date DESC LIMIT 50`).
- Avoid `SELECT *` — only select needed columns.

## Data Export for GDPR Compliance

### Self-Service Export Edge Function

`services/api/supabase/functions/data-export/index.ts` is the current portability implementation.

- Supports `json` and `csv` responses.
- Requires authentication via shared `_shared/auth.ts` helpers.
- Limits output to the caller's user-scoped or household-scoped data.
- Redacts sensitive columns before streaming results.
- Uses origin-validated CORS and structured logging.
- Enforces rate limiting at 10 exports per user per hour.
- Writes success and failure records to `data_export_audit_log`.

### Export Audit Log Migration

`services/api/supabase/migrations/20260315000001_export_audit_log.sql` creates `data_export_audit_log` with:

- `user_id`, `export_format`, per-entity counts, `status`, `error_message`, `ip_address`, and `created_at`
- RLS that lets users view only their own export-log rows
- A `(user_id, created_at DESC)` index for rate-limit lookups and audit queries

### Shared Edge Utilities Used by Export

- `_shared/cors.ts` parses `ALLOWED_ORIGINS` and never uses wildcard CORS.
- `_shared/logger.ts` emits structured JSON logs for auditability without leaking financial data.
- `functions/health-check/index.ts` provides a separate uptime probe for database/auth availability.

### GDPR Right to Erasure

When a user requests deletion:

1. Soft-delete all their data (`UPDATE ... SET deleted_at = now()`).
2. After a 30-day grace period, hard-delete and vacuum.
3. Trigger crypto-shredding (see below) for any encrypted fields.
4. Log the erasure request for audit compliance.

## Crypto-Shredding Implementation Pattern

Crypto-shredding allows permanent data destruction by destroying the encryption key rather than the data itself. This is useful for GDPR "right to be forgotten" where data may exist in backups.

### Approach

1. Each household has a unique data encryption key (DEK) stored in a key management table.
2. Sensitive fields (notes, receipt URLs) are encrypted with the household's DEK before storage.
3. To "forget" a household, delete the DEK — all encrypted data becomes permanently unreadable, even in backups.

### Schema

```sql
CREATE TABLE encryption_key (
    household_id UUID PRIMARY KEY REFERENCES household(id),
    dek_encrypted TEXT NOT NULL,      -- DEK encrypted with master key (KEK)
    key_version  INTEGER NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at   TIMESTAMPTZ
);
```

### Implementation Flow

```
1. Household created → generate DEK → encrypt DEK with KEK → store in encryption_key
2. Write sensitive data → decrypt DEK → encrypt field → store ciphertext
3. Read sensitive data → decrypt DEK → decrypt field → return plaintext
4. Delete household → DELETE FROM encryption_key WHERE household_id = $1
   → All encrypted fields in all backups are now permanently unreadable
```

### Key Rotation

```sql
-- Rotate DEK for a household
UPDATE encryption_key
SET dek_encrypted = $new_encrypted_dek,
    key_version = key_version + 1,
    rotated_at = now()
WHERE household_id = $1;

-- Re-encrypt all sensitive data with the new DEK (background job)
```

### Security Considerations

- Store the KEK (key encryption key) in a cloud KMS (AWS KMS, GCP KMS, Azure Key Vault) — never in the database.
- Use AES-256-GCM for field-level encryption.
- Log all key access for audit trails.
- Rotate DEKs periodically (e.g., annually) and on security incidents.
