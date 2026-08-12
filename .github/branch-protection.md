# Branch Protection & Required Status Checks

## Overview

This document defines which CI checks are **required** (block merge) vs **informational** (advisory only) for the `main` branch.

## Required Status Checks (Must Pass to Merge)

These checks validate correctness **and security** and must pass before a PR can
be merged. As of the security-audit remediation (#2860, #2876, #2877), the
security checks below are **blocking** — they no longer use `continue-on-error`
and can no longer be merged past while failing.

| Check Name                                            | Workflow          | Scope                                   | Why Required                                                                                |
| ----------------------------------------------------- | ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Required Checks Gatekeeper**                        | `ci-security.yml` | **Every PR (no path filter)**           | Single always-on gate; aggregates the security jobs + re-runs lint/format/secret/PII checks |
| **ESLint & Prettier**                                 | `ci-lint.yml`     | All code changes                        | Enforces code style consistency                                                             |
| **PR Title Check**                                    | `ci-lint.yml`     | All PRs                                 | Ensures conventional commit format                                                          |
| **Observability Guardrails** (sensitive-data-logging) | `ci-lint.yml`     | `apps/**`, `packages/**`, `services/**` | Blocks logging of passwords/tokens/PII (#2876)                                              |
| **Lint & Test (KMP)**                                 | `ci-shared.yml`   | `packages/**`, `gradle/**`              | Validates shared Kotlin packages                                                            |
| **Build & Test** (Android)                            | `ci-android.yml`  | `apps/android/**`, `packages/**`        | Validates Android builds                                                                    |
| **Build & Test** (iOS)                                | `ci-ios.yml`      | `apps/ios/**`, `packages/**`            | Validates iOS builds                                                                        |
| **Build** (Web)                                       | `ci-web.yml`      | `apps/web/**`                           | Validates web builds                                                                        |
| **Unit Tests** (Web)                                  | `ci-web.yml`      | `apps/web/**`                           | Validates web unit tests                                                                    |
| **Build & Test** (Windows)                            | `ci-windows.yml`  | `apps/windows/**`, `packages/**`        | Validates Windows builds                                                                    |
| **CodeQL Analysis (javascript-typescript)**           | `ci-security.yml` | All code changes                        | SAST security scanning (blocking)                                                           |
| **CodeQL Analysis (java-kotlin)**                     | `ci-security.yml` | All code changes                        | SAST security scanning (blocking, #2860)                                                    |
| **Secret Detection** (TruffleHog)                     | `ci-security.yml` | All code changes                        | Blocks verified **and unverified** secrets (#2877)                                          |
| **Secret Scan (gitleaks)**                            | `ci-security.yml` | All code changes                        | Primary blocking secret gate, uses `.gitleaks.toml` (#2877)                                 |
| **Dependency Review**                                 | `ci-security.yml` | Dependency changes (PRs)                | Blocks high-severity supply-chain risk (#2860)                                              |
| **npm Audit**                                         | `ci-security.yml` | All code changes                        | Blocks deps at/above `high` severity (#2860)                                                |
| **Gradle Dependency Check**                           | `ci-security.yml` | `**/*.kt`, `gradle/**`                  | Blocks known-vulnerable JVM deps (#2860)                                                    |
| **detekt Analysis**                                   | `ci-android.yml`  | `**/*.kt`, `**/*.kts`                   | Kotlin static analysis                                                                      |
| **License Compliance**                                | `ci-security.yml` | Dependency changes                      | No GPL/AGPL in prod deps                                                                    |

### Recommended minimum required set

GitHub branch protection cannot conditionally require path-filtered checks (see
the caveat below). To avoid "stuck pending" checks while still hard-gating
security, require **at minimum** these **always-on** checks (they run on every
PR regardless of which files changed):

- **Required Checks Gatekeeper** — the single status check that aggregates all
  blocking security jobs and re-runs lint + format + secret-scan + sensitive-data
  logging. Requiring just this one check enforces the entire security gate.
- **ESLint & Prettier**
- **PR Title Check** (`Semantic PR Title`)

The granular security checks (CodeQL JVM+JS, Secret Detection, Secret Scan
(gitleaks), Dependency Review, npm Audit, Gradle Dependency Check) may _also_ be
required individually if you accept the path-filter caveat for the Gradle/Kotlin
ones; the Gatekeeper already enforces them transitively.

## Informational Checks (Non-Blocking)

These checks provide useful feedback but should NOT block merges:

| Check Name                           | Workflow           | Why Informational                               |
| ------------------------------------ | ------------------ | ----------------------------------------------- |
| **Audit Summary** / Security Summary | `ci-security.yml`  | Aggregation/reporting of audit results          |
| **Lighthouse Audit**                 | `ci-web.yml`       | Performance metrics are advisory                |
| **E2E Tests**                        | `ci-web.yml`       | May be flaky; sharded across runners            |
| **Housekeeping**                     | `housekeeping.yml` | Scheduled maintenance and uptime checks         |
| **Nightly**                          | `nightly.yml`      | Scheduled validation suites and security checks |

> Previously `npm Audit`, `CodeQL (java-kotlin)`, `Dependency Review`,
> `Secret Detection`, and `Gradle Dependency Check` were listed here as
> informational and ran with `continue-on-error: true`. That made the security
> gate cosmetic (#2860). They are now **blocking** and have moved to the
> Required table above.

## GitHub Branch Protection Settings

To configure these in **Settings → Branches → Branch protection rules → `main`**:

### Recommended Settings

```
✅ Require a pull request before merging
  ✅ Require approvals: 2          # raised from 1 for separation of duties (#2880)
  ✅ Dismiss stale pull request approvals when new commits are pushed
  ✅ Require review from Code Owners
  ✅ Require approval of the most recent reviewable push

✅ Require status checks to pass before merging
  ✅ Require branches to be up to date before merging
  Required status checks (always-on):
    - Required Checks Gatekeeper
    - ESLint & Prettier
    - Semantic PR Title

✅ Require conversation resolution before merging

❌ Do not require signed commits (for now)

✅ Require linear history

✅ Include administrators            # CHANGED (#2860): admins are NOT exempt
✅ Do not allow bypassing the above settings

✅ Allow force pushes: Nobody
✅ Allow deletions: No
```

### Path-Filtered Required Checks

Note: GitHub branch protection cannot conditionally require checks based on
changed files. Most workflows use `paths:` filters so they only **run** when
relevant files change. When a workflow doesn't run, its check is automatically
considered "passing" by GitHub — which previously meant security checks could be
skipped entirely on certain PRs.

The **Required Checks Gatekeeper** job in `ci-security.yml` solves this: that
workflow has **no path filter**, so the gatekeeper runs on every PR and (a)
aggregates the blocking security jobs and (b) independently re-runs lint,
format, a secret-scan backstop, and the sensitive-data-logging backstop. This
makes a single, always-present required check that fully enforces the gate.

This means:

- A web-only PR won't trigger `ci-android.yml`, and that check won't block merge
- A Kotlin-only PR won't trigger `ci-web.yml`, and that check won't block merge
- `ci-security.yml` (Gatekeeper) and `ci-lint.yml` always run and are required

### Implementation Note (updated #2860)

Security-relevant jobs **no longer** use `continue-on-error: true`. They fail the
workflow when they find issues. The only remaining `continue-on-error` is on the
non-blocking SARIF _upload_ step (so a SARIF upload permission hiccup does not
mask a real scan result) and on advisory reporting jobs.

---

## Needs Human Action

The following CANNOT be set from a file in the repo — a human with admin rights
must toggle them in the GitHub UI / API. These are required to make the
file-level changes effective.

### 1. Branch protection on `main` (Settings → Branches → `main`)

> **One-command option:** a maintainer with admin rights can apply all of the
> settings in this section by running
> [`tools/setup-branch-protection.sh`](../tools/setup-branch-protection.sh)
> (`gh` must be authenticated with admin scope). It prints a diff of the current
> vs. proposed configuration and prompts for confirmation before writing.
> It is **not** idempotent with respect to live state: the call fully replaces
> the branch's protection config, so it reverts anything applied out-of-band and
> applies this section's _entire_ pending policy (2 approvals, code-owner review,
> "Include administrators") — not just the status-check list. Read the diff, and
> note that the review/admin settings above currently conflict with the agent
> self-merge autonomy described in `AGENTS.md` Category 2. AI agents must **not**
> run it — repo-settings changes are human-gated. The manual checklist below
> mirrors what the script applies.

- [ ] **Add required status check:** `Required Checks Gatekeeper` (the single
      always-on gate). Optionally also add `ESLint & Prettier` and
      `Semantic PR Title`.
- [ ] (Optional, stricter) Add as required: `CodeQL Analysis (javascript-typescript)`,
      `CodeQL Analysis (java-kotlin)`, `Secret Detection`, `Secret Scan (gitleaks)`,
      `Dependency Review`, `npm Audit`. (Be aware of the path-filter caveat for
      Gradle/Kotlin-only checks; the Gatekeeper already enforces them.)
- [ ] **Require approvals: 2** (raised from 1) to enable separation of duties
      for the CODEOWNERS sensitive paths (#2880).
- [ ] **Enable "Require review from Code Owners".**
- [ ] **Enable "Include administrators"** (a.k.a. "Do not allow bypassing the
      above settings"). Admins must be subject to the same required checks
      (#2860).
- [ ] **Disallow force pushes and deletions** on `main`.
- [ ] **Enable "Require conversation resolution before merging".**

### 2. Remove the `--admin` self-merge override (#2860)

- [ ] Audit any automation / docs / runbooks that call `gh pr merge --admin`
      (or the REST `merge` with admin override) and **remove** it. With
      "Include administrators" enabled, `--admin` self-merge must not be used to
      bypass failing required checks. Any legitimate emergency override must be a
      logged, reviewed break-glass process — not a routine path.

### 3. CODEOWNERS second reviewer (#2880)

- [x] The invalid `@jrmoulckers-org/security-reviewers` placeholder has been
      removed from `.github/CODEOWNERS` (it was an unknown team handle that made
      the whole file fail validation). The sensitive-path rules remain as an
      explicit inventory.
- [ ] **Add a real second reviewer** to those paths: create a GitHub team (org
      repos) or add a second collaborator handle (personal repos cannot reference
      `@org/team`), grant it write access, and list it alongside `@jrmoulckers`
      on each sensitive-path rule.
- [ ] Combined with **Require approvals: 2** + **Require review from Code
      Owners**, this gives true separation of duties.

### 4. GitHub Advanced Security (GHAS) features

- [ ] Enable **Secret scanning** + **Push protection** (Settings → Code security
      and analysis). The repo `.github/secret_scanning.yml` only tunes paths; the
      feature itself must be turned on.
- [ ] Enable **CodeQL default/advanced setup** and **Dependency review** (these
      require GHAS for private repos).
- [ ] (Org) Provide a `GITLEAKS_LICENSE` Actions secret if this repo lives under
      a GitHub **Organization** (required by `gitleaks-action` for orgs; not
      needed for personal repos).

### 5. Pinned `gitleaks-action` SHA — VERIFIED ✅

- [x] Verified 2026-06-21. The `gitleaks` job now pins
      `gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c7`, the
      commit tagged **v2.3.9**. The previous pin (`44c470ff…`) was an _untagged_
      merge commit and has been corrected. The `actions/checkout` (v6.0.3),
      `actions/setup-node` (v6.4.0), and `actions/upload-artifact` (v7.0.1) pins
      in the AI workflows were also confirmed to match their tags.
