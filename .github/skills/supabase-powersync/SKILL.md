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
services/supabase/
├── config.toml                # Supabase CLI configuration
├── seed.sql                   # Development seed data
├── migrations/
│   ├── 20250101000000_initial_schema.sql
│   ├── 20250102000000_rls_policies.sql
│   └── 20250103000000_add_budgets.sql
└── functions/
    ├── process-receipt/
    │   └── index.ts
    ├── export-data/
    │   └── index.ts
    └── _shared/
        └── cors.ts
```

### Local Development

```bash
# Start local Supabase stack
supabase start

# Apply migrations
supabase db push

# Deploy Edge Functions
supabase functions deploy process-receipt
supabase functions deploy export-data

# Generate TypeScript types from schema
supabase gen types typescript --local > packages/sync/src/jsMain/kotlin/types.d.ts
```

### Environment Configuration

```toml
# config.toml
[api]
port = 54321
schemas = ["public", "finance"]

[db]
port = 54322

[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["finance://auth/callback"]
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
-- Households group users who share financial data
CREATE TABLE household (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User profile linked to Supabase Auth
CREATE TABLE user_profile (
    id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    household_id UUID NOT NULL REFERENCES household(id),
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'member',  -- 'owner', 'member'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES household(id),
    name         TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit', 'investment', 'cash')),
    balance      BIGINT NOT NULL DEFAULT 0,       -- cents
    currency     TEXT NOT NULL DEFAULT 'USD',
    institution  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ                      -- soft delete
);

CREATE TABLE transaction (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES household(id),
    account_id   UUID NOT NULL REFERENCES account(id),
    amount       BIGINT NOT NULL,                  -- cents (negative = debit)
    description  TEXT NOT NULL,
    category     TEXT,
    date         DATE NOT NULL,
    notes        TEXT,
    receipt_url  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

CREATE TABLE budget (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES household(id),
    category     TEXT NOT NULL,
    amount       BIGINT NOT NULL,                  -- cents per period
    period       TEXT NOT NULL CHECK (period IN ('weekly', 'monthly', 'yearly')),
    start_date   DATE NOT NULL,
    end_date     DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_account_household ON account(household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transaction_household ON transaction(household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transaction_account ON transaction(account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transaction_date ON transaction(date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_budget_household ON budget(household_id) WHERE deleted_at IS NULL;
```

## Row-Level Security (RLS) Policy Patterns

### Household Isolation Pattern

All RLS policies follow the same pattern: a user can only access rows belonging to their household.

```sql
-- Helper function: get the current user's household_id
CREATE OR REPLACE FUNCTION auth.household_id()
RETURNS UUID AS $$
    SELECT household_id FROM user_profile WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Account Policies

```sql
ALTER TABLE account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household accounts"
    ON account FOR SELECT
    USING (household_id = auth.household_id());

CREATE POLICY "Users can insert accounts for their household"
    ON account FOR INSERT
    WITH CHECK (household_id = auth.household_id());

CREATE POLICY "Users can update their household accounts"
    ON account FOR UPDATE
    USING (household_id = auth.household_id())
    WITH CHECK (household_id = auth.household_id());

-- No DELETE policy — use soft delete (UPDATE deleted_at)
```

### Transaction Policies

```sql
ALTER TABLE transaction ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household transactions"
    ON transaction FOR SELECT
    USING (household_id = auth.household_id());

CREATE POLICY "Users can insert transactions for their household"
    ON transaction FOR INSERT
    WITH CHECK (household_id = auth.household_id());

CREATE POLICY "Users can update their household transactions"
    ON transaction FOR UPDATE
    USING (household_id = auth.household_id())
    WITH CHECK (household_id = auth.household_id());
```

### Budget Policies

```sql
ALTER TABLE budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household budgets"
    ON budget FOR SELECT
    USING (household_id = auth.household_id());

CREATE POLICY "Users can insert budgets for their household"
    ON budget FOR INSERT
    WITH CHECK (household_id = auth.household_id());

CREATE POLICY "Users can update their household budgets"
    ON budget FOR UPDATE
    USING (household_id = auth.household_id())
    WITH CHECK (household_id = auth.household_id());
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
// functions/process-receipt/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Verify auth
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: authHeader } } }
        );

        // Validate input
        const { receiptUrl } = await req.json();
        if (!receiptUrl || typeof receiptUrl !== "string") {
            return new Response(JSON.stringify({ error: "Invalid input" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Process receipt (OCR, categorization, etc.)
        const result = await processReceipt(receiptUrl);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
```

### Shared CORS Configuration

```typescript
// functions/_shared/cors.ts
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};
```

### Validation Pattern

Always validate inputs at the Edge Function boundary before touching the database:

- Check auth header is present and valid.
- Parse and validate JSON body with explicit type checks.
- Use Supabase client with the user's auth token (not service role) unless cross-household access is needed.

## PowerSync Sync Rules Configuration

### Sync Rules File

PowerSync uses a YAML-based sync rules file to define which data syncs to each client:

```yaml
# sync-rules.yaml
bucket_definitions:
  # Each user syncs their household's data
  household_data:
    parameters:
      - SELECT household_id FROM user_profile WHERE id = token_parameters.user_id
    data:
      - SELECT id, household_id, name, type, balance, currency, institution,
               created_at, updated_at, deleted_at
        FROM account
        WHERE household_id = bucket.household_id

      - SELECT id, household_id, account_id, amount, description, category,
               date, notes, created_at, updated_at, deleted_at
        FROM transaction
        WHERE household_id = bucket.household_id

      - SELECT id, household_id, category, amount, period, start_date,
               end_date, created_at, updated_at, deleted_at
        FROM budget
        WHERE household_id = bucket.household_id
```

### Key Sync Rules Concepts

- **Buckets** define groups of data that sync together. A client subscribes to one or more buckets.
- **Parameters** determine which buckets a user subscribes to (derived from the auth token).
- **Data queries** define which rows belong to each bucket instance.
- PowerSync automatically tracks changes (INSERT, UPDATE, DELETE) and syncs deltas.

## PowerSync SDK Integration

### Client-Side Setup (Kotlin)

```kotlin
val powerSyncDatabase = PowerSyncDatabase(
    factory = DatabaseDriverFactory(),
    schema = Schema(
        tables = listOf(
            Table("account", listOf(
                Column.text("household_id"),
                Column.text("name"),
                Column.text("type"),
                Column.integer("balance"),
                Column.text("currency"),
                Column.text("institution"),
                Column.text("created_at"),
                Column.text("updated_at"),
                Column.text("deleted_at"),
            )),
            Table("transaction", listOf(
                Column.text("household_id"),
                Column.text("account_id"),
                Column.integer("amount"),
                Column.text("description"),
                Column.text("category"),
                Column.text("date"),
                Column.text("notes"),
                Column.text("created_at"),
                Column.text("updated_at"),
                Column.text("deleted_at"),
            )),
            Table("budget", listOf(
                Column.text("household_id"),
                Column.text("category"),
                Column.integer("amount"),
                Column.text("period"),
                Column.text("start_date"),
                Column.text("end_date"),
                Column.text("created_at"),
                Column.text("updated_at"),
                Column.text("deleted_at"),
            )),
        )
    )
)

// Connect to PowerSync service
val connector = SupabaseConnector(supabaseClient)
powerSyncDatabase.connect(connector)
```

### Sync Status Monitoring

```kotlin
powerSyncDatabase.currentStatus.asFlow().collect { status ->
    when {
        status.connected && !status.downloading && !status.uploading ->
            SyncState.Synced
        status.downloading || status.uploading ->
            SyncState.Syncing
        !status.connected ->
            SyncState.Offline
        status.hasSyncError ->
            SyncState.Error(status.syncError?.message ?: "Unknown")
    }
}
```

## Conflict Resolution Strategy

### Last-Write-Wins (LWW) with Timestamps

For most entities (accounts, transactions), use last-write-wins based on `updated_at`:

```sql
-- Server-side upsert with LWW
INSERT INTO transaction (id, household_id, account_id, amount, description, updated_at)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (id) DO UPDATE SET
    account_id   = EXCLUDED.account_id,
    amount       = EXCLUDED.amount,
    description  = EXCLUDED.description,
    updated_at   = EXCLUDED.updated_at
WHERE transaction.updated_at < EXCLUDED.updated_at;
```

### CRDT for Shared Budgets

Budget amounts that multiple household members edit concurrently use a counter-based CRDT:

```sql
-- Budget adjustments table (append-only log)
CREATE TABLE budget_adjustment (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id    UUID NOT NULL REFERENCES budget(id),
    user_id      UUID NOT NULL REFERENCES auth.users(id),
    delta        BIGINT NOT NULL,    -- cents adjustment (+/-)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Materialized budget amount = base + sum(adjustments)
CREATE OR REPLACE VIEW budget_current AS
SELECT
    b.id,
    b.category,
    b.amount + COALESCE(SUM(ba.delta), 0) AS current_amount,
    b.period
FROM budget b
LEFT JOIN budget_adjustment ba ON ba.budget_id = b.id
GROUP BY b.id, b.category, b.amount, b.period;
```

### Conflict Rules

1. **Simple fields** (name, description, category) — LWW by `updated_at`.
2. **Counters** (budget amounts) — CRDT delta merge, never loses increments.
3. **Soft deletes** — Delete always wins over update (tombstone propagation).
4. **Never auto-resolve** — If both sides change `amount` on a transaction, flag for user review.

## Migration Patterns

### Numbered Migrations

```
services/supabase/migrations/
├── 20250101000000_initial_schema.sql
├── 20250102000000_rls_policies.sql
├── 20250103000000_add_budgets.sql
├── 20250115000000_add_receipt_url.sql
└── 20250201000000_add_recurring_transactions.sql
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
-- 20250115000000_add_receipt_url.sql

-- migrate:up
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS receipt_url TEXT;
CREATE INDEX IF NOT EXISTS idx_transaction_receipt ON transaction(receipt_url)
    WHERE receipt_url IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_transaction_receipt;
ALTER TABLE transaction DROP COLUMN IF EXISTS receipt_url;
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
CREATE INDEX idx_transaction_household_date
    ON transaction(household_id, date DESC)
    WHERE deleted_at IS NULL;

-- Composite index for common query patterns
CREATE INDEX idx_transaction_account_date
    ON transaction(account_id, date DESC)
    WHERE deleted_at IS NULL;

-- GIN index for full-text search on descriptions
CREATE INDEX idx_transaction_description_fts
    ON transaction USING GIN (to_tsvector('english', description));
```

### Materialized Views for Reports

```sql
-- Monthly spending summary per category
CREATE MATERIALIZED VIEW monthly_spending AS
SELECT
    household_id,
    date_trunc('month', date) AS month,
    category,
    SUM(amount) AS total_cents,
    COUNT(*) AS transaction_count
FROM transaction
WHERE deleted_at IS NULL AND amount < 0
GROUP BY household_id, date_trunc('month', date), category;

CREATE UNIQUE INDEX idx_monthly_spending_unique
    ON monthly_spending(household_id, month, category);

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

### Filtered pg_dump by User

```bash
# Export all data for a specific household
pg_dump "$DATABASE_URL" \
    --no-owner --no-acl \
    --table=account --table=transaction --table=budget \
    --data-only \
    -F p \
    | psql -d temp_export_db

# Then filter by household_id
psql -d temp_export_db -c "
    DELETE FROM account WHERE household_id != '$HOUSEHOLD_ID';
    DELETE FROM transaction WHERE household_id != '$HOUSEHOLD_ID';
    DELETE FROM budget WHERE household_id != '$HOUSEHOLD_ID';
"

# Export filtered data as JSON
psql -d temp_export_db -c "
    SELECT json_agg(row_to_json(t)) FROM (
        SELECT * FROM transaction WHERE household_id = '$HOUSEHOLD_ID'
    ) t;
" -o transactions_export.json
```

### Edge Function for Self-Service Export

```typescript
// functions/export-data/index.ts
serve(async (req: Request) => {
    const supabase = createClient(url, key, {
        global: { headers: { Authorization: req.headers.get("Authorization")! } }
    });

    const { data: profile } = await supabase
        .from("user_profile")
        .select("household_id")
        .single();

    const householdId = profile.household_id;

    const [accounts, transactions, budgets] = await Promise.all([
        supabase.from("account").select("*").eq("household_id", householdId),
        supabase.from("transaction").select("*").eq("household_id", householdId),
        supabase.from("budget").select("*").eq("household_id", householdId),
    ]);

    const exportData = {
        exported_at: new Date().toISOString(),
        household_id: householdId,
        accounts: accounts.data,
        transactions: transactions.data,
        budgets: budgets.data,
    };

    return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
            "Content-Type": "application/json",
            "Content-Disposition": "attachment; filename=finance-export.json",
        },
    });
});
```

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
