# Production Environment Provisioning Guide

**Issue:** [#771](https://github.com/jrmoulckers/finance/issues/771)

## Overview

This guide documents the steps to provision a production Supabase project for
the Finance backend. It covers project creation, schema deployment, RLS
verification, Edge Function deployment, PowerSync configuration, and smoke
testing.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [1. Supabase Project Setup](#1-supabase-project-setup)
- [2. Environment Configuration](#2-environment-configuration)
- [3. Database Migration Deployment](#3-database-migration-deployment)
- [4. RLS Policy Verification](#4-rls-policy-verification)
- [5. Edge Function Deployment](#5-edge-function-deployment)
- [6. PowerSync Configuration](#6-powersync-configuration)
- [7. Auth Provider Setup](#7-auth-provider-setup)
- [8. Smoke Testing](#8-smoke-testing)
- [9. Monitoring & Alerting](#9-monitoring--alerting)
- [10. Go-Live Checklist](#10-go-live-checklist)

---

## Prerequisites

| Item                 | Required                                        |
| -------------------- | ----------------------------------------------- |
| Supabase CLI         | v2.0+ (`npx supabase --version`)                |
| Supabase account     | Pro plan or self-hosted                         |
| PowerSync account    | Cloud or self-hosted instance                   |
| Domain name          | For custom Auth redirect URLs                   |
| Apple Developer      | For Apple Sign-In (Bundle ID, Service ID, etc.) |
| Google Cloud Console | For Google Sign-In (Client ID, Client Secret)   |
| DNS access           | For custom domain CNAME/A records               |

---

## 1. Supabase Project Setup

### 1.1 Create the project

```bash
# Via dashboard: https://supabase.com/dashboard/new
# Or via CLI:
supabase projects create "Finance Production" \
  --org-id YOUR_ORG_ID \
  --db-password "$(openssl rand -base64 32)" \
  --region us-east-1
```

### 1.2 Link the local project

```bash
cd services/api
supabase link --project-ref YOUR_PROJECT_REF
```

### 1.3 Record project details

Add to your secrets manager (never commit):

- **Project Ref**: `YOUR_PROJECT_REF`
- **API URL**: `https://YOUR_PROJECT_REF.supabase.co`
- **Anon Key**: from Supabase Dashboard → Settings → API
- **Service Role Key**: from Supabase Dashboard → Settings → API
- **Database URL**: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`

---

## 2. Environment Configuration

Create production secrets in Supabase Dashboard → Edge Functions → Secrets:

| Secret                      | Description                             | Example                                 |
| --------------------------- | --------------------------------------- | --------------------------------------- |
| `SUPABASE_URL`              | Set automatically                       | `https://xxx.supabase.co`               |
| `SUPABASE_SERVICE_ROLE_KEY` | Set automatically                       | `eyJ...`                                |
| `AUTH_WEBHOOK_SECRET`       | Shared secret for auth webhook          | `openssl rand -hex 32`                  |
| `JWT_SECRET`                | JWT signing secret                      | From Dashboard → Settings → API         |
| `WEBAUTHN_RP_NAME`          | Relying Party name for passkeys         | `Finance`                               |
| `WEBAUTHN_RP_ID`            | Relying Party ID (domain)               | `app.finance.example.com`               |
| `WEBAUTHN_ORIGIN`           | WebAuthn origin URL                     | `https://app.finance.example.com`       |
| `ALLOWED_ORIGINS`           | Comma-separated CORS origins            | `https://app.finance.example.com`       |
| `CRON_SECRET`               | Secret for cron-triggered functions     | `openssl rand -hex 32`                  |
| `ADMIN_EMAILS`              | Comma-separated admin email addresses   | `admin@finance.example.com`             |
| `POWERSYNC_URL`             | PowerSync instance URL                  | `https://xxx.powersync.journeyapps.com` |
| `POWERSYNC_PUBLIC_KEY`      | PowerSync public key for JWT validation | `-----BEGIN PUBLIC KEY-----...`         |

> ⚠️ **NEVER** commit real values. Use `services/api/.env.example` as a template.

---

## 3. Database Migration Deployment

### 3.1 Review migrations

```bash
# List all pending migrations
supabase db diff --linked

# Dry-run to preview changes
supabase db push --dry-run
```

### 3.2 Deploy migrations

```bash
# Apply all migrations in order
supabase db push

# Verify migration status
supabase migration list
```

### 3.3 Verify schema

```bash
# Connect to production DB (via pooler)
psql "$DATABASE_URL" -c "\dt public.*"
```

Expected tables:

- `users`, `households`, `household_members`
- `accounts`, `categories`, `transactions`
- `budgets`, `goals`
- `passkey_credentials`, `household_invitations`
- `webauthn_challenges`, `audit_log`
- `sync_health_logs`, `data_export_audit_log`
- `rate_limits`
- `recurring_transaction_templates`
- `notification_preferences`, `notification_log`
- `webhook_endpoints`, `webhook_delivery_log`

---

## 4. RLS Policy Verification

Run the RLS verification script after migration:

```bash
# From the services/api directory:
psql "$DATABASE_URL" -f supabase/tests/rls-verification.sql
```

The script verifies:

1. **RLS is enabled** on every table containing user data
2. **No tables are unprotected** (lists any table with RLS disabled)
3. **Policy completeness** (SELECT, INSERT, UPDATE, DELETE per table)
4. **Household isolation** (no cross-household data leaks)
5. **Service-only tables** (rate_limits, audit_log inserts are service-role-only)

### Manual verification checklist

- [ ] `SELECT * FROM pg_tables WHERE schemaname = 'public'` — all listed
- [ ] `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` — all `true`
- [ ] `SELECT * FROM pg_policies` — policies exist for all tables
- [ ] Test with anon key — should get 0 rows from all tables
- [ ] Test with authenticated user — should see only own data

---

## 5. Edge Function Deployment

### 5.1 Deploy all functions

```bash
cd services/api

# Deploy all functions at once
supabase functions deploy auth-webhook --no-verify-jwt
supabase functions deploy health-check --no-verify-jwt
supabase functions deploy passkey-register
supabase functions deploy passkey-authenticate
supabase functions deploy household-invite
supabase functions deploy data-export
supabase functions deploy account-deletion
supabase functions deploy sync-health-report
supabase functions deploy process-recurring --no-verify-jwt
supabase functions deploy manage-webhooks
supabase functions deploy admin-dashboard
supabase functions deploy send-notification
```

> Note: `--no-verify-jwt` is used for `auth-webhook` (called by Supabase Auth),
> `health-check` (public endpoint), and `process-recurring` (called by cron).

### 5.2 Verify deployment

```bash
supabase functions list
```

---

## 6. PowerSync Configuration

### 6.1 Connect PowerSync to Supabase

In PowerSync Dashboard:

1. Set **Database URL** to the Supabase pooler connection string
2. Upload `services/api/powersync/sync-rules.yaml`
3. Set **JWT Audience** to match your Supabase project
4. Configure **JWT Public Key** from Supabase Dashboard → Settings → API → JWT Secret

### 6.2 Deploy sync rules

```bash
# If using PowerSync CLI:
powersync deploy --sync-rules services/api/powersync/sync-rules.yaml
```

### 6.3 Verify sync

- Check PowerSync Dashboard for connection status
- Verify bucket definitions (`by_household`, `user_profile`) are active
- Test with a development client to confirm data replication

---

## 7. Auth Provider Setup

Configure in Supabase Dashboard → Auth → Providers:

### 7.1 Email/Password

- Enable email confirmations
- Set password minimum length to 8+
- Enable email change confirmation

### 7.2 Apple Sign-In

- Bundle ID from Apple Developer Portal
- Service ID, Team ID, Key ID, Private Key

### 7.3 Google Sign-In

- Client ID + Client Secret from Google Cloud Console
- Set redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

### 7.4 Custom Access Token Hook

- Dashboard → Auth → Hooks → Custom Access Token
- Select: `auth.custom_access_token_hook`
- This embeds `household_ids` into every JWT for RLS

### 7.5 URL Configuration

- **Site URL**: `https://app.finance.example.com`
- **Redirect URLs**:
  - `com.finance.app://auth/callback` (mobile deep link)
  - `https://app.finance.example.com/auth/callback` (web)

---

## 8. Smoke Testing

Run the smoke test script after deployment:

```bash
cd services/api
./scripts/smoke-test.sh
```

Or run individual checks:

```bash
# 1. Health check (public, no auth)
curl -s https://YOUR_PROJECT_REF.supabase.co/functions/v1/health-check | jq .

# Expected: { "status": "healthy", "services": { "database": "connected", "auth": "operational" } }

# 2. Database connectivity
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"

# 3. RLS enforcement (anon key should return empty)
curl -s https://YOUR_PROJECT_REF.supabase.co/rest/v1/users \
  -H "apikey: ANON_KEY" \
  -H "Authorization: Bearer ANON_KEY" | jq .

# Expected: []

# 4. Rate limiting (call health-check 61 times rapidly)
# Expected: 429 after 60 calls within 60 seconds

# 5. Auth webhook (sign up a test user)
# Verify user row, household, and membership are created

# 6. PowerSync connection
# Check PowerSync dashboard for active connection
```

---

## 9. Monitoring & Alerting

### 9.1 Supabase Dashboard

- Database → Health: connection pool, active queries
- Auth → Users: registration rate
- Edge Functions → Logs: invocation errors

### 9.2 External monitoring

- Set up uptime monitor on `/functions/v1/health-check`
- Alert on HTTP 503 (degraded) responses
- Monitor `sync_health_logs` for failure rate spikes

### 9.3 Scheduled maintenance

The `run_all_maintenance()` function should be called daily via:

- pg_cron (if available on your plan): `SELECT cron.schedule('nightly-maintenance', '0 3 * * *', 'SELECT run_all_maintenance()')`
- Or a scheduled Edge Function call with `CRON_SECRET`

---

## 10. Go-Live Checklist

### Security

- [ ] All tables have RLS enabled (verified by rls-verification.sql)
- [ ] No wildcard CORS (`ALLOWED_ORIGINS` is set to specific domains)
- [ ] `AUTH_WEBHOOK_SECRET` and `CRON_SECRET` are strong random values
- [ ] Service role key is never exposed to clients
- [ ] Database password is stored in secrets manager
- [ ] SSL/TLS enforced on all connections

### Database

- [ ] All migrations applied (`supabase migration list` shows all green)
- [ ] Indexes verified for query performance
- [ ] Triggers active (balance recalculation, updated_at)
- [ ] Cleanup functions scheduled (soft-delete purge, audit log rotation)

### Auth

- [ ] Email/Password provider enabled
- [ ] Apple Sign-In configured (if targeting iOS)
- [ ] Google Sign-In configured
- [ ] Custom access token hook active
- [ ] Redirect URLs configured for all platforms

### Edge Functions

- [ ] All 12 functions deployed and responding
- [ ] Health check returns "healthy"
- [ ] Rate limiting active (429 on excess calls)
- [ ] CORS headers correct for production origin

### Sync

- [ ] PowerSync connected to production database
- [ ] Sync rules deployed (`by_household`, `user_profile` buckets)
- [ ] Client SDKs pointed to production PowerSync instance
- [ ] Test sync from a real device

### Backup & Recovery

- [ ] Point-in-time recovery enabled (Supabase Pro plan)
- [ ] Daily backup schedule verified
- [ ] Recovery procedure documented and tested

### Monitoring

- [ ] Uptime monitor on health-check endpoint
- [ ] Error alerting configured
- [ ] Sync health monitoring active
