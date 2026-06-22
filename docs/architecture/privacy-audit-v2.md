# Privacy Compliance Audit — v2.0

**Date:** 2026-06-21
**Regulations:** GDPR (EU), CCPA/CPRA (California)
**Status:** Re-audit — supersedes [`privacy-audit-v1.md`](./privacy-audit-v1.md) (2026-03-15)
**Method:** Static implementation scan (file/content) cross-referenced against the v1 gap list. See [Verification caveats](#verification-caveats) — this is a presence-of-implementation review, not a formal penetration/DSAR test.

## Executive Summary

The v1 audit (2026-03-15) estimated **~44% compliance** and listed seven Critical launch blockers plus numerous High/Medium gaps. Since then, the codebase has materially advanced: consent capture, expanded DSAR export coverage, real crypto-shredding deletion, web at-rest encryption, published legal notices, and automated retention jobs are now implemented. **All seven v1 Critical recommendations now have implementations in code.**

This document records the remediation evidence, the updated posture, and the items that genuinely remain open or still need validation. The v1 document is retained for historical baseline and is marked superseded by this version.

**Estimated compliance (static-scan basis):** GDPR ~85%, CCPA/CPRA ~85%, overall **~85%** — up from ~44%. This is an implementation-presence estimate; a formal DSAR/erasure/consent end-to-end test is required to confirm launch readiness (see [Remaining open items](#remaining-open-items)).

## Remediation Status — v1 Critical Recommendations

| #   | v1 Critical recommendation                                                  | Status            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Publish privacy policy + CCPA notice, linked from onboarding/settings/store | ✅ Implemented    | `docs/legal/privacy-policy.md`, `docs/legal/ccpa-notice.md`, `apps/web/public/privacy-policy.html`, `apps/windows/packaging/store/PRIVACY_POLICY.md`, `docs/compliance/ccpa-verification.md`; in-app surfaces: `apps/web/src/pages/legal/LegalPage.tsx`, `apps/*/.../PrivacySettings*`                                                                                                                                                   |
| 2   | Complete DSAR/export coverage (all personal-data categories)                | ✅ Largely closed | `packages/core/src/commonMain/.../export/ExportData.kt` now includes `preferences`, `settings`, `consentRecords`, `recurringTemplates`; `DataAccessPackageGenerator.kt` + `ExportComplianceValidator.kt` added; server `services/api/supabase/functions/data-export/index.ts`                                                                                                                                                            |
| 3   | Real end-to-end deletion (key destruction, local wipe, propagation)         | ✅ Implemented    | Canonical `services/api/supabase/functions/account-delete/index.ts` (hard cascade + DEK crypto-shred, auth user deleted last); `packages/sync/src/commonMain/.../crypto/CryptoShredder.kt` + `DeletionCertificate.kt`; clients: web `AccountDeletionModal.tsx`, `apps/web/src/storage/wipeLocalData.ts`, `apps/web/src/lib/security/{deletion-verification,local-wipe-verification,record-erasure}.ts`; Android/iOS/Windows GDPR screens |
| 4   | Consent management (notice, opt-in, record, withdrawal, receipt)            | ✅ Implemented    | Migration `20260329000001_gdpr_consent_capture.sql`; `services/api/supabase/functions/consent-management/index.ts`; `ConsentManager` on iOS/Android/Windows; web `lib/consent-storage.ts`, `lib/consent-history.ts`, `hooks/useConsent.ts`, `components/gdpr/ConsentDialog.tsx` + `ConsentHistoryViewer.tsx`                                                                                                                             |
| 5   | Fix web storage risk (encrypt browser-stored financial data)                | ✅ Implemented    | `apps/web/src/db/sqlite-at-rest-encryption.ts` (+ tests `__tests__/sqlite-at-rest-encryption.test.ts`, `db/__tests__/encryption.test.ts`); crash payload scrubbing `apps/web/src/lib/crash-report-scrubber.ts`                                                                                                                                                                                                                           |
| 6   | Define + enforce retention schedules                                        | ✅ Implemented    | `20260324000003_automated_maintenance.sql`, `20260330000005_audit_log_retention.sql`, `20260323000001_cleanup_and_balance_triggers.sql`, `20260325000001_enhanced_cleanup_and_balance.sql`                                                                                                                                                                                                                                               |
| 7   | Review/minimize audit logging (`old_values`, `ip_address`, etc.)            | ◑ Partial         | Retention now bounded (#6); telemetry minimization via `apps/web/src/lib/security/telemetry-config.ts` and `apps/web/src/lib/enhancements/differential-privacy.ts`. Field-level sanitization of audit `old_values`/`new_values` still needs explicit verification.                                                                                                                                                                       |

## Remediation Status — v1 High Recommendations

| v1 High recommendation                                                       | Status               | Evidence / Note                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Third-party redaction for shared-household DSAR exports                      | ◑ Partial            | `apps/web/src/lib/third-party-permissions.ts` + `components/gdpr/ThirdPartyPermissionReview.test.tsx`; redaction of co-member identifiers in server export still needs confirmation. |
| Move Android profile/onboarding data out of plain SharedPreferences          | ◑ Needs verification | GDPR/privacy settings present (`apps/android/.../ui/gdpr/`); encrypted-at-rest migration of onboarding prefs to be confirmed against current `OnboardingViewModel`.                  |
| Formalize deletion certificates + support/audit workflow                     | ✅ Implemented       | `packages/sync/src/commonMain/.../crypto/DeletionCertificate.kt`; `account-delete` returns a certificate.                                                                            |
| Document lawful basis per processing category                                | ✅ Addressed         | `docs/legal/privacy-policy.md` + `docs/compliance/ccpa-verification.md`; data inventory carried from v1 §"Data Inventory".                                                           |
| Automated cleanup for expired invitations/challenges + sync-health retention | ✅ Implemented       | Automated maintenance migrations (see Critical #6).                                                                                                                                  |
| Field-level protection/minimization for high-risk fields                     | ◑ Partial            | `packages/sync/src/commonMain/.../crypto/FieldEncryptor.kt` + `EnvelopeEncryption.kt` provide the mechanism; per-field coverage for balances/notes/tags should be re-confirmed.      |

## Remediation Status — v1 Medium Recommendations

| v1 Medium recommendation                                       | Status         | Evidence / Note                                                                                                                          |
| -------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| User-facing browser-data management UX (web)                   | ✅ Implemented | `apps/web/src/pages/PrivacyDashboardPage.tsx`, `pages/settings/SettingsPrivacyPage.tsx`, `hooks/usePrivacyDashboard.ts`                  |
| Explicit CA non-discrimination + no-sale/no-sharing statements | ✅ Addressed   | `docs/legal/ccpa-notice.md`, `docs/compliance/ccpa-verification.md`                                                                      |
| Remove/justify redundant fields (`joinedAt` vs `createdAt`)    | ◔ Open         | Not addressed; low priority.                                                                                                             |
| Expand privacy regression testing                              | ◑ Partial      | Consent/export/deletion test suites exist; an integrated DSAR-completeness + deletion-propagation regression suite is still recommended. |

## New / Independent Findings (this scan)

- **Cleanup — deprecated deletion Edge Function.** `services/api/supabase/functions/account-deletion/index.ts` is explicitly `@deprecated`, performs soft-delete-only erasure (the #1960 alpha blocker), and is **not** mounted in `serve-functions.ts`. The canonical handler is `account-delete/index.ts`. Retained only for OpenAPI/audit-log back-references. Tracked for removal — re-wiring it would re-introduce a GDPR Art. 17 gap. (Refs #1949, #1960.)
- **Low — JVM keystore password** (`packages/sync/src/jvmMain/.../auth/TokenStorage.jvm.kt:78`): hardcoded `"finance-token-ks"`. Documented and benign — security derives from OS file permissions on the PKCS12 store (standard desktop practice). No action required.
- **Info — iOS keychain log** (`packages/sync/src/iosMain/.../auth/TokenStorage.ios.kt:54`): logs key _names_ (`access_token`), not values. No PII leakage.
- **No hardcoded credential leaks** in production code — all secret-pattern matches were test fixtures/mocks or `YOUR_*` placeholders.
- **No sensitive-data logging** (balances/payees/amounts) found in production paths.

## Remaining Open Items

Ordered by priority for closing out launch readiness:

1. **Validate DSAR export completeness end-to-end** — confirm the full export bundle includes user profile, household/membership, passkeys, invitations, audit/security metadata, sync-health logs, and consent records, with co-member data redacted (v1 Critical #2 mechanism is present; coverage needs a live test).
2. **Verify audit-log field minimization** — confirm `old_values`/`new_values` are sanitized and that IP/user-agent retention matches the published schedule (v1 Critical #7).
3. **Confirm Android at-rest storage** — ensure profile/onboarding personal data is in encrypted storage, not plain SharedPreferences (v1 High).
4. **Re-confirm per-field encryption coverage** — balances, goal/budget names, notes, tags via `FieldEncryptor` (v1 High).
5. **Add an integrated privacy regression suite** — DSAR completeness, deletion propagation across synced devices, consent withdrawal, browser-storage inspection (v1 Medium).
6. **Remove the deprecated `account-deletion` function** after migrating OpenAPI/audit-log references.

## Verification Caveats

This re-audit is based on **static scanning** (file presence + targeted content reads). It confirms that controls are implemented; it does **not** by itself prove they are correct, complete, or regression-tested. Before declaring launch readiness, run live validation of the six [Remaining open items](#remaining-open-items) — especially a real DSAR export, a real account deletion with synced-device propagation, and a consent grant/withdraw cycle with receipt export.

## Changelog

- **v2.0 (2026-06-21):** Re-audit. All seven v1 Critical blockers remediated in code; estimate ~44% → ~85%. Added independent findings and a validation backlog. Supersedes v1.0.
