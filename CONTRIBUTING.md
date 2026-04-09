# Contributing to Finance

Thank you for your interest in contributing to the Finance monorepo! This guide covers
the branch strategy, protection rules, pull request workflow, and coding expectations
that every contributor — human or AI — must follow.

For AI-specific rules and fleet coordination, see [AGENTS.md](./AGENTS.md).

---

## Table of Contents

- [Branch Strategy](#branch-strategy)
- [Branch Protection Rules](#branch-protection-rules)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Commit Conventions](#commit-conventions)
- [CI Status Checks](#ci-status-checks)
- [Coding Standards](#coding-standards)
- [Security](#security)

---

## Branch Strategy

Finance uses **trunk-based development with short-lived feature branches**:

| Branch                                 | Purpose                             | Who can push                    |
| -------------------------------------- | ----------------------------------- | ------------------------------- |
| `main`                                 | Production-ready trunk              | No one directly — PR merge only |
| `docs/*`, `feat/*`, `fix/*`, `chore/*` | Feature/task branches               | Contributors via PR             |
| `release/*`                            | Release stabilization (when needed) | Maintainers via PR              |

All work is done on feature branches and merged to `main` through reviewed pull
requests. Direct pushes to `main` are blocked by branch protection rules.

## Branch Protection Rules

The `main` branch is protected with the rules summarised below. These rules are
**enforced server-side by GitHub** and cannot be bypassed locally.

### Summary

| Rule                                | Setting                                                |
| ----------------------------------- | ------------------------------------------------------ |
| Require pull request before merging | ✅ Enabled                                             |
| Required approving reviews          | **1** (minimum)                                        |
| Dismiss stale reviews on new pushes | ✅ Enabled                                             |
| Require review from code owners     | ✅ Enabled (when CODEOWNERS is present)                |
| Require status checks to pass       | ✅ Enabled — see [CI Status Checks](#ci-status-checks) |
| Require branches to be up to date   | ✅ Enabled                                             |
| Require linear history              | ✅ Enabled (squash or rebase merges only)              |
| Require signed commits              | ✅ Enabled                                             |
| Include administrators              | ✅ Enabled — admins follow the same rules              |
| Allow force pushes                  | ❌ Disabled                                            |
| Allow deletions                     | ❌ Disabled                                            |

> **Why linear history?** A linear commit history makes `git bisect` reliable,
> keeps the changelog clean, and simplifies rollbacks for a financial application
> where auditability matters.

### Required Status Checks

The following CI checks must pass before a PR can be merged to `main`. These are
the GitHub Actions job names as they appear in the Checks tab:

| Workflow             | Check name                                                    | Runs on                                             |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Lint & Format        | `Lint & Format / ESLint & Prettier`                           | Every PR to `main`                                  |
| PR Title Check       | `PR Title Check / check`                                      | Every PR to `main`                                  |
| CI — Shared Packages | `CI — Shared Packages / Lint & Test (KMP)`                    | PRs touching `packages/`, `build-logic/`, `gradle/` |
| Android CI           | `Android CI / Build & Test`                                   | PRs touching `apps/android/`, `packages/`           |
| iOS CI               | `iOS CI / Build & Test`                                       | PRs touching `apps/ios/`, `packages/`               |
| Web CI               | `Web CI / Build`                                              | PRs touching `apps/web/`, `packages/design-tokens/` |
| Web CI               | `Web CI / Unit Tests`                                         | PRs touching `apps/web/`, `packages/design-tokens/` |
| Windows CI           | `Windows CI / Build & Test`                                   | PRs touching `apps/windows/`, `packages/`           |
| Security Scanning    | `Security Scanning / CodeQL Analysis (java-kotlin)`           | Every PR to `main`                                  |
| Security Scanning    | `Security Scanning / CodeQL Analysis (javascript-typescript)` | Every PR to `main`                                  |
| Security Scanning    | `Security Scanning / Dependency Review`                       | Every PR to `main`                                  |
| Security Scanning    | `Security Scanning / Secret Detection`                        | Every PR to `main`                                  |

> **Note:** Path-filtered checks (Android, iOS, Web, Windows, KMP) only run when
> relevant files change. GitHub treats skipped path-filtered checks as passing,
> so they do not block unrelated PRs.

For the full setup guide, see [`docs/ops/branch-protection-setup.md`](./docs/ops/branch-protection-setup.md).

---

## Getting Started

1. **Fork & clone** the repository (external contributors) or clone directly (team members).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Verify your environment:
   ```bash
   npm run ci:check   # format:check + lint + type-check
   ```
4. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature origin/main
   ```

## Development Workflow

1. **Every change must reference a GitHub issue.** Create one if it doesn't exist.
2. Work on a feature branch. Use git worktrees for parallel work:
   ```bash
   git worktree add worktrees/wt-my-feature -b feat/my-feature origin/main
   ```
3. Make small, focused commits following [Commit Conventions](#commit-conventions).
4. Run `npm run ci:check` before pushing.
5. Rebase onto `origin/main` before opening your PR:
   ```bash
   git fetch origin main && git rebase origin/main
   ```

## Pull Request Process

1. Open a PR targeting `main` with a clear title following [Conventional Commits](#commit-conventions).
2. Fill in the PR template — link the issue with `Closes #N`.
3. Ensure all [required status checks](#required-status-checks) pass.
4. Request review from at least one maintainer or code owner.
5. Address review feedback — stale approvals are automatically dismissed on new pushes.
6. A maintainer will squash-merge or rebase-merge the PR (merge commits are not allowed).

## Commit Conventions

All commits and PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description (#issue)
```

**Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`, `build`, `style`

**Scopes:** `android`, `ios`, `web`, `windows`, `kmp`, `api`, `design`, `ci`, `docs`, or omit for cross-cutting changes.

**Examples:**

- `feat(android): add budget rollover support (#123)`
- `fix(web): correct currency formatting in dashboard (#456)`
- `docs: update contributing guide (#193)`
- `ci: add Lighthouse performance budget (#789)`

The `PR Title Check` workflow enforces this on every pull request.

## CI Status Checks

All CI workflows are defined in `.github/workflows/`. Key commands for contributors:

| Command              | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `npm run ci:check`   | Run format, lint, and type-check locally |
| `npm run format`     | Auto-fix formatting                      |
| `npm run lint`       | Run ESLint                               |
| `npm run type-check` | Run TypeScript type checking             |

Platform-specific builds (Android, iOS, Web, Windows) are tested in CI — see
the workflow YAML files for build and test details.

## Coding Standards

- Write clear, self-documenting code. Comment only when intent isn't obvious.
- Prefer small, focused functions and modules.
- Write tests alongside new code — unit tests for logic, integration tests for sync/API.
- Follow platform naming conventions (camelCase for JS/TS/Swift, PascalCase for C#).
- All public APIs must have documentation comments.
- All UI must meet **WCAG 2.2 AA** accessibility standards.

## Security

- **Never** commit secrets, API keys, tokens, or credentials.
- **Never** log or expose sensitive financial data in plain text.
- Follow OWASP guidelines. Validate and sanitise all inputs.
- Use parameterised queries for all database operations.
- Report security vulnerabilities privately — do not open public issues. Contact the
  maintainers directly or use GitHub's private vulnerability reporting.

---

For more details, see:

- [AGENTS.md](./AGENTS.md) — AI agent rules and fleet coordination
- [docs/ops/](./docs/ops/) — Operations guides (CI, releases, deployment, monitoring)
- [docs/architecture/](./docs/architecture/) — Architecture documentation
