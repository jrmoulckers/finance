# Dependency Review Guide

This guide defines the policy, process, and tooling for managing dependencies in the Finance monorepo.

## Policy

Every new dependency added to the project **must be justified in the PR description**. The justification should explain:

- What problem the dependency solves
- Why existing dependencies or standard library solutions are insufficient
- The expected impact on bundle size, build time, and maintenance burden

## Review Checklist

Before approving a PR that adds or upgrades a dependency, reviewers must verify:

### Maintenance & Community

- [ ] **Actively maintained** — Last commit within 6 months, issues triaged regularly
- [ ] **Bus factor** — More than one active maintainer or backed by an organization
- [ ] **Community health** — Responsive to issues and PRs, clear contribution guidelines

### Legal

- [ ] **License compatibility** — Must be compatible with BUSL-1.1 (our project license)
- [ ] **No viral copyleft** — GPL-3.0 and AGPL-3.0 are explicitly denied

### Security

- [ ] **No known CVEs** — Check via `npm audit`, Dependabot alerts, or [OSV.dev](https://osv.dev)
- [ ] **Security posture** — Has a security policy, responds to vulnerability reports promptly
- [ ] **Minimal permissions** — Does not request unnecessary system access or network calls

### Performance

- [ ] **Bundle size impact** — Evaluate with `bundlephobia.com` (web) or equivalent tooling (mobile)
- [ ] **Tree-shakeable** — Supports ES modules and dead-code elimination where applicable

### Architecture

- [ ] **No duplication** — Does not duplicate functionality already provided by an existing dependency
- [ ] **KMP compatibility** — For shared packages (`packages/*`), must support all KMP targets: `commonMain`, `iosMain`, `androidMain`, `jvmMain`, `jsMain`

## Automated Checks

### Dependabot

Dependabot is configured to monitor all dependency manifests and open PRs for:

- Security vulnerability patches (opened immediately)
- Version updates (opened weekly on Mondays)

### Dependency Review CI

The `dependency-review.yml` GitHub Actions workflow runs on every PR that modifies dependency files. It:

- Fails on any dependency with a **high** or **critical** severity vulnerability
- Denies dependencies with **GPL-3.0** or **AGPL-3.0** licenses

## Update Cadence

| Category         | Cadence   | Notes                                         |
| ---------------- | --------- | --------------------------------------------- |
| Security patches | Immediate | Merge within 24 hours of Dependabot alert     |
| Patch versions   | Weekly    | Batch with Dependabot PRs on Monday           |
| Minor versions   | Bi-weekly | Test thoroughly, especially KMP compatibility |
| Major versions   | As needed | Requires architecture review and issue ticket |

## Approved Dependency Categories

The following dependencies are pre-approved for their respective platforms. Adding a dependency outside these categories requires additional justification.

### KMP (Shared Packages)

- `kotlinx-*` — Coroutines, serialization, datetime, collections
- `SQLDelight` — Type-safe database access with `.sq` files
- `Ktor` — HTTP client for API communication
- `Koin` — Dependency injection

### Android

- `Compose BOM` — Jetpack Compose UI toolkit (version-aligned via BOM)
- `AndroidX` — Core Android libraries (lifecycle, navigation, security-crypto)
- `Timber` — Logging (debug builds only, no sensitive data)

### iOS

- **Apple frameworks only** — No third-party dependencies for iOS targets
- All shared logic comes from KMP via Swift Export

### Web

- `React` — UI framework
- `Vite` — Build tooling and dev server
- `Recharts` — Financial data visualization and charts

### Tooling

- `ESLint` — JavaScript/TypeScript linting
- `Prettier` — Code formatting
- `Turborepo` — Monorepo build orchestration
