# Compliance Documentation

This directory contains audits, gap analyses, and implementation guides related
to regulatory compliance — primarily the EU General Data Protection Regulation
(GDPR) and similar privacy frameworks.

## Contents

| Document                                 | Description                                                 |
| ---------------------------------------- | ----------------------------------------------------------- |
| [GDPR Data Inventory](data-inventory.md) | Personal data inventory, processing map, and DPIA screening |

## Related Resources

- [`docs/architecture/privacy-audit-v1.md`](../architecture/privacy-audit-v1.md) — Comprehensive
  GDPR/CCPA compliance gap analysis
- [`docs/guides/privacy-security.md`](../guides/privacy-security.md) — User-facing privacy and
  security guide
- [`services/api/supabase/functions/account-deletion/`](../../services/api/supabase/functions/account-deletion/) —
  GDPR Art. 17 Right to Erasure implementation
- [`services/api/supabase/functions/data-export/`](../../services/api/supabase/functions/data-export/) —
  GDPR Art. 20 Data Portability implementation
