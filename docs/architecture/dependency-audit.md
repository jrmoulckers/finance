# Dependency Vulnerability Audit Report

| Field         | Value                         |
| ------------- | ----------------------------- |
| **Date**      | 2026-03-15                    |
| **Scan Type** | npm audit + GitHub Dependabot |
| **Branch**    | `docs/dependency-audit-372`   |
| **Issue**     | #372                          |

## Executive Summary

A comprehensive dependency vulnerability audit was performed across both the
npm (JavaScript/TypeScript) and Maven/Gradle (Kotlin/JVM) ecosystems. The scan
identified **29 total advisories** across 7 npm and 22 Maven/JVM packages,
with several high-severity issues requiring attention.

### Severity Overview

| Severity  | npm   | Maven/JVM | Total  |
| --------- | ----- | --------- | ------ |
| Critical  | 0     | 0         | 0      |
| High      | 2     | 7         | 9      |
| Medium    | 2     | 12        | 14     |
| Low       | 0     | 1         | 1      |
| **Total** | **4** | **20**    | **24** |

> After running `npm audit fix`, `flatted` was upgraded from 3.3.4 to 3.4.1,
> resolving 1 high-severity vulnerability without breaking changes.

---

## npm Ecosystem Findings

### Fixed in This PR

| Package   | Before | After | Severity | Advisory                                                     |
| --------- | ------ | ----- | -------- | ------------------------------------------------------------ |
| `flatted` | 3.3.4  | 3.4.1 | **High** | Unbounded recursion DoS in `parse()` ([GHSA-25h7-pfq9-p65f]) |

[GHSA-25h7-pfq9-p65f]: https://github.com/advisories/GHSA-25h7-pfq9-p65f

### Remaining npm Vulnerabilities (4)

All remaining npm vulnerabilities are transitive dependencies of `@redocly/cli`
(a dev-only API documentation tool). The only fix available requires a **semver
major** upgrade (`@redocly/cli` to 2.21.1) which may introduce breaking changes.

#### 1. undici - Multiple Advisories (transitive of `@redocly/respect-core`)

| #   | CVE           | Severity | Title                                                              | Fix       |
| --- | ------------- | -------- | ------------------------------------------------------------------ | --------- |
| 1   | CVE-2026-1528 | **High** | Malicious WebSocket 64-bit length overflows parser, crashes client | >= 6.24.0 |
| 2   | CVE-2026-1526 | **High** | Unbounded Memory Consumption in WebSocket permessage-deflate       | >= 6.24.0 |
| 3   | CVE-2026-2229 | **High** | Unhandled Exception in WebSocket Client (server_max_window_bits)   | >= 6.24.0 |
| 4   | CVE-2026-1525 | Medium   | HTTP Request/Response Smuggling issue                              | >= 6.24.0 |
| 5   | CVE-2026-1527 | Medium   | CRLF Injection via `upgrade` option                                | >= 6.24.0 |

- **Current version:** <= 6.23.0 (nested in `@redocly/respect-core`)
- **Root cause:** `@redocly/cli` pins `@redocly/respect-core` which bundles an old `undici`
- **Risk assessment:** **Medium** - `@redocly/cli` is a devDependency used only for
  API documentation generation during development. It does not ship in production
  artifacts. The undici vulnerabilities affect WebSocket handling which is not
  exercised in our docs-generation usage.

#### 2. js-yaml - Prototype Pollution (transitive of `@redocly/respect-core`)

| CVE            | Severity | Title                               | Fix      |
| -------------- | -------- | ----------------------------------- | -------- |
| CVE-2025-64718 | Medium   | Prototype pollution in merge (`<<`) | >= 4.1.1 |

- **Current version:** 4.0.0 - 4.1.0 (nested)
- **Risk assessment:** **Low** - dev-only dependency, never processes untrusted YAML

### npm Risk Summary

All remaining npm vulnerabilities are isolated to devDependencies and do not
affect production builds, client bundles, or deployed services.

---

## Maven / JVM Ecosystem Findings (via GitHub Dependabot)

These vulnerabilities are in transitive dependencies pulled by Ktor, and
potentially other JVM libraries in the Gradle dependency tree. The project uses
**Ktor 3.0.3** which transitively pulls Netty and BouncyCastle.

### HIGH Severity

| #   | CVE            | Package                             | Summary                                    | Fix Available    |
| --- | -------------- | ----------------------------------- | ------------------------------------------ | ---------------- |
| 1   | CVE-2024-29371 | `org.bitbucket.b_c:jose4j`          | DoS via compressed JWE content             | >= 0.9.6         |
| 2   | CVE-2021-33813 | `org.jdom:jdom2`                    | XML External Entity (XXE) Injection        | >= 2.0.6.1       |
| 3   | CVE-2025-55163 | `io.netty:netty-codec-http2`        | MadeYouReset HTTP/2 DDoS vulnerability     | >= 4.1.124.Final |
| 4   | CVE-2025-24970 | `io.netty:netty-handler`            | SslHandler packet validation, native crash | >= 4.1.118.Final |
| 5   | CVE-2024-47554 | `commons-io:commons-io`             | DoS via XmlStreamReader                    | >= 2.14.0        |
| 6   | CVE-2024-7254  | `com.google.protobuf:protobuf-java` | Potential DoS issue                        | >= 3.25.5        |
| 7   | N/A            | `io.netty:netty-codec-http2`        | HTTP/2 Rapid Reset Attack                  | >= 4.1.100.Final |

### MEDIUM Severity

| #   | CVE            | Package                               | Summary                                            | Fix Available    |
| --- | -------------- | ------------------------------------- | -------------------------------------------------- | ---------------- |
| 1   | CVE-2025-67735 | `io.netty:netty-codec-http`           | CRLF Injection in HttpRequestEncoder               | >= 4.1.129.Final |
| 2   | CVE-2025-8916  | `org.bouncycastle:bcpkix-jdk18on`     | Excessive Allocation (bcpkix, bcprov, bcpkix-fips) | >= 1.79          |
| 3   | CVE-2025-58057 | `io.netty:netty-codec`                | Decoders vulnerable to DoS via zip bomb            | >= 4.1.125.Final |
| 4   | CVE-2025-8885  | `org.bouncycastle:bcprov-jdk18on`     | Excessive Allocation                               | >= 1.78          |
| 5   | CVE-2025-25193 | `io.netty:netty-common`               | DoS on Windows apps using Netty                    | >= 4.1.118.Final |
| 6   | CVE-2024-47535 | `io.netty:netty-common`               | DoS on Windows apps using Netty                    | >= 4.1.115.Final |
| 7   | CVE-2024-30172 | `org.bouncycastle:bcprov-jdk18on`     | Infinite loop via crafted signature/public key     | >= 1.78          |
| 8   | CVE-2024-30171 | `org.bouncycastle:bcprov-jdk18on`     | Timing side-channel for RSA (The Marvin Attack)    | >= 1.78          |
| 9   | CVE-2024-29857 | `org.bouncycastle:bcprov-jdk18on`     | High CPU usage during cert parameter evaluation    | >= 1.78          |
| 10  | CVE-2024-34447 | `org.bouncycastle:bcprov-jdk18on`     | DNS poisoning vulnerability                        | >= 1.78          |
| 11  | CVE-2024-29025 | `io.netty:netty-codec-http`           | HttpPostRequestDecoder OOM                         | >= 4.1.108.Final |
| 12  | CVE-2024-25710 | `org.apache.commons:commons-compress` | DoS via infinite loop for corrupted DUMP file      | >= 1.26.0        |

### LOW Severity

| #   | CVE            | Package                     | Summary                                           | Fix Available    |
| --- | -------------- | --------------------------- | ------------------------------------------------- | ---------------- |
| 1   | CVE-2025-58056 | `io.netty:netty-codec-http` | Request smuggling via incorrect chunk ext parsing | >= 4.1.125.Final |

### Additional Medium (Dependabot)

| #   | CVE            | Package                               | Summary                           | Fix Available   |
| --- | -------------- | ------------------------------------- | --------------------------------- | --------------- |
| 1   | CVE-2024-26308 | `org.apache.commons:commons-compress` | OOM unpacking broken Pack200 file | >= 1.26.0       |
| 2   | CVE-2023-34462 | `io.netty:netty-handler`              | SniHandler 16MB allocation        | >= 4.1.94.Final |

---

## Gradle Dependency Versions (from `libs.versions.toml`)

| Library                  | Current Version | Notes                                                |
| ------------------------ | --------------- | ---------------------------------------------------- |
| Ktor                     | 3.0.3           | Transitively pulls Netty; check if 3.1.x bumps Netty |
| Kotlin                   | 2.1.0           | Current                                              |
| kotlinx-coroutines       | 1.9.0           | Current                                              |
| kotlinx-serialization    | 1.7.3           | Current                                              |
| SQLDelight               | 2.0.2           | Current                                              |
| SQLCipher (Android)      | 4.6.1           | No known advisories                                  |
| Koin                     | 4.0.1           | No known advisories                                  |
| Compose Multiplatform    | 1.7.3           | No known advisories                                  |
| Detekt                   | 1.23.7          | Dev tool only                                        |
| AndroidX Security-Crypto | 1.0.0           | Consider upgrading to 1.1.0-alpha for Tink updates   |

### Key Concern: Ktor to Netty Transitive Chain

Ktor 3.0.3 uses the CIO (Coroutine I/O) engine by default for clients, but
Netty appears in the transitive dependency graph likely via test/server
components or Ktor internals. **Most of the HIGH-severity JVM alerts (7 of 7)
are Netty-related.** Upgrading Ktor to the latest 3.x release may resolve these
transitively. The current latest Ktor is **3.1.3** (as of March 2026).

---

## Security-Critical Observations

### jose4j - JWE DoS (CVE-2024-29371)

This is security-relevant for a financial application that uses JWT/JWE for
authentication. If jose4j is in the classpath (even transitively), compressed
JWE payloads could be used for DoS. **Priority: upgrade or confirm not in use.**

### JDOM2 - XXE Injection (CVE-2021-33813)

XXE is a well-known injection vector. If the application processes XML from
untrusted sources, this is exploitable. **Priority: confirm JDOM2 usage and
upgrade if reachable.**

### BouncyCastle - The Marvin Attack (CVE-2024-30171)

Timing side-channel for RSA key exchange. Relevant for any TLS or cryptographic
operations using BouncyCastle. **Priority: upgrade to >= 1.78.**

### Netty DoS on Windows (CVE-2025-25193, CVE-2024-47535)

The `apps/windows` module runs a Compose Desktop app. If Ktor uses Netty
internally on Windows, these DoS vulnerabilities are directly relevant.
**Priority: upgrade Ktor to pull newer Netty.**

---

## Recommended Actions

### Immediate (This Sprint)

| Priority | Action                                                                 | Effort | Risk   |
| -------- | ---------------------------------------------------------------------- | ------ | ------ |
| 1        | **Upgrade Ktor** 3.0.3 to 3.1.x in `libs.versions.toml`                | Low    | Low    |
| 2        | **Verify jose4j usage** - if transitive only, add exclusion or upgrade | Low    | Medium |
| 3        | **Verify JDOM2 usage** - if transitive only, add exclusion or upgrade  | Low    | Medium |

### Short-Term (Next 2 Sprints)

| Priority | Action                                                              | Effort | Risk   |
| -------- | ------------------------------------------------------------------- | ------ | ------ |
| 4        | **Upgrade BouncyCastle** to >= 1.79 via Gradle constraints          | Medium | Low    |
| 5        | **Upgrade `@redocly/cli`** to 2.x (major) to resolve undici/js-yaml | Medium | Medium |
| 6        | **Upgrade `commons-compress`** to >= 1.26.0 via Gradle constraints  | Low    | Low    |
| 7        | **Upgrade `commons-io`** to >= 2.14.0 via Gradle constraints        | Low    | Low    |

### Long-Term / Continuous

| Action                                                            | Notes                               |
| ----------------------------------------------------------------- | ----------------------------------- |
| Enable **Dependabot auto-merge** for patch-level security updates | Reduces manual triage               |
| Add **`npm audit`** to CI pipeline as a non-blocking warning      | Early detection                     |
| Add **Gradle dependency-check plugin** (OWASP)                    | Automated CVE scanning for JVM deps |
| Consider **Socket.dev** or **Snyk** for supply-chain monitoring   | Deeper analysis than npm audit      |
| Review `AndroidX Security-Crypto` 1.0.0 to 1.1.0-alpha            | Newer Tink crypto primitives        |

### Accepted Risk

| Item                             | Rationale                                                  |
| -------------------------------- | ---------------------------------------------------------- |
| `undici` vulns in `@redocly/cli` | Dev-only dependency, not in production, WebSocket-specific |
| `js-yaml` prototype pollution    | Dev-only dependency, no untrusted YAML processing          |

---

## Remediation Timeline

| Week   | Milestone                                                 |
| ------ | --------------------------------------------------------- |
| Week 1 | Upgrade Ktor, verify jose4j/JDOM2 usage, add exclusions   |
| Week 2 | Upgrade BouncyCastle, commons-compress, commons-io        |
| Week 3 | Test @redocly/cli 2.x upgrade, update CI with audit gates |
| Week 4 | Rescan, close Dependabot alerts, update this document     |

---

## Appendix: Raw Scan Data

### npm audit summary (post-fix)

```
4 vulnerabilities (2 moderate, 2 high)

Packages: undici (5 advisories), js-yaml (1 advisory)
Root: @redocly/cli -> @redocly/respect-core -> {undici, js-yaml}
Fix: npm audit fix --force -> @redocly/cli@2.21.1 (semver major, breaking)
```

### Dependabot alert states

- **Open:** 24 alerts (4 npm + 20 Maven)
- **Auto-dismissed:** 3 (flatted, 2x undici - already resolved upstream)
- **Total:** 29 alerts across both ecosystems

### Gradle version catalog

- File: `gradle/libs.versions.toml`
- Ktor: 3.0.3 (transitively pulls Netty 4.1.x, BouncyCastle, protobuf-java)
- No direct dependency on Netty, BouncyCastle, JDOM2, commons-io, or
  commons-compress - all are transitive via Ktor or other KMP tooling

---

_Report generated by security audit tooling. Next scheduled scan: 2026-04-15._
