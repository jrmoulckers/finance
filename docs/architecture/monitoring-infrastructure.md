# Monitoring & Observability — Infrastructure Focus

**Status:** Proposed
**Date:** 2026-06-15
**Author:** AI agent (Architect), with human direction
**Related:** [Monitoring Architecture](monitoring.md) · [Alerting Rules](alerting-rules.md) · [Performance Baselines](performance-baselines.md) · [Incident Response Runbook](incident-response-runbook.md)

---

## Overview

This document extends the existing [Monitoring Architecture](monitoring.md) with infrastructure-level observability focused on deployment health, rollout monitoring, and launch readiness dashboards. The existing monitoring doc covers client-side error tracking (Sentry), sync health, and privacy guardrails. This document adds the infrastructure and operational observability needed to confidently ship and monitor the Finance app in production.

### Relationship to Existing Docs

| Document                                                  | Focus                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| [Monitoring Architecture](monitoring.md)                  | Client error tracking, sync health, privacy guardrails          |
| [Alerting Rules](alerting-rules.md)                       | Alert definitions and thresholds                                |
| [Performance Baselines](performance-baselines.md)         | Target metrics per platform                                     |
| [Incident Response Runbook](incident-response-runbook.md) | Incident classification and response                            |
| **This document**                                         | Infrastructure monitoring, rollout dashboards, launch readiness |

---

## 1. Infrastructure Monitoring Stack

### 1.1 Self-Hosted Monitoring (Cost-Effective)

Given the project's $10–20/month infrastructure budget (ADR-0007), monitoring uses lightweight, self-hosted tools:

| Layer             | Tool                               | Purpose                                 | Cost   |
| ----------------- | ---------------------------------- | --------------------------------------- | ------ |
| Uptime monitoring | Uptime Kuma (self-hosted)          | HTTP endpoint checks, TLS monitoring    | $0     |
| Container metrics | Docker built-in health checks      | Service health, restart tracking        | $0     |
| Log aggregation   | Docker `json-file` driver + `jq`   | Structured log search                   | $0     |
| Error tracking    | Sentry (free tier: 5K events/mo)   | Client + server error tracking          | $0–$26 |
| Database metrics  | `pg_stat_*` views + custom queries | Query performance, connection pooling   | $0     |
| Sync metrics      | `sync_health_logs` table           | Sync latency, failure rate, queue depth | $0     |
| Alerting          | Uptime Kuma → ntfy.sh / email      | Push notifications on failure           | $0     |

**Total monitoring cost: $0–$26/month** (Sentry free tier covers early usage; upgrade to Team plan at $26/mo when traffic warrants).

### 1.2 Uptime Kuma Setup

Deploy as an additional service in Docker Compose:

```yaml
uptime-kuma:
  image: louislam/uptime-kuma:1
  restart: unless-stopped
  ports:
    - '3001:3001' # Accessible only via SSH tunnel, not publicly exposed
  volumes:
    - uptime-kuma-data:/app/data
  networks:
    - finance-internal
```

**Configured monitors:**

| Monitor         | URL                                          | Interval | Alert Method     |
| --------------- | -------------------------------------------- | -------- | ---------------- |
| API Health      | `http://edge-functions:9000/health-check`    | 60s      | ntfy + email     |
| Auth Service    | `http://auth:9999/health`                    | 60s      | ntfy + email     |
| PostgREST       | `http://rest:3000/ready`                     | 60s      | ntfy + email     |
| PostgreSQL      | TCP check on `db:5432`                       | 60s      | ntfy + email     |
| PowerSync       | `http://powersync:8080/api/health`           | 60s      | ntfy + email     |
| TLS Certificate | `https://finance.example.com`                | Daily    | Email (14d warn) |
| Staging API     | `https://staging.finance.example.com/health` | 300s     | Email only       |

### 1.3 Log Management

**Docker log configuration** (add to each service in `docker-compose.yml`):

```yaml
logging:
  driver: json-file
  options:
    max-size: '10m'
    max-file: '5'
    tag: '{{.Name}}'
```

**Log querying:**

```bash
# View last 100 lines from all services
docker compose -p prod logs --tail=100

# Search for errors in Edge Functions
docker compose -p prod logs edge-functions 2>&1 | jq -r 'select(.level == "error")'

# Search for slow queries (> 1000ms, configured in PostgreSQL)
docker compose -p prod logs db 2>&1 | grep "duration:"
```

**Future upgrade path:** When log volume warrants, add Loki + Grafana for structured log search and dashboards. Both are self-hostable and free.

---

## 2. Deployment Health Monitoring

### 2.1 Docker Service Health Dashboard

Create a simple health check script (`deploy/scripts/health-check.sh`):

```bash
#!/bin/bash
# Health check for all Finance backend services
# Run via cron every 5 minutes: */5 * * * * /opt/finance/deploy/scripts/health-check.sh

DOMAIN="${1:-finance.example.com}"
HEALTHY=true

check_service() {
    local name=$1
    local url=$2
    local status=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    if [ "$status" = "200" ]; then
        echo "✅ $name: healthy"
    else
        echo "❌ $name: unhealthy (HTTP $status)"
        HEALTHY=false
    fi
}

check_service "API Health"     "https://$DOMAIN/health"
check_service "Auth"           "https://$DOMAIN/auth/health"
check_service "PostgREST"      "https://$DOMAIN/rest/"

if [ "$HEALTHY" = false ]; then
    # Send alert via ntfy.sh
    curl -sf -d "Finance backend unhealthy on $DOMAIN" ntfy.sh/finance-alerts
fi
```

### 2.2 Container Restart Monitoring

Monitor for unexpected container restarts (indicates crashes or OOM):

```bash
# Check restart counts
docker compose -p prod ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# Alert if any container has restarted more than 3 times in 1 hour
docker inspect --format='{{.Name}} {{.RestartCount}}' $(docker compose -p prod ps -q)
```

### 2.3 Resource Utilization

```bash
# Real-time resource usage per container
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Expected ranges (2 vCPU / 4 GB RAM VPS):
# PostgreSQL:    10-30% CPU, 256-512 MB RAM
# PostgREST:     1-5% CPU, 64-128 MB RAM
# GoTrue:        1-5% CPU, 64-128 MB RAM
# Edge Functions: 1-10% CPU, 64-256 MB RAM
# PowerSync:     5-15% CPU, 128-256 MB RAM
# Caddy:         1-3% CPU, 32-64 MB RAM
# Total:         ~20-70% CPU, ~1-1.5 GB RAM (headroom for spikes)
```

---

## 3. Sync Health Monitoring (Infrastructure Perspective)

### 3.1 Server-Side Sync Metrics

The existing `sync_health_logs` table (from `monitoring.sql` migration) stores per-sync telemetry. Query these for infrastructure-level health:

```sql
-- Sync success rate over last hour
SELECT
    COUNT(*) FILTER (WHERE sync_status = 'success') * 100.0 / COUNT(*) AS success_rate,
    COUNT(*) AS total_syncs,
    AVG(sync_duration_ms) AS avg_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY sync_duration_ms) AS p95_duration_ms
FROM sync_health_logs
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Sync failures by error code (last 24h)
SELECT error_code, COUNT(*) AS occurrences
FROM sync_health_logs
WHERE sync_status = 'failure' AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_code
ORDER BY occurrences DESC;
```

### 3.2 PowerSync-Specific Monitoring

| Metric             | How to Monitor                   | Alert Threshold        |
| ------------------ | -------------------------------- | ---------------------- |
| Replication lag    | PowerSync dashboard / health API | > 30s → P1             |
| Active connections | PowerSync health API             | > 80% capacity → P2    |
| Sync rule errors   | PowerSync logs                   | Any → P1               |
| Bucket size        | PowerSync dashboard              | > 10MB per bucket → P3 |

### 3.3 PostgreSQL Replication Health

Monitor the logical replication slot used by PowerSync:

```sql
-- Check replication slot health
SELECT
    slot_name,
    active,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS replication_lag
FROM pg_replication_slots
WHERE slot_name = 'powersync_slot';

-- Alert if replication lag > 100MB (WAL accumulation)
-- This indicates PowerSync is falling behind
```

---

## 4. API Latency and Availability

### 4.1 Edge Function Performance

Track Edge Function performance via structured logs:

```typescript
// Pattern used in all Edge Functions
const start = performance.now();
try {
  // ... function logic ...
  const duration = performance.now() - start;
  console.log(
    JSON.stringify({
      level: 'info',
      service: 'health-check',
      duration_ms: Math.round(duration),
      status: 200,
    }),
  );
} catch (error) {
  const duration = performance.now() - start;
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'health-check',
      duration_ms: Math.round(duration),
      error_code: error.code,
      // NEVER log error.message if it could contain user data
    }),
  );
}
```

### 4.2 Performance Targets (from Performance Baselines)

| Endpoint            | Target P95 | Alert Threshold |
| ------------------- | ---------- | --------------- |
| `health-check`      | < 200ms    | > 500ms → P3    |
| `auth-webhook`      | < 500ms    | > 2s → P2       |
| `passkey-*`         | < 1s       | > 3s → P2       |
| `household-invite`  | < 500ms    | > 2s → P2       |
| `process-recurring` | < 5s       | > 30s → P2      |
| `data-export`       | < 10s      | > 60s → P3      |
| PostgREST queries   | < 200ms    | > 2s → P2       |

### 4.3 Availability Targets

| Service       | Target Availability | Measurement           |
| ------------- | ------------------- | --------------------- |
| API (overall) | 99.5%               | Uptime Kuma (monthly) |
| Auth          | 99.5%               | Uptime Kuma (monthly) |
| PowerSync     | 99.0%               | Uptime Kuma (monthly) |
| Web app       | 99.5%               | Uptime Kuma (monthly) |

**Note:** These are internal targets, not SLA commitments. The offline-first architecture means client functionality is unaffected by server downtime — only sync is delayed.

---

## 5. Privacy-Respecting Analytics

### 5.1 What We Collect (Consent-Gated)

All analytics require explicit user opt-in per the `MetricsCollector` interface. When opted in:

| Metric Category  | Examples                                           | Identifiers Used       |
| ---------------- | -------------------------------------------------- | ---------------------- |
| Feature usage    | `create_transaction`, `view_budget`, `export_data` | Pseudonymous UUID      |
| Sync performance | Duration, record count, success/failure            | Pseudonymous device ID |
| App lifecycle    | Cold start time, crash-free sessions               | Pseudonymous device ID |
| Platform/version | OS version, app version, device model (generic)    | None (aggregated)      |

### 5.2 What We Never Collect

- Email, name, or any PII
- Financial data (amounts, balances, categories, payees)
- Authentication tokens or credentials
- IP addresses in client telemetry
- Location data
- Third-party tracking identifiers

### 5.3 Analytics Architecture

```
Client (opt-in) → MetricsCollector → Local buffer → Batch upload → sync_health_logs table
                                                                         │
                                                                    Aggregated queries
                                                                    (never individual)
                                                                         │
                                                                    Dashboard (Grafana / SQL)
```

No third-party analytics service. All data stays on our infrastructure.

---

## 6. Alerting Configuration

### 6.1 Alert Priority Routing

| Priority | Channel                   | Response Time     | Escalation                      |
| -------- | ------------------------- | ----------------- | ------------------------------- |
| P0       | ntfy.sh push + phone call | 15 minutes        | Immediate investigation         |
| P1       | ntfy.sh push + email      | 1 hour            | Investigate during waking hours |
| P2       | Email                     | 4 hours           | Next working session            |
| P3       | GitHub Issue              | Next business day | Plan in next work batch         |

### 6.2 Alert Definitions (Infrastructure-Focused)

| Alert                    | Condition                                    | Priority | Runbook                                               |
| ------------------------ | -------------------------------------------- | -------- | ----------------------------------------------------- |
| Service down             | Health check fails for > 2 minutes           | P0       | [Incident Runbook §4.1](incident-response-runbook.md) |
| Auth service down        | GoTrue health fails for > 2 minutes          | P0       | [Incident Runbook §4.2](incident-response-runbook.md) |
| Database unreachable     | `pg_isready` fails for > 1 minute            | P0       | [Incident Runbook §4.1](incident-response-runbook.md) |
| TLS certificate expiring | < 14 days to expiry                          | P2       | Caddy auto-renews; if stuck, manual `caddy reload`    |
| Disk usage > 80%         | VPS disk utilization                         | P1       | Clean Docker images, rotate logs, extend disk         |
| Memory usage > 90%       | VPS memory utilization                       | P1       | Identify OOM risk, increase limits or VPS size        |
| Replication lag > 100MB  | PowerSync replication slot WAL               | P1       | Check PowerSync health, restart if needed             |
| Container restart loop   | > 3 restarts in 1 hour                       | P1       | Check logs, identify crash cause                      |
| Sync failure rate > 10%  | `sync_health_logs` aggregate                 | P1       | Check PowerSync, check DB connections                 |
| Backup failure           | pg_dump cron exit code ≠ 0                   | P1       | Check disk space, check DB health                     |
| Slow queries             | PostgreSQL log_min_duration_statement (> 1s) | P3       | EXPLAIN ANALYZE, add index                            |

### 6.3 Notification Setup (ntfy.sh)

[ntfy.sh](https://ntfy.sh) is a simple, self-hostable push notification service. Free tier is sufficient for a solo project.

```bash
# Send an alert
curl -d "PostgreSQL is down on finance.example.com" ntfy.sh/finance-alerts

# Subscribe on phone: install ntfy app, subscribe to "finance-alerts" topic
# Subscribe via email: configure in ntfy.sh settings
```

For higher reliability, self-host ntfy on the same VPS:

```yaml
ntfy:
  image: binwiederhier/ntfy:latest
  restart: unless-stopped
  command: serve
  ports:
    - '8090:80' # Internal only, accessed via SSH tunnel or Caddy
  volumes:
    - ntfy-data:/var/lib/ntfy
  networks:
    - finance-internal
```

---

## 7. Launch Readiness Dashboard

### 7.1 Dashboard Design

A single-page dashboard answering: **"Is it safe to launch?"**

```
┌─────────────────────────────────────────────────────────────┐
│  FINANCE — Launch Readiness Dashboard                        │
│                                                              │
│  🟢 Backend Health        All services healthy (5/5)         │
│  🟢 Database              Connections: 3/100, Lag: 0 bytes   │
│  🟢 Sync Engine           PowerSync healthy, lag < 1s        │
│  🟢 TLS                   Certificate valid (87 days)        │
│  🟢 Backups               Last backup: 6h ago (success)      │
│                                                              │
│  Platform Readiness:                                         │
│  🟢 iOS         v1.0.0-rc.1  Crash-free: 99.8%  TestFlight │
│  🟢 Android     v1.0.0-rc.1  Crash-free: 99.7%  Closed Beta│
│  🟡 Web         v1.0.0-rc.1  LCP: 2.3s (target < 2.5s)     │
│  🟡 Windows     v1.0.0-beta.2 Pending Store review           │
│                                                              │
│  Key Metrics (last 24h):                                     │
│  Sync success rate:    99.2%                                 │
│  Auth success rate:    98.5%                                 │
│  API P95 latency:      180ms                                 │
│  Error rate:           0.3%                                  │
│                                                              │
│  Blocking Issues:      0 P0, 1 P1, 3 P2                     │
│  Last deploy:          2h ago (edge-functions v1.67.4)       │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Dashboard Data Sources

| Panel                   | Data Source                                | Refresh |
| ----------------------- | ------------------------------------------ | ------- |
| Backend health          | Uptime Kuma API                            | 60s     |
| Database metrics        | `pg_stat_activity`, `pg_replication_slots` | 60s     |
| Sync engine status      | PowerSync health API                       | 60s     |
| TLS certificate         | Uptime Kuma TLS check                      | Daily   |
| Backup status           | Backup script log file                     | Hourly  |
| Platform crash rates    | Sentry API                                 | 5 min   |
| Sync/Auth success rates | `sync_health_logs` aggregate query         | 5 min   |
| API latency             | Edge Function structured logs              | 5 min   |
| Blocking issues         | GitHub API (filtered by priority labels)   | 15 min  |

### 7.3 Implementation Options

**Option A (Minimal): Static HTML + cron**

A shell script queries all data sources, generates a static HTML page, and serves it via Caddy. Runs every 60 seconds via cron. Cost: $0.

**Option B (Better): Grafana**

Self-hosted Grafana with PostgreSQL as a data source. Provides rich visualization, alerting, and annotations for deployments. Add to Docker Compose:

```yaml
grafana:
  image: grafana/grafana-oss:latest
  restart: unless-stopped
  ports:
    - '3002:3000' # Internal only
  volumes:
    - grafana-data:/var/lib/grafana
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
    GF_SERVER_ROOT_URL: https://finance.example.com/grafana
  networks:
    - finance-internal
```

**Recommendation:** Start with Option A for launch. Upgrade to Grafana when dashboard complexity warrants it.

---

## 8. Rollout-Specific Monitoring

### 8.1 Metrics to Watch During Rollout

When rolling out a new version to any platform, monitor these metrics with **tighter thresholds** than normal:

| Metric            | Normal Threshold | Rollout Threshold (Canary) | Action if Exceeded      |
| ----------------- | ---------------- | -------------------------- | ----------------------- |
| Client crash rate | < 0.5%           | < 0.2%                     | Halt rollout            |
| Sync failure rate | < 5%             | < 2%                       | Investigate immediately |
| API error rate    | < 2%             | < 1%                       | Check new code paths    |
| P95 latency       | < 2s             | < 1.5s                     | Profile slow requests   |
| New Sentry issues | Baseline         | 0 new P0/P1                | Halt rollout if P0/P1   |

### 8.2 Deployment Annotations

Mark deployments in monitoring tools to correlate issues with releases:

```bash
# After each deployment, create an annotation
curl -X POST "http://localhost:3002/api/annotations" \
  -H "Content-Type: application/json" \
  -d "{
    \"text\": \"Deploy: edge-functions v1.67.4\",
    \"tags\": [\"deploy\", \"edge-functions\"]
  }"
```

In Sentry, use release tracking:

```bash
sentry-cli releases new "finance-web@1.3.0"
sentry-cli releases set-commits "finance-web@1.3.0" --auto
sentry-cli releases finalize "finance-web@1.3.0"
```

---

## 9. References

- [Monitoring Architecture](monitoring.md) — Client-side monitoring and Sentry integration
- [Alerting Rules](alerting-rules.md) — Full alert definitions
- [Performance Baselines](performance-baselines.md) — Target metrics
- [Incident Response Runbook](incident-response-runbook.md) — Response procedures
- [ADR-0007: Hosting Strategy](0007-hosting-strategy.md) — Infrastructure decisions
- [Uptime Kuma](https://github.com/louislam/uptime-kuma) — Self-hosted uptime monitoring
- [ntfy.sh](https://ntfy.sh) — Push notification service
- [Grafana](https://grafana.com/oss/grafana/) — Open-source dashboards
