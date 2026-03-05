---
name: privacy-compliance
description: >
  Privacy regulation and data protection compliance knowledge for financial
  applications. Use for topics related to GDPR, CCPA, privacy, data protection,
  consent, data deletion, encryption, PII, or regulatory compliance.
---

# Privacy Compliance Skill

This skill provides knowledge about privacy regulations and data protection requirements for the Finance application.

## Applicable Regulations

### GDPR (EU/EEA)
- **Lawful basis** — Must have a legal basis for processing (consent, contract, legitimate interest)
- **Data minimization** — Collect only what's necessary for the stated purpose
- **Purpose limitation** — Use data only for the purpose it was collected
- **Right to access** — Users can request a copy of all their data
- **Right to erasure** — Users can request deletion of their data ("right to be forgotten")
- **Right to portability** — Users can export their data in a machine-readable format
- **Data Protection Impact Assessment** — Required for high-risk processing (financial data qualifies)
- **Breach notification** — 72 hours to notify authority; without undue delay to users

### CCPA/CPRA (California)
- **Right to know** — What personal information is collected and how it's used
- **Right to delete** — Request deletion of personal information
- **Right to opt-out** — Of sale/sharing of personal information
- **Non-discrimination** — Can't penalize users for exercising privacy rights
- **Financial incentives** — Must disclose if offering incentives for data collection

### Additional Considerations
- **PCI DSS awareness** — If ever handling raw card numbers (avoid if possible)
- **State/country-specific** — Various US states, Canada (PIPEDA), UK (UK GDPR), etc.
- **Children's privacy** — COPPA if users under 13 possible (unlikely for finance app but consider)

## Implementation Requirements

### Data Inventory
Maintain a clear inventory of all personal data processed:

| Data Type | Purpose | Storage Location | Retention | Legal Basis |
|-----------|---------|-----------------|-----------|-------------|
| Email | Authentication | Backend DB | Account lifetime | Contract |
| Transactions | Core functionality | Local + Backend DB | User-controlled | Contract |
| Account balances | Core functionality | Local + Backend DB | User-controlled | Contract |
| Device ID | Sync identification | Backend DB | Account lifetime | Contract |
| Usage analytics | Product improvement | Analytics service | 26 months | Consent |

### Consent Management
- Collect explicit consent before processing optional data (analytics, recommendations)
- Consent must be freely given, specific, informed, and unambiguous
- Store consent records (what, when, how)
- Make it as easy to withdraw consent as to give it
- Default to opted-out for all non-essential processing

### Data Export (Portability)
- Support full data export in JSON and CSV formats
- Export must include ALL user data across all storage locations
- Must be completable within 30 days of request (aim for immediate)
- Automated self-service export in the app preferred

### Data Deletion
- Support full account deletion that removes all personal data
- Implement **cascading deletion** — user deletion removes all associated records
- Use **crypto-shredding** for encrypted data — destroy the encryption key
- Maintain audit log of deletion requests (without PII) for compliance
- Handle edge cases: shared household data, pending sync, active subscriptions

### Encryption Requirements
- **At rest** — All financial data encrypted in local database and backend storage
- **In transit** — TLS 1.3 minimum for all network communication
- **End-to-end** (optional/future) — Client-side encryption with user-held keys
- **Key management** — Use platform Keychain/Keystore; never store keys in app bundle

### Data Minimization Checklist
- [ ] Every field collected has a documented purpose
- [ ] No fields collected "just in case"
- [ ] Analytics data is anonymized/pseudonymized
- [ ] Logs contain no PII or financial data
- [ ] Third-party SDKs audited for data collection
- [ ] Crash reports sanitized of user data

## Privacy by Design Principles

1. **Proactive** — Prevent privacy issues, don't react to them
2. **Default** — Maximum privacy as the default setting
3. **Embedded** — Privacy built into the design, not bolted on
4. **Positive-sum** — Full functionality AND full privacy
5. **End-to-end** — Protection throughout the data lifecycle
6. **Visible** — Transparent data practices, user-verifiable
7. **Respectful** — User interests at the center of every decision

## Privacy Review Triggers

Run a privacy review when:
- Adding a new data field or collection point
- Integrating a third-party SDK or service
- Changing data storage or transmission patterns
- Adding analytics or tracking
- Implementing shared/family features (data sharing between users)
- Adding any cloud-based processing of user data
