# Monitoring Architecture

**Status:** Proposed
**Date:** 2026-03-15
**Related:** [Security Audit](security-audit-v1.md) · [Privacy Audit](privacy-audit-v1.md) · [CI/CD Strategy](0006-cicd-strategy.md)
**Tickets:** #410

---

## Overview

This document defines the monitoring, error-tracking, and observability strategy for the Finance app across all platforms and backend services. Every decision is governed by two constraints:

1. **Privacy-first** — monitoring MUST NOT capture PII, financial data, tokens, or any data that could identify a user or reveal their finances.
2. **Consent-gated** — optional telemetry (crash reports, anonymous metrics) requires explicit user opt-in per the existing `CrashReporter` and `MetricsCollector` contracts.

The architecture builds on the existing KMP monitoring interfaces in `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/`:

| Interface | Purpose |
|-----------|---------|
| `CrashReporter` | Platform-agnostic crash/error reporting (consent-gated, PII-free) |
| `MetricsCollector` | Anonymous usage metrics (consent-gated, buffered, flushable) |
| `HealthStatus` | Sync health evaluation (Healthy / Degraded / Unhealthy) |
| `SyncHealthMonitor` | Client-side sync performance tracking with reactive `StateFlow` |

---

## 1. Error Tracking — Sentry Integration Plan

Sentry is the recommended error-tracking platform for all client apps. Each platform will implement the existing `CrashReporter` interface using Sentry's native SDK while preserving the privacy guarantees documented in the interface contract.

### 1.1 Shared Configuration Principles

All Sentry integrations MUST:

- Use `sendDefaultPii: false` (or platform equivalent)
- Implement a `beforeSend` / event processor that strips financial data patterns
- Set `environment` from build configuration (never hardcode)
- Load DSN from environment variables / build config (never commit to source)
- Gate initialization on user consent (honor `consentProvider()`)
- Use pseudonymous user IDs only (rotatable UUIDs, never email/account IDs)
- Attach breadcrumbs for navigation and sync events only — no financial context

### 1.2 iOS — Sentry-Cocoa

| Item | Value |
|------|-------|
| SDK | `sentry-cocoa` (via SPM) |
| Init location | `AppDelegate` / `@main` App struct |
| CrashReporter impl | New `SentryCrashReporter: CrashReporter` in `apps/ios/Finance/Monitoring/` |
| Source maps | dSYM upload via `sentry-cli` in Fastlane `gym` lane |
| Privacy | `SentryOptions.sendDefaultPii = false`; `beforeSend` scrubs financial patterns |

```swift
// Pseudocode — actual integration pending consent UI (#367)
SentrySDK.start { options in
    options.dsn = ProcessInfo.processInfo.environment["SENTRY_DSN"]
    options.environment = Bundle.main.infoDictionary?["Configuration"] as? String
    options.sendDefaultPii = false
    options.beforeSend = { event in
        return SentryPrivacyFilter.scrub(event)
    }
}
```

### 1.3 Android — Sentry-Android

| Item | Value |
|------|-------|
| SDK | `io.sentry:sentry-android` (via Gradle) |
| Init location | `FinanceApplication.onCreate()` |
| CrashReporter impl | Upgrade existing `TimberCrashReporter` → `SentryCrashReporter` in `apps/android/src/main/kotlin/com/finance/android/monitoring/` |
| ProGuard/R8 | Upload mapping files via `sentry-android-gradle-plugin` |
| Privacy | `SentryAndroid.init { it.isSendDefaultPii = false }`; `beforeSend` scrubs financial patterns |

The existing `TimberCrashReporter` (`apps/android/src/main/kotlin/com/finance/android/logging/TimberCrashReporter.kt`) already implements the `CrashReporter` interface with Timber as a local-only backend. When Sentry is integrated, `SentryCrashReporter` will forward to both Timber (local) and Sentry (remote, consent-gated).

### 1.4 Web — Sentry-Browser

| Item | Value |
|------|-------|
| SDK | `@sentry/browser` (via npm) |
| Init location | `apps/web/src/lib/monitoring.ts` (called from `main.tsx`) |
| Source maps | Upload via `@sentry/vite-plugin` during build |
| Privacy | `sendDefaultPii: false`; `beforeSend` scrubs financial patterns; `denyUrls` for third-party noise |

See `apps/web/src/lib/monitoring.ts` for the placeholder configuration.

### 1.5 Windows — Sentry-JVM (Kotlin/JVM)

| Item | Value |
|------|-------|
| SDK | `io.sentry:sentry` (JVM, via Gradle) |
| Init location | Application entry point in `apps/windows/` |
| CrashReporter impl | New `SentryCrashReporter: CrashReporter` in `apps/windows/src/main/kotlin/com/finance/desktop/monitoring/` |
| Privacy | Same `beforeSend` scrubbing as Android (shared Kotlin code where possible) |

---

## 2. Sync Health Monitoring

### 2.1 Client-Side (Existing)

The `SyncHealthMonitor` class already provides:

- **Last sync time** — `StateFlow<Instant?>`, null if never synced
- **Pending mutations** — `StateFlow<Int>`, queue depth of unsynced local changes
- **Failure count** — `StateFlow<Int>`, consecutive failures since last success
- **Average sync duration** — `StateFlow<Long>`, rolling average over 100 samples
- **Health status** — `StateFlow<HealthStatus>`, computed from thresholds:

| Condition | Degraded Threshold | Unhealthy Threshold |
|-----------|-------------------|-------------------- |
| Sync age | > 5 minutes | > 30 minutes |
| Consecutive failures | ≥ 1 | > 3 |
| Pending mutations | ≥ 50 | > 200 |

### 2.2 Server-Side (Existing)

The `sync_health_logs` table (`services/api/supabase/migrations/20260307000001_monitoring.sql`) records:

- `user_id`, `device_id` (pseudonymous), `sync_duration_ms`, `record_count`
- `error_code`, `error_message` (sanitized — must not contain PII/financial data)
- `sync_status` (`success` | `failure` | `partial`)
- RLS: users can read their own logs; only `service_role` can insert

### 2.3 PowerSync Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Sync latency (P50, P95, P99) | `sync_health_logs` aggregate | P95 > 5s → P2 |
| Conflict rate | PowerSync dashboard / custom counter | > 5% of syncs → P1 |
| Queue depth (server-side) | PowerSync dashboard | > 1000 pending → P1 |
| Sync failure rate | `sync_health_logs` aggregate | > 10% over 5 min → P1 |
| Client reconnection rate | PowerSync WebSocket metrics | Spike > 3× baseline → P2 |

---

## 3. Backend Health Monitoring

### 3.1 Supabase Dashboard Metrics

Monitor via Supabase dashboard and/or the management API:

| Metric | Location | Alert Threshold |
|--------|----------|-----------------|
| Database connections | Supabase Dashboard → Database | Pool > 80% capacity → P1 |
| Query performance (P95) | Supabase Dashboard → Database | P95 > 2s → P2 |
| Auth failure rate | Supabase Dashboard → Auth | > 50% failure rate → P0 |
| Edge Function errors | Supabase Dashboard → Functions | Error rate > 5% → P1 |
| Edge Function latency | Supabase Dashboard → Functions | P95 > 3s → P2 |
| Storage usage | Supabase Dashboard → Database | > 70% plan limit → P3 |
| RLS policy denials | Custom `pg_stat_statements` query | Unexpected spike → P2 |

### 3.2 Health Check Endpoint

A dedicated health check Edge Function (`services/api/supabase/functions/health-check/index.ts`) provides:

- Database connectivity check (`SELECT 1`)
- Auth service status check
- Structured JSON response with service statuses
- Public endpoint (no auth required) with rate limiting guidance
- Returns `200` (healthy) or `503` (degraded)
- **NEVER** exposes connection strings, table names, schema details, or internal errors

This endpoint is consumed by external uptime monitoring services.

---

## 4. Uptime Monitoring

### 4.1 External Health Checks

Configure an external uptime service (e.g., Uptime Robot, Better Uptime, or Checkly) to:

| Check | Target | Interval | Alert |
|-------|--------|----------|-------|
| API health | `https://<project>.supabase.co/functions/v1/health-check` | 60s | P0 if down > 2 min |
| Web app | `https://app.finance.example.com` | 60s | P0 if down > 2 min |
| PowerSync endpoint | `https://<powersync-instance>/` | 60s | P0 if down > 2 min |
| Certificate expiry | All HTTPS endpoints | Daily | P2 if < 14 days |

### 4.2 Synthetic Monitoring (Future)

Once in production, add synthetic transaction tests:

- Login → create transaction → verify sync → delete transaction
- Run from multiple regions every 15 minutes
- Alert on any step failure or total duration > 10s

---

## 5. Privacy Guardrails

### 5.1 Data Classification for Monitoring

#### ✅ CAN Appear in Monitoring

- Pseudonymous user IDs (rotatable UUIDs)
- Pseudonymous device IDs (not hardware identifiers)
- Screen/page names (e.g., `"budget_list"`, `"settings"`)
- Feature usage identifiers (e.g., `"create_budget"`, `"export_data"`)
- Sync performance metrics (duration, record count, status)
- Error codes and sanitized error messages
- App version, OS version, device model (generic)
- HTTP status codes and response times
- Stack traces (with financial data scrubbed from local variables)

#### 🚫 MUST NEVER Appear in Monitoring

| Category | Examples | Reason |
|----------|----------|--------|
| **PII** | Email, display name, avatar URL, IP address (in client telemetry) | GDPR Art. 5(1)(c) data minimization |
| **Financial data** | Account names, balances, amounts, payees, notes, budget names/amounts | Core privacy promise |
| **Authentication material** | Access tokens, refresh tokens, API keys, session IDs | Security risk |
| **Account identifiers** | Bank account numbers, routing numbers | Financial privacy |
| **Database internals** | Connection strings, table names, column values, SQL queries with data | Security risk |
| **Encryption material** | DEKs, KEKs, key IDs, encrypted payloads | Security risk |
| **User content** | Transaction notes, goal names, category customizations | Privacy |

### 5.2 Scrubbing Implementation

Every Sentry integration must implement a `beforeSend` event processor that:

1. Strips known financial data patterns from breadcrumbs, contexts, and extra data:
   - Currency amounts (e.g., `$1,234.56`, `€100.00`, patterns like `amount_cents: 12345`)
   - Account number patterns (sequences of 4+ digits that could be account numbers)
   - Balance values (any key containing `balance`, `amount`, `total`)
2. Removes any key-value pair where the key matches: `email`, `name`, `displayName`, `payee`, `note`, `token`, `password`, `secret`, `key`, `dsn`, `connectionString`
3. Preserves stack traces but scrubs local variable values that match financial patterns
4. Never attaches request/response bodies

### 5.3 GDPR Compliance

- **Legal basis:** Legitimate interest for error tracking (service reliability); consent for optional analytics
- **Data retention in Sentry:** Configure 30-day retention for error events, 90-day for crash reports
- **Data location:** Configure Sentry to store data in EU region if serving EU users
- **Subject access:** Sentry data uses pseudonymous IDs only — no PII to export
- **Consent withdrawal:** When user revokes consent, call `Sentry.close()` and `MetricsCollector.clearEvents()`

---

## 6. Logging Standards

### 6.1 Structured Logging

All server-side logs (Edge Functions) must use structured JSON logging:

```json
{
  "level": "info",
  "message": "Sync health log recorded",
  "timestamp": "2026-03-15T19:00:00Z",
  "service": "health-check",
  "request_id": "uuid",
  "duration_ms": 45
}
```

### 6.2 Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `error` | Unrecoverable failures requiring investigation | DB connection failure, auth service down |
| `warn` | Recoverable issues that may indicate problems | Rate limit approached, slow query detected |
| `info` | Normal operational events | Health check completed, sync log recorded |
| `debug` | Detailed diagnostic data (never in production) | Query execution details, full request flow |

### 6.3 What MUST NOT Be Logged

Applies to all log destinations (console, files, external services):

- User email addresses or display names
- Financial amounts, balances, account names
- Authentication tokens (access, refresh, API keys)
- Full request/response bodies containing user data
- Database connection strings or credentials
- Encryption keys, nonces, or encrypted payloads

---

## 7. Dashboards

### 7.1 Operational Dashboard

Build a dashboard (Grafana, Supabase dashboard, or equivalent) with:

| Panel | Data Source | Refresh |
|-------|------------|---------|
| Service health status | Health check endpoint | 60s |
| Error rate by platform | Sentry | 5 min |
| Sync success rate | `sync_health_logs` | 5 min |
| Sync latency P50/P95/P99 | `sync_health_logs` | 5 min |
| Active database connections | Supabase metrics | 60s |
| Edge Function latency | Supabase metrics | 5 min |
| Auth failure rate | Supabase Auth metrics | 5 min |

### 7.2 Client Health Dashboard

| Panel | Data Source | Refresh |
|-------|------------|---------|
| Crash-free sessions by platform | Sentry | Hourly |
| Top errors by frequency | Sentry | Hourly |
| App version distribution | Sentry (anonymous) | Daily |
| Sync health distribution | `sync_health_logs` aggregate | 15 min |

---

## 8. Incident Response Integration

### 8.1 Alert Routing

| Priority | Channel | Responder |
|----------|---------|-----------|
| P0 (Critical) | PagerDuty / phone call | On-call engineer |
| P1 (High) | Slack `#finance-alerts` + PagerDuty | On-call engineer |
| P2 (Medium) | Slack `#finance-alerts` | Team during business hours |
| P3 (Low) | Slack `#finance-monitoring` | Next sprint planning |

### 8.2 Runbook Links

Every alert must include:

- Link to the relevant runbook in `docs/guides/runbooks/`
- Link to the relevant dashboard panel
- Clear description of what triggered the alert
- Suggested first diagnostic step

---

## 9. Implementation Roadmap

| Phase | Scope | Prerequisite |
|-------|-------|-------------|
| **Phase 1** (Pre-beta) | Health check endpoint, performance baselines, alerting rules documented | This document |
| **Phase 2** (Beta) | Sentry integration (web first, then Android), consent UI | Consent management (#367) |
| **Phase 3** (Beta) | Sentry integration (iOS, Windows), operational dashboard | Phase 2 |
| **Phase 4** (GA) | External uptime monitoring, PagerDuty integration, runbooks | Phase 3 |
| **Phase 5** (Post-GA) | Synthetic monitoring, SLO tracking, cost optimization | Production traffic baseline |

---

## 10. Open Questions

1. **Sentry vs. alternatives:** Confirm Sentry as the error tracking provider, or evaluate alternatives (e.g., Datadog, Highlight.io). Sentry's self-hosted option may be attractive for a finance app.
2. **EU data residency:** If serving EU users, confirm Sentry EU data region availability and cost implications.
3. **Consent UI timeline:** Monitoring integration is blocked on consent management (#367). What is the target date?
4. **Budget:** Sentry pricing for 4 platforms — estimate usage and confirm plan tier.
5. **PowerSync observability:** Confirm what metrics PowerSync exposes natively vs. what needs custom instrumentation.
