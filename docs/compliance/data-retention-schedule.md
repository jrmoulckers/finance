# Data Retention Schedule

> **Issue:** [#1313](https://github.com/jrmoulckers/finance/issues/1313)
> **Last updated:** 2025-07-27
> **Status:** Alpha — living document
> **Applies to:** All Finance environments (debug, staging, release)

> **⚠️ DISCLAIMER:** This document defines intended retention periods for alpha
> and pre-launch use. It is not legal advice. Have qualified legal counsel review
> all retention periods before making compliance claims. Retention periods may
> change as the product matures.

> **Satisfies:** `PROD-COMP-005` — Product obligations are defined in
> [jrmoulckers/product](https://github.com/jrmoulckers/product), pinned to
> [`3a752c1`](https://github.com/jrmoulckers/product/blob/3a752c11856515a74eb204675d5d5198cac1e48e/principles/compliance.md).
> This document is the local evidence; the obligation is central. These principles
> establish governance and qualified-review triggers and are not legal advice.

---

## Table of Contents

- [Overview](#overview)
- [Retention Schedule](#retention-schedule)
  - [User and Profile Data](#user-and-profile-data)
  - [Financial Data](#financial-data)
  - [Household and Collaboration Data](#household-and-collaboration-data)
  - [Authentication and Security Data](#authentication-and-security-data)
  - [Operational and Diagnostic Data](#operational-and-diagnostic-data)
  - [Optional Processing Data](#optional-processing-data)
  - [Infrastructure Data](#infrastructure-data)
- [Retention Summary Table](#retention-summary-table)
- [Deletion Mechanisms](#deletion-mechanisms)
- [Implementation Status](#implementation-status)
- [Related Documents](#related-documents)

---

## Overview

Finance follows the **data minimisation** principle (GDPR Art. 5(1)(c),(e)):
personal data is kept only for as long as necessary to fulfil the purposes for
which it was collected. This schedule defines the authoritative retention periods
for all categories of data processed by Finance.

### Guiding Principles

1. **Retain the minimum.** Data is deleted or anonymised when no longer needed.
2. **User control first.** Users can delete their own data at any time via
   in-app controls or the account-deletion Edge Function.
3. **Transparent defaults.** Retention periods are documented here and
   summarised in the [Privacy Policy](../legal/privacy-policy.md#8-data-retention).
4. **Automated enforcement.** Retention limits should be enforced by scheduled
   purge jobs (pg_cron or Edge Function cron), not manual processes.

---

## Retention Schedule

### User and Profile Data

| Data                                                                    | Storage Location                   | Retention Period                                       | Trigger for Deletion           | Legal Basis                     |
| ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ | ------------------------------ | ------------------------------- |
| User profile (`users` table: email, display name, avatar URL, currency) | Supabase PostgreSQL + local SQLite | **Account lifetime** — retained until account deletion | User requests account deletion | Art. 6(1)(b) Contract           |
| Soft-deleted user profile                                               | Supabase PostgreSQL                | **30 days** after soft-delete, then hard-deleted       | Automated purge job            | Art. 5(1)(e) Storage limitation |

### Financial Data

| Data                                               | Storage Location                   | Retention Period                                                                             | Trigger for Deletion           | Legal Basis                     |
| -------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------- |
| Accounts, transactions, budgets, goals, categories | Supabase PostgreSQL + local SQLite | **Account lifetime** — retained until account deletion or individual record deletion by user | User deletes record or account | Art. 6(1)(b) Contract           |
| Soft-deleted financial records                     | Supabase PostgreSQL                | **30 days** after soft-delete, then hard-deleted                                             | Automated purge job            | Art. 5(1)(e) Storage limitation |
| Transaction notes (free-text)                      | Supabase PostgreSQL + local SQLite | Same as transaction record                                                                   | Same as transaction record     | Art. 6(1)(b) Contract           |

### Household and Collaboration Data

| Data                              | Storage Location                   | Retention Period                                                                                         | Trigger for Deletion                      | Legal Basis                                            |
| --------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| Household records and memberships | Supabase PostgreSQL + local SQLite | **Account lifetime** — retained until last member deletes account or household is dissolved              | Account deletion or household dissolution | Art. 6(1)(b) Contract                                  |
| Household invitations             | Supabase PostgreSQL                | **7 days after expiry** — invitations expire after 72 hours; expired invitations are purged 7 days later | Automated purge job                       | Art. 6(1)(b) Contract; Art. 5(1)(e) Storage limitation |

### Authentication and Security Data

| Data                                                                  | Storage Location       | Retention Period                                                                                          | Trigger for Deletion                | Legal Basis                                 |
| --------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------- |
| Passkey credentials (credential ID, public key, counter, device type) | Supabase PostgreSQL    | **Account lifetime** — retained until user removes the passkey or deletes account                         | User revocation or account deletion | Art. 6(1)(f) Legitimate interest (security) |
| WebAuthn challenge data                                               | Supabase PostgreSQL    | **5 minutes** — challenge expires after the authentication ceremony completes or times out                | Automated purge (expires_at)        | Art. 6(1)(f) Legitimate interest (security) |
| Session tokens and refresh cookies                                    | Supabase Auth (GoTrue) | **Per GoTrue configuration (24-hour timebox)** — session lifetime is configured in Supabase Auth settings | Session expiry or user sign-out     | Art. 6(1)(b) Contract                       |
| Refresh tokens                                                        | Supabase Auth (GoTrue) | **Per GoTrue configuration** — revoked on sign-out; expired tokens purged by Supabase                     | Token expiry or revocation          | Art. 6(1)(b) Contract                       |

### Operational and Diagnostic Data

| Data                                             | Storage Location    | Retention Period                                                         | Trigger for Deletion             | Legal Basis                      |
| ------------------------------------------------ | ------------------- | ------------------------------------------------------------------------ | -------------------------------- | -------------------------------- |
| Audit logs (`audit_log` table)                   | Supabase PostgreSQL | **90 days** — append-only; purged after retention window                 | Automated purge job (pg_cron)    | Art. 6(1)(f) Legitimate interest |
| Data export audit logs (`data_export_audit_log`) | Supabase PostgreSQL | **90 days**                                                              | Automated purge job (pg_cron)    | Art. 6(1)(f) Legitimate interest |
| Sync health logs (`sync_health_logs`)            | Supabase PostgreSQL | **30 days**                                                              | Automated purge job (pg_cron)    | Art. 6(1)(f) Legitimate interest |
| Deletion audit records                           | Supabase PostgreSQL | **1 year** — retained longer for legal compliance and dispute resolution | Automated purge or manual review | Art. 6(1)(c) Legal obligation    |

### Optional Processing Data

| Data                      | Storage Location                  | Retention Period                                                                  | Trigger for Deletion                   | Legal Basis          |
| ------------------------- | --------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- | -------------------- |
| Analytics events (opt-in) | Sentry / analytics provider       | **26 months from collection** or until consent is withdrawn, whichever is earlier | Consent withdrawal or automated expiry | Art. 6(1)(a) Consent |
| Crash reports (opt-in)    | Sentry / crash reporting provider | **26 months from collection** or until consent is withdrawn                       | Consent withdrawal or automated expiry | Art. 6(1)(a) Consent |

### Infrastructure Data

| Data                                                      | Storage Location                                              | Retention Period                                       | Trigger for Deletion                                  | Legal Basis                      |
| --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- | -------------------------------- |
| Encrypted database backups                                | Supabase infrastructure                                       | **30-day rolling window** — older backups overwritten  | Automated backup rotation                             | Art. 6(1)(f) Legitimate interest |
| Local device data (SQLite, OPFS, IndexedDB, localStorage) | User's device                                                 | **Until sign-out, app uninstall, or account deletion** | User action; `Clear-Site-Data` header on logout (web) | Art. 6(1)(b) Contract            |
| Preferences and onboarding data                           | User's device (SharedPreferences, UserDefaults, localStorage) | **Until changed, app reset, or account deletion**      | User action                                           | Art. 6(1)(b) Contract            |

---

## Retention Summary Table

Quick reference for all retention periods:

| Data Category                                                            | Retention Period                          |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| User financial data (accounts, transactions, budgets, goals, categories) | Until account deletion                    |
| User profile data                                                        | Until account deletion                    |
| Soft-deleted records (all types)                                         | 30 days after soft-delete                 |
| Audit logs                                                               | 90 days                                   |
| Data export audit logs                                                   | 90 days                                   |
| Sync health logs                                                         | 30 days                                   |
| Deletion audit records                                                   | 1 year                                    |
| WebAuthn challenges                                                      | 5 minutes                                 |
| Session tokens                                                           | Per GoTrue config (24-hour timebox)       |
| Household invitations                                                    | 7 days after expiry                       |
| Passkey credentials                                                      | Until user revocation or account deletion |
| Analytics and crash reports (opt-in)                                     | 26 months or consent withdrawal           |
| Encrypted backups                                                        | 30-day rolling window                     |
| Local device data                                                        | Until sign-out or uninstall               |

---

## Deletion Mechanisms

### User-Initiated Deletion

| Mechanism              | Scope                                                         | Implementation                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-app record deletion | Individual accounts, transactions, budgets, goals, categories | Soft-delete via `deleted_at` timestamp; hard-delete after 30-day grace period                                                                                                   |
| Account deletion       | All user data across all tables                               | [`account-deletion` Edge Function](../../services/api/supabase/functions/account-delete/index.ts) — cascading soft-delete with crypto-shredding intent and deletion certificate |
| Data export            | Full data portability before deletion                         | [`data-export` Edge Function](../../services/api/supabase/functions/data-export/index.ts) — JSON/CSV export of user data                                                        |

### Automated Purge Jobs

The following purge jobs enforce retention limits. They should be implemented as
PostgreSQL `pg_cron` scheduled tasks or Supabase Edge Function crons.

| Purge Job                     | Target Table(s)              | Condition                                 | Schedule         |
| ----------------------------- | ---------------------------- | ----------------------------------------- | ---------------- |
| Expired WebAuthn challenges   | `webauthn_challenges`        | `expires_at < NOW()`                      | Every 15 minutes |
| Expired household invitations | `household_invitations`      | `expires_at + INTERVAL '7 days' < NOW()`  | Daily            |
| Sync health log rotation      | `sync_health_logs`           | `created_at + INTERVAL '30 days' < NOW()` | Daily            |
| Audit log rotation            | `audit_log`                  | `created_at + INTERVAL '90 days' < NOW()` | Daily            |
| Export audit log rotation     | `data_export_audit_log`      | `created_at + INTERVAL '90 days' < NOW()` | Daily            |
| Soft-deleted record purge     | All tables with `deleted_at` | `deleted_at + INTERVAL '30 days' < NOW()` | Daily            |

> **⚠️ Implementation status:** These purge jobs are **defined but not yet
> implemented**. See [Implementation Status](#implementation-status) below and
> the [GDPR Right to Erasure Audit](gdpr-right-to-erasure-audit.md) for gap
> details.

---

## Implementation Status

| Requirement                                | Status             | Notes                                                                    |
| ------------------------------------------ | ------------------ | ------------------------------------------------------------------------ |
| Retention periods defined                  | ✅ Defined         | This document                                                            |
| Privacy policy reflects retention schedule | ✅ Documented      | [Privacy Policy § 8](../legal/privacy-policy.md#8-data-retention)        |
| WebAuthn challenge purge job               | ❌ Not implemented | `expires_at` column exists; needs pg_cron job                            |
| Household invitation purge job             | ❌ Not implemented | `expires_at` column exists; needs pg_cron job                            |
| Sync health log purge job                  | ❌ Not implemented | Needs pg_cron job                                                        |
| Audit log purge job                        | ❌ Not implemented | Needs pg_cron job; consider archival before deletion                     |
| Soft-deleted record hard-delete job        | ❌ Not implemented | Needs pg_cron job across all `deleted_at` tables                         |
| Crypto-shredding (actual key destruction)  | ❌ Placeholder     | Currently synthetic; see [erasure audit](gdpr-right-to-erasure-audit.md) |
| `Clear-Site-Data` header on web logout     | ❌ Not implemented | Needed for local device data cleanup                                     |
| Deletion certificate                       | ✅ Implemented     | Returned by `account-deletion` Edge Function                             |

---

## Related Documents

- [Privacy Policy](../legal/privacy-policy.md) — User-facing privacy policy
  (retention summary in § 8)
- [Terms of Service](../legal/terms-of-service.md) — Alpha terms including
  account termination provisions
- [GDPR Data Inventory](data-inventory.md) — Field-level data inventory with
  retention schedule cross-reference
- [GDPR Right to Erasure Audit](gdpr-right-to-erasure-audit.md) — Art. 17
  implementation audit
- [GDPR Data Minimization Audit](data-minimization-audit.md) — Field necessity
  review and retention guidance
- [Privacy Compliance Review](privacy-compliance-review.md) — Full GDPR/CCPA
  compliance assessment
- [CCPA/CPRA Privacy Notice](../legal/ccpa-notice.md) — California-specific
  privacy disclosures

---

## Document History

| Date       | Change                                                   | Author                 |
| ---------- | -------------------------------------------------------- | ---------------------- |
| 2025-07-27 | Initial data retention schedule created from issue #1313 | docs-writer (AI agent) |
