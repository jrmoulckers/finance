# Isolated synthetic web sync: human provisioning plan

**Status: source-reviewed plan; provisioning and runtime acceptance pending.**
Prepared 2026-10-30 for [#4467](https://github.com/jrmoulckers/finance/issues/4467);
handoff to the readiness coordinator in
[#4462](https://github.com/jrmoulckers/finance/issues/4462).
The user's decision was: "Prepare a reviewed isolated-stack setup plan for me to
provision (Recommended)". This is not permission to execute infrastructure,
credential, or database operations.

## Outcome and scope

Provision a disposable, synthetic-only Supabase CLI stack (Postgres, GoTrue Auth,
PostgREST, gateway, auth Edge Functions), then a **separate** PowerSync/Mongo stack
replicating from that same database. Exercise the production-built web PWA, not a
Vite development page or mocked database. Only a complete scenario pass proves
this bounded web behavior; it does **not** prove bank/provider ingestion, native
transport, arbitrary-failure exactly-once delivery, or production readiness.

**Bootstrap is currently blocked on a reviewed isolated setup mechanism.** There
is no checked-in command satisfying all isolation, loopback, credential-output,
and automatic signup-provisioning requirements below. Do not substitute
`npm run dev:full`, `npm run powersync:up`, or a production Compose invocation.
The manual stages deliberately stop where executable tooling is missing.

## Reviewed sources and compatibility

Backend/setup sources were inspected at
`1038a33857b6bfd026a37e31ebd4eabcb31b67d7`, the fetched `origin/main`.
That includes dependency repair [#4466](https://github.com/jrmoulckers/finance/pull/4466)
(`aabe6d969cbdc162203ef1255ac062332b4913ac`) and billing/type repair
[#4463](https://github.com/jrmoulckers/finance/pull/4463).
The scenario [#4464](https://github.com/jrmoulckers/finance/pull/4464) was initially
reviewed at head `efc2642c2546afaf1d3efdf2d0ff0a04cb51f069`, then confirmed merged
to main as `9527c86d74c6af5b5b5604838043f1ceb1c82cf9` during delivery.
Recheck the approved revision before provisioning; do not run another session's
worktree. The pinned scenario links below identify the exact reviewed content.

| Source                                                                                                                                                                                                                                                                                                                                                                                                    | Verified implication                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CLI config](../../services/api/supabase/config.toml)                                                                                                                                                                                                                                                                                                                                                     | Shared `project_id = "finance-local"`; API/DB/shadow/Studio ports 54321/54322/54320/54323. Email confirmations and configured OAuth providers are disabled. Four cookie-auth functions have gateway `verify_jwt = false`.                                                  |
| [Full-stack runner](../../tools/dev-full.mjs)                                                                                                                                                                                                                                                                                                                                                             | Detects stale/other-worktree stacks and can stop/remove/recreate project containers, even without an explicit reset; reads status keys and writes `apps/web/.env.local`.                                                                                                   |
| [Windows setup](../../services/api/scripts/setup-local.ps1)                                                                                                                                                                                                                                                                                                                                               | Starts the default project, executes `db reset` when seed exists, overwrites client configuration and prints status/key output. The shell setup is not an isolated profile either.                                                                                         |
| [API Compose](../../services/api/docker-compose.yml)                                                                                                                                                                                                                                                                                                                                                      | No GoTrue service; edge `SUPABASE_URL` points to PostgREST, not an Auth gateway. Publishes DB 5432; not a real-auth stack. Its [auth helpers](../../services/api/supabase/docker-init/local-auth-functions.sql) are SQL JWT helpers, not an Auth server.                   |
| [Production Compose](../../deploy/docker-compose.yml)                                                                                                                                                                                                                                                                                                                                                     | Includes real GoTrue and logical WAL, but publishes 80/443, uses production secrets/mounts and broader services. Reference behavior only, never the bootstrap base for this run. `GOTRUE_JWT_AUD = authenticated` is required for Supabase-mode PowerSync.                 |
| [PowerSync runner](../../tools/powersync-local.mjs) and [local Compose](../../deploy/docker-compose.powersync-local.yml)                                                                                                                                                                                                                                                                                  | Runner creates a database publication. Compose has fixed project name `finance-powersync-local`, shared default network, project-scoped Mongo volume, mutable service image and a host binding without a loopback address. Port/network overrides alone do not isolate it. |
| [PowerSync config](../../deploy/powersync.yaml) and [sync rules](../../services/api/powersync/sync-rules.yaml)                                                                                                                                                                                                                                                                                            | Supabase JWT-secret verification; telemetry sharing disabled. Household buckets derive from active membership and `token_parameters.user_id`; profile buckets require `public.users`. Rules, not Postgres RLS, authorize replication reads.                                |
| [Web connector](../../apps/web/src/db/sync/powersync/connector.ts)                                                                                                                                                                                                                                                                                                                                        | Fetches an in-memory access JWT for PowerSync; uploads through JWT + anon-key PostgREST. No browser service-role credential is needed. A membership conflict is accepted only after a JWT-scoped lookup confirms the matching owner/admin pair.                            |
| [Household repository](../../apps/web/src/db/repositories/household.ts)                                                                                                                                                                                                                                                                                                                                   | App can write relational household/membership rows; this does not replace the required server profile or prove first-signup bootstrap works.                                                                                                                               |
| [Scenario README](https://github.com/jrmoulckers/finance/blob/efc2642c2546afaf1d3efdf2d0ff0a04cb51f069/apps/web/e2e-sync/README.md), [runner](https://github.com/jrmoulckers/finance/blob/efc2642c2546afaf1d3efdf2d0ff0a04cb51f069/apps/web/playwright.sync.config.ts), [Vite profile](https://github.com/jrmoulckers/finance/blob/efc2642c2546afaf1d3efdf2d0ff0a04cb51f069/apps/web/vite.sync.config.ts) | Runner builds and previews the production app, allows service workers, uses fresh browser contexts, disables trace/video/screenshots and loads no `.env` files through Vite (`envDir: false`). Only HTTP loopback service origins are accepted.                            |

[Full-stack local](./full-stack-local.md) and [local PowerSync](./powersync-local.md)
describe prior setup paths, but their statements that web sync is scaffolding
predate the current connector. Neither guide is replication evidence.

## Prerequisites and isolated inventory

A human needs Docker Desktop, Docker Compose v2, a reviewed/pinned Supabase CLI,
locked Node dependencies, and Playwright Chromium. Root `package.json` requires
Node `>=22.22.1 <23 || >=24` and declares npm `10.9.4`. Inspection found Node
24.3.0, npm 11.16.0 and Compose 2.39.2; **no standalone `supabase` command was
found**. Do not silently use an unpinned `npx --yes supabase` download. A human
must resolve the CLI prerequisite and review supported configuration/port flags.

Use the following **proposed reserved names**, not existing resources. Refuse to
adopt a resource that already has one of these names unless the human verifies
ownership from this run's inventory. The isolated provisioning directory must
be explicitly human-approved, contain no copied credential files, and mount
only the reviewed repository sources.

| Resource                                       | Proposed identity / mapping                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase project                               | `finance-sync-proof-4467`                                                                                                                       |
| CLI network / DB container                     | Expected `supabase_network_finance-sync-proof-4467` / `supabase_db_finance-sync-proof-4467`; verify actual names with the pinned CLI before use |
| CLI volumes                                    | Project-suffixed volumes for this new ID only; record exact generated names before startup/cleanup, do not guess all CLI volume names           |
| PowerSync Compose project                      | `finance-sync-proof-4467-ps`                                                                                                                    |
| PowerSync private network                      | `finance-sync-proof-4467-ps_powersync-local`                                                                                                    |
| PowerSync Mongo volume                         | `finance-sync-proof-4467-ps_powersync_mongo_data`                                                                                               |
| PowerSync containers                           | Expected project-prefixed `powersync-1`, `mongo-1`, `mongo-rs-init-1`; no fixed shared `container_name`                                         |
| API / DB / Studio / shadow                     | `127.0.0.1:55431` / `127.0.0.1:55432` / `127.0.0.1:55433` / `127.0.0.1:55430`                                                                   |
| Optional mail / inspector / analytics / pooler | Reserve 55434-55438 if enabled; otherwise disable optional services in the reviewed profile. CLI-version-specific mappings must be explicit     |
| PowerSync API                                  | `127.0.0.1:55440` to container 8080                                                                                                             |
| Web proof                                      | `http://localhost:4193`; runner uses this origin for cookies and PWA storage                                                                    |

Name-only Docker inspection found the existing `finance-powersync-local` stack,
its Mongo volume and `supabase_network_finance-local`. They are **out of scope**.
Listening-port inspection found 80, 5432 and 8080 occupied. No listener was found
on 54321-54324, 54327, 54329, 55430-55440 or 4193 on 2026-10-30. This is a snapshot,
not a reservation or evidence of backend health. Check again immediately before
human startup, including IPv4 and IPv6. Do not stop a conflicting process.

Read-only preflight commands, from the approved repository checkout:

```powershell
git status --short
git rev-parse HEAD
docker ps --format '{{.Names}}\t{{.Ports}}'
docker network ls --format '{{.Name}}'
docker volume ls --format '{{.Name}}'
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in (55430..55440) -or $_.LocalPort -in @(80,5432,8080,4193) } |
  Select-Object LocalAddress,LocalPort
```

## Stage 1: unblock the isolated bootstrap (tooling review, not execution)

DevOps owns the smallest separate prerequisite: a local-only profile/materializer
around the Supabase CLI and the existing PowerSync/Mongo service definitions.
Database/backend owners review schema and auth provisioning. This plan adds no
script, config, schema or runtime change. The prerequisite must:

1. Materialize a separate CLI project config with the proposed ID, explicit
   ports, correct site/redirect origin and loopback-only publications. Verify
   whether the pinned CLI supports loopback binding; if not, supply a reviewed
   separate local service definition rather than weakening exposure to all
   interfaces. Disable optional services that cannot meet this constraint.
2. Copy/reference the complete reviewed up-migration inventory and functions,
   without reading repository `.env` files; disable the demo seed for the proof.
   Fail on an existing project/volume, unavailable port, foreign mount, schema
   error or nonlocal destination. No heal/recreate/reset fallback.
3. Use a separately named PowerSync project/volume and only the new CLI network.
   Replace the unqualified host port binding with `127.0.0.1:55440:8080`; keep
   Mongo unpublished. Pin the PowerSync service and compatible Mongo images to
   reviewed immutable digests and validate config/sync-rule syntax against them.
   Do not assume `latest` behavior is stable.
4. Handle local credentials privately, suppress key/status output, and emit only
   nonsecret endpoints plus ownership/migration/image identifiers. Do not use
   `docker compose config`, container environment inspection, or status env
   output as shareable evidence. Ensure inherited provider/hosted configuration
   cannot enter the bootstrap.
5. Provide an explicit, reviewed first-signup provisioning adapter and migration
   history verification; return a hard failure when it cannot provision. Produce
   exact startup/readiness/cleanup commands tied to the new project before any
   human execution.

**There is no executable bootstrap command to give today.** Renaming a Compose
project alone does not fix mounts, JWT compatibility, missing GoTrue, profile
provisioning or host exposure. Once the prerequisite is reviewed, a human can
execute its documented local startup commands in stages 2-3. Do not turn the
steps above into an improvised shell command.

## Stage 2: database, Auth and household prerequisites (human only)

The human starts only the newly approved project and applies migrations only
to its fresh database. Do not use `db push` against a linked/hosted project,
reset an existing database, execute down migrations, or selectively omit a
failing migration to make the test pass.

The reviewed inventory contains **59 top-level up-migrations**, ordered from
`20260306000001_initial_schema.sql` through
`20260908000002_durable_bank_revocation.sql`. Apply the full reviewed chain,
not just the initial eight tables: sync rules reference later tables as well.
The [Compose initializer](../../services/api/supabase/docker-init/01-apply-migrations.sh)
uses sorted SQL files with `ON_ERROR_STOP`, but does not supply CLI migration
history or isolation and is not a standalone bootstrap recommendation.

| Dependency                        | Required verification                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial schema and RLS            | `pgcrypto`, `uuid-ossp`; authentic Supabase roles, `auth.users`, `auth.uid()` and `auth.jwt()` from the CLI bootstrap; [initial RLS](../../services/api/supabase/migrations/20260306000002_rls_policies.sql) uses **`public.household_ids()`**, not a guessed `auth.household_ids()`                                           |
| Signup/profile                    | [Auth config migration](../../services/api/supabase/migrations/20260306000003_auth_config.sql) defines provisioning/token-hook functions; defining a function is not wiring an Auth event hook                                                                                                                                 |
| Idempotent household RPC          | [Security migration](../../services/api/supabase/migrations/20260316000001_edge_function_security.sql) defines `public.handle_new_user_signup(uuid,text,text)`, service-role-only; inserts `public.users`, household and lowercase `owner` membership                                                                          |
| Recurrence / owner attribution    | `20260323000002` creates `recurring_transaction_templates`, the actual FK target of `20260326000002`'s `recurring_rule_id`; `20260326000003`/`04` add rollover/goal linkage; `20260326000005` adds owner fields; [owner RLS](../../services/api/supabase/migrations/20260330000006_enforce_owner_id_rls.sql) constrains writes |
| Protected rows / rich web columns | `20260331000002`, `20260331000004`, `20260401000002` and [schema superset](../../services/api/supabase/migrations/20260402000001_schema_unification_superset.sql) supply mood/privacy fields, denormalization and web-first tables consumed by current sync rules                                                              |
| Later migrations                  | Billing/bank schema must still migrate successfully, but no paid/provider service, scheduler, webhook destination or `live_bank_data` enablement is required                                                                                                                                                                   |

Inspect applied migration history, extensions, RLS, roles and selected columns
through a private human admin session. Record names/versions and pass/fail, not
credentials or rows. Some migrations conditionally schedule maintenance when
`pg_cron` is installed; review that behavior and ensure no provider or external
jobs/destinations are activated in the disposable stack.

**Automatic provisioning is a blocking seam.** `auth-signup` calls GoTrue signup;
it does not call the household RPC. The checked-in CLI config does not register
an `auth.users` INSERT provisioning hook. Initial `households.created_by` and
`household_members.user_id` reference **`public.users`**, while financial owner
fields reference **`auth.users`**. A token alone cannot satisfy these FKs.

The [auth-webhook function](../../services/api/supabase/functions/auth-webhook/index.ts)
expects an INSERT payload and a dedicated `AUTH_WEBHOOK_SECRET`. Its gateway
verification must also be explicitly compatible with that credential; do not
assume the default JWT gateway accepts a webhook secret. The production
[webhook SQL](../../deploy/volumes/db/webhooks.sql) provides generic HTTP-hook
machinery, not a registered Finance signup hook.

The reviewed local adapter must provision every newly generated `@local.test`
user before financial uploads, preserve the RPC's active-membership idempotency,
and avoid racing the app's household creation. A synchronous local database
adapter calling the existing RPC is a candidate for owner review, **not an
implemented migration**. An authenticated webhook is an alternative only with
verified delivery ordering, gateway handling and bounded failure reporting.
Manual precreation of fixed users or pausing to insert rows is not equivalent:
the scenario creates new UUID-tagged users without an admin fixture.

Prove independently that two fresh synthetic signups each obtain their own
active profile/membership, never each other's household. Preserve RLS and the
actual `sub` user identity. Do not relax RLS/FKs, grant the client provisioning
RPC access, forge household claims or use a service role in Playwright.

## Stage 3: compatible JWT, replication and auth routes (human only)

Use one **isolated-stack signing configuration**, never credentials from an
existing stack. Current PowerSync config uses Supabase shared-secret mode:
GoTrue's signing secret, PostgREST verification and `PS_JWT_SECRET` must agree.
Choose compatible local HS256 issuance with `aud = authenticated`, a real user
UUID `sub`, valid expiry and authenticated role. An asymmetric/JWKS-only CLI
configuration needs a separately reviewed PowerSync verification change; the
current config is not proof of compatibility with it.

The human privately supplies signing material, database passwords/connection
URI and service-role credentials. Private server variable names include
`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` (self-hosted reference),
`PS_JWT_SECRET`, `PS_PG_URI`, and `PS_MONGO_URI`; `AUTH_WEBHOOK_SECRET` is needed
only if that provisioning path is chosen. Never place these in `VITE_*`,
`LOCAL_SYNC_*`, test reports, source control or handoff comments.
The auth functions' [env validator](../../services/api/supabase/functions/_shared/env.ts)
requires server-side `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_ANON_KEY` even for the password/cookie path.

Configure the internal `SUPABASE_URL` as the **new gateway** exposing `/auth/v1`
and `/rest/v1`, not a bare PostgREST service. The browser uses the loopback API
origin. Serve signup/login/refresh/logout with their reviewed per-function JWT
settings; keep other verification enabled. The preview must proxy `/api/auth/x`
to `/functions/v1/auth-x`, preserving `Set-Cookie` and request cookies.
[Cookie helpers](../../services/api/supabase/functions/_shared/cookie.ts) require
HttpOnly, SameSite=Lax and Path=/api/auth; HTTP loopback must not acquire an
incorrect HTTPS forwarded scheme. Use localhost consistently for the web app.
Unset `CI=true`: [Vite config](../../apps/web/vite.config.ts) installs a CI
preview refresh stub, which is not real auth evidence.

Enable logical WAL/replication slots only on the new Postgres and create the
`powersync` publication there through the reviewed human bootstrap. Verify
every rule-referenced table is published and every selected column exists.
PowerSync's database connection must resolve the new DB on the new network,
never shared `db` aliases on multiple attached networks. A local admin
replication connection may read across households server-side; the unchanged
Finance bucket rules must constrain delivery to JWT identity. Do not confuse
RLS-scoped uploads with replication authorization.

Human readiness checks before the scenario:

| Check        | Required result                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory    | Only new project resources/mounts; all published ports loopback; shared resources unchanged                                                                     |
| Auth/gateway | `/auth/v1/health` succeeds with public anon configuration; real signup/login return sessions privately; refresh/logout work through the web route without stubs |
| Schema       | Full reviewed migration history, required FKs/columns, RLS and household provisioning pass; no demo seed or provider jobs                                       |
| Replication  | Logical WAL/publication/slot active on the new DB; pinned service accepts rules; new Mongo replica set initialized; invalid/expired user JWT rejected           |
| Delivery     | A synthetic JWT opens the correct user/household buckets; distinct household JWT cannot retrieve those rows                                                     |
| PWA          | Production preview is at the intended origin, real service worker controls it, CSP admits only the intended loopback API/PowerSync HTTP/WebSocket paths         |

The PowerSync liveness command is valid **after human startup**, but not a
replication or authorization verdict:

```powershell
curl.exe --fail --silent --output NUL http://127.0.0.1:55440/probes/liveness
```

## Stage 4: public client configuration and acceptance

Only the isolated stack's **public anon client key**, not a service-role key,
belongs in the approved test environment. It identifies the API project and
does not replace the authenticated user's JWT/RLS. Obtain it privately through
the reviewed provisioning mechanism, without printing key-bearing status output.
No `.env` file creation or credential-file copying is part of this plan.

| Input name                       | Placeholder / meaning                                                                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOCAL_SYNC_SUPABASE_URL`        | `http://127.0.0.1:55431`                                                                                                                                                                                                                                   |
| `LOCAL_SYNC_POWERSYNC_URL`       | `http://127.0.0.1:55440`                                                                                                                                                                                                                                   |
| `LOCAL_SYNC_ANON_KEY`            | `YOUR_ISOLATED_PUBLIC_ANON_KEY` supplied through the approved environment                                                                                                                                                                                  |
| `LIVE_SYNC_PORT`                 | `4193`                                                                                                                                                                                                                                                     |
| Runner-derived public Vite names | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_POWERSYNC_URL`, `VITE_POWERSYNC_ENABLED`, `VITE_FUNCTIONS_PROXY_TARGET`, `VITE_AUTH_PROXY_TARGET`, `VITE_LOGIN_ENDPOINT`, `VITE_REFRESH_ENDPOINT`, `VITE_LOGOUT_ENDPOINT`, `VITE_BETA_ALLOWED_EMAILS` |

The runner sets PowerSync enabled and clears the beta email allowlist. Review
inherited environment **names** privately: prohibit hosted endpoints, provider
enablement, `VITE_E2E_*` mocks and secret values. `envDir: false` stops file
loading, not arbitrary inherited process variables. Keep live-bank data disabled.

After #4464 is reconciled/merged and stages 1-3 pass, from the approved checkout:

```powershell
$env:LOCAL_SYNC_SUPABASE_URL = 'http://127.0.0.1:55431'
$env:LOCAL_SYNC_POWERSYNC_URL = 'http://127.0.0.1:55440'
$env:LIVE_SYNC_PORT = '4193'
# LOCAL_SYNC_ANON_KEY is supplied privately; never echo it.
# CI=true must not be inherited by this real-auth run.
Set-Location apps\web
npx playwright test --config playwright.sync.config.ts --list
npx playwright test --config playwright.sync.config.ts
```

The first command proves discovery only. The second owns production build and
preview startup with a strict port and no reused server. Missing configuration
fails, never skips. If dependencies/Chromium are absent, a human restores the
locked dependencies/browser first; do not replace this runner with `e2e/`,
`e2e-live/` or `npm run dev:full --e2e`.

The single scenario must pass **all** of the following, with no mock or admin
assertion substitute: explicit Cloud Sync consent before auth/data sync; genuine
signup/sign-in and account/transaction CRUD; exact server cardinality and integer
cents (initial account 10000, transaction -1234); online reload; offline creation
and full offline reload of cached assets/durable SQLite; server absence before
reconnect and exactly one successful observed upload afterward; matching IDs and
amounts in a second fresh browser context; outsider household read/update yielding
no rows and forbidden insert returning 403; acknowledged mutation not replayed
in a second connectivity cycle; logout/account switch with no prior-user rows,
including transient rendering and reload. Consent completion does not by itself
prove every negative-consent case; do not expand the scenario's claim.

Record commit/image/migration identifiers, exact command, exit code and assertion
outcome only. Disable credential-bearing HTTP dumps, traces, screenshots/videos
and raw backend logs. Redact unexpected failures privately before sharing.
Coordinator owns the final readiness record; this guide makes no runtime claim.

## No-go, recovery and human cleanup

Stop on name/port collisions, foreign mounts, shared volumes/networks, nonloopback
exposure, real data/credentials, hosted destinations, incompatible JWT audience
or signing mode, failed migration/provisioning/rules, missing RLS or required
PWA assets, auth stubs, or any incomplete acceptance assertion. Do not reset or
heal a shared stack, weaken security or enable a provider to get a green result.

Recovery is to retain the isolated failed-run inventory and minimized failure
evidence, then have the owning engineer correct the separate bootstrap/app seam.
A human may provision a fresh **newly named** disposable run after review.
Historical destructive down SQL is not a recovery shortcut.

Synthetic users/rows persist after Playwright finishes. Human cleanup is separate:
verify the exact new container/network/volume inventory and ownership first;
stop only those new services, then decide whether to retain or remove each named
synthetic volume/project and clear this run's browser-origin storage. Do not run
default `powersync:down`, `supabase:stop`, `db reset`, `down --volumes`, wildcard
deletion, Docker prune/restart, or touch the existing stack. Do not remove another
session's worktree. The prerequisite's reviewed cleanup commands must name the
new project explicitly; no unreviewed cleanup command is provided here.

## Static review evidence and remaining decisions

This review read source/config/migrations, the pending PR's exact Git objects,
tool versions, listening sockets and **name/port-only** Docker inventory. No
container was provisioned/started/reset/stopped/reconfigured; no container
credential environment, real `.env`/secret file, database or production endpoint
was accessed. No key was generated and no migration was executed.

Static consistency established the input names, build/preview ownership,
cookie/proxy expectations, schema dependencies and unsafe shared-resource paths.
It cannot establish CLI-version-specific loopback binding, migration execution,
JWT interoperability, hook timing, replication, offline durability or isolation
at runtime. Those remain human acceptance gates, not inferred successes.

Before execution, owner review must select/pin the CLI and compatible service
images, approve the isolated provisioning location and loopback mechanism, and
implement/review the automatic signup adapter. Conservative defaults are
synthetic email/password auth, no confirmation/providers, current HS256-compatible
Supabase mode and unchanged Finance schema/RLS/sync rules. No additional product
choice is needed unless those defaults cannot be supported.
