# Sync Integration & Contract Tests

> Issue: [#532](https://github.com/finance-app/finance-backend/issues/532)

This directory contains tests that validate the Supabase ↔ PowerSync sync
contract — ensuring the database schema, RLS policies, and sync-rules.yaml
are consistent and secure.

## Test Suites

### 1. Contract Tests (`sync-contract.test.ts`)

**Runtime:** Deno (no database required)
**What it validates:**

| Test                                              | Description                                                  |
| ------------------------------------------------- | ------------------------------------------------------------ |
| sync-rules.yaml can be parsed                     | YAML is well-formed                                          |
| references only existing tables                   | Every table in sync-rules exists in migrations               |
| soft-delete filter on data queries                | Every `data:` query includes `deleted_at IS NULL`            |
| soft-delete filter on parameter queries           | Every `parameters:` query includes `deleted_at IS NULL`      |
| excludes internal-only columns                    | Sensitive tables (passkey_credentials, audit_log) not synced |
| bucket parameters use token_parameters.user_id    | All buckets authenticate via JWT user_id                     |
| all synced tables have RLS enabled                | Migrations include `ENABLE ROW LEVEL SECURITY`               |
| by_household uses bucket.household_id             | Household isolation in data queries                          |
| user_profile uses bucket.user_id                  | User isolation in data queries                               |
| parameter queries produce correct bucket keys     | household_id / user_id selected correctly                    |
| expected bucket definitions exist                 | `by_household` and `user_profile` buckets present            |
| by_household includes all household-scoped tables | accounts, transactions, categories, budgets, goals           |
| user_profile includes user and membership tables  | users, household_members                                     |
| no duplicate table references                     | No table appears twice in a single bucket                    |

**How to run:**

```bash
# From services/api/
deno test --allow-read supabase/tests/sync-contract.test.ts

# Or via npm script
npm run test:sync-contract
```

### 2. Integration Tests (`sync-integration.test.sql`)

**Runtime:** PostgreSQL (requires local Supabase)
**What it validates:**

| Test    | Description                                                       |
| ------- | ----------------------------------------------------------------- |
| Test 1  | All sync-rules tables exist with expected columns                 |
| Test 2  | RLS is enabled on all user-data tables                            |
| Test 3  | `auth.household_ids()` function exists                            |
| Test 4  | `custom_access_token_hook` exists with correct signature          |
| Test 5  | `sync_version` and `is_synced` columns on synced tables           |
| Test 6  | Soft-deleted rows are filtered out                                |
| Test 7  | All monetary columns use BIGINT (cents)                           |
| Test 8  | `currency_code` exists alongside monetary columns                 |
| Test 9  | `accept_household_invitation` handles edge cases                  |
| Test 10 | `handle_new_user_signup` is idempotent                            |
| Test 11 | `updated_at` triggers fire on row updates                         |
| Test 12 | Standard columns (id, created_at, updated_at, deleted_at) present |
| Test 13 | `household_id` FK on household-scoped tables                      |
| Test 14 | Sufficient RLS policies per table                                 |

**How to run:**

```bash
# Prerequisites: start local Supabase
supabase start

# Run the tests (from services/api/)
psql postgresql://postgres:postgres@localhost:54322/postgres \
     -f supabase/tests/sync-integration.test.sql

# Or via npm script
npm run test:sync-integration
```

**Important:** The SQL tests run inside a transaction and ROLLBACK at the end,
so they leave no test data behind.

## Architecture

```
┌──────────────────┐     sync-rules.yaml     ┌──────────────────┐
│  Client (SQLite) │◄───────────────────────►│   PowerSync       │
│  PowerSync SDK   │     (defines buckets)   │   Sync Engine     │
└──────────────────┘                          └────────┬─────────┘
                                                       │
                                              Replicates via
                                              logical replication
                                                       │
                                              ┌────────▼─────────┐
                                              │   Supabase        │
                                              │   PostgreSQL      │
                                              │   (with RLS)      │
                                              └──────────────────┘
```

The **contract tests** validate the dotted line — that sync-rules.yaml is
consistent with the schema. The **integration tests** validate the solid
lines — that the database schema, RLS policies, and functions work correctly.

Together they ensure the full sync path is sound without requiring a running
PowerSync instance.

## Adding New Tests

### Adding a contract test

1. Open `sync-contract.test.ts`
2. Add a new `Deno.test(...)` block
3. Use the helper functions (`loadSyncRules`, `loadMigrationsSql`, `extractTableName`)
4. Run: `deno test --allow-read supabase/tests/sync-contract.test.ts`

### Adding an integration test

1. Open `sync-integration.test.sql`
2. Add a new `DO $$ ... $$;` block between the last test and the `ROLLBACK`
3. Use `RAISE NOTICE 'PASS Test N: ...'` for success
4. Use `RAISE EXCEPTION 'FAIL Test N: ...'` for failure
5. The test runs inside a transaction — any data created is rolled back
6. Run: `psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/tests/sync-integration.test.sql`

### When to add which type of test

| Scenario                          | Test type        |
| --------------------------------- | ---------------- |
| New table added to sync-rules     | Contract test    |
| New RLS policy                    | Integration test |
| New sync bucket                   | Both             |
| New migration with schema changes | Both             |
| New Edge Function RPC             | Integration test |

## CI Integration

The **contract tests** can run in any CI environment with Deno installed —
they require no database. Add to CI pipeline:

```yaml
- name: Run sync contract tests
  run: deno test --allow-read services/api/supabase/tests/sync-contract.test.ts
```

The **integration tests** require a local Supabase instance and are intended
for local development and staging validation.
