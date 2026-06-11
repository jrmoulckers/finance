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

## Platform-Specific Release Workflows

Each platform has a dedicated release workflow following the pattern:
**Build → Sign → Test → Artifact → Release Notes**

| Platform | Workflow                               | Tag Pattern  | Dispatch |
| -------- | -------------------------------------- | ------------ | -------- |
| Android  | `release-platform.yml`                  | `v*-android` | ✅       |
| iOS      | `release-platform.yml`                      | `v*-ios`     | ✅       |
| Web      | `release-platform.yml`                      | `v*-web`     | ✅       |
| Windows  | `release-platform.yml`                  | `v*-windows` | ✅       |
| All      | `release-platform.yml` (generic GitHub Release) | `v*`         | —        |

### Triggering a Release

#### Via tag push

```bash
# Release Android v1.2.3
git tag v1.2.3-android
git push origin v1.2.3-android

# Release all platforms
git tag v1.2.3
git push origin v1.2.3
```

#### Via manual dispatch

Each platform workflow supports `workflow_dispatch` with options for build type,
distribution channel, and dry-run mode.

### Approval Gates

All release workflows require human approval via GitHub Environments:

- **staging** — Internal/TestFlight/sideload releases (auto-approve or 1 reviewer)
- **production** — App Store/Play Store/production web (requires designated reviewers)

### Required Secrets per Platform

| Secret                            | Platform | Purpose                                 |
| --------------------------------- | -------- | --------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`         | Android  | Base64-encoded release signing keystore |
| `ANDROID_KEYSTORE_PASSWORD`       | Android  | Keystore password                       |
| `ANDROID_KEY_ALIAS`               | Android  | Signing key alias                       |
| `ANDROID_KEY_PASSWORD`            | Android  | Signing key password                    |
| `IOS_DISTRIBUTION_CERT_BASE64`    | iOS      | Base64-encoded .p12 distribution cert   |
| `IOS_CERT_PASSWORD`               | iOS      | Certificate password                    |
| `IOS_PROVISIONING_PROFILE_BASE64` | iOS      | Base64-encoded .mobileprovision         |
| `APP_STORE_API_KEY_ID`            | iOS      | App Store Connect API key ID            |
| `APP_STORE_API_ISSUER`            | iOS      | App Store Connect issuer ID             |
| `VERCEL_TOKEN`                    | Web      | Vercel deployment token                 |
| `VERCEL_ORG_ID`                   | Web      | Vercel organization ID                  |
| `VERCEL_PROJECT_ID`               | Web      | Vercel project ID                       |
| `WINDOWS_SIGNING_CERT_BASE64`     | Windows  | Base64-encoded .pfx signing certificate |
| `WINDOWS_CERT_PASSWORD`           | Windows  | Certificate password                    |

## Rollback Procedure

- Rollback is performed by reverting the release commit and re-running the workflow.
- Database rollbacks follow migration tool best practices.

---

For more, see `.github/workflows/release*.yml` and the Changesets config.
