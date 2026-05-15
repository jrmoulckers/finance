# Incident Response Runbook

**Status:** Active
**Date:** 2026-03-16
**Updated:** 2026-03-17 — GDPR breach notification, alpha VPS scenario, key rotation (#1318)
**Related:** [Monitoring Architecture](monitoring.md) · [Alerting Rules](alerting-rules.md) · [Performance Baselines](performance-baselines.md) · [Security Audit](security-audit-v1.md)
**Tickets:** #413, #1318

---

> **Alpha-phase note:** This project is currently in single-developer alpha. The escalation
> matrix, on-call rotation, and Slack channels described below are aspirational — they
> document the target process for team growth. During alpha, the sole developer is the
> Incident Commander, first responder, and communicator. Sections marked with **🔶 Alpha**
> include streamlined procedures for this phase.

## Table of Contents

- [1. Severity Levels](#1-severity-levels)
- [2. Escalation Matrix](#2-escalation-matrix)
- [3. Rollback Procedures](#3-rollback-procedures)
  - [3.1 Database Migrations](#31-database-migrations)
  - [3.2 Edge Functions](#32-edge-functions)
  - [3.3 PowerSync Sync Rules](#33-powersync-sync-rules)
  - [3.4 Client App Rollback](#34-client-app-rollback)
- [4. Common Incident Playbooks](#4-common-incident-playbooks)
  - [4.1 Sync Failure — Clients Can't Sync](#41-sync-failure--clients-cant-sync)
  - [4.2 Auth Failure — Users Can't Sign In](#42-auth-failure--users-cant-sign-in)
  - [4.3 Data Corruption](#43-data-corruption)
  - [4.4 Security Breach](#44-security-breach)
  - [4.5 VPS Compromised (Alpha)](#45-vps-compromised-alpha)
- [5. Monitoring & Alerting Checklist](#5-monitoring--alerting-checklist)
- [6. Post-Incident Process](#6-post-incident-process)
- [7. GDPR Breach Notification](#7-gdpr-breach-notification)
  - [7.1 Article 33 — Supervisory Authority (72 hours)](#71-article-33--supervisory-authority-72-hours)
  - [7.2 Article 34 — Communication to Data Subjects](#72-article-34--communication-to-data-subjects)
  - [7.3 Breach Notification Decision Flowchart](#73-breach-notification-decision-flowchart)
- [8. Key Rotation Procedures](#8-key-rotation-procedures)
- [9. Evidence Collection](#9-evidence-collection)
- [10. Communication Templates](#10-communication-templates)

---

## 1. Severity Levels

Every incident is classified into one of four severity levels. The severity drives response time, communication channels, and escalation. When in doubt, **classify higher** — you can always downgrade after triage.

| Priority | Severity | Response Time     | Examples                                                                                                      |
| -------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **P0**   | Critical | 15 minutes        | Data loss, auth bypass, complete service outage, security breach                                              |
| **P1**   | High     | 1 hour            | Partial outage, sync failures > 10% of users, data corruption, connection pool exhaustion                     |
| **P2**   | Medium   | 4 hours           | Performance degradation, non-critical Edge Function failure, elevated client errors, TLS certificate warnings |
| **P3**   | Low      | Next business day | UI bugs, cosmetic issues, storage approaching limits, dependency vulnerabilities                              |

> **🔶 Alpha response times:** During single-developer alpha, P0 response is best-effort
> within 1 hour (no 24/7 pager). P1–P3 response times remain as listed. If a P0 occurs
> outside working hours, the 72-hour GDPR clock (if applicable) starts at the moment of
> _awareness_, not the moment the event occurred — document when you first became aware.

### Severity Classification Flowchart

```
Is financial data lost, leaked, or corrupted?
  YES → P0
  NO  ↓
Are users unable to authenticate or sync?
  ALL users → P0
  > 10% of users → P1
  < 10% of users → P2
  NO  ↓
Is a core feature broken (transactions, budgets, accounts)?
  YES → P1
  NO  ↓
Is there measurable performance degradation?
  Exceeds baseline by > 3× → P2
  Exceeds baseline by > 1.5× → P3
  NO → Not an incident (create a bug ticket)
```

See [Alerting Rules](alerting-rules.md) for the full set of P0–P3 alert definitions and thresholds.

---

## 2. Escalation Matrix

> **🔶 Alpha:** During single-developer alpha, you are all roles in one. Skip to the
> [Alpha Escalation Contacts](#25-alpha-escalation-contacts) subsection for a streamlined
> contact list. The team-oriented matrix below documents the target process for when the
> team grows.

### 2.1 On-Call Responsibility

| Priority | First Responder       | Escalation (if unacked)   | Channel                                           |
| -------- | --------------------- | ------------------------- | ------------------------------------------------- |
| **P0**   | On-call engineer      | Project lead after 15 min | PagerDuty (phone/SMS) + Slack `#finance-alerts`   |
| **P1**   | On-call engineer      | Project lead after 1 hour | PagerDuty (low-urgency) + Slack `#finance-alerts` |
| **P2**   | Team (business hours) | On-call if outside hours  | Slack `#finance-alerts`                           |
| **P3**   | Team (next sprint)    | N/A                       | Slack `#finance-monitoring`                       |

### 2.2 Communication Channels

| Channel                                | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| Slack `#finance-alerts`                | P0–P2 alerts, active incident coordination     |
| Slack `#finance-security` (restricted) | Security incidents only (P0-4 class)           |
| Slack `#finance-monitoring`            | P3 alerts, trend observation, non-urgent items |
| PagerDuty                              | Automated paging for P0 and P1                 |

### 2.3 External Vendor Contacts

| Vendor           | What They Own                                  | Contact                                                                      | When to Engage                                                   |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Supabase**     | PostgreSQL, Auth, Edge Functions, storage      | [Supabase Support](https://supabase.com/support) / Dashboard → Support       | Database outage, Auth service down, Edge Function platform issue |
| **PowerSync**    | Sync engine, WebSocket connections, sync queue | [PowerSync Support](https://www.powersync.com/contact) / Dashboard → Support | Sync outage, queue backlog, conflict resolution bugs             |
| **Domain / DNS** | DNS resolution, TLS certificates               | Your registrar's support portal                                              | DNS propagation failures, certificate renewal issues             |
| **Sentry**       | Error tracking, crash reporting                | [Sentry Support](https://sentry.io/support/)                                 | Data ingestion issues, alert delivery failures                   |

### 2.4 Incident Commander Role

For any P0 or P1 incident lasting more than 30 minutes, designate an **Incident Commander (IC)** who:

- Owns communication — posts status updates every 15 minutes (P0) or 30 minutes (P1)
- Coordinates responders — assigns investigation tasks
- Decides on rollback — approves destructive recovery actions
- Tracks timeline — logs events in the incident channel for post-mortem

### 2.5 Alpha Escalation Contacts

During alpha, keep this single-page reference handy. Update placeholder values before going live.

| Contact / Resource              | Details                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Developer (you)**             | Phone, email — you are IC, responder, and communicator                                                         |
| **Supabase support**            | Dashboard → Support, or [supabase.com/support](https://supabase.com/support)                                   |
| **PowerSync support**           | [powersync.com/contact](https://www.powersync.com/contact)                                                     |
| **VPS provider support**        | Provider dashboard → Support ticket (note: response times vary)                                                |
| **Domain registrar**            | Registrar dashboard → DNS / TLS support                                                                        |
| **GDPR supervisory authority**  | Identify your lead authority _before_ an incident — see [§7.1](#71-article-33--supervisory-authority-72-hours) |
| **Legal counsel (if retained)** | `TODO: add contact` — engage for any P0 breach with data exposure                                              |

---

## 3. Rollback Procedures

### 3.1 Database Migrations

**Current migrations** in `services/api/supabase/migrations/`:

| File                                    | Description                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `20260306000001_initial_schema.sql`     | Tables, indexes, triggers (users, households, accounts, transactions, budgets, goals, categories) |
| `20260306000002_rls_policies.sql`       | Row-Level Security policies for all tables                                                        |
| `20260306000003_auth_config.sql`        | Auth configuration                                                                                |
| `20260307000001_monitoring.sql`         | `sync_health_logs` table for sync monitoring                                                      |
| `20260315000001_export_audit_log.sql`   | Audit log for data exports                                                                        |
| `20260316000001_fix_invitation_rls.sql` | RLS fix for household invitations                                                                 |

#### Rolling Back a Migration

Supabase migrations are forward-only SQL files. To roll back, you write and apply a **reverse migration**.

**Step 1: Identify the migration to reverse.**

```bash
cd services/api
supabase migration list
```

**Step 2: Create a reverse migration.**

```bash
supabase migration new rollback_<original_name>
```

**Step 3: Write the DOWN SQL.** Undo every change in the original migration — drop added tables/columns, re-create removed objects, restore altered policies.

Example — rolling back `20260316000001_fix_invitation_rls.sql`:

```sql
-- Reverse: 20260316000001_fix_invitation_rls.sql
-- Restore the original RLS policy that was replaced

DROP POLICY IF EXISTS "new_invitation_policy" ON household_members;

-- Re-create the original policy (copy from the migration being reversed)
CREATE POLICY "original_invitation_policy" ON household_members
  FOR INSERT
  TO authenticated
  USING (/* original condition from before the fix */);
```

**Step 4: Apply the reverse migration.**

```bash
# On local:
supabase migration up

# On production (linked project):
supabase db push
```

**Step 5: Verify.**

```bash
# Connect to the database and confirm schema state
supabase db inspect
```

#### Migration Safety Rules

- **Never edit** an already-applied migration file — always create a new one.
- **Always test** rollback migrations locally before applying to production: `supabase db reset` runs all migrations from scratch.
- **Back up first** — take a database snapshot from the Supabase dashboard before applying rollback migrations to production.
- **Monetary columns** are `BIGINT` (cents). Never introduce `NUMERIC`, `DECIMAL`, or `FLOAT` — see `services/api/README.md` for schema conventions.
- **RLS stays enabled** — never disable RLS on any table, even temporarily during a rollback.

### 3.2 Edge Functions

**Deployed Edge Functions** in `services/api/supabase/functions/`:

| Function               | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `account-deletion`     | GDPR account deletion with crypto-shredding     |
| `auth-webhook`         | Auth event processing                           |
| `data-export`          | User data export (GDPR)                         |
| `health-check`         | Public uptime endpoint (returns 200/503)        |
| `household-invite`     | Household invitation management                 |
| `passkey-authenticate` | WebAuthn passkey authentication                 |
| `passkey-register`     | WebAuthn passkey registration                   |
| `_shared/`             | Shared utilities (auth, CORS, response helpers) |

#### Rolling Back an Edge Function

**Option A: Redeploy the previous version from Git.**

```bash
# 1. Find the last known-good commit for the function
git log --oneline -- services/api/supabase/functions/<function-name>/

# 2. Check out the previous version of the function file(s)
git checkout <good-commit-sha> -- services/api/supabase/functions/<function-name>/

# 3. Deploy the rolled-back version
cd services/api
supabase functions deploy <function-name> --project-ref $PROJECT_REF
```

**Option B: Disable a function temporarily.**

Supabase does not have a built-in "disable" command. To effectively disable a function, deploy a no-op version:

```typescript
// Temporary no-op — returns 503 Service Unavailable
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve((_req: Request) => {
  return new Response(
    JSON.stringify({
      error: 'Service temporarily unavailable — maintenance in progress',
    }),
    {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
```

```bash
supabase functions deploy <function-name> --project-ref $PROJECT_REF
```

**Option C: Delete and redeploy.**

```bash
# Delete the function entirely (clients will get 404)
supabase functions delete <function-name> --project-ref $PROJECT_REF

# Redeploy when ready
supabase functions deploy <function-name> --project-ref $PROJECT_REF
```

#### Edge Function Rollback Notes

- The `_shared/` directory (`cors.ts`, `auth.ts`, `response.ts`) is imported by all functions. Changes to shared code affect every function — deploy all functions after modifying shared code.
- The `health-check` function is public (no auth). Do not disable it during an incident — uptime monitors depend on it.
- After rollback, verify the function responds correctly:
  ```bash
  curl -i https://<project-ref>.supabase.co/functions/v1/<function-name>
  ```

### 3.3 PowerSync Sync Rules

**Current sync rules** are defined in `services/api/powersync/sync-rules.yaml`.

The configuration defines two bucket types:

| Bucket         | Scope                      | Tables Synced                                                |
| -------------- | -------------------------- | ------------------------------------------------------------ |
| `by_household` | All members of a household | `accounts`, `transactions`, `categories`, `budgets`, `goals` |
| `user_profile` | Individual user            | `users`, `household_members`                                 |

Both buckets filter on `deleted_at IS NULL` to exclude soft-deleted records.

#### Rolling Back Sync Rules

**Step 1: Revert the file to the previous version.**

```bash
# Find the last known-good version
git log --oneline -- services/api/powersync/sync-rules.yaml

# Check out the previous version
git checkout <good-commit-sha> -- services/api/powersync/sync-rules.yaml
```

**Step 2: Deploy the reverted sync rules.**

Upload the reverted `sync-rules.yaml` via the PowerSync dashboard, or use the PowerSync CLI if available.

**Step 3: Monitor client reconnection.**

After sync rule changes, PowerSync may invalidate client caches and force a full re-sync. Monitor the following during the grace period:

- **Reconnection spike** — expect elevated WebSocket reconnections for 5–15 minutes
- **Sync latency increase** — clients performing full re-sync will have higher latency
- **Pending mutations** — local unsynced changes remain safe; they upload on reconnect

#### Impact of Sync Rule Changes

| Change Type                        | Client Impact                                                | Risk                                   |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Adding a new table to a bucket     | Clients download new data on next sync                       | Low — additive change                  |
| Removing a table from a bucket     | Clients lose access to that data; local cache may be cleared | **High** — data disappears from client |
| Changing a filter (`WHERE` clause) | Clients may gain or lose records; triggers partial re-sync   | Medium — verify RLS alignment          |
| Renaming a bucket                  | All clients in that bucket force full re-sync                | **High** — treat as delete + create    |

#### Sync Rule Safety Rules

- Always verify sync rules match RLS policies in `services/api/supabase/migrations/20260306000002_rls_policies.sql`. A sync rule that exposes data beyond what RLS allows is a security issue.
- Test sync rule changes locally before deploying to production.
- Schedule sync rule deployments during low-traffic windows to minimize re-sync impact.

### 3.4 Client App Rollback

#### iOS / Android (App Store / Google Play)

App stores do not support instant rollback. Mitigation strategies:

1. **Expedited review** — submit the previous version as a new build and request expedited review (Apple: [Expedited Review](https://developer.apple.com/contact/app-store/?topic=expedite); Google: typically auto-approved).
2. **Staged rollout halt** — if the bad version is in a staged rollout, halt the rollout immediately:
   - **Google Play Console** → Release → Managed publishing → Halt rollout
   - **App Store Connect** → Phased release → Pause
3. **Feature flags** — disable the broken feature server-side without a new build (see below).

#### Web (PWA)

The web app is deployed as a Progressive Web Application (PWA) with a service worker.

```bash
# 1. Deploy the previous version of the web app
# (Use your CI/CD pipeline or manual deploy)

# 2. Force service worker cache invalidation
# Update the service worker version string to trigger re-download.
# Browsers check for SW updates on navigation (within 24 hours max).
```

For immediate cache busting:

- Update the service worker file to change its hash (even a comment change works)
- Redeploy — browsers compare the SW byte-for-byte on next navigation
- Users on the old version get the new SW within 24 hours (browser default)

#### Feature Flags for Gradual Rollout

Use feature flags to disable functionality without redeploying client apps:

1. **Server-side flags** — return flags via an Edge Function or Supabase table that clients check on launch.
2. **Kill switches** — for critical features (auth, sync, data export), maintain server-side kill switches that clients respect.
3. **Gradual rollout** — gate new features behind percentage-based flags; ramp from 1% → 10% → 50% → 100%.

---

## 4. Common Incident Playbooks

### 4.1 Sync Failure — Clients Can't Sync

**Symptoms:** Users report data not updating. `SyncHealthMonitor` shows `Unhealthy` status. `sync_health_logs` shows elevated failure rate.

**Severity:** P1 if > 10% of sync operations fail; P0 if all users affected.

**Diagnostic Steps:**

```
Step 1: Check PowerSync status
  → PowerSync dashboard — is the service operational?
  → Check WebSocket connection count — are clients connected?

Step 2: Check Supabase status
  → Supabase dashboard → Project health
  → Hit the health check endpoint:
    curl https://<project>.supabase.co/functions/v1/health-check
  → Expected: 200 with {"status":"healthy"}

Step 3: Review sync-rules.yaml
  → Were sync rules recently changed?
    git log --oneline -5 -- services/api/powersync/sync-rules.yaml
  → Do sync rules match RLS policies?

Step 4: Check RLS policies
  → Connect to database and test queries as an authenticated user
  → Look for unexpected RLS denials in PostgreSQL logs

Step 5: Review Edge Function logs
  → Supabase dashboard → Functions → Logs
  → Filter for errors in auth-webhook and passkey-* functions
  → Check for 5xx responses or timeout errors

Step 6: Check database connectivity
  → Supabase dashboard → Database → Connection pool usage
  → If pool > 80%: see P1-3 in alerting-rules.md
```

**Resolution Actions:**

| Root Cause                 | Action                                                               |
| -------------------------- | -------------------------------------------------------------------- |
| PowerSync service outage   | Contact PowerSync support; wait for resolution; communicate to users |
| Supabase database down     | Contact Supabase support; check status page; wait for resolution     |
| Bad sync rule deployment   | Roll back sync rules (see [§3.3](#33-powersync-sync-rules))          |
| RLS policy regression      | Roll back migration (see [§3.1](#31-database-migrations))            |
| Edge Function crash        | Roll back function (see [§3.2](#32-edge-functions))                  |
| Connection pool exhaustion | Kill long-running queries; increase pool size in Supabase dashboard  |

### 4.2 Auth Failure — Users Can't Sign In

**Symptoms:** Users report login failures. Auth failure rate exceeds 50% (triggers P0-2 alert). Sentry shows auth-related errors.

**Severity:** P0 if > 50% failure rate; P1 if isolated to one auth method.

**Diagnostic Steps:**

```
Step 1: Check Supabase Auth status
  → Supabase dashboard → Auth → Overview
  → Is the auth service responding?
    curl https://<project>.supabase.co/auth/v1/settings

Step 2: Review passkey endpoints
  → Check passkey-register and passkey-authenticate function logs
  → Supabase dashboard → Functions → passkey-authenticate → Logs
  → Look for WebAuthn verification failures or credential lookup errors

Step 3: Check OAuth provider status
  → Apple: https://developer.apple.com/system-status/
  → Google: https://status.cloud.google.com/
  → If a provider is down, only that sign-in method is affected

Step 4: Verify JWT signing keys
  → Supabase dashboard → Settings → API → JWT Settings
  → Has the JWT secret been rotated recently?
  → If rotated: all existing sessions are invalid (expected)

Step 5: Check auth-webhook function
  → Supabase dashboard → Functions → auth-webhook → Logs
  → Is the webhook responding to auth events?
  → Check for environment variable issues (missing secrets)
```

**Resolution Actions:**

| Root Cause             | Action                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Supabase Auth outage   | Contact Supabase support; enable maintenance page; communicate to users                 |
| Passkey function crash | Roll back `passkey-authenticate` or `passkey-register` (see [§3.2](#32-edge-functions)) |
| OAuth provider outage  | Inform users to try alternative sign-in method; monitor provider status                 |
| JWT secret rotation    | Expected behavior — users re-authenticate; no action needed                             |
| Auth webhook failure   | Roll back `auth-webhook` function; check for secret/env var issues                      |

### 4.3 Data Corruption

**Symptoms:** Users report incorrect balances, missing transactions, or duplicate records. Crypto-shredding verification fails. Sync conflict resolution produces invalid data.

**Severity:** P0 — always treat data corruption as critical.

**Diagnostic Steps:**

```
Step 1: Identify affected records
  → Query sync_health_logs for recent errors:
    SELECT * FROM sync_health_logs
    WHERE sync_status = 'failure'
    AND created_at > now() - interval '1 hour'
    ORDER BY created_at DESC;
  → Identify affected user_ids and device_ids

Step 2: Pause sync for affected users (if possible)
  → Deploy a sync rule change that temporarily narrows scope
  → Or: disable the affected Edge Function to stop writes

Step 3: Assess scope
  → How many users are affected?
  → Which tables have corrupted data?
  → Is corruption in server data, client cache, or both?

Step 4: Apply fix migration
  → Write a targeted migration to correct the data
  → Test on a local database copy first:
    supabase db reset  # local only
  → Apply to production after verification:
    supabase db push

Step 5: Re-sync clients
  → After server data is fixed, clients need to re-sync
  → If sync rules changed, clients auto-re-sync
  → If only data was fixed, clients pick up changes on next incremental sync
```

**Resolution Actions:**

| Root Cause                    | Action                                                                    |
| ----------------------------- | ------------------------------------------------------------------------- |
| Sync conflict resolution bug  | Contact PowerSync support; apply manual data fix                          |
| Bad migration corrupted data  | Roll back migration; restore from backup if needed                        |
| Encryption/decryption failure | Check `FieldEncryptor` and `EnvelopeEncryption` — verify key availability |
| Client bug writing bad data   | Deploy client hotfix; server-side data correction migration               |

**Critical reminders:**

- **Back up before fixing.** Take a database snapshot from the Supabase dashboard before applying any corrective migration.
- **Monetary values are BIGINT (cents).** Never convert to floating point during correction queries.
- **Soft deletes only.** Set `deleted_at = now()` instead of `DELETE FROM` — see schema conventions in `services/api/README.md`.

### 4.4 Security Breach

**Symptoms:** Unauthorized data access detected. Unusual auth patterns (mass logins, token reuse). RLS bypass evidence. Alerts from P0-4 (Security Breach Indicators).

**Severity:** P0 — always.

**Immediate Actions (do all of these):**

```
Step 1: Rotate all secrets
  → Supabase dashboard → Settings → API → Rotate JWT secret
  → Regenerate SUPABASE_SERVICE_ROLE_KEY
  → Rotate any external API keys (Sentry DSN, etc.)
  → Update all Edge Function environment variables

Step 2: Revoke all sessions
  → All active sessions become invalid after JWT secret rotation
  → Users will need to re-authenticate
  → This is expected and intentional

Step 3: Preserve evidence
  → Export Edge Function logs before they rotate
  → Export auth logs from Supabase dashboard
  → Screenshot or export sync_health_logs for the incident window
  → Do NOT modify or delete any logs

Step 4: Audit access
  → Query export_audit_log for unauthorized data exports:
    SELECT * FROM export_audit_log
    WHERE created_at > now() - interval '24 hours'
    ORDER BY created_at DESC;
  → Review auth-webhook logs for suspicious patterns
  → Check RLS policy denial logs for bypass attempts

Step 5: Assess data exposure
  → Which tables were accessed?
  → Was encrypted data (payee, notes, account names) exposed?
  → If only encrypted fields were accessed, key rotation prevents decryption
  → Were any DEKs or KEKs exposed? If so, trigger key rotation via KeyRotation.rotateHouseholdKey()

Step 6: Notify affected users
  → If personal data was exposed, notify affected users within 72 hours (GDPR Article 33)
  → See §7 for full GDPR notification procedures and §10 for templates
  → Use in-app notification + email
  → Document what was exposed, what is encrypted, and what actions users should take
```

**Post-Breach Actions:**

- Engage external security review if breach source is unknown
- Review known vulnerabilities from [Security Audit](security-audit-v1.md), particularly:
  - C-1: Non-CSPRNG default in crypto layer
  - A-5: Passkey-to-session exchange gap
  - N-1 (if applicable): CORS configuration in Edge Functions
- Update incident report with full timeline and root cause
- File regulatory notifications if required (GDPR: 72 hours to supervisory authority)

### 4.5 VPS Compromised (Alpha)

**🔶 Alpha-specific playbook.** In the alpha deployment, backend services run on a single VPS. A compromised VPS is a P0 — assume full data exposure until proven otherwise.

**Symptoms:** Unexpected processes, unauthorized SSH keys, modified files, unusual outbound traffic, alerts from host-based monitoring, provider abuse notification.

**Severity:** P0 — always.

#### Phase 1: Isolate (first 15 minutes)

```
Step 1: Revoke network access
  → VPS provider dashboard → Firewall / Security Groups
  → Block ALL inbound traffic except your own IP for SSH
  → Block ALL outbound traffic (prevents data exfiltration)
  → If provider supports it: disconnect the VPS from the network entirely

Step 2: Do NOT shut down the VPS yet
  → A running system preserves volatile evidence (running processes,
    network connections, memory) that is lost on shutdown
  → Only shut down if active exfiltration is ongoing and you cannot
    block it via firewall

Step 3: Document the moment of awareness
  → Write down the exact UTC time you became aware of the compromise
  → This starts the GDPR 72-hour clock (see §7.1)
```

#### Phase 2: Investigate (next 1–2 hours)

```
Step 1: Capture evidence (see §9 for details)
  → SSH into the isolated VPS from your whitelisted IP
  → Snapshot running processes: ps auxf > /evidence/ps-$(date +%s).txt
  → Snapshot network connections: ss -tulnp > /evidence/ss-$(date +%s).txt
  → Snapshot auth logs: cp /var/log/auth.log /evidence/
  → Snapshot application logs: cp relevant service logs to /evidence/
  → Take a full disk snapshot via the VPS provider dashboard

Step 2: Identify the attack vector
  → Check authorized_keys for unauthorized SSH keys
  → Check crontabs for malicious entries: crontab -l; ls /etc/cron.*
  → Check for modified binaries: dpkg --verify (Debian/Ubuntu)
  → Review auth.log for successful logins from unknown IPs
  → Check Docker containers for unauthorized images

Step 3: Assess data exposure
  → Was the database directly accessible from the VPS?
  → Were .env files with secrets readable?
  → Were backup files present on disk?
  → Was TLS terminated on this VPS (private keys exposed)?
  → Check export_audit_log for unauthorized data exports (see §9)
```

#### Phase 3: Rotate All Credentials (next 30 minutes)

Follow the full key rotation procedure in [§8](#8-key-rotation-procedures). At minimum:

```
Step 1: Rotate from external dashboards (NOT from the compromised VPS)
  → JWT_SECRET: Supabase dashboard → Settings → API → Rotate
  → POSTGRES_PASSWORD: Supabase dashboard → Settings → Database
  → SERVICE_ROLE_KEY: Regenerated when JWT_SECRET rotates
  → ANON_KEY: Regenerated when JWT_SECRET rotates

Step 2: Rotate application-level secrets
  → BACKUP_ENCRYPTION_KEY: Generate new key on a trusted machine
  → Any API keys stored in .env on the VPS (Sentry, etc.)

Step 3: Rotate VPS access
  → Generate new SSH keypair on a trusted machine
  → If rebuilding: provision a fresh VPS (see Step 4)
  → If reusing: remove all authorized_keys and add only the new key

Step 4: Provision a clean replacement VPS
  → Do NOT reuse the compromised VPS for production
  → Provision a new VPS from your infrastructure-as-code or clean image
  → Deploy application from Git (verified clean source)
  → Apply new secrets from Step 1–2
  → Verify deployment with health checks
```

#### Phase 4: Notify (within 72 hours of awareness)

```
Step 1: Classify the breach for GDPR (see §7)
  → Was personal data accessed? (financial data = high risk)
  → Was data encrypted at rest? (reduces but does not eliminate risk)
  → How many users are affected?

Step 2: If personal data was exposed → Supervisory authority (§7.1)
  → File notification within 72 hours of awareness
  → Use the template in §10.1

Step 3: If high risk to individuals → Notify users (§7.2)
  → Use the template in §10.2
  → Include: what happened, what data, what you did, what they should do

Step 4: Document everything
  → Create incident report using the template in §6.2
  → Preserve all evidence collected in Phase 2
  → Store the incident report in docs/architecture/incidents/
```

#### Post-Recovery Checklist

- [ ] Compromised VPS is decommissioned (not just stopped — destroyed)
- [ ] New VPS is provisioned from clean image
- [ ] All secrets rotated (JWT, DB password, service keys, backup key, SSH)
- [ ] Application deployed from verified Git source
- [ ] Health checks passing on new VPS
- [ ] GDPR notification filed (if applicable)
- [ ] Users notified (if high-risk breach)
- [ ] Incident report completed with root cause analysis
- [ ] Prevention measures identified (e.g., MFA on VPS, hardened SSH)

---

## 5. Monitoring & Alerting Checklist

Use this checklist during any active incident to ensure you are looking at the right sources.

### 5.1 Supabase Dashboard Checks

- [ ] **Database health** — Dashboard → Database → Active connections, pool usage
- [ ] **Query performance** — Dashboard → Database → Slow queries (P95 > 2s is P2)
- [ ] **Auth status** — Dashboard → Auth → Recent sign-ins, failure rate
- [ ] **Edge Function health** — Dashboard → Functions → Invocations, error rate, latency
- [ ] **Storage usage** — Dashboard → Database → Disk usage vs. plan limit

### 5.2 PowerSync Dashboard Checks

- [ ] **Service status** — Is the PowerSync instance operational?
- [ ] **Connected clients** — WebSocket connection count (compare to baseline)
- [ ] **Sync queue depth** — Pending operations (> 1,000 is P1 per [alerting rules](alerting-rules.md))
- [ ] **Conflict rate** — Percentage of syncs with conflicts (> 5% is P1)

### 5.3 Edge Function Logs

- [ ] **`health-check`** — Returning 200? If 503, which service is degraded?
- [ ] **`auth-webhook`** — Processing auth events? Any 5xx errors?
- [ ] **`passkey-authenticate`** / **`passkey-register`** — WebAuthn errors?
- [ ] **`household-invite`** — Invitation processing failures?
- [ ] **`data-export`** / **`account-deletion`** — GDPR function failures?

### 5.4 Client-Side Health (SyncHealthMonitor)

These thresholds are defined in the KMP `SyncHealthMonitor` class — see [Monitoring Architecture](monitoring.md) §2.1:

| Metric                          | Degraded    | Unhealthy    |
| ------------------------------- | ----------- | ------------ |
| Sync age (time since last sync) | > 5 minutes | > 30 minutes |
| Consecutive sync failures       | ≥ 1         | > 3          |
| Pending local mutations         | ≥ 50        | > 200        |

### 5.5 External Uptime Checks

Per [Monitoring Architecture](monitoring.md) §4.1:

| Endpoint                   | Check Interval | P0 Threshold |
| -------------------------- | -------------- | ------------ |
| Health check Edge Function | 60s            | Down > 2 min |
| Web app                    | 60s            | Down > 2 min |
| PowerSync instance         | 60s            | Down > 2 min |

---

## 6. Post-Incident Process

Every P0 and P1 incident requires a post-incident review. P2 incidents are reviewed at the team's discretion.

### 6.1 Timeline

| Milestone                    | Deadline                                      |
| ---------------------------- | --------------------------------------------- |
| Incident resolved            | ASAP                                          |
| Incident report draft        | Within 24 hours of resolution                 |
| Post-incident review meeting | Within 3 business days                        |
| Action items assigned        | During review meeting                         |
| Action items completed       | Per agreed deadlines (track in GitHub Issues) |

### 6.2 Incident Report Template

Create a new file in `docs/architecture/incidents/` using this template:

```markdown
# Incident Report: [TITLE]

**Date:** YYYY-MM-DD
**Severity:** P0 / P1 / P2
**Duration:** HH:MM (from detection to resolution)
**Incident Commander:** [name]
**Status:** Resolved / Monitoring

## Summary

One-paragraph description of what happened and the user impact.

## Timeline (all times UTC)

| Time  | Event                                |
| ----- | ------------------------------------ |
| HH:MM | Alert triggered: [alert name]        |
| HH:MM | Incident acknowledged by [responder] |
| HH:MM | Root cause identified                |
| HH:MM | Fix applied                          |
| HH:MM | Monitoring confirms resolution       |

## Root Cause

What specifically caused the incident? Be precise — name the commit,
configuration change, or external failure.

## Impact

- **Users affected:** [count or percentage]
- **Data impact:** [none / corrupted records / data loss]
- **Duration of user-facing impact:** [minutes/hours]

## Resolution

What was done to fix it? Include commands run, migrations applied,
functions redeployed.

## Action Items

| Action              | Owner  | Deadline | Issue |
| ------------------- | ------ | -------- | ----- |
| [Preventive action] | [name] | [date]   | #NNN  |

## Lessons Learned

What should change to prevent recurrence? Consider:

- Could monitoring have detected this sooner?
- Was the runbook adequate?
- Are there missing automated safeguards?
```

### 6.3 Root Cause Analysis

Use the **5 Whys** method:

1. **Why** did the incident occur? (Proximate cause)
2. **Why** was that possible? (Contributing factor)
3. **Why** wasn't it caught earlier? (Detection gap)
4. **Why** wasn't it prevented? (Prevention gap)
5. **Why** don't we have a safeguard? (Systemic issue)

Focus on **systems and processes**, not individuals. The goal is to make the system more resilient, not to assign blame.

### 6.4 Communication to Users

| Severity | Communication                      | Channel                                    | Timing                      |
| -------- | ---------------------------------- | ------------------------------------------ | --------------------------- |
| P0       | Status page update + in-app banner | Status page, app                           | During incident             |
| P0       | Resolution notice                  | Status page, app, email (if data affected) | Within 1 hour of resolution |
| P1       | Status page update                 | Status page                                | During incident if > 1 hour |
| P2–P3    | No external communication          | Internal only                              | N/A                         |

For security incidents involving personal data exposure, GDPR Article 33 requires notification to the supervisory authority within **72 hours**. User notification (Article 34) is required when the breach poses a high risk to individuals' rights and freedoms — see [§7 GDPR Breach Notification](#7-gdpr-breach-notification) for full procedures and templates.

---

## 7. GDPR Breach Notification

This section covers the mandatory breach notification obligations under GDPR. These apply whenever a personal data breach occurs — regardless of team size or alpha/beta/production status.

> **Key definition:** A "personal data breach" is any security incident leading to the
> accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or
> access to, personal data. Financial transaction data, email addresses, and account
> names all qualify as personal data.

### 7.1 Article 33 — Supervisory Authority (72 hours)

**When:** You must notify your lead supervisory authority within **72 hours** of _becoming aware_ of a personal data breach, unless the breach is unlikely to result in a risk to individuals' rights and freedoms.

**Who:** The supervisory authority in the EU/EEA country where your main establishment is located, or where the affected data subjects reside. Identify your lead authority _before_ an incident occurs.

> **🔶 Alpha action item:** Register your lead supervisory authority contact details in
> the [Alpha Escalation Contacts](#25-alpha-escalation-contacts) table now — do not wait
> for a breach to figure out who to call.

**What to include** (minimum required by Article 33(3)):

1. **Nature of the breach** — categories and approximate number of data subjects and records affected
2. **DPO / contact point** — name and contact details of the data protection officer or contact point (during alpha: the sole developer)
3. **Likely consequences** — description of the likely consequences of the breach
4. **Measures taken** — description of measures taken or proposed to address the breach, including mitigation

**How:** Most EU/EEA supervisory authorities accept online submissions. Common portals:

| Authority (example)           | Portal                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ireland DPC                   | [dataprotection.ie](https://www.dataprotection.ie/en/organisations/know-your-obligations/breach-notification) |
| France CNIL                   | [cnil.fr](https://www.cnil.fr/en/notifying-cnil-personal-data-breach)                                         |
| Germany (federal BfDI)        | [bfdi.bund.de](https://www.bfdi.bund.de)                                                                      |
| Netherlands AP                | [autoriteitpersoonsgegevens.nl](https://www.autoriteitpersoonsgegevens.nl)                                    |
| UK ICO (post-Brexit, UK GDPR) | [ico.org.uk](https://ico.org.uk/for-organisations/report-a-breach/)                                           |

**If you can't complete the notification in 72 hours:** Submit what you have and provide the remaining information in phases. Document why the delay occurred.

**Record-keeping (Article 33(5)):** Document _every_ breach — even those you decide not to report — including the facts, effects, and remedial action. Store in `docs/architecture/incidents/`.

### 7.2 Article 34 — Communication to Data Subjects

**When:** You must communicate the breach to affected data subjects "without undue delay" when the breach is **likely to result in a high risk** to their rights and freedoms.

**High risk indicators for a financial app:**

- Unencrypted financial transaction data was exposed
- Account balances, payee names, or spending patterns were accessed
- Authentication credentials were compromised
- Data could enable identity theft or financial fraud

**Exceptions** (notification to data subjects is NOT required if):

1. You applied encryption or pseudonymization that renders data unintelligible to unauthorized parties (e.g., envelope encryption with DEK/KEK — verify KEK was not exposed)
2. You took subsequent measures that ensure the high risk is no longer likely to materialize
3. It would involve disproportionate effort — in which case, make a public communication instead

**What to include** (Article 34(2), in clear and plain language):

1. Nature of the breach (what happened)
2. Contact point for more information
3. Likely consequences
4. Measures taken and recommended actions for the individual

> See [§10.2](#102-user-breach-notification-email) for a ready-to-use email template.

### 7.3 Breach Notification Decision Flowchart

```
Personal data breach detected
  ↓
Was personal data actually accessed/exposed?
  NO  → Document internally (Article 33(5)). No notification required. STOP.
  YES ↓
Is the breach unlikely to result in risk to individuals?
  YES → Document internally. No supervisory authority notification. STOP.
  NO  ↓
┌─────────────────────────────────────────────────────┐
│ NOTIFY SUPERVISORY AUTHORITY within 72 hours (§7.1) │
└─────────────────────────────────────────────────────┘
  ↓
Is the breach likely to result in HIGH risk to individuals?
  NO  → Supervisory authority notification is sufficient. STOP.
  YES ↓
Was data rendered unintelligible (encryption with unexposed keys)?
  YES → User notification NOT required (exception 1). STOP.
  NO  ↓
┌──────────────────────────────────────────────────┐
│ NOTIFY AFFECTED USERS without undue delay (§7.2) │
└──────────────────────────────────────────────────┘
```

---

## 8. Key Rotation Procedures

This section documents the step-by-step procedure for rotating each secret. Perform all rotations from a **trusted machine** — never from a compromised system.

> **🔶 Alpha:** During alpha with a single VPS, rotating secrets means brief downtime.
> Schedule rotations during low-traffic windows (if routine) or accept downtime during
> incident response (if emergency).

### 8.1 JWT_SECRET

**Impact:** Rotating the JWT secret invalidates _all_ existing user sessions. Every user must re-authenticate.

```bash
# 1. Rotate via Supabase dashboard
#    Settings → API → JWT Settings → Generate new JWT secret

# 2. The ANON_KEY and SERVICE_ROLE_KEY are derived from the JWT secret.
#    After rotation, copy the new values from:
#    Settings → API → Project API keys

# 3. Update all systems that reference these keys:
#    - VPS environment variables (.env or secrets manager)
#    - PowerSync connection settings (uses SERVICE_ROLE_KEY)
#    - Client apps (ANON_KEY is embedded — redeploy clients)
#    - Edge Functions that reference the service role key

# 4. Restart all services that cache the old keys

# 5. Verify:
curl -H "apikey: <NEW_ANON_KEY>" \
  https://<project>.supabase.co/rest/v1/ \
  -I
# Expected: 200 OK
```

### 8.2 POSTGRES_PASSWORD

**Impact:** All direct database connections will fail until updated. Supabase internal services (Auth, Edge Functions) reconnect automatically after dashboard rotation.

```bash
# 1. Rotate via Supabase dashboard
#    Settings → Database → Database password → Reset

# 2. Update any direct connection strings:
#    - VPS application .env (if connecting directly to PG)
#    - Migration tooling (supabase CLI uses project link, not direct password)
#    - Monitoring tools that query the database

# 3. Verify:
#    Supabase dashboard → Database → Run a test query in SQL editor
```

### 8.3 SERVICE_ROLE_KEY

The `SERVICE_ROLE_KEY` is derived from `JWT_SECRET`. Rotating the JWT secret (§8.1) automatically generates a new service role key. After JWT rotation:

```bash
# 1. Copy the new SERVICE_ROLE_KEY from Supabase dashboard
#    Settings → API → Project API keys → service_role

# 2. Update all locations that use it:
#    - PowerSync dashboard → Supabase connection → Service role key
#    - VPS environment variables
#    - Any admin scripts that bypass RLS

# 3. Verify PowerSync can connect:
#    PowerSync dashboard → Status → Connection health
```

### 8.4 BACKUP_ENCRYPTION_KEY

**Impact:** Old backups encrypted with the previous key remain readable only with that key. Store the old key securely for disaster recovery.

```bash
# 1. Generate a new key on a trusted machine
#    (Do NOT run this on a compromised system)
#    Use your password manager or a secure key generation method

# 2. Store the OLD key in a secure, offline location
#    Label it with the date range it was active
#    You need this to restore old backups

# 3. Update the backup encryption key in your backup system:
#    - VPS environment variable
#    - Backup cron job / script configuration

# 4. Run a test backup with the new key and verify you can restore it

# 5. Verify old backups are still restorable with the old key
```

### 8.5 Rotation Checklist (Emergency)

Use this checklist during a P0 security incident. Check off each item as you go.

- [ ] JWT_SECRET rotated (Supabase dashboard)
- [ ] New ANON_KEY and SERVICE_ROLE_KEY copied
- [ ] POSTGRES_PASSWORD rotated (Supabase dashboard)
- [ ] BACKUP_ENCRYPTION_KEY rotated (trusted machine)
- [ ] VPS .env updated with all new values
- [ ] PowerSync connection updated with new SERVICE_ROLE_KEY
- [ ] SSH keys rotated (if VPS compromised)
- [ ] All services restarted
- [ ] Health checks passing
- [ ] Sentry DSN / external API keys rotated (if exposed)
- [ ] Old BACKUP_ENCRYPTION_KEY archived securely

---

## 9. Evidence Collection

Preserve evidence before rotating secrets or rebuilding infrastructure. This evidence is required for root cause analysis, GDPR breach documentation, and potential law enforcement engagement.

### 9.1 What to Collect

| Source                    | How to Export                                                               | Retention             |
| ------------------------- | --------------------------------------------------------------------------- | --------------------- |
| **Supabase Auth logs**    | Dashboard → Auth → Logs → Export (or API)                                   | 90 days minimum       |
| **Edge Function logs**    | Dashboard → Functions → Select function → Logs → Export                     | 90 days minimum       |
| **`export_audit_log`**    | SQL: `SELECT * FROM export_audit_log WHERE created_at > '<incident_start>'` | Permanent             |
| **`sync_health_logs`**    | SQL: `SELECT * FROM sync_health_logs WHERE created_at > '<incident_start>'` | 90 days minimum       |
| **PostgreSQL query logs** | Supabase dashboard → Logs → Postgres                                        | 7 days (default)      |
| **VPS system logs**       | `/var/log/auth.log`, `/var/log/syslog`, application logs                    | Until incident closed |
| **VPS process snapshot**  | `ps auxf`, `ss -tulnp`, `netstat -tlnp`                                     | Snapshot at discovery |
| **VPS disk snapshot**     | Provider dashboard → Snapshots → Create                                     | Until incident closed |
| **Git history**           | `git log --since="<date>"` — verify no unauthorized commits                 | Permanent             |

### 9.2 Evidence Handling Rules

1. **Collect before you remediate.** Rotating secrets or rebuilding servers destroys volatile evidence.
2. **Do NOT modify logs.** Copy them — never edit, truncate, or delete originals.
3. **Timestamp everything.** Use UTC throughout. Record when each piece of evidence was collected.
4. **Store securely.** Evidence may contain personal data — encrypt at rest and restrict access.
5. **Chain of custody.** Record who collected each artifact and when. During alpha, this is just you — document it anyway for regulatory credibility.

### 9.3 Key Queries for Breach Investigation

```sql
-- Unauthorized data exports in the last 7 days
SELECT user_id, export_type, created_at, ip_address
FROM export_audit_log
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- Sync failures correlated with the incident window
SELECT device_id, user_id, sync_status, error_message, created_at
FROM sync_health_logs
WHERE created_at BETWEEN '<start_time>' AND '<end_time>'
  AND sync_status = 'failure'
ORDER BY created_at;

-- Recent auth events (check for unusual patterns)
-- Run via Supabase dashboard → Auth → Logs, or via the Auth Admin API
```

---

## 10. Communication Templates

Ready-to-use templates for breach notification. Customize the bracketed placeholders before sending.

### 10.1 Supervisory Authority Notification (Article 33)

> Submit via your supervisory authority's online portal (see [§7.1](#71-article-33--supervisory-authority-72-hours)).
> Most portals have structured forms — use this as a reference for what to include.

```
PERSONAL DATA BREACH NOTIFICATION

1. CONTROLLER DETAILS
   Name: [Your legal name / business name]
   Contact: [Email and phone]
   DPO / Contact point: [Same as above during alpha]

2. BREACH DETAILS
   Date/time of breach: [UTC timestamp or best estimate]
   Date/time of awareness: [When you first became aware]
   Nature of breach:
     [ ] Confidentiality (unauthorized access/disclosure)
     [ ] Integrity (unauthorized alteration)
     [ ] Availability (loss or destruction)
   Description: [Brief factual description — e.g., "Unauthorized access to
   VPS hosting the application backend. Attacker may have accessed the
   database containing user financial records."]

3. DATA AND INDIVIDUALS AFFECTED
   Categories of data: [e.g., email addresses, financial transaction data,
   account names, spending categories]
   Approximate number of data subjects: [number]
   Approximate number of records: [number]

4. LIKELY CONSEQUENCES
   [e.g., "Potential exposure of personal financial data including
   transaction history and account balances. Risk of financial profiling.
   Note: payee names and account names are encrypted at the application
   layer using envelope encryption (AES-256-GCM). The encryption keys
   were / were not compromised."]

5. MEASURES TAKEN
   [e.g., "Immediately isolated the compromised server. Rotated all
   authentication secrets (JWT, database password, service keys).
   Provisioned a clean replacement server. Investigating root cause.
   Affected users will be notified via email within [timeframe]."]

6. DELAYED NOTIFICATION (if applicable)
   Reason for delay beyond 72 hours: [explanation]
```

### 10.2 User Breach Notification Email (Article 34)

```
Subject: Important Security Notice — [App Name]

Dear [User],

We are writing to inform you of a security incident that may affect
your personal data.

WHAT HAPPENED
On [date], we detected unauthorized access to our backend server.
We immediately isolated the server and began an investigation.

WHAT DATA WAS INVOLVED
The following categories of your data may have been accessed:
- Email address
- Financial transaction history (amounts, dates, categories)
- [Account names / payee names — if encryption keys were NOT compromised,
  note: "These fields were encrypted and the encryption keys were not
  accessed."]

WHAT WE ARE DOING
- We immediately revoked all access and rotated all security credentials
- We provisioned a new, clean server environment
- We are conducting a thorough investigation into the root cause
- We have notified the relevant data protection authority

WHAT YOU CAN DO
- Your session has been invalidated — you will need to sign in again
- Review your transaction history in the app for any unfamiliar entries
- If you reused your password elsewhere, consider changing those passwords
- Monitor your financial accounts for unusual activity

CONTACT US
If you have questions or concerns, contact us at [email].

We take the security of your financial data extremely seriously and
sincerely apologize for this incident.

[Your name]
[Date]
```

### 10.3 Internal Incident Log Entry (Quick Reference)

Use this format for real-time logging during an active incident:

```
INCIDENT LOG — [Date] — [Codename or brief title]
Severity: P[0-3]
Awareness time: [UTC]
GDPR 72h deadline: [UTC — awareness time + 72 hours]

[HH:MM UTC] — [Action taken or observation]
[HH:MM UTC] — [Action taken or observation]
...
```

---

## Related Documents

- [Monitoring Architecture](monitoring.md) — alerting thresholds, health metrics, Sentry integration plan
- [Alerting Rules](alerting-rules.md) — full P0–P3 alert definitions with runbook links
- [Performance Baselines](performance-baselines.md) — target latencies for sync, startup, and queries
- [Security Audit](security-audit-v1.md) — known vulnerabilities and risk areas
- [Security Architecture](security-architecture.md) — encryption model, key management, auth flow
- [Privacy Audit](privacy-audit-v1.md) — data classification and GDPR compliance
- [Backend README](../../services/api/README.md) — database schema, RLS model, local development
- [Workflow Cheatsheet](../guides/workflow-cheatsheet.md) — common development workflows
