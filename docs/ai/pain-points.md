# Workflow Pain Points — Finance AI Agents

This document tracks friction points, inefficiencies, and recurring failures in the AI agent development workflow. It serves as both a tracking register and a template for documenting new pain points as they are discovered.

> **Who maintains this:** `@docs-writer` updates this document. Any agent or human contributor can add entries by following the [template](#pain-point-template) below.

---

## Table of Contents

- [Overview](#overview)
- [Severity Levels](#severity-levels)
- [Categories](#categories)
- [Pain Point Template](#pain-point-template)
- [Active Pain Points](#active-pain-points)
  - [CI/CD](#cicd)
  - [Git / Worktree](#git--worktree)
  - [GitHub CLI](#github-cli)
  - [Tooling](#tooling)
  - [Documentation](#documentation)
  - [Cross-Agent Coordination](#cross-agent-coordination)
  - [Workflow](#workflow)
  - [Fleet Operations](#fleet-operations)
- [Resolved Pain Points](#resolved-pain-points)
- [Metrics Summary](#metrics-summary)

---

## Overview

Pain points are identified through:

1. **Direct experience** — Agent encounters friction during a task
2. **CI failure analysis** — Patterns in repeated CI failures across PRs
3. **Retrospective review** — Post-sprint review of what slowed work down
4. **Documentation audits** — Gaps discovered when docs don't match reality

Each pain point is assigned a severity, category, and owner. The goal is to reduce the total count of **Critical** and **High** pain points to zero over time.

---

## Severity Levels

| Level        | Icon | Definition                                                       | SLA (Service Level Agreement) |
| ------------ | ---- | ---------------------------------------------------------------- | ----------------------------- |
| **Critical** | 🔴   | Blocks agent work entirely — cannot proceed without a workaround | Fix within 1 sprint           |
| **High**     | 🟠   | Causes significant delay (>30 min wasted per occurrence)         | Fix within 2 sprints          |
| **Medium**   | 🟡   | Causes minor delay or requires a known workaround                | Fix when convenient           |
| **Low**      | 🟢   | Cosmetic or annoyance — does not block progress                  | Track for future improvement  |

---

## Categories

| Category                     | Description                                                               |
| ---------------------------- | ------------------------------------------------------------------------- |
| **Workflow**                 | Daily development workflow friction (branching, committing, PR lifecycle) |
| **Tooling**                  | IDE, MCP servers, Copilot configuration, build tools                      |
| **CI/CD**                    | GitHub Actions failures, CI monitoring, flaky tests, pipeline issues      |
| **Documentation**            | Missing, outdated, or inaccurate docs that cause agent errors             |
| **Cross-Agent Coordination** | Issues when multiple agents work on related tasks                         |
| **Git / Worktree**           | Worktree lifecycle, branch management, rebase/merge issues                |
| **GitHub CLI**               | `gh` command quirks, API limitations, output parsing issues               |
| **Fleet Operations**         | Fleet dispatch, monitoring, self-healing, and coordination failures       |

---

## Pain Point Template

Use this template when adding a new pain point. Copy the block below and fill in the details.

```markdown
### PP-XXXX: [Short descriptive title]

| Field          | Value                                      |
| -------------- | ------------------------------------------ |
| **ID**         | PP-XXXX                                    |
| **Severity**   | 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low |
| **Category**   | [Category name]                            |
| **First seen** | YYYY-MM-DD                                 |
| **Status**     | Open / In Progress / Resolved              |
| **Owner**      | @agent-name or human                       |

**Description:**
What is the problem? Be specific about what goes wrong.

**Impact:**
How does this affect agent productivity? Quantify if possible (time wasted, frequency).

**Reproduction steps:**

1. Step one
2. Step two
3. Observe the problem

**Current workaround:**
How are agents currently dealing with this? (Or "None — blocks work entirely")

**Suggested fix:**
What should change to eliminate this pain point?

**Related issues:** #NNN, #NNN
```

---

## Active Pain Points

### CI/CD

#### PP-0002: Agents skip pre-push workflow before pushing

| Field          | Value           |
| -------------- | --------------- |
| **ID**         | PP-0002         |
| **Severity**   | 🟠 High         |
| **Category**   | CI/CD, Workflow |
| **First seen** | 2025-06         |
| **Status**     | Open            |
| **Owner**      | All agents      |

**Description:**
Despite documentation in multiple places, agents sometimes push without running the pre-push workflow first. This causes avoidable CI failures on remote.

**Impact:**
Each avoidable remote CI failure adds 5–15 minutes of wait time plus a fix-push-recheck cycle. Multiplied across fleet operations, this can add hours to a sprint.

**Current workaround:**
Repeated emphasis in documentation. The canonical pre-push workflow is in [workflow.md](workflow.md).

**Suggested fix:**
Include the pre-push workflow block in every agent dispatch prompt.

---

#### PP-0015: `npm run ci:check` doesn't catch Kotlin/Swift compilation

| Field          | Value            |
| -------------- | ---------------- |
| **ID**         | PP-0015          |
| **Severity**   | 🟡 Medium        |
| **Category**   | CI/CD            |
| **First seen** | 2025-07          |
| **Status**     | Open             |
| **Owner**      | @devops-engineer |

**Description:**
`npm run ci:check` only runs format, lint, and type-check for the TypeScript/Node layer. It does not compile Kotlin (KMP) or Swift code. Agents working in `packages/` or `apps/ios/` can push code that passes `ci:check` but fails remote CI's KMP/build checks.

**Impact:**
KMP and iOS agents encounter CI failures that could have been caught locally. 2–3 occurrences per fleet run.

**Current workaround:**
`npm run ready-for-pr` includes KMP compilation checks when Kotlin files are changed, but agents are not consistently using it. Remote CI is the source of truth.

**Suggested fix:**
Document that KMP/Swift agents should run platform-specific build commands locally before pushing (e.g., `./gradlew build` for Kotlin).

---

#### PP-0018: TS 5.9.3 rejects `ignoreDeprecations` locally

| Field          | Value            |
| -------------- | ---------------- |
| **ID**         | PP-0018          |
| **Severity**   | 🟡 Medium        |
| **Category**   | CI/CD, Tooling   |
| **First seen** | 2025-07          |
| **Status**     | Open             |
| **Owner**      | @devops-engineer |

**Description:**
TypeScript 5.9.3 rejects the `ignoreDeprecations` compiler option in `tsconfig.json`, causing `npm run type-check` (and therefore `npm run ci:check`) to fail locally even on clean code. Remote CI uses a compatible configuration and is not affected.

**Impact:**
Agents cannot use `npm run ci:check` as a reliable local gate. The canonical pre-push workflow now skips type-check locally and defers to remote CI.

**Current workaround:**
The canonical pre-push workflow checks only format and lint locally. Remote CI handles type-check.

**Suggested fix:**
Pin TypeScript version or update `tsconfig.json` to remove `ignoreDeprecations` when all deprecated APIs have been migrated.

---

### Git / Worktree

#### PP-0003: Worktree path differences between Windows and Unix

| Field          | Value          |
| -------------- | -------------- |
| **ID**         | PP-0003        |
| **Severity**   | 🟡 Medium      |
| **Category**   | Git / Worktree |
| **First seen** | 2025-07        |
| **Status**     | Open           |
| **Owner**      | @docs-writer   |

**Description:**
Documentation examples use Unix-style paths (`../wt-agent-branch`), but Windows users must use backslash paths or forward slashes in Git Bash. Agents running on Windows sometimes produce invalid worktree paths.

**Impact:**
Minor — typically self-correctable, but adds friction for Windows-based development.

**Current workaround:**
Git on Windows accepts forward slashes in most contexts. Agents can normalize paths.

**Suggested fix:**
Add a "Windows note" callout to [worktrees.md](worktrees.md) showing both path formats.

---

#### PP-0019: Branch interference when agents share main worktree

| Field          | Value          |
| -------------- | -------------- |
| **ID**         | PP-0019        |
| **Severity**   | 🟠 High        |
| **Category**   | Git / Worktree |
| **First seen** | 2025-07        |
| **Status**     | Open           |
| **Owner**      | All agents     |

**Description:**
When agents work directly in the main worktree instead of creating their own, they can interfere with each other's branches, stashes, and uncommitted changes. This causes lost work and merge confusion.

**Impact:**
Has caused lost commits and conflicting changes during fleet operations. Significant when multiple agents are active.

**Current workaround:**
Strict policy: agents MUST always use dedicated worktrees. The main worktree is reserved for human work.

**Suggested fix:**
Already mitigated by worktree policy. Enforce through agent instructions.

---

### GitHub CLI

#### PP-0005: `gh pr view` merge status returns UNKNOWN immediately after push

| Field          | Value      |
| -------------- | ---------- |
| **ID**         | PP-0005    |
| **Severity**   | 🟡 Medium  |
| **Category**   | GitHub CLI |
| **First seen** | 2025-06    |
| **Status**     | Open       |

**Description:**
Immediately after `git push`, `gh pr view <number> --json mergeable` returns `UNKNOWN` for 10–30 seconds while GitHub computes the merge status.

**Impact:**
Low — the workaround is a simple retry.

**Current workaround:**
Wait 10–15 seconds and retry.

**Suggested fix:**
Already documented. No further action needed.

---

#### PP-0013: PowerShell backtick escaping breaks multi-line commands

| Field          | Value               |
| -------------- | ------------------- |
| **ID**         | PP-0013             |
| **Severity**   | 🟠 High             |
| **Category**   | GitHub CLI, Tooling |
| **First seen** | 2025-07             |
| **Status**     | Open                |
| **Owner**      | All agents          |

**Description:**
PowerShell uses backtick (`` ` ``) for line continuation, not backslash. Agents frequently generate bash-style multi-line commands (with `\`) that fail silently or produce incorrect results in PowerShell. This affects `gh pr create`, `gh issue create`, and other multi-argument commands. Observed in 6+ agents across fleet operations.

**Impact:**
Commands fail or produce malformed output. Agents waste time debugging. 30+ minutes per fleet run.

**Current workaround:**
Use single-line commands or PowerShell splatting. Avoid multi-line `gh` commands.

**Suggested fix:**
Include PowerShell-specific examples in agent instructions and cookbook recipes. Document that `` ` `` (not `\`) is the line continuation character.

---

### Tooling

#### PP-0006: MCP server connection failures require manual restart

| Field          | Value            |
| -------------- | ---------------- |
| **ID**         | PP-0006          |
| **Severity**   | 🟡 Medium        |
| **Category**   | Tooling          |
| **First seen** | 2025-07          |
| **Status**     | Open             |
| **Owner**      | @devops-engineer |

**Description:**
MCP servers (especially `sequential-thinking` and `memory`) occasionally lose connection and require manual restart through the VS Code command palette.

**Impact:**
Interrupts agent flow. 2–5 minutes lost per occurrence.

**Current workaround:**
Run `MCP: List Servers` in Command Palette to detect disconnected servers, then restart.

**Suggested fix:**
Document the manual restart procedure more prominently in [mcp.md](mcp.md).

---

#### PP-0014: Husky pre-push hook blocks automated pushes

| Field          | Value                           |
| -------------- | ------------------------------- |
| **ID**         | PP-0014                         |
| **Severity**   | 🟠 High                         |
| **Category**   | Tooling, Workflow               |
| **First seen** | 2025-07                         |
| **Status**     | Resolved (workaround canonical) |
| **Owner**      | @devops-engineer                |

**Description:**
The `.husky/pre-push` hook requires interactive terminal confirmation, which AI agents cannot provide. All automated pushes are blocked by default.

**Impact:**
Every agent push requires a workaround. Was blocking in early fleet runs before workaround was discovered.

**Current workaround:**
Canonical: `$env:HUSKY = "0" ; git push --no-verify origin <branch>`. This is now the standard push command in all workflow docs.

**Suggested fix:**
Workaround is canonical and documented. The hook serves its purpose as a safety net for humans.

---

#### PP-0017: Prettier has no Kotlin/Swift parser

| Field          | Value            |
| -------------- | ---------------- |
| **ID**         | PP-0017          |
| **Severity**   | 🟢 Low           |
| **Category**   | Tooling          |
| **First seen** | 2025-07          |
| **Status**     | Resolved         |
| **Owner**      | @devops-engineer |

**Description:**
`npm run format` (Prettier) fails when it encounters `.kt` or `.swift` files because no parser exists for these languages. This caused false formatting failures in early fleet runs.

**Resolution:**
Kotlin and Swift file patterns added to `.prettierignore`. Prettier now skips these files.

---

#### PP-0020: `npm run format` slow on full monorepo

| Field          | Value            |
| -------------- | ---------------- |
| **ID**         | PP-0020          |
| **Severity**   | 🟡 Medium        |
| **Category**   | Tooling          |
| **First seen** | 2025-07          |
| **Status**     | Open             |
| **Owner**      | @devops-engineer |

**Description:**
Running `npm run format` on the full monorepo takes 30–60 seconds because Prettier scans all files. For agents working in a single app directory, this is unnecessarily slow.

**Impact:**
Adds latency to every pre-push cycle. Compounds across fleet operations.

**Current workaround:**
Use scoped Prettier: `npx prettier --write "apps/web/**"` for targeted formatting.

**Suggested fix:**
Document scoped formatting in the cookbook. Consider a `format:changed` script that only formats git-changed files.

---

### Documentation

#### PP-0016: Doc agents lack shell access

| Field          | Value                           |
| -------------- | ------------------------------- |
| **ID**         | PP-0016                         |
| **Severity**   | 🟡 Medium                       |
| **Category**   | Documentation, Fleet Operations |
| **First seen** | 2025-07                         |
| **Status**     | Open                            |
| **Owner**      | @docs-writer                    |

**Description:**
Documentation-only agents (`@docs-writer`) in some runtime environments lack shell access. They can edit files but cannot run `git commit`, `git push`, `npm run format`, or other CLI commands. This means they cannot complete the full push workflow independently.

**Impact:**
Doc agents need a human or shell-capable agent to commit and push their work. Adds a coordination step to every fleet run with doc tasks.

**Current workaround:**
Human commits and pushes the doc agent's changes. Documented in [fleet-operations.md](fleet-operations.md) under Wave 3 Learnings.

**Suggested fix:**
Pair doc agents with a shell-capable agent, or give doc agents a lightweight commit capability.

---

### Cross-Agent Coordination

#### PP-0009: No standardized handoff format between agents

| Field          | Value                    |
| -------------- | ------------------------ |
| **ID**         | PP-0009                  |
| **Severity**   | 🟡 Medium                |
| **Category**   | Cross-Agent Coordination |
| **First seen** | 2025-07                  |
| **Status**     | Open                     |
| **Owner**      | @architect               |

**Description:**
When one agent's work depends on another, there is no standardized format for the handoff message. Agents must read the full PR to understand the interface.

**Impact:**
Downstream agents spend extra time parsing upstream PRs.

**Suggested fix:**
Define a `## Agent Handoff` PR section template that includes: exported API surface, breaking changes, integration notes, and test commands.

---

### Workflow

#### PP-0010: `force-with-lease` requires human approval but is needed for routine rebases

| Field          | Value                    |
| -------------- | ------------------------ |
| **ID**         | PP-0010                  |
| **Severity**   | 🟡 Medium                |
| **Category**   | Workflow, Git / Worktree |
| **First seen** | 2025-07                  |
| **Status**     | Open                     |
| **Owner**      | @architect               |

**Description:**
After `git rebase origin/main`, agents must force-push their feature branch. The `--force-with-lease` flag requires human approval per [restrictions.md](restrictions.md). This creates a bottleneck when the human is unavailable.

**Impact:**
Agent work is blocked until a human approves the force-push. Can delay a PR by hours.

**Current workaround:**
Agents can avoid rebasing until just before requesting human review. In practice, most rebases result in a clean fast-forward push without needing `--force-with-lease`.

**Suggested fix:**
Consider auto-approving `--force-with-lease` on the agent's own feature branch (when no other collaborator has pushed to it).

---

### Fleet Operations

#### PP-0011: Fleet status tracking relies on manual PR comments

| Field          | Value            |
| -------------- | ---------------- |
| **ID**         | PP-0011          |
| **Severity**   | 🟡 Medium        |
| **Category**   | Fleet Operations |
| **First seen** | 2025-07          |
| **Status**     | Open             |
| **Owner**      | @devops-engineer |

**Description:**
Fleet health monitoring requires the orchestrator to manually update a tracking comment in the parent issue with each agent's PR status.

**Impact:**
Fleet status is often out of date. Human reviewers must manually check each PR.

**Suggested fix:**
Create a GitHub Actions workflow or script that automatically generates a fleet status table from open PRs matching a label or issue reference.

---

#### PP-0012: No fleet-wide integration test after all PRs pass individually

| Field          | Value                   |
| -------------- | ----------------------- |
| **ID**         | PP-0012                 |
| **Severity**   | 🟠 High                 |
| **Category**   | Fleet Operations, CI/CD |
| **First seen** | 2025-07                 |
| **Status**     | Open                    |
| **Owner**      | @devops-engineer        |

**Description:**
Each fleet agent's PR passes CI independently, but there is no mechanism to run an integration test that combines all fleet PRs before merging. Merge order can introduce breakage.

**Impact:**
`main` can break if fleet PRs have subtle interdependencies not caught by individual CI runs.

**Suggested fix:**
Define a merge-train pattern: merge PRs one at a time, each rebased on the prior merge.

---

## Resolved Pain Points

| ID      | Title                                | Severity | Resolved | Resolution                                                                   |
| ------- | ------------------------------------ | -------- | -------- | ---------------------------------------------------------------------------- |
| PP-0001 | `gh pr checks` shows stale results   | 🔴       | 2025-07  | `gh pr checks` is now the correct and canonical CI monitoring command        |
| PP-0004 | No detection of stale worktrees      | 🟢       | 2025-07  | Cleanup script added: `node tools/cleanup-worktrees.js`                      |
| PP-0007 | fleet-ops referenced wrong CI cmd    | 🟠       | 2025-07  | fleet-operations.md updated to use `gh pr checks`                            |
| PP-0008 | Duplicated CI monitoring across docs | 🟡       | 2025-07  | Consolidated in this docs audit; ci-monitoring.md is the canonical reference |
| PP-0014 | Husky pre-push blocks automated push | 🟠       | 2025-07  | Canonical workaround: `$env:HUSKY = "0" ; git push --no-verify`              |
| PP-0017 | Prettier has no Kotlin/Swift parser  | 🟢       | 2025-07  | Kotlin and Swift patterns added to `.prettierignore`                         |

---

## Metrics Summary

Track these metrics monthly to measure improvement. See [workflow-metrics.md](workflow-metrics.md) for detailed metric definitions.

| Metric                                  | Current | Target  |
| --------------------------------------- | ------- | ------- |
| Total open pain points                  | 13      | < 5     |
| Critical pain points                    | 0       | 0       |
| High pain points                        | 4       | 0       |
| Avg CI failures per PR (avoidable)      | —       | < 0.5   |
| Avg time from push to merge-ready       | —       | < 30min |
| Fleet operations completed without help | —       | > 80%   |

---

_Last updated: 2025-07-18. Maintained by `@docs-writer`._
