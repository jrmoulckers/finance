# ADR-0007: Hosting Strategy

**Status:** Accepted
**Date:** 2025-06-30
**Author:** @docs-writer (AI agent), with human direction
**Reviewers:** Human project owner

## Context

The Finance app requires hosting for two core backend services:

1. **Supabase** — PostgreSQL database, Auth (passkeys + OAuth), and Edge Functions for server-side logic.
2. **PowerSync** — The offline-first sync engine that keeps local SQLite databases on each client in sync with the central PostgreSQL database.

Cost is a major factor. This is a personal/family finance application built as a bootstrapped side-project, not a venture-funded startup. The hosting solution must be affordable for long-term operation (years) while remaining reliable enough for daily financial tracking. The system must also support automated backups, since the data (personal financial records) is irreplaceable.

## Decision

Self-host both Supabase and PowerSync on a Virtual Private Server (VPS) using Docker Compose, targeting a monthly cost of approximately **$10–20/mo**.

The VPS provider will be selected from cost-effective options such as Hetzner or DigitalOcean based on pricing, region availability, and reliability. Both Supabase and PowerSync publish official Docker images and support self-hosted deployments.

## Alternatives Considered

### Alternative 1: Managed Cloud (Supabase Pro + PowerSync Cloud)

- **Pros:** Zero DevOps overhead, automatic updates and patching, managed backups, official support channels, high availability out of the box.
- **Cons:** Significantly more expensive at approximately **$74/mo** ($25/mo Supabase Pro + $49/mo PowerSync Cloud). Over a year this totals ~$888, which is disproportionate for a personal-use app. Costs scale further with usage.

### Alternative 2: Fully Custom Backend

- **Pros:** Maximum control over every component, no dependency on third-party platforms, can tailor every aspect to exact requirements.
- **Cons:** Enormous development effort — requires building auth, database management, sync protocol, API layer, and operational tooling from scratch. Completely impractical for a solo/small-team project that aims to ship a multi-platform app.

## Consequences

### Positive

- **Low cost:** $10–20/mo is sustainable indefinitely for a personal/family project, roughly 4–7× cheaper than managed alternatives.
- **Full control:** Complete access to configuration, logs, data, and infrastructure. No vendor lock-in on hosting.
- **Learning opportunity:** Builds DevOps skills that benefit the broader project and future work.
- **Data sovereignty:** Financial data stays on infrastructure the owner controls, aligning with the project's privacy-first principles.

### Negative

- **Operational responsibility:** The owner is responsible for server maintenance, security patches, OS updates, and monitoring uptime.
- **Manual upgrades:** Supabase and PowerSync version upgrades must be applied manually (via Docker image updates), rather than happening automatically.
- **No SLA:** There is no vendor-backed uptime guarantee. However, the app is designed to be fully functional offline, so brief server downtime only delays sync — it does not block usage.

### Risks

- **Data loss from misconfigured backups.** *Mitigation:* Automated daily database backups with off-site storage (e.g., S3-compatible object storage or a secondary VPS). Backup restoration tested periodically.
- **Security exposure from unpatched services.** *Mitigation:* Automated security updates for the host OS (unattended-upgrades), Docker image update alerts, and firewall rules restricting access to only necessary ports.
- **Single point of failure (single VPS).** *Mitigation:* Acceptable for a personal app given the offline-first architecture. If the server goes down, clients continue working locally and sync when it recovers. Can scale to multi-node later if needed.

## Implementation Notes

- **Docker Compose** orchestrates all services: Supabase (PostgreSQL, GoTrue auth, PostgREST, Storage, Edge Functions runtime), PowerSync, and a reverse proxy (Caddy or Traefik) for TLS termination.
- **VPS sizing:** Start with a 2 vCPU / 4 GB RAM instance, which is sufficient for single-user/family-scale traffic. Scale vertically if needed.
- **Backups:** A cron job runs `pg_dump` daily and uploads the encrypted dump to off-site storage. Retention policy: 7 daily + 4 weekly + 3 monthly snapshots.
- **Monitoring:** Lightweight monitoring via Uptime Kuma or similar self-hosted tool, with alerts sent to email or a messaging webhook.
- **Infrastructure as Code:** The Docker Compose configuration and setup scripts will live in `services/infrastructure/` in the monorepo, ensuring the entire server can be reproduced from a single `docker compose up`.

## References

- [ADR-0002: Backend & Sync Architecture](0002-backend-sync-architecture.md) — Decided on Supabase + PowerSync as backend stack
- [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting)
- [PowerSync Self-Hosting Docs](https://docs.powersync.com/self-hosting)
- [Hetzner Cloud](https://www.hetzner.com/cloud) — Primary VPS provider candidate
- [DigitalOcean Droplets](https://www.digitalocean.com/products/droplets) — Alternative VPS provider
