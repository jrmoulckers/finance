# ADR-0013: Multi-Tenancy Architecture — Household Isolation, Enterprise Accounts, Data Partitioning

**Status:** Proposed
**Date:** 2025-07-27
**Author:** System Architect (AI agent)
**Reviewers:** Pending human review
**Sprint:** S11

## Context

Finance's tenant model centers on the **household** (ADR-0004, sync-rules.yaml). Extensions needed:

1. **Stronger isolation** — JWT-embedded claims replacing application-level SET context
2. **Enterprise/advisor accounts** — Optional organization layer above households
3. **Data partitioning** — GDPR data residency for multi-region deployments

## Decision

Extend with **optional organization layer**, **JWT-embedded tenant context**, and **region-aware partitioning**.

### 1. JWT-Embedded Tenant Context

```json
{
  "sub": "user-uuid",
  "household_memberships": [
    { "household_id": "hh-1", "role": "owner" },
    { "household_id": "hh-2", "role": "member" }
  ],
  "org_memberships": [{ "org_id": "org-1", "role": "org_advisor" }],
  "data_region": "eu-west"
}
```

```sql
CREATE POLICY transactions_isolation ON transactions
  FOR ALL USING (
    household_id IN (
      SELECT (claim->>'household_id')::uuid
      FROM jsonb_array_elements(
        current_setting('request.jwt.claims', true)::jsonb->'household_memberships'
      ) AS claim
    )
  );
```

Advantages: cryptographically signed, no forgotten SET, built-in audit trail.

### 2. Organization Layer

```
Organization (optional, for advisors/enterprises)
├── OrgOwner, OrgAdmin, OrgAdvisor, OrgBilling
├── Household A (linked), Household B (linked)
└── Org Settings: billing, audit logs, defaults
```

**Households remain the data isolation boundary.** Organizations are access-control only.

**Critical: org members can NEVER modify financial data — read-only access.**

| Permission                | OrgOwner | OrgAdmin | OrgAdvisor    | OrgBilling |
| ------------------------- | -------- | -------- | ------------- | ---------- |
| View households           | ✅ All   | ✅ All   | Assigned only | ❌         |
| View financial data       | ✅ All   | ✅ All   | Assigned only | ❌         |
| **Modify financial data** | **❌**   | **❌**   | **❌**        | **❌**     |
| Manage org members        | ✅       | ✅       | ❌            | ❌         |
| Manage billing            | ✅       | ❌       | ❌            | ✅         |
| View audit logs           | ✅       | ✅       | Own only      | ❌         |

### 3. Organization Data Model

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'advisor_basic',
    max_households INT NOT NULL DEFAULT 10,
    data_region TEXT NOT NULL DEFAULT 'us-east',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);

CREATE TABLE org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('org_owner','org_admin','org_advisor','org_billing')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ,
    UNIQUE (org_id, user_id)
);

CREATE TABLE org_household_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    household_id UUID NOT NULL REFERENCES households(id),
    assigned_advisor_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ,
    UNIQUE (org_id, household_id)
);

CREATE TABLE org_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    actor_id UUID NOT NULL REFERENCES users(id),
    action TEXT NOT NULL, target_household_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4. Data Region Partitioning (Tier 4)

Households assigned to regions at creation (IP geolocation). Global coordinator routes to regional PostgreSQL + PowerSync instances. **Design now, implement at Tier 4 (ADR-0011).**

### 5. Isolation Verification

Automated canary queries in CI and production detect orphaned records and cross-tenant leaks.

### 6. Sync: New `by_organization` Bucket

```yaml
by_organization:
  parameters:
    - SELECT org_id FROM org_members
      WHERE user_id = token_parameters.user_id AND deleted_at IS NULL
  data:
    - SELECT id, name, slug, plan, max_households, data_region
      FROM organizations WHERE id = bucket.org_id AND deleted_at IS NULL
    - SELECT id, org_id, user_id, role FROM org_members
      WHERE org_id = bucket.org_id AND deleted_at IS NULL
    - SELECT id, org_id, household_id, assigned_advisor_id
      FROM org_household_assignments
      WHERE org_id = bucket.org_id AND deleted_at IS NULL
```

## Alternatives Considered

### Alternative 1: Database-Per-Tenant

- **Pros:** Strongest isolation.
- **Cons:** Thousands of databases; PowerSync needs one each; impractical.

### Alternative 2: Schema-Per-Tenant

- **Pros:** Good isolation in single DB.
- **Cons:** Linear management growth; incompatible with Citus sharding.

### Alternative 3: No Organization Layer

- **Pros:** Simpler.
- **Cons:** No advisor grouping; no bulk ops; no org billing; no audit trail.

## Consequences

### Positive

- Backward compatible — org layer is optional
- Defense-in-depth — JWT + RLS + app checks = three isolation barriers
- Advisor use case unlocked with read-only access + audit logging
- GDPR-ready regional partitioning design

### Negative

- Two RBAC systems to compose correctly
- JWT size growth (mitigate: ID refs, cached endpoint)
- Third sync bucket adds complexity

### Risks

| Risk                     | Likelihood | Impact   | Mitigation                                |
| ------------------------ | ---------- | -------- | ----------------------------------------- |
| JWT exceeds header limit | Medium     | Medium   | Use ID refs; cached detail endpoint       |
| RLS policy bugs          | Medium     | Critical | Automated canary tests; manual review     |
| Privilege escalation     | Low        | Critical | Org RLS is SELECT-only; no write policies |

## Implementation Notes

```
Phase 1 (V2):   JWT household claims → stronger RLS
Phase 2 (V2.1): Organization tables + sync bucket
Phase 3 (Tier 4): Regional data partitioning
```

## References

- [ADR-0004: Auth & Security Architecture](./0004-auth-security-architecture.md)
- [ADR-0011: Scaling Architecture](./0011-scaling-architecture.md)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [GDPR Data Residency](https://gdpr-info.eu/)
