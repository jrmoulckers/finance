# GDPR & CCPA/CPRA Privacy Compliance Review

> **Issue:** [#79](https://github.com/jrmoulckers/finance/issues/79)
> **Reviewer:** Security & Privacy Reviewer
> **Date:** 2025-07-27
> **Scope:** Full-stack GDPR, CCPA/CPRA privacy compliance assessment
> **Status:** Review complete — remediation required before launch

---

## Executive Summary

This review assesses the Finance application’s compliance posture against the EU
General Data Protection Regulation (GDPR) and the California Consumer Privacy
Act as amended by the California Privacy Rights Act (CCPA/CPRA). The review
covers all platforms (Android, iOS, web, Windows), the Supabase backend
(PostgreSQL, Edge Functions, Auth), the PowerSync sync layer, and all
documentation in `docs/compliance/`, `docs/legal/`, and `docs/architecture/`.

### Overall Compliance Estimate

| Regulation    | Estimated Compliance | Launch Readiness |
| ------------- | -------------------- | ---------------- |
| **GDPR**      | ~55%                 | ❌ Not ready     |
| **CCPA/CPRA** | ~60%                 | ❌ Not ready     |

### Key Strengths

1. **Privacy-by-design architecture.** The local-first (edge-first) architecture inherently minimizes server-side data exposure. All reads/writes happen against a local SQLite database; server sync is opt-in.
2. **Comprehensive data inventory.** `docs/compliance/data-inventory.md` provides field-level GDPR mapping for every table, including legal basis, encryption status, and data category — a strong Article 30 Records of Processing Activities (ROPA) foundation.
3. **Row-Level Security.** RLS is enabled on all core Supabase tables with tenant-isolation policies per `20260306000002_rls_policies.sql`. The `auth.household_ids()` helper function enforces household-scoped access.
4. **PowerSync column allowlisting.** The `sync-rules.yaml` enumerates columns explicitly rather than `SELECT *`, excluding `sync_version`, `is_synced`, and notably `public_key` from passkey credentials.
5. **Data export (Art. 20).** The `data-export` Edge Function covers 9 tables, redacts `public_key`, is rate-limited (10/hour), audit-logged, and streams responses for large datasets.
6. **Account deletion (Art. 17).** The `account-deletion` Edge Function implements cascading soft-delete, audit logging, crypto-shredding intent, multi-household handling, and returns a deletion certificate.
7. **Monitoring is consent-gated.** `CrashReporter` and `MetricsCollector` contracts require consent before any data collection. Android defaults to `{ false }`. Web Sentry is disabled pending consent. PII/financial scrubbing is implemented in `monitoring.ts`.
8. **No data sale or sharing.** No advertising SDK, data broker, or cross-context behavioral advertising integration exists anywhere in the codebase.
9. **Structured logging excludes PII.** `logger.ts` documents that tokens, passwords, emails, and financial amounts must never be logged.
10. **CORS is allowlist-based.** `cors.ts` never uses wildcard `*`; only explicitly allowed origins from `ALLOWED_ORIGINS` env var are echoed.

### Blocking Gaps (must fix before launch)

| #   | Gap                                                                     | GDPR Articles         | CCPA Sections          | Severity     |
| --- | ----------------------------------------------------------------------- | --------------------- | ---------------------- | ------------ |
| 1   | Crypto-shredding is a placeholder — no actual key destruction           | Art. 17               | § 1798.105             | **CRITICAL** |
| 2   | No consent capture, record, or withdrawal UI for optional processing    | Art. 7, Art. 6(1)(a)  | § 1798.100(d)          | **CRITICAL** |
| 3   | Client-side deletion not wired on any platform                          | Art. 17               | § 1798.105             | **CRITICAL** |
| 4   | Privacy policy and CCPA notice are unpublished drafts                   | Art. 13, Art. 14      | § 1798.100, § 1798.130 | **CRITICAL** |
| 5   | Web OPFS/IndexedDB stores financial data unencrypted                    | Art. 32               | —                      | **CRITICAL** |
| 6   | Data export missing 4+ tables with personal data                        | Art. 15, Art. 20      | § 1798.100, § 1798.130 | **HIGH**     |
| 7   | Audit log retention unbounded, contains PII in JSONB columns            | Art. 5(1)(e)          | —                      | **HIGH**     |
| 8   | No hard-delete schedule for soft-deleted records                        | Art. 5(1)(c), Art. 17 | § 1798.105             | **HIGH**     |
| 9   | Android stores PII in plain SharedPreferences                           | Art. 32               | —                      | **HIGH**     |
| 10  | Service worker caches API responses that may contain PII/financial data | Art. 5(1)(f), Art. 32 | —                      | **HIGH**     |

---

## 1. Data Protection Impact Assessment (DPIA) Summary

### 1.1 DPIA Screening (EDPB WP 248 rev.01)

| #   | EDPB Criterion                              | Applies?    | Rationale                                               |
| --- | ------------------------------------------- | ----------- | ------------------------------------------------------- |
| 1   | Evaluation or scoring                       | ❌ No       | No profiling, credit scoring, or behavioral prediction  |
| 2   | Automated decision-making with legal effect | ❌ No       | No automated decisions affecting users                  |
| 3   | Systematic monitoring                       | ❌ No       | No surveillance or public space monitoring              |
| 4   | Sensitive/highly personal data              | ⚠️ Yes      | Financial data is "highly personal" per EDPB guidelines |
| 5   | Large-scale processing                      | ❌ No       | Pre-launch; reassess at ~10K users                      |
| 6   | Matching or combining datasets              | ❌ No       | No cross-referencing with external data                 |
| 7   | Vulnerable data subjects                    | ❌ No       | Not targeting children, employees, etc.                 |
| 8   | Innovative technology                       | ⚠️ Possibly | Edge-first sync with crypto-shredding is non-standard   |
| 9   | Preventing exercise of rights               | ❌ No       | Export and deletion endpoints exist                     |

**Screening result:** 1 criterion clearly applies (#4), 1 possibly (#8). At the DPIA threshold. **A precautionary DPIA is recommended** given the financial nature of the data and multi-device sync architecture.

### 1.2 DPIA Risk Assessment

| Risk                                                            | Likelihood          | Impact | Mitigation Status                                            |
| --------------------------------------------------------------- | ------------------- | ------ | ------------------------------------------------------------ |
| Unauthorized access to financial data on shared/stolen device   | Medium              | High   | Native: SQLCipher ✅; Web OPFS: ❌ unencrypted               |
| Incomplete erasure leaving personal data after deletion request | High                | High   | Soft-delete only; crypto-shredding is placeholder ❌         |
| Data breach at sub-processor (Supabase/PowerSync)               | Low                 | High   | DPA required but not yet executed ⚠️                         |
| Consent-less processing of optional telemetry                   | Low (currently off) | Medium | Consent UI absent; defaults are safe ⚠️                      |
| Audit logs retaining PII indefinitely                           | High                | Medium | No retention limit; `old_values`/`new_values` contain PII ❌ |
| Cross-border transfer without adequate safeguards               | Medium              | High   | SCCs/DPA not yet executed with PowerSync/Supabase ⚠️         |

### 1.3 DPO Requirement

Not required at pre-launch scale per Art. 37. Reassess if user base exceeds 10,000 or if processing financial data for third parties.

---

## 2. Personal Data Inventory

### 2.1 Data Categories

The following table summarizes all personal data categories collected by Finance. Field-level detail is maintained in `docs/compliance/data-inventory.md`.

| Category               | Tables                                                       | GDPR Category                              | Legal Basis                      | Contains Financial Data?                     |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------ | -------------------------------- | -------------------------------------------- |
| User identity          | `users`                                                      | Directly identifying (email, display_name) | Art. 6(1)(b) Contract            | No                                           |
| Household & membership | `households`, `household_members`                            | Indirectly identifying                     | Art. 6(1)(b) Contract            | No                                           |
| Household invitations  | `household_invitations`                                      | Directly identifying (invited_email)       | Art. 6(1)(b) Contract            | No                                           |
| Financial records      | `accounts`, `transactions`, `budgets`, `goals`, `categories` | Financial -- highly personal               | Art. 6(1)(b) Contract            | **Yes**                                      |
| Recurring templates    | `recurring_transaction_templates`                            | Financial -- highly personal               | Art. 6(1)(b) Contract            | **Yes**                                      |
| Authentication         | `passkey_credentials`, `webauthn_challenges`                 | Authentication material                    | Art. 6(1)(f) Legitimate interest | No                                           |
| Audit/security logs    | `audit_log`, `data_export_audit_log`                         | Operational + potential PII in JSONB       | Art. 6(1)(f) Legitimate interest | **Possibly** (via `old_values`/`new_values`) |
| Sync health logs       | `sync_health_logs`                                           | Pseudonymous device/performance data       | Art. 6(1)(f) Legitimate interest | No                                           |
| Rate limit counters    | `rate_limits`                                                | Operational                                | Art. 6(1)(f) Legitimate interest | No                                           |
| Auth sessions          | Supabase `auth.sessions`, `auth.users`                       | Auth material                              | Art. 6(1)(b) Contract            | No                                           |
| Local preferences      | Android `SharedPreferences`, web `localStorage`              | Profile/preference data                    | Art. 6(1)(b) Contract            | **Yes** (onboarding: balance, budget)        |
| Browser storage        | OPFS, IndexedDB, CacheStorage                                | All synced data                            | Art. 6(1)(b) Contract            | **Yes**                                      |
| Notification log       | `notification_log`                                           | Operational                                | Art. 6(1)(f) Legitimate interest | No                                           |

### 2.2 Data Flow Summary

```
User Device --> Local SQLite (SQLCipher on native / unencrypted OPFS on web)
    |
    +---> PowerSync SDK --> PowerSync Service (US) --> Supabase PostgreSQL (configurable region)
    |                                                       |
    |                                                       +---> Edge Functions (Deno Deploy)
    |                                                       |    - data-export
    |                                                       |    - account-deletion
    |                                                       |    - auth-webhook
    |                                                       |    - passkey-register/authenticate
    |                                                       |    - household-invite
    |                                                       |    - send-notification
    |                                                       |    - admin-dashboard
    |                                                       |
    |                                                       +---> Supabase Auth (JWT issuance)
    |
    +---> (Opt-in only) Sentry (currently disabled)
```

### 2.3 Special Data Handling Observations

**Finding S-1 (MEDIUM): `invited_email` synced to all household members via PowerSync.**
The `sync-rules.yaml` syncs `household_invitations` including the `invited_email` column to all members of the household (line 97-101). This means one user's email may be visible to other household members' local databases. This should be documented in the privacy policy as a household-sharing disclosure and potentially redacted after invitation acceptance/expiry.

**Finding S-2 (MEDIUM): `audit_log.old_values` / `new_values` may contain PII.** The JSONB columns can store full before/after record snapshots including email, display_name, payee, note, and financial amounts. These are not subject to any retention limit or minimization strategy.

**Finding S-3 (LOW): `auth-webhook/index.ts` line 192 uses `console.log` directly.** While it only logs a user ID (pseudonymous), it bypasses the structured logger, which means it won't include standard metadata and could be harder to audit for PII leakage in the future. Should use `logger.info()` for consistency.

---

## 3. Lawful Basis Analysis

| Processing Activity                                     | Lawful Basis                            | Justification                              | Risk                                               |
| ------------------------------------------------------- | --------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| Account creation, profile management                    | Art. 6(1)(b) Contract                   | Necessary to provide the service           | Low                                                |
| Financial record storage (transactions, budgets, goals) | Art. 6(1)(b) Contract                   | Core purpose of the application            | Low                                                |
| Household sharing and invitations                       | Art. 6(1)(b) Contract                   | Feature requested by user                  | Low                                                |
| Cross-device synchronization                            | Art. 6(1)(b) Contract                   | User-initiated feature                     | Low                                                |
| Passkey/WebAuthn authentication                         | Art. 6(1)(b) Contract + Art. 6(1)(f) LI | Security of the service                    | Low                                                |
| Audit logging (actions, IP, user agent)                 | Art. 6(1)(f) Legitimate interest        | Security, abuse prevention, accountability | Medium -- needs documented LIA and retention limit |
| Sync health monitoring                                  | Art. 6(1)(f) Legitimate interest        | Service reliability                        | Medium -- needs retention enforcement              |
| Rate limiting                                           | Art. 6(1)(f) Legitimate interest        | Abuse prevention                           | Low                                                |
| Optional crash reporting (Sentry)                       | Art. 6(1)(a) Consent                    | Voluntary, consent-gated                   | High -- no consent UI exists                       |
| Optional analytics (MetricsCollector)                   | Art. 6(1)(a) Consent                    | Voluntary, consent-gated                   | High -- no consent UI exists                       |

**Recommendation:** Before enabling any consent-based processing, implement a consent capture UI with granular per-purpose toggles, a `consent_records` table recording timestamp, policy version, and purpose, a withdrawal mechanism accessible from settings, and cross-device consent sync.

---

## 4. Data Retention Analysis

| Data Category         | Intended Retention                      | Implemented?                                                | Gap                                   |
| --------------------- | --------------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| User profile          | Account lifetime -> deletion on request | Soft-delete only                                            | No hard-delete schedule               |
| Financial data        | Account lifetime -> deletion on request | Soft-delete only                                            | No hard-delete schedule               |
| Household invitations | 72 hours (`expires_at`)                 | `cleanup_expired_invitations()` soft-deletes                | Soft-delete only; no hard-delete      |
| WebAuthn challenges   | 5 minutes (`expires_at`)                | `cleanup_expired_webauthn_challenges()` hard-deletes        | Implemented                           |
| Sync health logs      | 30 days                                 | `cleanup_old_sync_health_logs(30)` hard-deletes             | Implemented                           |
| Audit logs            | Undefined (recommended: 1-3 years)      | Append-only; **no retention or purge**                      | **HIGH** -- unbounded growth with PII |
| Export audit logs     | Undefined (recommended: 1 year)         | Append-only; **no retention or purge**                      | Missing purge                         |
| Rate limit counters   | ~2 hours                                | `cleanup_expired_rate_limits(2)` hard-deletes               | Implemented                           |
| Notification log      | Undefined                               | No cleanup found                                            | Needs retention policy                |
| Soft-deleted records  | 30 days (recommended)                   | **No hard-delete exists**                                   | **HIGH** -- violates Art. 5(1)(c)     |
| Auth sessions         | Supabase-managed                        | Managed by Supabase                                         | Managed by sub-processor              |
| Local device data     | Until logout/uninstall                  | No `Clear-Site-Data` on logout; Android deletion incomplete | Incomplete                            |

**Key Finding (HIGH):** The `20260324000003_automated_maintenance.sql` migration implements pg_cron-based cleanup for rate limits, WebAuthn challenges, sync health logs, and expired invitations -- this is good progress. However, audit logs (`audit_log` and `data_export_audit_log`) have no retention limit, soft-deleted records have no hard-delete mechanism, and `notification_log` has no retention policy.

---

## 5. Data Subject Rights Implementation

### 5.1 GDPR Rights

| Right                   | Article   | Status          | Evidence                                                                                                                                                                                 |
| ----------------------- | --------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Access**              | Art. 15   | Partial         | `data-export/index.ts` covers 9 tables but misses `household_invitations`, `audit_log`, `sync_health_logs`, `webauthn_challenges`, `recurring_transaction_templates`, `notification_log` |
| **Rectification**       | Art. 16   | Implemented     | All financial and profile data editable in-app                                                                                                                                           |
| **Erasure**             | Art. 17   | Partial         | Server-side function exists but crypto-shredding is placeholder; client apps not wired                                                                                                   |
| **Restriction**         | Art. 18   | Not implemented | No restriction mechanism; `deleted_at` could serve as proxy                                                                                                                              |
| **Portability**         | Art. 20   | Partial         | JSON/CSV export available but incomplete table coverage                                                                                                                                  |
| **Object**              | Art. 21   | N/A             | No profiling or direct marketing                                                                                                                                                         |
| **Automated decisions** | Art. 22   | N/A             | No automated decision-making                                                                                                                                                             |
| **Withdraw consent**    | Art. 7(3) | Not implemented | No consent UI or withdrawal mechanism                                                                                                                                                    |

### 5.2 CCPA/CPRA Rights

| Right                                | CCPA Section | Status      | Evidence                                                               |
| ------------------------------------ | ------------ | ----------- | ---------------------------------------------------------------------- |
| **Right to Know**                    | 1798.100     | Partial     | Data export exists but incomplete coverage; CCPA notice is draft       |
| **Right to Delete**                  | 1798.105     | Partial     | Server endpoint exists; client not wired; crypto-shredding placeholder |
| **Right to Opt-Out of Sale/Sharing** | 1798.120     | N/A         | No sale or sharing occurs                                              |
| **Right to Non-Discrimination**      | 1798.125     | Implemented | No tiering mechanism exists                                            |
| **Right to Correct**                 | 1798.106     | Implemented | All data editable in-app                                               |
| **Right to Limit Sensitive PI**      | 1798.121     | Implemented | Sensitive PI not collected beyond auth                                 |

---

## 6. Third-Party Data Processor Review

### 6.1 Sub-Processor Assessment

| Processor           | Role                           | Data Accessible                                     | DPA Status              | Transfer Mechanism                                | Risk       |
| ------------------- | ------------------------------ | --------------------------------------------------- | ----------------------- | ------------------------------------------------- | ---------- |
| **Supabase**        | Database, Auth, Edge Functions | All synced data including PII and financial records | Required before launch  | EU region selection recommended; else SCCs needed | **HIGH**   |
| **PowerSync**       | Sync coordination              | All synced table data in transit                    | Required before launch  | SCCs required (US-based)                          | **HIGH**   |
| **Sentry** (opt-in) | Error tracking                 | Pseudonymous ID, scrubbed error context             | Required if enabled     | SCCs (US-based); consent-gated                    | **MEDIUM** |
| **Deno Deploy**     | Edge Function runtime          | Same as Supabase                                    | Covered by Supabase DPA | Same as Supabase                                  | **LOW**    |

### 6.2 DPA Gaps

**Finding (HIGH): No Data Processing Agreements are executed.** The `data-inventory.md` explicitly states DPA status as "Required before launch" for both Supabase and PowerSync. Under GDPR Art. 28, the controller must have a written agreement with each processor. Execute DPAs with Supabase and PowerSync before launch. Both providers offer standard DPAs.

### 6.3 Cross-Border Transfer Analysis

| Transfer             | Current State                     | Required Safeguard                                      |
| -------------------- | --------------------------------- | ------------------------------------------------------- |
| EU -> US (Supabase)  | Region not yet configured         | Select EU region to eliminate transfer; else SCCs + DPA |
| EU -> US (PowerSync) | US-based infrastructure           | SCCs + DPA required                                     |
| EU -> US (Sentry)    | Consent-gated; currently disabled | SCCs + DPA if enabled                                   |

**Recommendation:** Select an EU Supabase region (`eu-west-1` or `eu-central-1`) to eliminate the primary cross-border data transfer. Confirm PowerSync EU region availability.

---

## 7. Consent Mechanism Review

### 7.1 Current State

The consent architecture is **well-designed at the contract level** but has **zero implementation** at the user-facing level:

| Layer                           | Status                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| `CrashReporter` interface (KMP) | Consent-gated by design; `isEnabled()` checked before all ops |
| `MetricsCollector` (KMP)        | `consentProvider()` checked before every event write          |
| Android DI (`AppModule.kt`)     | Hard-codes `consentProvider = { false }`                      |
| Web `monitoring.ts`             | Checks `localStorage` consent key; Sentry disabled            |
| **Consent capture UI**          | Does not exist on any platform                                |
| **Consent record storage**      | No `consent_records` table or model                           |
| **Consent withdrawal UI**       | No settings toggle on any platform                            |
| **Consent receipt export**      | Not included in data export                                   |
| **Cross-device consent sync**   | No sync model                                                 |

### 7.2 GDPR Art. 7 Compliance

| Requirement                        | Met?          | Evidence                |
| ---------------------------------- | ------------- | ----------------------- |
| Freely given                       | Cannot assess | No consent UI exists    |
| Specific (per purpose)             | No            | No granular toggles     |
| Informed (clear language)          | No            | No consent copy         |
| Unambiguous (affirmative action)   | No            | No opt-in mechanism     |
| Demonstrable (recorded)            | No            | No consent ledger       |
| Withdrawable (as easy as granting) | No            | No withdrawal mechanism |

**Impact:** If optional analytics or crash reporting is enabled without the consent architecture in place, it would be an immediate GDPR violation. The current defaults (off) prevent this, but the system is not launch-ready for consent-based processing.

---

## 8. Privacy Policy Alignment

### 8.1 Draft Privacy Policy Status

A comprehensive draft privacy policy exists at `docs/legal/privacy-policy.md` covering data categories (Section 3), legal bases (Section 5), sub-processors (Section 6), international transfers (Section 7), retention (Section 8), security measures (Section 9), user rights (Section 10), California notice (Section 11), cookies and local storage (Section 12), children's privacy (Section 13), and Do Not Sell/Share statement (Section 14).

### 8.2 Alignment Issues

| Policy Claim                                                               | Code Reality                                              | Gap                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------- |
| "Encryption at rest for supported storage layers" (Sec 9)                  | Web OPFS/IndexedDB is **not** encrypted                   | Misalignment                 |
| "Deletion workflows designed to include crypto-shredding" (Sec 9)          | Crypto-shredding is a placeholder                         | Misalignment                 |
| "You can exercise privacy rights through in-app privacy controls" (Sec 10) | No deletion, export, or consent UI on any mobile platform | Misalignment                 |
| "Up to 30 days after deletion to complete... workflows" (Sec 8)            | No hard-delete schedule exists                            | Misalignment                 |
| "Audit, security logs: up to 12 months" (Sec 8)                            | No retention enforcement                                  | Misalignment                 |
| "[Company Name]", "[Privacy Contact Email]"                                | Placeholder values                                        | Must fill before publication |

### 8.3 CCPA Notice Status

A draft CCPA notice exists at `docs/legal/ccpa-notice.md`. It is thorough but not published or linked in-product. Effective date is [TBD] and telemetry provider is [TBD].

---

## 9. Platform-Specific Findings

### 9.1 Android

| Finding                        | Severity     | Detail                                                                                                                                                                                             |
| ------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PII in plain SharedPreferences | **HIGH**     | `SettingsViewModel.kt` stores `userName`, `userEmail` in unencrypted `finance_settings`. `OnboardingViewModel.kt` stores `accountName`, `startingBalance`, `budgetAmount` in `finance_onboarding`. |
| Deletion incomplete            | **CRITICAL** | `SettingsViewModel.kt:253-265` only clears `finance_settings`; does not call server deletion endpoint, clear `finance_onboarding`, clear secure tokens, or wipe SQLCipher database.                |
| `allowBackup="true"`           | **HIGH**     | Permits ADB backup extraction of local database. (Already flagged in security-audit-v1.md as S-1.)                                                                                                 |
| Export is toast placeholder    | **HIGH**     | `SettingsViewModel.kt:211-219` -- export button shows a toast only.                                                                                                                                |

### 9.2 iOS

| Finding                            | Severity     | Detail                             |
| ---------------------------------- | ------------ | ---------------------------------- |
| Privacy policy is placeholder text | **HIGH**     | `SettingsView.swift:142-153`       |
| Delete Everything is TODO          | **CRITICAL** | `SettingsView.swift:194-212`       |
| Export is TODO                     | **HIGH**     | `SettingsView.swift:56-61,181-188` |

### 9.3 Web

| Finding                                   | Severity     | Detail                                                                                                            |
| ----------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| OPFS/IndexedDB unencrypted financial data | **CRITICAL** | `sqlite-wasm.ts` persists the full SQLite database without application-layer encryption                           |
| Service worker caches API responses       | **HIGH**     | `service-worker.ts:95-98,217-224` caches `/api/` responses in `CacheStorage` which may contain PII/financial data |
| No `Clear-Site-Data` on logout            | **MEDIUM**   | Logout does not send `Clear-Site-Data` header to purge cookies, cache, and storage                                |
| Export/Delete UI not wired                | **HIGH**     | `SettingsPage.tsx` renders static rows with no handlers                                                           |
| Mutation queue in IndexedDB               | **MEDIUM**   | `powersync-mutations` IndexedDB may contain financial amounts and payee data unencrypted                          |

### 9.4 Backend (Edge Functions)

| Finding                                          | Severity   | Detail                                                                               |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------ |
| `auth-webhook` line 192 uses `console.log`       | **LOW**    | Bypasses structured logger; only logs user ID but inconsistent with logging policy   |
| `admin-dashboard` returns user IDs to admins     | **LOW**    | By design, but audit log queries may expose `old_values`/`new_values` containing PII |
| Invitation `invited_email` synced to all members | **MEDIUM** | `sync-rules.yaml:97-101` -- third-party email visible in household sync bucket       |

---

## 10. CCPA/CPRA Specific Requirements

### 10.1 Notice Requirements

| Requirement                                 | Status                                |
| ------------------------------------------- | ------------------------------------- |
| Notice at collection (1798.100(b))          | Not published                         |
| Categories of PI collected (1798.100(a))    | Documented in draft CCPA notice       |
| Business/commercial purpose (1798.100(a))   | Documented in draft                   |
| Categories of third parties (1798.100(a))   | Documented in draft                   |
| Retention periods (1798.100(a))             | Draft -- not enforced in code         |
| "Do Not Sell" link (1798.135)               | N/A -- no sale/sharing occurs         |
| Right to limit sensitive PI link (1798.135) | N/A -- limited sensitive PI collected |

### 10.2 Operational Requirements

| Requirement                                               | Status                                               |
| --------------------------------------------------------- | ---------------------------------------------------- |
| Two or more methods for submitting requests (1798.130(a)) | Only self-service API exists; no email/form fallback |
| Identity verification for requests (1798.130(a))          | Bearer JWT only; no assisted identity verification   |
| Response within 45 days (1798.130(a))                     | Self-service is immediate                            |
| Authorized agent support (1798.130(a))                    | Not implemented                                      |
| Non-discrimination statement (1798.125)                   | In draft policy but not linked in-product            |
| Financial incentive disclosure (1798.125(b))              | N/A -- no incentives offered                         |

### 10.3 Sensitive Personal Information

Finance processes limited sensitive PI under CCPA: login credentials (email + password) used solely for authentication (an exempted purpose under CPRA), user-entered financial account display names (no real account numbers), no precise geolocation, and no biometric data (WebAuthn is device-local). No additional "limit use" mechanism is required given current data practices.

---

## 11. Remediation Recommendations

### 11.1 CRITICAL (Must fix before launch)

| #   | Recommendation                                                                                                                                                                                                                             | GDPR       | CCPA        | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------- | ------ |
| C-1 | **Implement real crypto-shredding** -- Replace placeholder fingerprints in `account-deletion/index.ts` with actual key-destruction integration via a KeyStore service. Without this, deletion claims in the privacy policy are inaccurate. | Art. 17    | 1798.105    | Large  |
| C-2 | **Build consent management** -- Implement consent capture UI, `consent_records` table, per-purpose toggles, withdrawal mechanism, and cross-device sync. Block all consent-based processing until complete.                                | Art. 7     | 1798.100(d) | Large  |
| C-3 | **Wire client-side deletion** -- Connect Android, iOS, and web delete flows to the `account-deletion` Edge Function. Include: server call, local DB wipe, preferences cleanup, token revocation, `Clear-Site-Data` header (web).           | Art. 17    | 1798.105    | Medium |
| C-4 | **Publish privacy policy and CCPA notice** -- Fill placeholder values, get legal review, link from onboarding, settings, app store listings, and website.                                                                                  | Art. 13-14 | 1798.100    | Medium |
| C-5 | **Encrypt web storage** -- Add Web Crypto API envelope encryption for the OPFS/IndexedDB SQLite database, or document the risk acceptance with compensating controls.                                                                      | Art. 32    | --          | Large  |

### 11.2 HIGH (Should fix before launch)

| #   | Recommendation                                                                                                                                                                                    | Articles         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| H-1 | **Expand data export** to include `household_invitations`, `audit_log` (with minimization), `sync_health_logs`, `recurring_transaction_templates`, `notification_log`, and `webauthn_challenges`. | Art. 15, 20      |
| H-2 | **Implement hard-delete schedule** for soft-deleted records (30-day grace period recommended). Add a `cleanup_soft_deleted_records()` function to the maintenance migration.                      | Art. 5(1)(c), 17 |
| H-3 | **Define and enforce audit log retention** -- Choose a period (recommend 12 months per draft policy), implement automated purge, and add PII minimization to `old_values`/`new_values` JSONB.     | Art. 5(1)(e)     |
| H-4 | **Migrate Android PII to EncryptedSharedPreferences** -- Move `userName`, `userEmail`, `accountName`, `startingBalance`, `budgetAmount` from plain SharedPreferences.                             | Art. 32          |
| H-5 | **Fix service worker API caching** -- Exclude authenticated `/api/` responses from `CacheStorage`, or implement encryption for cached responses.                                                  | Art. 5(1)(f), 32 |
| H-6 | **Execute DPAs** with Supabase and PowerSync. Document chosen regions.                                                                                                                            | Art. 28          |
| H-7 | **Implement CCPA request methods** -- Add email/form-based request intake in addition to self-service API. Document authorized agent procedure.                                                   | 1798.130         |
| H-8 | **Add third-party data redaction** for shared-household DSAR exports -- do not export other members' identifying information in `household_members` rows.                                         | Art. 15(4)       |

### 11.3 MEDIUM (Fix within sprint)

| #   | Recommendation                                                                 |
| --- | ------------------------------------------------------------------------------ |
| M-1 | Add `Clear-Site-Data` header on web logout to purge all browser storage        |
| M-2 | Add retention policy and cleanup for `notification_log` table                  |
| M-3 | Review `sync-rules.yaml` to redact `invited_email` after invitation acceptance |
| M-4 | Wire export functionality in Android and iOS settings screens                  |
| M-5 | Add documented Legitimate Interest Assessment (LIA) for audit logging          |
| M-6 | Add `android:allowBackup="false"` or data extraction rules                     |

### 11.4 LOW (Address when convenient)

| #   | Recommendation                                                                       |
| --- | ------------------------------------------------------------------------------------ |
| L-1 | Replace `console.log` in `auth-webhook/index.ts:192` with structured logger          |
| L-2 | Add cookie/storage disclosure to web app explaining auth cookies, OPFS, CacheStorage |
| L-3 | Review `HouseholdMember.joinedAt` vs `createdAt` redundancy for data minimization    |
| L-4 | Add privacy regression tests covering DSAR completeness and deletion propagation     |

---

## 12. Compliance Tracking Matrix

| Regulation        | Requirement                        | Status                                               | Blocking? |
| ----------------- | ---------------------------------- | ---------------------------------------------------- | --------- |
| GDPR Art. 5(1)(a) | Lawfulness, fairness, transparency | Policy not published                                 | Yes       |
| GDPR Art. 5(1)(b) | Purpose limitation                 | Well-defined purposes                                | No        |
| GDPR Art. 5(1)(c) | Data minimization                  | Soft-deletes not purged; audit logs unbounded        | Yes       |
| GDPR Art. 5(1)(d) | Accuracy                           | Rectification available                              | No        |
| GDPR Art. 5(1)(e) | Storage limitation                 | No retention enforcement for audit logs              | Yes       |
| GDPR Art. 5(1)(f) | Integrity and confidentiality      | Web storage unencrypted                              | Yes       |
| GDPR Art. 6       | Lawful basis                       | Mostly contract; consent-basis not implementable yet | Yes       |
| GDPR Art. 7       | Conditions for consent             | No consent mechanism                                 | Yes       |
| GDPR Art. 13-14   | Information to data subject        | Policy not published                                 | Yes       |
| GDPR Art. 15      | Right of access                    | Partial export coverage                              | Yes       |
| GDPR Art. 17      | Right to erasure                   | Placeholder crypto-shredding; client not wired       | Yes       |
| GDPR Art. 20      | Data portability                   | Partial; JSON/CSV formats are good                   | Soft      |
| GDPR Art. 25      | Data protection by design          | Local-first architecture is strong                   | No        |
| GDPR Art. 28      | Processor agreements               | DPAs not executed                                    | Yes       |
| GDPR Art. 30      | Records of processing              | Excellent data inventory exists                      | No        |
| GDPR Art. 32      | Security of processing             | Web encryption gap                                   | Yes       |
| GDPR Art. 35      | DPIA                               | Recommended; not yet conducted formally              | Soft      |
| CCPA 1798.100     | Notice at collection               | Not published                                        | Yes       |
| CCPA 1798.105     | Right to delete                    | Partially implemented                                | Yes       |
| CCPA 1798.106     | Right to correct                   | Implemented                                          | No        |
| CCPA 1798.120     | Right to opt-out                   | N/A -- no sale/sharing                               | No        |
| CCPA 1798.125     | Non-discrimination                 | By design                                            | No        |
| CCPA 1798.130     | Request methods (2+)               | Only self-service API                                | Yes       |

---

## 13. Document References

| Document                 | Path                                             | Relevance                                             |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------- |
| Data Inventory           | `docs/compliance/data-inventory.md`              | ROPA, DPIA screening, field-level analysis            |
| Privacy Audit v1         | `docs/architecture/privacy-audit-v1.md`          | Comprehensive gap analysis (~44% compliance estimate) |
| CCPA Verification        | `docs/compliance/ccpa-verification.md`           | CCPA rights verification                              |
| Consent Management Audit | `docs/compliance/consent-management-audit.md`    | Art. 7 gap analysis                                   |
| Data Minimization Audit  | `docs/compliance/data-minimization-audit.md`     | Field-level necessity review                          |
| Right to Access Audit    | `docs/compliance/gdpr-right-to-access-audit.md`  | Art. 15 / Art. 20 coverage analysis                   |
| Right to Erasure Audit   | `docs/compliance/gdpr-right-to-erasure-audit.md` | Art. 17 implementation review                         |
| Web Storage Audit        | `docs/compliance/web-storage-audit.md`           | Browser storage privacy impact                        |
| Privacy Policy Draft     | `docs/legal/privacy-policy.md`                   | Draft privacy policy                                  |
| CCPA Notice Draft        | `docs/legal/ccpa-notice.md`                      | Draft CCPA notice                                     |
| Security Audit v1        | `docs/architecture/security-audit-v1.md`         | MASVS security findings                               |
| Monitoring Architecture  | `docs/architecture/monitoring.md`                | Privacy-safe monitoring strategy                      |

---

## Document History

| Date       | Change                                             | Author                      |
| ---------- | -------------------------------------------------- | --------------------------- |
| 2025-07-27 | Initial GDPR & CCPA/CPRA privacy compliance review | Security & Privacy Reviewer |
