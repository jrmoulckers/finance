# Branch Protection & Required Status Checks

## Overview

This document defines which CI checks are **required** (block merge) vs **informational** (advisory only) for the `main` branch.

## Required Status Checks (Must Pass to Merge)

These checks validate correctness and must pass before a PR can be merged:

| Check Name                                  | Workflow          | Scope                            | Why Required                       |
| ------------------------------------------- | ----------------- | -------------------------------- | ---------------------------------- |
| **ESLint & Prettier**                       | `ci-lint.yml`     | All code changes                 | Enforces code style consistency    |
| **PR Title Check**                          | `ci-lint.yml`     | All PRs                          | Ensures conventional commit format |
| **Lint & Test (KMP)**                       | `ci-shared.yml`   | `packages/**`, `gradle/**`       | Validates shared Kotlin packages   |
| **Build & Test** (Android)                  | `ci-android.yml`  | `apps/android/**`, `packages/**` | Validates Android builds           |
| **Build & Test** (iOS)                      | `ci-ios.yml`      | `apps/ios/**`, `packages/**`     | Validates iOS builds               |
| **Build** (Web)                             | `ci-web.yml`      | `apps/web/**`                    | Validates web builds               |
| **Unit Tests** (Web)                        | `ci-web.yml`      | `apps/web/**`                    | Validates web unit tests           |
| **Build & Test** (Windows)                  | `ci-windows.yml`  | `apps/windows/**`, `packages/**` | Validates Windows builds           |
| **CodeQL Analysis (javascript-typescript)** | `ci-security.yml` | All code changes                 | SAST security scanning             |
| **detekt Analysis**                         | `ci-android.yml`  | `**/*.kt`, `**/*.kts`            | Kotlin static analysis             |
| **License Compliance**                      | `ci-security.yml` | Dependency changes               | No GPL/AGPL in prod deps           |

## Informational Checks (Non-Blocking)

These checks provide useful feedback but should NOT block merges:

| Check Name                        | Workflow           | Why Informational                                |
| --------------------------------- | ------------------ | ------------------------------------------------ |
| **npm Audit**                     | `ci-security.yml`  | Transitive dep vulns often can't be fixed in PRs |
| **Audit Summary**                 | `ci-security.yml`  | Aggregation of audit results                     |
| **Gradle Dependency Check**       | `ci-security.yml`  | OWASP NVD may be unavailable                     |
| **Lighthouse Audit**              | `ci-web.yml`       | Performance metrics are advisory                 |
| **E2E Tests**                     | `ci-web.yml`       | May be flaky; sharded across runners             |
| **CodeQL Analysis (java-kotlin)** | `ci-security.yml`  | May fail without full toolchain                  |
| **Dependency Review**             | `ci-security.yml`  | Requires GitHub Advanced Security                |
| **Secret Detection**              | `ci-security.yml`  | Advisory; may have false positives               |
| **Housekeeping**                  | `housekeeping.yml` | Scheduled maintenance and uptime checks          |
| **Nightly**                       | `nightly.yml`      | Scheduled validation suites and security checks  |

## GitHub Branch Protection Settings

To configure these in **Settings → Branches → Branch protection rules → `main`**:

### Recommended Settings

```
✅ Require a pull request before merging
  ✅ Require approvals: 1
  ✅ Dismiss stale pull request approvals when new commits are pushed
  ✅ Require review from Code Owners

✅ Require status checks to pass before merging
  ✅ Require branches to be up to date before merging
  Required status checks:
    - ESLint & Prettier
    - check (PR Title Check)

✅ Require conversation resolution before merging

❌ Do not require signed commits (for now)

✅ Require linear history

❌ Do not include administrators in restrictions

✅ Allow force pushes: Nobody
✅ Allow deletions: No
```

### Path-Filtered Required Checks

Note: GitHub branch protection cannot conditionally require checks based on changed files. The workflows use `paths:` filters so they only **run** when relevant files change. When a workflow doesn't run, its check is automatically considered "passing" by GitHub.

This means:

- A web-only PR won't trigger `ci-android.yml`, and that check won't block merge
- A Kotlin-only PR won't trigger `ci-web.yml`, and that check won't block merge
- `ci-lint.yml` and `ci-lint.yml` run on all PRs and are always required

### Implementation Note

The informational workflows use `continue-on-error: true` at the job level so they always report as "passing" to branch protection, while still showing the actual result in the workflow run details.
