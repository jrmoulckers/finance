# CCPA / CPRA Consumer Rights Verification

> **Issue:** #373
> **Last verified:** 2025-01-23
> **Regulation:** California Consumer Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA)

This document verifies all six CCPA/CPRA consumer rights against the Finance application's actual implementation. Each right is mapped to the specific code path that fulfils it.

---

## Table of Contents

- [Overview](#overview)
- [No-Sale Statement](#no-sale-statement)
- [Consumer Rights Verification](#consumer-rights-verification)
  - [1. Right to Know](#1-right-to-know)
  - [2. Right to Delete](#2-right-to-delete)
  - [3. Right to Opt-Out of Sale/Sharing](#3-right-to-opt-out-of-salesharing)
  - [4. Right to Non-Discrimination](#4-right-to-non-discrimination)
  - [5. Right to Correct](#5-right-to-correct)
  - [6. Right to Limit Use of Sensitive Personal Information](#6-right-to-limit-use-of-sensitive-personal-information)
- [CCPA Category Mapping](#ccpa-category-mapping)
- [Processor List](#processor-list)
- [Implementation References](#implementation-references)

---

## Overview

Finance is a local-first personal finance application. The vast majority of personal information remains on the user's device and never reaches a server unless the user explicitly enables cross-device sync. This architecture inherently limits the scope of CCPA obligations, but the application nonetheless implements all six consumer rights.

---

## No-Sale Statement

**Finance does not sell or share personal information.** This applies to all CCPA-defined categories of personal information the application handles, including identifiers, financial information, and internet activity data.

Specifically:

- No personal information is sold to third parties.
- No personal information is shared for cross-context behavioural advertising.
- No data broker relationships exist.
- No advertising SDK or tracking pixel is integrated.
- Analytics and error reporting are **opt-in only** and use pseudonymous, non-reversible identifiers. Financial data is actively scrubbed before any error report leaves the device (see `apps/web/src/lib/monitoring.ts`).

Because Finance does not sell or share personal information, the "Do Not Sell or Share My Personal Information" link requirement under Cal. Civ. Code § 1798.135 does not apply. The app's [Privacy & Security Guide](../guides/privacy-security.md) states this clearly.

---

## Consumer Rights Verification

### 1. Right to Know

> *Cal. Civ. Code § 1798.100 — The right to know what personal information is collected, used, disclosed, and sold.*

| Aspect               | Implementation                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Disclosure**        | The [Privacy & Security Guide](../guides/privacy-security.md) documents all collected data categories, purposes, and third-party disclosures. |
| **Specific pieces**   | The data-export Edge Function (`services/api/supabase/functions/data-export/index.ts`) exports **all** personal information across 9 tables: `users`, `households`, `household_members`, `accounts`, `categories`, `transactions`, `budgets`, `goals`, and `passkey_credentials`. |
| **Format**            | Exports are available in JSON (machine-readable) and CSV (human-readable). Users select the format via the UI or the `?format=` query parameter. |
| **Access path (web)** | `apps/web/src/components/DataExport.tsx` provides a client-side export from the local SQLite-WASM database. The server-side Edge Function provides a second path for synced data. |
| **Scope**             | Exports include user-scoped data (profile, passkey credentials) and household-scoped data (accounts, transactions, budgets, goals, categories) for every household the user belongs to. |
| **Sensitive columns** | The `public_key` column on passkey credentials is redacted to `[REDACTED]` in exports (see `REDACTED_COLUMNS` in the data-export function). |
| **Audit trail**       | Every export is logged to `data_export_audit_log` and `audit_log` tables, recording the format, record counts, and timestamp — never the exported data itself. |
| **Rate limiting**     | Max 10 exports per user per hour to prevent abuse.                                                                           |
| **Authentication**    | Requires a valid JWT. Only exports data for households the user belongs to. Never exports other users' data within shared households. |

**Verdict: ✅ Implemented**

### 2. Right to Delete

> *Cal. Civ. Code § 1798.105 — The right to request deletion of personal information.*

| Aspect                    | Implementation                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Endpoint**              | `services/api/supabase/functions/account-deletion/index.ts` — a Deno Edge Function accepting `DELETE` requests.              |
| **Confirmation required** | Users must send `{ "confirm": "DELETE_MY_ACCOUNT" }` to prevent accidental deletion.                                        |
| **Deletion scope**        | The function performs a multi-step deletion: (1) audit-logs the request, (2) fetches household memberships, (3) crypto-shreds encryption keys, (4) soft-deletes household data for sole-member households, (5) soft-deletes memberships and passkey credentials, (6) soft-deletes the user record, (7) invalidates the auth session via `supabase.auth.admin.deleteUser()`. |
| **Crypto-shredding**      | Encryption keys are destroyed so that any remaining encrypted data is permanently unreadable. Key fingerprints are recorded for auditability. |
| **Shared households**     | When the user is the sole member of a household, all household data (transactions, budgets, goals, accounts, categories, invitations) is soft-deleted and keys are shredded. When other members exist, only the user's key access is revoked. |
| **Deletion certificate**  | A verifiable certificate is returned containing: certificate ID, subject ID, deletion timestamp, number of affected households, number of shredded keys, and key fingerprints. |
| **Audit trail**           | Two audit records are created: `ACCOUNT_DELETION_REQUESTED` (before any changes) and `ACCOUNT_DELETED` (after completion). |
| **Irreversibility**       | Due to crypto-shredding, deletion is permanent. The deletion certificate message states: *"Encrypted data has been rendered unrecoverable via crypto-shredding."* |

**Verdict: ✅ Implemented**

### 3. Right to Opt-Out of Sale/Sharing

> *Cal. Civ. Code § 1798.120 — The right to opt out of the sale or sharing of personal information.*

**Finance does not sell or share personal information.** There is no sale or sharing activity to opt out of.

- No advertising partners or data brokers receive personal information.
- No cross-context behavioural advertising is performed.
- Sentry error tracking is consent-gated and scrubs all financial data and PII before transmission (see `monitoring.ts`). It is currently disabled pending the consent UI (#367).

Because no sale or sharing occurs, no opt-out mechanism is required. The [Privacy & Security Guide](../guides/privacy-security.md#under-ccpacpra-california) documents this: *"Finance **does not sell** your personal data. Ever."*

**Verdict: ✅ Not applicable (no sale/sharing) — documented**

### 4. Right to Non-Discrimination

> *Cal. Civ. Code § 1798.125 — The right to equal service and price, regardless of exercising privacy rights.*

Finance is not a tiered or ad-supported service. There is no mechanism in the codebase that differentiates service levels based on privacy-right exercise:

- Data export and account deletion are available to all authenticated users equally.
- No feature is gated behind consent to data collection.
- No pricing or functionality differences exist.

**Verdict: ✅ Implemented (by design — no differentiation mechanism exists)**

### 5. Right to Correct

> *Cal. Civ. Code § 1798.106 — The right to correct inaccurate personal information.*

Users can correct any personal information directly within the application:

| Data type                 | Correction method                                        |
| ------------------------- | -------------------------------------------------------- |
| Account details           | Edit in-app (name, type, balance, currency)              |
| Transactions              | Edit in-app (amount, payee, note, category, date, tags)  |
| Budgets                   | Edit in-app (name, amount, period, category)             |
| Goals                     | Edit in-app (name, target amount, current amount, date)  |
| Categories                | Edit in-app (name, icon, color)                          |
| Profile (display name)    | Edit in-app (Settings)                                   |

All edits are written to the local SQLite database immediately and synced to the server via the offline mutation queue when online. The queue supports `INSERT`, `UPDATE`, and `DELETE` operations (see `apps/web/src/db/sync/types.ts`).

**Verdict: ✅ Implemented**

### 6. Right to Limit Use of Sensitive Personal Information

> *Cal. Civ. Code § 1798.121 — The right to limit use and disclosure of sensitive personal information.*

Finance collects the following CCPA-defined sensitive personal information:

| Sensitive PI category     | Collected? | Usage                                                       |
| ------------------------- | ---------- | ----------------------------------------------------------- |
| Government IDs (SSN, etc.)| ❌ No      | Not collected                                               |
| Financial account numbers | ❌ No      | Not collected — users enter display names only              |
| Precise geolocation       | ❌ No      | Not collected                                               |
| Racial/ethnic origin      | ❌ No      | Not collected                                               |
| Communications content    | ❌ No      | Not collected                                               |
| Genetic / biometric data  | ❌ No      | WebAuthn uses device biometrics via the OS — the app never receives biometric data |
| Health data               | ❌ No      | Not collected                                               |
| Sex life / orientation    | ❌ No      | Not collected                                               |
| Login credentials         | ⚠️ Auth only | Email + password used solely for authentication; passwords are never stored client-side |

Because Finance does not collect most categories of sensitive PI and uses login credentials solely for authentication (an exempted use under CPRA), no additional limitation mechanism is required.

**Verdict: ✅ Implemented (by data minimisation — most sensitive PI is not collected)**

---

## CCPA Category Mapping

The following table maps all personal information collected by Finance to CCPA categories (Cal. Civ. Code § 1798.140(v)).

| CCPA Category | Data Collected | Source | Business Purpose | Sold? | Shared? |
| --- | --- | --- | --- | --- | --- |
| **A. Identifiers** | Email address, user ID (UUID), household member ID | User registration | Account authentication and household membership | No | No |
| **B. Personal information (Cal. Civ. Code § 1798.80(e))** | Email address | User registration | Account identification | No | No |
| **D. Commercial information** | Transaction records (amounts, dates, payees, notes), account balances, budgets, savings goals | User input | Core application functionality — personal finance tracking | No | No |
| **F. Internet or electronic network activity** | Sync metadata (timestamps, device IDs), audit logs (export/deletion events), rate-limit counters, IP address (logged in audit entries) | Automatic collection during sync and API usage | Sync coordination, security, abuse prevention | No | No |
| **G. Geolocation data** | Not collected | — | — | No | No |
| **H. Sensory data** | Not collected (biometric verification is device-local via WebAuthn) | — | — | No | No |
| **I. Professional/employment information** | Not collected | — | — | No | No |
| **K. Inferences** | Not collected — no profiling or inference engine exists | — | — | No | No |
| **L. Sensitive personal information** | Login credentials (email + password hash, server-side only) | User registration | Authentication only | No | No |

### Categories not listed

CCPA categories C (protected classifications), E (biometric), and J (education) are not collected by Finance.

---

## Processor List

The following third-party processors handle personal information on behalf of Finance. All processors are bound by data processing agreements and access only the minimum data required for their function.

| Processor | Role | Data Accessed | Data Readable? | DPA in Place? |
| --- | --- | --- | --- | --- |
| **Supabase** | Backend database, authentication, Edge Functions | Email, encrypted financial data, sync metadata, audit logs | Email and metadata only — financial data is end-to-end encrypted and unreadable to Supabase | Yes |
| **PowerSync** | Offline sync coordination | Encrypted data in transit | No — encrypted data only | Yes |
| **Sentry** (opt-in, consent-gated) | Error tracking and crash reporting | Pseudonymous user ID, scrubbed error context | No PII, no financial data — all sensitive fields are scrubbed before transmission via `scrubFinancialData()` in `monitoring.ts` | Yes |
| **Deno Deploy** (via Supabase Edge Functions) | Serverless function execution | Same as Supabase (runs within Supabase infrastructure) | Same as Supabase | Covered by Supabase DPA |

### Processor data flow

```
User device ──► Supabase (auth + encrypted sync) ──► PostgreSQL (encrypted at rest)
     │                    │
     │                    ├──► Edge Functions (data-export, account-deletion)
     │                    │
     │                    └──► PowerSync (sync coordination, encrypted data only)
     │
     └──► Sentry (opt-in, scrubbed error reports only)
```

---

## Implementation References

| Right | Primary Implementation | Supporting Code |
| --- | --- | --- |
| Right to Know | `services/api/supabase/functions/data-export/index.ts` | `apps/web/src/components/DataExport.tsx` |
| Right to Delete | `services/api/supabase/functions/account-deletion/index.ts` | — |
| Right to Opt-Out | Not applicable (no sale/sharing) | `docs/guides/privacy-security.md` |
| Right to Non-Discrimination | By design (no tiering mechanism) | — |
| Right to Correct | All repository CRUD operations in `apps/web/src/db/repositories/` | `apps/web/src/db/sync/` (mutation queue for syncing corrections) |
| Right to Limit Sensitive PI | By data minimisation (most sensitive PI not collected) | `apps/web/src/lib/monitoring.ts` (scrubbing) |
