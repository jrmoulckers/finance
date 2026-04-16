# Implementation Guides

Infrastructure implementation specifications for the Finance app, organized by sprint.

## Sprint 1 — Application Configuration

| Guide                                                               | Issue | Status  |
| ------------------------------------------------------------------- | ----- | ------- |
| [Feature Flag System](./885-feature-flags.md)                       | #885  | Planned |
| [Per-Platform Environment Builds](./891-per-platform-env-builds.md) | #891  | Planned |

## Sprint 2 — Deployment Infrastructure

| Guide                                                               | Issue | Status  |
| ------------------------------------------------------------------- | ----- | ------- |
| [PowerSync Docker Compose](./881-powersync-docker-compose.md)       | #881  | Planned |
| [Staging Environment on VPS](./883-staging-environment.md)          | #883  | Planned |
| [GitHub Actions Environments](./892-github-actions-environments.md) | #892  | Planned |

## Sprint 3 — Observability & Launch Readiness

| Guide                                                                 | Issue | Status  |
| --------------------------------------------------------------------- | ----- | ------- |
| [Automated Encrypted Database Backups](./900-encrypted-db-backups.md) | #900  | Planned |
| [Launch Readiness Dashboard](./894-launch-readiness-dashboard.md)     | #894  | Planned |
| [Uptime Kuma Monitoring](./887-uptime-kuma-monitoring.md)             | #887  | Planned |

## Conventions

- Each guide is self-contained with architecture diagrams (Mermaid), step-by-step instructions, configuration templates, and verification steps.
- Configuration templates use placeholder values (`YOUR_*_HERE`) — never real secrets.
- All guides reference existing ADRs and align with the project's edge-first, privacy-first principles.
- SQL migrations use the project's timestamp naming convention (`YYYYMMDDHHMMSS_description.sql`).
