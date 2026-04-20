# Fleet Operations — Finance Monorepo

This document describes how the AI agent fleet operates in parallel, including dispatch patterns, CI monitoring, self-healing workflows, and the coordination model.

> **Related docs:** [Workflow](workflow.md) · [Worktrees](worktrees.md) · [Agents](agents.md) · [Restrictions](restrictions.md) · [AGENTS.md](../../AGENTS.md)

---

## Table of Contents

- [Overview](#overview)
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
│  5. Complete │  All PRs reach merge-ready state; human reviews and merges
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

- All PRs have passing CI (`gh pr checks` all green)
- No merge conflicts exist
- All PRs are marked as ready for review
- The human reviewer has been notified

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
wt-kmp-feat-category-engine-500        ← @kmp-engineer: shared business logic
wt-android-feat-category-ui-501        ← @android-engineer: Android UI
wt-ios-feat-category-ui-502            ← @ios-engineer: iOS UI
wt-web-feat-category-ui-503            ← @web-engineer: Web UI
wt-windows-feat-category-ui-504       ← @windows-engineer: Windows UI
wt-backend-feat-category-sync-505     ← @backend-engineer: sync rules
wt-docs-feat-category-docs-506        ← @docs-writer: documentation
```

Each worktree maps to exactly one branch, one agent, and one PR.

For full worktree lifecycle details, see [worktrees.md](worktrees.md).

---

## File Ownership Rules

In fleet mode, **no two agents edit the same file in parallel.** Ownership is assigned by directory:

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
| `@docs-writer`            | `docs/`, root `*.md` files                     |
| `@security-reviewer`      | Read-only — never edits production code        |
| `@accessibility-reviewer` | Read-only — never edits production code        |

### Shared configuration files

Some files are used by multiple agents but must only be edited by **one agent per fleet run**:

| File                        | Default owner      | Notes                                     |
| --------------------------- | ------------------ | ----------------------------------------- |
| `gradle/libs.versions.toml` | `@kmp-engineer`    | Version catalog — all Gradle dependencies |
| `settings.gradle.kts`       | `@kmp-engineer`    | Module includes                           |
| `package.json`              | `@devops-engineer` | Node dependencies and scripts             |
| `turbo.json`                | `@devops-engineer` | Turborepo pipeline configuration          |

If multiple agents need changes to the same shared config, one agent makes all changes and the others document what they need in their PR description under `## Needs Shared Config Change`.

### Schema serialization

Database schema changes must be serialized — never split across independent agents:

1. `@backend-engineer` writes Supabase migrations and Row-Level Security (RLS) policies
2. `@kmp-engineer` writes SQLDelight schemas (`.sq` files) to match
3. These two agents coordinate as a pair: the backend migration lands first, then the KMP schema aligns to it

---

## CI Monitoring and Self-Healing

Each agent owns its PR lifecycle from push through merge-readiness.

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
    │  Yes → DONE     │                 │
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
    │  Run npm run        │             │
    │    ci:check         │             │
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
4. **⚠️ Run the full pre-push checklist before re-pushing**:
   ```bash
   npm run format          # auto-fix Prettier
   npx eslint . --fix      # auto-fix ESLint
   npm run ci:check        # MUST be clean before pushing
   ```
5. **Commit the fix**: `git add -A && git commit -m "fix: resolve CI failure (#N)"`
6. **Push and re-poll**: `git push origin <branch>` → restart the monitoring loop

> **⚠️ Never re-push without running `npm run format` → `npx eslint . --fix` → `npm run ci:check` first.** This is the most common cause of repeated CI failures.

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
2. Validate: `npm run ci:check`
3. Force-push with lease: `git push origin <branch> --force-with-lease`
4. Restart the monitoring loop

### Prevention strategies

- **Rebase early and often** — each agent should rebase on `origin/main` before pushing
- **Merge order matters** — if PR A and PR B touch adjacent areas, merge A first, then have B rebase
- **Communicate via PR comments** — if an agent detects a potential conflict with another fleet PR, it should comment on both PRs

> ⚠️ `git push --force-with-lease` on a feature branch requires **human approval** per [restrictions.md](restrictions.md). The agent should document the need and wait for approval, or use a regular push after rebasing cleanly.

---

## Fleet Coordination Rules

These rules are mandatory for all agents operating in fleet mode:

### Rule 1: One file, one agent

No two agents edit the same file in parallel. If two agents need to modify the same file, coordinate: one agent makes both changes, or the changes are serialized.

### Rule 2: Shared config has a single owner

Shared configuration files (`gradle/libs.versions.toml`, `package.json`, `turbo.json`, `settings.gradle.kts`) are assigned to one agent per fleet run. Other agents document their needed config changes in their PR description.

### Rule 3: Schema changes are serialized

Database schema work flows in one direction:

1. `@backend-engineer` writes the Supabase migration
2. `@kmp-engineer` aligns the SQLDelight schema
3. Platform agents consume the KMP models

Never split schema changes across independently running agents.

### Rule 4: Last agent runs integration check

The last agent to commit in a fleet run should execute `npm run ci:check` to catch any integration issues that emerge from the combined changes.

### Rule 5: No guessing on financial logic

If any agent encounters a financial logic decision during fleet work, it must:

1. **Stop** — do not implement a guess
2. **Document** — add `## Needs Decision: <question>` to the PR
3. **Wait** — a human or `@finance-domain` agent must approve the approach

### Rule 6: Each agent monitors its own PR

Agents don't rely on a central monitor. Each agent polls `gh pr checks` on its own PR and self-heals CI failures independently.

---

## Autonomous Operation Procedures

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

### ⚠️ MANDATORY: Pre-Push Lint & Format Checklist (NEVER skip)

> **🚨 This is the #1 cause of fleet CI failures. Run these commands before EVERY `git push`.**

Every agent MUST complete these steps **in order** before pushing:

```bash
# Step 1: Auto-fix formatting and lint issues FIRST
npm run format          # auto-fix all Prettier formatting
npx eslint . --fix      # auto-fix all ESLint issues

# Step 2: Verify everything passes
npm run ci:check        # runs format:check + lint + type-check

# Step 3: If ci:check fails, fix remaining issues manually, then re-run:
npm run ci:check

# Step 4: Include the fixes in your commit
git add -A && git commit --amend --no-edit

# Step 5: Sync with main
git fetch origin main
git rebase origin/main

# Step 6: NOW you may push
git push origin <branch-name>
```

> **Pushing without a clean `npm run ci:check` is the #1 cause of CI failures. Agents that skip this waste CI time and create noise.** This checklist is not optional. An agent that pushes without running these steps has not completed its pre-push workflow.

### PR creation

```bash
git push origin <branch>

gh pr create \
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

1. Monitor CI with `gh pr checks <number>`
2. Self-heal failures (see [CI Monitoring and Self-Healing](#ci-monitoring-and-self-healing))
3. Resolve merge conflicts if they arise
4. Mark work as complete only when **all remote CI checks are green**

### Handoff

When all work is done and CI is green, the agent's job is finished. The PR is the handoff point. Humans review and merge.

---

## Human Handoff Points

Fleet operations have specific points where human involvement is required. Per the project's [restriction policies](restrictions.md), agents must stop and wait at these gates:

| Operation                     | Why it's gated                                 | Agent action                                          |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| **Merge PRs**                 | Humans review all code before it enters `main` | Leave PR in merge-ready state; do not merge           |
| **Close issues**              | Issue lifecycle is human-managed               | Add `Closes #N` in PR body; the merge handles it      |
| **Force-push**                | May overwrite collaborator work                | Document the need in PR; ask human to approve         |
| **Financial logic decisions** | Must be reviewed by a human or domain expert   | Add `## Needs Decision` in PR; stop and wait          |
| **Shared config conflicts**   | Multiple agents need the same file             | Document needed changes; let human coordinate         |
| **Publish/deploy**            | Releases require human sign-off                | Prepare release; document steps; ask human to publish |

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

# Check for merge conflicts
gh pr view <pr-number> --json mergeable
```

### Fleet status summary

The orchestrator maintains a status summary in the parent issue or a tracking comment:

```markdown
## Fleet Status

| Agent             | PR   | CI         | Conflicts | Status       |
| ----------------- | ---- | ---------- | --------- | ------------ |
| @kmp-engineer     | #510 | ✅ Green   | None      | Merge-ready  |
| @android-engineer | #511 | 🔴 Failing | None      | Self-healing |
| @ios-engineer     | #512 | ✅ Green   | None      | Merge-ready  |
| @web-engineer     | #513 | 🟡 Running | None      | Waiting      |
| @docs-writer      | #514 | ✅ Green   | None      | Merge-ready  |
```

### Escalation triggers

The orchestrator escalates to a human when:

- An agent has failed CI self-healing after two attempts
- Two or more PRs have conflicting changes
- A financial logic decision is blocking progress
- The fleet has been stalled for more than 30 minutes without progress

---

## Post-Merge Cleanup

After a human merges a fleet PR, the owning agent cleans up:

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
4. Local validation (`npm run ci:check`) remains the baseline — a passing local check means the code is likely correct

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

| Agent               | Subtask                      | Issue | Branch                    |
| ------------------- | ---------------------------- | ----- | ------------------------- |
| `@kmp-engineer`     | Search engine in shared code | #601  | `feat/search-engine-601`  |
| `@android-engineer` | Android search UI            | #602  | `feat/android-search-602` |
| `@ios-engineer`     | iOS search UI                | #603  | `feat/ios-search-603`     |
| `@web-engineer`     | Web search UI                | #604  | `feat/web-search-604`     |
| `@windows-engineer` | Windows search UI            | #605  | `feat/windows-search-605` |
| `@docs-writer`      | Update feature docs          | #606  | `docs/search-docs-606`    |

**Dependency:** Platform agents wait for `@kmp-engineer` to merge the search engine before consuming its API. If the KMP PR is not yet merged, platform agents can work against the expected interface (documented in the KMP issue) and rebase when it lands.

### Example 2: Bug fix with test and docs

**Task:** Fix budget rollover calculation (#700)

**Fleet dispatch:**

| Agent           | Subtask                                  | Issue | Branch                   |
| --------------- | ---------------------------------------- | ----- | ------------------------ |
| `@kmp-engineer` | Fix rollover logic + unit tests          | #700  | `fix/rollover-calc-700`  |
| `@docs-writer`  | Update rollover section in feature guide | #701  | `docs/rollover-docs-701` |

**Coordination:** The docs agent can start immediately since the feature behavior (not the code) is well-defined in the issue. Both PRs can land independently.

### Example 3: Schema change (serialized, not parallel)

**Task:** Add tags to transactions (#800)

**Serialized dispatch** (not parallel — schema must be sequential):

1. `@backend-engineer` creates Supabase migration adding `tags` column → PR #801
2. **Human merges PR #801**
3. `@kmp-engineer` adds SQLDelight schema for tags → PR #802
4. **Human merges PR #802**
5. Platform agents consume the KMP models → PRs #803–#806 (these can run in parallel)

---

_For the standard single-agent workflow, see [workflow.md](workflow.md). For worktree setup details, see [worktrees.md](worktrees.md). For restriction policies, see [restrictions.md](restrictions.md)._
