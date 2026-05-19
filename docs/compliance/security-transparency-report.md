# Security Transparency Report

> **Status:** DRAFT — Pending human review
> **Last Updated:** 2025-07-27
> **Related Issues:** [#1706](https://github.com/jrmoulckers/finance/issues/1706)
> **Related Docs:** [Privacy & Security Guide](../guides/privacy-security.md), [Trust & Manual Entry](../guides/trust-and-manual-entry.md), [Encryption Explainer](./encryption-explainer.md)

---

## Table of Contents

- [Purpose](#purpose)
- [Report cadence and versioning](#report-cadence-and-versioning)
- [Current report period](#current-report-period)
- [Audit status](#audit-status)
- [Incident disclosures](#incident-disclosures)
- [Policy change history](#policy-change-history)
- [Data handling summary](#data-handling-summary)
- [Third-party service inventory](#third-party-service-inventory)
- [Open security work](#open-security-work)
- [Linking from the app](#linking-from-the-app)
- [Report template](#report-template)

---

## Purpose

Finance publishes this transparency report to give users clear, recurring visibility into the security posture of the application. This is a voluntary commitment — not a regulatory requirement — because we believe financial software should earn trust through openness, not obscurity.

This report covers:

- **Audit status** — What has been audited, by whom, and what was found
- **Incident disclosures** — Any security incidents, their impact, and resolution
- **Policy changes** — Changes to privacy policy, data handling, or security practices
- **Third-party services** — What services have access to user data and under what terms
- **Open security work** — Known gaps and planned improvements

---

## Report cadence and versioning

| Parameter                 | Value                                                             |
| ------------------------- | ----------------------------------------------------------------- |
| **Publication frequency** | Quarterly (January, April, July, October)                         |
| **Version format**        | YYYY-QN (e.g., 2025-Q3)                                           |
| **Location**              | This file (docs/compliance/security-transparency-report.md)       |
| **Changelog**             | Appended to [Policy change history](#policy-change-history) below |
| **Notification**          | Users notified via in-app changelog when material changes occur   |

Each quarterly update appends a new section under [Current report period](#current-report-period). Historical reports remain in this document for full auditability.

---

## Current report period

### 2025-Q3 (July–September 2025)

**Report version:** 2025-Q3-DRAFT
**Publication date:** Pending

#### Summary

This is the inaugural transparency report for Finance, covering the pre-launch alpha and beta period.

#### Key facts

| Metric                                 | Value                                           |
| -------------------------------------- | ----------------------------------------------- |
| **Security incidents**                 | 0                                               |
| **Data breaches**                      | 0                                               |
| **Government data requests**           | 0                                               |
| **Third-party data sharing**           | None (Finance does not sell or share user data) |
| **Vulnerability reports received**     | 0                                               |
| **Open critical/high security issues** | See [Open security work](#open-security-work)   |

---

## Audit status

### Internal audits completed

| Audit                                 | Date       | Scope                      | Key findings                            | Document                                                    |
| ------------------------------------- | ---------- | -------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| Privacy compliance review (GDPR/CCPA) | 2025-07-27 | Full stack                 | 10 gaps identified (5 critical, 5 high) | [Privacy compliance review](./privacy-compliance-review.md) |
| Data inventory and processing map     | 2025-07-26 | All tables, all platforms  | Complete ROPA foundation                | [Data inventory](./data-inventory.md)                       |
| Web storage audit                     | 2025-07-26 | Browser storage mechanisms | IndexedDB encryption gap identified     | [Web storage audit](./web-storage-audit.md)                 |
| Consent management audit              | 2025-07-27 | All platforms              | No consent UI exists yet                | [Consent management audit](./consent-management-audit.md)   |
| Data minimization audit               | 2025-07-27 | Schema-level field review  | Retention guidance provided             | [Data minimization audit](./data-minimization-audit.md)     |
| CCPA rights verification              | 2025-07-27 | Consumer rights mapping    | Gaps in verification flow               | [CCPA verification](./ccpa-verification.md)                 |
| GDPR right to access audit            | 2025-07-27 | Art. 15 compliance         | Export covers core tables               | [Right to access](./gdpr-right-to-access-audit.md)          |
| GDPR right to erasure audit           | 2025-07-27 | Art. 17 compliance         | Crypto-shredding planned                | [Right to erasure](./gdpr-right-to-erasure-audit.md)        |

### External audits

| Audit                        | Status                | Notes                                                              |
| ---------------------------- | --------------------- | ------------------------------------------------------------------ |
| Third-party penetration test | **Not yet conducted** | Planned before public launch                                       |
| SOC 2 Type II                | **Not applicable**    | Finance is a client-side app; Supabase maintains SOC 2 for hosting |
| Independent code audit       | **Not yet conducted** | Planned for post-beta                                              |

### Automated security scanning

| Tool              | Scope                      | Frequency       | Status    |
| ----------------- | -------------------------- | --------------- | --------- |
| GitHub Dependabot | Dependency vulnerabilities | Continuous      | ✅ Active |
| CodeQL (SAST)     | Static analysis            | On every PR     | ✅ Active |
| npm audit         | Node.js dependency CVEs    | On every CI run | ✅ Active |
| detekt            | Kotlin static analysis     | On every PR     | ✅ Active |

---

## Incident disclosures

### Incident log

No security incidents have occurred as of the current report period.

When incidents occur, they will be documented here with the following structure:

| Field                   | Description                                |
| ----------------------- | ------------------------------------------ |
| **Incident ID**         | Sequential identifier (e.g., INC-2025-001) |
| **Date discovered**     | When the issue was identified              |
| **Date resolved**       | When the fix was deployed                  |
| **Severity**            | Critical / High / Medium / Low             |
| **Impact**              | What data or users were affected           |
| **Root cause**          | Technical description of the vulnerability |
| **Resolution**          | What was done to fix it                    |
| **Prevention**          | What changes prevent recurrence            |
| **Disclosure timeline** | When users were notified                   |

### Disclosure policy

- **Critical incidents** (data exposure, authentication bypass): Disclosed within 72 hours of resolution
- **High incidents** (significant weakness exploited): Disclosed within 7 days of resolution
- **Medium/Low incidents**: Disclosed in the next quarterly transparency report
- All disclosures include root cause, impact assessment, and prevention measures

---

## Policy change history

| Date       | Change                                | Reason                | Impact                   |
| ---------- | ------------------------------------- | --------------------- | ------------------------ |
| 2025-07-27 | Initial transparency report published | Establishing baseline | None — first publication |

Future policy changes will be appended here with:

- **What changed** — specific policy, practice, or configuration
- **Why it changed** — regulatory requirement, security improvement, or incident response
- **User impact** — what users need to know or do differently
- **Notification method** — how users were informed (in-app, email, changelog)

---

## Data handling summary

This section summarises how Finance handles user data. For full details, see the [Privacy & Security Guide](../guides/privacy-security.md) and [Data Inventory](./data-inventory.md).

### Data at rest

| Platform | Encryption          | Key storage                     |
| -------- | ------------------- | ------------------------------- |
| iOS      | SQLCipher (AES-256) | Apple Keychain (Secure Enclave) |
| Android  | SQLCipher (AES-256) | Android Keystore (StrongBox)    |
| Windows  | SQLCipher (AES-256) | DPAPI (per-user)                |
| Web      | Web Crypto API      | In-memory only                  |

### Data in transit

| Path               | Encryption                      | Details                                      |
| ------------------ | ------------------------------- | -------------------------------------------- |
| Client ↔ Supabase  | TLS 1.3                         | All API calls                                |
| Client ↔ PowerSync | TLS 1.3                         | Sync protocol                                |
| Sync payload       | AES-256-GCM envelope encryption | Financial data encrypted before transmission |

### Data not collected

Finance does **not** collect: bank credentials, credit card numbers, government IDs, location data, contacts, browsing history, or advertising identifiers. See [Trust & Manual Entry](../guides/trust-and-manual-entry.md).

---

## Third-party service inventory

| Service       | Purpose                                  | Data access                                    | DPA in place | SOC 2  |
| ------------- | ---------------------------------------- | ---------------------------------------------- | ------------ | ------ |
| **Supabase**  | Database, authentication, Edge Functions | Email, encrypted financial data, sync metadata | Pending      | Yes    |
| **PowerSync** | Offline-first sync coordination          | Encrypted financial data in transit            | Pending      | Verify |
| **GitHub**    | Source code hosting, CI/CD               | Source code only (no user data)                | N/A          | Yes    |

No advertising networks, data brokers, or analytics services have access to user data. Analytics and crash reporting are opt-in and free of financial data (see [Consent Management Audit](./consent-management-audit.md)).

---

## Open security work

The following security improvements are tracked and in progress:

| Area                                   | Status  | Priority | Reference                                                   |
| -------------------------------------- | ------- | -------- | ----------------------------------------------------------- |
| Crypto-shredding implementation        | Planned | Critical | [Privacy compliance review](./privacy-compliance-review.md) |
| Consent capture UI (all platforms)     | Planned | Critical | [Consent management audit](./consent-management-audit.md)   |
| Web OPFS/IndexedDB encryption          | Planned | Critical | [Web storage audit](./web-storage-audit.md)                 |
| Client-side deletion wiring            | Planned | Critical | [Privacy compliance review](./privacy-compliance-review.md) |
| Data export expansion (missing tables) | Planned | High     | [Right to access audit](./gdpr-right-to-access-audit.md)    |
| Audit log retention policy             | Planned | High     | [Data retention schedule](./data-retention-schedule.md)     |
| Third-party penetration test           | Planned | High     | Pre-launch requirement                                      |

---

## Linking from the app

The transparency report should be accessible from the following in-app locations:

| Surface                           | Link target                                                 | Context                             |
| --------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| **Settings → Security & Privacy** | This document                                               | "Security transparency report" link |
| **Settings → About**              | This document                                               | "How we protect your data" section  |
| **Onboarding → Welcome**          | [Trust & Manual Entry](../guides/trust-and-manual-entry.md) | Trust messaging during first run    |
| **Help → FAQ**                    | [Privacy & Security Guide](../guides/privacy-security.md)   | General security questions          |

### Deep link format

When linking from the app, use a stable URL that can be updated without app releases:

```
https://finance.app/transparency
```

This URL should redirect to the latest version of this document or a rendered web version.

---

## Report template

Use this template for each quarterly update. Copy and fill in under [Current report period](#current-report-period):

```markdown
### YYYY-QN (Month–Month YYYY)

**Report version:** YYYY-QN
**Publication date:** YYYY-MM-DD

#### Summary

Brief narrative summary of the quarter's security posture.

#### Key facts

| Metric                                 | Value       |
| -------------------------------------- | ----------- |
| **Security incidents**                 | N           |
| **Data breaches**                      | N           |
| **Government data requests**           | N           |
| **Third-party data sharing**           | Description |
| **Vulnerability reports received**     | N           |
| **Open critical/high security issues** | N           |

#### Audit activity

List any audits started, completed, or planned during this quarter.

#### Incidents

List any incidents disclosed this quarter, or state "No incidents."

#### Policy changes

List any policy changes made this quarter, or state "No changes."

#### Notable improvements

List security improvements shipped this quarter.
```

---

_For technical encryption details, see the [Encryption Explainer](./encryption-explainer.md). For user-facing security information, see the [Privacy & Security Guide](../guides/privacy-security.md)._
