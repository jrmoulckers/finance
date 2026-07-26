# Local PowerSync Backend

Run a **self-hosted PowerSync sync engine locally**, next to the Supabase CLI
stack, so data can replicate between Postgres and edge clients. This is the
backend half of moving the app off file-import/demo data and onto **live,
syncing data** (ADR-0002; implementation guide
[`881-powersync-docker-compose.md`](../architecture/implementation/881-powersync-docker-compose.md)).

For the web app + Supabase auth loop, see
[`full-stack-local.md`](./full-stack-local.md). This guide adds PowerSync on top
of that stack.

> **Scope.** This brings up the PowerSync **service** and verifies it replicates
> from the local Postgres. Wiring the web client to it (the `@powersync/web` SDK
> and the local↔Postgres schema bridge) is follow-up work — see
> [Next: wire the web client](#next-wire-the-web-client).

## Prerequisites

- **Docker Desktop running.**
- **The Supabase CLI stack is already up** — `npm run dev:full` (or
  `supabase start` in `services/api`). PowerSync replicates from the CLI's
  Postgres, so it must exist first.

## Quick start

```bash
npm run powersync:up
```

That runs [`tools/powersync-local.mjs`](../../tools/powersync-local.mjs), which:

1. **Preflight** — checks Docker is running and the Supabase CLI network
   (`supabase_network_finance-local`) exists.
2. **Ensures the publication** — creates `CREATE PUBLICATION powersync FOR ALL TABLES`
   on the local Postgres if it isn't there yet (idempotent). PowerSync reads
   changes through this publication via logical replication.
3. **Starts the stack** —
   [`deploy/docker-compose.powersync-local.yml`](../../deploy/docker-compose.powersync-local.yml):
   PowerSync, MongoDB (single-node replica set), and a one-shot replica-set
   initializer.
4. **Waits for health** — polls the PowerSync `/probes/liveness` endpoint until
   it passes.

When it finishes, the PowerSync API is available at <http://localhost:8080>.

| Command                    | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `npm run powersync:up`     | Create publication, start the stack, wait for health |
| `npm run powersync:down`   | Stop and remove the stack (keeps Mongo data)         |
| `npm run powersync:status` | Show container status                                |
| `npm run powersync:logs`   | Show recent PowerSync logs (`-- --follow` to stream) |

To also drop the Mongo bucket-storage volume: `npm run powersync:down -- --volumes`.

## How it fits together

```
apps/web (vite on host)
        │  HTTP :8080 (PowerSync API)
        ▼
┌──────────────────────────┐        ┌──────────────────────────┐
│ PowerSync service        │            │ MongoDB (rs0)            │
│ (journeyapps/            │  bucket    │ single-node replica set  │
│  powersync-service)      │  storage → │ (sync-engine state only) │
└───────────┬──────────────┘        └──────────────────────────┘
                │ logical replication (publication `powersync`)
                ▼
┌──────────────────────────┐
│ Supabase CLI Postgres    │  ← same DB the edge functions use
│  (container `db`)        │
└──────────────────────────┘
```

- **Config is shared with production.** The container mounts
  [`deploy/powersync.yaml`](../../deploy/powersync.yaml) (env-driven) and
  [`services/api/powersync/sync-rules.yaml`](../../services/api/powersync/sync-rules.yaml),
  so local behaviour matches the deployed stack.
- **It connects to the Supabase CLI Postgres** over the CLI's Docker network
  (`db:5432`) as the `postgres` role, which already has the `REPLICATION`
  attribute locally. Production uses a superuser / dedicated role instead
  (see [#1306](https://github.com/jrmoulckers/finance/issues/1306)). The
  connection string (`PS_PG_URI`) is **assembled from parts by the tool and
  injected at runtime** — no database credential is committed to the compose
  file. Override the parts with `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`,
  `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_NAME`.
- **JWTs** minted by the local GoTrue validate here because PowerSync is given
  the Supabase CLI's default local JWT secret.
- **MongoDB** is local-only: a single-node replica set with **no keyFile/auth**
  (the container is only reachable on a private compose network). Production
  uses keyFile auth — see [`deploy/docker-compose.yml`](../../deploy/docker-compose.yml).

> **Running `docker compose` directly** (without `npm run powersync:up`)? The
> compose file requires `PS_PG_URI` to be set to a standard Postgres connection
> URI for the `db` host — scheme `postgres://`, the Supabase local `postgres`
> role for both user and password, host `db`, port `5432`, database `postgres`,
> with `?sslmode=disable`. Prefer the npm script, which assembles and injects it
> for you so no credential literal is needed.

## Verify it's working

```bash
# Liveness probe (also polled automatically by `powersync:up`)
curl http://localhost:8080/probes/liveness

# Watch the service connect to Postgres and load the sync rules
npm run powersync:logs
```

Healthy logs show the Postgres replication connection established and the sync
rules loaded. If a bucket references a table that isn't in the `powersync`
publication yet, re-running `npm run powersync:up` re-checks it.

## Next: wire the web client

The service is running, but the web app doesn't talk to it yet. To connect it
(follow-up work):

1. Add the PowerSync SDK (`@powersync/web`) and a connector that fetches
   credentials from the Supabase session and uploads writes through PostgREST
   (so RLS applies).
2. Point the client at the local service by adding to `apps/web/.env.local`:

   ```dotenv
   VITE_POWERSYNC_URL=http://localhost:8080
   VITE_POWERSYNC_ENABLED=true
   ```

3. Reconcile the web app's local SQLite shape (singular `account`/`transaction`
   tables) with the Postgres/PowerSync shape (plural `accounts`/`transactions`,
   `_cents`/`currency_code`). This schema bridge is the main design task and is
   tracked separately.

## Troubleshooting

| Symptom                                        | Fix                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Supabase CLI network "…" not found`           | Start Supabase first: `npm run dev:full`.                                                                                 |
| Health never passes on first run               | The first run pulls `journeyapps/powersync-service` + `mongo:7-jammy`; give it time, then check `npm run powersync:logs`. |
| Port 8080 already in use                       | Run with a different host port: `POWERSYNC_LOCAL_PORT=8090 npm run powersync:up`.                                         |
| `Could not query Postgres in container "…"`    | Your Supabase project_id differs — set `SUPABASE_DB_CONTAINER` / `SUPABASE_NETWORK` to match `docker ps`.                 |
| Replication errors about a missing publication | Re-run `npm run powersync:up` (it recreates the publication idempotently).                                                |

Override env vars: `POWERSYNC_LOCAL_PORT`, `SUPABASE_NETWORK`,
`SUPABASE_DB_CONTAINER`, and the Postgres connection parts `SUPABASE_DB_USER` /
`SUPABASE_DB_PASSWORD` / `SUPABASE_DB_HOST` / `SUPABASE_DB_PORT` /
`SUPABASE_DB_NAME`. Run `node tools/powersync-local.mjs --help` for details.
