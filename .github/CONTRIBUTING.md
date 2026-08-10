# Contributing to Finance

> **This guide extends the JRM Studio canonical contributing guide:**
> <https://github.com/jrmoulckers/.github/blob/main/CONTRIBUTING.md>
>
> Finance is a multi-platform monorepo with product-specific tooling, branch
> protection, and financial-correctness rules, so this file adds those on top of
> the shared studio baseline. **Where this file is silent, the canonical guide
> governs.** Real conflicts are listed under
> [Deliberate deviations from the canonical guide](#deliberate-deviations-from-the-canonical-guide)
> rather than being resolved silently.

Thank you for contributing to Finance! This project uses AI agents as
first-class development tools alongside human contributors.

> **AI tools are not required to contribute.** GitHub Copilot and the project's
> AI agents enhance the workflow, but every contribution — from typo fixes to new
> features — is welcome without them. Use any editor and workflow you prefer.

For AI-specific rules and fleet coordination, see [AGENTS.md](../AGENTS.md).

## Code of Conduct

All contributors are expected to follow our
[Code of Conduct](../CODE_OF_CONDUCT.md). Please read it before participating.

## Quick Contributions

For small changes like fixing a typo, improving docs, or correcting a comment:

1. [Fork the repository](https://github.com/jrmoulckers/finance/fork)
2. Create a branch for your change
3. Edit the file directly on GitHub or in your local clone
4. Open a pull request with a concise summary and testing notes

No local build setup is needed for documentation-only changes. Look for issues
labeled [`good first issue`](https://github.com/jrmoulckers/finance/labels/good-first-issue)
or [`help wanted`](https://github.com/jrmoulckers/finance/labels/help%20wanted)
if you're looking for a place to start.

## Issue-First Workflow

Finance uses an issue-first, PR-always workflow:

1. **Find or create a GitHub issue** before starting work. If none exists, create one with `gh issue create`.
2. Work on a feature branch; never commit directly to `main`.
3. Use Conventional Commit messages with an issue reference: `type(scope): description (#N)`.
4. Push your branch and open a pull request against `main`.
5. Include `Closes #N` in the PR body.
6. Run the repository's format, lint, type-check, test, and build commands as applicable.
7. Keep the PR focused, reviewable, and free of merge conflicts.

A change left only on a local branch is not complete.

Finance additionally uses **git worktrees** for parallel work:

```bash
git worktree add worktrees/wt-my-feature -b feat/my-feature origin/main
```

Worktree naming convention: `wt-[agent-type]-[type/description-issue#]`
(e.g., `wt-android-feat-transactions-443`). See
[`docs/ai/worktrees.md`](../docs/ai/worktrees.md) for the full lifecycle guide.

## Getting Started

See [Prerequisites](#prerequisites) below for required tool versions.

```bash
# 1. Clone the repository
git clone https://github.com/jrmoulckers/finance.git
cd finance

# 2. Install dependencies (this also installs the Husky git hooks)
npm install

# 3. Verify your environment
npm run doctor

# 4. Create a feature branch from main
git checkout -b feat/my-feature origin/main
```

`npm install` runs the `prepare` script, which installs the Husky hooks in
`.husky/`:

- **`pre-commit`** — auto-formats staged files via `lint-staged`
- **`commit-msg`** — validates the Conventional Commit message
- **`pre-push`** — runs Prettier, ESLint, and a secret scan as a fast pre-flight

The pre-push hook is a _local_ pre-flight; the authoritative gate is the
server-side required status checks. It has an explicit, logged bypass
(`HUSKY=0` or `SKIP_PREPUSH=1`) that is the documented flow for non-interactive
agents. Do not use the bypass to skip fixing a real failure.

> An alternative hook set that requires interactive human confirmation before
> pushing lives in [`tools/git-hooks/`](../tools/git-hooks/). Opt in with
> `git config core.hooksPath tools/git-hooks`. Doing so **replaces** the Husky
> hooks above, so you lose the automatic `lint-staged` formatting and commit-message
> validation.

### Prerequisites

| Tool                                                  | Version          | Purpose                                       |
| ----------------------------------------------------- | ---------------- | --------------------------------------------- |
| [Git](https://git-scm.com/)                           | 2.40+            | Version control                               |
| [Node.js](https://nodejs.org/)                        | 22+              | Build tools, MCP servers                      |
| JDK                                                   | 21               | Kotlin Multiplatform, Android, Windows builds |
| [VS Code](https://code.visualstudio.com/)             | 1.99+            | Primary editor (or use your preferred editor) |
| [GitHub Copilot](https://github.com/features/copilot) | Pro+ recommended | AI development _(optional)_                   |

### VS Code Extensions

These install automatically when you open the workspace (via
`.vscode/extensions.json`):

**Required**

- **GitHub Copilot** — AI completions
- **GitHub Copilot Chat** — AI chat and agent mode
- **EditorConfig** — Consistent formatting

**Recommended**

- **GitLens** — Git history and blame
- **Markdown All in One** — Doc authoring
- **Markdown Mermaid** — Diagram rendering
- **Code Spell Checker** — Typo detection

When VS Code opens, it will prompt you to install recommended extensions, load
Copilot instructions and agent configurations automatically, and start MCP
servers when you open Copilot Chat.

## Commit Messages

All commits and PR titles must follow
[Conventional Commits](https://www.conventionalcommits.org/):

```text
type(scope): description (#N)
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`,
`perf`, `build`

**Scopes:** `android`, `ios`, `web`, `windows`, `kmp`, `api`, `design`, `ci`,
`docs`, or omit for cross-cutting changes.

**Examples:**

- `feat(android): add budget rollover support (#123)`
- `fix(web): correct currency formatting in dashboard (#456)`
- `docs: update contributing guide (#193)`
- `ci: add Lighthouse performance budget (#789)`

### Issue references are required

Every commit must reference a GitHub issue number with `(#N)` at the end of the
subject line. The `PR Title Check` workflow enforces the Conventional Commit
format on every pull request.

When AI agents create commits, include the trailer:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Before Opening a PR

Run the mandatory pre-push validation:

```bash
npm run format:check && npx eslint . --max-warnings 0
```

If it fails, auto-fix and re-run:

```bash
npm run format        # auto-fix Prettier issues
npx eslint . --fix    # auto-fix ESLint issues
```

Then rebase onto `main` before opening your PR:

```bash
git fetch origin main && git rebase origin/main
```

Other useful commands:

| Command                  | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `npm run ci:check`       | Full local gate: format check + lint + type-check    |
| `npm run ci:check:quick` | Lightweight check for docs-only changes              |
| `npm run ready-for-pr`   | Final validation: format → lint → type-check → tests |
| `npm run format`         | Auto-fix formatting                                  |
| `npm run lint`           | Run ESLint                                           |
| `npm run type-check`     | Run TypeScript type checking                         |

> **Known local issue:** `npm run type-check` (and therefore `npm run ci:check`)
> can fail locally on some setups due to a TypeScript/tsconfig compatibility
> issue. Format plus lint is sufficient for local pre-push validation; remote CI
> is the source of truth for type-check. If a check cannot be run locally, note
> why in the PR.

## Security, Privacy, and Accessibility

Finance is a financial application, so these rules are non-negotiable.

### Security

- **NEVER** commit secrets, API keys, tokens, credentials, private keys, or real production data
- **NEVER** log or expose sensitive financial data in plain text
- **ALWAYS** use parameterized queries — no string interpolation in SQL
- **ALWAYS** encrypt financial data at rest and in transit
- **ALWAYS** validate and sanitize inputs at trust boundaries
- Use placeholders in tracked examples and keep real values in git-ignored local files
- Follow OWASP guidance

Report security vulnerabilities privately — see [SECURITY.md](./SECURITY.md).
Do not open a public issue, pull request, or discussion.

### Accessibility

- All UI must meet **WCAG 2.2 AA** minimum
- Test with screen readers (VoiceOver, TalkBack, Narrator, NVDA)
- Support keyboard navigation and focus management
- Respect reduced-motion and high-contrast preferences
- Never convey information through color alone

### Financial calculation rules

- **NEVER** use floating point for money — use integer minor units
- Use banker's rounding (round half to even)
- Always store ISO 4217 currency codes alongside monetary values

### Documentation

Document important design or architecture decisions in
[`docs/architecture/`](../docs/architecture/) when applicable.

## Pull Requests

1. Open a PR targeting `main` with a title following [Commit Messages](#commit-messages).
2. Fill in the PR template — link the issue with `Closes #N`.
3. Ensure all [required status checks](#required-status-checks) pass.
4. Address review feedback — stale approvals are dismissed automatically on new pushes.
5. Merge with **squash** or **rebase**; merge commits are not allowed.

A good PR includes a linked issue, a short summary of what changed and why, the
testing or validation performed, screenshots or recordings for UI changes, any
documentation updates, and confirmation that no secrets were added.

> **Who merges?** Contributors and AI agents merge **their own** PRs once the
> quality gate passes (CI green **and** the PR is `MERGEABLE`). Merging,
> approving, or closing a PR you did **not** author requires explicit direction
> from the maintainer. See [AGENTS.md](../AGENTS.md) for the full policy.

## Need Help?

Use GitHub Discussions for questions and proposals, or open a focused issue when
there is a clear task, bug, or feature request. Also see:

- [AGENTS.md](../AGENTS.md) — AI agent rules and fleet coordination
- [`docs/ai/`](../docs/ai/) — Full AI workflow documentation
- [`.github/copilot-instructions.md`](./copilot-instructions.md) — Coding standards
- [`docs/ops/`](../docs/ops/) — Operations guides (CI, releases, deployment, monitoring)
- [`docs/architecture/`](../docs/architecture/) — Architecture documentation

---

The sections below are **Finance-specific extensions** to the canonical guide.

## Branch Strategy

Finance uses **trunk-based development with short-lived feature branches**:

| Branch                                 | Purpose                             | Who can push                    |
| -------------------------------------- | ----------------------------------- | ------------------------------- |
| `main`                                 | Production-ready trunk              | No one directly — PR merge only |
| `docs/*`, `feat/*`, `fix/*`, `chore/*` | Feature/task branches               | Contributors via PR             |
| `release/*`                            | Release stabilization (when needed) | Maintainers via PR              |

All work is done on feature branches and merged to `main` through pull requests.
Direct pushes to `main` are blocked by branch protection.

## Branch Protection Rules

The `main` branch is protected. These rules are **enforced server-side by
GitHub** and cannot be bypassed locally.

| Rule                                | Setting                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| Require pull request before merging | ✅ Enabled                                                         |
| Required approving reviews          | **0** — the quality gate is CI, not a mandatory human reviewer     |
| Dismiss stale reviews on new pushes | ✅ Enabled                                                         |
| Require review from code owners     | ❌ Not required (CODEOWNERS still routes review requests)          |
| Require status checks to pass       | ✅ Enabled — see [Required Status Checks](#required-status-checks) |
| Require branches to be up to date   | ✅ Enabled                                                         |
| Require linear history              | ✅ Enabled (squash or rebase merges only)                          |
| Require signed commits              | ❌ Not currently required                                          |
| Allow force pushes                  | ❌ Disabled                                                        |
| Allow deletions                     | ❌ Disabled                                                        |

> **Why linear history?** A linear commit history makes `git bisect` reliable,
> keeps the changelog clean, and simplifies rollbacks for a financial application
> where auditability matters.

For the full setup guide, see
[`docs/ops/branch-protection-setup.md`](../docs/ops/branch-protection-setup.md).
That document is authoritative if it and this table ever disagree.

### Required Status Checks

The following checks must pass before a PR can merge to `main`:

| Check name                                | Source workflow   |
| ----------------------------------------- | ----------------- |
| `ESLint & Prettier`                       | Lint & Format     |
| `Secret Detection`                        | Security Scanning |
| `CodeQL Analysis (java-kotlin)`           | Security Scanning |
| `CodeQL Analysis (javascript-typescript)` | Security Scanning |
| `Build`                                   | Web CI            |
| `Build & Test`                            | Platform CI       |
| `Required Checks Gatekeeper`              | Aggregate gate    |

Additional non-blocking checks (PR title, unit tests, and the path-filtered
Android, iOS, Web, Windows, and KMP jobs) run on relevant PRs. Path-filtered
checks only run when matching files change; GitHub treats skipped path-filtered
checks as passing, so they do not block unrelated PRs.

All CI workflows are defined in [`.github/workflows/`](./workflows/).

## Building & Testing

### Shared KMP packages

```bash
npm run build:kmp    # Build Kotlin Multiplatform packages
npm run test:kmp     # Run KMP JVM tests
```

### Platform-specific builds

```bash
# Web
npm run build -w apps/web
npm run test:web

# Android (requires Android SDK + JDK 21)
./gradlew :apps:android:assembleDebug :apps:android:lintDebug

# iOS (macOS with Xcode only)
cd apps/ios && swift build

# Windows (JDK 21)
./gradlew :apps:windows:run
```

Platform builds are also tested in CI — see the workflow YAML files for details.

## AI Development Workflow

### Custom agents

This project defines specialized agents in
[`.github/agents/`](./agents/) that you can invoke in Copilot Chat, for example:

```text
@architect               — System design and architecture decisions
@native-app-engineer     — Android, iOS, Windows, and shared KMP implementation
@web-engineer            — Web app and PWA implementation
@backend-engineer        — API, auth, and service integrations
@database-engineer       — Schema, migrations, RLS, and PowerSync rules
@security-reviewer       — Security and privacy code review
@accessibility-reviewer  — Accessibility compliance review (review-only)
@finance-domain          — Financial logic and domain modeling
@docs-writer             — Documentation authoring and maintenance
```

[`.github/agents/`](./agents/) is the source of truth for the full roster;
[AGENTS.md](../AGENTS.md) documents each agent's ownership boundaries. Reusable
domain knowledge lives in [`.github/skills/`](./skills/).

### Fleet mode (parallel agents)

For large tasks, use Copilot CLI's `/fleet` command to run multiple agents in
parallel:

```bash
# In Copilot CLI
/fleet implement transaction categorization with tests and docs
```

This breaks the task down and dispatches subtasks to specialized agents
concurrently, each in its own worktree and PR.

### Coding agent (GitHub issues)

You can assign GitHub issues to `@copilot` to have the coding agent work
autonomously:

1. Create a well-described issue
2. Assign it to `@copilot`
3. The agent creates a PR with proposed changes
4. Review the PR in the repo's "Agents" tab

### MCP server setup

The project uses several MCP (Model Context Protocol) servers to enhance
Copilot's capabilities. These are configured in `.vscode/mcp.json` and require:

1. **Node.js 22+** — MCP servers run via `npx`
2. **GitHub PAT (read-only)** — Create a
   [fine-grained Personal Access Token](https://github.com/settings/personal-access-tokens/new)
   scoped to the `jrmoulckers/finance` repository with **read-only** permissions
   (Contents, Issues, Pull requests, Metadata).
   ⚠️ Do **not** use a classic PAT with `repo` write scope — that would let AI
   agents bypass local restrictions via the API.

MCP servers start automatically in Copilot Chat Agent Mode. Check them with
`Ctrl+Shift+P` → `MCP: List Servers`.

## Project Structure

```text
finance/
├── apps/           # Platform-specific apps (iOS, Android, Web, Windows)
├── packages/       # Shared libraries (core, models, sync, design-tokens)
├── services/       # Backend API (sync layer only)
├── config/         # Cross-cutting configuration
├── build-logic/    # Gradle convention plugins
├── docs/           # Documentation (ai, architecture, design, ops)
├── tools/          # Development tools and scripts
├── .github/        # GitHub config, Copilot agents/skills/instructions
└── .vscode/        # VS Code workspace config (MCP, settings)
```

## Coding Standards

- Write clear, self-documenting code. Comment only when intent isn't obvious.
- Prefer small, focused functions and modules; split files that exceed ~300 lines.
- Group by feature, not by type.
- Write tests alongside new code — unit tests for business logic, integration tests for sync/API.
- Follow platform-native naming conventions (camelCase for JS/TS/Swift/Kotlin, PascalCase for types).
- All public APIs must have documentation comments.

## Review Routing

GitHub uses [`.github/CODEOWNERS`](./CODEOWNERS) to automatically request review
from the repository owner for changes in high-impact areas such as shared
packages, platform apps, backend services, build infrastructure, and repository
configuration.

If your pull request spans multiple areas, GitHub applies the most specific
matching rule for each changed path. Update `CODEOWNERS` in the same pull
request whenever ownership changes so review routing stays accurate.

## Deliberate deviations from the canonical guide

Canon permits stricter product-specific guidance, so none of these are
violations — they are recorded so they are visible rather than silent.

| Area                 | Canonical guide                                                           | Finance                                                                                           | Rationale                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Pre-PR validation    | "Run the repository's lint, format, test, type-check, and build commands" | Format + lint are the mandatory local gate; type-check may be deferred to CI                      | `npm run type-check` can fail locally on some setups for reasons unrelated to the change. Remote CI remains the source of truth. |
| Branching            | Fork and branch                                                           | Fork/branch **plus** a named git worktree per task                                                | Multiple agents work in parallel; worktrees keep their working trees isolated.                                                   |
| Commit types         | Nine Conventional Commit types                                            | Same nine plus `build`                                                                            | The monorepo has Gradle/toolchain changes that are neither `ci` nor `chore`.                                                     |
| Merge authority      | Silent on who merges                                                      | Authors (including AI agents) self-merge their own PRs once CI is green and the PR is `MERGEABLE` | Zero required approvals on `main`; CI is the gate. Merging a PR you did not author still requires maintainer direction.          |
| Code of Conduct link | `CODE_OF_CONDUCT.md` (same directory)                                     | `../CODE_OF_CONDUCT.md`                                                                           | This file lives in `.github/`, where GitHub resolves it; the Code of Conduct lives at the repository root.                       |
