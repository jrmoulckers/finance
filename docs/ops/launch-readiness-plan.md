# Launch & Post-Launch Monitoring Plan

**Status:** Active
**Date:** 2026-06-15
**Related:** [Monitoring Architecture](../architecture/monitoring.md) · [Alerting Rules](../architecture/alerting-rules.md) · [Incident Response Runbook](../architecture/incident-response-runbook.md) · [Performance Baselines](../architecture/performance-baselines.md) · [CI/CD Strategy](../architecture/0006-cicd-strategy.md) · [Hosting Strategy](../architecture/0007-hosting-strategy.md)
**Ticket:** #88

---

## Table of Contents

- [1. Pre-Launch Verification Checklist](#1-pre-launch-verification-checklist)
  - [1.1 Infrastructure & Backend](#11-infrastructure--backend)
  - [1.2 Security & Privacy](#12-security--privacy)
  - [1.3 Platform: Android](#13-platform-android)
  - [1.4 Platform: iOS](#14-platform-ios)
  - [1.5 Platform: Web (PWA)](#15-platform-web-pwa)
  - [1.6 Platform: Windows](#16-platform-windows)
  - [1.7 Cross-Platform Functional Verification](#17-cross-platform-functional-verification)
  - [1.8 Data & Sync Verification](#18-data--sync-verification)
  - [1.9 Observability Readiness](#19-observability-readiness)
- [2. Monitoring Dashboard Specifications](#2-monitoring-dashboard-specifications)
  - [2.1 Dashboard: Service Health (Operational)](#21-dashboard-service-health-operational)
  - [2.2 Dashboard: Sync Health](#22-dashboard-sync-health)
  - [2.3 Dashboard: Client Health](#23-dashboard-client-health)
  - [2.4 Dashboard: Launch Day War Room](#24-dashboard-launch-day-war-room)
  - [2.5 Alert Thresholds Summary](#25-alert-thresholds-summary)
- [3. Incident Response Procedures](#3-incident-response-procedures)
  - [3.1 Launch-Day Escalation Matrix](#31-launch-day-escalation-matrix)
  - [3.2 Launch-Specific Playbooks](#32-launch-specific-playbooks)
  - [3.3 Rollback Procedures by Platform](#33-rollback-procedures-by-platform)
  - [3.4 Communication Templates](#34-communication-templates)
- [4. Launch Communication Plan](#4-launch-communication-plan)
  - [4.1 Internal Communication Timeline](#41-internal-communication-timeline)
  - [4.2 External Communication Timeline](#42-external-communication-timeline)
  - [4.3 Status Page Setup](#43-status-page-setup)
- [5. Post-Launch Metrics Tracking Framework](#5-post-launch-metrics-tracking-framework)
  - [5.1 Success Metrics & KPIs](#51-success-metrics--kpis)
  - [5.2 Stability Gate Criteria](#52-stability-gate-criteria)
  - [5.3 Post-Launch Review Cadence](#53-post-launch-review-cadence)
  - [5.4 Metric Collection Architecture](#54-metric-collection-architecture)
- [6. Launch Day Schedule](#6-launch-day-schedule)

---

## 1. Pre-Launch Verification Checklist

Every item must be verified and signed off before the launch go/no-go decision. Items are categorized by domain. A single unchecked P0 item is a launch blocker.

### 1.1 Infrastructure & Backend

All infrastructure runs self-hosted on a VPS via Docker Compose (see [ADR-0007](../architecture/0007-hosting-strategy.md)).

| #    | Check                                                                                                                                                                           | Priority | Verified |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| I-1  | VPS provisioned and hardened (firewall rules, SSH key-only, unattended-upgrades enabled)                                                                                        | P0       | ☐        |
| I-2  | Docker Compose stack (`deploy/docker-compose.yml`) runs cleanly: PostgreSQL 15, PostgREST, GoTrue Auth, Edge Functions, Caddy                                                   | P0       | ☐        |
| I-3  | Caddy TLS termination active with valid Let's Encrypt certificates for production domain                                                                                        | P0       | ☐        |
| I-4  | DNS records configured and propagated (A/AAAA → VPS IP, CNAME for subdomains)                                                                                                   | P0       | ☐        |
| I-5  | PostgreSQL health check passing (`pg_isready`) with resource limits applied (512 MB memory, 1 CPU)                                                                              | P0       | ☐        |
| I-6  | All database migrations applied in order (`20260306000001` through `20260316000001`)                                                                                            | P0       | ☐        |
| I-7  | RLS policies verified on every table — no table has RLS disabled                                                                                                                | P0       | ☐        |
| I-8  | PowerSync instance deployed, connected to PostgreSQL, sync rules (`sync-rules.yaml`) applied                                                                                    | P0       | ☐        |
| I-9  | PowerSync sync rules match RLS policies (bucket `by_household` + `user_profile` scoping verified)                                                                               | P0       | ☐        |
| I-10 | Edge Functions deployed and responding: `health-check` (200), `auth-webhook`, `passkey-register`, `passkey-authenticate`, `household-invite`, `data-export`, `account-deletion` | P0       | ☐        |
| I-11 | `health-check` endpoint returns `{"status":"healthy"}` with HTTP 200                                                                                                            | P0       | ☐        |
| I-12 | Automated daily `pg_dump` backup cron configured with off-site encrypted storage (7 daily + 4 weekly + 3 monthly retention)                                                     | P0       | ☐        |
| I-13 | Backup restoration tested — full restore from latest backup to a clean database confirmed                                                                                       | P0       | ☐        |
| I-14 | Environment variables loaded from `.env` (not committed) — all values from `.env.example` populated                                                                             | P0       | ☐        |
| I-15 | Connection pool capacity verified: PostgreSQL `max_connections` adequate for PostgREST + GoTrue + PowerSync + Edge Functions                                                    | P1       | ☐        |
| I-16 | Resource limits in Docker Compose verified under simulated load (2 vCPU / 4 GB RAM instance)                                                                                    | P1       | ☐        |
| I-17 | WAL (Write-Ahead Logging) level set to `logical` for PowerSync replication                                                                                                      | P0       | ☐        |

### 1.2 Security & Privacy

Per [ADR-0004](../architecture/0004-auth-security-architecture.md) and privacy audits.

| #    | Check                                                                                                                     | Priority | Verified |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| S-1  | JWT secret is strong (≥ 256-bit), unique to production, not reused from staging                                           | P0       | ☐        |
| S-2  | `SERVICE_ROLE_KEY` is set and never exposed to clients                                                                    | P0       | ☐        |
| S-3  | All Edge Functions validate JWT before processing authenticated requests                                                  | P0       | ☐        |
| S-4  | CORS `ALLOWED_ORIGINS` restricts to production domains only                                                               | P0       | ☐        |
| S-5  | WebAuthn relying party ID (`WEBAUTHN_RP_ID`) matches production domain                                                    | P0       | ☐        |
| S-6  | Passkey registration and authentication flows verified end-to-end on all platforms                                        | P0       | ☐        |
| S-7  | OAuth providers (Apple, Google) configured with production credentials and redirect URIs                                  | P0       | ☐        |
| S-8  | Rate limiting active on GoTrue: email sends (`AUTH_RATE_LIMIT_EMAIL`), token refresh (`AUTH_RATE_LIMIT_REFRESH`)          | P0       | ☐        |
| S-9  | SQLCipher encryption verified on all native platforms (Android, iOS, Windows) — database files unreadable without key     | P0       | ☐        |
| S-10 | DPAPI (Windows), Keychain (iOS), Keystore (Android) token storage verified                                                | P0       | ☐        |
| S-11 | No secrets committed to source control — `git log` scan clean                                                             | P0       | ☐        |
| S-12 | Sentry `beforeSend` scrubbers tested: financial data patterns, PII keys, auth tokens all stripped                         | P0       | ☐        |
| S-13 | Crash reporting and analytics gated on explicit user consent (`consentProvider()` → false by default)                     | P0       | ☐        |
| S-14 | GDPR data export (`data-export` function) and account deletion (`account-deletion` function with crypto-shredding) tested | P1       | ☐        |
| S-15 | Privacy policy and terms of service published at production URLs                                                          | P0       | ☐        |
| S-16 | Custom access token hook (`auth.custom_access_token_hook`) injects `household_ids` correctly into JWT claims              | P0       | ☐        |

### 1.3 Platform: Android

| #    | Check                                                                                            | Priority | Verified |
| ---- | ------------------------------------------------------------------------------------------------ | -------- | -------- |
| A-1  | Release build signed with production keystore (not debug)                                        | P0       | ☐        |
| A-2  | ProGuard/R8 mapping files generated and uploaded to Sentry                                       | P0       | ☐        |
| A-3  | Cold start time < 2.0s on mid-range device (Pixel 6a class)                                      | P0       | ☐        |
| A-4  | Warm start time < 500ms                                                                          | P1       | ☐        |
| A-5  | Transaction list scrolls at 60 fps (no janky frames > 16.7ms in system trace)                    | P1       | ☐        |
| A-6  | `SentryCrashReporter` (or `TimberCrashReporter` fallback) wired and tested with a forced crash   | P0       | ☐        |
| A-7  | Deep links / app links configured and verified for auth callbacks                                | P0       | ☐        |
| A-8  | Google Play Store listing prepared: screenshots, description, content rating, privacy policy URL | P0       | ☐        |
| A-9  | Staged rollout configured (start at 10%)                                                         | P0       | ☐        |
| A-10 | Offline mode verified: app functions without network, syncs on reconnect                         | P0       | ☐        |
| A-11 | SQLCipher database opens correctly after app update (migration path tested)                      | P0       | ☐        |
| A-12 | Minimum SDK version (API 26 / Android 8.0) tested on emulator                                    | P1       | ☐        |
| A-13 | Battery and memory usage within acceptable bounds (no background drain)                          | P1       | ☐        |

### 1.4 Platform: iOS

| #     | Check                                                                                                                                                      | Priority | Verified |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| iO-1  | Release build archive signed with distribution provisioning profile                                                                                        | P0       | ☐        |
| iO-2  | dSYM files uploaded to Sentry via `sentry-cli` / Fastlane                                                                                                  | P0       | ☐        |
| iO-3  | Cold start time < 1.5s on baseline device (iPhone 13 class)                                                                                                | P0       | ☐        |
| iO-4  | Warm start time < 500ms                                                                                                                                    | P1       | ☐        |
| iO-5  | Transaction list scrolls at 60 fps (Animation Hitches instrument clean)                                                                                    | P1       | ☐        |
| iO-6  | `SentryCrashReporter` wired and tested with a forced crash                                                                                                 | P0       | ☐        |
| iO-7  | Universal Links configured for auth callbacks and household invites                                                                                        | P0       | ☐        |
| iO-8  | App Store Connect listing prepared: screenshots (all required device sizes), description, content rating, privacy policy URL, App Privacy nutrition labels | P0       | ☐        |
| iO-9  | Phased release configured (7-day automatic rollout)                                                                                                        | P0       | ☐        |
| iO-10 | Offline mode verified: full functionality without network                                                                                                  | P0       | ☐        |
| iO-11 | SQLCipher + Keychain integration verified on fresh install and app update paths                                                                            | P0       | ☐        |
| iO-12 | Minimum deployment target (iOS 16) tested on simulator and device                                                                                          | P1       | ☐        |
| iO-13 | Background app refresh configured for sync catch-up                                                                                                        | P2       | ☐        |
| iO-14 | Apple Privacy Manifest (`PrivacyInfo.xcprivacy`) configured per App Store requirements                                                                     | P0       | ☐        |

### 1.5 Platform: Web (PWA)

| #    | Check                                                                                          | Priority | Verified |
| ---- | ---------------------------------------------------------------------------------------------- | -------- | -------- |
| W-1  | Production build optimized (`vite build` with tree-shaking, code-splitting, minification)      | P0       | ☐        |
| W-2  | Source maps uploaded to Sentry via `@sentry/vite-plugin`                                       | P0       | ☐        |
| W-3  | Lighthouse scores meet baselines: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 90    | P0       | ☐        |
| W-4  | Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1                                            | P0       | ☐        |
| W-5  | Initial JS bundle < 200 KB gzipped; total initial load < 500 KB gzipped                        | P1       | ☐        |
| W-6  | SQLite WASM module loads and initializes correctly across Chrome, Firefox, Safari, Edge        | P0       | ☐        |
| W-7  | Service worker caching strategy verified: offline fallback works, cache invalidation on deploy | P0       | ☐        |
| W-8  | HTTPS enforced (Caddy redirect HTTP → HTTPS)                                                   | P0       | ☐        |
| W-9  | CSP (Content Security Policy) headers configured in Caddyfile                                  | P1       | ☐        |
| W-10 | PWA installable: manifest.json valid, install prompt works on Chrome/Edge/Safari               | P1       | ☐        |
| W-11 | Offline mode verified: transactions can be created, viewed, and edited without network         | P0       | ☐        |
| W-12 | Auth flow (passkeys + OAuth) works in Chrome, Firefox, Safari, Edge                            | P0       | ☐        |
| W-13 | No console errors or unhandled promise rejections in production build                          | P1       | ☐        |

### 1.6 Platform: Windows

| #    | Check                                                                                      | Priority | Verified |
| ---- | ------------------------------------------------------------------------------------------ | -------- | -------- |
| D-1  | Release build packaged (MSIX or installer) and code-signed                                 | P0       | ☐        |
| D-2  | Cold start time < 2.0s (JVM startup + Compose Desktop first frame)                         | P0       | ☐        |
| D-3  | Warm start time < 500ms                                                                    | P1       | ☐        |
| D-4  | `SentryCrashReporter` (JVM Sentry SDK) wired and tested                                    | P0       | ☐        |
| D-5  | DPAPI token storage verified: tokens encrypted at rest, accessible after Windows login     | P0       | ☐        |
| D-6  | SQLCipher database opens correctly on Windows file system paths                            | P0       | ☐        |
| D-7  | Offline mode verified                                                                      | P0       | ☐        |
| D-8  | Windows 10 (minimum) and Windows 11 tested                                                 | P1       | ☐        |
| D-9  | High-DPI / multi-monitor rendering correct (Compose Desktop scaling)                       | P2       | ☐        |
| D-10 | Microsoft Store listing prepared (if distributing via Store) or direct download page ready | P1       | ☐        |

### 1.7 Cross-Platform Functional Verification

End-to-end flows that must work identically on every platform.

| #    | Check                                                                                                                  | Priority | Verified |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| X-1  | **Auth: Sign up** — new user creates account via passkey on each platform                                              | P0       | ☐        |
| X-2  | **Auth: Sign in** — existing user authenticates via passkey and OAuth on each platform                                 | P0       | ☐        |
| X-3  | **Transaction CRUD** — create, read, update, delete a transaction on each platform                                     | P0       | ☐        |
| X-4  | **Budget CRUD** — create, edit, delete budgets; verify spending progress calculates correctly                          | P0       | ☐        |
| X-5  | **Goal CRUD** — create savings goals; verify current/target progress                                                   | P0       | ☐        |
| X-6  | **Category management** — create, rename, reorder, delete categories                                                   | P0       | ☐        |
| X-7  | **Account management** — create, rename, deactivate financial accounts                                                 | P0       | ☐        |
| X-8  | **Household invite** — send invite, accept invite, verify shared data appears on both devices                          | P0       | ☐        |
| X-9  | **Multi-device sync** — create transaction on device A, verify it appears on device B within 5s                        | P0       | ☐        |
| X-10 | **Offline → online sync** — create 10 transactions offline, reconnect, verify all sync within 10s                      | P0       | ☐        |
| X-11 | **Conflict resolution** — edit the same transaction on two devices simultaneously, verify LWW merge resolves correctly | P0       | ☐        |
| X-12 | **Data export** — export JSON/CSV from each platform, verify completeness                                              | P1       | ☐        |
| X-13 | **Account deletion** — trigger GDPR account deletion, verify crypto-shredding executes                                 | P1       | ☐        |
| X-14 | **Currency handling** — create transactions in multiple currencies, verify BIGINT cent amounts are correct             | P0       | ☐        |
| X-15 | **Recurring transactions** — create a recurring template, verify next-due-date and generation logic                    | P1       | ☐        |

### 1.8 Data & Sync Verification

| #    | Check                                                                                                                                     | Priority | Verified |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| DS-1 | Initial sync completes in < 10s for 1,000 records (per performance baseline)                                                              | P0       | ☐        |
| DS-2 | Incremental sync for 50 records completes in < 2s                                                                                         | P0       | ☐        |
| DS-3 | Offline queue replay: 100 queued mutations process in < 5s on reconnect                                                                   | P1       | ☐        |
| DS-4 | `SyncHealthMonitor` correctly reports Healthy/Degraded/Unhealthy states per thresholds (sync age 5m/30m, failures 1/3, pending 50/200)    | P0       | ☐        |
| DS-5 | Soft-delete filtering verified: `deleted_at IS NULL` applied in all sync-rules.yaml queries                                               | P0       | ☐        |
| DS-6 | Column allowlisting verified: no internal columns (`sync_version`, `is_synced`) or sensitive fields (`public_key`) exposed via sync rules | P0       | ☐        |
| DS-7 | `by_household` bucket isolation verified: user A in household 1 cannot see household 2 data                                               | P0       | ☐        |
| DS-8 | `user_profile` bucket verified: user sees only own profile and passkey credential metadata                                                | P0       | ☐        |
| DS-9 | Monetary values stored as BIGINT cents with ISO 4217 currency codes — no floating-point anywhere in the pipeline                          | P0       | ☐        |

### 1.9 Observability Readiness

| #    | Check                                                                                                           | Priority | Verified |
| ---- | --------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| O-1  | Sentry project created with separate environments: `production`, `staging`                                      | P0       | ☐        |
| O-2  | Sentry DSN loaded from environment/build config (never hardcoded)                                               | P0       | ☐        |
| O-3  | Sentry `sendDefaultPii: false` confirmed on all platforms                                                       | P0       | ☐        |
| O-4  | `beforeSend` scrubbers deployed and tested on all platforms (financial patterns, PII keys, auth tokens)         | P0       | ☐        |
| O-5  | External uptime monitor configured: health-check endpoint, web app, PowerSync (60s interval)                    | P0       | ☐        |
| O-6  | PagerDuty (or equivalent) configured for P0/P1 alert routing                                                    | P0       | ☐        |
| O-7  | Slack channels created: `#finance-alerts` (P0–P2), `#finance-security` (restricted), `#finance-monitoring` (P3) | P1       | ☐        |
| O-8  | `MetricsCollector` consent gating verified: no events recorded when `consentProvider()` returns false           | P0       | ☐        |
| O-9  | Sentry data retention configured: 30-day for errors, 90-day for crashes                                         | P1       | ☐        |
| O-10 | `sync_health_logs` table accepting inserts from authenticated service role                                      | P0       | ☐        |
| O-11 | Status page provisioned and accessible at public URL                                                            | P1       | ☐        |

---

## 2. Monitoring Dashboard Specifications

Dashboards are built using Grafana (self-hosted alongside the stack) or the Supabase dashboard for database-specific metrics. Each panel specifies its data source, refresh interval, and the alert rule it feeds.

### 2.1 Dashboard: Service Health (Operational)

**Purpose:** At-a-glance view of backend service health for the on-call engineer.
**Refresh:** 60 seconds
**Access:** On-call engineer, project lead

| Panel                            | Data Source                                            | Visualization                    | Alert Threshold                             |
| -------------------------------- | ------------------------------------------------------ | -------------------------------- | ------------------------------------------- |
| Health check status              | External uptime monitor → `health-check` Edge Function | Status indicator (green/red)     | Non-200 for 2 consecutive checks → **P0-1** |
| Database connection pool         | PostgreSQL `pg_stat_activity`                          | Gauge (current / max)            | Pool > 80% capacity → **P1-3**              |
| Database query latency (P95)     | PostgreSQL `pg_stat_statements`                        | Time series (ms)                 | P95 > 2s → **P2-1**                         |
| PostgREST response time          | Caddy access logs                                      | Time series (ms, P50/P95/P99)    | P95 > 1s → **P2**                           |
| GoTrue auth success/failure rate | GoTrue health endpoint + logs                          | Stacked bar (success vs failure) | > 50% failure over 5 min → **P0-2**         |
| Edge Function error rate         | Edge Functions runtime logs                            | Percentage line chart            | > 5% over 5 min → **P1-1**                  |
| Edge Function latency (P95)      | Edge Functions runtime logs                            | Time series (ms)                 | P95 > 3s → **P2**                           |
| Disk usage                       | VPS host metrics                                       | Gauge (used / total)             | > 70% → **P3**; > 90% → **P1**              |
| Memory usage by container        | Docker stats                                           | Stacked area chart               | Any container at resource limit → **P2**    |
| TLS certificate expiry           | External uptime monitor                                | Days remaining counter           | < 14 days → **P2**; < 3 days → **P0**       |

### 2.2 Dashboard: Sync Health

**Purpose:** Monitor the PowerSync sync pipeline and client sync behavior.
**Refresh:** 5 minutes (P95/P99 aggregates), 60 seconds (real-time counters)
**Access:** On-call engineer, project lead

| Panel                           | Data Source                                | Visualization                              | Alert Threshold                 |
| ------------------------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------- |
| Sync success rate               | `sync_health_logs` aggregate               | Percentage line chart (5-min windows)      | < 90% over 5 min → **P1-2**     |
| Sync latency P50 / P95 / P99    | `sync_health_logs` aggregate               | Multi-line time series (ms)                | P95 > 5s → **P2-4**             |
| Sync failure rate by error code | `sync_health_logs` grouped by `error_code` | Stacked bar chart                          | Spike in any code → investigate |
| PowerSync queue depth           | PowerSync dashboard / metrics API          | Gauge                                      | > 1,000 pending → **P1**        |
| Conflict rate                   | PowerSync dashboard / custom counter       | Percentage line chart                      | > 5% of syncs → **P1**          |
| Client reconnection rate        | PowerSync WebSocket metrics                | Counter (per minute)                       | Spike > 3× baseline → **P2**    |
| Average sync duration           | `sync_health_logs` rolling avg             | Time series (ms)                           | Trend > 2× baseline → **P2**    |
| Records synced per minute       | `sync_health_logs` sum of `record_count`   | Counter                                    | Sudden drop to 0 → **P1**       |
| Health status distribution      | `sync_health_logs` client reports          | Pie chart (Healthy / Degraded / Unhealthy) | > 10% Unhealthy → **P1**        |

### 2.3 Dashboard: Client Health

**Purpose:** Track app stability, errors, and version adoption across platforms.
**Refresh:** Hourly (error aggregates), Daily (adoption metrics)
**Access:** All team members

| Panel                           | Data Source                                           | Visualization                                   | Alert Threshold                  |
| ------------------------------- | ----------------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| Crash-free sessions by platform | Sentry release health                                 | Multi-line chart (%)                            | < 99.0% on any platform → **P1** |
| Top 10 errors by frequency      | Sentry issues                                         | Table (issue, count, platform, first/last seen) | New P0-classified issue → alert  |
| Error rate by platform          | Sentry                                                | Bar chart (errors per 1K sessions)              | > 50 errors/1K sessions → **P2** |
| App version distribution        | Sentry (anonymous tags)                               | Stacked area chart by version                   | — (informational)                |
| Cold start time (P50 / P95)     | `MetricsCollector` / platform profiling               | Time series by platform                         | P95 > baseline × 1.5 → **P3**    |
| Client-side sync health         | `SyncHealthMonitor` aggregates via `sync_health_logs` | Pie chart (Healthy / Degraded / Unhealthy)      | > 20% Degraded → **P2**          |
| Unhandled rejection rate (Web)  | Sentry browser                                        | Counter                                         | > 10/hour → **P2**               |

### 2.4 Dashboard: Launch Day War Room

**Purpose:** Temporary high-refresh dashboard for the first 72 hours post-launch.
**Refresh:** 30 seconds
**Access:** All team members (shared screen in war room)
**Decommission:** After 72 hours, fold panels into permanent dashboards above.

| Panel                                      | Data Source               | Visualization          |
| ------------------------------------------ | ------------------------- | ---------------------- |
| New user signups (cumulative)              | GoTrue auth events        | Counter + line chart   |
| Active sync connections                    | PowerSync WebSocket count | Gauge                  |
| Error rate (all platforms, real-time)      | Sentry                    | Sparkline per platform |
| Crash-free rate (all platforms, real-time) | Sentry                    | 4× big number          |
| Sync failure rate (real-time)              | `sync_health_logs`        | Percentage gauge       |
| Health check status                        | External uptime monitor   | Status light           |
| Edge Function invocation rate              | Edge Functions runtime    | Counter per function   |
| Database connections (active / idle)       | `pg_stat_activity`        | Gauge                  |
| Pending sync mutations (global)            | PowerSync queue           | Counter                |
| Most recent errors                         | Sentry (last 10 events)   | Live event feed        |

### 2.5 Alert Thresholds Summary

Consolidation of all alerting thresholds. Full definitions with runbook links in [alerting-rules.md](../architecture/alerting-rules.md).

| Priority | Alert                      | Condition                          | Response Time     |
| -------- | -------------------------- | ---------------------------------- | ----------------- |
| **P0**   | Service down               | Health check non-200 for ≥ 2 min   | 15 min            |
| **P0**   | Auth failure spike         | > 50% auth failure rate over 5 min | 15 min            |
| **P0**   | Data corruption            | Any integrity check failure        | 15 min            |
| **P0**   | Security breach indicators | Any confirmed indicator            | 15 min            |
| **P1**   | Elevated error rate        | > 5% error rate over 5 min         | 1 hour            |
| **P1**   | Sync failure spike         | > 10% sync failure over 5 min      | 1 hour            |
| **P1**   | Connection pool exhaustion | > 80% pool capacity                | 1 hour            |
| **P1**   | Crash-free rate drop       | < 99.0% crash-free sessions        | 1 hour            |
| **P2**   | Slow queries               | P95 query latency > 2s             | 4 hours           |
| **P2**   | TLS certificate warning    | < 14 days to expiry                | 4 hours           |
| **P2**   | Client reconnection spike  | > 3× baseline reconnection rate    | 4 hours           |
| **P2**   | Edge Function latency      | P95 > 3s                           | 4 hours           |
| **P3**   | Disk usage                 | > 70% of plan limit                | Next business day |
| **P3**   | Performance regression     | Metric > 1.5× baseline             | Next business day |

---

## 3. Incident Response Procedures

This section supplements the comprehensive [Incident Response Runbook](../architecture/incident-response-runbook.md) with launch-specific procedures.

### 3.1 Launch-Day Escalation Matrix

During the first 72 hours post-launch, escalation is tightened:

| Priority | Normal Response   | **Launch-Day Response**       | Channel                         |
| -------- | ----------------- | ----------------------------- | ------------------------------- |
| **P0**   | 15 min            | **10 min** — all hands        | Phone + Slack `#finance-alerts` |
| **P1**   | 1 hour            | **30 min** — on-call + backup | Slack `#finance-alerts`         |
| **P2**   | 4 hours           | **2 hours** — team member     | Slack `#finance-alerts`         |
| **P3**   | Next business day | **Same day** — team member    | Slack `#finance-monitoring`     |

**War room protocol:** For the first 24 hours, a dedicated war room channel (`#finance-launch-war-room`) is active. All team members monitor it during business hours. On-call engineer monitors continuously.

### 3.2 Launch-Specific Playbooks

#### 3.2.1 Sudden Traffic Spike

**Trigger:** Connection count or request rate exceeds 5× pre-launch baseline.

```
Step 1: Check VPS resource utilization (CPU, memory, disk I/O)
  → If CPU > 90%: prioritize — is it PostgreSQL or Edge Functions?
  → If memory > 90%: identify which container is consuming (docker stats)

Step 2: Check PostgreSQL connection pool
  → pg_stat_activity: active vs idle connections
  → If pool exhausted: increase max_connections (requires restart)
  → Kill long-running idle connections: SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '5 min';

Step 3: Check PowerSync WebSocket connections
  → PowerSync dashboard → connection count
  → If overwhelmed: PowerSync may need vertical scaling

Step 4: Consider rate limiting at Caddy level
  → Add rate_limit directive to Caddyfile for API endpoints
  → Redeploy Caddy: docker compose restart caddy

Step 5: If VPS is overwhelmed, vertically scale
  → Hetzner/DO: resize to next tier (4 vCPU / 8 GB)
  → This requires a brief downtime (~1-2 min for Hetzner)
  → Clients continue offline during downtime
```

#### 3.2.2 First Crash Report Surge

**Trigger:** Sentry crash-free rate drops below 99% in first 6 hours.

```
Step 1: Identify the top crashing issue in Sentry
  → Group by platform, version, device

Step 2: Assess scope
  → Does it affect all users or a specific device/OS combination?
  → Is it a fatal crash or a handled error being mis-reported?

Step 3: If limited to one platform:
  → Mobile: halt staged rollout (see §3.3)
  → Web: deploy hotfix or revert to previous build
  → Windows: push update via distribution channel

Step 4: If affecting all platforms (shared KMP code):
  → Identify the faulty module in packages/core
  → Prepare hotfix branch from last known-good tag
  → Prioritize: fix-forward if < 1 hour, rollback if longer

Step 5: Post-fix: verify crash-free rate recovers above 99.5%
```

#### 3.2.3 Sync Rules Mismatch Discovered Post-Launch

**Trigger:** Users report missing data or seeing data they shouldn't.

```
Step 1: IMMEDIATELY classify severity
  → Users seeing OTHER users' data → P0 (security breach — §4.4 in runbook)
  → Users missing their own data → P1

Step 2: Compare sync-rules.yaml against RLS policies
  → services/api/powersync/sync-rules.yaml
  → services/api/supabase/migrations/20260306000002_rls_policies.sql

Step 3: If data leak:
  → Roll back sync rules immediately (see runbook §3.3)
  → Rotate JWT secret to invalidate all sessions
  → Activate security incident process

Step 4: If data missing:
  → Check bucket parameterization (household_id matching)
  → Verify user's household_members record exists with deleted_at IS NULL
  → Test with the affected user's JWT claims
```

### 3.3 Rollback Procedures by Platform

Full procedures in [Incident Response Runbook §3](../architecture/incident-response-runbook.md#3-rollback-procedures). Summary for quick reference:

| Platform                | Rollback Method                                                                                  | Time to Effect                                                      | Notes                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Android**             | Halt staged rollout (Play Console → Managed publishing → Halt); submit previous APK as new build | Halt: immediate; new build: 1–24 hours (review)                     | Start rollout at 10% to limit blast radius                                                                                     |
| **iOS**                 | Pause phased release (App Store Connect); submit previous build for expedited review             | Pause: immediate; new build: 1–24 hours (expedited review)          | Apple expedited review: [developer.apple.com/contact/app-store](https://developer.apple.com/contact/app-store/?topic=expedite) |
| **Web (PWA)**           | Redeploy previous build; update service worker version to bust cache                             | Deploy: minutes; full propagation: up to 24 hours (SW update check) | For immediate effect, change SW file hash and redeploy                                                                         |
| **Windows**             | Push updated MSIX/installer via distribution channel; or publish hotfix                          | Minutes to hours depending on channel                               | Direct download: immediate; Store: review delay                                                                                |
| **Edge Functions**      | `git checkout <good-sha> -- functions/<name>/ && supabase functions deploy <name>`               | < 5 minutes                                                         | Never disable `health-check` — uptime monitors depend on it                                                                    |
| **Database migrations** | Write and apply reverse migration; always backup first                                           | 5–30 minutes depending on complexity                                | Never edit applied migrations; always create new reverse migration                                                             |
| **Sync rules**          | Revert `sync-rules.yaml` to previous commit; redeploy via PowerSync dashboard                    | < 5 minutes; clients re-sync in 5–15 min                            | Expect reconnection spike and elevated latency during re-sync                                                                  |
| **Feature flags**       | Server-side kill switch via Edge Function or Supabase table                                      | Immediate (next client check)                                       | Use for disabling features without redeploying client apps                                                                     |

### 3.4 Communication Templates

#### 3.4.1 Internal: Incident Declared

```
🚨 INCIDENT DECLARED — [P0/P1/P2]
What: [Brief description — e.g., "Sync failures affecting >10% of users"]
Impact: [Who is affected and how]
When: [Time detected, UTC]
IC: [Incident Commander name]
Status: Investigating
Channel: #finance-alerts
Next update: [Time — 15 min for P0, 30 min for P1]
```

#### 3.4.2 Internal: Incident Resolved

```
✅ INCIDENT RESOLVED — [P0/P1/P2]
What: [Brief description]
Root cause: [One-line root cause]
Duration: [From detection to resolution]
Impact: [Users affected, data impact]
Follow-up: Post-incident review scheduled for [date/time]
Action items: [Link to GitHub issue(s)]
```

#### 3.4.3 External: Status Page — Investigating

```
[Investigating] — [Service Name]
We are currently investigating an issue affecting [describe user impact
in plain language — e.g., "data syncing between devices"]. Your data is
safe and accessible on your device. We will provide updates as we learn more.
```

#### 3.4.4 External: Status Page — Resolved

```
[Resolved] — [Service Name]
The issue affecting [describe what was impacted] has been resolved.
All services are operating normally. Your locally stored data was not
affected. If you experience any remaining issues, please restart the app.
We apologize for the inconvenience.
```

---

## 4. Launch Communication Plan

### 4.1 Internal Communication Timeline

| Timing         | Action                                                                             | Owner              | Channel                    |
| -------------- | ---------------------------------------------------------------------------------- | ------------------ | -------------------------- |
| **L-14 days**  | Pre-launch checklist review begins; assign verification owners                     | Project lead       | Team meeting               |
| **L-7 days**   | Security checklist (§1.2) fully verified; sign-off                                 | Security reviewer  | Written sign-off           |
| **L-3 days**   | All platform checklists (§1.3–§1.6) verified; cross-platform tests (§1.7) complete | Platform leads     | PR with checklist results  |
| **L-1 day**    | **Go/no-go decision meeting** — review all checklist sections; decision recorded   | Project lead + all | Team meeting (recorded)    |
| **L-1 day**    | War room channel created; on-call rotation confirmed for 72 hours                  | Project lead       | Slack                      |
| **Launch day** | War room active; launch dashboard (§2.4) on shared screen                          | All team           | `#finance-launch-war-room` |
| **L+1 day**    | First post-launch standup: metrics review, triage new issues                       | All team           | Standup                    |
| **L+3 days**   | 72-hour stability review; decommission war room dashboard                          | Project lead       | Team meeting               |
| **L+7 days**   | First weekly metrics review; identify trends                                       | Project lead       | Written report             |
| **L+30 days**  | Post-launch retrospective                                                          | All team           | Team meeting               |

### 4.2 External Communication Timeline

| Timing         | Action                                                                                          | Channel                       |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| **L-7 days**   | Status page goes live (showing "Operational")                                                   | Status page URL               |
| **L-1 day**    | Verify status page is accessible and alerts are configured                                      | Status page                   |
| **Launch day** | App available on all distribution channels; no announcement until verified stable (30-min soak) | App stores, web               |
| **L+30 min**   | If stable: publish launch announcement                                                          | Blog / social (if applicable) |
| **Ongoing**    | Status page reflects real-time service status                                                   | Status page                   |

### 4.3 Status Page Setup

| Component              | Monitored Endpoint           | Status Source           |
| ---------------------- | ---------------------------- | ----------------------- |
| API & Backend Services | `health-check` Edge Function | External uptime monitor |
| Data Sync              | PowerSync instance health    | External uptime monitor |
| Web App                | Production web URL           | External uptime monitor |
| Authentication         | GoTrue `/health`             | External uptime monitor |

Status page provider: Self-hosted (e.g., [Upptime](https://upptime.js.org/) on GitHub Pages — free, privacy-respecting, no third-party data exposure) or lightweight hosted option (e.g., Instatus free tier).

---

## 5. Post-Launch Metrics Tracking Framework

### 5.1 Success Metrics & KPIs

Organized by category. All metrics are collected anonymously and consent-gated through `MetricsCollector`.

#### 5.1.1 Stability KPIs

| Metric                                 | Target                            | Measurement                  | Review Cadence                    |
| -------------------------------------- | --------------------------------- | ---------------------------- | --------------------------------- |
| Crash-free session rate (per platform) | ≥ 99.5%                           | Sentry release health        | Daily (first 7 days), then weekly |
| Service uptime                         | ≥ 99.5% monthly                   | External uptime monitor      | Weekly                            |
| Sync success rate                      | ≥ 95%                             | `sync_health_logs` aggregate | Daily (first 7 days), then weekly |
| P0 incidents                           | 0 per month                       | Incident reports             | Monthly                           |
| P1 incidents                           | ≤ 2 per month                     | Incident reports             | Monthly                           |
| Mean time to detect (MTTD)             | < 5 minutes for P0                | Incident timeline analysis   | Per incident                      |
| Mean time to resolve (MTTR)            | < 1 hour for P0, < 4 hours for P1 | Incident timeline analysis   | Per incident                      |

#### 5.1.2 Performance KPIs

Targets from [Performance Baselines](../architecture/performance-baselines.md).

| Metric                             | Target            | Measurement                               | Review Cadence |
| ---------------------------------- | ----------------- | ----------------------------------------- | -------------- |
| Cold start P95 (Android)           | < 2.0s            | Macrobenchmark / `MetricsCollector`       | Weekly         |
| Cold start P95 (iOS)               | < 1.5s            | MetricKit / `MetricsCollector`            | Weekly         |
| Cold start P95 (Web)               | < 2.0s (TTI)      | Lighthouse CI / `web-vitals`              | Weekly         |
| Cold start P95 (Windows)           | < 2.0s            | Custom timing / `MetricsCollector`        | Weekly         |
| Initial sync time (1K records)     | < 10s             | `SyncHealthMonitor.averageSyncDurationMs` | Weekly         |
| Incremental sync P95               | < 2s (50 records) | `sync_health_logs` aggregate              | Weekly         |
| Transaction save perceived latency | < 100ms           | In-app instrumentation                    | Weekly         |
| Web LCP P75                        | < 2.5s            | `web-vitals` / CrUX                       | Weekly         |
| Web INP P75                        | < 200ms           | `web-vitals` / CrUX                       | Weekly         |

#### 5.1.3 Adoption KPIs

All adoption metrics use anonymous, aggregate counts only — no PII.

| Metric                        | Target (L+30 days)              | Measurement                        | Review Cadence       |
| ----------------------------- | ------------------------------- | ---------------------------------- | -------------------- |
| Total registered users        | Baseline established at L+30    | GoTrue user count (aggregate only) | Weekly               |
| Daily active syncing devices  | Baseline established at L+30    | PowerSync connection count         | Daily                |
| Platform distribution         | Informational                   | Sentry anonymous platform tags     | Weekly               |
| App version adoption (latest) | > 80% within 14 days of release | Sentry version tags                | Weekly               |
| Retention: Day-1              | ≥ 40%                           | Anonymous session analytics        | Weekly (after L+7)   |
| Retention: Day-7              | ≥ 25%                           | Anonymous session analytics        | Weekly (after L+14)  |
| Retention: Day-30             | ≥ 15%                           | Anonymous session analytics        | Monthly (after L+30) |

#### 5.1.4 Operational KPIs

| Metric                                     | Target                      | Measurement                  | Review Cadence                     |
| ------------------------------------------ | --------------------------- | ---------------------------- | ---------------------------------- |
| Database disk usage                        | < 50% of plan limit at L+30 | VPS host metrics             | Weekly                             |
| Database connection pool utilization (avg) | < 50%                       | `pg_stat_activity` aggregate | Weekly                             |
| Backup success rate                        | 100%                        | Backup cron job logs         | Daily (automated alert on failure) |
| Monthly hosting cost                       | $10–20/mo                   | VPS billing                  | Monthly                            |
| CI pipeline pass rate                      | ≥ 95%                       | GitHub Actions metrics       | Weekly                             |

### 5.2 Stability Gate Criteria

The launch enters "stable" status when ALL of the following hold for 72 consecutive hours:

| Gate | Criterion                                | Measurement           |
| ---- | ---------------------------------------- | --------------------- |
| G-1  | Crash-free rate ≥ 99.0% on all platforms | Sentry                |
| G-2  | Sync success rate ≥ 90%                  | `sync_health_logs`    |
| G-3  | Zero open P0 incidents                   | Incident tracker      |
| G-4  | Health check uptime ≥ 99%                | External monitor      |
| G-5  | No rollbacks triggered                   | Deployment log        |
| G-6  | Edge Function error rate < 5%            | Edge Function metrics |

**If any gate fails:**

- War room remains active
- Investigate root cause immediately
- 72-hour clock resets when the gate violation is resolved

**When all gates pass for 72 hours:**

- Decommission war room dashboard
- Return to normal escalation timelines
- Announce "stable" status internally

### 5.3 Post-Launch Review Cadence

| Review                        | Timing                | Focus                                                             | Participants           |
| ----------------------------- | --------------------- | ----------------------------------------------------------------- | ---------------------- |
| **Daily standup**             | L+1 through L+7       | Active issues, metrics delta, user feedback                       | All team               |
| **72-hour stability review**  | L+3                   | Stability gate assessment, go/no-go for normal ops                | All team               |
| **Weekly metrics review**     | L+7, L+14, L+21, L+28 | KPI trends, performance regression check, alert tuning            | Project lead + on-call |
| **30-day retrospective**      | L+30                  | Full launch retrospective: what worked, what didn't, action items | All team               |
| **Quarterly business review** | L+90                  | Adoption trends, cost analysis, roadmap adjustment                | Project lead           |

### 5.4 Metric Collection Architecture

All post-launch metrics flow through the existing monitoring infrastructure, respecting privacy and consent boundaries.

```
┌─────────────────────────────────────────────────────────────┐
│                     Client App (Edge)                        │
│                                                              │
│  ┌──────────────────┐  ┌───────────────────┐                │
│  │ SyncHealthMonitor│  │ MetricsCollector   │                │
│  │ (always active)  │  │ (consent-gated)    │                │
│  │                  │  │                    │                │
│  │ • lastSyncTime   │  │ • screen_view      │                │
│  │ • failureCount   │  │ • feature_usage    │                │
│  │ • pendingMutations│ │ • sync_performance │                │
│  │ • healthStatus   │  │                    │                │
│  └────────┬─────────┘  └────────┬───────────┘                │
│           │                     │                            │
│  ┌────────┴─────────┐  ┌───────┴────────────┐               │
│  │ CrashReporter    │  │ Platform Transport  │               │
│  │ (consent-gated)  │  │ (flushEvents())    │               │
│  └────────┬─────────┘  └───────┬────────────┘               │
└───────────┼─────────────────────┼────────────────────────────┘
            │                     │
            ▼                     ▼
┌───────────────────┐   ┌──────────────────────┐
│ Sentry            │   │ Supabase             │
│ (error tracking)  │   │ (sync_health_logs)   │
│                   │   │                      │
│ • Crash-free rate │   │ • Sync duration      │
│ • Error frequency │   │ • Record count       │
│ • Release health  │   │ • Error codes        │
│ • Platform/version│   │ • Sync status        │
└───────────────────┘   └──────────────────────┘
            │                     │
            ▼                     ▼
┌─────────────────────────────────────────────────┐
│ Dashboards (Grafana / Supabase Dashboard)       │
│ • Service Health    • Sync Health               │
│ • Client Health     • Launch War Room           │
└─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────┐
│ Alerting (PagerDuty / Slack)                    │
│ P0 → Phone   P1 → Slack+Page                   │
│ P2 → Slack   P3 → Slack (low-priority)          │
└─────────────────────────────────────────────────┘
```

**Privacy invariant:** No PII, financial data, authentication tokens, or encryption material flows through any monitoring path. The `MetricsCollector` and `CrashReporter` enforce this contract at the collection point. The Sentry `beforeSend` scrubber provides a defense-in-depth layer at the transport point. The `sync_health_logs` table uses pseudonymous `user_id` and `device_id` only.

---

## 6. Launch Day Schedule

Concrete hour-by-hour schedule for launch day. All times are relative to the planned launch time (T).

| Time      | Action                                                                          | Owner            |
| --------- | ------------------------------------------------------------------------------- | ---------------- |
| **T-4h**  | Final infrastructure health check: all checklist §1.1 items green               | On-call engineer |
| **T-4h**  | Verify all monitoring dashboards are live and receiving data                    | On-call engineer |
| **T-3h**  | Final backup taken and verified                                                 | On-call engineer |
| **T-3h**  | War room channel opened; launch dashboard (§2.4) on shared screen               | Project lead     |
| **T-2h**  | Mobile builds submitted (if not already in review)                              | Platform leads   |
| **T-2h**  | Web production build deployed behind feature flag or DNS hold                   | Web lead         |
| **T-1h**  | All team members confirm availability for next 6 hours                          | All              |
| **T-0**   | **LAUNCH** — flip DNS / enable public access / release staged rollout           | Project lead     |
| **T+5m**  | Verify health check returns 200; verify uptime monitor is green                 | On-call engineer |
| **T+10m** | First user signup verified end-to-end (team test account)                       | QA lead          |
| **T+15m** | Multi-device sync verified with test account                                    | QA lead          |
| **T+30m** | Stability soak: all dashboards green for 30 min → proceed                       | Project lead     |
| **T+30m** | If stable: external launch announcement (if planned)                            | Project lead     |
| **T+1h**  | First metrics snapshot: signups, sync rate, error rate, crash-free rate         | On-call engineer |
| **T+2h**  | Triage any new Sentry issues; decide fix-forward vs rollback                    | All team         |
| **T+4h**  | Second metrics snapshot; compare against first hour                             | On-call engineer |
| **T+6h**  | End of peak monitoring; transition to normal on-call with launch-day thresholds | Project lead     |
| **T+12h** | Overnight handoff: confirm on-call has pager access and runbook links           | Outgoing on-call |
| **T+24h** | Day-1 standup: comprehensive metrics review                                     | All team         |
| **T+72h** | Stability gate review (§5.2); if all gates pass → exit launch mode              | Project lead     |

---

## Related Documents

- [Monitoring Architecture](../architecture/monitoring.md) — Sentry integration plan, sync health monitoring, dashboard specs, privacy guardrails
- [Alerting Rules](../architecture/alerting-rules.md) — P0–P3 alert definitions with thresholds and runbook links
- [Incident Response Runbook](../architecture/incident-response-runbook.md) — Severity levels, escalation matrix, rollback procedures, playbooks, post-incident process
- [Performance Baselines](../architecture/performance-baselines.md) — Target latencies for startup, sync, UI responsiveness, web vitals, database
- [CI/CD Strategy](../architecture/0006-cicd-strategy.md) — Build pipeline, affected-only builds, release workflows
- [Hosting Strategy](../architecture/0007-hosting-strategy.md) — Self-hosted VPS with Docker Compose, backup strategy
- [Security Audit](../architecture/security-audit-v1.md) — Known vulnerabilities and risk areas
- [Privacy Audit](../architecture/privacy-audit-v1.md) — Data classification, GDPR compliance
- [Deployment Runbook](deployment-runbook.md) — Step-by-step production deployment
- [Release Process](release-process.md) — Versioning, publishing, rollback
