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
| Test 3  | `public.household_ids()` function exists                          |
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

### 3. Billing Entitlement Integration Tests

**Runtime:** PostgreSQL (requires local Supabase)

`billing-entitlements-integration.test.sql` validates the server-authoritative
billing foundation: normalized constraints, append-only evidence, deterministic
ordering, lifecycle transitions, RLS/execute permissions, sponsorship and
membership behavior, non-stacking bank allowances, deletion semantics, and the
minimized RPC response.

```bash
# From services/api/ with local Supabase running and libpq connection
# variables set for the local database:
npm run test:billing-entitlements
```

The suite uses `ON_ERROR_STOP`, runs in one transaction, and rolls back all
fixtures. It must never be pointed at staging or production.

`billing-entitlements-concurrency.test.ps1` adds real parallel-session coverage
for different purchases on one account, apply versus rebuild, and concurrent
attempts to bind one provider purchase to different billing accounts. It also
covers concurrent authenticated reads by two Premium sponsors of one household
and both membership-removal/sponsorship-selection commit orderings, including
membership reactivation and stale expected-household clears. Test-only advisory
gates plus `pg_stat_activity` lock observations coordinate the sessions; fixed
startup sleeps are not used as evidence of contention. It commits uniquely
named fixtures and therefore must only target a disposable local container:

```powershell
.\supabase\tests\billing-entitlements-concurrency.test.ps1 `
  -Container <disposable-migrated-postgres-container>
```

### 4. Minimized Entitlement API Contract Tests

**Runtime:** PostgreSQL (requires local Supabase)

`entitlement-api-contract.test.sql` pins the parts of `public.get_my_entitlements`
that the `entitlements-v1` Edge Function depends on: its exact minimized return
contract, its least-privilege grants (`authenticated` only, never `anon` or
`PUBLIC`), fail-closed behavior for unauthenticated, cross-household, and
removed-member reads, scope resolution between the user and household subjects,
the ratified bank-connection allowances, the tier projected for every one of the
eight normalized lifecycles, and the two boundary properties the API's
pending-downgrade contract rests on — that `expires_at` tracks the earliest
expiring add-on, and that a weaker purchaser grant collapses into the same bound
even when it does not determine the effective tier or allowance.

```bash
# From services/api/ with local Supabase running and libpq connection
# variables set for the local database:
npm run test:entitlement-api
```

The suite uses `ON_ERROR_STOP`, runs in one transaction, and rolls back all
fixtures. It must never be pointed at staging or production.

### 5. Minimized Entitlement Gateway Integration Tests

**Runtime:** Node against a running local Supabase gateway

`entitlement-gateway.integration.test.mjs` proves what a _deployed_ request
receives, which handler-level unit tests cannot: that a missing, malformed,
untrusted, non-bearer, or **correctly signed but expired** credential reaches
the function and receives the documented `unauthenticated` envelope with CORS
headers and `Cache-Control: no-store`, that no anonymous or expired read ever
succeeds, and that the endpoint stays read-only.

It discovers the gateway port from `config.toml` and the signing and service
credentials from the running containers, so nothing is hard-coded and no
credential is committed. The service credential is used only to provision and
delete a disposable local principal, so an expired token can be minted for a
_real_ subject — that is what attributes the refusal to expiry rather than to an
unverifiable subject. The suite refuses any non-loopback gateway, and **every
prerequisite is mandatory**: a missing stack, signing key, or service credential
fails the run rather than skipping a case.

```bash
# From services/api/, with the local stack running and functions served:
supabase start
supabase functions serve --env-file <local-env-file>

npm run test:entitlement-gateway
```

The suite is not part of any fast unit run, so a developer without a local stack
is unaffected. It runs automatically in the **Entitlement Gateway Integration**
job in `.github/workflows/ci-lint.yml`, which stands up the stack, waits for the
endpoint to answer `401` (not `503`), and then executes exactly this command.

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
