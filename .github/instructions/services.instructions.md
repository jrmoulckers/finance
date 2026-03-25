---
applyTo: 'services/**'
---

# Instructions for Backend Services

You are working in the `services/` directory, which contains the consolidated backend.

## Service Subdirectories

- `services/api/` — The single backend API server for data synchronization

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
