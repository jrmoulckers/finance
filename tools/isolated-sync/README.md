# Isolated synthetic sync materializer

Source delivery for [#4605](https://github.com/jrmoulckers/finance/issues/4605).
This is executable tooling, **not approval to provision**. The readiness
coordinator must obtain approval for the exact checkout, directory, project,
resource manifest, startup commands, private credential handling and eventual
cleanup before a human runs lifecycle stages. Agents implementing this change
must not run those stages.

## Why a separate definition

The Supabase CLI's ordinary `start` does not explicitly bind its publications
to loopback. This tool **never calls `start`, `db start`, `reset`, `stop`,
`db push`, `functions serve` or the existing shared-stack wrappers**. Instead:

- A new Supabase-compatible service definition publishes only
  `127.0.0.1:55432` (database) and `127.0.0.1:55431` (gateway).
- The pinned CLI is used exclusively for `--version` and
  `migration up --db-url postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable`.
  The password travels in its private process environment, never its arguments.
- GoTrue first runs **only `migrate`**, without an Auth API. All 60 Finance
  migrations, their exact history check, the rollback regression suite and the
  atomic signup adapter install finish before the Auth server/gateway stage.
- A second Compose project owns PowerSync and Mongo. Mongo has no published
  port, uses its own named data volume and private internal network, and is
  not attached to the backend network. Only PowerSync joins both new networks.

Nothing extends production/API Compose or changes shared defaults. All mounts
come from the private materialized directory. Provider configuration is absent,
only synthetic `@local.test` signup is accepted by the adapter, and demo seed
is neither copied nor executed. The complete functions tree and existing
per-function CLI verification settings are recorded/copied. The gateway exposes
**only** the four cookie-auth functions (`auth-login`, `auth-signup`,
`auth-refresh`, `auth-logout`), which already have `verify_jwt=false`; all other
function routes return 404 rather than bypassing their verification settings.

- The gateway owns the single allowed CORS origin (`http://localhost:4193`) and
  hides upstream origin headers. Otherwise PostgREST's wildcard combines with
  the gateway origin and browsers reject successful uploads before acknowledging them.
  REST uploads retain authenticated PostgREST/RLS authorization.

## Reviewed upstream contracts

[`pins.json`](./pins.json) pins seven public multiarchitecture image manifests,
the CLI version/source, release archive hashes and the PowerSync source.
Digests were resolved from public Docker Hub tag metadata on 2026-11-04;
runtime Compose references include those immutable digests, not mutable tags.
The human verifies the downloaded CLI archive against the recorded SHA256
before extracting it into this workspace's private `bin` directory.
The tool checks the executable's version; it does not download or install it.

- CLI `2.75.0`, source
  [`e07c7ea`](https://github.com/supabase/cli/tree/e07c7ea15b842e9bb45c79518a5f20cea84fc753):
  [`cmd/migration.go`](https://github.com/supabase/cli/blob/e07c7ea15b842e9bb45c79518a5f20cea84fc753/cmd/migration.go)
  supplies `migration up --db-url`;
  [`db_url.go`](https://github.com/supabase/cli/blob/e07c7ea15b842e9bb45c79518a5f20cea84fc753/internal/utils/flags/db_url.go)
  uses `pgconn.ParseConfig`, including `PGPASSWORD`.
  [`config.go`](https://github.com/supabase/cli/blob/e07c7ea15b842e9bb45c79518a5f20cea84fc753/pkg/config/config.go)
  bounds nested environment-file search to the CLI working directory.
  The tool supplies a new project config, runs from its private directory,
  refuses `.env*` files there/in `supabase`, and supplies no linked-project state.
- The CLI's
  [`image catalog`](https://github.com/supabase/cli/blob/e07c7ea15b842e9bb45c79518a5f20cea84fc753/pkg/config/templates/Dockerfile)
  and PostgreSQL-15 fallback select the reviewed GoTrue/PostgREST/Edge Runtime
  versions and PostgreSQL `15.8.1.085`.
  [`initAuthJob`](https://github.com/supabase/cli/blob/e07c7ea15b842e9bb45c79518a5f20cea84fc753/internal/db/start/start.go)
  establishes the separate `gotrue migrate` contract.
  The pinned [Auth Dockerfile](https://github.com/supabase/auth/blob/effd66245bd981ba5a07aa6b7441ad37578f9b73/Dockerfile)
  supplies the `gotrue` executable alias. The [Postgres Dockerfile](https://github.com/supabase/postgres/blob/b2c91b0a29332cec79473ee8a6dfa0e205cd0aaa/Dockerfile-15)
  requires `postgres -D /etc/postgresql`, whose config points at the named
  data volume. Its [initializer](https://github.com/supabase/postgres/blob/b2c91b0a29332cec79473ee8a6dfa0e205cd0aaa/migrations/db/migrate.sh)
  runs ordered `init-scripts/*.sql` before image migrations. Private role
  passwords are assigned there only to existing roles. Its SQL interpolation
  requires the documented URL-safe database-password alphabet.
  Auth's [JWT helper migrations](https://github.com/supabase/auth/blob/effd66245bd981ba5a07aa6b7441ad37578f9b73/migrations/20220224000811_update_auth_functions.up.sql)
  supply the actual `auth.uid()`/`auth.role()` interface; the profile does not
  replace it with the shared Compose stack's local helper shim.
- PowerSync `1.27.2`, source
  [`12fa59d`](https://github.com/powersync-ja/powersync-service/tree/12fa59d700ded33dc33770855bde90ffb60ebc8f):
  [`PowerSyncConfig.ts`](https://github.com/powersync-ja/powersync-service/blob/12fa59d700ded33dc33770855bde90ffb60ebc8f/packages/types/src/config/PowerSyncConfig.ts)
  supports the existing `sync_config`, Supabase JWT, Mongo storage, HTTP probes
  and telemetry-disable fields. Its
  [`Mongo configuration tests`](https://github.com/powersync-ja/powersync-service/blob/12fa59d700ded33dc33770855bde90ffb60ebc8f/libs/lib-mongodb/test/src/config.test.ts)
  cover replica-set URI parsing.
  Its [Mongo test action](https://github.com/powersync-ja/powersync-service/blob/12fa59d700ded33dc33770855bde90ffb60ebc8f/.github/actions/start-mongodb/action.yml)
  selects Mongo `8.0.20`; this separate profile pins that tested version rather
  than assuming the old shared stack's Mongo 7 is compatible. Initialization
  happens once, followed by a bounded read-only primary-readiness wait.
  The pinned running service must still parse
  the config/rules and establish replication in the human readiness stage.
- Docker Linux Engine **28+** is required because older engines have known
  localhost-publication isolation limitations. Compose **2.39+** supplies the
  reviewed `--wait`, `--wait-timeout`, `--pull never` and `--no-recreate`
  flags. Each one-shot's exact container exit is checked with `docker container wait`.
  No host daemon/firewall defaults change.
  Explicit per-port loopback bindings are backed by loopback defaults on the
  newly created networks; this is not reliance on an ambient default network.

Source/parser review is not an executed image-compatibility result. Exact
GoTrue/Postgres behavior and PowerSync/Mongo compatibility remain runtime
acceptance gates; any failure stops the run, without substitutions.

## Stage 0: private location and source preparation

Use the approved workspace checkout. The proposed example is
`.isolated-sync\4605-a`, project `finance-sync-proof-4605-a`.
Neither name is reserved or a claim that resources already exist.
The directory must be a **direct child** of `.isolated-sync`, private to the
current user, empty, and free of symlinks. No directory outside the workspace
is accepted. Never reuse a previous failed or completed run.

A human prepares the private directory permissions. On Windows, after approval:

```powershell
function New-PrivateDirectory([string]$Path) {
    New-Item -ItemType Directory -Path $Path -ErrorAction Stop | Out-Null
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($user)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        $user, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl
}
# Create each only if it does not exist. An existing parent needs ownership/ACL review.
New-PrivateDirectory (Join-Path (Get-Location) '.isolated-sync')
New-PrivateDirectory (Join-Path (Get-Location) '.isolated-sync\4605-a')
```

On POSIX, the corresponding owned directories must have mode `0700`. Windows
verification permits only the current user, SYSTEM and local Administrators;
other allow entries fail. Private files must not be symlinks.

Source-only preparation, which does not call Docker or handle credentials:

```powershell
$source = git rev-parse HEAD
$prepared = node tools\isolated-sync.mjs prepare `
    --directory .isolated-sync\4605-a `
    --project finance-sync-proof-4605-a --source $source | ConvertFrom-Json
$approval = $prepared.approval
$prepared | ConvertTo-Json -Depth 5
```

The approved source must be the full current HEAD SHA. `inventory.json` records
the exact workspace/location, both project names, all container/network/volume
names, endpoints, pins, ordered 60-version inventory, per-file SHA256 for
top-level up-migrations, the full functions tree, adapter/regression files,
original config/rules and tooling sources, and hashes of every generated file.
Git-object bytes are used without trimming/newline conversion. Missing, extra,
duplicate or future migration versions inconsistent with the adapter fail.
Each later invocation reconstructs and compares the profile from that same Git
revision, and verifies all materialized file hashes. Changing HEAD requires a
new preparation/review, not an inventory edit.
Preparation rejects a functions `deno.lock` format other than 4: the pinned
Edge Runtime cannot read format 5 emitted by newer Deno CLIs. Keep the compatible
lock format without removing or regenerating dependency hashes or redirects.
Windows permission checks keep their helper HOME/temp directories inside the
private `.isolated-sync` parent; lifecycle subprocesses use the run's own
private HOME/temp directories.
Git, Prettier and ESLint exclude `.isolated-sync` so repository-wide checks
neither process private inputs nor rewrite hash-inventoried runtime files.

## Human input and startup approval

The coordinator reviews `inventory.json` and the nonsecret approval hash.
Reserved ports are 4193 and 55430-55440. Startup refuses existing
project-prefixed resources (including stopped containers), occupied IPv4/IPv6
ports, unsupported engine/Compose versions, foreign mounts or attachments,
replacement resource IDs and altered source/config. It never stops a conflict.

After separate credential-handling approval, the human supplies
`private-input.json` **inside this private run directory**, using a private
editor/session, not shell arguments or pasted chat. It must contain exactly
these fields; this table contains no credential values:

| Field              | Required input                                                             |
| ------------------ | -------------------------------------------------------------------------- |
| `databasePassword` | Fresh isolated database password, 24-128 characters from `A-Z a-z 0-9 _ -` |
| `jwtSecret`        | Fresh isolated HS256 signing secret, at least 32 characters                |
| `anonKey`          | Matching signed HS256 `anon` key, expiry more than one hour away           |
| `serviceRoleKey`   | Matching signed HS256 `service_role` key, expiry more than one hour away   |

The tool does not generate keys, copy credentials, read repository environment
files or print private inputs. Keys are signature/role/expiry checked. All
database URIs are constructed for the exact newly owned DB container; no
endpoint/URI is accepted as input. CLI public URL is fixed to IPv4 loopback.
Only the process whitelist plus these private inputs is passed to children.
HOME, app-data, Docker config and temporary paths are confined to the run;
Docker uses only the local Unix socket/Windows named pipe, never an inherited
host/context/provider/registry configuration. Public image pulls use that new
empty Docker config.

Install the checksum-verified CLI in `.isolated-sync\bin\supabase.exe`
(or the equivalent workspace-local executable). No global installation or
unpinned `npx` fallback is used. **Do not run `supabase status`,
`docker compose config`, raw environment inspection or raw service logs.**
Container logging is disabled. Upstream command output is withheld on success
and failure; share only the classified stage/exit status and nonsecret inventory.

## Human-only ordered lifecycle

The following are exact commands, **not authorization to run them**. Each
invocation is a separate reviewed stage. Keep the approved checkout and
`$approval` from stage 0:

```powershell
$cli = Join-Path (Get-Location) '.isolated-sync\bin\supabase.exe'
node tools\isolated-sync.mjs database --directory .isolated-sync\4605-a --approve $approval --cli $cli
node tools\isolated-sync.mjs migrate --directory .isolated-sync\4605-a --approve $approval --cli $cli
node tools\isolated-sync.mjs adapter --directory .isolated-sync\4605-a --approve $approval --cli $cli
node tools\isolated-sync.mjs api --directory .isolated-sync\4605-a --approve $approval --cli $cli
node tools\isolated-sync.mjs sync --directory .isolated-sync\4605-a --approve $approval --cli $cli
node tools\isolated-sync.mjs readiness --directory .isolated-sync\4605-a --approve $approval --cli $cli
```

| Stage       | Exact responsibility                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database`  | Refuse all name/port collisions; create only labeled new networks and named volumes; pull pinned DB/Auth images; start only fresh Postgres and wait for its health check                                                                                                                                                                                                                                                                |
| `migrate`   | Run GoTrue schema migration only; assert no auth identities, Finance schema or CLI history; apply every reviewed up-migration via the pinned CLI with stop-on-error; compare exact ordered versions, names and nonempty recorded statements; retain the corresponding per-file application hashes and a SHA256 of the full recorded SQL history, rechecked before subsequent startup/readiness stages                                   |
| `adapter`   | Recheck history; run the exact transactional regression suite with its adapter include expanded to the identical source bytes; then `BEGIN`, explicit synthetic-local-only opt-in, exact adapter via local `postgres` with `psql -X -v ON_ERROR_STOP=1`, `COMMIT`; verify trigger/permissions; validate all 39 current rule-selected column queries with zero-row SQL, require RLS and create/verify the exact source-table publication |
| `api`       | Recheck history; start Auth/PostgREST/Edge Runtime on only the new backend network, then the explicit-loopback gateway; no Auth listener existed during adapter installation                                                                                                                                                                                                                                                            |
| `sync`      | Start only the new Mongo, wait for health, initiate its new replica set without an idempotent/adoption fallback, then start pinned PowerSync with the unchanged Finance rules and new DB destination                                                                                                                                                                                                                                    |
| `readiness` | Recheck history/resource ownership/mounts/network attachments/loopback bindings; require gateway Auth health, PowerSync liveness/readiness and an active PostgreSQL replication slot; report only stage/resource identifiers                                                                                                                                                                                                            |

Each mutating stage records an in-flight failure marker before mutation. An
error or interruption makes the run terminal for startup: no retries, healing,
reset, migration repair, partial-chain success or fallback stack. A concurrent
invocation refuses the exclusive stage lock. A stale lock requires human
inspection, not automatic deletion. Resources are identified by exact names,
inventory labels and stable IDs/creation timestamps. Cleanup can discover
partially created resources only when those same ownership checks pass.

SQL failures retain only a fixed operation identifier (for example
`adapter-regression`), SQLSTATE and numeric expanded-input line in `state.json`
as `sqlFailure`. The SQL runner requests SQLSTATE-only diagnostics and never
prints or saves raw SQL, upstream messages, context, rows or service logs.
Unrecognized/ambiguous diagnostics retain the operation with null code/line;
they never fall back to raw output. Use the line with the exact inventoried
input, including the expanded adapter include for the regression suite.
Include expansion preserves the adapter bytes literally, including PostgreSQL
dollar-quote delimiters and regex anchors; replacement-string escapes must not
be interpreted.
The metadata remains available after an approved stop. It does not authorize
a retry: investigate the stopped evidence and prepare a separately approved
fresh run after any source fix.

The schemas and bucket configuration have not been weakened for the proof.
The backend's public anon client key is supplied privately to the later web
scenario, never the service-role key. Neither provisioning nor these health
probes proves real GoTrue signup/role behavior, two-household JWT isolation,
web `hh_household` adoption without duplicate bootstrap, offline durability,
remote replication of actual mutations, native cutover or release acceptance.
The coordinator must run the separately approved
[web acceptance sequence](../../docs/guides/isolated-web-sync-setup-plan.md#stage-4-public-client-configuration-and-acceptance)
only after these stages succeed. Do not start it from this tooling.

### Credential-free API regression

Before provisioning another full run after API source changes, run the opt-in
real-image smoke test with Docker and the reviewed Edge/nginx images already
available locally:

```powershell
$env:FINANCE_ISOLATED_API_SMOKE = '1'
node --test tools\isolated-sync\api-runtime.test.mjs
```

This is a separately approved diagnostic, not permission to start services.
It creates only new `finance-sync-proof-api-check-*` containers, uses no
credentials, existing run resources, published ports or external network, and
mounts a copied tracked functions tree and the actual gateway config read-only.
Function files come from immutable HEAD Git objects, not a check-then-read of
workspace paths; commit function changes before running the smoke test.
It verifies real Edge liveness, nginx configuration, all four permitted workers
returning a fail-closed 503 without credentials, and forbidden routes returning 404.
A credential-free local upstream reproduces PostgREST's wildcard header; both
preflight and actual responses must carry exactly one reviewed CORS origin.
It stops/removes only its own containers and explicitly named fixture files.
Ordinary unit tests skip it unless explicitly enabled. Passing it does not prove
Auth/database connectivity, signup, or PowerSync replication.

## Separate human cleanup

Obtain separate stop/removal approval for the exact generated resource names.
This intentionally does not use Compose `down`, default Supabase stop/reset,
prune, wildcard deletion or shared stack commands.

```powershell
node tools\isolated-sync.mjs stop --directory .isolated-sync\4605-a --approve $approval
# Only after reviewing the stopped owned inventory and approving permanent synthetic volume loss:
node tools\isolated-sync.mjs remove --directory .isolated-sync\4605-a --approve $approval
```

`stop` first verifies the exact owned resource inventory, then stops only its
containers individually. `remove` requires the stopped state, verifies again,
then removes each named container, each named disposable volume and each named
network separately. Foreign/replaced resources or unexpected mounts/attachments
abort cleanup. Generated private files and browser-origin data remain for
explicit human retention/removal decisions; the tool never deletes a worktree
or private directory. No real service/credential provisioning or cleanup was
performed while developing these tools.

## Validation without provisioning

```powershell
node tools\isolated-sync.mjs --help
node --test tools\isolated-sync\profile.test.mjs tools\isolated-sync\database.test.mjs services\api\supabase\tests\isolated-signup-contract.test.mjs
npx eslint tools\isolated-sync.mjs tools\isolated-sync --max-warnings 0
```

Tests use synthetic in-workspace fixtures, real occupied IPv4/IPv6 listener
checks and mocked SQL/command contracts. They never start Docker, apply a real
migration, create credentials or claim service-runtime acceptance.
