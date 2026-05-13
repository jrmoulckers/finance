# External Uptime Monitoring — UptimeRobot

**Issue:** #1256

> **Related:** [Monitoring Overview](monitoring.md) | [CI/CD Monitoring](monitoring-setup.md) | [Deployment Runbook](deployment-runbook.md) | [Self-Hosted Monitors (Uptime Kuma)](../../deploy/monitoring/monitors.md)

---

## Overview

This document describes the **external uptime monitoring** configuration for the Finance production deployment at `finance.jrmoulckers.com`. External monitoring complements the self-hosted [Uptime Kuma](../../deploy/monitoring/monitors.md) instance by providing independent, third-party verification that the application is reachable from outside the hosting network.

### Why External Monitoring?

Self-hosted monitoring (Uptime Kuma running alongside the app) cannot detect:

- **Network-level outages** — ISP or DNS failures that prevent external access
- **Hosting provider downtime** — VPS-level failures that take down both the app and the monitor
- **TLS certificate issues** — Expiry or misconfiguration visible only to external clients
- **CDN/proxy failures** — Caddy misconfigurations that block external traffic

External monitoring from a third-party service solves this by probing from geographically distributed locations.

### Recommended Service: UptimeRobot

[UptimeRobot](https://uptimerobot.com/) is recommended for its generous free tier:

| Feature         | Free Tier                 |
| --------------- | ------------------------- |
| Monitors        | 50                        |
| Check interval  | 5 min (minimum)           |
| Alert contacts  | Unlimited                 |
| Status pages    | 1                         |
| Log retention   | 60 days                   |
| Locations       | Multi-region              |
| Pro (if needed) | $7/mo for 1-min intervals |

---

## Monitors

### P0 — Critical (60-second interval)

These monitors verify that core backend services are operational. They alert immediately on failure.

| Monitor Name | URL                                              | Type    | Interval | Expected Status | Keyword Check |
| ------------ | ------------------------------------------------ | ------- | -------- | --------------- | ------------- |
| API Health   | `https://finance.jrmoulckers.com/health`         | HTTP(s) | 60s      | 200             | `"healthy"`   |
| Auth Health  | `https://finance.jrmoulckers.com/auth/v1/health` | HTTP(s) | 60s      | 200             | —             |

> **Note:** The `/health` endpoint is backed by the `health-check` edge function, which checks both database connectivity (via PostgREST) and auth service status. A 200 response with `"status": "healthy"` confirms all core services are operational. A 503 with `"status": "degraded"` indicates a service-level failure. See [`services/api/supabase/functions/health-check/index.ts`](../../services/api/supabase/functions/health-check/index.ts) for implementation details.

### P1 — High (60–300-second interval)

| Monitor Name  | URL                                        | Type       | Interval | Expected Status  | Notes                               |
| ------------- | ------------------------------------------ | ---------- | -------- | ---------------- | ----------------------------------- |
| Web App       | `https://finance.jrmoulckers.com`          | HTTP(s)    | 300s     | 200              | Verifies SPA/PWA is served          |
| TLS Cert      | `https://finance.jrmoulckers.com`          | TLS expiry | Daily    | Valid (≥14 days) | Alert when cert expires in <14 days |
| DB (via REST) | `https://finance.jrmoulckers.com/rest/v1/` | HTTP(s)    | 300s     | 200              | Verifies PostgREST is responding    |

### P2 — Medium (300-second interval)

| Monitor Name     | URL / Target                                      | Type | Interval | Notes                     |
| ---------------- | ------------------------------------------------- | ---- | -------- | ------------------------- |
| PowerSync Status | `https://finance.jrmoulckers.com/sync/api/status` | HTTP | 300s     | Sync engine availability  |
| DNS Resolution   | `finance.jrmoulckers.com` A record                | DNS  | 300s     | Verifies DNS is resolving |

---

## Setup Instructions

### 1. Create an UptimeRobot Account

1. Sign up at [uptimerobot.com](https://uptimerobot.com/)
2. Verify your email address

### 2. Configure Alert Contacts

Navigate to **My Settings → Alert Contacts** and add:

| Contact Type | Target                    | Use For    | Notes                              |
| ------------ | ------------------------- | ---------- | ---------------------------------- |
| Email        | Ops team email            | All alerts | Primary notification channel       |
| Webhook      | Discord/Slack webhook URL | P0, P1     | Instant team visibility (optional) |

> **Security:** Never hardcode webhook URLs in this document or in source code. Configure them directly in the UptimeRobot dashboard. Store webhook URLs in a password manager or secrets vault.

### 3. Create Monitors

For each monitor in the tables above:

1. Click **Add New Monitor**
2. Select the appropriate monitor type (HTTP(s), Keyword, or Port)
3. Enter the URL and friendly name
4. Set the monitoring interval
5. For keyword monitors (API Health), enter the keyword `"healthy"` and select **Alert when keyword exists = No** (alert when keyword is NOT found)
6. Select all alert contacts
7. Save

### 4. Configure the Status Page

1. Navigate to **Status Pages** → **Add Status Page**
2. Name: `Finance App Status`
3. Custom domain (optional): `status.finance.jrmoulckers.com`
4. Add monitors grouped by category:

| Group           | Monitors                        |
| --------------- | ------------------------------- |
| Core Services   | API Health, Auth Health         |
| Web Application | Web App, TLS Cert               |
| Data Services   | DB (via REST), PowerSync Status |
| Infrastructure  | DNS Resolution                  |

5. Share the status page URL with stakeholders

---

## Alert Response & Escalation

### Severity Definitions

| Severity | Trigger                          | Response Time | Escalation                                  |
| -------- | -------------------------------- | ------------- | ------------------------------------------- |
| P0       | API Health or Auth Health down   | <5 min        | On-call engineer, all notification channels |
| P1       | Web App, TLS, or DB monitor down | <15 min       | On-call engineer, email + webhook           |
| P2       | PowerSync or DNS monitor down    | <1 hour       | Email only, next business day OK            |

### Escalation Procedures

#### P0 — Core Service Outage

1. **Acknowledge** the alert within 5 minutes
2. **Diagnose** — SSH into VPS, check Docker container status:
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
   docker logs --tail 50 finance-edge-functions
   docker logs --tail 50 finance-auth
   docker logs --tail 50 finance-db
   ```
3. **Mitigate** — Restart failed containers:
   ```bash
   docker compose -f deploy/docker-compose.yml restart <service>
   ```
4. **Verify** — Confirm the health endpoint returns 200:
   ```bash
   curl -s https://finance.jrmoulckers.com/health | jq .
   ```
5. **Post-mortem** — Create a GitHub issue documenting the outage, root cause, and preventive actions

#### P1 — Web App or TLS Issue

1. **Acknowledge** within 15 minutes
2. **Check Caddy** — TLS issues are usually Caddy/Let's Encrypt related:
   ```bash
   docker logs --tail 100 finance-caddy
   caddy validate --config /etc/caddy/Caddyfile
   ```
3. **Force TLS renewal** if certificate is expiring:
   ```bash
   docker exec finance-caddy caddy reload --config /etc/caddy/Caddyfile
   ```
4. **Verify** — Check TLS certificate from outside:
   ```bash
   echo | openssl s_client -connect finance.jrmoulckers.com:443 2>/dev/null | openssl x509 -noout -dates
   ```

#### P2 — Sync or DNS Issues

1. **Acknowledge** within 1 hour (next business day for off-hours)
2. **Check PowerSync** container health
3. **Verify DNS** — `dig finance.jrmoulckers.com` from multiple locations
4. **Escalate** to P1 if sync is down for >30 minutes (impacts offline-first sync)

---

## Relationship to Self-Hosted Monitoring

This external monitoring setup works alongside the self-hosted [Uptime Kuma](../../deploy/monitoring/monitors.md) instance:

| Aspect       | Uptime Kuma (Self-Hosted)               | UptimeRobot (External)                 |
| ------------ | --------------------------------------- | -------------------------------------- |
| Perspective  | Internal (same network as app)          | External (third-party infrastructure)  |
| Detects      | Service-level failures, internal errors | Network/DNS/TLS/hosting-level failures |
| Interval     | 60s (internal network, no rate limit)   | 60–300s (per free tier limits)         |
| Status page  | Internal dashboard                      | Public-facing status page              |
| Dependencies | Runs on same VPS (shared fate risk)     | Independent infrastructure             |

Both systems should be configured and active. If they disagree (one shows down, other shows up), investigate from both perspectives.

---

## Maintenance

- **Monthly:** Review alert history for false positives; tune intervals or retry counts
- **Quarterly:** Verify all monitors still point to valid endpoints; update if routes change
- **On deploy:** After any Caddyfile or Docker Compose change, verify all monitors still pass
- **On domain change:** Update all monitor URLs and DNS monitors immediately

---

## References

- [Health Check Edge Function](../../services/api/supabase/functions/health-check/index.ts)
- [Caddyfile Routing](../../deploy/Caddyfile) — `/health` route configuration
- [Self-Hosted Monitors (Uptime Kuma)](../../deploy/monitoring/monitors.md)
- [Deployment Runbook](deployment-runbook.md)
- [Infrastructure Standards](infrastructure-standards.md)
