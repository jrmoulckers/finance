<!-- SPDX-License-Identifier: BUSL-1.1 -->

# MASVS-CODE - Code Quality Security Audit

> **Audit date:** 2025-01-27
> **Scope:** All source code in apps/, packages/, services/
> **Standard:** OWASP MASVS v2 - MASVS-CODE
> **Issue:** #368

---

## Executive Summary

The Finance codebase demonstrates **strong code-quality security hygiene**. SQL queries are parameterised, secrets are not hardcoded, token storage uses platform-appropriate secure mechanisms, and error handling avoids PII leakage. Key improvements: source-map exclusion in production, LIKE-pattern escaping, JSON body construction in Kotlin.

**Overall MASVS-CODE compliance: PASS (with LOW/MEDIUM improvements noted)**

---

## 1. Hardcoded Secrets Scan

| Severity | Finding                                                               | File(s)                             | Status    |
| -------- | --------------------------------------------------------------------- | ----------------------------------- | --------- |
| PASS     | No hardcoded API keys, tokens, passwords, or connection strings       | All source files                    | Compliant |
| PASS     | Placeholder values for POWERSYNC_URL/SUPABASE_URL in buildConfigField | apps/android/build.gradle.kts:24-36 | Compliant |
| PASS     | .env.example contains placeholders only; .env/.env.local gitignored   | apps/web/.env.example               | Compliant |
| PASS     | Supabase config uses your-project-ref placeholder                     | services/api/supabase/config.toml   | Compliant |
| PASS     | Edge Functions read secrets from Deno.env.get(), never inline         | \_shared/auth.ts                    | Compliant |
| PASS     | gradle.properties has no secrets                                      | gradle.properties                   | Compliant |

## 2. SQL Query Parameterisation

| Severity   | Finding                                                                                              | File(s)                            | Remediation                       |
| ---------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------- |
| PASS       | All SQLite queries use parameterised ? placeholders                                                  | apps/web/src/db/repositories/\*.ts | N/A                               |
| PASS       | Supabase Edge Functions use SDK methods (.eq(), .in(), .is())                                        | data-export/index.ts               | N/A                               |
| PASS       | RLS policies use auth.uid() and auth.household_ids()                                                 | migrations/rls_policies.sql        | N/A                               |
| **MEDIUM** | createLikePattern() does not escape LIKE wildcards (%, \_). Logic correctness issue.                 | helpers.ts:114                     | Escape %, \_, \\ before wrapping. |
| **MEDIUM** | Kotlin SupabaseAuthManager constructs JSON via string interpolation. Special chars could break JSON. | SupabaseAuthManager.kt:239-320     | Use Json.encodeToString().        |

## 3. Input Validation

| Severity | Finding                                                                                        | File(s)                      | Status                     |
| -------- | ---------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------- |
| PASS     | TransactionValidator: zero amounts, account/category existence, date bounds, payee/note length | TransactionValidator.kt      | Compliant                  |
| PASS     | SyncConfig validates all params with require()                                                 | SyncConfig.kt                | Compliant                  |
| PASS     | LoginPage validates email format and non-empty password                                        | LoginPage.tsx:55-81          | Compliant                  |
| PASS     | SignupPage validates email, password min 8 chars, confirmation                                 | SignupPage.tsx:92-108        | Compliant                  |
| PASS     | Data-export validates format against allowlist and request size                                | data-export/index.ts         | Compliant                  |
| **LOW**  | Web repos lack client-side amount validation before SQLite insert                              | transactions.ts, accounts.ts | Wire KMP validator to web. |

## 4. Error Handling

| Severity | Finding                                                    | File(s)                                           | Status    |
| -------- | ---------------------------------------------------------- | ------------------------------------------------- | --------- |
| PASS     | Edge Functions use generic error messages, no stack traces | \_shared/response.ts:59-62                        | Compliant |
| PASS     | iOS uses LocalizedError with generic descriptions          | KeychainManager.swift, BiometricAuthManager.swift | Compliant |
| PASS     | Web auth returns user-facing messages only                 | auth-context.tsx:225-246                          | Compliant |
| PASS     | Android logs status codes, never tokens or credentials     | SupabaseAuthManager.kt                            | Compliant |

## 5. Build Security

| Severity | Finding                                                                    | File(s)                | Remediation                     |
| -------- | -------------------------------------------------------------------------- | ---------------------- | ------------------------------- |
| PASS     | ProGuard/R8 rules present and comprehensive                                | proguard-rules.pro     | N/A                             |
| **HIGH** | **Source maps enabled in production.** Exposes original TypeScript source. | vite.config.ts:19      | Set sourcemap: false or hidden. |
| PASS     | allowBackup=false prevents ADB backup                                      | AndroidManifest.xml:12 | N/A                             |

## 6. Logging Security

| Severity | Finding                                                         | File(s)                     | Status    |
| -------- | --------------------------------------------------------------- | --------------------------- | --------- |
| PASS     | Timber DebugTree only when BuildConfig.DEBUG                    | FinanceApplication.kt:31-33 | Compliant |
| PASS     | No tokens/passwords/emails in Timber calls                      | SupabaseAuthManager.kt      | Compliant |
| PASS     | Web monitoring scrubs 30+ sensitive keys and financial patterns | monitoring.ts:30-88         | Compliant |
| PASS     | CrashReporter interface requires no PII, consent gating         | CrashReporter.kt:10-15      | Compliant |

---

## Compliance Matrix

| Control                          | Status  | Notes                                                    |
| -------------------------------- | ------- | -------------------------------------------------------- |
| **CODE-1**: Up-to-date platform  | PASS    | Android minSdk via catalog; iOS 17.0; Windows 10.0.17763 |
| **CODE-2**: Secure defaults      | PASS    | No allowBackup, ProGuard rules, PKCE OAuth               |
| **CODE-3**: Input validation     | PARTIAL | KMP validator on Kotlin; web lacks pre-insert validation |
| **CODE-4**: No sensitive IPC     | PASS    | autoVerify App Links; no exported providers              |
| **CODE-5**: Toolchain security   | PARTIAL | R8 rules present; web source maps need disabling         |
| **CODE-6**: Error handling       | PASS    | Generic messages; no stack traces                        |
| **CODE-7**: Logging security     | PASS    | Debug-only logging; financial-data scrubbing             |
| **CODE-8**: No sensitive backups | PASS    | allowBackup=false; Keychain ThisDeviceOnly               |

---

## Recommendations

1. **Disable production source maps** (HIGH): sourcemap: hidden or false.
2. **Use JSON serialisation in Kotlin** (MEDIUM): Replace string interpolation with Json.encodeToString().
3. **Escape LIKE wildcards** (MEDIUM): Update createLikePattern() in helpers.ts.
4. **Share TransactionValidator with web** (LOW): Wire KMP JS bridge or replicate in TypeScript.
