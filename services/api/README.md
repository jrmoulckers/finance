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
├── .env.example                             # Environment variable template
├── openapi.yaml                             # OpenAPI 3.0 API specification
├── package.json                             # npm scripts (supabase, docs, etc.)
├── docs/
│   └── README.md                            # API documentation guide
├── powersync/
│   └── sync-rules.yaml                      # PowerSync selective replication rules
├── scripts/
│   ├── setup-local.sh                       # Bash setup script (macOS/Linux)
│   └── setup-local.ps1                      # PowerShell setup script (Windows)
└── supabase/
    ├── config.toml                          # Supabase CLI project config
    ├── seed.sql                             # Test seed data (loaded on db reset)
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
        ├── 20260306000002_rls_policies.sql   # Row-Level Security policies
        ├── 20260306000003_auth_config.sql    # Auth configuration
        ├── 20260307000001_monitoring.sql     # Monitoring setup
        ├── 20260315000001_export_audit_log.sql
        ├── 20260316000001_edge_function_security.sql
        └── 20260316000001_fix_invitation_rls.sql
```

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — required by the Supabase CLI to run the local stack
- [Supabase CLI](https://supabase.com/docs/guides/cli) — manages the full local Supabase environment
  - macOS / Linux: `brew install supabase/tap/supabase`
  - Windows: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase`
  - Any platform: `npm i -g supabase`
- [Node.js](https://nodejs.org/) ≥ 22 — for npm scripts and tooling

## Local Development Setup

### Quick Start (recommended)

The fastest way to get a full local Supabase stack running:

```bash
# From the repository root:
cd services/api
npm install

# Option A — automated setup script (does everything):
bash scripts/setup-local.sh          # macOS / Linux / Git Bash
# or
.\scripts\setup-local.ps1            # Windows PowerShell

# Option B — npm convenience scripts:
npm run supabase:start               # Start the stack
```

The setup script will:

1. ✅ Verify that Docker and the Supabase CLI are installed
2. ✅ Start the full local Supabase stack (PostgreSQL 15, Auth/GoTrue, PostgREST API, Studio UI, Realtime, Storage, Kong gateway)
3. ✅ Apply all 7 database migrations automatically
4. ✅ Load seed data (2 users, 2 households, 5 accounts, 10 categories, 30 transactions, 4 budgets, 2 goals)
5. ✅ Print connection URLs and generated API keys

### Environment Variables

After the stack starts, the CLI prints your local API keys. Copy them into a `.env` file:

```bash
cp .env.example .env
# Edit .env and paste the anon key and service-role key from the CLI output
```

> ⚠️ **Never commit `.env`** — it is already listed in `.gitignore`. Only `.env.example` (with placeholder values) is tracked.

### Accessing Local Services

| Service             | URL                                                       | Notes                                   |
| ------------------- | --------------------------------------------------------- | --------------------------------------- |
| **Studio (UI)**     | http://localhost:54323                                    | Database browser, SQL editor, auth mgmt |
| **API (PostgREST)** | http://localhost:54321                                    | RESTful API for your tables             |
| **Database**        | `postgresql://postgres:postgres@localhost:54322/postgres` | Direct psql / GUI connection            |
| **Inbucket (mail)** | http://localhost:54324                                    | Catches auth confirmation emails        |

### npm Scripts Reference

Run these from `services/api/`:

| Script                       | Command                       | Description                                  |
| ---------------------------- | ----------------------------- | -------------------------------------------- |
| `npm run supabase:start`     | `supabase start`              | Start the full local stack                   |
| `npm run supabase:stop`      | `supabase stop`               | Stop all containers                          |
| `npm run supabase:reset`     | `supabase db reset`           | Drop DB, re-apply migrations + seed data     |
| `npm run supabase:migrate`   | `supabase migration up`       | Apply only pending (new) migrations          |
| `npm run supabase:status`    | `supabase status`             | Show running services and keys               |
| `npm run supabase:functions` | `supabase functions serve`    | Serve Edge Functions locally (hot-reload)    |
| `npm run setup`              | `bash scripts/setup-local.sh` | Full automated setup (checks + start + seed) |

### Running Edge Functions Locally

Edge Functions run in a local Deno runtime with hot-reload:

```bash
# Start the function server (requires the stack to be running):
npm run supabase:functions

# Test a function:
curl -i http://localhost:54321/functions/v1/health-check
```

To pass environment variables to functions, create a `.env` file (see above) — the CLI loads it automatically.

### Working with Migrations

```bash
# Create a new migration:
supabase migration new <migration_name>
# → Creates supabase/migrations/<timestamp>_<migration_name>.sql

# Apply pending migrations to the running instance:
npm run supabase:migrate

# Nuclear option — drop everything, re-apply all migrations, re-seed:
npm run supabase:reset
```

> **Tip:** Always test migrations with `supabase:reset` before pushing. This ensures the full migration chain applies cleanly from scratch.

### Resetting the Database

```bash
npm run supabase:reset
```

This will:

1. Drop and recreate the local PostgreSQL database
2. Apply all migrations in order (from `supabase/migrations/`)
3. Execute `supabase/seed.sql` to load test data

### Stopping the Stack

```bash
npm run supabase:stop
```

This stops all Docker containers. Data is persisted in Docker volumes and will survive restarts.

### Architecture Note: Why Not a Custom `docker-compose.yml`?

The Supabase CLI (`supabase start`) manages 10+ interconnected services (PostgreSQL, GoTrue, PostgREST, Realtime, Storage, Kong, Studio, Inbucket, pg_meta, and more) with correct versioning, networking, and health checks. Maintaining a custom `docker-compose.yml` would be fragile, quickly outdated, and miss internal wiring that the CLI handles automatically.

**Use the CLI. It is the officially supported local development path.**

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
