# GDPR Right to Access Audit

**Issue:** #363
**Date:** 2026-03-16
**Regulation:** GDPR Article 15 (Right of Access), Article 20 (Right to Data Portability)
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
4. [Table Coverage Matrix](#4-table-coverage-matrix)
5. [Encrypted and Sensitive Field Handling](#5-encrypted-and-sensitive-field-handling)
6. [Format and Portability (Art. 20)](#6-format-and-portability-art-20)
7. [Security Controls](#7-security-controls)
8. [Identified Gaps](#8-identified-gaps)
9. [Recommendations](#9-recommendations)

---

## 1. Summary

Finance implements a server-side data-export Edge Function at
`services/api/supabase/functions/data-export/index.ts` that supports GDPR
Article 20 data portability. The function exports user data in JSON or CSV
format, is authenticated, rate-limited, and audit-logged. However, the export
**does not cover all tables containing personal data**, which means the
implementation does not yet satisfy the full scope of GDPR Article 15 (right of
access).

**Compliance estimate:** ~70% for Art. 15 (access), ~85% for Art. 20 (portability format).

## 2. Scope

This audit examines:

- The server-side export function (`services/api/supabase/functions/data-export/index.ts`)
- The database schema (`services/api/supabase/migrations/`)
- Coverage of all tables containing personal data as cataloged in the
  [Privacy Audit v1](../architecture/privacy-audit-v1.md)

Out of scope: client-side (KMP) export service, app UI wiring, manual/assisted
DSAR workflows.

## 3. Implementation Analysis

### 3.1 How the Export Works

The export function (`data-export/index.ts:167–424`) follows this flow:

1. **Authentication** — Requires a valid JWT via `requireAuth(req)` (line 187–191).
2. **Format resolution** — Accepts `?format=json` or `?format=csv`, falling back
   to the `Accept` header (lines 96–110).
3. **Rate limiting** — Maximum 10 exports per user per hour, checked against
   `data_export_audit_log` (lines 227–244).
4. **Household scoping** — Fetches the user's active household memberships to
   determine which household-scoped data to include (lines 249–260).
5. **Data collection** — Iterates over `EXPORTABLE_TABLES`, querying each table
   with user-scoped or household-scoped filters (lines 267–290).
6. **Redaction** — Redacts sensitive columns (`public_key`) before export
   (lines 114–123, 289).
7. **Audit logging** — Logs the export to both `data_export_audit_log` and
   `audit_log` (lines 297–320).
8. **Streaming response** — Streams the result in 64 KB chunks for JSON, or as a
   single encoded block for CSV (lines 338–402).

### 3.2 Exportable Tables Definition

From `data-export/index.ts:52–62`:

```typescript
const EXPORTABLE_TABLES = [
  { name: 'users', filterBy: 'id', isUserScoped: true },
  { name: 'households', filterBy: 'id', isHouseholdScoped: true },
  { name: 'household_members', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'accounts', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'categories', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'transactions', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'budgets', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'goals', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'passkey_credentials', filterBy: 'user_id', isUserScoped: true },
];
```

## 4. Table Coverage Matrix

The following matrix compares all database tables that contain personal data
(per the initial schema and auth-config migrations) against the tables included
in the export function.

| Table                   | Contains Personal Data                             | Included in Export | Scoping                 | Notes                                         |
| ----------------------- | -------------------------------------------------- | ------------------ | ----------------------- | --------------------------------------------- |
| `users`                 | ✅ email, display_name, avatar_url, currency_code  | ✅ Yes             | User-scoped (`id`)      | —                                             |
| `households`            | ✅ name, created_by                                | ✅ Yes             | Household-scoped (`id`) | —                                             |
| `household_members`     | ✅ user_id, role, joined_at                        | ✅ Yes             | Household-scoped        | May expose other members' `user_id` — see §5  |
| `accounts`              | ✅ name, type, balance_cents                       | ✅ Yes             | Household-scoped        | —                                             |
| `categories`            | ✅ name, icon, color                               | ✅ Yes             | Household-scoped        | —                                             |
| `transactions`          | ✅ amount_cents, payee, note, date                 | ✅ Yes             | Household-scoped        | —                                             |
| `budgets`               | ✅ amount_cents, period, date range                | ✅ Yes             | Household-scoped        | —                                             |
| `goals`                 | ✅ name, target_cents, current_cents               | ✅ Yes             | Household-scoped        | —                                             |
| `passkey_credentials`   | ✅ credential_id, device_type, transports          | ✅ Yes             | User-scoped             | `public_key` redacted                         |
| `household_invitations` | ✅ invited_email, invite_code, invited_by          | ❌ **Missing**     | —                       | Contains PII (email addresses)                |
| `webauthn_challenges`   | ⚠️ challenge, user_id                              | ❌ **Missing**     | —                       | Ephemeral (5-min TTL) but still personal data |
| `audit_log`             | ✅ user_id, ip_address, user_agent, old/new values | ❌ **Missing**     | —                       | Contains IP, user-agent, and data snapshots   |
| `sync_health_logs`      | ⚠️ user_id, device_id, error_message               | ❌ **Missing**     | —                       | Pseudonymous device_id, but linked to user_id |
| `data_export_audit_log` | ✅ user_id, ip_address, export metadata            | ❌ **Missing**     | —                       | Contains IP addresses                         |

### Coverage Summary

- **Included:** 9 of 14 tables (64%)
- **Missing:** 5 tables containing personal data

## 5. Encrypted and Sensitive Field Handling

### 5.1 Redacted Fields

The export redacts the following columns (`data-export/index.ts:65`):

```typescript
const REDACTED_COLUMNS = new Set(['public_key']);
```

The `public_key` field in `passkey_credentials` is replaced with `'[REDACTED]'`
(line 119). This is appropriate — public keys are security material, not
personal data a user needs in a data export.

### 5.2 Fields Exported in Cleartext

The following sensitive fields are exported without transformation:

| Field           | Table                              | Risk                                           |
| --------------- | ---------------------------------- | ---------------------------------------------- |
| `email`         | `users`                            | PII — correct to include in user's own export  |
| `display_name`  | `users`                            | PII — correct to include                       |
| `payee`         | `transactions`                     | May contain names of individuals or businesses |
| `note`          | `transactions`                     | Free-text, may contain sensitive information   |
| `balance_cents` | `accounts`                         | Sensitive financial data — correct to include  |
| `amount_cents`  | `transactions`, `budgets`, `goals` | Financial data — correct to include            |

These are all the user's own data and are appropriate to include in a
data-portability export.

### 5.3 Third-Party Data Exposure

The `household_members` table is exported with a household-scoped filter, which
means the export may include **other users' `user_id` values** from shared
households. While UUIDs are pseudonymous, they could be correlated with other
data. The `households` table also includes `created_by` which references another
user's ID.

**Risk level:** Medium. GDPR Art. 15(4) states the right to obtain a copy must
not adversely affect the rights and freedoms of others. Other members' UUIDs
alone are low-risk but should be reviewed.

## 6. Format and Portability (Art. 20)

GDPR Article 20 requires data to be provided in a "structured, commonly used
and machine-readable format."

### 6.1 JSON Format

The JSON export (`data-export/index.ts:367–401`) produces:

```json
{
  "export_date": "2026-03-16T12:00:00.000Z",
  "user_id": "uuid",
  "format_version": "1.0",
  "data": {
    "users": [...],
    "households": [...],
    ...
  }
}
```

- ✅ **Structured** — Well-defined JSON object with consistent schema
- ✅ **Machine-readable** — Standard JSON format
- ✅ **Commonly used** — JSON is universally supported
- ✅ **Versioned** — `format_version: "1.0"` supports forward compatibility
- ✅ **Streamed** — 64 KB chunks for large datasets (lines 383–390)
- ✅ **Timestamped filename** — `finance-export-{timestamp}.json`

### 6.2 CSV Format

The CSV export (`data-export/index.ts:338–365`) produces multi-table CSV with
section headers:

```
# Table: users
# Records: 1
id,email,display_name,...
uuid,user@example.com,User Name,...

# Table: accounts
# Records: 3
...
```

- ✅ **Machine-readable** — Standard CSV with proper escaping (lines 134–149)
- ✅ **Commonly used** — CSV is widely supported by spreadsheet applications
- ⚠️ **Multi-table format** — The `# Table:` comment syntax is non-standard;
  some parsers may not handle it cleanly
- ✅ **Timestamped filename** — `finance-export-{timestamp}.csv`

### 6.3 Content-Disposition

Both formats set a `Content-Disposition` header via `streamingResponse()`,
prompting the browser to download the file (line 360–365, 396–401).

### 6.4 Portability Assessment

| Requirement      | JSON | CSV                            |
| ---------------- | ---- | ------------------------------ |
| Structured       | ✅   | ✅                             |
| Commonly used    | ✅   | ✅                             |
| Machine-readable | ✅   | ✅                             |
| Interoperable    | ✅   | ⚠️ Multi-table needs splitting |

**Verdict:** Both formats satisfy Art. 20 portability requirements. JSON is the
stronger choice for machine-to-machine portability.

## 7. Security Controls

| Control                       | Implemented | Evidence                                                            |
| ----------------------------- | ----------- | ------------------------------------------------------------------- |
| Authentication required       | ✅          | `requireAuth(req)` (line 187)                                       |
| User can only export own data | ✅          | User-scoped and household-membership-scoped queries (lines 270–278) |
| Rate limiting                 | ✅          | 10 exports/hour via `data_export_audit_log` (lines 227–244)         |
| CORS origin validation        | ✅          | `getCorsHeaders(request)` / `ALLOWED_ORIGINS` env var (line 27)     |
| Request size limit            | ✅          | Max 1 KB Content-Length for GET (lines 214–222)                     |
| Sensitive column redaction    | ✅          | `public_key` → `[REDACTED]` (lines 65, 119)                         |
| Audit logging                 | ✅          | Dual logging: `data_export_audit_log` + `audit_log` (lines 297–320) |
| Error detail suppression      | ✅          | Structured errors never leak internals (lines 75–88)                |
| Failure audit logging         | ✅          | Best-effort failure logging in catch block (lines 406–419)          |
| Soft-delete filtering         | ✅          | Memberships filtered by `deleted_at IS NULL` (line 254)             |

## 8. Identified Gaps

### 8.1 Critical — Incomplete Table Coverage

Five tables containing personal data are excluded from the export:

1. **`household_invitations`** — Contains `invited_email` (PII), `invite_code`,
   and references to the inviting user. Users have a right to access records of
   invitations they sent or received.

2. **`audit_log`** — Contains `user_id`, `ip_address`, `user_agent`, and
   `old_values`/`new_values` JSONB snapshots. Under GDPR, users have the right
   to know what processing records exist about them, including security logs.

3. **`data_export_audit_log`** — Contains `user_id`, `ip_address`, and export
   metadata. This is personal data about the user's own export history.

4. **`sync_health_logs`** — Contains `user_id`, `device_id`, and potentially
   identifying `error_message` content.

5. **`webauthn_challenges`** — Contains `user_id` and `challenge`. Although
   ephemeral (5-minute TTL), any records that still exist at export time should
   be included.

### 8.2 High — No Soft-Delete Filter on Exported Data

The export queries each table with `select('*')` without filtering out
soft-deleted records (lines 268–280). Only `household_members` is filtered by
`deleted_at IS NULL` when determining which households to export (line 254).
This means the export may include soft-deleted transactions, accounts, and other
records. While including deleted records may be desirable for completeness, this
should be a deliberate, documented choice.

### 8.3 High — Third-Party Data in Shared Households

When exporting `household_members` for a shared household, the export includes
all members' rows — including other users' `user_id`, `role`, and `joined_at`.
GDPR Art. 15(4) requires that the right of access not adversely affect others'
rights. Consider:

- Redacting other members' `user_id` to a hash or pseudonym
- Including only the requesting user's own membership rows
- Adding a note explaining that limited third-party data is included

### 8.4 Medium — No Identity Verification Workflow

The export relies solely on JWT authentication. GDPR Art. 12(6) permits the
controller to request additional identity verification when there are
"reasonable doubts" about the requester's identity. There is no documented
manual/assisted DSAR (Data Subject Access Request) workflow for cases where
self-service is insufficient.

### 8.5 Medium — No 30-Day Response Deadline Tracking

GDPR Art. 12(3) requires responding to access requests "without undue delay and
in any event within one month." The self-service export is immediate, but there
is no process for tracking or escalating requests that fail or require manual
intervention.

## 9. Recommendations

### Critical (Before Launch)

1. **Add the 5 missing tables to `EXPORTABLE_TABLES`:**
   - `household_invitations` (household-scoped by `household_id`)
   - `audit_log` (user-scoped by `user_id`)
   - `data_export_audit_log` (user-scoped by `user_id`)
   - `sync_health_logs` (user-scoped by `user_id`)
   - `webauthn_challenges` (user-scoped by `user_id`)

2. **Decide on soft-delete inclusion** — Either explicitly filter
   `deleted_at IS NULL` on all tables, or document that soft-deleted records are
   intentionally included for completeness.

3. **Add third-party data redaction rules** for `household_members` to prevent
   exposing other users' identifiers in a shared-household export.

### High (Should Address Before Launch)

4. **Document an assisted DSAR workflow** for cases where self-service export is
   unavailable or insufficient (e.g., account locked, auth issues).

5. **Add `audit_log` IP/user-agent redaction** to the `REDACTED_COLUMNS` set,
   or document the legal basis for including these fields in the export.

6. **Add export-failure retry/notification** so users are informed if an export
   fails and can retry without counting against the rate limit.

### Medium (Post-Launch)

7. **Split multi-table CSV** into separate per-table CSV files (e.g., in a ZIP
   archive) for better interoperability with spreadsheet tools.

8. **Add a DSAR response deadline tracker** to ensure the 30-day Art. 12(3)
   deadline is met for any manually-handled requests.

9. **Wire client-side export UIs** (Android, iOS, web) to the server-side export
   endpoint — currently all three platforms have placeholder implementations.

---

_This audit is based on source code as of 2026-03-16. Findings should be
re-validated after any changes to the data-export function or database schema._
