# Compliance Documentation

This directory contains audits, gap analyses, inventories, and implementation
guides related to regulatory compliance — primarily the EU General Data
Protection Regulation (GDPR) and similar privacy frameworks.

> **Owner:** the [`compliance-specialist`](../../.github/agents/compliance-specialist.agent.md) agent stewards this directory and is broadening it beyond privacy to financial-services, governmental/tax, and regional regulatory obligations. The technical controls these documents call for are implemented by the owning engineering agents (security, backend, finance-domain, platform); [`@security-reviewer`](../../.github/agents/security-reviewer.agent.md) co-authors the privacy and technical audits and [`@accessibility-reviewer`](../../.github/agents/accessibility-reviewer.agent.md) maintains the VPAT.

> **Satisfies:** `PROD-COMP-001`, `PROD-COMP-007` — Product obligations are defined in
> [jrmoulckers/product](https://github.com/jrmoulckers/product), pinned to
> [`3a752c1`](https://github.com/jrmoulckers/product/blob/3a752c11856515a74eb204675d5d5198cac1e48e/principles/compliance.md).
> This directory is the local evidence; the obligation is central. These principles
> establish governance and qualified-review triggers and are not legal advice.

## Obligation-to-evidence traceability

`PROD-COMP-001` requires every applicable compliance obligation to be traced to
the evidence that satisfies it, so that a gap is visible rather than assumed
covered. This table is that trace. Each linked document carries its own citation
block naming the obligations it is evidence for.

| Obligation      | Evidence in this repository                                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROD-COMP-001` | This table; [Privacy Compliance Review](privacy-compliance-review.md); [Encryption Explainer](encryption-explainer.md); [VPAT 2.5](vpat-2.5.md)                                                                                                                                                    |
| `PROD-COMP-002` | [Data Inventory](data-inventory.md); [Data Minimization Audit](data-minimization-audit.md); [Web Storage Audit](web-storage-audit.md); [Aggregator Data Compliance](aggregator-data-compliance.md); [App Store Privacy Labels](app-store-privacy-labels.md); [VPN & Tor Policy](vpn-tor-policy.md) |
| `PROD-COMP-003` | [GDPR Right to Access Audit](gdpr-right-to-access-audit.md); [GDPR Right to Erasure Audit](gdpr-right-to-erasure-audit.md); [CCPA Rights Verification](ccpa-verification.md); [VPN & Tor Policy](vpn-tor-policy.md)                                                                                |
| `PROD-COMP-004` | [Aggregator Data Compliance](aggregator-data-compliance.md); [Bank Connection Partner Evaluation](../business/revenue/bank-connection-partner-evaluation.md)                                                                                                                                       |
| `PROD-COMP-005` | [Data Retention Schedule](data-retention-schedule.md); [GDPR Right to Erasure Audit](gdpr-right-to-erasure-audit.md)                                                                                                                                                                               |
| `PROD-COMP-006` | [App Store Privacy Labels](app-store-privacy-labels.md)                                                                                                                                                                                                                                            |
| `PROD-COMP-007` | [Security Transparency Report](security-transparency-report.md); [Privacy Compliance Review](privacy-compliance-review.md)                                                                                                                                                                         |
| `PROD-COMP-008` | [Consent Management Audit](consent-management-audit.md); [Web Storage Audit](web-storage-audit.md)                                                                                                                                                                                                 |
| `PROD-COMP-009` | [Data Inventory](data-inventory.md)                                                                                                                                                                                                                                                                |

**Known gaps are gaps.** Where a document records an unmet control, that document
is still the evidence of record for the obligation — it evidences the current
state, not a claim of conformance. Do not read a populated row as a compliance
attestation.

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
| [Aggregator Data Compliance](aggregator-data-compliance.md)     | Bank aggregator live-data path assessed against GDPR / PSD2 / GLBA / CCPA       |
| [Privacy Compliance Review](privacy-compliance-review.md)       | Full-stack GDPR & CCPA/CPRA privacy compliance assessment                       |
| [Web Storage Audit](web-storage-audit.md)                       | Inventory of all browser storage mechanisms and privacy impact                  |
| [Security Transparency Report](security-transparency-report.md) | Recurring transparency report with audit status and incident disclosures        |
| [Encryption Explainer](encryption-explainer.md)                 | Human-readable encryption documentation with data flow diagrams                 |
| [VPN & Tor Compatibility Policy](vpn-tor-policy.md)             | Privacy-preserving network compatibility policy and QA guidance                 |
| [App Store Privacy Labels](app-store-privacy-labels.md)         | App Store / Play Store privacy-label parity mapping                             |
| [VPAT 2.5 (WCAG 2.2)](vpat-2.5.md)                              | Voluntary Product Accessibility Template — accessibility conformance            |

## Related Resources

- [`docs/architecture/privacy-audit-v1.md`](../architecture/privacy-audit-v1.md) — Comprehensive GDPR/CCPA compliance gap analysis
- [`docs/guides/privacy-security.md`](../guides/privacy-security.md) — User-facing privacy and security guide
- [`docs/audits/security-checklist.md`](../audits/security-checklist.md) — Security posture checklist
- [`services/api/supabase/functions/account-delete/`](../../services/api/supabase/functions/account-delete/) — GDPR Art. 17 Right to Erasure implementation
- [`services/api/supabase/functions/data-export/`](../../services/api/supabase/functions/data-export/) — GDPR Art. 20 Data Portability implementation
- [`docs/guides/trust-and-manual-entry.md`](../guides/trust-and-manual-entry.md) — Manual-first trust messaging guide
