# Privacy Compliance Checklist — GDPR / CCPA

**Last updated:** 2025-07-22
**Regulations:** [GDPR](https://gdpr.eu/), [CCPA/CPRA](https://oag.ca.gov/privacy/ccpa), [PIPEDA](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/)
**References:** [ADR-0004 Auth & Security](../architecture/0004-auth-security-architecture.md)

> Finance processes sensitive personal financial data. This checklist ensures
> compliance with privacy regulations across all jurisdictions where the app
> operates. Items are mapped to specific GDPR articles and CCPA sections.

---

## 1. Data Inventory

Before any audit, maintain a complete inventory of all personal data collected,
stored, and processed by Finance.

### 1.1 PII Collected

| Data Category | Examples | Storage Location | Encrypted | Retention |
|--------------|---------|-----------------|-----------|----------|
| **Identity** | Name, email address | Supabase Auth + local cache | Yes (TLS + at-rest) | Account lifetime |
| **Authentication** | Passkey public key, OAuth tokens | Keychain/Keystore/DPAPI | Yes (hardware-backed) | Session lifetime |
| **Financial — Accounts** | Account names, types, institutions | SQLCipher (local) + encrypted sync | Yes (AES-256) | Until user deletes |
| **Financial — Transactions** | Amounts, dates, descriptions, categories | SQLCipher (local) + encrypted sync | Yes (AES-256) | Until user deletes |
| **Financial — Budgets** | Budget categories, limits, periods | SQLCipher (local) + encrypted sync | Yes (AES-256) | Until user deletes |
| **Financial — Net Worth** | Asset/liability totals, history | SQLCipher (local) + encrypted sync | Yes (AES-256) | Until user deletes |
| **Household** | Household membership, roles | Supabase + local cache | Yes (RLS + encryption) | Until household deleted |
| **Device** | Device model, OS version (diagnostics only) | Crash reporting service | Anonymized | 90 days |
| **Usage** | Feature usage patterns (if analytics enabled) | Analytics service | Pseudonymized | 90 days |

### 1.2 Data Flow Diagram

```
User Device                     Backend (Supabase)
+---------------------+     +---------------------+
|  Local SQLCipher DB  |     |  PostgreSQL (RLS)   |
|  (encrypted at rest) |---->|  (encrypted fields) |
+---------------------+     +---------------------+
|  Keychain/Keystore   |     |  Supabase Auth      |
|  (auth tokens, keys) |     |  (identity/sessions)|
+---------------------+     +---------------------+
```

### 1.3 Data Inventory Verification

- [ ] **All PII categories documented** — table above is complete and current
- [ ] **No undocumented data collection** — no hidden analytics, tracking pixels, or third-party SDKs collecting data without disclosure
- [ ] **Data flow diagram accurate** — reflects actual data paths in code
- [ ] **Third-party processors listed** — all external services receiving PII are documented with DPAs

---

## 2. Legal Basis for Processing (GDPR Art. 6)

Every processing activity must have a documented legal basis.

| Processing Activity | Legal Basis | GDPR Article | Justification |
|--------------------|------------|--------------|---------------|
| Account creation & authentication | Contract performance | Art. 6(1)(b) | Necessary to provide the financial tracking service |
| Transaction recording & storage | Contract performance | Art. 6(1)(b) | Core service functionality |
| Household data sharing | Consent | Art. 6(1)(a) | User explicitly invites household members |
| Crash reporting | Legitimate interest | Art. 6(1)(f) | App stability benefits all users; data is anonymized |
| Usage analytics (if enabled) | Consent | Art. 6(1)(a) | Opt-in only; not required for service |
| Email notifications | Consent | Art. 6(1)(a) | User opts in to notifications |

### 2.1 Legal Basis Verification

- [ ] **Each processing activity has documented legal basis**
- [ ] **Consent is freely given, specific, informed, and unambiguous** (GDPR Art. 7)
- [ ] **Consent can be withdrawn as easily as it was given**
- [ ] **Legitimate interest assessment documented** for any Art. 6(1)(f) processing
- [ ] **No processing without a valid legal basis**

---

## 3. Data Minimization Verification (GDPR Art. 5(1)(c))

Only collect data that is strictly necessary for the stated purpose.

### 3.1 Minimization Checks

- [ ] **No excessive data collection** — review all form fields, API request bodies, and database columns
- [ ] **Account creation collects minimum fields** — email only (or passkey only, no email needed)
- [ ] **Transaction fields are necessary** — amount, date, category are core; notes and attachments are optional
- [ ] **No location tracking** — unless explicitly enabled by user for transaction tagging
- [ ] **No contact list access** — household invites use email/link, not contact scanning
- [ ] **No camera/microphone access** — unless explicitly needed (e.g., receipt scanning, if implemented)
- [ ] **Analytics are minimal** — no user-identifiable data in analytics events
- [ ] **Crash reports stripped of PII** — no email, account names, or financial data in crash payloads
- [ ] **Logs contain no PII** — server logs use correlation IDs, not user identifiers

---

## 4. Right to Access — Data Export (GDPR Art. 15, CCPA Sec. 1798.100)

Users must be able to request and receive a copy of all their personal data.

### 4.1 Data Export Requirements

- [ ] **Self-serve data export available** — user can export without contacting support
- [ ] **Export includes ALL personal data** — transactions, accounts, budgets, categories, settings, profile
- [ ] **Machine-readable format** — JSON and/or CSV export (GDPR Art. 20 — Right to Portability)
- [ ] **Export includes metadata** — creation dates, modification dates, sync status
- [ ] **Export excludes other users' data** — in shared households, only export the requesting user's data
- [ ] **Export available within 30 days** of request (GDPR) / 45 days (CCPA)
- [ ] **Export is encrypted or delivered securely** — not sent via unencrypted email
- [ ] **Export generation logged** — audit trail of export requests

### 4.2 Export Format

```json
{
  "export_date": "2025-07-22T00:00:00Z",
  "user": { "email": "user@example.com", "created_at": "2025-01-01T00:00:00Z" },
  "accounts": [],
  "transactions": [],
  "budgets": [],
  "categories": [],
  "settings": {}
}
```

---

## 5. Right to Erasure — Crypto-Shredding (GDPR Art. 17, CCPA Sec. 1798.105)

Users must be able to permanently delete all their personal data.

### 5.1 Erasure Implementation — Crypto-Shredding

Finance uses **crypto-shredding** as the primary deletion mechanism (see [ADR-0004](../architecture/0004-auth-security-architecture.md)):

1. Destroy the user's Key Encryption Key (KEK)
2. All data encrypted with the KEK becomes permanently irrecoverable
3. This works even for data in backups (backups contain encrypted data; without KEK, it is unreadable)

### 5.2 Erasure Verification

- [ ] **Delete account button accessible** — Settings > Account > Delete Account
- [ ] **Deletion is permanent and irreversible** — user is clearly warned
- [ ] **KEK destruction verified** — after deletion, encrypted data cannot be decrypted
- [ ] **Local database wiped** — SQLCipher database file securely deleted from device
- [ ] **Keychain/Keystore entries removed** — all tokens, keys, and credentials cleared
- [ ] **Server-side data removed or shredded** — PostgreSQL rows deleted or KEK destroyed
- [ ] **Household membership removed** — user removed from all households
- [ ] **Third-party data deleted** — deletion propagated to any third-party processors
- [ ] **Backup data becomes irrecoverable** — crypto-shredding ensures backup data is useless
- [ ] **Deletion completed within 30 days** (GDPR) / 45 days (CCPA)
- [ ] **Deletion confirmation sent** — email confirming account and data deletion

### 5.3 Exceptions to Erasure

Document any data retained after deletion and the legal basis:

| Data Retained | Legal Basis | Retention Period |
|--------------|------------|------------------|
| Anonymized aggregate statistics | Legitimate interest | Indefinite |
| Audit logs (anonymized) | Legal obligation | 7 years |
| Billing records (if applicable) | Legal obligation (tax) | As required by law |

---

## 6. Data Protection Impact Assessment (DPIA) Template (GDPR Art. 35)

A DPIA is required for processing that is "likely to result in a high risk" to individuals. Financial data processing qualifies.

### 6.1 DPIA Template

**Project:** Finance — Personal Financial Tracking Application

**1. Description of Processing**
- Nature: Collection, storage, analysis, and sync of personal financial data
- Scope: Individual and household financial records (transactions, accounts, budgets)
- Context: Mobile and web application with offline-first architecture
- Purpose: Enable users to track, analyze, and manage their personal finances

**2. Necessity and Proportionality**
- [ ] Processing is necessary for the stated purpose (contract performance)
- [ ] Data minimization applied (only financial data needed for tracking)
- [ ] Retention limited (user controls deletion)
- [ ] Accuracy ensured (user manages their own data)

**3. Risk Assessment**

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Unauthorized access to financial data | Low | High | Passkey auth, biometric gating, E2E encryption |
| Data breach exposing transaction history | Low | Critical | SQLCipher, HTTPS, certificate pinning, RLS |
| Household member accessing unauthorized data | Medium | Medium | RBAC model, per-user encryption keys |
| Device theft exposing local data | Medium | High | SQLCipher, biometric lock, remote wipe |
| Third-party processor breach | Low | High | Data minimization, DPAs, encryption |
| Insider threat (developer access) | Low | Critical | E2E encryption, no server-side plaintext access |

**4. Measures to Address Risks**
- Encryption at rest (SQLCipher) and in transit (TLS 1.2+)
- Hardware-backed key storage (Secure Enclave, TEE, TPM)
- Crypto-shredding for permanent deletion
- PostgreSQL Row-Level Security for tenant isolation
- Regular security audits and penetration testing
- Incident response plan documented

**5. Sign-Off**

| Role | Name | Date | Approval |
|------|------|------|----------|
| Data Protection Officer | _TBD_ | _YYYY-MM-DD_ | _Approved / Conditional_ |
| Engineering Lead | _TBD_ | _YYYY-MM-DD_ | _Approved / Conditional_ |
| Legal Counsel | _TBD_ | _YYYY-MM-DD_ | _Approved / Conditional_ |

---

## 7. Cookie / Storage Consent (Web) (GDPR Art. 7, ePrivacy Directive)

The web app must obtain consent before storing non-essential data in the browser.

### 7.1 Storage Categories

| Category | Examples | Consent Required |
|----------|---------|------------------|
| **Strictly necessary** | Auth session cookies, CSRF tokens | No |
| **Functional** | Theme preference, locale, last viewed account | No (legitimate interest) |
| **Analytics** | Usage tracking, feature adoption metrics | **Yes** |
| **Marketing** | _None planned_ | **Yes** (if ever added) |

### 7.2 Consent Verification

- [ ] **Cookie/storage consent banner displayed** on first visit (web)
- [ ] **Consent is opt-in, not opt-out** — no pre-checked boxes
- [ ] **Consent is granular** — user can accept/reject each category independently
- [ ] **Consent is recorded** — timestamp and choices stored for audit
- [ ] **Consent can be withdrawn** — settings page allows changing consent at any time
- [ ] **No analytics loaded before consent** — scripts deferred until consent granted
- [ ] **Strictly necessary cookies work without consent** — app is functional with only essential cookies

---

## 8. Cross-Border Data Transfers (GDPR Art. 44–49)

If data is transferred outside the EU/EEA, additional safeguards are required.

### 8.1 Transfer Assessment

- [ ] **Data processing locations documented** — list all server locations and cloud regions
- [ ] **Adequate jurisdictions identified** — transfers to countries with EU adequacy decisions are permitted
- [ ] **Standard Contractual Clauses (SCCs) in place** — for transfers to non-adequate countries
- [ ] **Transfer Impact Assessment completed** — if SCCs are used, assess local surveillance laws
- [ ] **Supabase data residency configured** — EU-region hosting if serving EU users

---

## 9. Breach Notification (GDPR Art. 33–34, CCPA Sec. 1798.150)

### 9.1 Breach Response Plan

| Step | Timeline | Action |
|------|---------|--------|
| 1. Detection | Immediate | Automated alerting via security monitoring |
| 2. Assessment | Within 4 hours | Determine scope, affected data, and users |
| 3. Containment | Within 4 hours | Isolate affected systems, rotate credentials |
| 4. Authority notification | Within 72 hours (GDPR) | Notify supervisory authority if risk to individuals |
| 5. User notification | Without undue delay | Notify affected users if high risk to rights/freedoms |
| 6. Remediation | Within 30 days | Fix root cause, update security measures |
| 7. Post-incident review | Within 14 days | Document lessons learned, update procedures |

### 9.2 Breach Notification Verification

- [ ] **Incident response plan documented and tested**
- [ ] **Contact information for supervisory authority on file**
- [ ] **User notification template prepared** — includes nature of breach, data affected, measures taken
- [ ] **Breach register maintained** — all breaches (even non-reportable) are logged

---

## 10. Audit Sign-Off

| Date | Auditor | Scope | Result | Issues | Regulatory Risk |
|------|---------|-------|--------|--------|----------------|
| _YYYY-MM-DD_ | _Name_ | _Full / Targeted_ | _Pass / Fail_ | _#N, #M_ | _None / Low / Medium / High_ |

**Sign-off criteria:** All items must be verified. Any non-compliant item must
have a remediation plan with target date. GDPR violations can result in fines
of up to 4% of annual global turnover or EUR 20 million, whichever is greater.
