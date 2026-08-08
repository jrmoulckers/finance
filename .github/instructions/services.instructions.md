---
applyTo: 'services/**'
---

# Instructions for Backend Services

You are working in the `services/` directory, which contains the consolidated backend.

## Service Subdirectories

- `services/api/` — The single backend API server for data synchronization

## Prepared Backend Ownership Seams (Not Active)

Current runtime ownership remains with `@backend-engineer` and `@devops-engineer` until canonical activation. The prepared post-activation split is:

| Future owner         | Finance scope                                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@backend-engineer`  | `services/api/supabase/functions/**`, authentication and API behavior, shared Edge Function utilities, OpenAPI, request validation, CORS, rate limiting, and non-database service code; reviews Auth/Function sections of `services/api/supabase/config.toml`                                              |
| `@database-engineer` | `services/api/supabase/migrations/**`, `services/api/supabase/seed.sql`, `services/api/supabase/tests/**`, `services/api/powersync/sync-rules.yaml`, and database backup/volume definitions under `deploy/backup/` and `deploy/volumes/db/`; leads `services/api/supabase/config.toml` with backend review |
| `@sre-engineer`      | Reliability semantics for `services/api/monitoring/**`, `deploy/monitoring/**`, SLOs, alerts, incidents, rollback, capacity, disaster recovery, and backup/restore verification                                                                                                                            |
| `@devops-engineer`   | CI/build/delivery automation and remaining deployment mechanics; does not redefine database correctness or reliability policy                                                                                                                                                                              |

Backend code implements database and reliability contracts, but schema/RLS decisions require database review and SLO/alert/recovery decisions require SRE review.

## Guidelines

- The backend exists primarily for data synchronization, NOT for business logic
- Keep the API surface minimal — thin sync endpoints, authentication, and user management
- All endpoints must be authenticated and authorized
- Use rate limiting and input validation on every endpoint
- Never store or process more data than necessary (data minimization principle)
- Encrypt all financial data at rest and in transit
- Write integration tests for all API endpoints
- Document all API endpoints with OpenAPI/Swagger specifications
- Design for horizontal scalability — stateless request handling
- Use structured logging (JSON) — NEVER log sensitive financial data
- Support graceful degradation when downstream services are unavailable

## Supabase Backend

- The backend is **Supabase** — PostgreSQL database + Supabase Auth + Edge Functions
- All tables **must** have Row-Level Security (RLS) policies — no exceptions, even for internal/admin tables
- Never return raw financial data — always filter through RLS so users only see their own data
- Edge Functions are written in **TypeScript** running on the **Deno** runtime
- Database migrations must be versioned (sequential numbering) and reversible (include both `up` and `down` SQL)
- Every forward migration under `migrations/` must have the matching `migrations/down/<timestamp>_<name>.down.sql`; never execute destructive migration operations against staging or production from an agent session
- Store monetary amounts as `BIGINT` integer minor units with an explicit ISO 4217 currency code/scale; never use floating-point database types for money
- Use `owner_id` for attribution and owner-protected operations; authorize shared household reads/writes through verified household membership and role. Test permitted owner and co-member paths plus outsider, cross-user, and cross-household denials for every RLS change
- Use parameterized queries and validated identifiers at every SQL/API trust boundary

## Schema Alignment Decisions

The following additions are approved and must be applied as versioned migrations:

- **transactions**: `transfer_transaction_id UUID REFERENCES transactions(id)` (nullable) and `recurring_rule_id UUID REFERENCES recurring_rules(id)` (nullable)
- **budgets**: `is_rollover BOOLEAN NOT NULL DEFAULT false`
- **goals**: `account_id UUID REFERENCES accounts(id)` (nullable), `status TEXT NOT NULL DEFAULT 'active'` with CHECK IN ('active','completed','archived')
- **All sync-enabled tables**: `owner_id UUID REFERENCES auth.users(id) NOT NULL` and `sync_version BIGINT NOT NULL DEFAULT 0` and `is_synced BOOLEAN NOT NULL DEFAULT false`

Migration naming convention: `YYYYMMDDHHMMSS_<description>.sql` (e.g., `20260325000001_align_schema_transactions_budgets_goals.sql`)

## PowerSync Integration

- **PowerSync** sync rules define what data syncs to each client — configure in sync rules YAML
- Sync is bidirectional: local SQLite ↔ PowerSync ↔ Supabase PostgreSQL
- Conflict resolution uses last-write-wins (LWW) for simple fields with custom merge logic for complex data
- Serialize each cloud schema or sync-rule change with the matching client SQLDelight/model change. After activation, `@database-engineer` leads the cloud side and `@native-app-engineer` leads the client side; `@finance-domain` reviews any money semantics

## Feature Flags

- Feature flags are managed via a PostgreSQL `feature_flags` table synced to clients through PowerSync
- Flags sync to client devices for runtime evaluation — no server round-trip needed for flag checks
- Use feature flags for gradual rollouts, A/B testing, and platform-specific feature gating

## Reliability and Data Protection Handoffs

- API and sync health signals may contain status, latency, counts, and classified errors only; never include raw financial records, account identifiers, access tokens, or PII.
- Backup work is incomplete without a restore-verification procedure. Production restore, deployment, and infrastructure mutation remain human-gated.
- Compliance deletion and residency analysis must cover both on-device copies and synchronized Supabase/PowerSync copies.

## Environment Configurations

Three environments are supported with per-environment configuration:

- **debug** — Local development, verbose logging, mock data allowed
- **staging** — Pre-release testing against staging Supabase project
- **release** — Production Supabase project, no debug logging
