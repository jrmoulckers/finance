# ADR-0011: Scaling Architecture — Horizontal Scaling, Database Sharding, CDN

**Status:** Proposed
**Date:** 2025-07-27
**Author:** System Architect (AI agent)
**Reviewers:** Pending human review
**Sprint:** S9

## Context

Finance V1 targets a single-VPS deployment (2 vCPU / 4 GB RAM, ~$10–20/mo, ADR-0007). The edge-first architecture means **the server is not in the hot path** — users read/write locally; the server handles background sync, auth, and webhooks. This gives 10x more capacity per user than traditional apps. But scaling to 100K+ users (ADR-0009 freemium) requires planning.

## Decision

Adopt a **phased 4-tier scaling architecture**, each triggered by monitoring thresholds.

### Tier 1: Vertical Scaling (100–1K users)

- Upgrade VPS to 4 vCPU / 8 GB (~$20–40/mo)
- PgBouncer connection pooling (transaction mode, 50 pool size)
- Caddy response caching for static API responses

### Tier 2: Read Replicas + Service Separation (1K–10K users)

- PostgreSQL primary + async streaming read replica
- PowerSync on dedicated VPS
- Redis for session caching and rate limiting
- Cost: ~$40–80/mo

### Tier 3: Horizontal Scaling + Sharding (10K–100K users)

- **Database sharding by `household_id`** via Citus PostgreSQL extension
- Stateless API nodes behind load balancer
- PowerSync cluster with consistent hashing by household_id

**Why `household_id` is the ideal shard key:**

1. All queries already filtered by `household_id` (RLS, sync rules) — no cross-shard queries
2. UUIDs distribute uniformly across shards
3. All household data colocated — efficient JOINs
4. PowerSync `by_household` bucket maps 1:1 to shards

```sql
SELECT create_distributed_table('transactions', 'household_id');
SELECT create_distributed_table('accounts', 'household_id');
SELECT create_distributed_table('budgets', 'household_id');
SELECT create_reference_table('exchange_rates');
SELECT create_reference_table('users');
```

Cost: ~$100–200/mo

### Tier 4: Multi-Region (100K–1M users)

- Read replicas in 2–3 regions (US, EU, APAC)
- Regional PowerSync instances with geo-routing
- CDN for static assets and AI models

### CDN Architecture

- **Tier 1+:** Static assets (web bundle, fonts, icons), AI model artifacts
- **Tier 2+:** API response caching (exchange rates, institution lists)
- Provider: Cloudflare (free tier for Tier 1–2)

## Alternatives Considered

### Alternative 1: Application-Level Sharding

- **Pros:** No extension dependency.
- **Cons:** Routing logic in every query; scatter-gather for cross-shard; major engineering effort.

### Alternative 2: NoSQL (DynamoDB / MongoDB)

- **Pros:** Native horizontal scaling.
- **Cons:** Loses SQL aggregations; breaks PowerSync/RLS; full data layer rewrite.

### Alternative 3: Kubernetes from Start

- **Pros:** Automated scaling, self-healing.
- **Cons:** $50–100/mo minimum; massive ops complexity; overkill until Tier 3.

## Consequences

### Positive

- No rewrite — each tier extends previous; Citus extends PostgreSQL
- Edge-first multiplier — 10x fewer requests per user
- Natural shard key — zero application changes for sharding
- Cost-proportional — $10/mo at Tier 1, $200/mo at Tier 3

### Negative

- Citus dependency (mitigated: open-source, Azure-available)
- Growing operational complexity per tier
- Cross-shard admin queries slower

### Risks

| Risk                           | Likelihood | Impact | Mitigation                                |
| ------------------------------ | ---------- | ------ | ----------------------------------------- |
| Premature scaling              | Medium     | Low    | Strict monitoring triggers                |
| Citus + Supabase compatibility | Medium     | Medium | Test before Tier 3; fallback: app routing |
| PowerSync horizontal support   | Low        | High   | PowerSync Cloud managed; sticky sessions  |

## Implementation Notes

### Monitoring Triggers

```yaml
tier_1_to_2:
  - postgresql_connections > 80 for 1h
  - sync_lag_p95 > 5s for 30m
  - vps_cpu > 70% for 2h
tier_2_to_3:
  - write_latency_p95 > 50ms for 1h
  - websocket_connections > 8000
```

## References

- [ADR-0002: Backend & Sync Architecture](./0002-backend-sync-architecture.md)
- [ADR-0007: Hosting Strategy](./0007-hosting-strategy.md)
- [Citus Documentation](https://docs.citusdata.com/)
- [PgBouncer](https://www.pgbouncer.org/)
- [Cloudflare CDN](https://www.cloudflare.com/cdn/)
