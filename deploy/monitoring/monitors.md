# Uptime Kuma Monitor Definitions

**Issue:** #887

This file documents the monitors to configure in Uptime Kuma after deployment. Import these manually via the Uptime Kuma dashboard or use the API.

---

## Monitor Configuration

### P0 — Critical (Alert immediately, 60s interval)

| Monitor Name     | Type | URL / Target                       | Interval | Retries | Expected |
| ---------------- | ---- | ---------------------------------- | -------- | ------- | -------- |
| Health Check     | HTTP | `https://{DOMAIN}/health`          | 60s      | 3       | 200      |
| Auth Service     | HTTP | `https://{DOMAIN}/auth/health`     | 60s      | 3       | 200      |
| REST API         | HTTP | `https://{DOMAIN}/rest/`           | 60s      | 3       | 200      |
| PowerSync Status | HTTP | `https://{DOMAIN}/sync/api/status` | 60s      | 3       | 200      |
| PostgreSQL       | TCP  | `{VPS_IP}:5432` (internal only)    | 60s      | 3       | Connect  |

### P1 — High (Alert within 5 min, 120s interval)

| Monitor Name           | Type | URL / Target                                 | Interval | Retries | Expected |
| ---------------------- | ---- | -------------------------------------------- | -------- | ------- | -------- |
| Edge Functions         | HTTP | `https://{DOMAIN}/functions/v1/health-check` | 120s     | 3       | 200      |
| TLS Certificate Expiry | HTTP | `https://{DOMAIN}` (cert check)              | 3600s    | 1       | Valid    |

### P2 — Medium (Alert within 30 min, 300s interval)

| Monitor Name   | Type | URL / Target                      | Interval | Retries | Expected |
| -------------- | ---- | --------------------------------- | -------- | ------- | -------- |
| DNS Resolution | DNS  | `{DOMAIN}` A record               | 300s     | 2       | Resolve  |
| Staging Health | HTTP | `https://staging.{DOMAIN}/health` | 300s     | 3       | 200      |

---

## Notification Channels

Configure at least two notification channels for redundancy:

| Channel | Provider      | Use For    | Notes                               |
| ------- | ------------- | ---------- | ----------------------------------- |
| Email   | SMTP          | All alerts | Primary notification channel        |
| Webhook | Discord/Slack | P0, P1     | Instant team visibility             |
| Push    | Pushover/Ntfy | P0 only    | Wake-up alerts for critical outages |

---

## Status Page (Optional)

Uptime Kuma includes a public status page feature. Configure it at:

`Dashboard → Status Pages → Add Status Page`

Recommended groups:

1. **Core Services** — Health Check, Auth, REST API
2. **Sync Engine** — PowerSync Status
3. **Infrastructure** — PostgreSQL, DNS, TLS

---

## Alerting Rules

Reference: [docs/architecture/alerting-rules.md](../../../docs/architecture/alerting-rules.md)

| Severity | Response Time   | Escalation                                  |
| -------- | --------------- | ------------------------------------------- |
| P0       | Immediate (<5m) | On-call engineer, all notification channels |
| P1       | <15 min         | On-call engineer, email + webhook           |
| P2       | <1 hour         | Email only, next business day OK            |
| P3       | <24 hours       | Logged, reviewed in weekly review           |
