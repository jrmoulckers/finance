# Finance — Supabase Backend (`services/api/`)

This directory contains the Supabase project configuration, PostgreSQL migrations, and Edge Functions for the Finance app backend.

## API Documentation

Interactive API docs are generated from the [OpenAPI 3.0 specification](openapi.yaml).

```bash
cd services/api
npm install
npm run docs:api        # Preview at http://localhost:8080
npm run docs:api:lint   # Validate the spec
```

See [`docs/README.md`](docs/README.md) for full details on viewing and updating the API documentation.

## Project Structure

```
services/api/
├── README.md
├── openapi.yaml                             # OpenAPI 3.0 API specification
├── package.json                             # npm scripts (docs:api, etc.)
├── docs/
│   └── README.md                            # API documentation guide
├── powersync/
│   └── sync-rules.yaml                      # PowerSync selective replication rules
└── supabase/
    ├── config.toml                          # Supabase CLI project config
    ├── functions/                           # Edge Functions (Deno/TypeScript)
    │   ├── _shared/                         # Shared utilities (CORS, auth, response)
    │   ├── health-check/                    # GET  — System health status
    │   ├── auth-webhook/                    # POST — Auth user-creation webhook
    │   ├── passkey-register/                # POST — WebAuthn registration ceremony
    │   ├── passkey-authenticate/            # POST — WebAuthn authentication ceremony
    │   ├── household-invite/                # POST/GET/PUT — Invitation lifecycle
    │   ├── account-deletion/                # DELETE — GDPR account erasure
    │   └── data-export/                     # GET  — GDPR data portability
    └── migrations/
        ├── 20260306000001_initial_schema.sql # Tables, indexes, triggers
        └── 20260306000002_rls_policies.sql   # Row-Level Security policies
```

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase` or `brew install supabase/tap/supabase`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local development)

## Getting Started

### 1. Start local Supabase

```bash
cd services/api
supabase start
```

This spins up a local Supabase stack (PostgreSQL, Auth, Studio, etc.) using Docker. The CLI reads `supabase/config.toml` for configuration.

### 2. Run migrations

Migrations run automatically on `supabase start`. To apply new migrations to a running instance:

```bash
supabase db reset    # Drop and recreate with all migrations
# or
supabase migration up # Apply pending migrations only
```

### 3. Access local services

| Service         | URL                                                       |
| --------------- | --------------------------------------------------------- |
| API (PostgREST) | `http://localhost:54321`                                  |
| Studio (UI)     | `http://localhost:54323`                                  |
| Database        | `postgresql://postgres:postgres@localhost:54322/postgres` |

### 4. Create a new migration

```bash
supabase migration new <migration_name>
```

This creates a timestamped `.sql` file in `supabase/migrations/`.

## Database Schema

The schema mirrors the SQLDelight definitions in `packages/models/` with PostgreSQL-native types:

| Table               | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `users`             | User profiles (linked to Supabase Auth)              |
| `households`        | Groups of users sharing finances                     |
| `household_members` | Join table: user ↔ household with role               |
| `accounts`          | Financial accounts (checking, savings, credit, etc.) |
| `categories`        | Transaction categories (hierarchical via parent_id)  |
| `transactions`      | Financial transactions                               |
| `budgets`           | Spending limits per category/period                  |
| `goals`             | Savings goals with progress tracking                 |

### Key design decisions

- **Monetary values**: Stored as `BIGINT` (cents) — never `NUMERIC`, `DECIMAL`, or `FLOAT`
- **Currency**: ISO 4217 `TEXT` column alongside every monetary column
- **Soft deletes**: All tables have a `deleted_at TIMESTAMPTZ` column; partial indexes filter on `deleted_at IS NULL`
- **UUIDs**: All primary keys are `UUID` with `gen_random_uuid()` defaults
- **Timestamps**: `TIMESTAMPTZ` for all temporal columns (except `date DATE` on transactions)
- **Sync metadata**: `sync_version BIGINT` and `is_synced BOOLEAN` for PowerSync integration
- **Auto-updated timestamps**: `updated_at` is set automatically via `BEFORE UPDATE` triggers

## Row-Level Security (RLS)

**RLS is enabled on every table — no exceptions.**

### Security model

| Table               | SELECT                      | INSERT               | UPDATE               | DELETE (soft)        |
| ------------------- | --------------------------- | -------------------- | -------------------- | -------------------- |
| `users`             | Own row only (`auth.uid()`) | Own row only         | Own row only         | Own row only         |
| `households`        | Members only                | Creator only         | Creator only         | Creator only         |
| `household_members` | Co-members can see          | Household owner only | Household owner only | Household owner only |
| `accounts`          | Household members           | Household members    | Household members    | Household members    |
| `categories`        | Household members           | Household members    | Household members    | Household members    |
| `transactions`      | Household members           | Household members    | Household members    | Household members    |
| `budgets`           | Household members           | Household members    | Household members    | Household members    |
| `goals`             | Household members           | Household members    | Household members    | Household members    |

### Helper function

```sql
auth.household_ids() → UUID[]
```

Returns an array of household IDs the current authenticated user belongs to. Used in all household-scoped RLS policies for efficient membership checks. Defined as `SECURITY DEFINER` so it can read `household_members` regardless of RLS on that table.

### How it works

1. User authenticates via Supabase Auth → receives JWT with `sub` (user ID)
2. `auth.uid()` extracts the user ID from the JWT
3. `auth.household_ids()` queries `household_members` for active memberships
4. Every table with `household_id` checks `household_id = ANY(auth.household_ids())`
5. No cross-household data leaks are possible — the database enforces isolation

## Environment Variables

For production deployment, set these in your Supabase project dashboard:

| Variable               | Description                   |
| ---------------------- | ----------------------------- |
| `PROJECT_REF`          | Supabase project reference ID |
| `SUPABASE_DB_PASSWORD` | Database password             |
| `JWT_SECRET`           | JWT signing secret for Auth   |

> **Note**: Never commit real credentials. Use `supabase/config.toml` for local dev only.
