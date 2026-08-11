# Architecture Decision Records

Durable decision records for finance. The obligation to keep them is `ENG-ARCH-003`
(durable decisions) — see the
[ratified principles](https://github.com/jrmoulckers/engineering/blob/main/principles/architecture/boundaries-and-contracts.md).
This file is the index and the numbering convention; it does not restate the rule.

## Convention

```text
docs/architecture/NNNN-kebab-slug.md
```

One flat directory, one shared number space, four-digit zero-padded numbers assigned in
sequence. Numbers are never reused and never renumbered once referenced elsewhere — the
sole exception is the 0017 collision recorded below. Start from
[`adr-template.md`](./adr-template.md).

> **Confirmed.** `docs/architecture/NNNN-kebab-slug.md` is the studio convention, not a
> provisional local choice — confirmed by the engineering repo, which uses it itself. finance
> already matched it: 22 of these 25 records used the form before reconciliation, and it agrees
> with
> [`jrmoulckers/.github`](https://github.com/jrmoulckers/.github/blob/main/docs/architecture/0003-four-authority-topology.md).
> No further migration is pending.

## Index

| ADR                                                      | Title                                    | Status             |
| -------------------------------------------------------- | ---------------------------------------- | ------------------ |
| [0001](./0001-cross-platform-framework.md)               | Cross-Platform Framework                 | Accepted           |
| [0002](./0002-backend-sync-architecture.md)              | Backend & Sync Architecture              | Accepted           |
| [0003](./0003-local-storage-strategy.md)                 | Local Storage Strategy                   | Accepted           |
| [0004](./0004-auth-security-architecture.md)             | Auth & Security Architecture             | Accepted           |
| [0005](./0005-design-system-approach.md)                 | Design System Approach                   | Accepted           |
| [0006](./0006-cicd-strategy.md)                          | CI/CD Strategy                           | Accepted           |
| [0007](./0007-hosting-strategy.md)                       | Hosting Strategy                         | Accepted           |
| 0008                                                     | _never issued_                           | —                  |
| [0009](./0009-legal-monetization-analysis.md)            | Legal & Monetization Analysis            | Accepted           |
| [0010](./0010-v2-architecture-vision.md)                 | V2 Architecture Vision                   | Proposed           |
| [0011](./0011-scaling-architecture.md)                   | Scaling Architecture                     | Proposed           |
| [0012](./0012-api-versioning-strategy.md)                | API Versioning Strategy                  | Superseded by 0026 |
| [0013](./0013-multi-tenancy-architecture.md)             | Multi-Tenancy Architecture               | Proposed           |
| [0014](./0014-ai-ml-pipeline-architecture.md)            | AI/ML Pipeline Architecture              | Proposed           |
| [0015](./0015-premium-architecture.md)                   | Premium/Freemium Architecture            | Proposed           |
| [0016](./0016-gamification-system.md)                    | Gamification System Design               | Proposed           |
| [0017](./0017-web-sqlite-encryption.md)                  | Web SQLite Encryption at Rest            | Proposed           |
| [0018](./0018-offline-conflict-resolution.md)            | Offline-First Conflict Resolution        | Proposed           |
| [0019](./0019-schema-migration-strategy.md)              | Migration & Schema Evolution Strategy    | Proposed           |
| [0020](./0020-observability-architecture.md)             | Monitoring & Observability Architecture  | Proposed           |
| [0021](./0021-web-kmp-data-layer-integration.md)         | Web/KMP Data Layer Integration           | Proposed           |
| [0022](./0022-conflict-resolution-beyond-lww.md)         | Conflict Resolution Beyond LWW           | Proposed           |
| [0023](./0023-structured-error-handling.md)              | Structured Error Handling                | Proposed           |
| [0024](./0024-sqldelight-server-migration-versioning.md) | SQLDelight & Server Migration Versioning | Proposed           |
| [0025](./0025-multi-currency-architecture.md)            | Multi-Currency Architecture              | Proposed           |
| [0026](./0026-api-versioning-strategy.md)                | API Versioning Strategy (Enhanced)       | Proposed           |

## Numbering history

Two schemes once coexisted — a flat `docs/architecture/NNNN-*.md` set and a nested
`docs/architecture/adr/adr-NNNN-*.md` set — sharing one number space. **Both claimed 0017.** The nested `adr-0017-web-sqlite-encryption` (2025-07-20) claimed the number
first and kept it; `0017-api-versioning-strategy` (2025-07-28) was renumbered to
**0026**. The three nested records (0015, 0016, 0017) were flattened into this
directory and `adr/` was removed.

0008 was never issued. It is not a lost record and must not be backfilled — the next
ADR takes 0027.
