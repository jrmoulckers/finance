# Data Handling & Privacy Compliance Audit

**Sprint:** Security Review Sprint 6
**Date:** 2025-07-27
**Auditor:** Security Reviewer (AI-assisted)
**Scope:** Data collection, storage, transmission, and deletion across all platforms; GDPR/CCPA compliance verification
**Regulations:** GDPR (EU), CCPA/CPRA (California), PIPEDA (Canada)
**Methodology:** OWASP MASVS-STORAGE, NIST Privacy Framework

---

## Executive Summary

This audit reviews the Finance application''s data handling practices against GDPR, CCPA/CPRA, and general privacy best practices. The application handles **highly sensitive financial data** including transaction amounts, account balances, payee names, and spending patterns. The audit examines data collection minimization, storage encryption, transmission security, retention policies, and deletion capabilities.

### Compliance Assessment

| Regulation | Estimated Compliance | Status    | Key Gaps                                           |
| ---------- | -------------------- | --------- | -------------------------------------------------- |
| GDPR       | ~60%                 | Not Ready | Consent mechanism, retention policy, DPO, DPIA     |
| CCPA/CPRA  | ~55%                 | Not Ready | Privacy notice, opt-out mechanism, data categories |
| PIPEDA     | ~50%                 | Not Ready | Consent, safeguards documentation, retention       |

### Finding Summary

| Severity | Count | Description                                                        |
| -------- | ----- | ------------------------------------------------------------------ |
| CRITICAL | 1     | No explicit consent capture mechanism for data processing          |
| HIGH     | 3     | Missing retention policy enforcement, web OPFS unencrypted, no DPA |
| MEDIUM   | 5     | Onboarding PII in plaintext, missing DPIA, no cookie consent, etc. |
| LOW      | 3     | Audit log retention undefined, sync health PII, metadata leakage   |

---

## 1. Data Inventory & Classification

### 1.1 Personal Data Categories

| Category       | Data Elements                                     | Sensitivity | Legal Basis (GDPR)             | Storage Locations             |
| -------------- | ------------------------------------------------- | ----------- | ------------------------------ | ----------------------------- |
| Identity       | email, display_name, avatar_url                   | HIGH        | Contract (Art. 6(1)(b))        | Supabase users, Local SQLite  |
| Financial      | amount_cents, balance_cents, payee, account names | VERY HIGH   | Contract                       | Supabase tables, Local SQLite |
| Behavioral     | transaction dates, categories, spending patterns  | HIGH        | Contract                       | Supabase tables, Local SQLite |
| Authentication | passkey credentials, auth tokens, biometric refs  | CRITICAL    | Contract + Legitimate Interest | Keychain/Keystore, DB         |
| Household      | member names, roles, invitation emails            | HIGH        | Contract                       | Supabase tables               |
| Technical      | IP addresses, user agents, device IDs             | MEDIUM      | Legitimate Interest            | audit_log, rate_limits        |
| Preferences    | notification settings, currency, onboarding data  | LOW         | Contract                       | DB, SharedPreferences         |

### 1.2 Data Flow Analysis

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DATA COLLECTION POINTS                            │
│                                                                     │
│  User Input → Local App → Sync Engine → Supabase PostgreSQL         │
│  (manual)     (SQLite)    (PowerSync)    (cloud storage)            │
│                                                                     │
│  Bank API → Edge Function → PostgreSQL                              │
│  (Plaid)    (processing)   (storage)                                │
│                                                                     │
│  Auth Events → Auth Webhook → audit_log                             │
│  (login/signup) (Edge Fn)    (operational)                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    DATA STORAGE LOCATIONS                            │
│                                                                     │
│  iOS:      SQLCipher (encrypted) + Keychain (tokens)               │
│  Android:  SQLCipher (encrypted) + EncryptedSharedPreferences      │
│  Web:      SQLite-WASM in OPFS/IndexedDB + In-memory token        │
│  Windows:  SQLCipher (encrypted) + DPAPI (tokens)                  │
│  Server:   Supabase PostgreSQL (RLS-protected)                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    DATA TRANSMISSION                                 │
│                                                                     │
│  Client ←→ Supabase: TLS 1.3 (HTTPS)                              │
│  Client ←→ PowerSync: TLS 1.3 (WSS)                               │
│  Server ←→ Plaid: TLS 1.2+ (HTTPS)                                │
│  Server ←→ SMTP: TLS (STARTTLS)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. GDPR Compliance Review

### 2.1 Lawful Basis for Processing (Article 6)

| Processing Activity    | Claimed Basis          | Assessment | Notes                                    |
| ---------------------- | ---------------------- | ---------- | ---------------------------------------- |
| Account creation       | Contract 6(1)(b)       | ✅ Valid   | Necessary for service delivery           |
| Financial data storage | Contract 6(1)(b)       | ✅ Valid   | Core app functionality                   |
| Household sharing      | Contract 6(1)(b)       | ✅ Valid   | User-initiated feature                   |
| Auth token storage     | Legit Interest 6(1)(f) | ✅ Valid   | Security requirement                     |
| Audit logging (IP, UA) | Legit Interest 6(1)(f) | ✅ Valid   | Security and fraud prevention            |
| Notification emails    | Contract 6(1)(b)       | ⚠️ Partial | Needs opt-in for marketing notifications |
| Analytics/telemetry    | Consent 6(1)(a)        | ❌ MISSING | No consent mechanism implemented         |
| Gamification data      | Consent 6(1)(a)        | ❌ MISSING | Behavioral profiling needs consent       |

**⚠️ Finding DH-C1 (CRITICAL): No explicit consent capture mechanism.**

- The application has no UI or backend mechanism for capturing, storing, or managing user consent for data processing.
- GDPR Article 7 requires demonstrable consent with specific, informed, and unambiguous indication.
- The `notification_preferences` table handles notification opt-in/out but there is no general consent record.
- **Remediation Required:**
  1. Create a `user_consents` table tracking consent per purpose (analytics, notifications, data sharing)
  2. Implement consent capture UI during onboarding
  3. Store consent timestamp, version of privacy policy agreed to, and method of consent
  4. Implement consent withdrawal mechanism
  5. Default to opt-out for non-essential processing

### 2.2 Right to Access (Article 15) — Data Subject Access Request (DSAR)

**Implementation:** `services/api/supabase/functions/data-export/index.ts`

| Check                             | Status     | Notes                                                  |
| --------------------------------- | ---------- | ------------------------------------------------------ |
| Export includes all personal data | ⚠️ Partial | Missing: notification_log, audit_log, sync_health_logs |
| Export format machine-readable    | ✅ PASS    | JSON and CSV formats supported                         |
| Export scoped to requesting user  | ✅ PASS    | `user.id` and `household_ids` scoping                  |
| Sensitive columns redacted        | ✅ PASS    | `public_key` redacted from passkey_credentials         |
| Rate limited                      | ✅ PASS    | 10 exports per hour                                    |
| Audit logged                      | ✅ PASS    | Both `data_export_audit_log` and `audit_log`           |

**⚠️ Finding DH-M1 (MEDIUM): Data export incomplete — missing notification_log, audit_log, sync_health_logs.**

- The `EXPORTABLE_TABLES` list in data-export doesn''t include `notification_log`, `audit_log`, or `sync_health_logs`.
- GDPR Article 15 requires access to ALL personal data.
- **Recommendation:** Add these tables to the export. For audit_log, only include entries where `user_id = requesting_user`.

### 2.3 Right to Erasure (Article 17)

**Implementation:** `services/api/supabase/functions/account-deletion/index.ts`

| Check                             | Status  | Notes                                              |
| --------------------------------- | ------- | -------------------------------------------------- |
| Explicit confirmation required    | ✅ PASS | `confirm: "DELETE_MY_ACCOUNT"` required            |
| All household data soft-deleted   | ✅ PASS | Iterates all tables for sole-member households     |
| Memberships removed               | ✅ PASS | All membership records soft-deleted                |
| Passkey credentials soft-deleted  | ✅ PASS | Explicit cleanup step                              |
| Auth user deleted (Supabase Auth) | ✅ PASS | `auth.admin.deleteUser(user.id)`                   |
| Deletion certificate provided     | ✅ PASS | Certificate with timestamp, affected counts        |
| Crypto-shredding intent recorded  | ✅ PASS | Key fingerprints recorded (implementation pending) |
| Pre-deletion audit log            | ✅ PASS | Logged before any data changes                     |

**⚠️ Finding DH-H1 (HIGH): Crypto-shredding is documented but not fully implemented.**

- The account-deletion function records "shredded" key fingerprints but the actual key destruction is stubbed.
- Comment on line 145: "In a production system this would call into the KeyStore service"
- Without actual key destruction, encrypted data remains potentially recoverable.
- **Recommendation:** Complete the crypto-shredding implementation before launch. Until then, ensure soft-deleted data is hard-deleted within the retention period via a background job.

### 2.4 Data Minimization (Article 5(1)(c))

| Check                             | Status   | Notes                                           |
| --------------------------------- | -------- | ----------------------------------------------- |
| Only necessary fields collected   | ✅ PASS  | Schema is minimal for finance functionality     |
| No unnecessary tracking/analytics | ✅ PASS  | No analytics SDKs detected                      |
| IP addresses logged minimally     | ⚠️ CHECK | audit_log stores IP; verify retention period    |
| User agent stored                 | ⚠️ CHECK | audit_log stores user_agent; is this necessary? |

### 2.5 Storage Limitation (Article 5(1)(e))

**⚠️ Finding DH-H2 (HIGH): No retention policy enforcement.**

- The privacy-audit-v1 already identified this: "Not defined" for retention on most data types.
- No `pg_cron` jobs or cleanup functions exist to enforce data retention periods.
- Soft-deleted records remain in the database indefinitely.
- **Recommendation:**
  1. Define retention periods for each data category (e.g., audit logs: 2 years, rate limits: 24 hours, sync health: 30 days)
  2. Implement `cleanup_expired_records()` function with per-table retention
  3. Schedule via pg_cron or application cron
  4. Document retention periods in the privacy policy

---

## 3. Data Storage Security

### 3.1 Server-Side Storage (Supabase PostgreSQL)

| Check                                       | Status  | Notes                                       |
| ------------------------------------------- | ------- | ------------------------------------------- |
| RLS enabled on all tables                   | ✅ PASS | Verified in Sprint 4 review                 |
| Encryption at rest (Supabase managed)       | ✅ PASS | Supabase uses encrypted volumes             |
| Sensitive field encryption (payee, note)    | ✅ PASS | FieldEncryptor in sync module               |
| Financial amounts queryable (not encrypted) | ⚠️ NOTE | `amount_cents` left unencrypted for queries |
| Connection encryption (TLS)                 | ✅ PASS | Supabase enforces TLS                       |

### 3.2 Client-Side Storage

#### iOS

| Check                 | Status   | Notes                               |
| --------------------- | -------- | ----------------------------------- |
| SQLCipher encryption  | ✅ PASS  | AES-256 via SQLCipher 4.6.1         |
| Keychain for secrets  | ✅ PASS  | `WhenUnlockedThisDeviceOnly`        |
| No data in app backup | ⚠️ CHECK | Verify Info.plist backup exclusions |

#### Android

| Check                                  | Status  | Notes                                       |
| -------------------------------------- | ------- | ------------------------------------------- |
| SQLCipher encryption                   | ✅ PASS | Via sqlcipher-android 4.6.1                 |
| EncryptedSharedPreferences for secrets | ✅ PASS | AES256_GCM with Keystore backing            |
| `allowBackup="true"` flagged           | ❌ FAIL | Already flagged in security-audit-v1 as S-1 |

**⚠️ Finding DH-M2 (MEDIUM): Android onboarding data stored in plaintext SharedPreferences.**

- Per privacy-audit-v1, user name, email, currency, and first account data are stored in plaintext `SharedPreferences` files `finance_settings` and `finance_onboarding`.
- Combined with `allowBackup="true"`, this data could be extracted via ADB backup.
- **Recommendation:** Migrate onboarding/settings PII to `EncryptedSharedPreferences`. Set `allowBackup="false"`.

#### Web

**⚠️ Finding DH-H3 (HIGH): Web local database (OPFS/IndexedDB) not encrypted at rest.**

- The web app uses SQLite-WASM persisted to OPFS or IndexedDB (`apps/web/src/db/sqlite-wasm.ts`).
- Unlike native platforms (SQLCipher), the web database is NOT encrypted at rest.
- Any user with filesystem access or browser DevTools can read the database contents.
- **Risk:** Financial data (transactions, balances, account names) stored in plaintext in browser storage.
- **Recommendation:**
  1. Implement Web Crypto API-based encryption for the SQLite database
  2. Or use SQLCipher compiled to WASM (available but larger bundle)
  3. At minimum, document this as a known limitation and clear data on logout

#### Windows

| Check                | Status  | Notes                                       |
| -------------------- | ------- | ------------------------------------------- |
| SQLCipher encryption | ✅ PASS | Via SQLCipher JVM driver                    |
| DPAPI for tokens     | ✅ PASS | Per-user encryption; path traversal guarded |

---

## 4. Data Transmission Security

### 4.1 API Communication

| Check                                         | Status   | Notes                                                 |
| --------------------------------------------- | -------- | ----------------------------------------------------- |
| HTTPS enforced (TLS 1.2+)                     | ✅ PASS  | Supabase enforces TLS                                 |
| Certificate pinning                           | ⚠️ DOC   | Strategy documented but implementation status unclear |
| HSTS headers                                  | ⚠️ CHECK | Verify Supabase/Vercel sends HSTS                     |
| Request/response never contains plaintext PII | ✅ PASS  | Encrypted channel; redacted in logs                   |

### 4.2 Sync Communication

| Check                                      | Status  | Notes                               |
| ------------------------------------------ | ------- | ----------------------------------- |
| PowerSync uses WSS (TLS)                   | ✅ PASS | WebSocket over TLS                  |
| Sync payload includes only authorized data | ✅ PASS | RLS filters at database level       |
| Sensitive fields encrypted in transit      | ✅ PASS | FieldEncryptor encrypts before sync |

### 4.3 Email Communication

| Check                           | Status    | Notes                                            |
| ------------------------------- | --------- | ------------------------------------------------ |
| SMTP uses TLS (STARTTLS)        | ⚠️ CHECK  | Verify SMTP configuration requires TLS           |
| No PII in email subject lines   | ⚠️ CHECK  | Verify notification templates                    |
| No financial data in email body | ✅ DESIGN | notification_log schema doesn''t include amounts |

---

## 5. CCPA/CPRA Compliance Review

### 5.1 Consumer Rights

| Right                          | Implementation Status  | Assessment                                        |
| ------------------------------ | ---------------------- | ------------------------------------------------- |
| Right to Know (§1798.110)      | Partial (data export)  | ⚠️ INCOMPLETE: Missing data categories disclosure |
| Right to Delete (§1798.105)    | Implemented            | ✅ account-deletion function                      |
| Right to Opt-Out (§1798.120)   | Not implemented        | ❌ No sale/sharing of data, but opt-out UI needed |
| Right to Correct (§1798.106)   | Partial (edit profile) | ⚠️ Need formal correction request mechanism       |
| Right to Limit Use (§1798.121) | Not implemented        | ❌ No sensitive data use limitation controls      |
| Non-Discrimination (§1798.125) | N/A (no data sales)    | ✅ No differential pricing based on data rights   |

### 5.2 Required Disclosures

| Requirement                         | Status     | Notes                                       |
| ----------------------------------- | ---------- | ------------------------------------------- |
| "Do Not Sell" link                  | ❌ MISSING | Required even if no sale occurs             |
| Privacy policy with data categories | ❌ MISSING | Referenced in docs but not published        |
| Notice at collection                | ❌ MISSING | No in-app privacy notice at data collection |
| Financial incentive disclosure      | N/A        | No financial incentives for data sharing    |

**⚠️ Finding DH-M3 (MEDIUM): No CCPA-required privacy notices or "Do Not Sell" link.**

- California law requires a "Do Not Sell or Share My Personal Information" link even if the business doesn''t sell data.
- No privacy policy URL is configured or served by the application.
- **Recommendation:** Publish privacy policy; add "Do Not Sell" link in app settings; add notice at collection points.

---

## 6. Data Processing Agreements

**⚠️ Finding DH-M4 (MEDIUM): No documented Data Processing Agreements (DPAs) with sub-processors.**

| Sub-processor | Purpose           | DPA Status | Notes                                   |
| ------------- | ----------------- | ---------- | --------------------------------------- |
| Supabase      | Backend, Auth, DB | ⚠️ NEEDED  | Supabase offers standard DPA            |
| PowerSync     | Sync engine       | ⚠️ NEEDED  | Check PowerSync GDPR compliance         |
| Vercel        | Web hosting       | ⚠️ NEEDED  | Vercel offers standard DPA              |
| Plaid         | Bank connections  | ⚠️ NEEDED  | Plaid is a data processor; DPA required |
| SMTP provider | Email delivery    | ⚠️ NEEDED  | Depends on chosen SMTP relay            |

**Recommendation:** Execute DPAs with all sub-processors before processing EU resident data. Most providers have standard DPAs available. Document the DPA status in `docs/compliance/`.

---

## 7. Log and Monitoring Data Privacy

### 7.1 Structured Logger Review

**Source:** `services/api/supabase/functions/_shared/logger.ts`

| Check                                        | Status  | Notes                                    |
| -------------------------------------------- | ------- | ---------------------------------------- |
| "NEVER log sensitive data" policy documented | ✅ PASS | Lines 11-13 of logger.ts                 |
| No email/token/amount in log output          | ✅ PASS | Verified across all Edge Functions       |
| User IDs logged (non-PII, for debugging)     | ✅ PASS | Acceptable for operational logging       |
| Request IDs for correlation                  | ✅ PASS | UUID per request for tracing             |
| Error messages sanitized                     | ✅ PASS | Operational errors only, never user data |

**⚠️ Finding DH-L1 (LOW): Audit log retention period undefined.**

- The `audit_log` table stores `ip_address` and `user_agent` (personal data under GDPR) indefinitely.
- No cleanup job exists for the audit_log table.
- **Recommendation:** Define retention period (suggest 2 years for financial audit requirements); implement cleanup.

**⚠️ Finding DH-L2 (LOW): Sync health logs may contain device-identifying information.**

- `sync_health_logs` stores `device_id` which, combined with `user_id`, creates a device fingerprint.
- Privacy-audit-v1 notes a 30-day intended retention but no implementation.
- **Recommendation:** Implement the 30-day retention cleanup. Pseudonymize device_id in long-term storage.

---

## 8. Cookie and Web Storage Compliance

**⚠️ Finding DH-M5 (MEDIUM): No cookie consent mechanism for web application.**

- The web app uses HttpOnly cookies for refresh tokens (functional, not requiring consent under GDPR ePrivacy).
- However, if any analytics or tracking cookies are added in the future, a consent mechanism will be needed.
- The service worker may cache API responses containing personal data.
- **Recommendation:**
  1. Implement a cookie consent banner for the web app (proactive compliance)
  2. Audit service worker caching to ensure no PII is cached without consent
  3. Document which cookies are "strictly necessary" (auth cookies) vs optional

---

## 9. Privacy by Design Assessment

| Principle                   | Implementation               | Assessment          |
| --------------------------- | ---------------------------- | ------------------- |
| Data minimization           | Minimal schema               | ✅ GOOD             |
| Purpose limitation          | Financial tracking only      | ✅ GOOD             |
| Accuracy                    | User-editable data           | ✅ GOOD             |
| Storage limitation          | No retention enforcement     | ❌ GAP              |
| Integrity & confidentiality | Encryption at rest + transit | ✅ GOOD             |
| Accountability              | Audit logging                | ⚠️ PARTIAL (no DPO) |
| Proactive not reactive      | Security-first architecture  | ✅ GOOD             |
| Privacy as default          | Opt-in notifications         | ✅ GOOD             |
| End-to-end security         | Field-level encryption       | ✅ GOOD             |
| Transparency                | No privacy policy published  | ❌ GAP              |
| User control                | Export + deletion            | ✅ GOOD             |

---

## 10. Remediation Roadmap

### Before Launch (P0)

| Finding | Description                                | Effort  | Owner       |
| ------- | ------------------------------------------ | ------- | ----------- |
| DH-C1   | Implement consent capture mechanism        | 2 weeks | Full-stack  |
| DH-H2   | Define and enforce retention policies      | 1 week  | Backend     |
| DH-H3   | Web database encryption or clear-on-logout | 1 week  | Web         |
| DH-M3   | Publish privacy policy and CCPA notices    | 1 week  | Legal + Web |
| DH-M4   | Execute DPAs with sub-processors           | 2 weeks | Legal       |

### Before EU Launch (P1)

| Finding | Description                                         | Effort  | Owner   |
| ------- | --------------------------------------------------- | ------- | ------- |
| DH-H1   | Complete crypto-shredding implementation            | 2 weeks | Backend |
| DH-M1   | Complete data export coverage                       | 3 days  | Backend |
| DH-M2   | Migrate Android onboarding PII to encrypted storage | 3 days  | Android |
| DH-M5   | Cookie consent mechanism                            | 3 days  | Web     |

### Ongoing (P2)

| Finding | Description                                            | Effort  | Owner    |
| ------- | ------------------------------------------------------ | ------- | -------- |
| DH-L1   | Audit log retention enforcement                        | 2 days  | Backend  |
| DH-L2   | Sync health log pseudonymization                       | 2 days  | Backend  |
| —       | DPIA for new features (gamification, bank connections) | 1 week  | Security |
| —       | Annual privacy impact assessment                       | Ongoing | Security |

---

## 11. Compliance Checklist Summary

### GDPR Checklist

| #   | Requirement                                 | Status                            |
| --- | ------------------------------------------- | --------------------------------- |
| 1   | Lawful basis identified for each processing | ⚠️ Partial                        |
| 2   | Consent mechanism with withdrawal           | ❌ Missing                        |
| 3   | Privacy notice (Art. 13/14)                 | ❌ Missing                        |
| 4   | DSAR process (Art. 15)                      | ✅ Implemented (data export)      |
| 5   | Right to erasure (Art. 17)                  | ✅ Implemented (account deletion) |
| 6   | Data portability (Art. 20)                  | ✅ Implemented (JSON/CSV export)  |
| 7   | Data minimization                           | ✅ Good                           |
| 8   | Storage limitation (retention)              | ❌ Not enforced                   |
| 9   | Encryption at rest                          | ⚠️ Partial (web gap)              |
| 10  | Encryption in transit                       | ✅ TLS everywhere                 |
| 11  | Data Processing Agreements                  | ❌ Not executed                   |
| 12  | DPIA for high-risk processing               | ❌ Not conducted                  |
| 13  | Data breach notification process            | ⚠️ Incident response doc exists   |
| 14  | DPO appointed                               | ❌ Not applicable (small org)     |
| 15  | Records of processing activities            | ❌ Not documented                 |

---

**Security Review Sprints 1-6 Complete**
**Document Version:** 1.0
