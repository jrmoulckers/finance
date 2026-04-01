# Turborepo Remote Caching

This guide explains how to enable Turborepo remote caching to share build artifacts
across CI runs and developer machines, reducing build times by up to 80%.

## How It Works

Turborepo hashes all task inputs (source files, env vars, dependencies). When a task
with a matching hash has been built before, Turbo fetches the cached output instead of
rebuilding. Remote caching extends this to a shared server so CI jobs and teammates
benefit from each other's builds.

## Provider Options

### Option A — Vercel Remote Cache (recommended, free for open source)

1. Install the Turbo CLI: `npm i -g turbo`
2. Log in: `turbo login`
3. Link this repo: `turbo link` (run from the repo root)
4. Copy the token from `~/.turbo/config.json` — the `token` field.
5. In GitHub → Settings → Secrets → Actions, add:
   - `TURBO_TOKEN` — the token from step 4
   - `TURBO_TEAM` — your Vercel team slug (e.g. `my-org`)

### Option B — Self-Hosted Cache (Ducktape / remote-cache-server)

Use [`ducktape`](https://github.com/ducktors/turborepo-remote-cache) or any
compatible cache server. Set `TURBO_API` to your server URL in addition to
`TURBO_TOKEN` and `TURBO_TEAM`.

## CI Setup (already configured)

The following workflows pass `TURBO_TOKEN` / `TURBO_TEAM` as environment variables
so every `npm run build|test|lint` call (which internally invokes `turbo run`)
automatically participates in the remote cache:

- `.github/workflows/web-ci.yml`
- `.github/workflows/lint-format.yml`

If the secrets are not set, Turbo silently falls back to local-only caching — CI
will still succeed, just without the speedup.

## Local Developer Setup

```bash
# One-time setup per developer
turbo login      # authenticate with Vercel
turbo link       # link this repo to the team cache

# All npm run commands then share the remote cache automatically
npm run build
npm run test
```

## Cache Invalidation

The remote cache is automatically invalidated when inputs change (source files,
`package.json`, env vars declared in `turbo.json`). To manually clear the local
cache: `turbo daemon clean`.

## turbo.json Remote Cache Config

```json
"remoteCache": {
  "enabled": true,
  "signature": true   // cryptographically sign cache artifacts
}
```

`signature: true` ensures cached artifacts cannot be tampered with — important for
a financial application.
