# Security Testing Framework — Design & Implementation Spec

**Sprint:** 7 (Security Implementation)
**Status:** Draft — Pending Review
**Date:** 2025-07-24
**Author:** Security & Privacy Reviewer

---

## 1. Overview

This document specifies an automated security testing framework for the Finance
monorepo. The framework covers three pillars:

1. **Static security tests** — automated checks that run in CI on every PR
2. **Dependency audit workflow** — continuous vulnerability monitoring with blocking gates
3. **Security regression tests** — tests derived from past audit findings that prevent reintroduction

### Goals

- Every security audit finding must have a corresponding regression test
- Dependency vulnerabilities ≥ HIGH severity block merges to `main`
- No secrets, PII, or financial data in logs/error messages (enforced by static analysis)
- Security tests run in < 5 minutes to avoid slowing the development loop

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CI Pipeline (GitHub Actions)                   │
│                                                                   │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────────────────┐ │
│  │ Static       │  │ Dependency    │  │ Runtime Security       │ │
│  │ Security     │  │ Audit         │  │ Tests                  │ │
│  │ Checks       │  │ Workflow      │  │                        │ │
│  │              │  │               │  │ • Edge Function tests  │ │
│  │ • Secret     │  │ • npm audit   │  │ • RLS policy tests     │ │
│  │   scanning   │  │ • Gradle deps │  │ • CORS validation      │ │
│  │ • Log leak   │  │ • License     │  │ • Rate limit tests     │ │
│  │   detection  │  │   compliance  │  │ • Input validation     │ │
│  │ • Hardcoded  │  │ • SBOM gen    │  │ • Auth flow tests      │ │
│  │   creds      │  │               │  │                        │ │
│  └──────┬──────┘  └──────┬────────┘  └──────────┬─────────────┘ │
│         │                │                       │                │
│         └────────────────┴───────────────────────┘                │
│                          │                                        │
│                   Merge Gate: ALL must pass                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Static Security Checks

### 3.1 Sensitive Data Leak Detection

**Purpose:** Prevent accidental logging or exposure of PII, financial data,
auth tokens, or encryption keys.

**Implementation:** Custom ESLint rules + grep-based CI checks.

#### 3.1.1 Prohibited Patterns (grep / regex scan)

The following patterns must NOT appear in production code (excluding test
files, mocks, and documentation):

```yaml
# .github/security/prohibited-patterns.yml
patterns:
  # Auth tokens in log statements
  - name: token-in-log
    pattern: '(console\.(log|info|warn|error|debug)|Timber\.\w+|logger\.\w+)\s*\(.*\b(token|secret|password|apikey|api_key)\b'
    severity: CRITICAL
    message: 'Potential auth token/secret in log statement'

  # Financial amounts in log statements
  - name: amount-in-log
    pattern: '(console\.(log|info|warn|error|debug)|Timber\.\w+|logger\.\w+)\s*\(.*\b(amount|balance|cents|amount_cents)\b'
    severity: HIGH
    message: 'Financial amount in log statement'

  # Email addresses in log statements
  - name: email-in-log
    pattern: '(console\.(log|info|warn|error|debug)|Timber\.\w+|logger\.\w+)\s*\(.*\b(email|invited_email|user_email)\b'
    severity: HIGH
    message: 'Email address in log statement'

  # Hardcoded credentials
  - name: hardcoded-secret
    pattern: '(password|secret|api_key|apikey|private_key)\s*[=:]\s*["\x27][^"\x27]{8,}'
    severity: CRITICAL
    message: 'Potential hardcoded credential'
    exclude:
      - '*.test.*'
      - '*.spec.*'
      - '*.example'
      - '*.md'

  # SQL without parameterisation
  - name: string-concat-sql
    pattern: '(SELECT|INSERT|UPDATE|DELETE).*\+\s*(req\.|body\.|params\.|query\.)'
    severity: CRITICAL
    message: 'Potential SQL injection — use parameterized queries'

  # Wildcard CORS
  - name: wildcard-cors
    pattern: "Access-Control-Allow-Origin.*\\*"
    severity: CRITICAL
    message: 'Wildcard CORS origin — use allowlist'
```

#### 3.1.2 CI Workflow

```yaml
# .github/workflows/security-static.yml
name: Security Static Analysis

on:
  pull_request:
    branches: [main]

jobs:
  sensitive-data-scan:
    name: Sensitive Data Leak Detection
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - name: Scan for prohibited patterns
        run: |
          EXIT_CODE=0
          # Token/secret in logs
          if grep -rn --include="*.ts" --include="*.kt" --include="*.swift" \
            -E '(console\.(log|info|warn|error)|Timber\.\w+)\(.*\b(token|secret|password|apikey)\b' \
            --exclude-dir=node_modules --exclude-dir=build --exclude="*.test.*" \
            apps/ packages/ services/; then
            echo "::error::Potential auth token/secret in log statement"
            EXIT_CODE=1
          fi

          # Wildcard CORS
          if grep -rn --include="*.ts" \
            "Access-Control-Allow-Origin.*\*" \
            --exclude-dir=node_modules --exclude="*.test.*" --exclude="*.md" \
            services/; then
            echo "::error::Wildcard CORS origin detected"
            EXIT_CODE=1
          fi

          # Hardcoded credentials (skip tests and examples)
          if grep -rn --include="*.ts" --include="*.kt" \
            -E "(password|secret|api_key)\s*=\s*[\"'][^\"']{8,}" \
            --exclude-dir=node_modules --exclude-dir=build \
            --exclude="*.test.*" --exclude="*.example" \
            apps/ packages/ services/; then
            echo "::error::Potential hardcoded credential"
            EXIT_CODE=1
          fi

          exit $EXIT_CODE

      - name: Verify no console.log in production web code
        run: |
          # Web app should use structured logging, not console.log
          if grep -rn "console\.log" --include="*.ts" --include="*.tsx" \
            --exclude="*.test.*" --exclude="*.spec.*" --exclude="vite.config.ts" \
            apps/web/src/; then
            echo "::warning::console.log found in web production code — use structured logging"
          fi
```

### 3.2 Existing Security Scanning (Enhanced)

The current `security.yml` workflow includes:

- CodeQL for Java/Kotlin and JavaScript/TypeScript
- Dependency review action
- TruffleHog secret scanning

**Enhancements:**

1. **Add SARIF upload for security dashboard** — CodeQL results already upload;
   add custom SARIF for the grep-based scans.
2. **Make dependency-review blocking** — currently `continue-on-error: true`;
   change to `false` for HIGH+ severity.
3. **Add license compliance check** — deny GPL-3.0 and AGPL-3.0 (already configured
   but worth verifying on each PR).

---

## 4. Dependency Audit Workflow

### 4.1 Continuous Monitoring

The existing `dependabot.yml` covers npm, Gradle, and GitHub Actions ecosystems
with weekly scans. The following enhancements are needed:

#### 4.1.1 Automated Audit on Every PR

```yaml
# Addition to .github/workflows/security.yml or new workflow
dependency-audit:
  name: Dependency Vulnerability Audit
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4

    - uses: actions/setup-node@v4
      with:
        node-version-file: '.nvmrc'
        cache: 'npm'

    - run: npm ci

    - name: npm audit (production deps)
      run: |
        # Audit production dependencies only — fail on HIGH+
        npm audit --omit=dev --audit-level=high
      continue-on-error: false

    - name: npm audit (all deps — informational)
      run: |
        # Full audit including devDeps — informational only
        npm audit --audit-level=critical || true

    - name: Check for known vulnerable packages
      run: |
        # Explicit blocklist of packages with known issues
        BLOCKED_PACKAGES="event-stream|flatted@<3.4.0"
        if npm ls 2>/dev/null | grep -E "$BLOCKED_PACKAGES"; then
          echo "::error::Blocked vulnerable package detected"
          exit 1
        fi
```

#### 4.1.2 SBOM Generation

Generate a Software Bill of Materials (SBOM) on every release for compliance
and incident response:

```yaml
sbom-generation:
  name: Generate SBOM
  runs-on: ubuntu-latest
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: '.nvmrc'
        cache: 'npm'
    - run: npm ci
    - name: Generate CycloneDX SBOM
      run: npx @cyclonedx/cyclonedx-npm --output-file sbom.json
    - uses: actions/upload-artifact@v4
      with:
        name: sbom-${{ github.sha }}
        path: sbom.json
        retention-days: 90
```

### 4.2 Dependency Review Gate

Update the existing dependency-review job to be **blocking**:

```yaml
dependency-review:
  name: Dependency Review
  runs-on: ubuntu-latest
  timeout-minutes: 10
  if: github.event_name == 'pull_request'
  # CHANGE: Remove continue-on-error: true
  steps:
    - uses: actions/checkout@v4
    - uses: actions/dependency-review-action@v4
      with:
        fail-on-severity: high
        deny-licenses: GPL-3.0, AGPL-3.0, SSPL-1.0
        comment-summary-in-pr: always
```

---

## 5. Security Regression Test Suite

### 5.1 Rationale

Every finding from the security audits must have an automated regression test
to prevent reintroduction. Tests are organised by the audit finding ID.

### 5.2 Edge Function Security Tests

These tests run using Deno's built-in test runner against the shared modules.

#### 5.2.1 Test Manifest

| Audit Finding   | Test Description                                        | File                              |
| --------------- | ------------------------------------------------------- | --------------------------------- |
| P-1 (CORS)      | Verify no wildcard origin in getCorsHeaders             | `_shared/cors.test.ts`            |
| Sprint 5 fix    | Verify getClientIp uses rightmost X-Forwarded-For entry | `_shared/rate-limit.test.ts`      |
| Sprint 5 fix    | Verify isPlausibleIp rejects malicious payloads         | `_shared/rate-limit.test.ts`      |
| M-3 (audit-v2)  | Verify invitation role validated against allowlist      | `household-invite/index.test.ts`  |
| A-6 (audit-v1)  | Verify constant-time secret comparison                  | `_shared/auth.test.ts`            |
| H-1 (pre-lnch)  | Verify CRON_SECRET uses constant-time comparison        | `process-recurring/index.test.ts` |
| CD-5 (audit-v1) | Verify error responses don't leak internal details      | `_shared/response.test.ts`        |

#### 5.2.2 Example: CORS Regression Test

```typescript
// Regression test for P-1: CORS wildcard origin
// This test MUST fail if anyone reintroduces 'Access-Control-Allow-Origin: *'
Deno.test('CORS — never returns wildcard origin (P-1 regression)', () => {
  const cleanup = setEnvVars({ ALLOWED_ORIGINS: 'https://app.finance.example.com' });
  try {
    // Test with an unknown origin
    const req = createMockRequest({
      headers: { Origin: 'https://attacker.example.com' },
    });
    const headers = getCorsHeaders(req);

    // Must NOT be wildcard
    assertNotEquals(headers['Access-Control-Allow-Origin'], '*');
    // Must be empty string for disallowed origins
    assertEquals(headers['Access-Control-Allow-Origin'], '');
  } finally {
    cleanup();
  }
});

Deno.test('CORS — never returns wildcard even with no ALLOWED_ORIGINS', () => {
  const cleanup = setEnvVars({ ALLOWED_ORIGINS: '' });
  try {
    const req = createMockRequest({
      headers: { Origin: 'https://any-site.com' },
    });
    const headers = getCorsHeaders(req);

    assertNotEquals(headers['Access-Control-Allow-Origin'], '*');
  } finally {
    cleanup();
  }
});
```

#### 5.2.3 Example: IP Spoofing Regression Test

```typescript
// Regression test for Sprint 5: getClientIp IP spoofing fix
Deno.test('getClientIp — NEVER returns leftmost spoofed IP (Sprint 5 regression)', () => {
  const req = createMockRequest({
    headers: { 'X-Forwarded-For': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
  });
  const ip = getClientIp(req);

  // 1.1.1.1 is attacker-controlled — must NOT be returned
  assertNotEquals(ip, '1.1.1.1');
  // 3.3.3.3 is the rightmost (proxy-added) IP
  assertEquals(ip, '3.3.3.3');
});
```

### 5.3 Platform Security Tests

#### 5.3.1 Android Security Tests

```kotlin
// apps/android/src/test/kotlin/.../security/SecurityRegressionTest.kt

class SecurityRegressionTest {

    /**
     * S-1 regression: Verify allowBackup is false in AndroidManifest.
     * Parsed from the merged manifest at build time.
     */
    @Test
    fun `allowBackup must be false in release manifest`() {
        // This test parses the merged AndroidManifest.xml
        // to verify android:allowBackup="false"
    }

    /**
     * CD-4 regression: Verify Timber has no DebugTree in release builds.
     */
    @Test
    fun `release build must not plant Timber DebugTree`() {
        // Verify BuildConfig.DEBUG-gated Timber planting
        assertFalse(BuildConfig.DEBUG) // Only passes in release variant
    }

    /**
     * S-8 regression: Verify SyncCredentials.toString() is redacted.
     */
    @Test
    fun `SyncCredentials toString must not contain authToken`() {
        val creds = SyncCredentials(
            endpointUrl = "https://example.com",
            userId = "test-user",
            authToken = "super-secret-token",
        )
        assertFalse(creds.toString().contains("super-secret-token"))
    }
}
```

#### 5.3.2 Web Security Tests

```typescript
// apps/web/src/__tests__/security/security-regression.test.ts

describe('Security Regression Tests', () => {
  test('vite config has sourcemap disabled for production', () => {
    // Verify vite.config.ts build.sourcemap is false
    // This is a static check — parse the config file
  });

  test('auth tokens are never stored in localStorage', () => {
    // Verify no calls to localStorage.setItem with token-like keys
    // Scan src/auth/ for localStorage usage
  });

  test('CSP does not contain unsafe-eval in production', () => {
    // Verify Content-Security-Policy headers
  });
});
```

---

## 6. CI Integration Plan

### 6.1 New Workflow: `security-tests.yml`

```yaml
name: Security Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1' # Weekly Monday 6 AM UTC

permissions:
  contents: read
  security-events: write

jobs:
  # ── Static security analysis ────────────────────────────────
  static-analysis:
    name: Static Security Scan
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Prohibited pattern scan
        run: |
          # See section 3.1.1 for full implementation
          echo "Scanning for sensitive data leaks..."
          # ... grep-based checks ...

      - name: Verify security invariants
        run: |
          # CORS: no wildcard origin
          ! grep -r "Access-Control-Allow-Origin.*\*" \
            --include="*.ts" --exclude="*.test.*" --exclude="*.md" \
            services/

          # Rate limit: rightmost IP extraction
          grep -q "parts\[i\]" services/api/supabase/functions/_shared/rate-limit.ts || \
            (echo "ERROR: getClientIp must iterate from rightmost" && exit 1)

          # Android: R8 enabled
          grep -q "isMinifyEnabled = true" apps/android/build.gradle.kts || \
            (echo "ERROR: R8 must be enabled for release" && exit 1)

          # Web: sourcemaps disabled
          grep -q "sourcemap: false" apps/web/vite.config.ts || \
            (echo "ERROR: sourcemaps must be disabled in production" && exit 1)

  # ── Dependency audit ────────────────────────────────────────
  dependency-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - name: Audit production deps
        run: npm audit --omit=dev --audit-level=high

  # ── Edge Function security tests ───────────────────────────
  edge-function-tests:
    name: Edge Function Security Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v1.x
      - name: Run security-tagged tests
        working-directory: services/api/supabase/functions
        run: |
          deno test --allow-env _shared/cors.test.ts
          deno test --allow-env _shared/rate-limit.test.ts
          deno test --allow-env _shared/auth.test.ts
          deno test --allow-env _shared/abuse-detection.test.ts
```

### 6.2 Required Status Checks

The following status checks should be added as **required** for merging to `main`:

| Check Name                   | Blocks Merge | Notes                               |
| ---------------------------- | ------------ | ----------------------------------- |
| Static Security Scan         | Yes          | Pattern-based leak detection        |
| Dependency Audit             | Yes          | HIGH+ production vulns block merge  |
| Edge Function Security Tests | Yes          | Regression tests for audit findings |
| CodeQL (JS/TS)               | Yes          | Already exists, make required       |
| CodeQL (Java/Kotlin)         | No           | Non-blocking (toolchain issues)     |
| Dependency Review            | Yes          | License + vuln check on new deps    |
| TruffleHog Secret Scanning   | Yes          | Already exists                      |

---

## 7. Reporting & Alerting

### 7.1 Security Dashboard

Create a GitHub Actions workflow that generates a weekly security report:

```yaml
security-report:
  name: Weekly Security Report
  runs-on: ubuntu-latest
  if: github.event_name == 'schedule'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: '.nvmrc'
        cache: 'npm'
    - run: npm ci
    - name: Generate report
      run: |
        echo "# Weekly Security Report — $(date -I)" > security-report.md
        echo "" >> security-report.md
        echo "## npm Audit" >> security-report.md
        npm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities | to_entries[] | "- \(.key): \(.value)"' >> security-report.md
        echo "" >> security-report.md
        echo "## Dependency Count" >> security-report.md
        echo "- Production: $(npm ls --prod --json 2>/dev/null | jq '.dependencies | length')" >> security-report.md
        echo "- Dev: $(npm ls --dev --json 2>/dev/null | jq '.dependencies | length')" >> security-report.md
    - uses: actions/upload-artifact@v4
      with:
        name: security-report-${{ github.run_id }}
        path: security-report.md
        retention-days: 90
```

### 7.2 Alerting Rules

| Condition                                        | Alert Channel | Severity |
| ------------------------------------------------ | ------------- | -------- |
| New CRITICAL dependency vulnerability            | GitHub Issue  | P0       |
| TruffleHog detects verified secret               | GitHub Issue  | P0       |
| CodeQL finds new HIGH+ finding                   | PR comment    | P1       |
| npm audit finds new HIGH production vuln         | PR comment    | P1       |
| Weekly report shows vulnerability count increase | GitHub Issue  | P2       |

---

## 8. Implementation Phases

### Phase 1: Foundation (Sprint 7)

- [ ] Create `security-tests.yml` workflow with static analysis job
- [ ] Create prohibited patterns configuration
- [ ] Add security regression tests for Sprint 5 fixes
- [ ] Make dependency-review blocking (remove `continue-on-error`)
- [ ] Add npm audit job for production dependencies

### Phase 2: Comprehensive (Sprint 8)

- [ ] Add Android security regression tests
- [ ] Add web security regression tests
- [ ] Implement SBOM generation
- [ ] Add weekly security report workflow
- [ ] Configure required status checks

### Phase 3: Advanced (Sprint 9-10)

- [ ] Custom ESLint security rules (no-sensitive-log, no-hardcoded-secret)
- [ ] Integration with GitHub Advanced Security dashboard
- [ ] Automated OWASP ZAP scan on staging deployments
- [ ] Supply chain attestation (SLSA Level 2)

---

## 9. Test Naming Convention

All security tests must follow this naming convention:

```
[AUDIT-ID] — [description] (regression)
```

Examples:

- `P-1 — CORS never returns wildcard origin (regression)`
- `Sprint-5 — getClientIp uses rightmost X-Forwarded-For entry (regression)`
- `S-1 — Android allowBackup is false (regression)`
- `A-6 — Webhook secret uses constant-time comparison (regression)`

This makes it trivial to trace test failures back to the original audit finding.

---

## 10. Maintenance

### 10.1 Adding New Security Tests

When a new security audit finding is documented:

1. Create a regression test in the appropriate test file
2. Use the `[AUDIT-ID]` naming convention
3. Add the test to the manifest in section 5.2.1
4. Ensure the test runs in the `security-tests.yml` workflow

### 10.2 Reviewing False Positives

The grep-based pattern scanner may produce false positives. To suppress:

1. Add a `// security-ignore: [pattern-name] — [justification]` comment
2. Document the suppression in this spec (Appendix A)
3. Suppressions require security reviewer approval

### 10.3 Quarterly Review

Every quarter:

- Review all security test suppressions
- Update prohibited patterns based on new threat intelligence
- Verify all audit findings have regression tests
- Review dependency audit thresholds

---

## Appendix A: Suppressed Patterns

| File       | Pattern | Justification | Reviewer | Date |
| ---------- | ------- | ------------- | -------- | ---- |
| (none yet) |         |               |          |      |

---

## Appendix B: Related Documents

- `docs/architecture/security-audit-v1.md` — Original MASVS audit
- `docs/architecture/security-audit-api-v2.md` — API-specific audit
- `docs/audits/pre-launch-security-review.md` — Pre-launch findings
- `docs/architecture/dependency-audit.md` — Dependency vulnerability report
- `.github/workflows/security.yml` — Current security scanning workflow
- `.github/workflows/pen-test.yml` — OWASP ZAP penetration testing
- `.github/dependabot.yml` — Dependabot configuration
