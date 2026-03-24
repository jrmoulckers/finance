# Production Deployment Checklist

**Status:** Active
**Date:** 2026-03-20
**Related:** [Backend Sync Architecture](../../../docs/architecture/0002-backend-sync-architecture.md) · [Auth Security Architecture](../../../docs/architecture/0004-auth-security-architecture.md) · [Alerting Rules](../../../docs/architecture/alerting-rules.md)
**Tickets:** #615

---

## Overview

Step-by-step checklist for deploying the Finance backend to a production Supabase project. Each section must be completed in order. Do **not** skip steps — a missed configuration will cause silent failures or security gaps.

---

## 1. Pre-deployment Requirements

- [ ] Supabase project created (Pro plan recommended for production)
- [ ] PostgreSQL 15+ with required extensions enabled:
  - `pgcrypto` — password hashing, `gen_random_uuid()`
  - `uuid-ossp` — UUID generation (fallback)
- [ ] PowerSync account and project configured
- [ ] Custom domain provisioned (if applicable) with valid SSL certificate
- [ ] DNS records configured for Supabase project custom domain
- [ ] Backup and point-in-time recovery enabled on the Supabase project

---

## 2. Environment Variables

All Edge Functions require certain environment variables. **Never commit real values to source control.** Use the Supabase Dashboard → Edge Functions → Secrets to configure these.

| Variable                    | Required By                            | Description                                                           |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `SUPABASE_URL`              | All functions                          | Supabase project URL (set automatically by Supabase)                  |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions                          | Service role key (set automatically by Supabase)                      |
| `SUPABASE_ANON_KEY`         | Client apps                            | Anonymous/public key for client-side SDK                              |
| `AUTH_WEBHOOK_SECRET`       | auth-webhook                           | Shared secret for webhook request verification                        |
| `WEBAUTHN_RP_NAME`          | passkey-register                       | Relying Party display name (e.g. "Finance App")                       |
| `WEBAUTHN_RP_ID`            | passkey-register, passkey-authenticate | Relying Party ID — must match the domain (e.g. "finance.example.com") |
| `WEBAUTHN_ORIGIN`           | passkey-register, passkey-authenticate | Expected origin URL (e.g. "https://app.finance.example.com")          |
| `ALLOWED_ORIGINS`           | data-export, sync-health-report        | Comma-separated list of allowed CORS origins                          |
| `CRON_SECRET`               | process-recurring                      | Shared secret for authenticating cron-triggered function calls        |

> **Validation:** All functions use the shared `_shared/env.ts` module (#616) to validate required env vars at startup. Missing variables return a 503 without revealing which are absent.

---

## 3. Supabase Dashboard Configuration

### Auth → Providers

- [ ] **Email** provider enabled (magic link + password)
- [ ] **Apple** OAuth provider configured (client ID, team ID, key ID, private key)
- [ ] **Google** OAuth provider configured (client ID, client secret)
- [ ] Disable any providers not in use

### Auth → Hooks

- [ ] **Custom Access Token Hook** → point to `auth.custom_access_token_hook` PostgreSQL function
  - This injects `household_ids` into the JWT for PowerSync sync rules and RLS
  - Verify the function exists after running migrations (see step 5)

### Auth → URL Configuration

- [ ] **Site URL** set to production app URL
- [ ] **Redirect URLs** include all valid callback URLs:
  - Web app callback URL
  - iOS deep link (e.g. `com.finance.app://callback`)
  - Android deep link (e.g. `com.finance.app://callback`)

### Database → Webhooks

- [ ] Create webhook on `auth.users` table for `INSERT` events
- [ ] Point to the `auth-webhook` Edge Function URL
- [ ] Set the `Authorization: Bearer <AUTH_WEBHOOK_SECRET>` header
- [ ] Verify with a test signup that user provisioning works end-to-end

---

## 4. PowerSync Configuration

- [ ] Upload `services/api/powersync/sync-rules.yaml` to PowerSync dashboard
- [ ] Configure Supabase connection in PowerSync:
  - Connection string (from Supabase Dashboard → Database → Connection string)
  - Replication slot name (default: `powersync`)
  - Publication name (default: `powersync`)
- [ ] Verify bucket definitions match the sync-rules.yaml
- [ ] Test selective replication by creating a test household and confirming data syncs to the client
- [ ] Verify that cross-household data is **not** visible (tenant isolation)

---

## 5. Database Migrations

Run all migrations in order against the production database:

```bash
supabase db push
```

Or apply manually in order:

```bash
supabase migration up
```

Post-migration verification:

- [ ] All migrations applied successfully (check `supabase_migrations.schema_migrations` table)
- [ ] RLS is enabled on **every** table containing user data
- [ ] Verify RLS policies exist on all tables:
  ```sql
  SELECT schemaname, tablename, policyname
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
  ```
- [ ] `auth.custom_access_token_hook` function exists and is configured
- [ ] Seed default data if needed (e.g. default categories):
  ```bash
  supabase db seed
  ```

---

## 6. Edge Function Deployment

Deploy all Edge Functions:

```bash
supabase functions deploy health-check
supabase functions deploy auth-webhook
supabase functions deploy passkey-register
supabase functions deploy passkey-authenticate
supabase functions deploy household-invite
supabase functions deploy data-export
supabase functions deploy account-deletion
```

Post-deployment verification:

- [ ] `health-check` returns HTTP 200 with `{"status":"healthy"}`
- [ ] Test auth flow end-to-end:
  1. Sign up a test user (verify auth-webhook fires and provisions user/household)
  2. Sign in with the test user
  3. Verify JWT contains `household_ids` claim
- [ ] Test passkey registration and authentication (if WebAuthn is configured)
- [ ] Verify CORS headers are correct (test from allowed and disallowed origins)

---

## 7. Monitoring & Alerting

- [ ] Set up health-check monitoring via an external uptime service (e.g. Uptime Robot, Checkly)
  - Endpoint: `https://<project-ref>.supabase.co/functions/v1/health-check`
  - Interval: 60 seconds
  - Alert on: HTTP status ≠ 200 or `status` ≠ `"healthy"`
- [ ] Configure alerting rules per [docs/architecture/alerting-rules.md](../../../docs/architecture/alerting-rules.md)
  - P0: Service outage, auth system down
  - P1: Elevated error rates, sync failures
  - P2: Slow queries, certificate warnings
  - P3: Disk usage, dependency vulnerabilities
- [ ] Verify structured logging is flowing:
  - Check Supabase Dashboard → Edge Functions → Logs
  - Confirm JSON-structured log entries with `timestamp`, `level`, `function`, `requestId`
- [ ] Set up Supabase Database health alerts (connection pool, disk, CPU)

---

## 8. Security Verification

- [ ] Run through MASVS audit checklists:
  - [Storage Audit](../../../docs/architecture/masvs-storage-audit.md)
  - [Network Audit](../../../docs/architecture/masvs-network-audit.md)
  - [Platform Audit](../../../docs/architecture/masvs-platform-audit.md)
  - [Code Audit](../../../docs/architecture/masvs-code-audit.md)
  - [Resilience Audit](../../../docs/architecture/masvs-resilience-audit.md)
- [ ] Verify no secrets committed to the codebase:
  ```bash
  git log --all -p | grep -iE '(secret|password|key|token)=' | head -20
  ```
- [ ] Test RLS policies manually:
  - Authenticate as User A in Household 1
  - Attempt to read/write data from Household 2 — must fail
  - Attempt to read/write data without authentication — must fail
- [ ] Verify CORS configuration rejects disallowed origins
- [ ] Verify webhook secret is validated with constant-time comparison
- [ ] Verify all monetary values stored as BIGINT (cents), never FLOAT/DECIMAL
- [ ] Review [API Security Audit](../../../docs/architecture/security-audit-api-v2.md) findings are addressed

---

## 9. Rollback Procedures

### Rolling Back a Migration

```bash
# Identify the migration to roll back
supabase migration list

# Create a new migration that reverses the changes
supabase migration new rollback_<description>

# Apply the rollback migration
supabase db push
```

> **Warning:** Destructive rollbacks (DROP TABLE, DROP COLUMN) require explicit human approval. Always create a backup before rolling back.

### Rolling Back an Edge Function

```bash
# Re-deploy the previous version from the last known-good commit
git checkout <previous-commit> -- services/api/supabase/functions/<function-name>/
supabase functions deploy <function-name>

# Restore the working tree
git checkout HEAD -- services/api/supabase/functions/<function-name>/
```

### Disabling a Feature Flag

If the feature is gated by a feature flag (stored in the `feature_flags` table or environment variable):

1. Update the flag value in the Supabase Dashboard → Table Editor → `feature_flags`
2. Or remove/update the relevant environment variable in Edge Function Secrets
3. Verify the feature is disabled by testing the affected endpoint

### Emergency Contacts

| Role              | Responsibility                          | Escalation                        |
| ----------------- | --------------------------------------- | --------------------------------- |
| Backend Engineer  | Database, Edge Functions, sync layer    | Primary on-call                   |
| Platform Engineer | CI/CD, infrastructure, DNS              | Secondary on-call                 |
| Security Lead     | Incident response, data breach protocol | Escalation for security incidents |

> **Incident Response:** Follow the [Incident Response Runbook](../../../docs/architecture/incident-response-runbook.md) for all production incidents.
