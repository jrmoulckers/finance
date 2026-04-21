---
name: supabase-powersync
description: >
  Supabase backend and PowerSync sync engine configuration and development
  for the Finance app. Use for topics related to Supabase, PostgreSQL, RLS,
  Edge Functions, PowerSync, sync rules, migration, or database schema.
---

# Supabase & PowerSync Skill

## Current Backend State

- **23 up-migrations** with matching `down/` reversals
- **16 Edge Functions**: data-export, health-check, account-deletion, admin-dashboard, auth-webhook, household-invite, launch-readiness, manage-webhooks, passkey-authenticate, passkey-register, process-recurring, send-notification, sync-health-report, verify-device-attestation
- **Rate limiting**: `rate_limits` table with configurable per-user/per-endpoint limits
- **Anomaly detection**: Spending pattern analysis via Edge Functions
- **Spending forecast**: Balance prediction via `BalancePredictionEngine` (KMP, on-device)
- **Bank connection stubs**: Placeholder for future Plaid/MX integration
- **Launch readiness dashboard**: `20260327000001_launch_readiness_dashboard.sql`
- **Recurring transactions**: `process-recurring` Edge Function + `20260323000002_recurring_transactions.sql`

## Project Structure

```
services/api/
+-- openapi.yaml
+-- powersync/
|   +-- sync-rules.yaml
+-- supabase/
    +-- config.toml
    +-- migrations/           # 23 up-migrations + down/ reversals
    +-- functions/
        +-- _shared/          # auth.ts, cors.ts, logger.ts, response.ts
        +-- _test_helpers/
        +-- account-deletion/
        +-- admin-dashboard/
        +-- auth-webhook/
        +-- data-export/
        +-- health-check/
        +-- household-invite/
        +-- launch-readiness/
        +-- manage-webhooks/
        +-- passkey-authenticate/
        +-- passkey-register/
        +-- process-recurring/
        +-- send-notification/
        +-- sync-health-report/
        +-- verify-device-attestation/
```

## Migration Naming Convention

```
YYYYMMDDHHMMSS_description.sql
```

Examples from current migrations:

- `20260306000001_initial_schema.sql`
- `20260323000003_rate_limits.sql`
- `20260326000005_standardize_owner_id.sql`
- `20260327000001_launch_readiness_dashboard.sql`

### Migration Rules

- **Reversible**: Every up-migration has a matching `down/` reversal
- **Zero-downtime**: Use expand-contract pattern (add column → dual-write → backfill → switch → drop old)
- **Idempotent**: Use `IF NOT EXISTS` / `IF EXISTS` guards
- **Add-only**: New columns must be nullable or have defaults

## Schema Design Principles

- **BIGINT for money** — All monetary values as cents, never float
- **UUID primary keys** — `gen_random_uuid()` for offline-first sync
- **Soft deletes** — `deleted_at TIMESTAMPTZ` on all user-facing tables
- **Household isolation** — `household_id FK` on every user-facing table
- **Owner tracking** — `owner_id UUID REFERENCES auth.users(id)` for direct per-user queries
- **Sync columns** — `sync_version BIGINT DEFAULT 0` + `is_synced BOOLEAN DEFAULT false`
- **Audit timestamps** — `created_at` + `updated_at` on every table

### Core Tables (Approved Schema)

```sql
-- transactions: transfer + recurring support
transfer_transaction_id UUID REFERENCES transactions(id),  -- paired transfer leg
recurring_rule_id UUID REFERENCES recurring_rules(id),      -- originating rule
owner_id UUID NOT NULL REFERENCES auth.users(id),

-- budgets: rollover support
is_rollover BOOLEAN NOT NULL DEFAULT false,

-- goals: account linkage + lifecycle
account_id UUID REFERENCES accounts(id),     -- funding account
status TEXT NOT NULL DEFAULT 'active',        -- active | completed | archived
CONSTRAINT goals_status_check CHECK (status IN ('active', 'completed', 'archived'))
```

## RLS Policy Patterns

### Household Isolation (Standard Pattern)

```sql
-- Helper function: returns all household IDs for the authenticated user
CREATE OR REPLACE FUNCTION auth.household_ids()
RETURNS UUID[] AS $$
    SELECT COALESCE(array_agg(household_id), ARRAY[]::UUID[])
    FROM household_members
    WHERE user_id = auth.uid() AND deleted_at IS NULL
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Apply to every table:
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_select ON accounts FOR SELECT
    USING (household_id = ANY(auth.household_ids()));
CREATE POLICY accounts_insert ON accounts FOR INSERT
    WITH CHECK (household_id = ANY(auth.household_ids()));
CREATE POLICY accounts_update ON accounts FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));
```

### Service Role Bypass

Edge Functions needing cross-household access use `service_role` key (bypasses RLS).

### Subscription-Gated RLS

```sql
-- Example: premium-only data access
CREATE POLICY premium_export ON data_export_audit_log FOR SELECT
    USING (auth.uid() = user_id
    AND auth.jwt() -> 'app_metadata' ->> 'subscription_tier' IN ('PREMIUM', 'FAMILY'));
```

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
      - SELECT * FROM categories WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM budgets WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM goals WHERE household_id = bucket.household_id AND deleted_at IS NULL
  user_profile:
    parameters:
      - SELECT id AS user_id FROM users WHERE id = token_parameters.user_id
    data:
      - SELECT * FROM users WHERE id = bucket.user_id AND deleted_at IS NULL
      - SELECT * FROM household_members WHERE user_id = bucket.user_id AND deleted_at IS NULL
```

### Sync Rules Concepts

- **Buckets**: Groups of data that sync together
- **Parameters**: Derive from JWT `token_parameters.user_id`
- **Data queries**: Define which rows belong to each bucket
- PowerSync auto-tracks INSERT/UPDATE/DELETE and syncs deltas

### Adding a New Synced Table

1. Create Supabase migration (up + down)
2. Add RLS policies (household isolation pattern)
3. Add to sync-rules.yaml data queries
4. Add SQLDelight `.sq` in `packages/core/`
5. Add KMP model in `packages/models/`
6. Update platform data layers

## Edge Function Patterns

### Structure (Deno + TypeScript)

```typescript
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);
  const logger = createLogger('function-name');
  try {
    const user = await requireAuth(req);
    logger.setUserId(user.id);
    // ... business logic ...
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Error', { errorMessage: error instanceof Error ? error.message : 'unknown' });
    return new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
```

### Shared Utilities (`_shared/`)

- **`auth.ts`**: `requireAuth(req)` validates JWT, `createAdminClient()` for service role
- **`cors.ts`**: `ALLOWED_ORIGINS` from env, never wildcard in production
- **`logger.ts`**: Structured JSON logs (timestamp, level, requestId, function, userId)
- **`response.ts`**: Standard response helpers

### Key Edge Functions

| Function                        | Purpose                                |
| ------------------------------- | -------------------------------------- |
| `data-export`                   | GDPR Article 20 portability (JSON/CSV) |
| `health-check`                  | Uptime probe (DB + Auth availability)  |
| `account-deletion`              | GDPR Article 17 erasure                |
| `process-recurring`             | Recurring transaction generation       |
| `launch-readiness`              | Pre-launch system health dashboard     |
| `admin-dashboard`               | Internal metrics and monitoring        |
| `passkey-register/authenticate` | WebAuthn passkey flows                 |

## Auth Configuration

```toml
# config.toml
[auth.mfa.web_authn]
enabled = true

[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"

[auth.external.apple]
enabled = true
client_id = "env(APPLE_CLIENT_ID)"
```

Auth flow: Passkey/OAuth → trigger creates `user_profile` + assigns household → JWT includes `auth.uid()` → RLS resolves `household_id`.

## Conflict Resolution

Configured in `packages/sync/src/commonMain/.../sync/conflict/`:

| Strategy          | Tables                     | Logic                      |
| ----------------- | -------------------------- | -------------------------- |
| `LAST_WRITE_WINS` | Most tables (default)      | Timestamp comparison       |
| `MERGE`           | budgets, goals, households | Field-level reconciliation |
| `CLIENT_WINS`     | User preferences           | Always picks local         |
| `SERVER_WINS`     | Admin data                 | Always picks remote        |

## Performance Optimization

```sql
-- Partial indexes (only non-deleted rows)
CREATE INDEX idx_transactions_household_date
    ON transactions(household_id, date DESC) WHERE deleted_at IS NULL;

-- Composite for common queries
CREATE INDEX idx_transactions_account_date
    ON transactions(account_id, date DESC) WHERE deleted_at IS NULL;

-- Full-text search on notes
CREATE INDEX idx_transactions_note_fts
    ON transactions USING GIN (to_tsvector('english', coalesce(note, '')));
```

### Query Tips

- Always filter by `household_id` first (matches RLS + indexes)
- Use `WHERE deleted_at IS NULL` to leverage partial indexes
- Keyset pagination: `WHERE date < $last_date ORDER BY date DESC LIMIT 50`
- Avoid `SELECT *` — only select needed columns

## Crypto-Shredding (GDPR Erasure)

```sql
CREATE TABLE encryption_key (
    household_id UUID PRIMARY KEY REFERENCES household(id),
    dek_encrypted TEXT NOT NULL,      -- DEK encrypted with master key
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at TIMESTAMPTZ
);
```

Flow: Create household → generate DEK → encrypt with KEK → store. Delete household → delete DEK → all encrypted data permanently unreadable (even in backups).

## Local Development

```bash
cd services/api
supabase start                # Start local stack
supabase migration up         # Apply migrations
supabase functions serve data-export --env-file .env.local  # Serve function
```

## Backup & Recovery

- Supabase Pro: Daily automated backups + PITR (7-day retention)
- Manual: `pg_dump` for full dumps
- Recovery: PITR to pre-incident timestamp → PowerSync clients auto-re-sync
