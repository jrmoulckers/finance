# Versioning Strategy

This document defines how version numbers work across all platforms and packages in the Finance monorepo. It covers semantic versioning, platform-specific build numbers, the Changeset workflow for deciding bump types, pre-release versions, Git tag conventions, and the branching strategy.

**Related:** [Release Process](release-process.md) · [Rollback Procedures](rollback-procedures.md)

---

## Table of Contents

- [Semantic Versioning](#semantic-versioning)
- [Platform Build Numbers](#platform-build-numbers)
- [Changeset Workflow — Choosing Bump Types](#changeset-workflow--choosing-bump-types)
- [Pre-Release Versions](#pre-release-versions)
- [Git Tag Format](#git-tag-format)
- [Branching Strategy](#branching-strategy)
- [Version Lifecycle Example](#version-lifecycle-example)
- [References](#references)

---

## Semantic Versioning

Finance uses [Semantic Versioning 2.0.0](https://semver.org/) (semver) for all packages and apps. Every version number follows the format:

```
MAJOR.MINOR.PATCH
```

| Segment   | When to Increment                                                                                                                     | Example           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **MAJOR** | Breaking changes — removing or renaming public APIs, database schema migrations that drop columns, incompatible sync protocol changes | `1.2.3` → `2.0.0` |
| **MINOR** | New features — additive API changes, new screens, new export formats, non-breaking enhancements                                       | `1.2.3` → `1.3.0` |
| **PATCH** | Bug fixes — crash fixes, performance improvements, typo corrections, documentation updates                                            | `1.2.3` → `1.2.4` |

### Independent Versioning

Each package and app in the monorepo is versioned independently. This means:

- `apps/ios` can be at `1.3.0` while `apps/android` is at `1.2.1`.
- `packages/core` can be at `2.0.0` while `packages/ui` is at `1.5.0`.
- A breaking change in `packages/core` does not force a major bump in every consuming app — only apps that expose the breaking change to users need a major bump.

This is managed by [Changesets](https://github.com/changesets/changesets), configured in [`.changeset/config.json`](../../.changeset/config.json).

---

## Platform Build Numbers

In addition to the semver display version, mobile and desktop platforms require platform-specific build numbers that must increase monotonically with each release submission.

### iOS — `CFBundleVersion`

| Field                        | Purpose                          | Example |
| ---------------------------- | -------------------------------- | ------- |
| `CFBundleShortVersionString` | User-visible version (semver)    | `1.3.0` |
| `CFBundleVersion`            | Build number (monotonic integer) | `42`    |

- **Where stored:** `Info.plist`
- **How incremented:** Auto-incremented by the CI pipeline (`release-ios.yml`) on each release build. The CI reads the current TestFlight build number and increments by 1.
- **Constraint:** Must be a monotonically increasing integer. Apple rejects submissions with a `CFBundleVersion` equal to or less than any previously submitted build.

### Android — `versionCode`

| Field         | Purpose                        | Example |
| ------------- | ------------------------------ | ------- |
| `versionName` | User-visible version (semver)  | `1.3.0` |
| `versionCode` | Numeric build code (monotonic) | `10300` |

- **Where stored:** `build.gradle.kts`
- **How computed:** Deterministically derived from the version name: `MAJOR * 10000 + MINOR * 100 + PATCH`. For example, `1.3.0` → `10300`, `2.0.1` → `20001`.
- **Constraint:** Must be a strictly increasing integer. Google Play rejects uploads with a `versionCode` equal to or less than the current published version.

### Windows — MSIX Four-Part Version

| Field        | Purpose                  | Example   |
| ------------ | ------------------------ | --------- |
| MSIX version | Four-part version number | `1.3.0.0` |

- **Where stored:** `.csproj` / `Package.appxmanifest`
- **Format:** `MAJOR.MINOR.PATCH.0` — the fourth segment is always `0` because it is reserved by the Microsoft Store.
- **Constraint:** Must increase with each Store submission. The Store rejects packages with a version equal to or less than the current listing.

### Web

- **Where stored:** `package.json` → `version`
- **Format:** Standard npm semver (e.g., `2.1.0`). No additional build number is needed because web deployments are immutable snapshots (Vercel assigns a unique deployment ID).

---

## Changeset Workflow — Choosing Bump Types

Every user-facing change must include a [changeset](https://github.com/changesets/changesets). The changeset specifies which packages are affected and the semver bump type. Use this decision tree to choose the right bump:

### Decision Tree

```
Is this a breaking change?
├── YES → major
│     Examples:
│     • Removing a public API or renaming a function in packages/core
│     • Changing the sync protocol in a non-backward-compatible way
│     • Dropping support for a platform or OS version
│     • Database migration that deletes or renames columns
│
└── NO → Does this add new functionality?
    ├── YES → minor
    │     Examples:
    │     • Adding a new screen (e.g., recurring transactions)
    │     • Adding a new export format (e.g., OFX)
    │     • Adding a new UI component to packages/ui
    │     • Adding a new API endpoint in services/api
    │
    └── NO → patch
          Examples:
          • Fixing a crash on the budget overview screen
          • Improving SQLite query performance
          • Correcting a typo in UI text
          • Updating a dependency to fix a security vulnerability
          • Accessibility improvements (e.g., adding missing labels)
```

### When NOT to Add a Changeset

Not every PR needs a changeset. Skip it for:

- CI/CD configuration changes (workflow files, Turborepo config)
- Documentation-only changes (unless they ship in-app)
- Dev tooling updates (ESLint config, Prettier config)
- Test-only changes (no user-facing impact)

The CI pipeline will remind you if a changeset is expected but missing.

### Writing Good Changeset Summaries

Changeset summaries appear in `CHANGELOG.md` and release notes. Write them for **users**, not developers:

| ❌ Bad                             | ✅ Good                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| "Refactor budget state management" | "Fix budget totals not updating after editing a category" |
| "Update SQLite queries"            | "Improve transaction list loading speed by 40%"           |
| "Add RecurringTransactionScreen"   | "Add support for recurring transactions"                  |

---

## Pre-Release Versions

Pre-release versions allow testing with a wider audience before a stable release. Finance uses two pre-release stages:

### Alpha

- **Format:** `0.1.0-alpha.1`, `0.1.0-alpha.2`, ...
- **Purpose:** Early testing with the development team. Features may be incomplete or unstable.
- **Audience:** Internal team only.
- **Distribution:**
  - iOS: TestFlight (internal testers group)
  - Android: Google Play internal testing track
  - Web: Vercel preview deployment
  - Windows: MSIX sideload or flight ring (internal)

### Beta

- **Format:** `0.1.0-beta.1`, `0.1.0-beta.2`, ...
- **Purpose:** Feature-complete testing with external beta testers. Bugs are expected but core flows should work.
- **Audience:** Opted-in beta testers.
- **Distribution:**
  - iOS: TestFlight (external testers group)
  - Android: Google Play closed/open beta track
  - Web: Vercel preview deployment with beta URL
  - Windows: Flight ring (external testers)

### Pre-Release Progression

```
alpha.1 → alpha.2 → ... → beta.1 → beta.2 → ... → stable (1.0.0)
```

- Alpha and beta versions are **not** published to production app stores.
- Each pre-release increment resets when moving to the next stage: `0.1.0-alpha.3` → `0.1.0-beta.1` (not `beta.4`).
- The release workflow (`release.yml`) automatically marks GitHub Releases as **pre-release** when the tag contains `-alpha`, `-beta`, or `-rc`.

### Creating Pre-Release Versions

Pre-release versions are created by entering pre-release mode with Changesets:

```bash
# Enter pre-release mode (alpha channel)
npx changeset pre enter alpha

# ... make changes, add changesets, version as normal ...
npx changeset version
# This produces versions like 0.1.0-alpha.1

# When ready to move to beta
npx changeset pre exit
npx changeset pre enter beta

# When ready for stable release
npx changeset pre exit
npx changeset version
# This produces the stable version (e.g., 0.1.0)
```

---

## Git Tag Format

Git tags trigger the release pipelines. Finance uses two tag formats:

### Monorepo Release Tag

For overall project milestones and GitHub Releases:

```
v<MAJOR>.<MINOR>.<PATCH>
v<MAJOR>.<MINOR>.<PATCH>-<prerelease>
```

**Examples:**

- `v0.1.0` — first stable release
- `v0.1.0-alpha.1` — first alpha pre-release
- `v0.1.0-beta.1` — first beta pre-release
- `v1.0.0` — major stable release

### Platform-Prefixed Tags

For triggering platform-specific release pipelines:

```
<platform>/v<MAJOR>.<MINOR>.<PATCH>
```

**Examples:**

- `ios/v1.3.0` — triggers the iOS release workflow
- `android/v1.3.0` — triggers the Android release workflow
- `web/v2.1.0` — triggers the web release workflow
- `windows/v1.3.0` — triggers the Windows release workflow

### Tag Rules

1. **Tags are immutable.** Never delete and re-push a tag. If a release is bad, create a new patch version.
2. **Tags must point to commits on `main`** (or a hotfix branch for emergency releases).
3. **Platform tags are pushed after the Changesets version PR is merged.** The CI pipeline handles this automatically.
4. **Pre-release tags** include the pre-release suffix: `ios/v1.3.0-beta.1`.

---

## Branching Strategy

Finance uses **trunk-based development** with short-lived feature branches. The `main` branch is always the source of truth and should always be in a deployable state.

### Branch Types

| Branch Pattern         | Purpose                               | Lifetime       | Merges Into |
| ---------------------- | ------------------------------------- | -------------- | ----------- |
| `main`                 | Stable trunk — always deployable      | Permanent      | —           |
| `feature/<name>`       | New features and enhancements         | Days to 1 week | `main`      |
| `fix/<name>`           | Bug fixes                             | Hours to days  | `main`      |
| `docs/<name>`          | Documentation changes                 | Hours to days  | `main`      |
| `chore/<name>`         | CI, tooling, dependency updates       | Hours to days  | `main`      |
| `hotfix/<platform>-v*` | Emergency fixes for released versions | Hours          | `main`      |

### Branch Rules

1. **All changes go through pull requests.** Direct pushes to `main` are blocked by branch protection rules.
2. **Feature branches are short-lived.** Aim to merge within 1 week. Long-lived branches cause merge conflicts and integration problems.
3. **Rebase or squash merge.** Keep `main` history linear and readable. Prefer squash merging for feature branches to produce a single clean commit.
4. **Delete branches after merge.** GitHub is configured to auto-delete merged branches.

### Branch Protection on `main`

The following rules are enforced on the `main` branch:

- ✅ Require pull request reviews (at least 1 approval)
- ✅ Require status checks to pass (lint, test, build, type-check)
- ✅ Require linear history (squash or rebase merges only)
- ✅ Require branches to be up to date before merging
- ✅ No force pushes
- ✅ No deletions

### Hotfix Branch Workflow

Hotfix branches are the only exception to the normal feature branch workflow. They are created from a release tag (not from `main`) and follow an expedited review process:

```
Release tag (e.g., android/v1.3.0)
  │
  ├─ git checkout -b hotfix/android-v1.3.1 android/v1.3.0
  │
  ├─ Apply minimal fix + add test
  │
  ├─ Bump patch version manually
  │
  ├─ Open PR → main (expedited review)
  │
  ├─ Merge + push platform tag (android/v1.3.1)
  │
  └─ Release pipeline runs automatically
```

See the [Hotfix Process](release-process.md#hotfix-process) section in the Release Process guide for full details.

---

## Version Lifecycle Example

Here is a complete example showing how a feature moves from development to release:

```
1. Developer creates feature/monthly-rollover branch
   └─ Implements monthly budget rollover feature

2. Developer adds a changeset:
   npx changeset
   └─ Selects: @finance/android (minor), @finance/core (patch)
   └─ Summary: "Add monthly budget rollover feature"

3. PR opened, reviewed, and merged to main

4. Changesets GitHub Action detects pending changesets
   └─ Opens "Version Packages" PR:
       • @finance/android: 1.2.1 → 1.3.0 (minor bump)
       • @finance/core: 2.0.0 → 2.0.1 (patch bump)
       • CHANGELOG.md updated in both packages

5. Human reviews and merges the version PR

6. CI pushes platform tag: android/v1.3.0

7. release-android.yml triggers:
   └─ Build → Sign → Upload to Play Store internal track

8. Internal testing (1–2 days) → Beta (3–7 days) → Staged rollout → Full release
```

---

## References

- [Release Process](release-process.md) — End-to-end release workflow including per-platform pipelines
- [Rollback Procedures](rollback-procedures.md) — How to roll back a bad release on each platform
- [Changesets documentation](https://github.com/changesets/changesets) — Upstream docs for the versioning tool
- [Semantic Versioning 2.0.0](https://semver.org/) — The semver specification
- [`.changeset/config.json`](../../.changeset/config.json) — Changesets configuration for this repo
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — GitHub Release workflow
- [`.github/workflows/changesets.yml`](../../.github/workflows/changesets.yml) — Changesets automation workflow
