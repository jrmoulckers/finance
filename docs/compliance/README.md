# Compliance Documentation

This directory contains audits, gap analyses, and implementation guides related
to regulatory compliance — primarily the EU General Data Protection Regulation
(GDPR) and similar privacy frameworks.

## Contents

| Document                                                             | Description                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| [CCPA Rights Verification](ccpa-verification.md)                     | CCPA/CPRA consumer rights verification against implementation |
| [Web Storage Audit](web-storage-audit.md)                            | Inventory of all browser storage mechanisms and privacy impact |
| [Consent Management Audit](consent-management-audit.md)              | GDPR Art. 7 consent infrastructure review and gap analysis |
| [Data Minimization Audit](data-minimization-audit.md)                | GDPR Art. 5(1)(c) field-level data necessity review     |

## Related Resources

- [`docs/audits/security-checklist.md`](../audits/security-checklist.md) — Security posture checklist
- [`services/api/supabase/functions/account-deletion/`](../../services/api/supabase/functions/account-deletion/) — GDPR Art. 17 Right to Erasure implementation
- [`services/api/supabase/functions/data-export/`](../../services/api/supabase/functions/data-export/) — GDPR Art. 20 Data Portability implementation
