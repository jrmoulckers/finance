# ADR-0006: CI/CD Strategy

**Status:** Accepted
**Date:** 2025-07-15
**Author:** AI agent (Copilot), with human review pending
**Reviewers:** TBD

## Context

Finance is a multi-platform monorepo containing iOS (Swift), Android (Kotlin), Web (TypeScript/React), and Windows (.NET/WinUI) applications alongside shared packages (`core`, `models`, `sync`) and a backend API. The project uses an **Agentic Kanban** SDLC where Copilot coding agent is a first-class contributor, opening PRs and iterating based on CI feedback.

Key forces driving this decision:

- **Monorepo efficiency:** Running all platform builds on every PR is wasteful — a change to `apps/web` should not trigger an iOS build. We need affected-only builds with dependency graph awareness.
- **Multi-platform build matrix:** Four platforms require four different runner types (ubuntu, macos, windows) with different toolchains (Node.js, Gradle, Xcode, MSBuild).
- **Cost sensitivity:** macOS runners cost 10x Linux runners ($0.08/min vs $0.008/min). Unoptimized CI could easily exceed $500/month.
- **AI agent compatibility:** The Copilot coding agent opens PRs that go through the same CI pipeline as human PRs. CI must provide fast, clear, actionable feedback so the agent can iterate.
- **Security posture:** As a financial application, elevated security scanning is required — SAST, dependency scanning, secret detection, and license compliance.
- **Release complexity:** Four app stores/distribution channels (App Store, Play Store, Web hosting, Microsoft Store) each with different signing, submission, and review processes.
- **"Ship when ready":** Continuous deployment, not release trains. Each platform releases independently.

## Decision

We will implement a **GitHub Actions + Turborepo CI/CD pipeline** with the following key components:

### 1. GitHub Actions as Unified CI Platform

GitHub Actions is the sole CI/CD platform for all platforms and workflows. This provides:
- All runner types needed (ubuntu, macos, windows) in one system.
- Native integration with Copilot coding agent (same platform where agent opens PRs).
- Built-in security features (CodeQL, Dependabot, secret scanning, push protection).
- Environments with manual approval for production releases.

### 2. Turborepo for Affected-Only Monorepo CI

Turborepo provides lightweight, dependency-graph-aware task orchestration:

```bash
# Run tests only for packages affected by the current change
npx turbo run test --filter='...[origin/main...HEAD]'

# Build only affected packages
npx turbo run build --filter='...[origin/main...HEAD]'
```

**Why Turborepo over alternatives:**

| Approach | Pros | Cons | Fit |
|----------|------|------|-----|
| **Turborepo** | Simple config, excellent caching, JS-native, automatic dependency graph | Less mature than Nx for non-JS | ✅ Best fit |
| **Nx** | Full-featured, CI distribution, generators | Heavy, opinionated, steep learning curve | ⚠️ Overkill at current scale |
| **Custom path filters** | Zero dependencies, simple YAML | No dependency graph, manual maintenance, breaks as repo grows | ⚠️ Fragile |
| **dorny/paths-filter** | Easy per-job triggers | No transitive dependency detection | ⚠️ Supplement only |

**Dependency graph:**
```
apps/ios ──────┐
apps/android ──┤
apps/web ──────┼── packages/core ── packages/models
apps/windows ──┤
services/api ──┘
               └── packages/sync ── packages/models
```

A change to `packages/models` automatically triggers tests in ALL consumers (all apps, sync, api). Turborepo handles this via its dependency graph derived from workspace `package.json` files.

**`turbo.json` configuration:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json"],
  "globalEnv": ["NODE_ENV", "CI"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "package.json", "tsconfig.json"],
      "outputs": ["dist/**", "build/**", ".next/**"],
      "cache": true
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "test/**", "**/*.test.*", "package.json"],
      "outputs": ["coverage/**"],
      "cache": true
    },
    "lint": {
      "inputs": ["src/**", "*.config.*", ".eslintrc*", "package.json"],
      "outputs": [],
      "cache": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig.json"],
      "outputs": [],
      "cache": true
    },
    "design-tokens#build": {
      "inputs": ["tokens/**/*.json", "config.json"],
      "outputs": ["build/**"],
      "cache": true
    }
  }
}
```

### 3. Fastlane for Mobile Build & Release Automation

[Fastlane](https://docs.fastlane.tools/) handles code signing, building, testing, and store submission for iOS and Android:

- **iOS:** Fastlane Match for certificate/provisioning profile management, `pilot` for TestFlight uploads, `deliver` for App Store submission.
- **Android:** Fastlane `supply` for Play Store submission, Gradle integration for builds.

### 4. Changesets for Per-Package Versioning

[Changesets](https://github.com/changesets/changesets) manages independent versioning for each package in the monorepo:

1. Developer adds a changeset: `npx changeset` → creates `.changeset/descriptive-name.md`.
2. PR includes the changeset describing what changed and the semver bump type.
3. On merge to main, Changesets bot opens a "Version Packages" PR.
4. Merging the version PR bumps versions, updates `CHANGELOG.md`, and publishes.

**Per-platform version formats:**
- `packages/*` → npm semver (e.g., `1.2.3`)
- `apps/ios` → `CFBundleShortVersionString` (e.g., `1.3.0`) + build number
- `apps/android` → `versionName` (e.g., `1.3.0`) + `versionCode`
- `apps/windows` → MSIX version (e.g., `1.3.0.0`)
- `apps/web` → semver tied to deployment (e.g., `2.1.0`)

### 5. Workflow Architecture

Three workflow tiers, each triggered at different stages:

#### Tier 1: PR Checks (`ci.yml`) — Every PR

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      shared: ${{ steps.filter.outputs.shared }}
      web: ${{ steps.filter.outputs.web }}
      ios: ${{ steps.filter.outputs.ios }}
      android: ${{ steps.filter.outputs.android }}
      windows: ${{ steps.filter.outputs.windows }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            shared:
              - 'packages/**'
              - 'services/**'
            web:
              - 'apps/web/**'
              - 'packages/**'
            ios:
              - 'apps/ios/**'
              - 'packages/**'
            android:
              - 'apps/android/**'
              - 'packages/**'
            windows:
              - 'apps/windows/**'
              - 'packages/**'

  shared-tests:
    needs: detect-changes
    if: needs.detect-changes.outputs.shared == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx turbo run lint test typecheck --filter='...[origin/main...HEAD]'

  web-build:
    needs: detect-changes
    if: needs.detect-changes.outputs.web == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx turbo run build test --filter=web...
      - uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: ./apps/web/lighthouserc.json

  android-build:
    needs: detect-changes
    if: needs.detect-changes.outputs.android == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 21 }
      - uses: gradle/actions/setup-gradle@v4
      - run: cd apps/android && ./gradlew assembleDebug testDebugUnitTest

  ios-build:
    needs: detect-changes
    if: needs.detect-changes.outputs.ios == 'true'
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci --ignore-scripts
      - uses: actions/cache@v4
        with:
          path: apps/ios/Pods
          key: pods-${{ hashFiles('apps/ios/Podfile.lock') }}
      - run: cd apps/ios && pod install
      - run: cd apps/ios && bundle exec fastlane build_and_test

  windows-build:
    needs: detect-changes
    if: needs.detect-changes.outputs.windows == 'true'
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: 9.0.x }
      - run: dotnet restore apps/windows
      - run: dotnet build apps/windows --configuration Release
      - run: dotnet test apps/windows --logger trx
```

#### Tier 2: Merge Pipeline (`e2e.yml`) — On Push to Main

E2E tests run only on merge to main to save cost:

```yaml
name: E2E Tests
on:
  push:
    branches: [main]

jobs:
  web-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx turbo run build --filter=web...
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --project=chromium

  ios-e2e:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - run: cd apps/ios && bundle exec fastlane e2e_tests

  android-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          script: cd apps/android && ./gradlew connectedAndroidTest
```

#### Tier 3: Release Pipeline — On Tag Push

Each platform has a dedicated release workflow triggered by platform-prefixed tags:

```
Tag: ios/v1.3.0    → release-ios.yml    → TestFlight → App Store
Tag: android/v1.3.0 → release-android.yml → Internal track → Play Store
Tag: web/v2.1.0    → release-web.yml    → Staging → Production
Tag: windows/v1.3.0 → release-windows.yml → Flight ring → Microsoft Store
```

### 6. Platform Build Matrix

| Platform | Runner | Toolchain | Build Tool | Test Framework | Est. Duration |
|----------|--------|-----------|------------|----------------|---------------|
| Shared packages | ubuntu-latest | Node.js 22 | Turborepo | Vitest | 1–2 min |
| Web | ubuntu-latest | Node.js 22 | Turborepo + Vite | Vitest + RTL | 3–5 min |
| Android | ubuntu-latest | JDK 21 | Gradle | JUnit | 5–8 min |
| iOS | macos-14 (M1) | Xcode 16 | xcodebuild + Fastlane | XCTest | 8–12 min |
| Windows | windows-latest | .NET 9 | MSBuild | MSTest/xUnit | 5–8 min |

### 7. Testing Strategy (Unit/Integration/E2E Tiers)

```
        ┌─────────┐
        │  E2E    │  Per platform, on merge to main only
        │ (slow)  │  ~10-30 min per platform
        ├─────────┤
        │  Integ  │  API + sync, on every PR
        │  ration │  ~3-5 min
        ├─────────┤
        │  Unit   │  Per package, on every PR (via Turborepo)
        │ (fast)  │  ~1-2 min
        └─────────┘
```

**Unit tests (every PR):**
- Shared packages: Vitest on ubuntu-latest
- Web: Vitest + React Testing Library on ubuntu-latest
- Android: JUnit + Gradle on ubuntu-latest
- iOS: XCTest on macos-14
- Windows: MSTest/xUnit on windows-latest

**Integration tests (every PR):**
- API integration: Spin up API with test database, run request/response tests.
- Sync integration: Test CRDT conflict resolution, offline/online scenarios.
- Run on ubuntu-latest with Docker Compose for service dependencies.

**E2E tests (merge to main only):**
- Web: Playwright on ubuntu-latest (~5–10 min)
- iOS: XCUITest on macos-14 (~15–30 min)
- Android: Espresso on ubuntu-latest with emulator (~10–20 min)
- Windows: WinAppDriver on windows-latest (~10–15 min)
- Test critical user flows only: login, add transaction, sync, reports.

**Accessibility audits in CI:**

| Tool | Scope | Trigger |
|------|-------|---------|
| axe-core (`@axe-core/playwright`) | Web components | Every PR (web changes) |
| Lighthouse CI | Full page a11y + performance | Every PR (web changes) |
| Accessibility Insights CLI | Windows app | On merge (windows) |
| XCUITest accessibility assertions | iOS app | On merge (iOS) |

**Policy:** PRs that introduce axe-core critical/serious accessibility violations are blocked from merge.

### 8. Release Automation Per Platform

**iOS release flow:**
```
merge to main → build on macos-14 → Fastlane Match (signing) →
Fastlane pilot (TestFlight upload) → manual promote to App Store
```

**Android release flow:**
```
merge to main → build on ubuntu → Fastlane supply (internal track) →
manual promote to beta → manual promote to production
```

**Web release flow:**
```
merge to main → auto-deploy to staging (Vercel preview) →
manual promote to production (or auto-deploy)
```

**Windows release flow:**
```
merge to main → build MSIX on windows-latest →
submit via MS Store Submission API (flight ring) → manual promote to production
```

### 9. Security Scanning

| Scan Type | Tool | Trigger | Gate |
|-----------|------|---------|------|
| **SAST** | GitHub CodeQL | Every PR | Block on high/critical |
| **Dependency scanning** | Dependabot | Continuous | Auto-PR for updates |
| **Secret scanning** | GitHub Advanced Security | Every push | Block on detected secrets (push protection) |
| **License compliance** | Dependabot / FOSSA | Weekly | Warn on copyleft |
| **DAST** | OWASP ZAP | On deploy to staging | Warn (block on critical) |
| **Container scanning** | Trivy | If/when Docker is used | Block on critical CVEs |

**Dependabot configuration (`.github/dependabot.yml`):**
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      production:
        dependency-type: "production"
      development:
        dependency-type: "development"
  - package-ecosystem: "gradle"
    directory: "/apps/android"
    schedule:
      interval: "weekly"
  - package-ecosystem: "nuget"
    directory: "/apps/windows"
    schedule:
      interval: "weekly"
```

**CodeQL custom queries** for financial app patterns:
- Hardcoded API keys or tokens
- Insecure cryptographic usage
- SQL injection in API layer
- Sensitive data logging (account numbers, balances)

### 10. Cost Estimates

**Runner costs (GitHub-hosted, private repo):**

| Runner | Cost/min |
|--------|----------|
| ubuntu-latest | $0.008 |
| windows-latest | $0.016 |
| macos-14 (M1) | $0.08 |

**Estimated monthly cost (moderate usage):**

| Activity | Runs/month | Min/run | Runner | Est. Cost |
|----------|-----------|---------|--------|-----------|
| Shared package tests | 200 | 3 | ubuntu | $4.80 |
| Web build + test | 100 | 5 | ubuntu | $4.00 |
| Android build + test | 80 | 8 | ubuntu | $5.12 |
| iOS build + test | 80 | 10 | macos-14 | $64.00 |
| Windows build + test | 60 | 8 | windows | $7.68 |
| E2E (all platforms) | 30 | 30 avg | mixed | ~$50.00 |
| Security scans | 200 | 2 | ubuntu | $3.20 |
| Copilot agent | 100 | 5 | ubuntu | $4.00 |
| **Total** | | | | **~$143/mo** |

iOS is the biggest cost driver. The `macos-14` Apple Silicon runners are ~2x faster than `macos-13`, reducing per-build cost.

**Cost reduction strategies:**

| Strategy | Savings | How |
|----------|---------|-----|
| Affected-only builds | 50–80% | Turborepo `--filter` |
| Remote caching | 70–90% on hits | Turborepo Remote Cache |
| Skip E2E on PRs | ~60% of total | E2E only on merge to main |
| Concurrency control | Avoid duplicates | `cancel-in-progress: true` |
| Apple Silicon runners | ~2x faster iOS | `macos-14` over `macos-13` |

## Alternatives Considered

### Alternative 1: CircleCI

- **Pros:** Mature platform; Docker layer caching; macOS and Linux runners; orbs ecosystem.
- **Cons:** Separate system from GitHub (context switching); no native Copilot agent integration; higher cost for macOS; less integrated security scanning; separate secrets management.

### Alternative 2: GitLab CI

- **Pros:** Integrated DevOps platform; built-in security scanning (SAST, DAST, container scanning); auto DevOps templates.
- **Cons:** Requires GitLab migration or mirroring; no Copilot coding agent integration; macOS runners require self-hosted infrastructure; separate platform from GitHub where code lives.

### Alternative 3: Xcode Cloud for iOS

- **Pros:** Native Apple integration; automatic signing; 25 free compute hours/month; tight Xcode/TestFlight integration.
- **Cons:** Apple-only — cannot unify with other platform builds; limited customization (UI-driven config); no Copilot agent compatibility; doesn't support the shared package testing workflow.

### Alternative 4: Nx Instead of Turborepo

- **Pros:** More mature; CI distribution (Nx Agents); code generators; broader language support; computation caching.
- **Cons:** Heavier and more opinionated; steeper learning curve; overkill at current repo scale; plugin system adds complexity; Turborepo covers our needs with simpler config.

## Consequences

### Positive

- **Unified platform:** All CI/CD in GitHub Actions — no context switching, single secrets store, native integration with PRs, issues, and Copilot.
- **Cost-efficient:** Affected-only builds with Turborepo + remote caching reduces CI minutes by 50–80%. Estimated ~$143/month for moderate usage.
- **Agent-friendly:** Copilot coding agent gets the same CI pipeline as humans, with clear error output for iterative fixes.
- **Independent releases:** Each platform releases on its own cadence — no release trains blocking other platforms.
- **Security by default:** CodeQL, Dependabot, and secret scanning run on every PR with blocking gates.

### Negative

- **GitHub Actions vendor lock-in:** Workflow YAML, actions marketplace, runner types, and secrets management are GitHub-specific. Migration to another CI would require rewriting all workflows.
- **macOS runner cost:** iOS builds remain expensive ($0.08/min). A 10-minute iOS build costs as much as 100 minutes of Linux builds.
- **Workflow complexity:** Multiple workflow files (ci.yml, e2e.yml, security.yml, 4 release workflows) require maintenance and coordination.
- **Turborepo limitations for non-JS:** Android (Gradle) and Windows (.NET) builds are not managed by Turborepo's dependency graph — they use path filters for triggering.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GitHub Actions outage blocks all CI | Low | High | Workflows are YAML-based and portable; can migrate to self-hosted runners |
| Remote cache poisoning | Low | Medium | Use signed cache artifacts; restrict cache write to trusted workflows |
| macOS runner costs spike | Medium | Medium | Monitor usage; consider Xcode Cloud as iOS-only supplement; self-hosted Mac minis |
| Fastlane signing issues | Medium | Medium | Fastlane Match with encrypted git repo; documented rotation procedure |
| Changeset fatigue (developers skip) | Medium | Low | CI check requiring changeset on relevant PRs; bot reminders |

## Implementation Notes

### Workflow File Structure

```
.github/
├── workflows/
│   ├── copilot-setup-steps.yml     # Copilot agent environment (exists)
│   ├── ci.yml                      # PR checks — affected-only builds + tests
│   ├── e2e.yml                     # E2E tests — runs on merge to main
│   ├── security.yml                # CodeQL + security scanning
│   ├── release-ios.yml             # iOS App Store submission
│   ├── release-android.yml         # Android Play Store submission
│   ├── release-web.yml             # Web deployment
│   └── release-windows.yml         # Windows Store submission
├── dependabot.yml                  # Dependency update configuration
└── CODEOWNERS                      # Review requirements
```

### Caching Strategy

| Layer | Tool | Scope | Cache Key |
|-------|------|-------|-----------|
| Task output | Turborepo local | Per-runner, per-task | Automatic (content hash) |
| Remote cache | Turborepo Remote Cache | Cross-runner, cross-PR | Automatic |
| Node modules | `actions/cache` | Per-runner | `node-${{ runner.os }}-${{ hashFiles('package-lock.json') }}` |
| Gradle | `gradle/actions/setup-gradle` | Android builds | Built-in (wrapper + config hash) |
| CocoaPods | `actions/cache` | iOS builds | `pods-${{ hashFiles('apps/ios/Podfile.lock') }}` |
| NuGet | `actions/cache` | Windows builds | `nuget-${{ hashFiles('**/*.csproj') }}` |
| Turborepo | `actions/cache` | Cross-PR | `turbo-${{ runner.os }}-${{ github.sha }}` |

### Secrets Management

- All signing certificates, API keys, and tokens stored in **GitHub Actions secrets**.
- **GitHub Environments** for production secrets with required manual approval.
- Secrets rotated quarterly.
- `::add-mask::` used in workflows to prevent accidental logging.
- Separate environments: `staging` (auto-deploy), `production` (manual approval).

### Conventional Commits

Enforced via `commitlint` + `husky` pre-commit hook:
```
feat(core): add transaction categorization engine
fix(sync): resolve CRDT merge conflict on concurrent edits
chore(ci): add iOS build workflow
docs(adr): add CI/CD strategy decision record
```

### Implementation Priority

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1 | `ci.yml` — shared package lint/test on ubuntu | S (1 day) |
| Phase 2 | Turborepo setup + affected-only detection | S (1 day) |
| Phase 3 | Web build/test + Lighthouse CI | M (2 days) |
| Phase 4 | CodeQL + Dependabot security scanning | S (1 day) |
| Phase 5 | Android build/test workflow | M (2 days) |
| Phase 6 | iOS build/test workflow + Fastlane | M (2 days) |
| Phase 7 | Windows build/test workflow | M (2 days) |
| Phase 8 | E2E pipeline on merge to main | L (3 days) |
| Phase 9 | Changesets + release workflows | M (2 days) |
| Phase 10 | Fastlane + store submission automation | L (3 days) |

**Total estimated effort:** ~19 days, spread across feature development.

## References

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Changesets](https://github.com/changesets/changesets)
- [Fastlane Docs](https://docs.fastlane.tools/)
- [GitHub Actions — Using workflows](https://docs.github.com/en/actions/using-workflows)
- [OWASP CI/CD Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [ADR-0002: Cross-Platform Framework Selection](./0002-cross-platform-framework-selection.md)
