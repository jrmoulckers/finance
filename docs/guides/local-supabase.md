# Local Supabase Development

This guide covers running Supabase locally with Docker for backend development.
All data stays on your machine — no cloud account required.

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Container runtime for Supabase services |
| [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) | `npm install -g supabase` |

Verify both are available:

```bash
docker --version
supabase --version
```

## Setup

### 1. Start Supabase locally

```bash
cd services/api
supabase start
```

This starts all Supabase services in Docker containers:

| Service | URL |
|---------|-----|
| Studio (dashboard) | <http://localhost:54323> |
| API (PostgREST) | <http://localhost:54321> |
| Auth (GoTrue) | <http://localhost:54321/auth/v1> |
| Database (PostgreSQL) | `postgresql://postgres:postgres@localhost:54322/postgres` |

On first run this pulls the required Docker images, which may take a few minutes.

### 2. Apply migrations

```bash
supabase db reset
```

This applies all migrations from `supabase/migrations/` and seeds the database.

### 3. Grab the local keys

After `supabase start` completes, it prints the local `anon` and `service_role` keys.
You can retrieve them again at any time:

```bash
supabase status
```

## Running Edge Functions

Serve Edge Functions locally with hot-reload:

```bash
supabase functions serve
```

Functions are accessible at `http://localhost:54321/functions/v1/<function-name>`.

## Connecting the App

Set these environment variables (or add them to a `.env.local` file that is
**not** committed — see `.env.example` for the template):

```
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<anon key shown by supabase start>
```

> **Security note:** Never commit real keys. The local `anon` key only works
> against your local instance and has no access to production data.

## Resetting the Database

```bash
supabase db reset
```

This drops all data and re-runs every migration from scratch — useful when
you change migration files or want a clean slate.

## Creating a New Migration

```bash
supabase migration new <migration_name>
```

This creates a timestamped SQL file in `supabase/migrations/`. Write your
`CREATE TABLE`, `ALTER TABLE`, and RLS policy statements there.

## Stopping Supabase

```bash
supabase stop
```

Add `--no-backup` to also remove the Docker volumes (full reset on next start).

## Common Issues

| Problem | Fix |
|---------|-----|
| Port conflict on 54321–54323 | Stop the conflicting process or change ports in `supabase/config.toml` |
| Docker not running | Start Docker Desktop before running `supabase start` |
| Migrations fail | Check the SQL syntax in `supabase/migrations/` — run `supabase db reset` after fixing |
| Slow first start | Normal — Docker needs to pull ~2 GB of images on the first run |
| Auth not working | Ensure the `anon` key matches the one shown by `supabase status` |
