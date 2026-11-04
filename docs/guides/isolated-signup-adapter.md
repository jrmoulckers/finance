# Local-only isolated signup adapter

Implements the database prerequisite of [#4603](https://github.com/jrmoulckers/finance/issues/4603)
and [stage 2 of the isolated stack plan](./isolated-web-sync-setup-plan.md#stage-2-database-auth-and-household-prerequisites-human-only).
This is **not** a production migration, startup command, credential generator, or
proof that a running isolated stack or remote replication works.

## Database contract

[`isolated-signup-adapter.sql`](../../services/api/supabase/local-only/isolated-signup-adapter.sql)
installs an `AFTER INSERT` trigger on `auth.users`. The existing
`public.handle_new_user_signup(uuid,text,text)` RPC is unchanged. The trigger
passes only the server-generated auth ID, the synthetic email, and a null name.
Client metadata cannot choose household, privileges, or ownership.

Only exact `@local.test` addresses with a nonempty, whitespace-free local part
are accepted. A successful auth insert must synchronously create an active
`public.users` profile, exactly one active lowercase `owner` membership, and
its active household with `created_by = auth.users.id`. Any RPC error or failed
postcondition aborts the entire auth transaction, including partial profile
writes. No exception is suppressed. GoTrue must not return a successful signup
session after a database failure; the materializer's real signup check must
verify that API-level behavior.

Repeated service-role RPC delivery reuses an existing active membership.
Soft-deleted memberships remain excluded, exactly as in the existing RPC.
The adapter is not a lifetime single-household constraint: explicit subsequent
household creation or invitations retain their existing semantics.
No RLS, financial owner FKs, or token hooks change.
The installer explicitly revokes provisioning RPC execution from `PUBLIC`,
`anon`, and `authenticated` **only in this disposable database**, preserving
the intended service-only contract even when Supabase default privileges grant
`authenticated` separately from `PUBLIC`. It never grants client access.
The trigger function cannot be called by anon, authenticated, or service_role.

## Materializer consumption contract

DevOps must provide the orchestration in a separate reviewed change. Do not
execute this contract against a shared, hosted, staging, or production database.

1. Record the approved source commit (`git rev-parse HEAD`) and SHA-256 of every
   top-level up-migration, this adapter, and its regression suite. Use sources
   from that one revision, never another worktree. Record ordered filenames and
   hashes in the materializer's nonsecret inventory. No credential/config file
   content belongs in that inventory.
2. Verify destination ownership, private network, loopback-only host bindings,
   unique project/volume names, and a fresh disposable database. Do not infer
   locality from the database name or from this SQL opt-in. SQL cannot prove
   which Docker project or endpoint the administrator connected to.
3. Before allowing Auth traffic, apply **all** top-level migrations in sorted
   order with stop-on-error. Do not apply `down/`, skip failures, or run demo seed.
   Verify CLI `supabase_migrations.schema_migrations` against the exact ordered
   inventory and hashes. The adapter independently requires all 59 reviewed
   version IDs (through `20260908000002`) with no missing or extra version;
   future migration additions require review and an adapter inventory update.
   Version rows alone do not prove source contents; the materializer owns hash
   and actual ordered-application evidence.
4. In one transaction as the local `postgres` administrator (not necessarily a
   superuser), issue
   `SET LOCAL finance.isolated_signup_adapter = 'synthetic-local-only'`, then
   execute the adapter with `psql`'s `ON_ERROR_STOP=1`, and commit only on success.
   This explicit opt-in is an accidental-use guard, **not an authorization or
   destination-isolation boundary**. An explicit transaction is mandatory:
   `LOCK TABLE` refuses autocommit installation and blocks concurrent auth
   inserts while prerequisites are rechecked and the trigger is installed.
   The SQL file has no `BEGIN`/`COMMIT` so tests can roll it back.
   Missing history/schema/RPC or service-role execution, an existing auth identity,
   existing auth INSERT trigger, or existing same-named function fail rather
   than being replaced or repaired. Public demo rows are not an installer
   prerequisite check; prohibiting demo seed remains the materializer's job.
5. Run the transactional regression suite on the disposable database before
   permanent installation, or use the existing disposable CI evidence at that
   exact source revision. The suite installs the real adapter and rolls back
   its DDL and all fixtures. It requires no existing auth users or INSERT hooks.
   Running it after permanent installation intentionally fails.
6. After installation, verify the trigger is enabled and calls the reviewed
   function, and confirm service-only RPC execution and unchanged RLS. Then allow
   real GoTrue signup through the isolated gateway for two newly generated
   synthetic identities. Privately verify each authenticated subject has its
   own active profile/owned household/membership **before financial uploads**,
   and cannot read or upload into the other household. Report only boolean
   verdicts/counts, revisions, and classified failures; never credentials or
   financial rows. A SQL fixture insert is not real GoTrue/API acceptance.

There is no automatic production migration or uninstall hook. On installer
failure roll back its transaction and stop; never continue with partial DDL.
After a committed install, retire only the approved disposable stack through
the future materializer's reviewed human cleanup procedure. Do not run
destructive down operations or repurpose an existing database.

## Regression evidence and remaining gates

From `services/api`, against only the approved disposable database using
privately supplied local libpq connection parameters:

```powershell
npm run test:isolated-signup
```

The existing `test:billing-entitlements` CI command also runs this suite after
the billing transaction rolls back, using the existing disposable PostgreSQL
job without runner, secret, or service changes. Its legacy demo public profiles
are not auth identities; all assertions use fresh synthetic auth subjects.
The suite tests real auth INSERT behavior, RPC idempotency, active versus
deleted membership, metadata rejection, missing prerequisites, exact migration
inventory, atomic failure, execute grants, and household/profile RLS isolation.
Auth fixture inserts use the CI `postgres` administrator; it cannot impersonate
`supabase_auth_admin`. No role membership is granted to work around that
restriction. Actual GoTrue-role execution remains part of the real signup
acceptance gate, not a claim made by this fixture suite.

The database-independent contract check is:

```powershell
node --test services\api\supabase\tests\isolated-signup-contract.test.mjs
```

Synchronous provisioning removes the server-signup/webhook ordering race:
the server household commits before the signup response. It does not populate
the client's separate `hh_household` document store or prove that the web app
adopts the replicated household before creating another one.
`useHousehold.createHousehold`, `ensureDefaultHousehold`, and
`ensureSyncedHouseholdMembership` can intentionally create client-chosen
households. **Web-owner acceptance must verify adoption/ordering before claiming
no duplicate bootstrap household**, without weakening RLS or mapping arbitrary
client household IDs on the server. No client/KMP change is included here.

Remaining gates: reviewed isolated materializer; approved human provisioning;
real signup/gateway and web household adoption checks; production-PWA remote
replication acceptance; native cutover; release acceptance. None is implied by
this adapter or its SQL regression results.
