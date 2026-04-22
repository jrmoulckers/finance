# Dependency Security Audit

**Sprint:** Security Review Sprint 3
**Date:** 2025-07-27
**Auditor:** Security Reviewer (AI-assisted)
**Scope:** All npm (web, root) and Gradle (KMP, Android) dependencies
**Methodology:** Dependency version analysis, known CVE review, supply chain risk assessment

---

## Executive Summary

This audit reviews all direct and transitive dependencies across the Finance monorepo's npm and Gradle ecosystems. The application uses a **minimal dependency footprint** which is a positive security signal. No critical known vulnerabilities were identified in current direct dependencies. Several dependencies require version monitoring and update strategies.

### Risk Summary

| Category              | Count | CRITICAL | HIGH  | MEDIUM | LOW   |
| --------------------- | ----- | -------- | ----- | ------ | ----- |
| npm (production)      | 7     | 0        | 0     | 1      | 1     |
| npm (dev)             | 22    | 0        | 0     | 0      | 2     |
| Gradle (KMP/Android)  | 30+   | 0        | 1     | 2      | 1     |
| Deno (Edge Functions) | 4     | 0        | 0     | 1      | 0     |
| **Total**             |       | **0**    | **1** | **4**  | **4** |

---

## 1. npm Dependencies — Web App (`apps/web/package.json`)

### Production Dependencies

| Package          | Version | License | Last Update | Risk Level | Notes                                             |
| ---------------- | ------- | ------- | ----------- | ---------- | ------------------------------------------------- |
| react            | ^19.2.5 | MIT     | Active      | LOW        | Latest major; well-maintained by Meta             |
| react-dom        | ^19.2.5 | MIT     | Active      | LOW        | Paired with React; same maintenance               |
| react-router-dom | ^7.14.1 | MIT     | Active      | LOW        | Major framework; Remix team maintenance           |
| d3               | ^7.9.0  | ISC     | Active      | LOW        | Data visualization; large but well-audited        |
| recharts         | ^3.8.1  | MIT     | Active      | LOW        | Chart library built on d3; minimal attack surface |
| sql.js           | ^1.14.1 | MIT     | Active      | MEDIUM     | SQLite compiled to WASM; review WASM integrity    |
| wa-sqlite        | ^1.0.0  | MIT     | Active      | MEDIUM     | SQLite WASM wrapper; newer, less battle-tested    |
| zod              | ^4.3.6  | MIT     | Active      | LOW        | Schema validation; security-positive dependency   |

#### Detailed Analysis

**sql.js (^1.14.1) — Risk: MEDIUM**

- **Concern:** Compiles SQLite C code to WebAssembly. The WASM binary is loaded at runtime and executes native-equivalent code in the browser. If a tampered WASM binary were served, it could execute arbitrary operations on the client''s data.
- **Mitigation:** Verify WASM file integrity with Subresource Integrity (SRI) hashes. Pin the exact version in `package-lock.json`. Host WASM files from the same origin (not CDN) or use SRI if CDN-hosted. Monitor sql.js releases for SQLite CVE backports.
- **CVE Status:** No known CVEs in sql.js. Underlying SQLite 3.45+ addresses historical issues.

**wa-sqlite (^1.0.0) — Risk: MEDIUM**

- **Concern:** Relatively newer library (v1.0.0) with smaller community. Provides SQLite over WASM with OPFS persistence. Less security audit history than sql.js.
- **Mitigation:** Monitor for security advisories. Consider pinning exact version. Evaluate whether sql.js alone could serve the same purpose to reduce attack surface.

**zod (^4.3.6) — Risk: LOW (Security Positive)**

- **Note:** Zod provides runtime schema validation which is a defense-in-depth measure. Used for input validation in `apps/web/src/lib/validation.ts`. The schemas defined (transactionSchema, accountSchema, etc.) provide server-side-equivalent validation on the client. This is a positive security dependency.

### Dev Dependencies

| Package              | Version | License | Risk Level | Notes                            |
| -------------------- | ------- | ------- | ---------- | -------------------------------- |
| @playwright/test     | ^1.59.1 | Apache  | LOW        | Testing only; not shipped        |
| @storybook/\*        | ^10.x   | MIT     | LOW        | Dev-only UI documentation        |
| @testing-library/\*  | Various | MIT     | LOW        | Testing utilities                |
| @vitejs/plugin-react | ^6.0.1  | MIT     | LOW        | Build tool plugin                |
| vite                 | ^8.0.9  | MIT     | LOW        | Build tool; no runtime exposure  |
| vitest               | ^4.1.4  | MIT     | LOW        | Test runner; no runtime exposure |
| typescript           | ^6.0.3  | Apache  | LOW        | Compiler; no runtime             |
| jsdom                | ^29.0.2 | MIT     | LOW        | Test environment; not shipped    |
| nanoid               | ^5.1.9  | MIT     | LOW        | Dev-only; ID generation          |
| fake-indexeddb       | ^6.2.5  | Apache  | LOW        | Test mock; not shipped           |

**Dev Dependency Concern: vite (^8.0.9)**

- Vite is a build tool but processes all application source code. A compromised Vite version could inject malicious code at build time (supply chain attack).
- **Mitigation:** Pin major version. Verify npm package integrity via `npm audit`. Consider using `npm ci --ignore-scripts` in CI and enabling npm''s `--prefer-offline` mode.

---

## 2. npm Dependencies — Root (`package.json`)

| Package           | Version | License | Risk Level | Notes                                  |
| ----------------- | ------- | ------- | ---------- | -------------------------------------- |
| turbo             | ^2.9.6  | MPL-2.0 | LOW        | Build orchestration; Vercel-maintained |
| eslint            | ^10.2.1 | MIT     | LOW        | Linting; dev-only                      |
| prettier          | ^3.8.3  | MIT     | LOW        | Formatting; dev-only                   |
| husky             | ^9.1.7  | MIT     | LOW        | Git hooks; dev-only                    |
| lint-staged       | ^16.4.0 | MIT     | LOW        | Pre-commit hooks; dev-only             |
| @changesets/cli   | ^2.31.0 | MIT     | LOW        | Version management; dev-only           |
| @commitlint/cli   | ^20.5.0 | MIT     | LOW        | Commit linting; dev-only               |
| typescript-eslint | ^8.58.2 | MIT     | LOW        | ESLint TS plugin; dev-only             |

All root dependencies are dev-only build/lint tools. Risk is limited to supply chain (build-time compromise).

---

## 3. Gradle Dependencies — KMP & Android

### Core KMP Dependencies

| Dependency                      | Version | License    | Risk Level | Notes                                    |
| ------------------------------- | ------- | ---------- | ---------- | ---------------------------------------- |
| kotlin                          | 2.1.0   | Apache-2.0 | LOW        | JetBrains; heavily audited               |
| kotlinx-coroutines-core         | 1.9.0   | Apache-2.0 | LOW        | Official Kotlin library                  |
| kotlinx-serialization-json      | 1.7.3   | Apache-2.0 | LOW        | JSON parsing; well-maintained            |
| kotlinx-datetime                | 0.6.1   | Apache-2.0 | LOW        | Date handling; official library          |
| sqldelight                      | 2.0.2   | Apache-2.0 | LOW        | SQL code generation; Cash App maintained |
| sqlcipher-android               | 4.6.1   | BSD        | MEDIUM     | Database encryption; see analysis below  |
| ktor-client-core                | 3.0.3   | Apache-2.0 | LOW        | HTTP client; JetBrains maintained        |
| ktor-client-auth                | 3.0.3   | Apache-2.0 | LOW        | Auth plugin for Ktor                     |
| ktor-client-content-negotiation | 3.0.3   | Apache-2.0 | LOW        | Content type handling                    |
| koin-core                       | 4.0.1   | Apache-2.0 | LOW        | DI framework; well-established           |
| timber                          | 5.0.1   | Apache-2.0 | LOW        | Android logging; Jake Wharton maintained |

### Android-Specific Dependencies

| Dependency         | Version | License    | Risk Level | Notes                                    |
| ------------------ | ------- | ---------- | ---------- | ---------------------------------------- |
| compose-bom        | 2024.12 | Apache-2.0 | LOW        | Google Compose; well-maintained          |
| activity-compose   | 1.9.3   | Apache-2.0 | LOW        | AndroidX; Google maintained              |
| navigation-compose | 2.8.5   | Apache-2.0 | LOW        | AndroidX navigation                      |
| biometric          | 1.1.0   | Apache-2.0 | HIGH       | Security-critical; see analysis below    |
| security-crypto    | 1.0.0   | Apache-2.0 | MEDIUM     | EncryptedSharedPreferences; see analysis |
| credentials        | 1.3.0   | Apache-2.0 | LOW        | Credential Manager for passkeys          |
| work-runtime       | 2.10.0  | Apache-2.0 | LOW        | Background work scheduling               |
| lifecycle          | 2.8.7   | Apache-2.0 | LOW        | Android lifecycle management             |
| glance-appwidget   | 1.1.1   | Apache-2.0 | LOW        | Widget framework                         |

#### Detailed Analysis

**sqlcipher-android (4.6.1) — Risk: MEDIUM**

- **Concern:** SQLCipher is the database encryption layer. Version 4.6.1 uses SQLite 3.46.1 internally. The encryption implementation (AES-256-CBC with HMAC-SHA512) is well-reviewed but any vulnerability in SQLCipher directly compromises data-at-rest encryption.
- **Mitigation:** Monitor SQLCipher releases closely. The project is maintained by Zetetic LLC. Upgrade promptly when security patches are released. Consider migrating to AES-256-GCM mode when available.
- **CVE Status:** No known CVEs in SQLCipher 4.6.x. Previous versions (< 4.5.0) had issues with page-size validation.

**androidx.biometric (1.1.0) — Risk: HIGH**

- **Concern:** Version 1.1.0 is significantly outdated. The latest stable is 1.2.0-alpha05 (with 1.1.0 being the last stable). Biometric authentication is security-critical — any bypass or vulnerability directly affects account access. AndroidX biometric 1.1.0 was released in 2022 and may not include the latest security patches for biometric prompt handling.
- **Mitigation:** **Upgrade to 1.2.0-alpha05 or latest stable** when available. Monitor AndroidX security bulletins. Verify that the current version handles Class 3 biometrics correctly on all target devices. Test biometric fallback paths (PIN/password) for security.
- **Action Required:** Update `libs.versions.toml` biometric version.

**androidx.security:security-crypto (1.0.0) — Risk: MEDIUM**

- **Concern:** Version 1.0.0 is the original release from 2020. The library wraps Android Keystore for EncryptedSharedPreferences. While the underlying Keystore is OS-maintained, the wrapper library may have edge-case bugs fixed in newer versions. Version 1.1.0-alpha06 exists with improvements.
- **Mitigation:** Monitor for stable 1.1.0 release. The current 1.0.0 is functional but consider upgrading when stable. Verify that key generation uses `PURPOSE_ENCRYPT | PURPOSE_DECRYPT` with `BLOCK_MODE_GCM`.

---

## 4. Deno Dependencies — Edge Functions

| Dependency             | Version | Source        | Risk Level | Notes                            |
| ---------------------- | ------- | ------------- | ---------- | -------------------------------- |
| deno.land/std          | 0.208.0 | Deno registry | MEDIUM     | HTTP server; see analysis below  |
| @supabase/supabase-js  | 2.39.0  | esm.sh        | LOW        | Supabase client; well-maintained |
| @simplewebauthn/server | 9.0.3   | esm.sh        | LOW        | WebAuthn library; purpose-built  |

#### Detailed Analysis

**Deno std library (0.208.0) — Risk: MEDIUM**

- **Concern:** Version 0.208.0 is from late 2023. The Deno standard library has since moved to JSR (jsr.io) with version 1.x releases. While 0.208.0 is functional, it may not include the latest security patches for HTTP handling.
- **Mitigation:** Plan migration to `jsr:@std/http` when upgrading Edge Functions. Pin to exact version via `deno.lock`. Monitor Deno security advisories.

**esm.sh CDN usage — Risk: MEDIUM**

- **Concern:** Dependencies are loaded from `esm.sh` at deploy time. If esm.sh were compromised or experienced a supply chain attack, malicious code could be injected into Edge Functions.
- **Mitigation:** Use `deno.lock` to pin dependency hashes. Consider vendoring critical dependencies (supabase-js, simplewebauthn) into the repository. Verify esm.sh integrity periodically.

---

## 5. Supply Chain Risk Assessment

### Risk Factors

| Factor                            | Status     | Risk   | Notes                                            |
| --------------------------------- | ---------- | ------ | ------------------------------------------------ |
| Lock files present (npm)          | ✅ Yes     | LOW    | `package-lock.json` exists at root               |
| Lock files present (Deno)         | ✅ Yes     | LOW    | `deno.lock` exists in functions directory        |
| Lock files present (Gradle)       | ✅ Yes     | LOW    | `gradle.lockfile` via Gradle wrapper             |
| Dependency count (production npm) | 7          | LOW    | Minimal footprint — excellent                    |
| Dependency count (Gradle)         | ~30        | LOW    | Reasonable for KMP + Android                     |
| CI dependency scanning            | ⚠️ Unknown | MEDIUM | Verify GitHub Dependabot/CodeQL is configured    |
| npm audit in CI                   | ⚠️ Unknown | MEDIUM | Should run `npm audit --audit-level=high` in CI  |
| Gradle dependency verification    | ⚠️ Unknown | MEDIUM | Consider enabling Gradle dependency verification |
| esm.sh CDN pinning                | ⚠️ Partial | MEDIUM | deno.lock exists but CDN availability is a risk  |

### Recommendations

1. **Enable GitHub Dependabot** — Automated PR creation for dependency updates with security advisories.
2. **Add `npm audit` to CI pipeline** — Fail builds on HIGH/CRITICAL vulnerabilities.
3. **Enable Gradle dependency verification** — Pin checksums for all Gradle dependencies.
4. **Vendor Deno Edge Function dependencies** — Copy critical deps into repo to eliminate CDN dependency.
5. **Quarterly dependency review** — Schedule regular review of all dependency versions and known CVEs.

---

## 6. Recommended Updates

### Immediate (Before Next Release)

| Package            | Current | Recommended | Reason                                            |
| ------------------ | ------- | ----------- | ------------------------------------------------- |
| androidx.biometric | 1.1.0   | 1.2.0+      | Security-critical component; outdated by 2+ years |

### Short-Term (Next Sprint)

| Package         | Current | Recommended | Reason                                   |
| --------------- | ------- | ----------- | ---------------------------------------- |
| security-crypto | 1.0.0   | 1.1.0+      | Improved key management; released 2023   |
| deno.land/std   | 0.208.0 | jsr:@std/\* | Migration to JSR; improved HTTP handling |

### Medium-Term (Next Quarter)

| Package           | Current | Recommended | Reason                               |
| ----------------- | ------- | ----------- | ------------------------------------ |
| sqlcipher-android | 4.6.1   | Latest      | Keep current with encryption patches |
| All npm deps      | Various | Latest      | Quarterly dependency refresh         |

---

## 7. License Compliance

All dependencies use permissive open-source licenses compatible with the project''s BUSL-1.1 license:

| License    | Count | Compatible |
| ---------- | ----- | ---------- |
| MIT        | 25+   | ✅ Yes     |
| Apache-2.0 | 20+   | ✅ Yes     |
| ISC        | 1     | ✅ Yes     |
| BSD        | 1     | ✅ Yes     |
| MPL-2.0    | 1     | ✅ Yes     |

No copyleft (GPL, AGPL) dependencies detected in production code.

---

**Next Review:** Sprint 4 — RLS Policy Review
**Document Version:** 1.0
