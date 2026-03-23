# Branch Protection — main

## Required Status Checks

All PRs to `main` must pass:

- Lint & Format (ESLint + Prettier)
- PR Title Check (conventional commits)
- Security Scanning (CodeQL JS/TS, dependency review, secret detection)
- Security Scanning (CodeQL Java/Kotlin) — when Kotlin/Java files changed
- CI — Shared Packages (KMP build + JVM tests) — when KMP files changed
- Web CI (build + test) — when web files changed
- Android CI (build + lint) — when Android files changed
- iOS CI (build + test) — when iOS files changed

## Rules

- Require 1 approving review before merge
- Dismiss stale reviews when new commits pushed
- Require branches to be up to date before merging
- No force pushes to main
- No deletions of main

## Enforcement

These rules are configured in GitHub repository settings.
To modify: Settings → Branches → Branch protection rules → main
