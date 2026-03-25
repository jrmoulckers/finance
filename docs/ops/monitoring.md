# Monitoring Infrastructure for Finance Monorepo

This document describes the monitoring setup for the Finance monorepo.

## Error/Crash Reporting

- Use Sentry for web, Crashlytics for mobile, and platform-native tools for desktop.
- All errors are anonymized and PII is redacted.

## Performance Metrics

- Sentry Performance for web, Prometheus for backend, and platform-native metrics for mobile/desktop.
- Track sync durations, query latency, and resource usage.

## Sync Health

- Custom endpoints and synthetic tests monitor sync status.
- Alert on sync failures, high latency, or data conflicts.

## Alerting

- Sentry Alerts, PagerDuty, and Slack integration for incident response.
- Alert routing and escalation policies are documented in the ops runbook.

## Security & Compliance

- PII redaction, secret rotation, and compliance monitoring are enforced.

## Open Questions

- Which monitoring vendors/tools are approved?
- Who is the primary on-call/alert recipient for each platform?
- Are there existing dashboards or alerting policies to migrate?
- What are the SLAs for incident response and uptime?

---

For more, see the platform-specific monitoring guides and docs/architecture/overview.md.
