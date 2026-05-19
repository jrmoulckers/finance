# Compliance Documentation

This directory contains audits, gap analyses, inventories, and implementation
guides related to regulatory compliance — primarily the EU General Data
Protection Regulation (GDPR) and similar privacy frameworks.

## Contents

| Document                                                        | Description                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [GDPR Data Inventory](data-inventory.md)                        | Personal data inventory, processing map, and DPIA screening                     |
| [GDPR Right to Access Audit](gdpr-right-to-access-audit.md)     | Art. 15 right to access audit and implementation status                         |
| [GDPR Right to Erasure Audit](gdpr-right-to-erasure-audit.md)   | Art. 17 right to erasure audit and implementation status                        |
| [GDPR Consent Management Audit](consent-management-audit.md)    | Current consent posture, Art. 7 gaps, and a recommended consent architecture    |
| [GDPR Data Minimization Audit](data-minimization-audit.md)      | Field-level schema review, retention guidance, and minimization recommendations |
| [Data Retention Schedule](data-retention-schedule.md)           | Authoritative retention periods for all data categories with purge job specs    |
| [CCPA Rights Verification](ccpa-verification.md)                | CCPA/CPRA consumer rights verification against implementation                   |
| [Web Storage Audit](web-storage-audit.md)                       | Inventory of all browser storage mechanisms and privacy impact                  |
| [Security Transparency Report](security-transparency-report.md) | Recurring transparency report with audit status and incident disclosures        |
| [Encryption Explainer](encryption-explainer.md)                 | Human-readable encryption documentation with data flow diagrams                 |
| [VPN & Tor Compatibility Policy](vpn-tor-policy.md)             | Privacy-preserving network compatibility policy and QA guidance                 |

## Related Resources

- [`docs/architecture/privacy-audit-v1.md`](../architecture/privacy-audit-v1.md) — Comprehensive GDPR/CCPA compliance gap analysis
- [`docs/guides/privacy-security.md`](../guides/privacy-security.md) — User-facing privacy and security guide
- [`docs/audits/security-checklist.md`](../audits/security-checklist.md) — Security posture checklist
- [`services/api/supabase/functions/account-deletion/`](../../services/api/supabase/functions/account-deletion/) — GDPR Art. 17 Right to Erasure implementation
- [`services/api/supabase/functions/data-export/`](../../services/api/supabase/functions/data-export/) — GDPR Art. 20 Data Portability implementation
- [`docs/guides/trust-and-manual-entry.md`](../guides/trust-and-manual-entry.md) — Manual-first trust messaging guide
