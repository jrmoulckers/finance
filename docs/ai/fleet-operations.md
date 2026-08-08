# Fleet Operations — Finance Monorepo

This document describes how the AI agent fleet operates in parallel, including dispatch patterns, CI monitoring, self-healing workflows, and the coordination model.

> **Related docs:** [Workflow](workflow.md) · [Worktrees](worktrees.md) · [Agents](agents.md) · [Restrictions](restrictions.md) · [AGENTS.md](../../AGENTS.md)

---

## Table of Contents

- [Overview](#overview)
- [Branch & Merge Policy (MANDATORY)](#branch--merge-policy-mandatory)
- [Fleet Dispatch Pattern](#fleet-dispatch-pattern)
- [Worktree Isolation Model](#worktree-isolation-model)
- [File Ownership Rules](#file-ownership-rules)
- [CI Monitoring and Self-Healing](#ci-monitoring-and-self-healing)
- [Merge Conflict Resolution](#merge-conflict-resolution)
- [Fleet Coordination Rules](#fleet-coordination-rules)
- [Autonomous Operation Procedures](#autonomous-operation-procedures)
- [Human Handoff Points](#human-handoff-points)
- [Fleet Health Monitoring](#fleet-health-monitoring)
- [Post-Merge Cleanup](#post-merge-cleanup)
- [Failure Modes and Recovery](#failure-modes-and-recovery)
- [Examples](#examples)

---

## Overview

Fleet mode allows multiple AI agents to work on different aspects of a task simultaneously. Each agent operates in its own git worktree with its own branch, creating independent PRs (Pull Requests) that can be reviewed and merged separately.

The key principle: **agents work in parallel, but never on the same files.** File ownership is strictly enforced by convention, and coordination rules prevent conflicts.

### When to use fleet mode

Fleet mode works best for tasks with **naturally separable concerns**:

- Code implementation + tests + documentation
- Backend schema + KMP models + platform UI
- Multiple platform-specific implementations of the same feature
- CI/CD pipeline + infrastructure + documentation updates

Fleet mode is **not appropriate** for tasks where the work is tightly coupled and requires frequent back-and-forth coordination (e.g., iterating on a single API contract that multiple agents consume simultaneously).

---

## Branch & Merge Policy (MANDATORY)

> **Why this section exists:** A multi-session fleet program once accumulated ~100 feature PRs onto a stale, misleadingly-named feature branch (`feat/2030-account-deletion`) instead of `main`. Nothing auto-deployed (staging deploys from `main`), `Closes #` never fired, and reconciling the divergence later required resolving 58 conflicts. **This must never happen again.** The rules below are non-negotiable.

### Rule A — The base branch for every fleet PR is `main`

- Every `gh pr create` **MUST** pass `--base main`. Do not omit `--base` (it defaults to the repo default, which is correct only by luck) and **never** point fleet PRs at a long-lived feature branch.
- The "latest green commit" staging deploy and `Closes #N` auto-close **only work when PRs merge into `main`** (the default branch). Merging into any other base silently breaks both.

### Rule B — Integration branches are short-lived and single-PR

You may use one short-lived integration branch **only** when a set of PRs is genuinely dependent and must land together. If you do:

1. Name it `release/<program>` or `integration/<program>` — **never** reuse an unrelated feature branch.
2. It carries **exactly one** tracking PR to `main`.
3. It is **reconciled with `origin/main` and merged to `main` within the same work session.** A program is **not done** while it lives only on a side branch.
4. Prefer **not** using one at all: independent PRs straight to `main` (merged as they go green) are the default.

### Rule C — Reconcile with `main` before the final merge (orchestrator's job)

- Before declaring a fleet complete, the orchestrator **MUST** merge `origin/main` into the work and resolve all conflicts, then validate green (type-check + lint + the conflict-affected test areas).
- The longer a branch lives off `main`, the worse the conflicts. Reconcile **early and often**; do a final reconcile immediately before merge.

### Rule D — "Done" means it's on `main` (merged by the agent once the quality gate passes)

- A fleet task is **not complete** while its work exists only on a branch. The Definition of Done is: **merged to `main`** by the authoring agent or orchestrator (`gh pr merge <n> --squash`) once CI is green AND the PR is `MERGEABLE`. Agents have full autonomy to merge the PRs they author — no human click required.
- The only acceptable not-yet-merged end state is a PR to `main` that is `MERGEABLE` and green but blocked by a token/branch-protection limit the agent's permissions can't clear — in which case leave a clear `## Needs Human Action: merge` note.
- If you closed issues against a non-default base (so auto-close didn't fire), you **MUST** close them explicitly **and** state that in the summary.

### Rule E — Landing on `main` is the deploy action

- Merging to `main` **auto-triggers the staging deploy** (`deploy-staging.yml`, `workflow_run` after _Web CI_ + _Lint & Format_ pass on `main`). Treat every merge to `main` with that weight.
- **Production is never automatic** — it requires `workflow_dispatch` + human approval via the `production` GitHub environment. Agents do not deploy to production.
- See [branch-protection.md](../../.github/branch-protection.md) and [deployment-pipeline.md](../deployment-pipeline.md) for the gating and environments.

### Rule F — Merge mechanics

- Use `gh pr merge <n> --squash` for a single feature PR (clean `main` history), or `--merge` for an integration branch that should preserve its feature commits.
- Branch protection may report `MERGEABLE (BLOCKED)` (required checks/reviews). Only use `--admin` to override when you have **explicitly verified locally** (type-check + lint + the affected tests are green) and the block is protection-state, not a real CI failure. Document the override in the merge summary.

---

## Fleet Dispatch Pattern

Fleet dispatch follows a five-step lifecycle:

```
┌──────────────┐
│  1. Analyze  │  Orchestrator breaks the task into separable subtasks
└──────┬───────┘
       │
┌──────▼───────┐
│  2. Assign   │  Each subtask gets a GitHub issue and an agent assignment
└──────┬───────┘
       │
┌──────▼───────┐
│  3. Dispatch │  Agents create worktrees and begin work in parallel
└──────┬───────┘
       │
┌──────▼───────┐
│  4. Monitor  │  Each agent monitors its own PR; orchestrator watches fleet health
└──────┬───────┘
       │
┌──────▼───────┐
│  5. Complete │  All PRs clear the quality gate; the orchestrator merges them to `main`
└──────────────┘
```

### Step 1: Analyze

The orchestrator (human or coordinating agent) examines the task and identifies:

- Which subtasks can be executed independently
- Which agents should own which subtask
- Whether any subtasks have dependencies (must complete in order)
- Which shared config files are affected and who owns them

### Step 2: Assign

For each subtask:

1. A GitHub issue is created (or an existing issue is referenced)
2. The issue is labeled with the appropriate agent type (`agent:android`, `agent:kmp`, etc.)
3. Dependencies between subtasks are documented in the issue body

### Step 3: Dispatch

Each agent:

1. Checks for an existing worktree matching the issue: `git worktree list`
2. Creates a new worktree if none exists:
   ```bash
   git worktree add ../wt-[agent]-[type/desc-issue#] -b [type/desc-issue#]
   ```
3. Begins work in its worktree independently

### Step 4: Monitor

Each agent is responsible for its own PR lifecycle (see [CI Monitoring and Self-Healing](#ci-monitoring-and-self-healing)). The orchestrator periodically checks fleet-wide status.

### Step 5: Complete

Work is complete when:

- All PRs have passing CI — verify with `gh pr checks <number>` (see [CI Monitoring](ci-monitoring.md))
- No merge conflicts exist — verify with `gh pr view <number> --json mergeable`
- Each PR has been **merged to `main`** by the authoring agent or the orchestrator once it clears the quality gate (`gh pr merge <number> --squash`) — agents have full autonomy to merge the PRs they author
- If a token/branch-protection limit blocks self-merge, the PR is left green and `MERGEABLE` with a `## Needs Human Action: merge` note and the human is notified

---

## Worktree Isolation Model

Every agent in a fleet gets its own git worktree. This provides:

- **Branch isolation** — each agent has its own branch; no conflicts during development
- **Filesystem isolation** — agents can't accidentally edit each other's files
- **Independent CI** — each PR triggers its own CI run

### Naming convention

```
wt-[agent-type]-[branch-name]
```

Where `branch-name` follows: `type/description-issue#`

**Fleet example** for implementing transaction categorization (#500):

```
wt-native-feat-category-engine-500     ← @native-app-engineer: shared + native implementation
wt-web-feat-category-ui-503            ← @web-engineer: Web UI
wt-database-feat-category-sync-505     ← @database-engineer: schema + sync rules
wt-docs-feat-category-docs-506        ← @docs-writer: documentation
```

Each worktree maps to exactly one branch, one agent, and one PR.

For full worktree lifecycle details, see [worktrees.md](worktrees.md).

---

## File Ownership Rules

In fleet mode, **no two agents edit the same file in parallel.** Ownership is assigned by directory:

| Agent                     | Primary ownership                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@native-app-engineer`    | `apps/android/`, `apps/ios/`, `apps/windows/`, shared `packages/`, Gradle config                                                               |
| `@backend-engineer`       | Edge Functions, Auth/API behavior, OpenAPI, validation, rate limiting                                                                          |
| `@database-engineer`      | Supabase migrations/RLS/tests/seed, PowerSync rules, database backup/volume definitions                                                        |
| `@sre-engineer`           | SLOs, monitoring semantics, incidents, capacity, rollback, recovery verification                                                               |
| `@web-engineer`           | `apps/web/`                                                                                                                                    |
| `@design-engineer`        | `packages/design-tokens/`, generated token files                                                                                               |
| `@devops-engineer`        | `.github/workflows/`, `build-logic/`, `tools/`                                                                                                 |
| `@docs-writer`            | `docs/`, root `*.md` files                                                                                                                     |
| `@security-reviewer`      | Emergency fixer — implements CRITICAL/HIGH security fixes in any directory (with owning-agent coordination); review-only for non-security code |
| `@accessibility-reviewer` | Review-only — never edits production code; routes fixes to the owning platform agent                                                           |
| `@qa-tester`              | Read-only on code; orchestrates testing sessions, files issues                                                                                 |
| `@ai-ops-engineer`        | `.github/agents/`, `.github/skills/`, `.github/instructions/`, prompts/evals, AI manifest                                                      |
| `@release-manager`        | `.changeset/`, version/release-notes, store-submission prep                                                                                    |
| `@performance-engineer`   | `performance.budget.json`, profiling/benchmark configs                                                                                         |
| `@data-engineer`          | Metrics pipelines, event schemas, analytics configs                                                                                            |
| `@localization-engineer`  | i18n resources, localization tooling, financial terminology                                                                                    |

### Shared configuration files

Some files are used by multiple agents but must only be edited by **one agent per fleet run**:

| File                        | Default owner          | Notes                                     |
| --------------------------- | ---------------------- | ----------------------------------------- |
| `gradle/libs.versions.toml` | `@native-app-engineer` | Version catalog — all Gradle dependencies |
| `settings.gradle.kts`       | `@native-app-engineer` | Module includes                           |
| `package.json`              | `@devops-engineer`     | Node dependencies and scripts             |
| `turbo.json`                | `@devops-engineer`     | Turborepo pipeline configuration          |

If multiple agents need changes to the same shared config, one agent makes all changes and the others document what they need in their PR description under `## Needs Shared Config Change`.

### Schema serialization

Database schema changes must be serialized — never split across independent agents:

1. `@database-engineer` writes Supabase migrations, RLS policies, and PowerSync rules
2. `@native-app-engineer` writes matching SQLDelight schemas (`.sq` files) and client models
3. These two agents coordinate in one serialized task so cloud and client schemas stay aligned

---

## CI Monitoring and Self-Healing

Each agent owns its PR lifecycle from push through merge.

### Monitoring loop

After pushing a branch and opening a PR, the agent enters a monitoring loop:

```
┌────────────────────┐
│  Push branch       │
│  Open PR           │
└────────┬───────────┘
         │
    ┌────▼────┐
    │  Poll   │◄────────────────────────┐
    │  checks │                         │
    └────┬────┘                         │
         │                              │
    ┌────▼────────────┐                 │
    │  All green?     │                 │
    │  Yes → MERGE    │                 │
    │  No  → continue │                 │
    └────┬────────────┘                 │
         │                              │
    ┌────▼────────────────┐             │
    │  Read failure logs  │             │
    │  gh run view        │             │
    │    --log-failed     │             │
    └────┬────────────────┘             │
         │                              │
    ┌────▼────────────────┐             │
    │  Fix locally        │             │
    │  Run format +       │             │
    │    lint check       │             │
    └────┬────────────────┘             │
         │                              │
    ┌────▼────────────────┐             │
    │  Commit + push      │─────────────┘
    └─────────────────────┘
```

### Self-healing procedure

When CI fails:

1. **Read logs**: `gh run view <run-id> --log-failed`
2. **Diagnose**: Identify the failing step (format, lint, type-check, test, build)
3. **Fix locally**:
   - Formatting issues: `npm run format` (auto-fixable)
   - Lint issues: `npx eslint . --fix` (partially auto-fixable)
   - Type errors: manual code fix
   - Test failures: manual code fix
4. **⚠️ Run the full pre-push workflow before re-pushing**:
   ```powershell
   npm run format
   npx eslint . --fix
   npm run format:check && npx eslint . --max-warnings 0   # MUST pass
   ```
5. **Commit the fix**: `git add -A && git commit -m "fix: resolve CI failure (#N)"`
6. **Push and re-poll**: `$env:HUSKY = "0" ; git push --no-verify origin <branch>` → restart the monitoring loop

> **⚠️ Never re-push without running `npm run format` → `npx eslint . --fix` → `npm run format:check && npx eslint . --max-warnings 0` first.** This is the most common cause of repeated CI failures.
> Remote CI is the source of truth — see [CI Monitoring](ci-monitoring.md).

### Merging after green (full autonomy)

Once the quality gate passes — CI green **AND** `gh pr view <number> --json mergeable,mergeStateStatus` shows `MERGEABLE` (not `DIRTY`/`BEHIND`/`CONFLICTING`) — the agent **merges its own PR**:

```powershell
gh pr merge <number> --squash
```

This is auto-approved; agents have full lifecycle autonomy on the PRs they author and do not wait for a human to click merge. If branch protection reports `MERGEABLE (BLOCKED)` and the block is protection-state (not a real CI failure), use `--admin` only after verifying type-check + lint + affected tests are green locally, and document the override in the merge summary. If `--admin` is unavailable to the agent's token, leave the PR green and `MERGEABLE` with a `## Needs Human Action: merge` note. Do **not** merge a PR you did not author without explicit human direction.

### When self-healing fails

If the agent cannot resolve a CI failure after two attempts:

1. Stop attempting fixes
2. Document the failure in the PR description under `## Needs Help: CI Failure`
3. Include the error message and what was attempted
4. Leave the PR open for human review

For complex failures in fleet mode, the orchestrator may dispatch a specialized sub-agent to the affected worktree.

---

## Merge Conflict Resolution

Merge conflicts arise when multiple PRs modify related areas. In fleet mode, this is rare if file ownership rules are followed, but can happen with shared generated files.

### Conflict detection

Agents should proactively check for conflicts:

```bash
git fetch origin main
git rebase origin/main
```

If conflicts appear:

1. Resolve the conflicts in the worktree
2. Validate: `npm run format:check && npx eslint . --max-warnings 0`
3. Push: `$env:HUSKY = "0" ; git push --no-verify origin <branch>`
4. Restart the monitoring loop

### Prevention strategies

- **Rebase early and often** — each agent should rebase on `origin/main` before pushing
- **Merge order matters** — if PR A and PR B touch adjacent areas, merge A first, then have B rebase
- **Communicate via PR comments** — if an agent detects a potential conflict with another fleet PR, it should comment on both PRs

> ✅ `git push --force-with-lease` on the agent's **own** feature branch is **auto-approved** when used to re-push after a clean rebase/conflict resolution (see [restrictions.md § 1](restrictions.md)). It refuses to overwrite commits it hasn't seen, so it is safe for this narrow use. Plain `git push --force` remains forbidden, and `--force-with-lease` on a shared/integration branch (or a branch the agent does not own) still requires human approval.

---

## Fleet Coordination Rules

These rules are mandatory for all agents operating in fleet mode:

### Rule 1: One file, one agent

No two agents edit the same file in parallel. If two agents need to modify the same file, coordinate: one agent makes both changes, or the changes are serialized.

### Rule 2: Shared config has a single owner

Shared configuration files (`gradle/libs.versions.toml`, `package.json`, `turbo.json`, `settings.gradle.kts`) are assigned to one agent per fleet run. Other agents document their needed config changes in their PR description.

### Rule 3: Schema changes are serialized

Database schema work flows in one direction:

1. `@database-engineer` writes the Supabase migration, RLS, and PowerSync rules
2. `@native-app-engineer` aligns the SQLDelight schema and client models
3. Native and web surfaces consume the shared contract

Never split schema changes across independently running agents.

### Rule 4: Last agent runs integration check

The last agent to commit in a fleet run should execute `npm run format:check && npx eslint . --max-warnings 0` to catch any integration issues that emerge from the combined changes.

### Rule 5: No guessing on financial logic

If any agent encounters a financial logic decision during fleet work, it must:

1. **Stop** — do not implement a guess
2. **Document** — add `## Needs Decision: <question>` to the PR
3. **Wait** — a human or `@finance-domain` agent must approve the approach

### Rule 6: Each agent monitors its own PR

Agents don't rely on a central monitor. Each agent polls `gh pr checks` on its own PR and self-heals CI failures independently.

### Rule 7: Every PR targets `main` — programs land on `main`, not side branches

All fleet PRs use `--base main` (see [Branch & Merge Policy](#branch--merge-policy-mandatory)). The orchestrator is responsible for reconciling with `origin/main` and ensuring the program is **merged to `main` (or has a green, mergeable PR to `main`) before declaring the fleet done.** Accumulating a multi-PR program on a long-lived feature branch is a process failure — it breaks staging auto-deploy and `Closes #N` auto-close.

---

## Wave 3 Learnings

Lessons from the third fleet deployment wave:

### Branch policy: programs must land on `main` (incident)

A later multi-session program accumulated ~100 feature PRs onto a stale, misleadingly-named feature branch instead of `main`. Consequences: **no staging auto-deploy** (staging deploys from `main`), **`Closes #N` never auto-fired** (only works on the default branch), and a later reconcile required resolving **58 conflicts** across core files. **Fix codified:** see [Branch & Merge Policy](#branch--merge-policy-mandatory) and [Rule 7](#rule-7-every-pr-targets-main--programs-land-on-main-not-side-branches). Orchestrators must target `main` for every PR and land the program on `main` within the work session.

### Doc agents need human commit

Documentation-only agents (`@docs-writer`) often lack shell access in their runtime environment. They can edit files but cannot run git commands or push. **Workaround:** The human (or an agent with shell access) commits and pushes the doc agent's changes on its behalf.

### Worktree cleanup script

Stale worktrees accumulate after fleet runs when agents crash or sessions timeout. Use the cleanup script:

```bash
node tools/cleanup-worktrees.js
```

This script compares active worktrees against open PR branches and suggests removal of orphans.

### Proven fleet dispatch prompt template

Include this block in every agent dispatch to guarantee CI compliance:

```
## ⚠️ MANDATORY Pre-Push Workflow (CI WILL FAIL without these)

Before EVERY push, you MUST complete ALL steps IN ORDER:

1. **Auto-fix formatting**: `npm run format`
2. **Auto-fix lint**: `npx eslint . --fix`
3. **Verify**: `npm run format:check && npx eslint . --max-warnings 0` (MUST pass)
4. **Stage fixes**: `git add -A`
5. **Commit** (or amend): `git commit --amend --no-edit`
6. **Push**: `$env:HUSKY = "0" ; git push --no-verify origin <branch-name>`
7. **Monitor CI**: `gh pr checks <number>` — poll until green

### Common Pitfalls
- Markdown files need Prettier too! `npm run format` formats .md files
- ESLint warnings are errors in CI! Remove unused imports, especially `vi` in test files
- Local type-check may fail on TS 5.9.3 — remote CI is the source of truth
- Worktrees don't share node_modules — always run `npm install` first
```

---

When agents operate in fleet mode without a human present, they follow an extended version of the standard autonomous workflow.

### Startup

1. Check for an existing worktree: `git worktree list`
2. If found, resume; if not, create one
3. Review the issue description and any referenced specifications
4. Identify files within the agent's ownership area

### During work

1. Make changes within owned directories only
2. Write tests alongside new code
3. Commit frequently with conventional commits: `type(scope): description (#N)`
4. Include issue references in every commit message

### ⚠️ MANDATORY: Pre-Push Workflow (NEVER skip)

> **🚨 This is the #1 cause of fleet CI failures. Run these commands before EVERY push.**

Every agent MUST complete these steps **in order** before pushing:

```powershell
# Step 1: Auto-fix formatting and lint issues
npm run format
npx eslint . --fix

# Step 2: Verify formatting and lint pass
npm run format:check && npx eslint . --max-warnings 0

# Step 3: If step 2 fails, fix and repeat from step 1

# Step 4: Include the fixes in your commit
git add -A && git commit --amend --no-edit

# Step 5: Sync with main
git fetch origin main
git rebase origin/main

# Step 6: Push (bypass Husky pre-push hook)
$env:HUSKY = "0" ; git push --no-verify origin <branch-name>
```

> **Remote CI is the source of truth** — not local `npm run ci:check` (which may fail on TS 5.9.3). This checklist is not optional. An agent that pushes without running these steps has not completed its pre-push workflow.

### PR creation

```bash
$env:HUSKY = "0" ; git push --no-verify origin <branch>

# ALWAYS target main as the base (see Branch & Merge Policy, Rule A).
gh pr create \
  --base main \
  --title "type(scope): description (#N)" \
  --body "## Summary
<description of changes>

## Issues
Closes #N

## Fleet Context
Part of fleet run for #<parent-issue>.
Other fleet PRs: #X, #Y, #Z

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Post-push

1. Monitor CI using `gh pr checks <number>` — poll until all checks are green (see [CI Monitoring](ci-monitoring.md))
2. Self-heal failures (see [CI Monitoring and Self-Healing](#ci-monitoring-and-self-healing))
3. Resolve merge conflicts if they arise
4. **Merge the PR** with `gh pr merge <number> --squash` once the quality gate passes (CI green AND `MERGEABLE`) — full autonomy on agent-authored PRs
5. Mark work as complete only when the PR is **merged** (or left green and `MERGEABLE` with a documented `## Needs Human Action: merge` blocker)

### Handoff

When all work is done, the agent merges its own PR (`gh pr merge <number> --squash`) once the quality gate passes — no human handoff is required to land agent-authored work. The only handoffs that remain human-gated are the operations in [Human Handoff Points](#human-handoff-points) below (and the full [restriction policies](restrictions.md)): e.g. a token/branch-protection limit that blocks self-merge, a `## Needs Decision` on financial logic, or a publish/deploy step. In those cases, leave the PR green and `MERGEABLE` with a clear note.

---

## Human Handoff Points

Fleet operations have specific points where human involvement is required. Per the project's [restriction policies](restrictions.md), agents must stop and wait at these gates:

| Operation                         | Why it's gated                                                 | Agent action                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Merge a PR you did NOT author** | Acting on a human's or another team's PR needs their direction | Leave it alone unless explicitly asked                                                                                                         |
| **Close issues**                  | Issue lifecycle is human-managed                               | Add `Closes #N` in PR body; the merge handles it                                                                                               |
| **Force-push**                    | May overwrite collaborator work                                | Document the need in PR; ask human to approve (except `--force-with-lease` on your own branch for conflict resolution, which is auto-approved) |
| **Financial logic decisions**     | Must be reviewed by a human or domain expert                   | Add `## Needs Decision` in PR; stop and wait                                                                                                   |
| **Shared config conflicts**       | Multiple agents need the same file                             | Document needed changes; let human coordinate                                                                                                  |
| **Publish/deploy**                | Releases require human sign-off                                | Prepare release; document steps; ask human to publish                                                                                          |

> **Merging your own PR is NOT a handoff point** — agents have full autonomy to merge the PRs they author once the quality gate passes (CI green AND `MERGEABLE`). See [restrictions.md § 2](restrictions.md) and the [Branch & Merge Policy](#branch--merge-policy-mandatory).

For the complete list of restricted operations, see [restrictions.md](restrictions.md).

---

## Fleet Health Monitoring

The orchestrator (or a dedicated monitoring agent) periodically checks fleet health:

### Health check procedure

```bash
# List all fleet PRs for a parent issue
gh pr list --search "fleet #<parent-issue>"

# Check each PR's CI status
gh pr checks <pr-number>
```

### Fleet status summary

The orchestrator maintains a status summary in the parent issue or a tracking comment:

```markdown
## Fleet Status

| Agent                | PR   | CI         | Conflicts | Status       |
| -------------------- | ---- | ---------- | --------- | ------------ |
| @database-engineer   | #510 | ✅ Green   | None      | Merge-ready  |
| @native-app-engineer | #511 | 🔴 Failing | None      | Self-healing |
| @web-engineer        | #513 | 🟡 Running | None      | Waiting      |
| @docs-writer         | #514 | ✅ Green   | None      | Merge-ready  |
```

### Escalation triggers

The orchestrator escalates to a human when:

- An agent has failed CI self-healing after two attempts
- Two or more PRs have conflicting changes
- A financial logic decision is blocking progress
- The fleet has been stalled for more than 30 minutes without progress

---

## Post-Merge Cleanup

After a fleet PR is merged (by the owning agent, the orchestrator, or a human), the owning agent cleans up:

```bash
# Remove the worktree
git -C /path/to/finance worktree remove ../wt-[agent]-[branch]

# Prune the remote tracking branch (optional)
git -C /path/to/finance remote prune origin
```

### Fleet-wide cleanup

After all fleet PRs are merged:

1. Each agent removes its own worktree
2. The orchestrator verifies no stale worktrees remain: `git worktree list`
3. Stale worktrees (from abandoned work) should be documented and removed:

   ```bash
   # List stale worktrees
   git worktree list --porcelain

   # Remove a stale worktree
   git worktree remove ../wt-[name] --force
   ```

4. The parent tracking issue is updated with the final status

---

## Failure Modes and Recovery

### Agent crash or timeout

If an agent stops mid-work (crash, timeout, session end):

1. The worktree and branch persist on disk
2. A new agent session can **resume** by scanning for existing worktrees:
   ```bash
   git worktree list
   # Find: ../wt-android-feat-category-ui-501
   cd ../wt-android-feat-category-ui-501
   git status    # Understand current state
   git log -5    # See recent commits
   # Resume work...
   ```
3. Uncommitted changes may be in the working tree — the new session should review them

### Conflicting edits (ownership violation)

If two agents accidentally edit the same file:

1. The second agent to push will see a merge conflict
2. The orchestrator identifies the ownership violation
3. One agent's changes take priority (based on file ownership rules)
4. The other agent re-applies its changes on top

### CI infrastructure failure

If CI itself is down (not a code failure):

1. Agents should not repeatedly re-push
2. Wait and poll at increasing intervals (1 min, 5 min, 15 min)
3. If CI is down for more than 30 minutes, notify the human
4. Local validation (`npm run format:check && npx eslint . --max-warnings 0`) remains the baseline for format/lint — but remote CI is the source of truth

### Stale worktree from previous fleet run

If `git worktree list` shows a worktree from a previous run:

1. Check if the corresponding PR was merged: `gh pr view <number> --json state`
2. If merged: remove the worktree (`git worktree remove <path>`)
3. If abandoned: check with the human before removing — there may be uncommitted work

---

## Examples

### Example 1: Feature implementation across platforms

**Task:** Implement transaction search (#600)

**Fleet dispatch:**

| Agent                  | Subtask                          | Issue | Branch                   |
| ---------------------- | -------------------------------- | ----- | ------------------------ |
| `@native-app-engineer` | Shared search engine + native UI | #601  | `feat/native-search-601` |
| `@web-engineer`        | Web search UI                    | #604  | `feat/web-search-604`    |
| `@docs-writer`         | Update feature docs              | #606  | `docs/search-docs-606`   |

**Dependency:** The web agent waits for `@native-app-engineer` to merge the shared search contract before consuming its API. It may work against a documented expected interface and rebase when the shared PR lands.

### Example 2: Bug fix with test and docs

**Task:** Fix budget rollover calculation (#700)

**Fleet dispatch:**

| Agent                  | Subtask                                  | Issue | Branch                   |
| ---------------------- | ---------------------------------------- | ----- | ------------------------ |
| `@native-app-engineer` | Fix rollover logic + unit tests          | #700  | `fix/rollover-calc-700`  |
| `@docs-writer`         | Update rollover section in feature guide | #701  | `docs/rollover-docs-701` |

**Coordination:** The docs agent can start immediately since the feature behavior (not the code) is well-defined in the issue. Both PRs can land independently.

### Example 3: Schema change (serialized, not parallel)

**Task:** Add tags to transactions (#800)

**Serialized dispatch** (not parallel — schema must be sequential):

1. `@database-engineer` creates the Supabase migration, RLS updates, and PowerSync rule changes → PR #801
2. **Merge PR #801** (authoring agent or orchestrator) once CI is green and `MERGEABLE`
3. `@native-app-engineer` adds the SQLDelight schema and client models for tags → PR #802
4. **Merge PR #802** (authoring agent or orchestrator) once CI is green and `MERGEABLE`
5. Native and web surfaces consume the shared models → follow-up PRs as needed

---

_For the standard single-agent workflow, see [workflow.md](workflow.md). For worktree setup details, see [worktrees.md](worktrees.md). For restriction policies, see [restrictions.md](restrictions.md)._
