# AGENTS.md — Finance Monorepo

This file provides guidance for all AI agents (GitHub Copilot, Codex, Claude, and others) working in this repository.

## Project Overview

Finance is a multi-platform, native-first financial tracking application for personal, family, and partnered finances. It uses a monorepo architecture with an edge-first design — most computation happens on client devices, with a consolidated backend for data synchronization.

**All four platforms (iOS, Android, Web, Windows) are first-class beta targets.** Windows mirrors Android's architecture: Koin DI, ViewModel pattern, Repository pattern, and KMP shared packages.

## Repository Layout

- `apps/` — Platform-specific applications (iOS, Android, Web, Windows)
- `packages/` — Shared libraries (core logic, data models, sync engine)
- `services/` — Backend services (consolidated API)
- `config/` — Cross-cutting configuration (e.g., detekt, feature flags)
- `build-logic/` — Gradle convention plugins and shared build configuration
- `docs/` — Project documentation (AI workflow, architecture, design)
- `tools/` — Development tooling and scripts
- `.github/` — GitHub configuration, Copilot agents, skills, instructions

## Core Principles (MUST follow)

1. **Privacy first** — Never log, expose, or transmit sensitive financial data in plain text. All agent-generated code must treat user financial data as confidential by default.
2. **Edge-first architecture** — Prefer client-side computation. Backend calls should be for sync, not for business logic.
3. **Accessibility** — All UI code must meet WCAG 2.2 AA minimum. Use semantic elements, support screen readers, respect reduced motion and high contrast preferences.
4. **Security** — Follow OWASP guidelines. Never hardcode secrets. Always validate and sanitize inputs. Use parameterized queries.
5. **Transparency** — Document all significant decisions, trade-offs, and AI-generated code rationale in commit messages and PR descriptions.
6. **No financial-data monetization** — Finance has no advertising business model. Never sell, share, target ads with, or derive advertising profiles from financial data; product telemetry is consent-gated and excludes raw financial values.

## ⚠️ MANDATORY: Pre-Push Lint & Format (NEVER skip)

> **🚨 This is the #1 cause of fleet CI failures. Every agent MUST run these steps before EVERY `git push`.**

Before EVERY `git push`, run these commands **in order**:

1. **`npm run format && npx eslint . --fix`** — auto-fix all formatting and lint issues
2. **`npm run format:check && npx eslint . --max-warnings 0`** — verify everything passes
3. **`git add -A && git commit --amend --no-edit`** — amend commit with fixes
4. **`$env:HUSKY = "0" ; git push --no-verify origin <branch>`** — push, bypassing the pre-push hook
5. **`gh pr create`** with `Closes #N` in the body — create PR immediately after first push
6. **`gh pr view <branch> --json number`** — verify the PR actually exists; if it doesn't, re-run step 5

For docs-only PRs, use the quick check: **`npm run ci:check:quick`**

**Pushing without a clean lint/format check is the #1 cause of CI failures. Skipping the `gh pr view` verification is the #2 cause of "ghost PR" workflow gaps. Agents that skip either waste CI time and create noise.**

### Definition of Done — task is NOT complete until ALL gates pass

| Gate                   | Verification                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Base is `main`**     | PR opened with `--base main` (`gh pr view <N> --json baseRefName` → `main`)                                                                                         |
| **CI green**           | `gh pr checks <N>` — no failures                                                                                                                                    |
| **No merge conflicts** | `gh pr view <N> --json mergeable,mergeStateStatus` — `MERGEABLE` and not `DIRTY`/`BEHIND`                                                                           |
| **Merged to `main`**   | PR merged via `gh pr merge <N> --squash` once the quality gate passes (a branch-only or open-PR program is **not done** unless a documented blocker prevents merge) |

**Merge conflicts carry the same P0 weight as red CI checks.** A green-CI PR sitting in a `CONFLICTING` state is not done. See the **Merge Conflict Protocol** in `.github/instructions/workflow.instructions.md` for the auto-resolve cycle (rebase, lockfile / generated-file auto-resolve, force-with-lease push). Force-with-lease on the agent's own branch is auto-approved when used to resolve conflicts. **Agents have full autonomy to merge their own PRs** once CI is green and the PR is `MERGEABLE` — no human approval required (see Category 2).

> **Note:** `lint-staged` is configured in `.husky/pre-commit` and auto-formats staged files on commit. However, agents bypass the pre-push hook with `$env:HUSKY = "0" ; git push --no-verify`. **The explicit pre-push checklist above is therefore mandatory.**
>
> **Note:** `.prettierignore` now covers non-JS source files (Kotlin, Swift, etc.), so `npm run format` won't touch those. Kotlin linting is handled by **detekt** in CI.

---

## Issue-First Development

All work in this repository follows an issue-first, feature-branch + worktree workflow:

1. **Every code change must reference a GitHub issue.** If no issue exists for the work you're about to do, create one first.
2. **Always use a git worktree** for agent work — never commit directly in the main worktree or on `main`.
   - Naming: `wt-[agent-type]-[type/description-issue#]` (e.g., `wt-android-feat-transactions-443`)
   - **Scan first**: run `git worktree list` — if a worktree for this issue already exists, resume it
   - Main worktree (`finance/`) is reserved for human work
3. **Commit messages must include issue references** in the format `type(scope): description (#N)`.
4. **Push automatically** — `git push origin <branch>` is auto-approved.
5. **Open a PR automatically** with `gh pr create --base main` — **always target `main`** (never a long-lived feature branch) and include `Closes #N` for resolved issues. See the **Branch & Merge Policy** in `docs/ai/fleet-operations.md` (the canonical rules).
6. **Verify the PR exists** — `gh pr view <branch>` must return a PR number before you move on. If it doesn't, re-run `gh pr create`. This catches the silent-failure mode where `gh pr create` errored but the agent assumed success.
7. **Monitor the PR** — poll `gh pr checks` until all checks pass AND `gh pr view --json mergeable,mergeStateStatus` shows `MERGEABLE` / not `DIRTY`. **Merge conflicts carry the same P0 weight as red CI checks** — self-heal via the Merge Conflict Protocol in `.github/instructions/workflow.instructions.md`. Both gates must clear before merging.
8. **Land the work:** Agents have **full autonomy to merge their own PRs**. Once the quality gate passes (CI green AND `MERGEABLE`), merge with `gh pr merge <N> --squash` — auto-approved, no human needed. In fleet mode the **orchestrator** owns reconciling with `origin/main` and **landing the whole program on `main` within the work session** (merging each sub-agent PR in the recommended merge order). Use `--admin` to override a protection-`BLOCKED` state **only** after verifying type-check + lint + affected tests are green locally; document the override in the PR. A program left only on a side branch is **not done** — it breaks staging auto-deploy and `Closes #N`. If a genuine blocker prevents merging, leave a single green, `MERGEABLE` PR with a `## Needs Human Action` note explaining why.
9. **Clean up the worktree** after the PR is merged: `git worktree remove <path>`.

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

## Available Tooling

| Command                     | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `npm run format`            | Auto-fix Prettier formatting                  |
| `npx eslint . --fix`        | Auto-fix ESLint issues                        |
| `npm run format:check`      | Verify Prettier compliance                    |
| `npm run ci:check`          | Full check: format + lint + type-check        |
| `npm run ci:check:quick`    | Quick check for docs-only PRs                 |
| `npm run cleanup:worktrees` | Remove stale/merged worktrees                 |
| `npm run ready-for-pr`      | Final validation before marking work complete |

**CI notes:**

- **Kotlin linting** is handled by **detekt** in CI (not ESLint/Prettier)
- **`.prettierignore`** covers non-JS source files (Kotlin, Swift, etc.) — `npm run format` only touches JS/TS/JSON/MD/YAML
- **AI agents** are defined in `.github/agents/` as `*.agent.md` files — that directory is the **source of truth** for the roster. The **AI Manifest Check** workflow (`npm run ai:manifest:check`, backed by `tools/ai-manifest.js`) validates the exact roster, generated provenance, local-agent boundary, and managed sync inventory. There are **23 agents**: 22 Studio-generated canonical definitions plus the Finance-authored `finance-domain`.

## AI Agent Configuration

Custom agents are defined in `.github/agents/`. Studio-generated definitions carry a provenance stamp and must not be edited locally; Finance behavior belongs in this file and scoped `.github/instructions/**`.

- **Engineering:** `native-app-engineer`, `web-engineer`, `backend-engineer`, `database-engineer`, `devops-engineer`, `sre-engineer`, `design-engineer`, `architect`
- **Review/advisory:** `accessibility-reviewer`, `security-reviewer`, `compliance-specialist`, `qa-tester`, `performance-engineer`
- **Product/operations:** `product-manager`, `business-analyst`, `marketing-strategist`, `docs-writer`, `release-manager`, `ai-ops-engineer`
- **Cross-cutting:** `data-engineer`, `localization-engineer`, `experimentation-engineer`
- **Finance-authored local specialist:** `finance-domain`

> **Reviewer roles are not symmetric.** `accessibility-reviewer` is **review-only** — it never edits production code and routes every fix to the owning platform agent. `security-reviewer` is the designated **emergency fixer** — it may implement CRITICAL/HIGH security fixes in any directory, coordinating with the owning agent, and is review-only for non-security code.

### Canonical Agent Runtime

The canonical roster is active. `native-app-engineer` owns Android, iOS, Windows, and shared KMP structure; `database-engineer` owns PostgreSQL schema, migrations, RLS, seed data, database tests, and PowerSync rules; `sre-engineer` owns SLO, incident, capacity, rollback, and recovery semantics. `backend-engineer` retains API/Auth/Edge Function behavior, while `devops-engineer` retains CI/build/delivery mechanics.

Bounded bug campaigns run through `.github/prompts/bug-bash.prompt.md` rather than a permanent agent; its Finance-specific platform and single-bug interpretation lives in `.github/prompts/README.md`. `finance-domain` is the sole local agent and leads financial correctness while the canonical structural owner leads the surrounding package or platform.

Agent skills are in `.github/skills/` (the source of truth) and provide reusable domain knowledge. As of 2026-06 there are **20** skills. The established set includes:

- `fleet-orchestration` — Multi-agent sprint dispatch and coordination
- `sprint-planning` — Backlog decomposition and sprint sizing
- `project-management` / `issue-management` — Issue lifecycle, roadmap, release management
- `dev-onboarding` — Environment setup and onboarding
- `edge-sync` / `supabase-powersync` / `kmp-development` — Sync, backend, and shared-Kotlin domain knowledge
- `financial-modeling` — Money representation, budgeting, rounding
- `privacy-compliance` — GDPR/CCPA, data minimization, encryption
- `go-to-market` / `monetization` — Marketing and pricing
- `ux-testing` — UX/QA testing guidance

Added in 2026-06: `accessibility-testing`, `security-review-methodology`, `design-tokens`, `performance-budgets`, `i18n-localization`, `mcp-agent-tooling`, `prompt-engineering`. See [`docs/ai/skills.md`](docs/ai/skills.md) for full descriptions.

Path-specific instructions are in `.github/instructions/`.

## Human-Gated Operations (MANDATORY)

The following operations MUST NEVER be performed by AI agents without explicit human approval. These restrictions apply to ALL AI tools working in this repository — GitHub Copilot, Codex, Claude, and any other agent.

### Category 1: Git Remote Operations

> ⚠️ **MANDATORY — READ THIS CAREFULLY**
>
> Pushing feature branches and creating PRs is **NOT optional** and does **NOT require human approval**.
> Agents **MUST** complete the full workflow: commit → pre-push lint & format check (`npm run format:check && npx eslint . --max-warnings 0`) → push → create PR → monitor CI checks.
> **Stopping at a local commit and asking for permission to push is a workflow violation.**
> A task is **INCOMPLETE** if it ends with only a local commit. Push and PR creation are auto-approved.

AI agents **MUST** (auto-approved, mandatory):

- **Push to own feature branches**: `git push origin <feature-branch>` — this is **REQUIRED**, not optional. Never stop and ask for permission.
- `git fetch origin main` — read-only sync, required for pre-push rebase
- `git rebase origin/main` on **own feature branch only** — required pre-push hygiene
- `git push --force-with-lease origin <own-feature-branch>` — auto-approved **only** to re-push the agent's **own** feature branch after a rebase or conflict resolution. `--force-with-lease` refuses to overwrite work it hasn't seen, so it is safe for this narrow use.
- `git status`, `git log`, `git diff`, `git show`, `git branch`

AI agents MUST NOT:

- Push to `main`, `master`, or release branches (hard blocked by GitHub branch protection)
- Use `git push --force` (the unguarded variant) — **forbidden entirely**
- Use `git push --force-with-lease` on a **shared branch, an integration branch, or any branch the agent does not own**, or for anything other than re-pushing the agent's own branch after a clean rebase/conflict resolution
- `git remote add`, `git remote remove`, `git remote set-url`
- `git merge` from remote branches
- `git rebase` onto any branch other than `origin/main` on the agent's own feature branch

**Why:** Feature-branch pushes are safe because `main` is protected by branch protection requiring required CI checks to pass. `git fetch` and pre-push rebase are standard hygiene — not gated. `--force-with-lease` on the agent's **own** branch is auto-approved because it refuses to clobber commits the agent hasn't already seen, making it safe for re-pushing after a rebase/conflict resolution. Plain `git push --force` is forbidden entirely because it overwrites unconditionally.

### Category 2: Pull Request & Review Operations

> **Full autonomy on agent-authored PRs.** Agents own the entire lifecycle of the PRs they open — create, drive CI green, review, approve, merge, and close — without human approval. The only hard requirement is the **quality gate** (CI green AND `MERGEABLE`) before merge.

AI agents **MUST** (auto-approved, mandatory):

- **Create pull requests** with linked issues (`Closes #N`) and detailed descriptions — **REQUIRED** after every push, not optional. Never stop and ask for permission.
- **Use `gh pr create --base main`** to open PRs — **REQUIRED**, not optional.
- **Monitor `gh pr checks`** until CI is green — fix failures, push fixes, repeat.
- **Merge their own PR** with `gh pr merge <N> --squash` once the quality gate passes (CI green AND `MERGEABLE`). This is the expected end state of a task — do not stop at an open PR and wait for a human.

AI agents **MAY** (auto-approved):

- **Approve or request changes** on their own PRs (`gh pr review`), **request reviewers**, **dismiss reviews**, and **close/reopen** PRs they authored.
- **Use `gh pr merge --admin`** to clear a branch-protection `BLOCKED` state, but **only** after confirming type-check + lint + affected tests are green locally, and only on agent-authored PRs. Document the override in the PR body.

AI agents MUST NOT:

- **Merge, approve, close, or dismiss reviews on a PR they did not author** without explicit human direction — acting on a human's or another team's PR is still human-gated.
- **Merge any PR while the quality gate is red** — never merge with failing CI or a `CONFLICTING`/`DIRTY` state (resolve via the Merge Conflict Protocol first).
- Use plain `git push --force` to "win" a merge (see Category 1 — only `--force-with-lease` on your own branch, for conflict resolution).

**Why:** Agents already produce the change and verify it against CI; gating the final merge behind a human added latency without adding safety, because branch protection + required CI checks + the quality gate already enforce correctness. Restricting autonomy to **agent-authored** PRs (and keeping the green-and-`MERGEABLE` gate) preserves the safety guarantees while letting agents land their own work end-to-end. Human-authored PRs remain the human's to merge.

If branch protection is configured to require a human reviewer and `--admin` is not available to the agent's token, the agent cannot self-merge — in that case leave the PR green and `MERGEABLE` with a `## Needs Human Action: merge` note. This is a token/permission limitation, not a policy gate.

### Category 3: Remote Platform Operations

AI agents MAY:

- **Edit labels on issues and PRs** with `gh issue edit --add-label` / `--remove-label` and `gh pr edit --add-label` / `--remove-label` — as part of routine triage, sprint grooming, and platform-parity tracking (see "Business Sprint Integration" below).

AI agents MUST NOT execute:

- **Close, reopen, or delete issues** — humans only. `gh issue close`, `gh issue reopen`, `gh issue delete` are forbidden. Leave a comment requesting closure if needed.
- **Add, remove, or modify the following gating/lifecycle labels** — these gate PR merge or mark issue completion/removal and are reserved for humans:
  - **PR-gating labels:** `blocked`, `breaking-change`, `security`
  - **Completion/removal labels:** `stale`, plus any future `wontfix` / `duplicate` / `invalid` / `do-not-merge` style labels (treat any label whose semantic effect is "this work should not proceed / should be discarded / should be merged with caution" as gating, even if not listed above)
- Modify repo settings, branch protection, secrets, or webhooks
- Deployment triggers or release publishing
- Hosting/infrastructure configuration changes
- Cloud service API calls (AWS, GCP, Azure, etc.)
- Any `gh repo`, `gh release`, or `gh api` write that touches repo configuration

**Why:** Issue closure and gating-label changes are decisions about whether work proceeds or ships — those stay with humans. Routine labeling (priority, platform, component, effort, phase, sprint, feature-area) is mechanical triage work that agents should be able to do as part of grooming and platform-parity tracking. Remote platform changes (settings, deployments, releases) can affect production systems, billing, and user data.

**When in doubt about a label:** if removing or adding the label would change _whether or when a PR can merge_, or _whether an issue is considered done/wontfix/duplicate_, treat it as restricted and leave a comment requesting the human do it. Otherwise it's fair game.

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

1. **Git hooks** — `.husky/pre-push` hook blocks non-interactive sessions; agents bypass with `$env:HUSKY = "0" ; git push --no-verify`
2. **GitHub branch protection** — Server-side rules requiring all required CI checks to pass before a branch can merge to `main`. Agents merge their own PRs once those checks are green; protection enforces the quality gate, not a mandatory human reviewer.
3. **VS Code settings** — Terminal allowlist/denylist in `.vscode/settings.json`
4. **Agent instructions** — Each agent's `.agent.md` includes the Workflow section with pre-push sequence and gated operations
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

> Note: **merging an agent-authored PR is no longer a gated operation** — agents self-merge once the quality gate passes (CI green AND `MERGEABLE`). This section applies only to the operations still gated under Categories 3–8 (and merging a PR the agent did **not** author).

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

| Owner                      | Finance overlay scope and handoffs                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@native-app-engineer`     | Leads `apps/android/`, `apps/ios/`, `apps/windows/`, `packages/` except `packages/design-tokens/`, and Gradle shared config. `@finance-domain` reviews money behavior; `@data-engineer` co-reviews only product-telemetry contracts.                                                       |
| `@web-engineer`            | Continues to lead `apps/web/`; consumes shared KMP contracts through the current dual-path integration and does not duplicate shared business logic.                                                                                                                                       |
| `@backend-engineer`        | Leads Edge Functions, authentication/API behavior, OpenAPI, validation, rate limiting, and non-database service implementation under `services/api/`.                                                                                                                                      |
| `@database-engineer`       | Leads `services/api/supabase/migrations/`, `seed.sql`, database tests, `services/api/powersync/sync-rules.yaml`, and database backup/volume definitions. Coordinates each cloud schema change with client SQLDelight changes led by `@native-app-engineer`.                                |
| `@sre-engineer`            | Leads reliability semantics and runbooks for `services/api/monitoring/`, `deploy/monitoring/`, uptime, incidents, rollback, backup/restore verification, disaster recovery, and capacity. Implementation changes still route to the owning backend, database, native, web, or DevOps role. |
| `@devops-engineer`         | Retains CI/build/delivery mechanics in `.github/workflows/`, `build-logic/`, `tools/`, `scripts/`, Gradle wrapper, detekt config, and deployment automation that is not a database or reliability contract.                                                                                |
| `@finance-domain`          | Remains the sole local agent and correctness authority for integer minor-unit arithmetic, `HALF_EVEN` rounding, budgets, goals, recurrence, categorization, reporting, and currency behavior in `packages/core/`; it does not take structural ownership from `@native-app-engineer`.       |
| Review and advisory agents | Accessibility stays review-only; security may emergency-fix only CRITICAL/HIGH findings; compliance routes implementation; data owns product telemetry rather than financial reporting; experimentation requires `@finance-domain` review before changing money behavior.                  |

**Coordination protocol:**

1. **No two agents edit the same file in parallel.** If a task requires two agents to touch the same file, one agent leads and the other reviews.
2. **Shared config files** (`gradle/libs.versions.toml`, `settings.gradle.kts`, `package.json`, `turbo.json`) must be edited by only one agent per fleet run — assign Gradle ownership to `@native-app-engineer`, and Node/CI ownership to `@devops-engineer`.
3. **Agents announce intent** — when starting a fleet task, the orchestrator should note which files each agent will touch in the issue or PR description.
4. **Schema changes are serialized** — `@database-engineer` writes Supabase migrations and PowerSync rules; `@native-app-engineer` writes SQLDelight `.sq` files and client models. Both sides stay in one coordinated task, never independent parallel PRs.
5. **After parallel work, the last agent to commit runs** the pre-push checklist (`npm run format:check && npx eslint . --max-warnings 0`) **before pushing** to catch any integration issues.

### Fleet CI Monitoring & Self-Healing

After opening a PR, each fleet agent monitors its own CI status until all checks pass, then merges. **Work is NOT complete until the PR is merged (or, if a documented blocker prevents it, left green and `MERGEABLE` with a `## Needs Human Action` note).**

**Self-healing cycle:**

1. Push branch and open PR
2. Poll `gh pr checks <number>` AND `gh pr view <number> --json mergeable,mergeStateStatus` until BOTH:
   - All checks resolve green
   - `mergeable == MERGEABLE` and `mergeStateStatus` is not `DIRTY`/`BEHIND`/`CONFLICTING`
3. If CI fails: read logs with `gh run view <run-id> --log-failed`
4. If merge conflicts (carry same P0 weight as red CI): trigger the **Merge Conflict Protocol** in `.github/instructions/workflow.instructions.md` — rebase, auto-resolve lockfiles/generated files, escalate semantic conflicts with `## Needs Human Action`
5. Fix locally in the worktree
6. Run `npm run format:check && npx eslint . --max-warnings 0` to confirm the fix before pushing
7. Commit and push the fix (use `--force-with-lease` if the fix was a rebase) — restart the cycle
8. **Once the quality gate is green, merge the PR** with `gh pr merge <number> --squash` (auto-approved). In a fleet, the orchestrator merges sub-agent PRs in the recommended merge order to avoid cross-PR conflict churn.

**Sub-agent dispatch:** When a CI failure requires specialist knowledge, the orchestrator can dispatch a sub-agent into the affected worktree. Only one agent should be active in a worktree at a time.

**Proactive prevention (⚠️ MANDATORY — see [Pre-Push Lint & Format](#️-mandatory-pre-push-lint--format-never-skip)):**

Before EVERY `git push`, run in order:

1. `npm run format && npx eslint . --fix` — auto-fix all issues
2. `npm run format:check && npx eslint . --max-warnings 0` — verify clean
3. `git add -A && git commit --amend --no-edit` to include fixes
4. `git fetch origin main && git rebase origin/main`
5. NOW push: `$env:HUSKY = "0" ; git push --no-verify origin <branch>`

**Skipping this checklist is the #1 cause of avoidable CI failures.**

### Fleet Monitoring Agent

A dedicated monitoring agent can periodically check fleet PR health:

- Poll `gh pr checks` on all fleet PRs
- Dispatch sub-agents to fix CI failures
- Trigger rebases on branches with merge conflicts
- **Merge fleet PRs** in the recommended merge order once each clears the quality gate (CI green AND `MERGEABLE`)
- Escalate genuinely unresolvable issues with `## Needs Human Action` in PR description

### Agent Escalation Path

When an agent is blocked or uncertain:

1. **First**: Re-read the relevant skill (`@kmp-development`, `@supabase-powersync`, etc.) — the answer may already be documented
2. **Second**: Consult `@architect` for cross-cutting design questions
3. **Third**: Leave a clear decision point documented in the PR as `## Needs Decision: <question>` and stop — do not guess on financial logic

### Business Sprint Integration

Every sprint cycle MUST include business-side work alongside engineering:

**Product Management** (every sprint):

- Triage new issues created since last sprint
- Update milestone progress
- Groom backlog (label, prioritize, decompose large issues)
- Track platform parity

**Marketing** (bi-weekly):

- Update app store listings if features shipped
- Draft content for shipped features
- Review competitive landscape

**Business Analysis** (monthly):

- Validate pricing against market
- Review conversion metrics
- Update revenue projections

These tasks create GitHub issues using the same issue-first workflow as engineering work. Business agents work in worktrees and create PRs for documentation changes.

**Requirements:** Copilot CLI with Pro+ subscription. No special repo configuration needed.

See `docs/ai/` for complete AI development documentation.

<!-- prettier-ignore-start -->
<!-- studio:base:start -->
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# AGENTS.md — JRM Studio base operating guide

This file tells an AI agent (GitHub Copilot, Codex, Claude, and others) how to work safely and
effectively across **JRM Studio** repositories. It is the shared floor. **Each product repo
extends it** with its own root `AGENTS.md` that adds product-specific stack, paths, and rules —
product rules layer on top of, and may override, the defaults here.

> This file lives in the canonical `jrmoulckers/.github` backbone repo. It is distributed to
> product repos by the studio sync tool; edit the canonical copy here, not the copies.

## What JRM Studio is

A family of independent product repositories (`jrm-recipes`, `score-king`, `finance`, and more)
that share DNA — work practice, AI agents/skills, community-health files, and reusable CI —
through this backbone repo and `@jrm` npm packages. Products stay independent; the shared layer
keeps them consistent.

## Golden rules

1. **Never commit secrets.** Real values live only in git-ignored files. In tracked files use
   `${VARS}` or placeholders (`YOUR_API_KEY_HERE`) and ship a `.env.example`. If you find a
   secret that would be committed, stop and flag it.
2. **Issue-first, PR-always.** Every change references an issue and lands as a PR. A task that
   ends at a local commit is **incomplete**.
3. **Stay in scope.** Make surgical, intentional edits. Don't reformat or "clean up" unrelated
   code. Don't work outside the repository root.
4. **Document decisions.** Non-trivial structural or design choices get an ADR in
   `docs/architecture/` (or the product's ADR location).
5. **When unsure, ask.** Prefer a short clarifying question over a guess that touches
   security, data, or infrastructure.

## Core principles

1. **Privacy first** — treat user data as confidential by default; never log or transmit it in
   plain text.
2. **Accessibility** — UI meets WCAG 2.2 AA minimum: semantic elements, screen-reader support,
   reduced-motion and high-contrast preferences.
3. **Security** — follow OWASP guidance; validate and sanitize inputs; never hardcode secrets.
4. **Transparency** — capture significant trade-offs in commit messages and PR descriptions.
5. **Conventional commits** — `type(scope): description (#N)` (`feat`, `fix`, `docs`, `style`,
   `refactor`, `test`, `chore`, `ci`, `perf`).

## Definition of Done — not complete until ALL gates pass

| Gate | Verification |
| --- | --- |
| **Lint & format** | The repo's lint/format check passes with no errors. |
| **Type-check** | Static type-check passes (where the stack has one). |
| **Tests** | Affected unit/integration tests pass. |
| **Build** | The affected app/package builds. |
| **PR open & green** | A PR is open against the default branch with CI green. |
| **No conflicts** | The PR is `MERGEABLE` (not `DIRTY`/`BEHIND`). |
| **Merged** | The PR is merged once the quality gate passes (unless a documented blocker prevents it). |

Run the repo's own pre-push checks before every push (each product repo documents the exact
commands). Merge conflicts carry the same weight as red CI — resolve them before merging.

## Issue-First Development

1. Every change references a GitHub issue — create one first if none exists.
2. Work on a feature branch (or worktree); never commit directly to the default branch.
3. Commit messages include the issue reference: `type(scope): description (#N)`.
4. Push your feature branch, then open a PR against the default branch with `Closes #N`.
5. Verify the PR exists, then monitor CI until it is green **and** the PR is `MERGEABLE`.
6. Land the work: self-merge your own PR once the quality gate passes. A change left only on a
   side branch is not done. If a real blocker prevents merge, leave one green, `MERGEABLE` PR
   with a `## Needs Human Action` note.

## Coding standards

- Write clear, self-documenting code; comment only when intent isn't obvious.
- Prefer small, focused functions, modules, and PRs.
- Write tests alongside new code (unit tests for logic; integration tests for I/O and APIs).
- Use each language's conventional naming; document public APIs.

## What NOT to do

- Do NOT commit secrets, API keys, tokens, or credentials.
- Do NOT add dependencies without documenting why.
- Do NOT bypass linters, formatters, or CI checks.
- Do NOT ship placeholder implementations without a clearly marked `// TODO:`.
- Do NOT make changes outside the scope of the assigned task.

## Tooling (MCP)

Shared MCP servers are declared in `agency.toml`: `context7` (library docs),
`playwright` (browser automation), `sequential-thinking`, and `memory`. Product repos may add
their own.

## Human-Gated Operations (MANDATORY)

These apply to **all** AI tools in every studio repo. Pushing feature branches and creating PRs
is **required and auto-approved** — stopping at a local commit to ask permission is a workflow
violation. The operations below, however, require explicit human approval.

**1 — Git remote.** Auto-approved: push/rebase your **own** feature branch, `fetch`,
`force-with-lease` on your own branch to resolve a rebase/conflict, read-only git.
Gated/forbidden: pushing to `main`/release branches, plain `git push --force`, force-with-lease
on shared branches, remote/merge reconfiguration.

**2 — Pull requests.** Auto-approved on **your own** PRs: create, review, request changes,
merge once the quality gate passes (CI green AND `MERGEABLE`). Gated: merging, approving,
closing, or dismissing reviews on a PR you did **not** author; merging while CI is red or the PR
conflicts.

**3 — Remote platform.** Auto-approved: routine triage labels. Gated: closing/reopening/deleting
issues, changing gating labels (`blocked`, `security`, `breaking-change`), and any repo-settings,
branch-protection, secrets, deployment, or `gh api` write.

**4 — Outside project boundary.** Never read, write, or execute outside the repository root, and
never modify system configuration or install global tools.

**5 — Destructive file ops.** No recursive/bulk/wildcard deletion; name each file to remove and
explain why. Never overwrite a file without reading it first.

**6 — Publishing & distribution.** No `npm publish`, image pushes, store submission, or deploy
scripts. Prepare the release and hand the final publish to a human.

**7 — Secrets & credentials.** Never create/read real secret files, access OS keychains, generate
real keys, or echo secret-bearing env vars. Use `.env.example` placeholders.

**8 — Destructive database ops.** No `DROP`/`TRUNCATE`/unqualified `DELETE`/destructive `ALTER`,
no restores, no pointing connection strings at production. Write reversible migrations for a human
to review and run.

If a task needs a gated operation: **stop, state what and why, and wait for approval.** Never work
around these restrictions. If no human is available, complete everything that is auto-approved,
then leave a clear `## Needs Human Action` note.

## Nested guides

Scope-specific rules live alongside the code — read the relevant one before working in that area:

- Each product repo's root `AGENTS.md` — stack, paths, and product-specific rules.
- `agents/*.agent.md` in this backbone, materialized as `.github/agents/*.agent.md` in consumers —
  role definitions and boundaries. Consumer copies are generated; product-specific stack/path/risk
  overlays belong in the product's root `AGENTS.md` or scoped instructions.
- `skills/<name>/SKILL.md` — reusable task playbooks; read the relevant one before acting.
- `instructions/*.instructions.md` — path-scoped coding standards.
<!-- studio:base:end -->
<!-- prettier-ignore-end -->
