<!-- SPDX-License-Identifier: BUSL-1.1 -->

# GDPR Consent Mechanism — Security Requirements

**Date:** 2026-07-18
**Author:** Security & Privacy Reviewer
**Status:** Requirements specification for backend engineer
**Audit References:** Privacy Audit v1 §Consent Management, GDPR Consent Management Audit
**MASVS Controls:** MASVS-STORAGE, MASVS-PLATFORM
**Regulations:** GDPR Art. 6(1)(a), Art. 7, Art. 8; CCPA/CPRA §1798.100 et seq.; ePrivacy Directive Art. 5(3)

---

## Executive Summary

Finance currently has **zero consent infrastructure**. The shared monitoring
contracts (`CrashReporter`, `MetricsCollector`) are consent-gated by design,
and Android hard-codes consent to `false` — but no consent capture flow,
consent record, or withdrawal mechanism exists on any platform
(`docs/architecture/privacy-audit-v1.md` §Consent Management).

This specification defines the exact security and compliance requirements the
backend engineer must satisfy when building the consent mechanism. It does NOT
prescribe UI design — only the data model, API contract, audit trail, and
cryptographic integrity requirements.

---

## 1. Consent Types Required

### 1.1 Purpose-Specific Consent Categories

Each consent purpose MUST be independently grantable and revocable.
Bundled consent violates GDPR Art. 7(2).

| ID                     | Purpose                                      | Legal Basis                 | Default                        | Revocable                       | Notes                                                   |
| ---------------------- | -------------------------------------------- | --------------------------- | ------------------------------ | ------------------------------- | ------------------------------------------------------- |
| `essential_processing` | Account, sync, auth, security logging        | **Contract** (Art. 6(1)(b)) | Implicit with account creation | N/A — tied to account existence | NOT a consent toggle — documented for transparency only |
| `crash_reporting`      | Off-device error diagnostics (e.g., Sentry)  | **Consent** (Art. 6(1)(a))  | `denied`                       | Yes                             | Must be separate from analytics                         |
| `analytics`            | Product usage analytics, feature telemetry   | **Consent** (Art. 6(1)(a))  | `denied`                       | Yes                             | Must be separate from crash reporting                   |
| `marketing_email`      | Product update emails, feature announcements | **Consent** (Art. 6(1)(a))  | `denied`                       | Yes                             | Only if marketing is ever implemented                   |

### 1.2 Non-Consent Processing (Transparency Only)

The following processing uses legitimate interest, NOT consent, but MUST be
documented in the privacy policy and disclosed to users:

| Purpose                         | Legal Basis                        | Justification                      |
| ------------------------------- | ---------------------------------- | ---------------------------------- |
| Security audit logging          | Legitimate interest (Art. 6(1)(f)) | Fraud detection, incident response |
| Sync health monitoring          | Legitimate interest (Art. 6(1)(f)) | Service reliability                |
| Rate limiting / abuse detection | Legitimate interest (Art. 6(1)(f)) | Platform integrity                 |

---

## 2. Consent Data Model

### 2.1 Backend Schema — `consent_records` Table

```sql
CREATE TABLE IF NOT EXISTS public.consent_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose         TEXT NOT NULL CHECK (purpose IN (
                        'crash_reporting', 'analytics', 'marketing_email'
                    )),
    status          TEXT NOT NULL CHECK (status IN ('granted', 'denied')),
    policy_version  TEXT NOT NULL,      -- e.g., "2026-07-01-v1"
    consent_text_id TEXT NOT NULL,      -- reference to the exact text shown
    granted_at      TIMESTAMPTZ,        -- NULL if never granted
    denied_at       TIMESTAMPTZ,        -- NULL if never denied
    source          TEXT NOT NULL CHECK (source IN (
                        'onboarding', 'settings', 'migration', 'api'
                    )),
    platform        TEXT NOT NULL CHECK (platform IN (
                        'android', 'ios', 'web', 'windows'
                    )),
    app_version     TEXT NOT NULL,
    ip_address      INET,               -- for audit; hashed or truncated for minimization
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, purpose)           -- one active record per purpose per user
);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
```

### 2.2 Append-Only Consent Event Log — `consent_events` Table

Every state change MUST be recorded in an append-only audit log. The
`consent_records` table holds current state; `consent_events` holds the
full history for Art. 7(1) demonstrability.

```sql
CREATE TABLE IF NOT EXISTS public.consent_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose         TEXT NOT NULL,
    previous_status TEXT,               -- NULL for first decision
    new_status      TEXT NOT NULL CHECK (new_status IN ('granted', 'denied')),
    policy_version  TEXT NOT NULL,
    consent_text_id TEXT NOT NULL,
    source          TEXT NOT NULL,
    platform        TEXT NOT NULL,
    app_version     TEXT NOT NULL,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
```

### 2.3 RLS Policies

```sql
-- consent_records: users can only read/write their own
CREATE POLICY "Users manage own consent" ON public.consent_records
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- consent_events: users can only read their own; insert via function
CREATE POLICY "Users read own consent events" ON public.consent_events
    FOR SELECT USING (auth.uid() = user_id);

-- Insert only via SECURITY DEFINER function (prevents timestamp manipulation)
CREATE POLICY "Insert via function only" ON public.consent_events
    FOR INSERT WITH CHECK (false); -- blocked for direct client inserts
```

---

## 3. API Contract

### 3.1 Record Consent — `POST /functions/v1/consent`

**Authentication:** Required (bearer JWT).

**Request Body:**

```json
{
  "decisions": [
    {
      "purpose": "crash_reporting",
      "status": "granted"
    },
    {
      "purpose": "analytics",
      "status": "denied"
    }
  ],
  "policy_version": "2026-07-01-v1",
  "source": "onboarding",
  "platform": "android",
  "app_version": "1.0.0"
}
```

**Security Requirements:**

1. **Server-side timestamp**: `created_at`/`granted_at`/`denied_at` MUST be set
   server-side. NEVER trust client-provided timestamps.
2. **Idempotency**: Repeated submissions with same status are no-ops (no new event).
3. **Atomicity**: All decisions in a single request MUST be processed in a single
   database transaction. Partial failure = full rollback.
4. **Validation**: Reject unknown purposes, invalid statuses, missing policy_version.
5. **Rate limiting**: Apply standard auth-endpoint rate limits (10 req/min/user).
6. **Audit trail**: Every status change MUST insert a row in `consent_events`.

**Response:**

```json
{
    "consent_receipt": {
        "receipt_id": "uuid",
        "user_id": "uuid",
        "decisions": [...],
        "policy_version": "2026-07-01-v1",
        "recorded_at": "2026-07-18T12:00:00Z",
        "receipt_hash": "sha256-of-canonical-receipt"
    }
}
```

### 3.2 Get Current Consent — `GET /functions/v1/consent`

**Authentication:** Required.

Returns the current `consent_records` rows for the authenticated user. Used by
clients on startup to determine SDK initialization state.

### 3.3 Get Consent History — `GET /functions/v1/consent/history`

**Authentication:** Required.

Returns all `consent_events` for the authenticated user, ordered by `created_at`.
This fulfills GDPR Art. 15 (right of access to consent records) and DSAR requirements.

### 3.4 Withdraw Consent — `POST /functions/v1/consent`

Withdrawal uses the same endpoint as granting — submit `"status": "denied"`.
The API MUST:

1. Update `consent_records.status` to `denied` and set `denied_at`.
2. Append a `consent_events` row with `new_status: denied`.
3. Return a receipt confirming the withdrawal.
4. The client MUST then immediately stop SDK initialization for that purpose
   and flush buffered events (via `MetricsCollector.clearEvents()`).

---

## 4. Retention Requirements

### 4.1 Consent Records Retention

| Data                              | Retention Period                                       | Justification                                           |
| --------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `consent_records` (current state) | Account lifetime                                       | Required for ongoing processing decisions               |
| `consent_events` (audit trail)    | 5 years after last event OR account deletion + 90 days | GDPR Art. 7(1) demonstrability; regulatory retention    |
| IP address in consent events      | Truncated after 90 days                                | Minimization — retain `/24` (IPv4) or `/48` (IPv6) only |
| Consent receipts (client-side)    | Device lifetime                                        | Local convenience; server is the system of record       |

### 4.2 Retention on Account Deletion

When a user deletes their account (GDPR Art. 17):

1. `consent_records` — **Hard delete** with the user cascade.
2. `consent_events` — **Retain anonymized** for 90 days, then hard delete.
   Anonymization: replace `user_id` with a hash, null out `ip_address`.
   Justification: regulatory defense if a complaint is filed after deletion.
3. After 90 days: hard delete anonymized events via scheduled cleanup job.

### 4.3 Automated Cleanup

Implement a scheduled function (daily cron) to:

- Truncate IP addresses in consent_events older than 90 days.
- Delete anonymized consent_events older than 90 days post-account-deletion.
- Purge expired WebAuthn challenges (existing gap from audit).
- Purge expired household invitations (existing gap from audit).

---

## 5. Withdrawal Flow — Detailed Requirements

### 5.1 Withdrawal Must Be As Easy As Granting (Art. 7(3))

| Step | Granting                              | Withdrawing                     |
| ---- | ------------------------------------- | ------------------------------- |
| 1    | See consent UI in onboarding/settings | See consent toggles in settings |
| 2    | Tap toggle to grant                   | Tap toggle to deny              |
| 3    | Confirmation (optional)               | Confirmation (optional)         |
| 4    | Server records grant                  | Server records denial           |
| 5    | SDK initializes                       | SDK stops, buffer flushed       |

### 5.2 Immediate Effect

Withdrawal MUST take effect immediately:

1. Client-side: Stop SDK, flush event buffer, clear user context.
2. Server-side: Update `consent_records`, append `consent_events`.
3. Any pending telemetry queue MUST be discarded, not sent.

### 5.3 Cross-Device Propagation

When consent is changed on one device, other devices MUST pick up the change:

- On app startup: fetch `GET /consent` and reconcile local state.
- On token refresh: optionally embed consent status in JWT custom claims
  for instant propagation without extra API call.

### 5.4 Re-Consent on Policy Version Change

When `policy_version` changes:

1. All existing consents for consent-based purposes MUST be reset to `unknown`.
2. Users MUST be re-prompted on next app open.
3. Optional processing MUST stop until re-consent is obtained.

---

## 6. Audit Trail Requirements

### 6.1 What Must Be Recorded

Every consent event MUST capture:

- **Who**: `user_id` (from JWT, never client-supplied)
- **What**: `purpose`, `previous_status` → `new_status`
- **When**: Server-side `created_at` timestamp
- **Where**: `platform`, `app_version`, `ip_address` (truncated)
- **Which policy**: `policy_version`, `consent_text_id`
- **How**: `source` (onboarding, settings, migration, API)

### 6.2 Integrity

The consent receipt MUST include a `receipt_hash` computed as:

```
SHA-256(canonical_json(receipt_id + user_id + decisions + policy_version + recorded_at))
```

This allows later verification that the receipt has not been tampered with.

### 6.3 Non-Repudiation

- Consent events are append-only (no UPDATE or DELETE by users).
- The `consent_events` table MUST have no user-facing mutation policies.
- Only `SECURITY DEFINER` functions may insert into `consent_events`.

---

## 7. Security Requirements Checklist

- [ ] `consent_records` and `consent_events` have RLS enabled
- [ ] Users can only read/write their own consent records
- [ ] `consent_events` insertion only via `SECURITY DEFINER` function
- [ ] All timestamps are server-generated (never trust client)
- [ ] `policy_version` is validated against a known set
- [ ] `purpose` is validated against enum (reject unknown values)
- [ ] Consent API is rate-limited (10 req/min/user)
- [ ] Consent receipt includes SHA-256 integrity hash
- [ ] IP addresses are truncated in events after 90 days
- [ ] Account deletion anonymizes consent events before hard delete
- [ ] Withdrawal takes effect immediately (no delayed processing)
- [ ] Cross-device propagation on next startup / token refresh
- [ ] Re-consent triggered on policy version change
- [ ] No PII in consent receipt beyond user_id and truncated IP
- [ ] Consent status included in data export (DSAR compliance)
- [ ] Consent events survive database backup/restore cycle

---

## 8. Test Cases

### 8.1 Happy Path

| #   | Test                                    | Expected                                                      |
| --- | --------------------------------------- | ------------------------------------------------------------- |
| 1   | Grant analytics consent via onboarding  | `consent_records` row created, event logged, receipt returned |
| 2   | Read consent on app startup             | Returns current status for all purposes                       |
| 3   | Withdraw analytics consent via settings | Status updated to `denied`, event logged, receipt returned    |
| 4   | Re-grant analytics consent              | Status updated to `granted`, new event logged                 |
| 5   | Multiple purposes in one request        | All processed atomically                                      |

### 8.2 Security / Edge Cases

| #   | Test                                        | Expected                                   |
| --- | ------------------------------------------- | ------------------------------------------ |
| 6   | Submit consent without authentication       | 401 Unauthorized                           |
| 7   | Submit consent for another user_id          | Rejected (user_id from JWT only)           |
| 8   | Submit unknown purpose "tracking"           | 400 Bad Request with validation error      |
| 9   | Submit with future/past client timestamp    | Server ignores; uses server time           |
| 10  | Rapid duplicate submissions                 | Idempotent; no duplicate events            |
| 11  | Partial transaction failure                 | Full rollback; no partial consent state    |
| 12  | Policy version change with existing consent | Existing consents reset to unknown         |
| 13  | Account deletion                            | consent_records deleted; events anonymized |
| 14  | DSAR export includes consent history        | consent_events included in export payload  |
| 15  | Consent receipt hash verification           | Receipt hash matches recomputed hash       |

---

## 9. Integration with Existing Code

### 9.1 Shared Monitoring Contracts

The consent status feeds directly into:

- `CrashReporter(consentProvider: () -> Boolean)` — inject consent repository read
- `MetricsCollector(consentProvider: () -> Boolean)` — inject consent repository read
- `MetricsCollector.clearEvents()` — call on withdrawal

### 9.2 Android DI (Koin)

Replace `consentProvider = { false }` in `AppModule.kt` with a reactive
consent repository backed by the API. SDK initialization must wait for
consent resolution.

### 9.3 Web Monitoring

`apps/web/src/lib/monitoring.ts` has a TODO for consent check before Sentry
init. The consent API response should gate `initMonitoring()`.

### 9.4 JWT Custom Claims (Optional Enhancement)

Embed consent status in JWT via Supabase auth hook for instant propagation:

```json
{
  "consent": {
    "crash_reporting": "granted",
    "analytics": "denied"
  }
}
```

---

## References

- GDPR Art. 6 (Lawfulness of processing)
- GDPR Art. 7 (Conditions for consent)
- GDPR Art. 17 (Right to erasure)
- Privacy Audit v1 (`docs/architecture/privacy-audit-v1.md` §Consent Management)
- GDPR Consent Management Audit (`docs/compliance/consent-management-audit.md`)
- `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/CrashReporter.kt`
- `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/MetricsCollector.kt`
- `apps/android/src/main/kotlin/com/finance/android/di/AppModule.kt`
