# Release Process for Finance Monorepo

This document outlines the release process for the Finance monorepo.

## Versioning

- Uses Changesets for per-package semantic versioning.
- Changelogs are generated and reviewed in PRs.

## Release Branches

- Trunk-based development; main is protected.
- Release branches are created for major/minor releases as needed.

## PR Review

- All releases require PR review, passing CI, and conventional commits.
- Manual approval is required for publishing.

## Publishing Steps

- Tag-triggered release workflow publishes packages and apps.
- Artifacts are verified before publishing.

## Rollback Procedure

- Rollback is performed by reverting the release commit and re-running the workflow.
- Database rollbacks follow migration tool best practices.

## Open Questions

- Are platform-specific publishing steps needed?
- Should release announcements be automated or manual?

---

For more, see `.github/workflows/release.yml` and the Changesets config.
