# GDPR Right to Erasure Audit

**Issue:** #365
**Date:** 2026-03-16
**Regulation:** GDPR Article 17 (Right to Erasure / "Right to Be Forgotten")
**Status:** Audit complete — gaps identified
**Author:** AI agent (docs-writer), requires human review

> **⚠️ DISCLAIMER:** This document is a technical audit of the codebase, NOT legal
> advice. Have qualified legal counsel review all findings before making compliance
> claims.

---

## Table of Contents

1. [Summary](#1-summary)
2. [Scope](#2-scope)
3. [Implementation Analysis](#3-implementation-analysis)
4. [Cascading Soft-Delete Coverage](#4-cascading-soft-delete-coverage)
5. [Crypto-Shredding Analysis](#5-crypto-shredding-analysis)
6. [Multi-User Household Edge Cases](#6-multi-user-household-edge-cases)
7. [Deletion Certificate](#7-deletion-certificate)
8. [Retention Policy and Hard-Delete Schedule](#8-retention-policy-and-hard-delete-schedule)
9. [Identified Gaps](#9-identified-gaps)
10. [Recommendations](#10-recommendations)

---

## 1. Summary

Finance implements a server-side account-deletion Edge Function at
`services/api/supabase/functions/account-deletion/index.ts` that supports GDPR
Article 17 erasure. The function performs cascading soft-deletes across user and
household data, records crypto-shredding intent, handles the multi-user
household edge case (user-leaves vs. full-household deletion), and returns a
deletion certificate. However, crypto-shredding is currently a **placeholder**
(synthetic fingerprints, no actual key destruction), several tables are
**not covered** by the deletion cascade, and there is **no implemented
hard-delete schedule** to permanently remove soft-deleted records.

**Compliance estimate:** ~55% for Art. 17.

## 2. Scope

This audit examines:

- The server-side account-deletion function
  (`services/api/supabase/functions/account-deletion/index.ts`)
- The database schema (`services/api/supabase/migrations/`)
- Crypto-shredding design (as implemented in the Edge Function)
- Multi-user household handling
- Deletion certificates
- Retention and hard-delete policy

Out of scope: client-side (Android/iOS/web) deletion flows, KMP
`CryptoShredder` abstraction, local database/preferences cleanup.

## 3. Implementation Analysis

### 3.1 Deletion Flow

The account-deletion function (`account-deletion/index.ts:48–272`) follows a
9-step flow:

| Step | Operation                                                                             | Lines   | Status         |
| ---- | ------------------------------------------------------------------------------------- | ------- | -------------- |
| 1    | **Pre-deletion audit log** — Records `ACCOUNT_DELETION_REQUESTED` with certificate ID | 97–106  | ✅ Implemented |
| 2    | **Fetch household memberships** — Gets all active memberships for the user            | 111–122 | ✅ Implemented |
| 3    | **Crypto-shredding** — Per-household key destruction or revocation                    | 126–178 | ⚠️ Placeholder |
| 4    | **Soft-delete memberships** — Sets `deleted_at` on all `household_members` rows       | 183–191 | ✅ Implemented |
| 5    | **Soft-delete passkeys** — Sets `deleted_at` on `passkey_credentials`                 | 196–200 | ✅ Implemented |
| 6    | **Soft-delete user** — Sets `deleted_at` on the `users` row                           | 205–209 | ✅ Implemented |
| 7    | **Post-deletion audit log** — Records `ACCOUNT_DELETED` with summary                  | 218–229 | ✅ Implemented |
| 8    | **Auth user deletion** — Calls `supabase.auth.admin.deleteUser()`                     | 234–241 | ✅ Best-effort |
| 9    | **Return deletion certificate** — JSON certificate with metadata                      | 252–267 | ✅ Implemented |

### 3.2 Confirmation Requirement

The function requires explicit confirmation to prevent accidental deletion
(lines 82–88):

```typescript
if (body.confirm !== true && body.confirm !== 'DELETE_MY_ACCOUNT') {
  return errorResponse(req, '...', 400);
}
```

This is a good safeguard but is not a two-factor or cooling-off mechanism.

### 3.3 HTTP Method

The function correctly uses `DELETE` method and rejects other methods
(lines 56–58).

## 4. Cascading Soft-Delete Coverage

### 4.1 Tables Soft-Deleted (Sole-Member Households)

When the user is the **only member** of a household, the function soft-deletes
all household data (`account-deletion/index.ts:147–165`):

| Table                   | Soft-Deleted | Filter                                | Evidence     |
| ----------------------- | ------------ | ------------------------------------- | ------------ |
| `transactions`          | ✅           | `household_id` + `deleted_at IS NULL` | Line 157–160 |
| `budgets`               | ✅           | `household_id` + `deleted_at IS NULL` | Line 157–160 |
| `goals`                 | ✅           | `household_id` + `deleted_at IS NULL` | Line 157–160 |
| `accounts`              | ✅           | `household_id` + `deleted_at IS NULL` | Line 157–160 |
| `categories`            | ✅           | `household_id` + `deleted_at IS NULL` | Line 157–160 |
| `household_invitations` | ✅           | `household_id` + `deleted_at IS NULL` | Line 157–160 |
| `households`            | ✅           | `id` (no `deleted_at` filter)         | Line 163–165 |

### 4.2 Tables Soft-Deleted (All Cases)

Regardless of household membership:

| Table                 | Soft-Deleted | Filter                           | Evidence      |
| --------------------- | ------------ | -------------------------------- | ------------- |
| `household_members`   | ✅           | Per membership ID                | Lines 184–189 |
| `passkey_credentials` | ✅           | `user_id` + `deleted_at IS NULL` | Lines 197–200 |
| `users`               | ✅           | `id`                             | Lines 206–208 |

### 4.3 Tables NOT Covered by Deletion

The following tables contain personal data but are **not** soft-deleted or
otherwise handled during account deletion:

| Table                                       | Contains Personal Data                                            | Handled                       | Gap                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `webauthn_challenges`                       | `user_id`, `challenge`                                            | ❌ **Not deleted**            | Ephemeral records may still exist                                                   |
| `audit_log`                                 | `user_id`, `ip_address`, `user_agent`, `old_values`, `new_values` | ❌ **Intentionally retained** | No documented legal basis for retention                                             |
| `sync_health_logs`                          | `user_id`, `device_id`, `error_message`                           | ❌ **Not deleted**            | `ON DELETE CASCADE` exists on FK to `auth.users` but soft-delete path bypasses this |
| `data_export_audit_log`                     | `user_id`, `ip_address`                                           | ❌ **Not deleted**            | `ON DELETE CASCADE` exists on FK to `auth.users` but same issue                     |
| `household_invitations` (shared households) | `invited_email`, `invited_by`                                     | ❌ **Not deleted**            | Only deleted for sole-member households                                             |

### 4.4 Cascade Analysis

The `sync_health_logs` and `data_export_audit_log` tables have foreign keys to
`auth.users(id)` with `ON DELETE CASCADE`. Step 8 calls
`supabase.auth.admin.deleteUser()`, which would trigger the cascade. However:

- Step 8 is **best-effort** — if it fails, the auth user persists and cascades
  do not fire (lines 234–241).
- The soft-delete of the `users` table row (Step 6) does **not** trigger
  `ON DELETE CASCADE` because it is an `UPDATE`, not a `DELETE`.
- This means these tables may retain personal data if auth deletion fails.

## 5. Crypto-Shredding Analysis

### 5.1 Current Implementation

The crypto-shredding in the Edge Function is a **placeholder**
(`account-deletion/index.ts:127–130`):

```typescript
// In a production system this would call into the KeyStore service;
// here we record the intent and mark which keys were destroyed.
```

The function generates synthetic fingerprints:

- **Sole-member household:** `shredded:household:{householdId}:{timestamp}` (line 143)
- **Shared household (user leaves):** `revoked:user-key:{householdId}:{userId}:{timestamp}` (line 171)
- **User personal keys:** `shredded:user:{userId}:{timestamp}` (line 177)

### 5.2 What Should Happen

Real crypto-shredding requires:

1. **Key identification** — Look up all encryption keys associated with the user
   and their households in a dedicated key-management service (KMS).
2. **Key destruction** — Irreversibly delete the encryption keys, rendering any
   encrypted data permanently unreadable.
3. **Verification** — Confirm key deletion succeeded before proceeding with the
   rest of the deletion flow.

### 5.3 Impact

Without real crypto-shredding, all "encrypted" data remains readable by anyone
with access to the database. The soft-delete approach alone does not satisfy
GDPR Art. 17 if the data is not also rendered inaccessible, because:

- Soft-deleted records still exist in the database.
- A database administrator or compromised service-role key could read them.
- There is no guarantee of eventual permanent deletion without a hard-delete
  schedule.

### 5.4 KMP CryptoShredder

A KMP `CryptoShredder` abstraction exists in the shared packages
(`packages/sync/src/commonMain/kotlin/com/finance/sync/crypto/CryptoShredder.kt`)
with `shredHouseholdData`, `shredUserData`, and `DeletionCertificate` support.
The Edge Function does not integrate with this abstraction — it generates its
own certificate format.

## 6. Multi-User Household Edge Cases

### 6.1 Sole Member — Household Deleted

When the user is the **only active member** of a household
(`account-deletion/index.ts:139–165`):

- ✅ All household data is soft-deleted (transactions, budgets, goals, accounts,
  categories, invitations)
- ✅ The household itself is soft-deleted
- ✅ Household encryption keys are marked as "shredded" (placeholder)
- ✅ Correct behavior — no other users are affected

### 6.2 Multi-Member — User Leaves

When **other active members** remain in the household
(`account-deletion/index.ts:169–173`):

- ✅ The user's membership is soft-deleted (Step 4)
- ✅ The user's key access is marked as "revoked" (placeholder)
- ⚠️ **Shared household data is NOT soft-deleted** — transactions, accounts,
  budgets, goals, and categories created by the leaving user remain visible to
  other household members.

This is the **correct** default behavior for shared financial data: other
household members need continued access to the shared ledger. However, there
are unresolved questions:

| Question                                                                   | Current Behavior          | GDPR Consideration                                |
| -------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| Are the leaving user's `payee`/`note` fields in transactions anonymized?   | ❌ No                     | May contain PII attributable to the departed user |
| Is the `created_by` field in `households` updated when the creator leaves? | ❌ No                     | Retains a reference to the deleted user's ID      |
| Can the departed user's `user_id` be resolved to personal data?            | ⚠️ Partially              | The `users` row is soft-deleted but still exists  |
| Are invitations sent by the departed user retained?                        | ✅ Yes (shared household) | `invited_by` still references the deleted user    |

### 6.3 Edge Case: Last Admin Leaves

There is no check for whether the departing user is the last `owner` role member
of a shared household. If the only owner deletes their account, the remaining
`member`-role users may lose administrative capabilities. This is a functional
issue more than a GDPR issue, but it should be addressed.

## 7. Deletion Certificate

### 7.1 Certificate Structure

The function returns a deletion certificate
(`account-deletion/index.ts:252–267`):

```json
{
  "deletion_certificate": {
    "certificate_id": "cert-{timestamp}-{random}",
    "subject_type": "USER",
    "subject_id": "{user_id}",
    "deleted_at": "2026-03-16T12:00:00.000Z",
    "households_affected": 2,
    "keys_shredded": 3,
    "key_fingerprints": ["shredded:household:...", "revoked:user-key:...", "shredded:user:..."],
    "verified": true,
    "message": "Your account and associated data have been permanently deleted..."
  }
}
```

### 7.2 Certificate Assessment

| Criterion              | Met | Notes                                                                                       |
| ---------------------- | --- | ------------------------------------------------------------------------------------------- |
| Unique identifier      | ✅  | `cert-{timestamp}-{random}` (lines 38–46)                                                   |
| Timestamp              | ✅  | ISO 8601 `deleted_at`                                                                       |
| Subject identification | ✅  | `subject_type` + `subject_id`                                                               |
| Scope of deletion      | ✅  | `households_affected` + `keys_shredded`                                                     |
| Key fingerprints       | ⚠️  | Currently synthetic, not real cryptographic fingerprints                                    |
| Verification status    | ⚠️  | Always `true` — no actual verification logic                                                |
| Durable storage        | ❌  | Certificate is returned in the response only; not persisted server-side for later retrieval |
| Art. 17 reference      | ✅  | Message explicitly references GDPR Article 17                                               |

### 7.3 Certificate Gaps

- The certificate is **only returned in the HTTP response**. If the user loses
  this response (e.g., network issue, browser crash), there is no way to
  retrieve the certificate later. However, the `audit_log` entry from Step 7
  records the `certificate_id`, so an administrator could reconstruct it.
- The `verified: true` field is hardcoded — there is no post-deletion
  verification that all data was actually soft-deleted successfully.

## 8. Retention Policy and Hard-Delete Schedule

### 8.1 Current State

There is **no implemented hard-delete schedule**. Soft-deleted records remain in
the database indefinitely. This means:

- Personal data marked as `deleted_at` is still queryable by anyone with
  database access (admin, service role).
- The partial indexes (`WHERE deleted_at IS NULL`) exclude soft-deleted records
  from application queries, but the data is still physically present.
- There is no scheduled job, cron, or migration to permanently remove
  soft-deleted records.

### 8.2 Recommended Hard-Delete Schedule

Based on GDPR Art. 17 requirements and industry best practices, the following
retention periods are recommended:

| Data Category                                                                                  | Soft-Delete Retention           | Hard-Delete After             | Justification                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| **User records** (`users`)                                                                     | Immediate soft-delete           | 30 days                       | Grace period for accidental deletion recovery                                 |
| **Household data** (sole-member: `accounts`, `transactions`, `budgets`, `goals`, `categories`) | Immediate soft-delete           | 30 days                       | Same grace period; after 30 days, crypto-shredding makes recovery unnecessary |
| **Household memberships** (`household_members`)                                                | Immediate soft-delete           | 30 days                       | —                                                                             |
| **Passkey credentials** (`passkey_credentials`)                                                | Immediate soft-delete           | 30 days                       | Security material; no reason to retain longer                                 |
| **Household invitations** (`household_invitations`)                                            | Immediate soft-delete           | 30 days                       | Contains PII (`invited_email`)                                                |
| **Audit logs** (`audit_log`)                                                                   | Retained (legal basis required) | 90 days after user deletion   | Legitimate interest for security/fraud detection; document basis              |
| **Sync health logs** (`sync_health_logs`)                                                      | Not currently deleted           | 30 days rolling (all records) | Operational logs; pseudonymous device_id                                      |
| **Data export audit log** (`data_export_audit_log`)                                            | Not currently deleted           | 90 days after user deletion   | Compliance evidence for DSAR fulfillment                                      |
| **WebAuthn challenges** (`webauthn_challenges`)                                                | Not currently deleted           | 5 minutes (TTL-based purge)   | Ephemeral by design                                                           |
| **Households** (sole-member)                                                                   | Immediate soft-delete           | 30 days                       | —                                                                             |

### 8.3 Implementation Approach

The hard-delete schedule should be implemented as a **scheduled PostgreSQL
function or Supabase cron job** that:

1. Runs daily (or more frequently for ephemeral data like challenges).
2. Permanently deletes records where `deleted_at < now() - interval '30 days'`.
3. Logs the number of records purged per table to the audit log.
4. Is idempotent and safe to re-run.

Example SQL for the 30-day hard-delete:

```sql
-- Example: permanently delete soft-deleted users after 30 days
-- DO NOT EXECUTE without human review — see AGENTS.md §Category 8
DELETE FROM users
WHERE deleted_at IS NOT NULL
  AND deleted_at < now() - interval '30 days';
```

## 9. Identified Gaps

### 9.1 Critical

1. **Crypto-shredding is a placeholder** — No actual encryption keys are
   destroyed. The function generates synthetic fingerprints but does not
   integrate with a key-management service. (Lines 127–130)

2. **No hard-delete schedule** — Soft-deleted records persist indefinitely.
   Without eventual permanent deletion, the erasure is not complete under
   GDPR Art. 17.

3. **Missing table coverage** — `webauthn_challenges`, `audit_log`,
   `sync_health_logs`, and `data_export_audit_log` are not addressed by the
   deletion flow.

### 9.2 High

4. **Audit log retention undocumented** — The `audit_log` table is append-only
   with no documented legal basis for post-deletion retention of records
   containing `ip_address`, `user_agent`, and data snapshots.

5. **Shared-household data attribution** — When a user leaves a shared
   household, their contributed data (transaction notes, payees) remains
   without anonymization. There is no per-record attribution model.

6. **Auth deletion is best-effort** — If `auth.admin.deleteUser()` fails
   (Step 8, lines 234–241), the auth identity persists. This means the user
   could still authenticate to a "deleted" account, and `ON DELETE CASCADE`
   foreign keys do not fire.

7. **Deletion certificate not persisted** — The certificate is only returned in
   the HTTP response and is not durably stored for later retrieval by the user
   or support staff.

### 9.3 Medium

8. **No cooling-off period** — The deletion is immediate and irreversible (by
   design via crypto-shredding). Consider a 24–72 hour cooling-off window
   during which the user can cancel, as recommended by some DPAs (Data
   Protection Authorities).

9. **No deletion confirmation email** — The user does not receive an email
   confirming that their account has been deleted, which is a common UX
   practice and aids in GDPR compliance evidence.

10. **Last-admin edge case** — No check for whether the departing user is the
    last `owner` of a shared household.

11. **Client-side deletion not wired** — Android, iOS, and web UIs have
    placeholder implementations that do not call this Edge Function.

## 10. Recommendations

### Critical (Before Launch)

1. **Implement real crypto-shredding** — Integrate with a key-management service
   (or Supabase Vault) to destroy actual encryption keys when a user deletes
   their account. Replace synthetic fingerprints with real key fingerprints.

2. **Implement a 30-day hard-delete schedule** — Create a scheduled PostgreSQL
   function or Supabase cron job that permanently deletes soft-deleted records
   after the 30-day grace period. See [§8.3](#83-implementation-approach) for
   the recommended approach.

3. **Add missing tables to the deletion cascade:**
   - `webauthn_challenges` — Delete by `user_id`
   - `sync_health_logs` — Delete by `user_id`
   - `data_export_audit_log` — Delete by `user_id` (or anonymize)
   - `audit_log` — Define a documented retention period and anonymize
     `ip_address`/`user_agent` at deletion time; hard-delete after the
     retention period expires

### High (Should Address Before Launch)

4. **Document the legal basis for audit-log retention** post-deletion.
   GDPR Art. 17(3)(e) permits retention for "the establishment, exercise or
   defence of legal claims." If this is the basis, document it explicitly and
   set a maximum retention period (recommended: 90 days).

5. **Add shared-household data anonymization** — When a user leaves a shared
   household, anonymize or pseudonymize user-attributable content (e.g.,
   replace `payee` values contributed by the departing user with
   `[Deleted User]`).

6. **Make auth deletion non-optional** — If `auth.admin.deleteUser()` fails,
   retry with exponential backoff or queue for async retry. The auth identity
   must be deleted for the erasure to be complete.

7. **Persist deletion certificates** — Store the certificate in a dedicated
   `deletion_certificates` table (or in the `audit_log`) so the user can
   retrieve it later, and support staff can verify deletion upon request.

### Medium (Post-Launch)

8. **Add a deletion confirmation email** — Send the deletion certificate to the
   user's email address before the email is deleted from the `users` table.

9. **Consider a cooling-off period** — Allow users to cancel deletion within
   24–72 hours. Display a warning during the cooling-off window.

10. **Wire client-side deletion** — Connect Android, iOS, and web settings UIs
    to the server-side deletion endpoint, including local data cleanup (SQLite
    database, SharedPreferences, secure tokens, OPFS/IndexedDB).

11. **Add deletion-propagation integration tests** — Test the full cascade
    across all tables, including edge cases (shared households, failed auth
    deletion, concurrent exports during deletion).

---

_This audit is based on source code as of 2026-03-16. Findings should be
re-validated after any changes to the account-deletion function or database
schema._
