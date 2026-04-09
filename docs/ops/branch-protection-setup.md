# Branch Protection Setup for `main`

This document provides exact GitHub settings to configure branch protection rules
for the `main` branch in the `jrmoulckers/finance` repository.

> **⚠️ Human action required.** These rules must be applied by a repository
> administrator through **GitHub → Settings → Branches → Branch protection rules**.
> AI agents are not permitted to modify repository settings.

---

## Table of Contents

- [Quick Reference](#quick-reference)
- [Step-by-Step Setup (GitHub UI)](#step-by-step-setup-github-ui)
- [Step-by-Step Setup (GitHub CLI)](#step-by-step-setup-github-cli)
- [Required Status Checks](#required-status-checks)
- [Ruleset Alternative (GitHub Rulesets)](#ruleset-alternative-github-rulesets)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Quick Reference

| Setting                                                          | Value  |
| ---------------------------------------------------------------- | ------ |
| **Branch name pattern**                                          | `main` |
| Require a pull request before merging                            | ✅     |
| Required number of approvals                                     | `1`    |
| Dismiss stale pull request approvals when new commits are pushed | ✅     |
| Require review from Code Owners                                  | ✅     |
| Require status checks to pass before merging                     | ✅     |
| Require branches to be up to date before merging                 | ✅     |
| Require linear history                                           | ✅     |
| Require signed commits                                           | ✅     |
| Include administrators                                           | ✅     |
| Allow force pushes                                               | ❌     |
| Allow deletions                                                  | ❌     |
| Lock branch                                                      | ❌     |

---

## Step-by-Step Setup (GitHub UI)

### 1. Navigate to branch protection

1. Go to **https://github.com/jrmoulckers/finance/settings/branches**
2. Click **Add branch protection rule** (or edit the existing `main` rule)
3. Set **Branch name pattern** to: `main`

### 2. Protect matching branches

Check the following boxes:

#### Require a pull request before merging

- ✅ **Require a pull request before merging**
  - Required number of approvals before merging: **1**
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners
  - ☐ Restrict who can dismiss pull request reviews _(leave unchecked unless needed)_
  - ☐ Allow specified actors to bypass required pull requests _(leave unchecked)_

#### Require status checks to pass before merging

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - Add the following status checks (search by name in the text box):

    **Always-required checks (run on every PR):**

    | Status check name                                             |
    | ------------------------------------------------------------- |
    | `Lint & Format / ESLint & Prettier`                           |
    | `PR Title Check / check`                                      |
    | `Security Scanning / CodeQL Analysis (java-kotlin)`           |
    | `Security Scanning / CodeQL Analysis (javascript-typescript)` |
    | `Security Scanning / Dependency Review`                       |
    | `Security Scanning / Secret Detection`                        |

    **Path-filtered checks (run only when relevant files change):**

    > GitHub automatically passes skipped path-filtered checks, so adding them
    > as required will not block unrelated PRs. However, if you encounter
    > issues with path-filtered checks blocking PRs, remove them from the
    > required list and rely on their path triggers instead.

    | Status check name                          | Trigger paths                                           |
    | ------------------------------------------ | ------------------------------------------------------- |
    | `CI — Shared Packages / Lint & Test (KMP)` | `packages/`, `build-logic/`, `gradle/`, `*.gradle.kts`  |
    | `Android CI / Build & Test`                | `apps/android/`, `packages/`, `build-logic/`, `gradle/` |
    | `iOS CI / Build & Test`                    | `apps/ios/`, `packages/`                                |
    | `Web CI / Build`                           | `apps/web/`, `packages/design-tokens/`                  |
    | `Web CI / Unit Tests`                      | `apps/web/`, `packages/design-tokens/`                  |
    | `Windows CI / Build & Test`                | `apps/windows/`, `packages/`                            |

#### Other protections

- ✅ **Require linear history** — prevents merge commits; allows squash or rebase only
- ✅ **Require signed commits** — all commits must be GPG/SSH signed
- ✅ **Include administrators** — admins cannot bypass these rules
- ❌ **Allow force pushes** — must remain disabled
- ❌ **Allow deletions** — must remain disabled
- ❌ **Lock branch** — leave unlocked (PRs need to merge)

### 3. Save

Click **Create** (or **Save changes** if editing).

---

## Step-by-Step Setup (GitHub CLI)

If you prefer the CLI, use the `gh api` command below. This uses the
[branch protection API](https://docs.github.com/en/rest/branches/branch-protection).

> **Prerequisites:** `gh` CLI authenticated with admin access to `jrmoulckers/finance`.

```bash
gh api \
  --method PUT \
  /repos/jrmoulckers/finance/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint & Format / ESLint & Prettier",
      "PR Title Check / check",
      "Security Scanning / CodeQL Analysis (java-kotlin)",
      "Security Scanning / CodeQL Analysis (javascript-typescript)",
      "Security Scanning / Dependency Review",
      "Security Scanning / Secret Detection"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "required_linear_history": true,
  "required_signatures": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

> **Note:** The API call above sets only the always-required status checks.
> Path-filtered checks are enforced by the workflows themselves and will
> automatically gate merges when their trigger paths are modified. If you want
> to add them as required, append them to the `contexts` array:
>
> ```json
> "CI — Shared Packages / Lint & Test (KMP)",
> "Android CI / Build & Test",
> "iOS CI / Build & Test",
> "Web CI / Build",
> "Web CI / Unit Tests",
> "Windows CI / Build & Test"
> ```

---

## Required Status Checks

### How GitHub resolves check names

GitHub status checks appear as **`<workflow name> / <job name>`**. The names below
are derived from the `name:` fields in each workflow YAML file.

### Complete check inventory

| Workflow file     | Workflow name        | Job key              | Job display name (= check name suffix)  | PR trigger                             |
| ----------------- | -------------------- | -------------------- | --------------------------------------- | -------------------------------------- |
| `lint-format.yml` | Lint & Format        | `eslint-prettier`    | ESLint & Prettier                       | All PRs to `main`                      |
| `pr-title.yml`    | PR Title Check       | `check`              | check                                   | All PRs to `main`                      |
| `ci.yml`          | CI — Shared Packages | `lint-and-test`      | Lint & Test (KMP)                       | `packages/`, `build-logic/`, `gradle/` |
| `android-ci.yml`  | Android CI           | `build-and-test`     | Build & Test                            | `apps/android/`, `packages/`           |
| `ios-ci.yml`      | iOS CI               | `build`              | Build & Test                            | `apps/ios/`, `packages/`               |
| `web-ci.yml`      | Web CI               | `build`              | Build                                   | `apps/web/`, `packages/design-tokens/` |
| `web-ci.yml`      | Web CI               | `unit-tests`         | Unit Tests                              | `apps/web/`, `packages/design-tokens/` |
| `web-ci.yml`      | Web CI               | `e2e-tests`          | E2E Tests (shard N)                     | `apps/web/`, `packages/design-tokens/` |
| `web-ci.yml`      | Web CI               | `lighthouse`         | Lighthouse Audit                        | `apps/web/`, `packages/design-tokens/` |
| `windows-ci.yml`  | Windows CI           | `build`              | Build & Test                            | `apps/windows/`, `packages/`           |
| `security.yml`    | Security Scanning    | `codeql-java-kotlin` | CodeQL Analysis (java-kotlin)           | All PRs to `main`                      |
| `security.yml`    | Security Scanning    | `codeql-javascript`  | CodeQL Analysis (javascript-typescript) | All PRs to `main`                      |
| `security.yml`    | Security Scanning    | `dependency-review`  | Dependency Review                       | All PRs to `main`                      |
| `security.yml`    | Security Scanning    | `secret-scanning`    | Secret Detection                        | All PRs to `main`                      |

### Checks NOT required (and why)

| Workflow                  | Why not required                                |
| ------------------------- | ----------------------------------------------- |
| `changesets.yml`          | Runs on push to `main` only, not on PRs         |
| `release.yml`             | Triggered by tags, not PRs                      |
| `pen-test.yml`            | Runs on push to `main` and manual dispatch only |
| `stale-detection.yml`     | Scheduled job, not PR-related                   |
| `auto-add-to-project.yml` | Project board automation, not a quality gate    |
| `copilot-setup-steps.yml` | Tooling setup, not a quality gate               |

---

## Ruleset Alternative (GitHub Rulesets)

GitHub now offers **Repository Rulesets** as a more flexible alternative to
classic branch protection. If you prefer rulesets:

1. Go to **Settings → Rules → Rulesets → New ruleset → New branch ruleset**
2. Name: `Main branch protection`
3. Enforcement status: **Active**
4. Target branches: **Add target → Include by pattern → `main`**
5. Add rules:
   - ✅ Restrict deletions
   - ✅ Require linear history
   - ✅ Require signed commits
   - ✅ Require a pull request before merging
     - Required approvals: `1`
     - Dismiss stale reviews on push: ✅
     - Require review from Code Owners: ✅
   - ✅ Require status checks to pass
     - Add each check from the [required status checks table](#complete-check-inventory)
   - ✅ Block force pushes

Rulesets offer advantages over classic branch protection:

- Multiple rulesets can target the same branch
- Rulesets can be applied at the organisation level
- More granular bypass permissions
- Better audit logging

---

## Verification

After applying the rules, verify them:

### Via GitHub UI

1. Navigate to **Settings → Branches** and confirm the rule is listed
2. Open a test PR and verify:
   - The "Merge" button is disabled until checks pass
   - At least one review is required
   - Force push to `main` is rejected

### Via GitHub CLI

```bash
# View current branch protection
gh api /repos/jrmoulckers/finance/branches/main/protection --jq '{
  required_status_checks: .required_status_checks.contexts,
  required_reviews: .required_pull_request_reviews.required_approving_review_count,
  enforce_admins: .enforce_admins.enabled,
  linear_history: .required_linear_history.enabled,
  allow_force_pushes: .allow_force_pushes.enabled,
  allow_deletions: .allow_deletions.enabled
}'
```

Expected output:

```json
{
  "required_status_checks": [
    "Lint & Format / ESLint & Prettier",
    "PR Title Check / check",
    "Security Scanning / CodeQL Analysis (java-kotlin)",
    "Security Scanning / CodeQL Analysis (javascript-typescript)",
    "Security Scanning / Dependency Review",
    "Security Scanning / Secret Detection"
  ],
  "required_reviews": 1,
  "enforce_admins": true,
  "linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

### Via force-push test (expected failure)

```bash
# This should be rejected by branch protection
git push --force origin main
# Expected: remote: error: GH006: Protected branch update failed
```

---

## Troubleshooting

### Path-filtered checks block unrelated PRs

If a path-filtered check (e.g., `Android CI / Build & Test`) is listed as
required but doesn't run for a docs-only PR, GitHub may show it as "Expected —
Waiting for status to be reported."

**Fix:** Remove path-filtered checks from the required list and rely on their
workflow path triggers to enforce them. They will still run and block the merge
button when relevant files are changed.

### Status check name not found

If a check name doesn't appear in the search dropdown:

1. The workflow must have run at least once on the repository for the check to
   appear in the dropdown.
2. Verify the name matches exactly — check names are case-sensitive and use the
   format `Workflow Name / Job Display Name`.
3. Push a test commit to a branch to trigger the workflows, then try again.

### "Require signed commits" blocks contributors

Contributors need GPG or SSH signing configured:

```bash
# Configure Git to sign commits with SSH key
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

See [GitHub docs on commit signing](https://docs.github.com/en/authentication/managing-commit-signature-verification).

---

## References

- [GitHub: Managing a branch protection rule](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-a-branch-protection-rule)
- [GitHub: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/about-protected-branches)
- [GitHub REST API: Branch protection](https://docs.github.com/en/rest/branches/branch-protection)
- [GitHub: Repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contributor guide with branch protection summary
