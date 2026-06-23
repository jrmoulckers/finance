# Full-Stack Local Web E2E (Edge)

Run the **web app (`apps/web`) against a real local edge backend** — Supabase
auth (GoTrue + the `auth-*` edge functions) and Postgres/RLS — and exercise it
end-to-end, the way a developer would. This is the "seamless" local setup: one
setup command brings up the stack _and_ wires the web app to it.

For backend-only Supabase work (functions, migrations, Studio), see
[`local-supabase.md`](./local-supabase.md). This guide is the web-to-edge
end-to-end path on top of it.

## Quick start (one command)

On a machine with **Docker Desktop running** and dependencies installed
(`npm install`), a single command does everything — preflight checks, start the
Supabase edge stack, wire the web app to it, and launch the web app:

```bash
npm run dev:full
```

That runs [`tools/dev-full.mjs`](../../tools/dev-full.mjs), which:

1. runs the **preflight** ([`npm run doctor`](../../tools/doctor.mjs)) — Docker
   daemon, free disk, ports `54321`/`5173`, Supabase CLI;
2. starts Supabase (`supabase start`, retrying on Docker Hub rate-limit stalls;
   skipped if already running);
3. writes `apps/web/.env.local` from `supabase status` (takes the app out of
   demo mode);
4. launches the web app at <http://localhost:5173> and opens your browser.

Useful flags: `--reset` (reset DB first), `--e2e` (run the live e2e suite
instead of the dev server), `--no-open`, `--skip-doctor`. Run
`node tools/dev-full.mjs --help` for the full list.

> **VS Code one-click / F5** — Open the repo in VS Code and either run the
> **"Dev: Full Stack (web on edge)"** task (Ctrl+Shift+P → _Tasks: Run Task_) or
> press **F5** ("Web on edge (Microsoft Edge)"). Both wrap `npm run dev:full`
> and, for F5, attach the debugger to Edge at `:5173`.

> **Not sure the machine is ready?** Run `npm run doctor` first — it reports
> exactly what's missing (and how to fix it) without starting anything.

The rest of this guide explains what `dev:full` does step by step, for when you
want to run the pieces manually or troubleshoot.

## What "full-stack local (edge)" means here

The genuinely server-wired path in the web app today is **authentication**:

```
/signup or /login
  -> POST /api/auth/{signup,login}      (same-origin, via the Vite dev proxy)
  -> http://127.0.0.1:54321/functions/v1/auth-{signup,login}
  -> GoTrue + Postgres/RLS
  -> authenticated app shell
```

All financial **data CRUD stays local** in SQLite-WASM (OPFS, with an IndexedDB
fallback). Server-side data sync (PowerSync) is scaffolding only and is **out of
scope** for this guide — see [Known limitations](#known-limitations).

So "full e2e on web using edge" = sign up / log in through real edge auth, then
land in the authenticated app. That is exactly what the live smoke test asserts.

## Prerequisites

| Tool                                                              | Notes                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Must be running. Hosts the Supabase containers + edge runtime.     |
| [Node.js](https://nodejs.org/) 20+                                | Provides `npx`. A global Supabase CLI is **not** required.         |
| Microsoft Edge _(optional)_                                       | The live e2e defaults to the Edge browser; Chromium is a fallback. |

A global `supabase` CLI is optional — the setup script and the `supabase:*` npm
scripts fall back to `npx --yes supabase`, which downloads and caches the CLI on
first use.

> Run `npm run doctor` to confirm Docker, disk, and ports are ready before you
> start — it pinpoints anything missing without bringing the stack up.

## Manual setup (step by step)

The steps below are exactly what `npm run dev:full` automates. Run them by hand
when you want finer control or are troubleshooting.

### 1. Install dependencies

From the repo root:

```bash
npm install
```

### 2. Bring up the stack and wire the web app

> `npm run dev:full` does this step (and the next two) for you. The manual
> equivalent below is useful for backend-only work or troubleshooting.

This single command starts Supabase, applies all migrations + seed data, and
writes `apps/web/.env.local` pointing the web app at the local stack:

```bash
# Windows (PowerShell)
npm --prefix services/api run setup:windows

# macOS / Linux
npm --prefix services/api run setup
```

The generated `apps/web/.env.local` looks like:

```dotenv
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
VITE_FUNCTIONS_PROXY_TARGET=http://localhost:54321
```

> First run pulls the Supabase Docker images, which can take several minutes on a
> cold machine. Subsequent runs are fast.

Setting `VITE_SUPABASE_URL` to the local stack is what takes the app **out of
demo mode** — Vite auto-loads `.env.local`, so `npm run dev` and the live e2e
"just work" against the real edge backend.

### 3. Run the web app

```bash
npm run dev -w apps/web
```

Open <http://localhost:5173/signup>. You should **not** see a
"Demo Mode — No backend configured" banner. Create an account: signup posts
through the edge `auth-signup` function, auto-logs you in, and drops you into the
authenticated app.

Inspect the round-trip in Studio (<http://localhost:54323>) or check the mailbox
at Inbucket (<http://localhost:54324>).

### 4. Run the live e2e (edge)

A real-backend Playwright smoke test drives signup through edge auth and asserts
the app leaves the auth wall:

```bash
# Microsoft Edge channel (default — honours "test on edge")
npm run test:e2e:live -w apps/web

# Chromium fallback (no msedge installed)
npm run test:e2e:live:chromium -w apps/web
```

The live config (`apps/web/playwright.live.config.ts`) starts its own Vite server
on port **5174** (so it never collides with a dev server on 5173), runs the
single spec in `apps/web/e2e-live/`, and — unlike the default `./e2e` suite — does
**not** stub the database or mock auth. If `apps/web/.env.local` is missing, the
app stays in demo mode and the test fails fast with an explicit message.

## How it's wired

- **Demo-mode detection** — `apps/web/src/auth/demo-auth.ts` treats a missing
  `VITE_SUPABASE_URL` or one containing `placeholder` as demo mode (localStorage
  auth, zero backend). A real URL exits demo mode.
- **Vite dev proxy** — `apps/web/vite.config.ts` rewrites `/api/auth/<x>` to
  `${VITE_FUNCTIONS_PROXY_TARGET}/functions/v1/auth-<x>`. All auth calls are
  therefore **same-origin** through Vite, so the app's `connect-src 'self'` CSP
  needs no relaxation.
- **Env precedence** — Vite auto-loads `apps/web/.env.local` (highest-priority
  `.env` file). The setup script regenerates it; delete it to fall back to demo
  mode, or rerun setup to refresh it.

## Resetting and stopping

```bash
# Reset DB to a clean migrated + seeded state
npm --prefix services/api run supabase:reset

# Stop the stack
npm --prefix services/api run supabase:stop

# Re-print URLs and keys
npm --prefix services/api run supabase:status
```

## Troubleshooting

| Symptom                                   | Fix                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not sure the machine is ready             | Run `npm run doctor` — it checks Docker, free disk, and ports `54321`/`5173` and prints how to fix gaps.                                                                                |
| "Demo Mode" banner on `/signup`           | `apps/web/.env.local` is missing or `VITE_SUPABASE_URL` is unset/placeholder — rerun the setup command.                                                                                 |
| Live e2e fails: "App is in demo mode"     | Same cause — ensure the stack is up and `.env.local` exists, then rerun.                                                                                                                |
| `npm run test:e2e:live` can't launch Edge | Use `npm run test:e2e:live:chromium -w apps/web`, or install Microsoft Edge.                                                                                                            |
| Port 5173 or 5174 already in use          | Stop the other process, or set `LIVE_E2E_PORT` for the live suite.                                                                                                                      |
| `supabase start` is slow / stalls         | First-run image pulls can be slow; ensure Docker is running and retry. `docker login` raises Docker Hub pull limits. `npm run dev:full` retries automatically. See `local-supabase.md`. |
| Signup returns a non-2xx response         | Confirm the stack is healthy (`supabase:status`) and migrations applied (`supabase:reset`).                                                                                             |

## Known limitations

- **No functional data sync.** The web PowerSync client is types/status only (no
  `@powersync/*` SDK dependency, no `connect()`), and there are no `sync-push` /
  `sync-pull` edge functions. Data CRUD is local SQLite-WASM. Making server-side
  sync functional is tracked as follow-up work, not part of this setup.
- **Auth is the e2e surface.** The live smoke validates the real, wired edge path
  (signup/login → authenticated app), not cross-device data replication.
