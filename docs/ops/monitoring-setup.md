# Monitoring Setup

This document covers the full monitoring setup for the Finance monorepo: CI/CD health monitoring and Sentry error tracking across all platforms.

> **Related:** [CI Workflow](ci-workflow.md) | [Release Process](release-process.md) | [Deployment Runbook](deployment-runbook.md) | [Observability ADR](../architecture/0020-observability-architecture.md)

---

## Table of Contents

- [Sentry Error Monitoring](#sentry-error-monitoring)
  - [Overview](#overview)
  - [1. Create Sentry Projects](#1-create-sentry-projects)
  - [2. DSN Configuration](#2-dsn-configuration)
  - [3. Privacy & Data Scrubbing](#3-privacy--data-scrubbing)
  - [4. Environment Tagging](#4-environment-tagging)
  - [5. Source Map Upload (Web)](#5-source-map-upload-web)
  - [6. ProGuard Mapping Upload (Android)](#6-proguard-mapping-upload-android)
  - [7. dSYM Upload (iOS)](#7-dsym-upload-ios)
  - [8. Alert Rules](#8-alert-rules)
  - [9. GitHub Actions Secrets](#9-github-actions-secrets)
- [CI/CD Monitoring](#cicd-monitoring)

---

## Sentry Error Monitoring

### Overview

Finance uses [Sentry](https://sentry.io) for beta web error tracking. Native SDK wiring is intentionally deferred; each native entrypoint contains a TODO hook that points back to this document.

**Architecture summary:**

| Platform | SDK             | DSN Source        | Config File                       |
| -------- | --------------- | ----------------- | --------------------------------- |
| Web      | `@sentry/react` | `VITE_SENTRY_DSN` | `apps/web/src/lib/monitoring.ts`  |
| Android  | Planned         | `SENTRY_DSN`      | `FinanceApplication.kt` TODO hook |
| iOS      | Planned         | `SENTRY_DSN`      | Swift `@main` TODO hooks          |
| Windows  | Planned         | `SENTRY_DSN`      | `Main.kt` TODO hook               |

All platforms share the same privacy contract enforced by the `CrashReporter` interface in `packages/core/`.

### 1. Create Sentry Projects

Create **one Sentry project per platform** in your Sentry organization. Using separate projects ensures platform-specific alert rules, release tracking, and symbol upload isolation.

1. Go to [sentry.io](https://sentry.io) → **Settings** → **Projects** → **Create Project**
2. Create four projects:

   | Project Name      | Platform    | Team    |
   | ----------------- | ----------- | ------- |
   | `finance-web`     | React       | default |
   | `finance-android` | Android     | default |
   | `finance-ios`     | Apple (iOS) | default |
   | `finance-windows` | .NET/WinUI  | default |

3. For each project, go to **Settings** → **Client Keys (DSN)** and copy the DSN.

> **Staging vs. Production:** Create separate projects (e.g., `finance-web-staging`) or use Sentry's environment filtering. Separate projects are recommended to avoid staging noise in production dashboards.

### 2. DSN Configuration

DSNs are **never hardcoded** in source. Each platform reads the DSN from environment variables.

#### Self-hosted deployment (`deploy/`)

Add DSNs to your `.env` file (see `deploy/.env.example`):

```env
SENTRY_DSN_WEB=https://examplePublicKey@o0.ingest.sentry.io/0
SENTRY_DSN_ANDROID=https://examplePublicKey@o0.ingest.sentry.io/1
SENTRY_DSN_IOS=https://examplePublicKey@o0.ingest.sentry.io/2
SENTRY_DSN_WINDOWS=https://examplePublicKey@o0.ingest.sentry.io/3
SENTRY_ORG=your-org-slug
SENTRY_AUTH_TOKEN=sntrys_your_token_here
SENTRY_ENVIRONMENT=production
```

#### Web (`apps/web/`)

The web app reads `VITE_SENTRY_DSN`, `VITE_ENVIRONMENT`, and `VITE_APP_VERSION` via Vite's env system:

```env
# apps/web/.env.local (not committed)
VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
VITE_ENVIRONMENT=development
VITE_APP_VERSION=local
```

#### Android (`apps/android/`)

The Android app reads the DSN from `BuildConfig`, injected via Gradle:

```properties
# local.properties (not committed)
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/1
```

In CI, set `SENTRY_DSN` as a GitHub Actions secret.

#### iOS (`apps/ios/`)

When the Sentry iOS SDK is integrated:

- Set `SENTRY_DSN` as an environment variable in the Xcode scheme (debug/release)
- In CI (Fastlane), pass via `SENTRY_DSN` environment variable
- Never add DSNs to `Info.plist` in source control

#### Windows (`apps/windows/`)

When the Sentry .NET SDK is integrated:

- Read `SENTRY_DSN` from environment variables at startup
- In CI, pass via GitHub Actions secrets

### 3. Privacy & Data Scrubbing

**All platforms enforce these rules** (via the `CrashReporter` interface and platform-specific `beforeSend` hooks):

| Rule                    | Implementation                                         |
| ----------------------- | ------------------------------------------------------ |
| `sendDefaultPii: false` | Configured in SDK init on all platforms                |
| No financial data       | `beforeSend` strips amounts, balances, account numbers |
| No auth material        | Tokens, API keys, session IDs are redacted             |
| No PII                  | Email, name, display name are never sent               |
| Consent-gated           | Reporting is no-op until user opts in                  |
| Pseudonymous IDs only   | User identification uses rotatable UUIDs               |

#### Scrubbed key categories

The following keys are stripped from all error context and breadcrumb data:

- **PII keys:** `email`, `name`, `displayName`, `userName`, `payee`, `note`, `memo`, `description`
- **Auth keys:** `token`, `accessToken`, `refreshToken`, `password`, `secret`, `apiKey`, `authorization`, `cookie`
- **Financial keys:** `amount`, `balance`, `currentBalance`, `targetAmount`, `budgetAmount`, `total`, `price`, `accountNumber`, `routingNumber`

#### Pattern-based scrubbing

- Currency patterns (`$1,234.56`, `€100.00`, `£50`) → `[REDACTED_AMOUNT]`
- Digit sequences (4+ digits, potential account numbers) → `[REDACTED_NUMBER]`

#### Sentry server-side settings

In addition to client-side scrubbing, enable these in each Sentry project under **Settings** → **Security & Privacy**:

1. ✅ **Data Scrubber** — enabled
2. ✅ **Scrub IP Addresses** — enabled
3. ✅ **Sensitive Fields** — add: `amount`, `balance`, `accountNumber`, `routingNumber`, `payee`
4. ❌ **Store Default PII** — disabled (must remain off)

### 4. Environment Tagging

Events are tagged with the deployment environment so you can filter dashboards and alerts:

| Environment   | When used                              | Sentry behavior            |
| ------------- | -------------------------------------- | -------------------------- |
| `production`  | Live user builds                       | Full alerting, full volume |
| `staging`     | Pre-release verification (staging VPS) | Reduced alerts             |
| `development` | Local dev builds                       | No events sent             |

**Debug builds should NOT send events to Sentry.** The SDK should only initialize when:

1. The DSN is non-empty, AND
2. The user has granted monitoring consent

The web implementation no-ops when `VITE_SENTRY_DSN` is missing and logs one informational message. Deployments set `VITE_ENVIRONMENT` to `staging` or `production`; local development should leave the DSN empty unless explicitly testing Sentry.

### 5. Source Map Upload (Web)

To get readable stack traces for production web errors, upload source maps to Sentry during the build:

#### Option A: Vite plugin (recommended)

```bash
npm install --save-dev @sentry/vite-plugin
```

```ts
// vite.config.ts — add to plugins array
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  build: {
    sourcemap: 'hidden', // Generate maps but don't serve them publicly
  },
  plugins: [
    react(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: 'finance-web',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

#### Option B: CLI upload in CI

```yaml
# In web-ci.yml or release.yml
- name: Upload source maps to Sentry
  run: |
    npx @sentry/cli releases files ${{ github.sha }} upload-sourcemaps ./apps/web/dist
  env:
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT: finance-web
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

> **Note:** The current `vite.config.ts` has `sourcemap: false` for security. Change to `sourcemap: 'hidden'` when enabling Sentry source map uploads — this generates maps for upload without serving them publicly.

### 6. ProGuard Mapping Upload (Android)

For readable Android crash stack traces with ProGuard/R8 obfuscation:

1. Add the Sentry Gradle plugin to `apps/android/build.gradle.kts`:

   ```kotlin
   plugins {
       id("io.sentry.android.gradle") version "<latest>"
   }

   sentry {
       org.set(System.getenv("SENTRY_ORG"))
       projectName.set("finance-android")
       authToken.set(System.getenv("SENTRY_AUTH_TOKEN"))
       autoUploadProguardMapping.set(true)
   }
   ```

2. In CI, set `SENTRY_ORG` and `SENTRY_AUTH_TOKEN` as GitHub Actions secrets.

### 7. dSYM Upload (iOS)

For readable iOS crash stack traces:

#### Option A: Fastlane plugin (recommended)

```ruby
# apps/ios/fastlane/Fastfile
lane :upload_dsyms do
  sentry_upload_dsym(
    org_slug: ENV['SENTRY_ORG'],
    project_slug: 'finance-ios',
    auth_token: ENV['SENTRY_AUTH_TOKEN'],
    dsym_path: './build/Finance.app.dSYM.zip'
  )
end
```

Install the plugin: `fastlane add_plugin sentry`

#### Option B: Sentry CLI

```bash
sentry-cli debug-files upload --org $SENTRY_ORG --project finance-ios ./build/Finance.app.dSYM.zip
```

### 8. Alert Rules

Configure these alert rules in each Sentry project under **Alerts** → **Create Alert Rule**:

#### Recommended alert rules

| Alert                    | Condition                             | Action             |
| ------------------------ | ------------------------------------- | ------------------ |
| New issue spike          | When a new issue is seen 10+ times/hr | Notify via email   |
| High error rate          | Error count > 50 in 1 hour            | Notify via Slack   |
| Regression               | A resolved issue reoccurs             | Notify via email   |
| Unhandled crash (mobile) | Unhandled exception detected          | Notify immediately |
| Performance degradation  | P95 transaction duration > 3s         | Notify via Slack   |

#### Environment-specific alerting

- **Production:** All alerts active, immediate notification
- **Staging:** Only "new issue spike" and "unhandled crash" active
- **Development:** No alerts (events should not reach Sentry)

### 9. GitHub Actions Secrets

Set the web DSN as an **environment-scoped** GitHub secret so staging and production can point at separate Sentry projects:

1. Go to **Settings** → **Environments** → `staging` → **Environment secrets**.
2. Add `SENTRY_DSN` with the staging `finance-web` project DSN.
3. Repeat for **Environments** → `production` with the production Sentry project DSN.
4. Keep `SENTRY_DSN` unset for local builds unless intentionally testing Sentry.

Optional source-map upload later requires repository-level `SENTRY_ORG` and `SENTRY_AUTH_TOKEN` (scopes: `project:releases`, `org:ci`). Source maps remain out of scope for #2033.

### 10. Beta crash-free rate

View beta crash-free rate in Sentry at:

- `https://sentry.io/organizations/<org-slug>/projects/finance-web/?environment=staging`

Replace `<org-slug>` with the Finance Sentry organization slug. Filter to `environment:staging` and the release matching `VITE_APP_VERSION` (the staging deploy short SHA).

### 11. Native Sentry TODO hooks

Native SDK dependencies are intentionally deferred for a follow-up PR. Hook points are marked in source with TODO comments:

- Android: `apps/android/src/main/kotlin/com/finance/android/FinanceApplication.kt` — `// TODO(#2033): Wire Sentry SDK for Android`
- iOS app / clip / watch / widgets: Swift `@main` entrypoints under `apps/ios/` — `// TODO(#2033): Wire Sentry SDK for <platform>`
- Windows: `apps/windows/src/main/kotlin/com/finance/desktop/Main.kt` — `// TODO(#2033): Wire Sentry SDK for Windows`

When implementing native SDKs, preserve the same DSN gating, consent gating, `sendDefaultPii=false`, and recursive scrubber semantics used by `apps/web/src/lib/monitoring.ts`.

---

## CI/CD Monitoring

CI health is monitored through three complementary mechanisms:

1. **GitHub Actions workflows** — `ci-health.yml` and `build-perf.yml` run on schedule
2. **Local tooling** — `tools/ci-health-dashboard.js` for on-demand checks
3. **GitHub Security tab** — CodeQL and dependency scanning results

### Beta uptime checks

The beta uptime monitor lives at `.github/workflows/uptime-check.yml` and runs every 15 minutes (`*/15 * * * *`). It curls the public Caddy health route:

- Default URL: `https://finance.jrmoulckers.com/health`
- Override: set repository or environment secret `DEPLOY_HOST` to a host or full URL when beta moves

On timeout, connection failure, or HTTP 5xx, the workflow opens a GitHub issue labeled `uptime` and `beta`. If an open `uptime` + `beta` issue already exists, the workflow adds a new failure comment instead of creating duplicates.

### Monitored Workflows

| Workflow               | Schedule             | What it monitors                                 |
| ---------------------- | -------------------- | ------------------------------------------------ |
| `ci-health.yml`        | Weekly (Mon 7AM UTC) | Success rates, flaky tests, trend analysis       |
| `build-perf.yml`       | Weekly (Tue 6AM UTC) | Build times, cache hit rates, P50/P90/P99        |
| `dependency-audit.yml` | Weekly (Wed 5AM UTC) | npm + Gradle vulnerabilities, license compliance |
| `security.yml`         | Weekly (Mon 6AM UTC) | CodeQL SAST, secret detection                    |
| `stale-detection.yml`  | On schedule          | Stale issues and PRs                             |

### Alerting Rules

#### CI Pipeline Health

| Condition                     | Severity     | Action                                             |
| ----------------------------- | ------------ | -------------------------------------------------- |
| Success rate < 80%            | **Critical** | Auto-creates GitHub issue, investigate immediately |
| Success rate 80-95%           | **Warning**  | Review in weekly triage                            |
| P90 build time > 15min        | **Warning**  | Investigate caching, consider splitting jobs       |
| Build time trend > +15%       | **Warning**  | Review recent dependency/config changes            |
| Flaky test detected (re-runs) | **Medium**   | Add to flaky test tracking issue                   |

#### Dependency Security

| Condition                         | Severity     | Action                        |
| --------------------------------- | ------------ | ----------------------------- |
| Critical CVE in production dep    | **Critical** | Block merges, create fix PR   |
| High CVE in production dep        | **High**     | Fix within current sprint     |
| Moderate CVE                      | **Medium**   | Fix in next sprint            |
| GPL-3.0/AGPL-3.0 license detected | **High**     | Remove dependency immediately |

#### Build Performance

| Metric           | Budget      | Action on violation                    |
| ---------------- | ----------- | -------------------------------------- |
| Web bundle size  | Track trend | Alert if > 20% increase week-over-week |
| Android APK size | Track trend | Alert if > 10% increase                |
| KMP build time   | Track trend | Investigate if P90 > 15min             |
| npm install time | Track trend | Review dependency count                |

### Local Dashboard

Run the CI health dashboard locally:

```bash
# Quick status check
node tools/ci-health-dashboard.js

# Extended analysis
node tools/ci-health-dashboard.js --days 14

# Alerts only
node tools/ci-health-dashboard.js --alerts-only

# JSON output for scripting
node tools/ci-health-dashboard.js --json
```

### Fleet Monitoring

For fleet (parallel agent) operations:

```bash
# Monitor all open fleet PRs
node tools/fleet-status.js

# Watch mode (polls every 60s)
node tools/fleet-status.js --watch

# Check for stale worktrees
node tools/worktree-cleanup.js
```

### Incident Response

#### CI Pipeline Failure

1. **Identify**: Check `gh run list --workflow=<name> --status=failure`
2. **Diagnose**: `gh run view <id> --log-failed`
3. **Triage**: Is it flaky (re-run passes)? Is it a real failure?
4. **Fix**: Create a fix branch, push, verify CI passes
5. **Prevent**: Add regression test, update monitoring thresholds

#### Build Performance Degradation

1. **Identify**: `node tools/build-analysis.js --recommend`
2. **Diagnose**: Check Turbo cache hits, Gradle cache effectiveness
3. **Root cause**: New dependency? Config change? Source growth?
4. **Fix**: Optimize build config, split jobs, improve caching
5. **Verify**: Run `node tools/performance-benchmark.js --compare`

#### Dependency Vulnerability

1. **Identify**: `node tools/dependency-audit.js`
2. **Assess**: Check CVE severity and exploitability
3. **Fix**: `npm audit fix` or update `gradle/libs.versions.toml`
4. **Verify**: Re-run audit, check no regressions
5. **Document**: Note in PR description which CVEs are resolved

### Dashboard Metrics Reference

| Metric          | Source                 | Healthy         | Warning         | Critical      |
| --------------- | ---------------------- | --------------- | --------------- | ------------- |
| CI success rate | `ci-health.yml`        | >= 95%          | 80-95%          | < 80%         |
| Avg build time  | `build-perf.yml`       | < 10min         | 10-15min        | > 15min       |
| Flaky test rate | `ci-health.yml`        | 0 re-runs       | 1-3 re-runs     | > 3 re-runs   |
| npm audit       | `dependency-audit.yml` | 0 high/critical | moderate issues | high/critical |
| CodeQL findings | `security.yml`         | 0 findings      | low severity    | high severity |

### Configuration

#### Environment Variables

| Variable       | Purpose                 | Where                    |
| -------------- | ----------------------- | ------------------------ |
| `TURBO_TOKEN`  | Turbo remote cache auth | GitHub Actions secret    |
| `TURBO_TEAM`   | Turbo team identifier   | GitHub Actions secret    |
| `GITHUB_TOKEN` | GitHub API access       | Auto-provided in Actions |

#### Scheduled Workflow Cadence

All scheduled workflows run during low-activity hours (UTC mornings) to avoid impacting developer CI queues:

- **Monday 6AM**: Security scanning
- **Monday 7AM**: CI health report
- **Tuesday 6AM**: Build performance report
- **Wednesday 5AM**: Dependency audit
