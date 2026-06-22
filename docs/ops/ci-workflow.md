# CI Workflow for Finance Monorepo

This document describes the continuous integration (CI) workflow for the Finance monorepo, including linting, build, test, type-check, artifact upload, and PR checks.

## Linting

- Runs on every PR and push to main.
- Uses `npm run ci:check` for fast validation (formatting, lint, type-check).
- Blocks PR merge if lint or formatting fails.

## Build

- All apps and packages are built using Turborepo.
- Build matrix covers all platforms (web, iOS, Android, Windows).
- Build artifacts are uploaded for PR review and release.

## Test

- Unit and integration tests run for all packages and apps.
- Coverage is reported and must meet minimum thresholds.
- E2E tests (Playwright) run for web app, tagged with `@ci`.

## Type-Check

- TypeScript type-checking runs for all TS/JS code.
- Kotlin/Swift/Java code is checked via platform-specific CI jobs.

## Artifact Upload

- Build and test artifacts are uploaded to GitHub Actions for PRs and releases.
- Artifacts include build outputs, test reports, and coverage.

## PR Checks

- All PRs require passing CI before merge.
- Conventional commit messages are enforced.
- PRs must reference issues and pass all status checks.

## Path Filtering & Required Checks

The monorepo scopes expensive platform builds to the code they affect, but **path scoping must never hide a required status check**. A check is _required_ when its context name appears in `main`'s branch protection (e.g. `ESLint & Prettier`, `Build` for web, `Build & Test` for the mobile/desktop platforms, the CodeQL analyses, `Secret Detection`, `submit-gradle`).

### Do not use trigger-level path filters on required checks

Adding `paths:`/`paths-ignore:` under `on.pull_request` (or `on.push`) means the workflow does not run when a PR misses those paths. The required context is then **never reported**, and GitHub leaves the PR stuck in a pending `BLOCKED` state that only `--admin` can override. This is a foot-gun, not an optimization.

### Use the skip-with-success detector instead

Scope the work _inside_ the workflow so the required context always reports a result:

```yaml
on:
  pull_request: # NOTE: no `paths:` here — see guardrail below
    branches: [main]
  push:
    branches: [main]

jobs:
  changes:
    name: Detect relevant changes
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      relevant: ${{ steps.filter.outputs.relevant }}
    steps:
      - uses: dorny/paths-filter@<sha> # v4.0.1, pinned
        id: filter
        if: github.event_name == 'pull_request'
        with:
          filters: |
            relevant:
              - 'apps/web/**'
              - 'packages/design-tokens/**'
              - '.github/workflows/ci-web.yml' # self-validate: editing CI re-runs the build

  build:
    name: Build # <- the required context
    needs: changes
    if: ${{ github.event_name != 'pull_request' || needs.changes.outputs.relevant == 'true' }}
    runs-on: ubuntu-latest
    steps: ...
```

Behavior:

- **PR touches relevant paths** → the real job runs and reports a genuine pass/fail.
- **PR doesn't touch them** → the real job is **skipped**, which branch protection counts as a **pass** (verified live: a required context whose only run is `skipped` reaches `CLEAN`/`MERGEABLE` with no `--admin`).
- **Push to `main`** → the `github.event_name != 'pull_request'` short-circuit makes the real job always run.

Each workflow includes **its own file** in the `relevant` filter so that editing the CI definition re-runs that platform's real build on the PR (self-validation). The `changes` job in each platform workflow carries an inline `GUARDRAIL` comment restating this rule. See `.github/instructions/workflows.instructions.md` and ADR `docs/architecture/0006-cicd-strategy.md`.

---

For more details, see the workflow YAML files in `.github/workflows/`.
