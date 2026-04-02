# AGENTS.md — Finance Monorepo

This file provides guidance for all AI agents (GitHub Copilot, Codex, Claude, and others) working in this repository.

## Project Overview

Finance is a multi-platform, native-first financial tracking application for personal, family, and partnered finances. It uses a monorepo architecture with an edge-first design — most computation happens on client devices, with a consolidated backend for data synchronization.

**All four platforms (iOS, Android, Web, Windows) are first-class beta targets.** Windows mirrors Android's architecture: Koin DI, ViewModel pattern, Repository pattern, and KMP shared packages.

## Repository Layout

- `apps/` — Platform-specific applications (iOS, Android, Web, Windows)
- `packages/` — Shared libraries (core logic, data models, sync engine)
- `services/` — Backend services (consolidated API)
- `docs/` — Project documentation (AI workflow, architecture, design)
- `tools/` — Development tooling and scripts
- `.github/` — GitHub configuration, Copilot agents, skills, instructions

## Core Principles (MUST follow)

1. **Privacy first** — Never log, expose, or transmit sensitive financial data in plain text. All agent-generated code must treat user financial data as confidential by default.
2. **Edge-first architecture** — Prefer client-side computation. Backend calls should be for sync, not for business logic.
3. **Accessibility** — All UI code must meet WCAG 2.2 AA minimum. Use semantic elements, support screen readers, respect reduced motion and high contrast preferences.
4. **Security** — Follow OWASP guidelines. Never hardcode secrets. Always validate and sanitize inputs. Use parameterized queries.
5. **Transparency** — Document all significant decisions, trade-offs, and AI-generated code rationale in commit messages and PR descriptions.

## Issue-First Development

All work in this repository follows an issue-first, feature-branch + worktree workflow:

1. **Every code change must reference a GitHub issue.** If no issue exists for the work you're about to do, create one first.
2. **Always use a git worktree** for agent work — never commit directly in the main worktree or on `main`.
   - Naming: `wt-[agent-type]-[type/description-issue#]` (e.g., `wt-android-feat-transactions-443`)
   - **Scan first**: run `git worktree list` — if a worktree for this issue already exists, resume it
   - Main worktree (`finance/`) is reserved for human work
3. **Commit messages must include issue references** in the format `type(scope): description (#N)`.
4. **Push automatically** — `git push origin <branch>` is auto-approved.
5. **Open a PR automatically** with `gh pr create` — include `Closes #N` for resolved issues.
6. **Monitor the PR** — poll `gh pr checks` until all checks pass. Fix CI failures and merge conflicts autonomously; push and restart the check cycle until merge-ready.
7. **Never merge PRs** — humans review and merge. The agent's job is to get the PR to merge-ready state.
8. **Clean up the worktree** after the PR is confirmed merged: `git worktree remove <path>`.

See `docs/ai/worktrees.md` for the full worktree setup and lifecycle guide.

AI agents that skip issue creation, commit directly to `main`, or fail to create PRs are not following the project workflow. If you discover work was done without an issue, create a retroactive issue to track it.

## Coding Standards

- Write clear, self-documenting code. Comment only when intent isn't obvious from the code itself.
- Prefer small, focused functions and modules.
- Write tests alongside new code. Minimum: unit tests for business logic, integration tests for sync/API.
- Use consistent naming conventions per platform (camelCase for JS/TS/Swift, snake_case for Python, PascalCase for C#).
- All public APIs must have documentation comments.

## What NOT to Do

- Do NOT commit secrets, API keys, tokens, or credentials
- Do NOT add dependencies without documenting the reason
- Do NOT modify files in `secrets/` or environment files
- Do NOT bypass linters, formatters, or CI checks
- Do NOT generate placeholder/dummy implementations without marking them clearly with `// TODO:` comments
- Do NOT make changes outside the scope of the assigned task

## AI Agent Configuration

Custom agents are defined in `.github/agents/`. Each agent has a specific role:

- `accessibility-reviewer` — Accessibility compliance review (WCAG 2.2 AA)
- `android-engineer` — Android platform (Jetpack Compose, KMP integration, Material 3)
- `architect` — System design and architecture decisions
- `backend-engineer` — Supabase backend (PostgreSQL, Auth, Edge Functions, RLS, PowerSync)
- `design-engineer` — Design tokens, Style Dictionary, color systems, typography
- `devops-engineer` — CI/CD (GitHub Actions, Turborepo, Fastlane, Changesets)
- `docs-writer` — Documentation authoring and maintenance
- `finance-domain` — Financial domain logic and modeling
- `ios-engineer` — iOS platform (SwiftUI, KMP via Swift Export, Apple Keychain)
- `kmp-engineer` — Kotlin Multiplatform shared code (SQLDelight, Ktor, kotlinx)
- `security-reviewer` — Security and privacy code review
- `web-engineer` — Web PWA (React/TypeScript, Service Workers, SQLite-WASM)
- `windows-engineer` — Windows platform (Compose Desktop, Windows Hello, DPAPI)

Agent skills are in `.github/skills/` and provide reusable domain knowledge.
Path-specific instructions are in `.github/instructions/`.

## Human-Gated Operations (MANDATORY)

The following operations MUST NEVER be performed by AI agents without explicit human approval. These restrictions apply to ALL AI tools working in this repository — GitHub Copilot, Codex, Claude, and any other agent.

### Category 1: Git Remote Operations

AI agents MAY (auto-approved):

- Push to **own feature branches**: `git push origin <feature-branch>`
- `git fetch origin main` — read-only sync, required for pre-push rebase
- `git rebase origin/main` on **own feature branch only** — required pre-push hygiene
- `git status`, `git log`, `git diff`, `git show`, `git branch`

AI agents MUST NOT:

- Push to `main`, `master`, or release branches (hard blocked by GitHub branch protection)
- Use `git push --force` (forbidden entirely)
- Use `git push --force-with-lease` without explicit human approval (may overwrite collaborator commits)
- `git remote add`, `git remote remove`, `git remote set-url`
- `git merge` from remote branches
- `git rebase` onto any branch other than `origin/main` on the agent's own feature branch

**Why:** Feature-branch pushes are safe because `main` is protected by branch protection requiring PR review. `git fetch` and pre-push rebase are standard hygiene — not gated. Force-push is dangerous because it can overwrite others' work.

### Category 2: Pull Request & Review Operations

AI agents MAY:

- Create pull requests with linked issues (`Closes #N`) and detailed descriptions
- Use `gh pr create` to open PRs for review

AI agents MUST NOT:

- Merge or close pull requests
- Approve or dismiss PR reviews
- Request reviewers
- Use `gh pr merge`, `gh pr close`, or `gh pr review --approve`

**Why:** Merging and approval are critical human responsibilities, especially for a financial application handling sensitive data. PR creation is safe because `main` is protected by branch protection requiring human review before merge.

### Category 3: Remote Platform Operations

AI agents MUST NOT execute:

- GitHub API writes (closing issues, changing labels, modifying repo settings)
- Deployment triggers or release publishing
- Hosting/infrastructure configuration changes
- Cloud service API calls (AWS, GCP, Azure, etc.)
- Any `gh repo`, `gh issue close/delete`, or `gh release` command

**Why:** Remote platform changes can affect production systems, billing, and user data.

### Category 4: Operations Outside Project Boundary

AI agents MUST NOT:

- Read, write, or execute files outside the repository root
- Access system directories, user home directories, or other projects
- Modify system configuration (PATH, env vars, registry, etc.)
- Install global packages or system-level tools

**Why:** This repository's agents should only affect this repository. System-level changes can break other projects or compromise security.

### Category 5: Destructive File Operations

AI agents MUST NOT execute:

- `rm -rf`, `del /S`, `Remove-Item -Recurse -Force` on directories
- Disk formatting, partitioning, or system-level file operations
- Bulk file deletion (more than one file per command without naming each explicitly)
- Wildcard deletion (`rm *.js`, `del *.log`) — always name each file
- Overwriting files without reading them first

**Instead:** Use the standard file edit/create tools. To remove files, list each by name and explain why. To clean build artifacts, tell the human to run the appropriate clean script.

**Why:** Destructive operations are irreversible and can cause data loss.

### Category 6: Package Publishing & Distribution

AI agents MUST NOT execute:

- `npm publish`, `yarn publish`, `pnpm publish` or any publish command
- `docker push`, `docker buildx push` or container image pushes
- App store submission, CDN upload, or release distribution commands
- Deployment scripts (`deploy.sh`, `cdk deploy`, `terraform apply`, etc.)
- Creating GitHub Releases with attached binaries

**Instead:** Prepare the package, write release notes, create a pre-publish checklist, and ask the human to execute the final publish command.

**Why:** Publishing affects downstream consumers, app store users, and production systems. It cannot be easily reversed.

### Category 7: Secret & Credential Operations

AI agents MUST NOT:

- Create or edit `.env` files containing actual API keys, passwords, tokens, or connection strings
- Read files in `secrets/`, `.secrets/`, or `credentials/` directories
- Access the system keychain, Windows Credential Manager, macOS Keychain, or Linux secret-service
- Generate real API keys or tokens (e.g., `openssl rand`, `ssh-keygen`, `gpg --gen-key`)
- Hardcode any value that looks like a secret (long random strings, base64 blobs, URIs with passwords)
- Echo, log, or display the contents of environment variables that may contain secrets

**Instead:** Create `.env.example` with placeholder values like `YOUR_API_KEY_HERE`. Reference env var names without values. Document what secrets are needed and where to configure them.

**Why:** Credential operations in a financial app carry extreme risk. A leaked key or token could expose every user's financial data.

### Category 8: Database Destructive Operations

AI agents MUST NOT execute:

- `DROP TABLE`, `DROP DATABASE`, `DROP INDEX`, or any `DROP` statement
- `TRUNCATE TABLE` or `TRUNCATE`
- `DELETE FROM` without a `WHERE` clause (full table deletion)
- `ALTER TABLE ... DROP COLUMN` (irreversible schema change)
- Database migration scripts against anything other than a local dev database
- `pg_restore`, `mongorestore`, or database restore commands
- Modifying database connection strings to point at production or staging systems

**Instead:** Write migration scripts and ask the human to review and run them. Use `SELECT` to inspect before proposing changes. Always include `down` migrations for reversibility.

**Why:** Financial data is irreplaceable. Database operations must be human-verified.

### Enforcement

These restrictions are enforced through multiple layers:

1. **Git hooks** — `pre-push` hook blocks non-interactive sessions (AI agents) from pushing
2. **GitHub branch protection** — Server-side rules requiring PR review before merging to `main`
3. **VS Code settings** — Terminal allowlist/denylist in `.vscode/settings.json`
4. **Agent instructions** — Each agent's `.agent.md` includes these restrictions in its Boundaries section
5. **Global instructions** — `.github/copilot-instructions.md` declares these rules with detailed "instead, do this" guidance
6. **Documentation** — `docs/ai/restrictions.md` provides full details and enforcement tier analysis

⚠️ **Important:** Categories 1-4 have hard enforcement (git hooks + branch protection). Categories 5-8 rely on advisory enforcement — the directives above tell agents what to do instead, but there is no technical mechanism that prevents a misbehaving agent from running a destructive command. The pre-push hook ensures that even if mistakes happen locally, they cannot propagate to the remote repository.

If an AI agent encounters a task requiring a gated operation, it MUST:

1. Stop and clearly state what operation it needs to perform
2. Explain why the operation is necessary
3. Wait for explicit human approval before proceeding
4. Never attempt workarounds to bypass these restrictions

### When Working Autonomously (Human Unavailable)

If no human is available to approve a gated operation, agents MUST:

1. Complete all local work (code, tests, commit) to the point where the gated step is the only remaining action
2. Add a `## Needs Human Action` section to the PR description (or leave a `// TODO(human): <action>` comment) listing each pending step with rationale
3. Never guess on gated operations — stop cleanly and document

## Fleet / Swarm Workflows

This project supports Copilot CLI's `/fleet` command for parallel agent execution. For complex tasks, `/fleet` breaks down work and dispatches subtasks to specialized agents concurrently:

```bash
# In Copilot CLI
/fleet implement budget rollover with tests, docs, and security review
```

Each agent gets its own worktree and PR. The fleet orchestrator can delegate architecture to `@architect`, implementation to domain agents, security review to `@security-reviewer`, and documentation to `@docs-writer`, all running in parallel with isolated worktrees.

### Fleet Coordination Rules

When multiple agents work in parallel, they MUST follow these rules to avoid conflicts:

**File ownership by agent:**

| Agent                     | Primary ownership                              |
| ------------------------- | ---------------------------------------------- |
| `@kmp-engineer`           | `packages/`                                    |
| `@backend-engineer`       | `services/api/`                                |
| `@web-engineer`           | `apps/web/`                                    |
| `@android-engineer`       | `apps/android/`                                |
| `@ios-engineer`           | `apps/ios/`                                    |
| `@windows-engineer`       | `apps/windows/`                                |
| `@design-engineer`        | `config/tokens/`, generated token files        |
| `@devops-engineer`        | `.github/workflows/`, `build-logic/`, `tools/` |
| `@docs-writer`            | `docs/`, `*.md` files in root                  |
| `@security-reviewer`      | Read-only review — never edits production code |
| `@accessibility-reviewer` | Read-only review — never edits production code |

**Coordination protocol:**

1. **No two agents edit the same file in parallel.** If a task requires two agents to touch the same file, one agent leads and the other reviews.
2. **Shared config files** (`gradle/libs.versions.toml`, `settings.gradle.kts`, `package.json`, `turbo.json`) must be edited by only one agent per fleet run — assign ownership to `@kmp-engineer` (Gradle) or `@devops-engineer` (Node/CI).
3. **Agents announce intent** — when starting a fleet task, the orchestrator should note which files each agent will touch in the issue or PR description.
4. **Schema changes are serialized** — only `@backend-engineer` writes Supabase migrations; only `@kmp-engineer` writes SQLDelight `.sq` files. Both must be in sync (a single coordinated sprint task, not two independent ones).
5. **After parallel work, the last agent to commit runs** `npm run ci:check` **before pushing** to catch any integration issues.

### Agent Escalation Path

When an agent is blocked or uncertain:

1. **First**: Re-read the relevant skill (`@kmp-development`, `@supabase-powersync`, etc.) — the answer may already be documented
2. **Second**: Consult `@architect` for cross-cutting design questions
3. **Third**: Leave a clear decision point documented in the PR as `## Needs Decision: <question>` and stop — do not guess on financial logic

**Requirements:** Copilot CLI with Pro+ subscription. No special repo configuration needed.

See `docs/ai/` for complete AI development documentation.
