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

---

For more details, see the workflow YAML files in `.github/workflows/`.
