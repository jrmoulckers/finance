# Release Process

This document describes how Finance releases are versioned, built, and distributed to users across all four platforms. It covers the Changesets workflow, per-platform release pipelines, hotfix procedures, and rollback strategies.

## Table of Contents

- [Overview](#overview)
- [How Changesets Work](#how-changesets-work)
- [Versioning Strategy](#versioning-strategy)
- [Per-Platform Release Pipelines](#per-platform-release-pipelines)
- [Hotfix Process](#hotfix-process)
- [Rollback Procedures](#rollback-procedures)
- [Pre-Release Checklist](#pre-release-checklist)
- [Post-Release Verification](#post-release-verification)

---

## Overview

Finance follows a **"ship when ready"** release model. Each platform releases independently — there are no release trains. An Android update can ship on Monday, an iOS update on Wednesday, and a web deploy on Friday. This is made possible by per-platform versioning with [Changesets](https://github.com/changesets/changesets) and platform-specific release workflows in GitHub Actions.

```
Developer adds changeset
        │
        ▼
PR merged to main
        │
        ▼
Changesets bot opens "Version Packages" PR
        │
        ▼
Human merges version PR
        │
        ▼
Versions bumped, CHANGELOGs updated
        │
        ▼
Platform-prefixed tag pushed (e.g., ios/v1.3.0)
        │
        ▼
Release workflow triggered → build → sign → distribute
```

---

## How Changesets Work

[Changesets](https://github.com/changesets/changesets) manages independent versioning for each package and app in the monorepo. The workflow has three steps: **add**, **version**, and **publish**.

### Step 1: Add a Changeset

When you make a change that affects users, add a changeset before (or as part of) your PR:

```bash
npx changeset
```

The CLI prompts you to:

1. **Select the affected packages** — choose which apps or packages your change touches (e.g., `apps/android`, `packages/core`).
2. **Choose the semver bump type** — `patch` (bug fix), `minor` (new feature), or `major` (breaking change).
3. **Write a summary** — a human-readable description of the change that will appear in the changelog.

This creates a Markdown file in the `.changeset/` directory (e.g., `.changeset/friendly-kangaroo.md`):

```markdown
---
'@finance/android': minor
'@finance/core': patch
---

Add monthly budget rollover feature. Unspent amounts now carry forward
to the next month automatically.
```

Commit this file with your PR. The CI pipeline checks that relevant PRs include a changeset.

### Step 2: Version Packages

When PRs with changesets are merged to `main`, the Changesets GitHub Action automatically opens (or updates) a **"Version Packages"** PR. This PR:

- Bumps version numbers in each affected `package.json`, `build.gradle.kts`, `Info.plist`, or equivalent.
- Updates `CHANGELOG.md` files with all accumulated changeset summaries.
- Removes the consumed `.changeset/*.md` files.

A human reviews and merges this PR when ready to release.

### Step 3: Publish / Tag

After the version PR is merged, a CI workflow:

1. Detects the version bumps.
2. Pushes platform-prefixed Git tags (e.g., `ios/v1.3.0`, `android/v1.3.0`).
3. Each tag triggers the corresponding platform release workflow.

> **Important:** Only the tagging and release pipeline are automated. A human must merge the version PR to initiate a release. This is an intentional gate — no release happens without human approval.

---

## Versioning Strategy

Finance uses **semantic versioning (semver)** with **independent versions per platform and package**. This means `apps/ios` can be at version `1.3.0` while `apps/android` is at `1.2.1` and `packages/core` is at `2.0.0`.

### Version Format by Platform

| Component      | Version Format                              | Where Stored                       | Example              |
| -------------- | ------------------------------------------- | ---------------------------------- | -------------------- |
| `packages/*`   | npm semver                                  | `package.json` → `version`         | `1.2.3`              |
| `apps/ios`     | `CFBundleShortVersionString` + build number | `Info.plist`                       | `1.3.0` (build 42)   |
| `apps/android` | `versionName` + `versionCode`               | `build.gradle.kts`                 | `1.3.0` (code 10300) |
| `apps/web`     | npm semver                                  | `package.json` → `version`         | `2.1.0`              |
| `apps/windows` | MSIX four-part version                      | `.csproj` / `Package.appxmanifest` | `1.3.0.0`            |

### Semver Rules

| Change Type                            | Bump    | Example           |
| -------------------------------------- | ------- | ----------------- |
| Bug fix, performance improvement, docs | `patch` | `1.2.3` → `1.2.4` |
| New feature, non-breaking API addition | `minor` | `1.2.3` → `1.3.0` |
| Breaking change, major redesign        | `major` | `1.2.3` → `2.0.0` |

### Build Numbers

Mobile platforms (iOS, Android) require monotonically increasing build numbers in addition to the display version:

- **iOS:** The build number (`CFBundleVersion`) is auto-incremented by the CI pipeline on each release build.
- **Android:** The `versionCode` is computed from the version name (e.g., `1.3.0` → `10300`) to keep it deterministic and monotonically increasing.

---

## Per-Platform Release Pipelines

Each platform has a dedicated GitHub Actions workflow triggered by a platform-prefixed tag. All workflows are defined in `.github/workflows/`.

### Android — Fastlane → Google Play Store

**Tag trigger:** `android/v*` (e.g., `android/v1.3.0`)
**Workflow:** `release-android.yml`
**Runner:** `ubuntu-latest`

```
Tag pushed
  │
  ▼
Checkout code + set up JDK 21
  │
  ▼
Gradle assembleRelease (signed APK/AAB)
  │
  ▼
Fastlane `supply` → upload to Play Store internal track
  │
  ▼
Manual promotion: internal → beta → production
```

**Key details:**

- The release build is signed using a keystore stored as a GitHub Actions secret (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
- Fastlane's `supply` action uploads the Android App Bundle (AAB) to the Google Play Console's **internal testing** track.
- Promotion from internal → beta → production is done manually in the Play Console, allowing for staged rollouts (e.g., 10% → 50% → 100%).

### iOS — Fastlane → TestFlight → App Store

**Tag trigger:** `ios/v*` (e.g., `ios/v1.3.0`)
**Workflow:** `release-ios.yml`
**Runner:** `macos-14` (Apple Silicon)

```
Tag pushed
  │
  ▼
Checkout code + set up Xcode
  │
  ▼
CocoaPods install (cached)
  │
  ▼
Fastlane Match → download signing certificates & profiles
  │
  ▼
Fastlane `build_app` → archive .ipa
  │
  ▼
Fastlane `pilot` → upload to TestFlight
  │
  ▼
Manual promotion: TestFlight → App Store (via App Store Connect)
```

**Key details:**

- **Fastlane Match** manages code signing certificates and provisioning profiles via an encrypted private Git repository. This eliminates "signing certificate expired" issues in CI.
- The build is uploaded to **TestFlight** automatically, making it available to beta testers within minutes.
- Promotion to the App Store requires manual submission through App Store Connect, including compliance answers and release notes.
- The `macos-14` runner uses Apple Silicon, which is approximately 2× faster than x86 runners for Xcode builds.

### Web — Vercel

**Tag trigger:** `web/v*` (e.g., `web/v2.1.0`)
**Workflow:** `release-web.yml`
**Runner:** `ubuntu-latest`

```
Tag pushed
  │
  ▼
Checkout code + set up Node.js 22
  │
  ▼
npm ci → Turborepo build (apps/web + dependencies)
  │
  ▼
Deploy to Vercel staging (preview URL)
  │
  ▼
Manual promotion: staging → production (or auto-deploy if configured)
```

**Key details:**

- Every push to `main` already generates a Vercel preview deployment. The tag-triggered release promotes a specific build to production.
- The web app is a Progressive Web App (PWA) and works offline after initial load.
- Lighthouse CI runs as part of the build to catch performance or accessibility regressions before the deploy reaches production.

### Windows — MSIX → Microsoft Store

**Tag trigger:** `windows/v*` (e.g., `windows/v1.3.0`)
**Workflow:** `release-windows.yml`
**Runner:** `windows-latest`

```
Tag pushed
  │
  ▼
Checkout code + set up .NET 9 / JDK 21
  │
  ▼
dotnet publish → build MSIX package (signed)
  │
  ▼
Submit via MS Store Submission API → flight ring
  │
  ▼
Manual promotion: flight ring → production
```

**Key details:**

- The MSIX package is signed with a code signing certificate stored as a GitHub Actions secret.
- The Microsoft Store Submission API uploads the package to a **flight ring** (internal testing group).
- Promotion to the public store listing is done manually through Partner Center.
- MSIX version must be four-part (e.g., `1.3.0.0`) — the fourth segment is always `0` (reserved by the Store).

---

## Hotfix Process

A hotfix addresses a critical bug in a released version — for example, a crash on launch or a data corruption issue. Hotfixes bypass the normal changeset flow to ship faster.

### When to Hotfix

Use the hotfix process when:

- A released version has a **crash**, **data loss**, or **security vulnerability**.
- The fix is small and isolated (not a feature change).
- Waiting for the next regular release is unacceptable.

### Hotfix Steps

1. **Create a hotfix branch** from the release tag:

   ```bash
   git checkout -b hotfix/android-v1.3.1 android/v1.3.0
   ```

2. **Apply the fix** — make the minimal code change needed to resolve the issue. Include a test that reproduces the bug.

3. **Bump the patch version** manually (e.g., `1.3.0` → `1.3.1`) in the platform's version file.

4. **Open a PR** targeting `main`. Reference the issue (e.g., `Fixes #123`). Label with `hotfix` and the platform label.

5. **Expedited review** — hotfix PRs require at least one reviewer, but skip the normal Changesets flow. The version bump is manual.

6. **Merge and tag** — after review, merge to `main` and push the platform tag:

   ```bash
   git tag android/v1.3.1
   git push origin android/v1.3.1
   ```

7. **Release pipeline runs** — the platform release workflow picks up the tag and deploys through the normal pipeline (but promotion to production can be expedited).

8. **Cherry-pick if needed** — if `main` has diverged significantly, cherry-pick the fix onto `main` after the hotfix ships.

---

## Rollback Procedures

If a released version introduces a regression that wasn't caught in testing, you may need to roll back.

> **📖 For detailed, step-by-step rollback instructions** — including database migration rollback and PowerSync conflict handling — see the dedicated [Rollback Procedures Guide](rollback-procedures.md).

### Web Rollback

Web rollbacks are the simplest because Vercel keeps previous deployments:

1. Open the Vercel dashboard.
2. Find the previous production deployment.
3. Click **Promote to Production**.
4. The previous version is live within seconds.

Alternatively, revert the commit on `main` and let the CI auto-deploy.

### Android Rollback

Google Play supports staged rollouts, which limit blast radius:

1. **If in staged rollout** (e.g., 10% of users) — go to the Play Console, halt the rollout, and resume with the previous version.
2. **If fully rolled out** — upload the previous AAB as a new release with an incremented `versionCode`. Google Play does not support "reverting" — you must publish a new version.
3. **Emergency:** Use Play Console's **Managed Publishing** to unpublish the update while preparing the fix.

### iOS Rollback

Apple does not support rollbacks in the App Store:

1. **If in TestFlight only** — remove the build from TestFlight in App Store Connect. Testers revert to the previous build automatically.
2. **If live in App Store** — submit a new version with the fix using the hotfix process. Use **Expedited Review** (available in App Store Connect) to request faster review from Apple.
3. **Users who updated** cannot downgrade. The new fix version must ship as quickly as possible.

> **Prevention is the best rollback strategy for iOS.** Always use TestFlight with a meaningful beta testing period before promoting to the App Store.

### Windows Rollback

1. **If in flight ring only** — remove the package from the flight ring in Partner Center.
2. **If live in Microsoft Store** — submit a new MSIX package with the fix. The Store processes updates within 24–48 hours.
3. For faster mitigation, use the **gradual rollout** feature in Partner Center to limit exposure.

---

## Pre-Release Checklist

Before triggering any platform release, every item below must be verified. A single unchecked item blocks the release unless the project lead grants a documented exception.

### CI & Code Quality

- [ ] All CI checks pass on `main` (lint, test, build, type-check)
- [ ] Changeset version PR has been merged
- [ ] `CHANGELOG.md` accurately describes user-facing changes
- [ ] No `FIXME` or `TODO` items in the code being released
- [ ] Version number confirmed — follows [semver rules](#semver-rules) and matches the platform format in [Version Format by Platform](#version-format-by-platform)

### Security

- [ ] Security audit critical items resolved — no FAIL items in the [OWASP MASVS L1 Security Checklist](../audits/security-checklist.md)
- [ ] CodeQL scan passing — no high or critical findings ([`security.yml`](../../.github/workflows/security.yml))
- [ ] Dependency audit clean — no critical or high CVEs in production dependencies (Dependabot / `dependency-review.yml`)
- [ ] Secret scanning — no alerts in GitHub Advanced Security push protection
- [ ] Security checklist reviewed for any auth/data changes

### Privacy

- [ ] Privacy audit critical items addressed — data practices verified per [Privacy & Compliance checklist](launch-checklist.md#privacy--compliance)
- [ ] No PII, financial data, or credentials in logs, crash reports, or telemetry
- [ ] Sentry `beforeSend` scrubbing rules verified (see [monitoring architecture](../architecture/monitoring.md#52-scrubbing-implementation))
- [ ] Data collection inventory up to date — every metric collected is documented with purpose and legal basis

### Monitoring & Alerting

- [ ] Error tracking configured for the releasing platform (Sentry integration, consent-gated)
- [ ] Sync health monitoring operational — `SyncHealthMonitor` thresholds reviewed (see [monitoring strategy](monitoring.md#sync-health-monitoring))
- [ ] Alerting rules configured — team is notified when error rates or latency exceed thresholds (see [alert thresholds](monitoring.md#alert-thresholds-and-escalation))
- [ ] Uptime monitoring active for API and web endpoints
- [ ] Operational and client health dashboards accessible (see [monitoring architecture § dashboards](../architecture/monitoring.md#7-dashboards))

### Performance

- [ ] Performance baselines measured — cold start, scroll FPS, SQLite aggregation, memory usage (see [performance guide](performance.md))
- [ ] Performance benchmarks show no regressions vs. previous release
- [ ] Lighthouse CI passing for web releases (see [`web-ci.yml`](../../.github/workflows/web-ci.yml))
- [ ] Bundle size within budget (no unexpected increases)

### Testing & Beta

- [ ] Beta testing completed with feedback addressed:
  - iOS: TestFlight beta with ≥ 10 testers, ≥ 2-week testing period
  - Android: Internal/closed track with ≥ 10 testers, ≥ 2-week testing period
  - Web: Preview deployment shared with testers, feedback collected
  - Windows: Flight ring with testers, feedback collected
- [ ] Critical user flows validated by beta testers (onboarding, transactions, budgets, sync, export)
- [ ] Bug reports from beta triaged — all critical and high-severity bugs resolved
- [ ] Accessibility audit passes for any UI changes (see [accessibility checklist](../audits/accessibility-checklist.md))

### Release Artifacts

- [ ] Release notes drafted for the app store listing (plain language, user-facing)
- [ ] App store metadata updated (screenshots, descriptions) if UI changed
- [ ] Team notified in the release channel

---

## Post-Release Verification

After a release reaches users, verify that everything is working as expected. Do not promote from internal/beta to production until these checks pass.

### Smoke Test Checklist

Run these critical user flows on the released build within 1 hour of deployment:

| # | Test | iOS | Android | Web | Windows |
|---|------|-----|---------|-----|---------|
| 1 | App launches without crash | ☐ | ☐ | ☐ | ☐ |
| 2 | User can sign in (existing account) | ☐ | ☐ | ☐ | ☐ |
| 3 | User can create a new account | ☐ | ☐ | ☐ | ☐ |
| 4 | Sync completes successfully (online) | ☐ | ☐ | ☐ | ☐ |
| 5 | Add a transaction (< 10 s quick-entry) | ☐ | ☐ | ☐ | ☐ |
| 6 | View budget overview | ☐ | ☐ | ☐ | ☐ |
| 7 | View reports / charts | ☐ | ☐ | ☐ | ☐ |
| 8 | Offline mode — make changes while offline | ☐ | ☐ | ☐ | ☐ |
| 9 | Reconnect — offline changes sync correctly | ☐ | ☐ | ☐ | ☐ |
| 10 | Export data (CSV / JSON) | ☐ | ☐ | ☐ | ☐ |
| 11 | Screen reader announces key elements | ☐ | ☐ | ☐ | ☐ |
| 12 | Settings / preferences load correctly | ☐ | ☐ | ☐ | ☐ |

### Monitoring Dashboard Checks

Within the first 30 minutes after users start receiving the update:

- [ ] **Crash-free session rate** — verify ≥ 99.5% (check Sentry → Releases → new version)
- [ ] **Error rate** — no spike compared to the previous version baseline
- [ ] **Sync success rate** — remains above 95% (`sync_health_logs` aggregate)
- [ ] **Sync latency P95** — remains below 5 s threshold
- [ ] **API response time P95** — remains below 1 s
- [ ] **Auth failure rate** — remains below 1%
- [ ] **PowerSync queue depth** — no unexpected growth (< 1000 pending)
- [ ] **Uptime monitors** — all green (API, web, PowerSync endpoints)

### Error Rate Baseline Comparison

Compare the new release's error metrics against the previous version during the same time window (first 24 hours):

| Metric | Previous Release Baseline | New Release (24 h) | Status |
|--------|---------------------------|---------------------|--------|
| Crash-free sessions | __%% | __%% | ☐ |
| Unhandled exceptions / 1k sessions | __ | __ | ☐ |
| Sync failure rate | __%% | __%% | ☐ |
| API 5xx error rate | __%% | __%% | ☐ |
| Client `Unhealthy` sync status count | __ | __ | ☐ |

**Action thresholds:**

- **≤ 10% regression** — monitor for 24 more hours, no action needed.
- **10–25% regression** — investigate root cause, consider halting staged rollout.
- **> 25% regression or new P0/P1 errors** — halt rollout immediately, begin [rollback procedures](rollback-procedures.md).

### Staged Rollout Progression

For mobile platforms, follow this promotion schedule (adjust based on monitoring):

| Stage | Audience | Duration | Gate |
|-------|----------|----------|------|
| Internal testing | Team only | 1–2 days | Smoke tests pass |
| Beta / TestFlight | Beta testers | 3–7 days | No critical bugs reported |
| Staged rollout 10% | 10% of production users | 2–3 days | Error rates within baseline |
| Staged rollout 50% | 50% of production users | 1–2 days | Error rates within baseline |
| Full rollout 100% | All users | — | No regressions detected |

> **Never skip the staged rollout for mobile releases.** The blast radius of a broken mobile update is much larger than web because users cannot be instantly rolled back.

---

## References

- [Rollback Procedures](rollback-procedures.md) — Detailed rollback instructions for every platform, database, and sync
- [ADR-0006: CI/CD Strategy](../architecture/0006-cicd-strategy.md) — Architectural decisions for the CI/CD pipeline
- [Monitoring Architecture](../architecture/monitoring.md) — Error tracking, sync health, dashboards, and alerting
- [Monitoring Strategy](monitoring.md) — Privacy-respecting observability setup
- [Changesets documentation](https://github.com/changesets/changesets) — Upstream docs for the versioning tool
- [Fastlane documentation](https://docs.fastlane.tools/) — Mobile build and release automation
- [Performance Guide](performance.md) — Performance targets and benchmarking
- [Security Checklist](../audits/security-checklist.md) — OWASP MASVS L1 audit items
- [Accessibility Checklist](../audits/accessibility-checklist.md) — WCAG 2.2 AA audit items
- [Launch Checklist](launch-checklist.md) — Complete pre-launch verification
