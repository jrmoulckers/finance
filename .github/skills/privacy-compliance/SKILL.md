---
name: privacy-compliance
description: >
  Privacy regulation and data protection compliance knowledge for financial
  applications. Use for topics related to GDPR, CCPA, privacy, data protection,
  consent, data deletion, encryption, PII, or regulatory compliance.
---

# Privacy Compliance Skill

## Privacy Architecture Advantage

Finance's edge-first architecture provides **structural privacy** — not just policy-based:

- **Data lives on-device by default** — server sync is opt-in
- **AI engines run on-device** — no financial data sent to cloud ML services
- **Field-level encryption** — sensitive data (notes, payees) encrypted before storage
- **Crypto-shredding** — GDPR erasure by destroying household encryption key
- **No telemetry by default** — analytics are opt-in, anonymized, aggregatable

## Applicable Regulations

### GDPR (EU/EEA)

- **Article 17**: Right to erasure → implemented via soft-delete + crypto-shredding
- **Article 20**: Data portability → implemented via JSON/CSV export
- **Article 25**: Data protection by design → edge-first architecture
- Lawful basis, data minimization, purpose limitation, transparency all apply

### CCPA/CPRA (California)

- Right to know, delete, opt out
- Non-discrimination (free tier = same privacy as premium)
- Published notice/disclosure obligations (documented gap in audit)

## Audit Baseline

| Document          | Path                                          | Purpose                                  |
| ----------------- | --------------------------------------------- | ---------------------------------------- |
| Privacy audit v1  | `docs/architecture/privacy-audit-v1.md`       | Compliance baseline + remediation        |
| Security audit v1 | `docs/architecture/security-audit-v1.md`      | Security findings affecting privacy      |
| MASVS audit       | `docs/architecture/masvs-resilience-audit.md` | Mobile security controls                 |
| Security specs    | `docs/architecture/security/`                 | Session binding, anomaly detection, RASP |

## Data Portability (GDPR Article 20)

### Server-Side Export

- **Edge Function**: `services/api/supabase/functions/data-export/index.ts`
- Supports JSON and CSV responses
- Authenticated, origin-validated CORS, rate-limited (10/user/hour)
- Redacts sensitive columns before streaming
- Writes to `data_export_audit_log` (migration: `20260315000001_export_audit_log.sql`)

### Client-Side Export

- **Module**: `packages/core/src/commonMain/kotlin/com/finance/core/export/`
- `DataExportService.kt` → 4-phase pipeline (GATHER → SERIALIZE → CHECKSUM → COMPLETE)
- SHA-256 checksum for integrity verification
- User IDs anonymized via `sha256:<digest>`
- **Never** includes `syncVersion` or `isSynced` in exports

### GDPR Export Compliance Checklist

- [ ] All user-owned entities included in export (accounts, transactions, budgets, goals, categories)
- [ ] Sync-internal fields stripped (`syncVersion`, `isSynced`)
- [ ] Monetary values as decimal display with currency code
- [ ] Dates as ISO 8601
- [ ] User IDs anonymized via SHA-256
- [ ] Export audit trail written
- [ ] Rate limiting enforced

## Data Deletion (GDPR Article 17)

### Erasure Flow

1. User requests deletion
2. Soft-delete all data: `UPDATE ... SET deleted_at = now()`
3. 30-day grace period (allows undo)
4. Hard-delete + vacuum after grace period
5. **Crypto-shredding**: destroy household DEK → all encrypted fields permanently unreadable
6. Log erasure request for audit compliance

### Edge Cases

- **Shared households**: Check other members before full deletion; per-user data shredded, shared data retained for other members
- **Pending sync**: Drain mutation queue before deletion
- **Backups**: Crypto-shredding makes backup data unreadable without DEK

## Crypto-Shredding

`packages/sync/src/commonMain/.../sync/crypto/`:

- `EnvelopeEncryption.kt` — DEK/KEK envelope pattern
- `FieldEncryptor.kt` — Field-level encryption for sensitive data
- `CryptoShredder.kt` — Destroys household DEK for permanent erasure
- `HouseholdKeyManager.kt` — Per-household key lifecycle + rotation

```
Household created → generate DEK → encrypt with KEK → store
Write sensitive field → decrypt DEK → encrypt field → store ciphertext
Delete household → DELETE FROM encryption_key → all encrypted data permanently unreadable
```

## Privacy-Preserving Fingerprinting (Session Binding)

From `docs/architecture/security/session-binding-strategy.md`:

- Device fingerprinting for session binding uses **non-identifying hardware characteristics** only
- No tracking cookies, advertising IDs, or cross-app identifiers
- Fingerprint hashed with session token — cannot be used to track across sessions
- Purpose: detect session hijacking, not user tracking

## On-Device AI Privacy Advantages

All 5 AI engines run locally (see financial-modeling skill):

- **SmartCategorizationEngine**: Learns from user's own transaction history — data never leaves device
- **BalancePredictionEngine**: Linear regression on local data only
- **SubscriptionDetector**: Pattern matching against local transactions
- **SavingsEngine**: Spending analysis from local data
- **BudgetRecommendationEngine**: Based on local income/spending distribution

**Competitive advantage**: Competitors send financial data to cloud ML. Finance does not.

## Security Hardening (MASVS-RESILIENCE)

Implemented in `packages/core/src/commonMain/.../security/`:

- **RASP**: `RuntimeIntegrityChecker.kt` — tamper detection
- **Device attestation**: `DeviceAttestor.kt` — PlayIntegrity (Android), TPM (Windows)
- **Biometric crypto binding**: `BiometricCryptoBinding.kt` — ties biometric to key operations

Detailed specs in `docs/architecture/security/`:

- Session binding strategy
- Anomaly detection specification
- RASP implementation docs
- Security posture report

## Consent Management

**Current state**: Documented gap in privacy audit

- Optional processing must remain opt-in
- No telemetry may bypass the missing consent foundation
- When implementing: granular opt-in per data category, easy withdrawal

## Privacy Review Triggers

Run a privacy review when:

- Adding a new personal-data field, storage location, or export surface
- Integrating a third-party SDK or cloud processor
- Changing sync, retention, deletion, or audit-log behavior
- Adding analytics, crash reporting, or consent-dependent features
- Modifying data portability or erasure implementations

## Data Inventory

- Source of truth: `docs/architecture/privacy-audit-v1.md`
- Any new field/table must update: inventory, legal basis, retention period, storage location
- All personal data classified by sensitivity level
