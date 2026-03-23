---
name: privacy-compliance
description: >
  Privacy regulation and data protection compliance knowledge for financial
  applications. Use for topics related to GDPR, CCPA, privacy, data protection,
  consent, data deletion, encryption, PII, or regulatory compliance.
---

# Privacy Compliance Skill

This skill provides implementation-aware privacy and regulatory guidance for the Finance application.

## Current Audit Baseline

The repository already contains two important audit documents:

- `docs/architecture/privacy-audit-v1.md` — privacy compliance audit and remediation baseline.
- `docs/architecture/security-audit-v1.md` — security audit findings relevant to privacy controls.

The current audit snapshot is not launch ready:

- `privacy-audit-v1.md` estimates GDPR compliance at roughly 42%.
- `privacy-audit-v1.md` estimates CCPA/CPRA compliance at roughly 46%.
- The same audit calls out incomplete DSAR coverage, incomplete deletion flows, missing consent capture, missing published notices, and undefined retention periods as key blockers.

## Applicable Regulations

### GDPR (EU/EEA)

- Lawful basis, data minimization, purpose limitation, and transparency still apply to all Finance features.
- Data portability is especially relevant because the app stores sensitive financial histories.
- Article 17 erasure and Article 20 portability are both directly relevant to the current codebase.

### CCPA/CPRA (California)

- Right to know, delete, and opt out still apply.
- Published notice and disclosure obligations remain incomplete per the audit findings.
- Non-discrimination and data-minimization expectations should shape product defaults.

## Current Repository Evidence

### Data Portability

- `services/api/supabase/functions/data-export/index.ts` implements a GDPR Article 20 data export endpoint.
- The Edge Function supports JSON and CSV responses, authenticates the caller, validates origin allowlists, redacts sensitive columns, rate limits exports, and writes export audit records.
- `packages/core/src/commonMain/kotlin/com/finance/core/export/` contains the client-side export module used for portable JSON and CSV generation plus SHA-256 checksums.

### Data Export Audit Trail

- `services/api/supabase/migrations/20260315000001_export_audit_log.sql` creates `data_export_audit_log` for export history and rate-limiting evidence.
- Audit records are scoped by RLS so users can only view their own export history.

### Deletion and Crypto-Shredding

- `docs/architecture/security-audit-v1.md` marks crypto-shredding for GDPR compliance as a PASS.
- The same audit also records account deletion coverage for GDPR Article 17 as implemented but still worth reviewing alongside the privacy audit.

## Implementation Requirements

### Data Inventory

- Treat `docs/architecture/privacy-audit-v1.md` as the current source of truth for what personal data exists, where it is stored, and where retention gaps remain.
- Any new field or table should update the privacy inventory and its legal basis, retention, and storage location.

### Consent Management

- Optional processing must remain opt-in.
- Consent capture and withdrawal flows are still a documented gap, so new optional telemetry must not bypass that missing foundation.

### Data Export (Portability)

- Support complete export in machine-readable formats.
- Never omit user-owned financial entities from portability flows.
- Prefer self-service export backed by auditable server-side logging.
- Verify that export serializers exclude sync-only fields and anonymize raw user IDs.

### Data Deletion

- Support account deletion that removes or irreversibly shreds all personal data.
- Maintain deletion evidence without storing unnecessary PII.
- Watch for shared-household edge cases and pending sync state before final deletion.

### Encryption and Logging

- Keep financial data encrypted at rest and in transit.
- Do not log raw financial records, account numbers, or other sensitive identifiers.
- Structured logs should prefer request IDs, function names, and coarse operational metadata.

## Privacy Review Triggers

Run a privacy review when:

- Adding a new personal-data field, export surface, or storage location.
- Integrating a third-party SDK or cloud processor.
- Changing sync, retention, deletion, or audit-log behavior.
- Adding analytics, crash reporting, or consent-dependent features.
- Modifying data portability or erasure implementations.
