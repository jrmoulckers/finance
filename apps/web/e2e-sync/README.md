# Real local offline/sync proof

This suite is separate from the mocked `e2e/` suite and the auth-only
`e2e-live/` smoke. It uses synthetic users, the production PWA/service worker,
real edge authentication, real PowerSync, and JWT-scoped PostgREST reads/writes.
No connected indicator, mock, or local-only CRUD result counts as replication.

## Prerequisites

A human must approve/provision an isolated local stack before execution:

- Supabase Auth, auth signup/login/refresh/logout edge functions, PostgREST, and
  the reviewed Finance schema/RLS/household provisioning migrations.
- PowerSync connected to that same Postgres instance with Finance sync rules
  and Supabase JWT verification. A healthy but unrelated PowerSync container
  is not sufficient.
- Email confirmations disabled for synthetic `@local.test` users.
- Locked Node dependencies and Playwright Chromium installed.
- An unused web port (default `4193`).

Do not reset, reconfigure, or stop existing containers to satisfy these
prerequisites. Do not use production, real bank accounts, paid providers, real
financial data, service-role credentials, or enable `live_bank_data`.

## Run

Inject the **public local anon key** through the approved environment; do not
copy credential files into this worktree. Only HTTP loopback service origins
are accepted. The test-specific Vite config disables automatic `.env` loading,
so developer/hosted backend and provider settings cannot leak into this run.

```powershell
$env:LOCAL_SYNC_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:LOCAL_SYNC_POWERSYNC_URL = 'http://127.0.0.1:8080'
# Set LOCAL_SYNC_ANON_KEY to the approved stack's public anon key.
$env:LIVE_SYNC_PORT = '4193'
cd apps\web
npx playwright test --config playwright.sync.config.ts
```

The runner builds and serves the production app. It allows service workers
(unlike the existing live-auth runner) so an offline **reload** tests cached
application assets and durable SQLite, not merely an already-open page.
Traces, screenshots, and videos are disabled to avoid retaining auth responses.
Fresh UUID-tagged synthetic users/records remain in the isolated local stack;
cleanup is a separate human-approved operation, not a destructive test fixture.

Missing configuration fails explicitly; it never silently skips the proof.
`npx playwright test --config playwright.sync.config.ts --list` only checks
discovery and is **not** evidence of successful sync.

## Assertions and limits

The scenario completes explicit Cloud Sync consent, real signup/sign-in,
account and transaction creation, online reload, offline creation and reload,
one successful upload after reconnect, exact server cardinality/integer cents,
identical IDs/amounts in a second isolated browser context, cross-household
read/update/insert denial, and logout/account switching without prior-user rows.
A second connectivity cycle checks that an acknowledged mutation is not sent
again. This is a bounded replay check, not a claim of transport-level
exactly-once delivery under arbitrary failures.

All assertions must pass before citing this as beta evidence. In particular,
account-switch isolation, consent enforcement, schema compatibility, and
PowerSync worker/WASM offline caching must not be inferred from unit mocks.
This suite does not prove live bank-provider ingestion or native sync.

Tracked by [#4460](https://github.com/jrmoulckers/finance/issues/4460), related to
the broader [#3935](https://github.com/jrmoulckers/finance/issues/3935) epic.
