# Monitoring Strategy

> Privacy-respecting observability for the Finance application.
> Covers crash reporting, sync health, API monitoring, and alerting.

## Principles

1. **Privacy first** — No PII in crash reports or metrics. All telemetry is anonymous.
2. **User consent required** — Crash reporting and usage metrics are opt-in. The app must function fully without them.
3. **Edge-first** — Monitor client-side health (sync, offline queue) as the primary signal. Server metrics are secondary.
4. **Minimal data** — Collect only what is needed to diagnose issues. Never log financial data, account numbers, or balances.

---

## Crash Reporting

### Requirements

- All crash reports must be **PII-free** — strip user identifiers, file paths, and device-unique IDs before submission.
- Users must **explicitly opt in** via a consent flow at onboarding or in settings.
- Crash context includes: app version, OS version, device model (generalized), locale, and a sanitized stack trace.
- A pseudonymous user ID (rotatable, not tied to real identity) may be attached to correlate crashes per session.

### Recommended Tools

| Tool                     | Deployment                  | Privacy Notes                                                                |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------- |
| **Sentry (self-hosted)** | On-premise or private cloud | Full data sovereignty. Recommended for production.                           |
| **Firebase Crashlytics** | Google Cloud                | Acceptable if data residency requirements are met. Disable user ID tracking. |

### Self-Hosted Sentry Setup

- Deploy Sentry via Docker Compose on private infrastructure.
- Configure data scrubbing rules to strip PII from stack traces.
- Set retention policy to 90 days maximum.
- Disable session replay and user feedback attachments.

### Integration Points

- `CrashReporter` interface in `packages/core` provides a platform-agnostic API.
- Each platform app (`apps/ios`, `apps/android`, `apps/web`, `apps/windows`) implements the interface with the native SDK.
- Unhandled exceptions are caught at the platform layer and forwarded through `CrashReporter.reportError()`.

---

## Sync Health Monitoring

### Metrics

| Metric                     | Description                             | Collection Point           |
| -------------------------- | --------------------------------------- | -------------------------- |
| `sync_latency_ms`          | Time from sync initiation to completion | Client (SyncHealthMonitor) |
| `pending_mutations`        | Number of unsynced local changes        | Client (SyncHealthMonitor) |
| `sync_failure_count`       | Consecutive sync failures               | Client (SyncHealthMonitor) |
| `conflict_rate`            | Conflicts per sync cycle                | Client + Server            |
| `last_successful_sync`     | Timestamp of last successful sync       | Client (SyncHealthMonitor) |
| `average_sync_duration_ms` | Rolling average of sync duration        | Client (SyncHealthMonitor) |

### Health Status

The `HealthStatus` sealed class evaluates sync state:

- **Healthy** — Last sync < 5 minutes ago, no pending failures, pending mutations < 50.
- **Degraded** — Last sync 5–30 minutes ago, or 1–3 consecutive failures, or pending mutations 50–200.
- **Unhealthy** — Last sync > 30 minutes ago, or > 3 consecutive failures, or pending mutations > 200.

### Server-Side Sync Logs

The `sync_health_logs` table in Supabase records sync events server-side:

- Tracks sync duration, record counts, and error codes per user per device.
- RLS enforced: users can read only their own logs; writes are restricted to the system (service role).
- Retained for 30 days, then automatically purged.

---

## API Monitoring

### Metrics

| Metric                | Target    | Alert Threshold |
| --------------------- | --------- | --------------- |
| Response time (p50)   | < 200 ms  | > 500 ms        |
| Response time (p99)   | < 1000 ms | > 3000 ms       |
| Error rate (5xx)      | < 0.1%    | > 1%            |
| Auth failure rate     | < 1%      | > 5%            |
| Sync endpoint latency | < 500 ms  | > 2000 ms       |

### Implementation

- Supabase Edge Functions emit structured JSON logs with request duration and status code.
- Use Supabase’s built-in observability dashboard for PostgreSQL query performance.
- Monitor RLS policy evaluation time — complex policies can degrade query performance.

---

## Alert Thresholds and Escalation

### Severity Levels

| Level             | Condition                                            | Response Time | Action                                      |
| ----------------- | ---------------------------------------------------- | ------------- | ------------------------------------------- |
| **P1 — Critical** | Sync completely broken for all users, data loss risk | 15 minutes    | Page on-call, all hands                     |
| **P2 — High**     | Sync degraded (> 50% failure rate), auth outage      | 1 hour        | Notify on-call, begin investigation         |
| **P3 — Medium**   | Elevated error rates, slow API responses             | 4 hours       | Create issue, investigate next business day |
| **P4 — Low**      | Minor anomalies, single-user reports                 | 24 hours      | Log and monitor                             |

### Escalation Flow

1. Automated alert fires based on threshold breach.
2. On-call engineer acknowledges within response time SLA.
3. If not acknowledged, escalate to secondary on-call.
4. Post-incident review for all P1 and P2 incidents.

### Alert Channels

- **P1/P2**: PagerDuty (or equivalent) — SMS + push notification.
- **P3**: Slack/Teams channel notification.
- **P4**: Dashboard annotation only.

---

## Usage Metrics (Anonymous)

### What We Collect (with consent)

- Screen view counts (which features are used, not what data is viewed).
- Feature adoption rates (e.g., "budget created" event, not budget details).
- App session duration (generalized to buckets: < 1 min, 1–5 min, 5–15 min, > 15 min).
- Sync performance metrics (latency, success rate).

### What We Never Collect

- Financial data (transactions, balances, account names, amounts).
- Personal information (name, email, phone, location).
- Browsing or navigation patterns that could identify individuals.
- Device-unique identifiers (use rotatable pseudonymous IDs only).

### Consent Management

- `MetricsCollector` in `packages/core` checks consent status before recording any metric.
- Consent is stored locally and can be revoked at any time.
- Revoking consent stops all future collection and deletes locally buffered metrics.

---

## Architecture Diagram

```
+---------------+     +------------------+     +-----------------+
|  Client App   |---->|  CrashReporter   |---->|  Sentry (self-  |
|  (per plat.)  |     |  (interface)     |     |  hosted)        |
+------+--------+     +------------------+     +-----------------+
       |
       |             +------------------+     +-----------------+
       +------------>| SyncHealthMonitor|---->|  sync_health_   |
       |             | (client metrics) |     |  logs (Supabase) |
       |             +------------------+     +-----------------+
       |
       |             +------------------+
       +------------>| MetricsCollector |---->  Local buffer
                     | (consent-gated)  |     (anonymous only)
                     +------------------+
```
