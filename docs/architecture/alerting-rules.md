# Alerting Rules

**Status:** Proposed
**Date:** 2026-03-15
**Related:** [Monitoring Architecture](monitoring.md) · [Security Audit](security-audit-v1.md)
**Tickets:** #410

---

## Overview

This document defines alerting thresholds, escalation paths, and response expectations for the Finance app's production monitoring. All alerts must be **actionable** — every alert includes a description, threshold, suggested first response, and link to the relevant runbook.

Alerts are classified into four priority levels with defined response times.

---

## Priority Definitions

| Priority | Severity | Response Time | Escalation | Examples |
|----------|----------|---------------|------------|----------|
| **P0** | Critical | 15 minutes | Immediate page (phone/SMS) | Service outage, data corruption, auth system down |
| **P1** | High | 1 hour | Slack alert + on-call page | Elevated error rates, sync failures, connection pool exhaustion |
| **P2** | Medium | 4 hours | Slack alert | Slow queries, certificate warnings, elevated client errors |
| **P3** | Low | Next business day | Slack notification | Disk usage, dependency vulnerabilities, performance regressions |

---

## P0 — Critical Alerts (15-minute response)

These alerts indicate service-affecting incidents requiring immediate action.

### P0-1: Service Down — Health Check Failure

| Field | Value |
|-------|-------|
| **Condition** | Health check endpoint returns non-200 for ≥ 2 consecutive checks (2 minutes) |
| **Source** | External uptime monitor → `health-check` Edge Function |
| **Threshold** | 2 consecutive failures (120 seconds) |
| **Alert channel** | PagerDuty (phone) + Slack `#finance-alerts` |
| **First response** | Check Supabase status page; verify Edge Function logs; check database connectivity |
| **Runbook** | `docs/guides/runbooks/service-down.md` |

### P0-2: Auth Failure Spike

| Field | Value |
|-------|-------|
| **Condition** | Auth failure rate exceeds 50% of total auth attempts over a 5-minute window |
| **Source** | Supabase Auth metrics / auth webhook logs |
| **Threshold** | > 50% failure rate over 5 minutes (minimum 10 attempts) |
| **Alert channel** | PagerDuty (phone) + Slack `#finance-alerts` |
| **First response** | Check Supabase Auth service status; review auth webhook logs for error patterns; verify OAuth provider status (Google, Apple) |
| **Runbook** | `docs/guides/runbooks/auth-failure-spike.md` |

### P0-3: Data Corruption Detected

| Field | Value |
|-------|-------|
| **Condition** | Sync conflict resolution produces data that fails integrity checks, or crypto-shredding verification fails |
| **Source** | Application error logs / Sentry alerts / `CryptoShredder.verifyShredding()` failure |
| **Threshold** | Any single occurrence |
| **Alert channel** | PagerDuty (phone) + Slack `#finance-alerts` |
| **First response** | Halt affected sync operations; identify scope of corruption; engage incident commander |
| **Runbook** | `docs/guides/runbooks/data-corruption.md` |

### P0-4: Security Breach Indicators

| Field | Value |
|-------|-------|
| **Condition** | Unusual patterns indicating potential breach: mass account access, token theft indicators, RLS bypass attempts |
| **Source** | Audit log anomaly detection / Supabase Auth logs |
| **Threshold** | Any single confirmed indicator |
| **Alert channel** | PagerDuty (phone) + Slack `#finance-security` (restricted) |
| **First response** | Activate incident response plan; preserve logs; assess scope |
| **Runbook** | `docs/guides/runbooks/security-incident.md` |

---

## P1 — High Alerts (1-hour response)

These alerts indicate significant degradation that will impact users if not addressed.

### P1-1: Elevated Error Rate

| Field | Value |
|-------|-------|
| **Condition** | Application error rate exceeds 5% of total requests over a 5-minute window |
| **Source** | Sentry error rate / Edge Function error metrics |
| **Threshold** | > 5% error rate over 5 minutes |
| **Alert channel** | PagerDuty (low-urgency) + Slack `#finance-alerts` |
| **First response** | Review Sentry for top error patterns; check recent deployments; verify dependent service health |
| **Runbook** | `docs/guides/runbooks/elevated-error-rate.md` |

### P1-2: Sync Failure Rate Spike

| Field | Value |
|-------|-------|
| **Condition** | Sync failure rate exceeds 10% of total sync operations over a 5-minute window |
| **Source** | `sync_health_logs` table aggregate query |
| **Threshold** | > 10% failure rate over 5 minutes |
| **Alert channel** | PagerDuty (low-urgency) + Slack `#finance-alerts` |
| **Query** | `SELECT count(*) FILTER (WHERE sync_status = 'failure') * 100.0 / count(*) FROM sync_health_logs WHERE created_at > now() - interval '5 minutes'` |
| **First response** | Check PowerSync service status; review error codes in recent failure logs; check database load |
| **Runbook** | `docs/guides/runbooks/sync-failure-spike.md` |

### P1-3: Database Connection Pool Exhaustion

| Field | Value |
|-------|-------|
| **Condition** | Active database connections exceed 80% of the connection pool maximum |
| **Source** | Supabase dashboard metrics / `pg_stat_activity` |
| **Threshold** | > 80% pool utilization |
| **Alert channel** | PagerDuty (low-urgency) + Slack `#finance-alerts` |
| **First response** | Identify long-running queries; check for connection leaks; consider pool size increase |
| **Runbook** | `docs/guides/runbooks/connection-pool.md` |

### P1-4: Edge Function Sustained Errors

| Field | Value |
|-------|-------|
| **Condition** | Any Edge Function returns 5xx errors for > 5% of invocations over 10 minutes |
| **Source** | Supabase Functions metrics |
| **Threshold** | > 5% 5xx rate over 10 minutes |
| **Alert channel** | Slack `#finance-alerts` |
| **First response** | Check Edge Function logs; verify environment variables; check downstream service health |
| **Runbook** | `docs/guides/runbooks/edge-function-errors.md` |

### P1-5: PowerSync Sync Queue Depth

| Field | Value |
|-------|-------|
| **Condition** | Server-side sync queue depth exceeds 1,000 pending operations |
| **Source** | PowerSync dashboard / custom metrics |
| **Threshold** | > 1,000 pending operations |
| **Alert channel** | Slack `#finance-alerts` |
| **First response** | Check PowerSync service status; verify database write throughput; check for blocked transactions |
| **Runbook** | `docs/guides/runbooks/sync-queue-depth.md` |

---

## P2 — Medium Alerts (4-hour response)

These alerts indicate performance degradation or approaching limits.

### P2-1: Slow Database Queries

| Field | Value |
|-------|-------|
| **Condition** | P95 query latency exceeds 2 seconds over a 15-minute window |
| **Source** | Supabase dashboard / `pg_stat_statements` |
| **Threshold** | P95 > 2,000ms over 15 minutes |
| **Alert channel** | Slack `#finance-alerts` |
| **First response** | Identify slow queries via `pg_stat_statements`; check for missing indexes; review recent migration changes |
| **Runbook** | `docs/guides/runbooks/slow-queries.md` |

### P2-2: Elevated 4xx Client Error Rate

| Field | Value |
|-------|-------|
| **Condition** | 4xx response rate exceeds 15% of total API requests over a 15-minute window |
| **Source** | Edge Function logs / Supabase API metrics |
| **Threshold** | > 15% 4xx rate over 15 minutes |
| **Alert channel** | Slack `#finance-alerts` |
| **First response** | Categorize 4xx errors (401 vs 403 vs 404 vs 422); check for client version mismatch; review auth token expiry patterns |
| **Runbook** | `docs/guides/runbooks/client-errors.md` |

### P2-3: TLS Certificate Expiry Warning

| Field | Value |
|-------|-------|
| **Condition** | Any monitored TLS certificate expires within 14 days |
| **Source** | External uptime monitor / certificate check |
| **Threshold** | Expiry < 14 days |
| **Alert channel** | Slack `#finance-alerts` |
| **First response** | Verify auto-renewal is configured; manually trigger renewal if needed; check DNS records |
| **Runbook** | `docs/guides/runbooks/certificate-renewal.md` |

### P2-4: Sync Latency Degradation

| Field | Value |
|-------|-------|
| **Condition** | P95 sync latency exceeds 5 seconds over a 15-minute window |
| **Source** | `sync_health_logs` aggregate |
| **Threshold** | P95 > 5,000ms over 15 minutes |
| **Query** | `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY sync_duration_ms) FROM sync_health_logs WHERE created_at > now() - interval '15 minutes' AND sync_status = 'success'` |
| **Alert channel** | Slack `#finance-alerts` |
| **First response** | Check PowerSync latency; verify database query performance; check network conditions |
| **Runbook** | `docs/guides/runbooks/sync-latency.md` |

### P2-5: Crash Rate Spike (Per Platform)

| Field | Value |
|-------|-------|
| **Condition** | Crash-free session rate drops below 99% for any platform over a 1-hour window |
| **Source** | Sentry crash-free sessions |
| **Threshold** | < 99% crash-free sessions over 1 hour |
| **Alert channel** | Slack `#finance-alerts` |
| **First response** | Review top crash in Sentry; check if crash correlates with recent release; assess rollback |
| **Runbook** | `docs/guides/runbooks/crash-rate-spike.md` |

---

## P3 — Low Alerts (Next business day)

These alerts indicate non-urgent issues to address during normal working hours.

### P3-1: Disk / Storage Usage

| Field | Value |
|-------|-------|
| **Condition** | Database storage exceeds 70% of plan limit |
| **Source** | Supabase dashboard |
| **Threshold** | > 70% of plan storage |
| **Alert channel** | Slack `#finance-monitoring` |
| **First response** | Review data growth trends; identify large tables; evaluate retention policies; plan storage upgrade if needed |
| **Runbook** | `docs/guides/runbooks/storage-usage.md` |

### P3-2: Dependency Vulnerability Detected

| Field | Value |
|-------|-------|
| **Condition** | Dependabot or CodeQL detects a vulnerability in a production dependency |
| **Source** | GitHub Dependabot alerts / CodeQL scanning |
| **Threshold** | Any HIGH or CRITICAL severity vulnerability |
| **Alert channel** | Slack `#finance-monitoring` + GitHub issue |
| **First response** | Assess vulnerability applicability; check if exploitable in our usage; prioritize upgrade or mitigation |
| **Runbook** | `docs/guides/runbooks/dependency-vulnerability.md` |

### P3-3: Performance Regression

| Field | Value |
|-------|-------|
| **Condition** | Lighthouse CI score drops below 90, or any Core Web Vital exceeds target baseline |
| **Source** | Lighthouse CI in GitHub Actions / `apps/web/lighthouserc.json` |
| **Threshold** | Performance score < 90, or LCP > 2.5s, FID > 100ms, CLS > 0.1 |
| **Alert channel** | Slack `#finance-monitoring` |
| **First response** | Review Lighthouse report diff; identify regression cause in recent changes; add to next sprint if confirmed |
| **Runbook** | `docs/guides/runbooks/performance-regression.md` |

### P3-4: Sync Health Log Retention

| Field | Value |
|-------|-------|
| **Condition** | `sync_health_logs` table contains records older than 30 days (retention policy not enforced) |
| **Source** | Scheduled database query |
| **Threshold** | Any records with `created_at < now() - interval '30 days'` |
| **Query** | `SELECT count(*) FROM sync_health_logs WHERE created_at < now() - interval '30 days'` |
| **Alert channel** | Slack `#finance-monitoring` |
| **First response** | Run retention cleanup job; verify scheduled purge is configured |
| **Runbook** | `docs/guides/runbooks/data-retention.md` |

### P3-5: Elevated RLS Policy Denials

| Field | Value |
|-------|-------|
| **Condition** | Unexpected spike in RLS-denied queries (> 3× baseline) |
| **Source** | PostgreSQL logs / custom monitoring query |
| **Threshold** | > 3× rolling 7-day average |
| **Alert channel** | Slack `#finance-monitoring` |
| **First response** | Identify source queries; check for client bugs or unauthorized access attempts; review recent RLS policy changes |
| **Runbook** | `docs/guides/runbooks/rls-denials.md` |

---

## Alert Configuration Checklist

Before going live with monitoring, verify:

- [ ] All alert channels (PagerDuty, Slack) are configured and tested
- [ ] On-call rotation is established with at least 2 engineers
- [ ] Each P0/P1 alert has a corresponding runbook
- [ ] Alert thresholds are calibrated against baseline metrics from beta
- [ ] Escalation policies handle weekends and holidays
- [ ] Test alerts have been fired and acknowledged in each channel
- [ ] Alert fatigue is addressed — no alert fires more than once per incident
- [ ] De-duplication / auto-resolution is configured for transient issues

---

## Alert Suppression Rules

To prevent alert fatigue:

1. **Maintenance windows** — suppress all P2/P3 alerts during scheduled maintenance; P0/P1 alerts still fire
2. **De-duplication** — same alert condition does not re-fire within its response window
3. **Auto-resolution** — if the condition clears within 5 minutes, auto-resolve with a "recovered" notification
4. **Dependency suppression** — if the health check (P0-1) is firing, suppress downstream alerts (P1-2, P1-3) that are likely caused by the same outage
