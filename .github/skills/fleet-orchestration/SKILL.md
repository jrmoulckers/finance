---
name: fleet-orchestration
description: >
  Fleet orchestration for parallel multi-agent sprint execution. Use for
  topics related to deploying multiple agents across worktrees, sprint
  dispatch, worktree coordination, parallel PR workflows, CI self-healing,
  or merge ordering.
---

# Fleet Orchestration Skill

## Purpose

This skill covers **agent dispatch, worktree coordination, CI self-healing, PR quality gates, merge ordering, and self-merge operations** for parallel fleet execution. It assumes issues have already been shaped and sprint scope has already been selected.

## Out of Scope

- Issue creation quality, label taxonomy, platform duplicates, and pre-filing validation → use `issue-management`.
- Roadmap, milestones, backlog grooming, and release lifecycle → use `project-management`.
- Sprint selection, capacity planning, and dependency sequencing before dispatch → use `sprint-planning`.
- Domain implementation details inside apps, packages, or services → use the relevant engineering skill.

## Related Skills

| Skill                | Use For                                                 |
| -------------------- | ------------------------------------------------------- |
| `sprint-planning`    | Selecting and sequencing sprint work before dispatch    |
| `project-management` | Lifecycle/release tracking and cross-team coordination  |
| `issue-management`   | Issue quality, platform scoping, labels, and duplicates |
| `dev-onboarding`     | Environment setup and local tool/script orientation     |

Proven across **3 waves, 140+ PRs, 17 sprints per agent type** for dispatch, CI healing, and merge operations.

## Agent Registry

### Engineering Agents

| Agent                      | File Ownership                                                        | Definition                                         |
| -------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `android-engineer`         | `apps/android/**`                                                     | `.github/agents/android-engineer.agent.md`         |
| `ios-engineer`             | `apps/ios/**`                                                         | `.github/agents/ios-engineer.agent.md`             |
| `web-engineer`             | `apps/web/**`                                                         | `.github/agents/web-engineer.agent.md`             |
| `pwa-bug-basher`           | `apps/web/**` (standalone single-bug bug bash; own worktree)          | `.github/agents/pwa-bug-basher.agent.md`           |
| `windows-engineer`         | `apps/windows/**`                                                     | `.github/agents/windows-engineer.agent.md`         |
| `kmp-engineer`             | `packages/**`                                                         | `.github/agents/kmp-engineer.agent.md`             |
| `backend-engineer`         | `services/**`                                                         | `.github/agents/backend-engineer.agent.md`         |
| `devops-engineer`          | `.github/workflows/**`, `tools/**`                                    | `.github/agents/devops-engineer.agent.md`          |
| `design-engineer`          | `packages/design-tokens/**`                                           | `.github/agents/design-engineer.agent.md`          |
| `docs-writer`              | `docs/**`, root `*.md`                                                | `.github/agents/docs-writer.agent.md`              |
| `architect`                | Cross-cutting, ADRs                                                   | `.github/agents/architect.agent.md`                |
| `compliance-specialist`    | `docs/compliance/**`                                                  | `.github/agents/compliance-specialist.agent.md`    |
| `finance-domain`           | `packages/core/**` (business logic, shared with `kmp-engineer`)       | `.github/agents/finance-domain.agent.md`           |
| `performance-engineer`     | `performance.budget.json`, `docs/performance/**`                      | `.github/agents/performance-engineer.agent.md`     |
| `data-engineer`            | `docs/analytics/**`, `config/analytics/**`, `docs/business/growth/**` | `.github/agents/data-engineer.agent.md`            |
| `localization-engineer`    | `config/i18n/**`, `docs/i18n/**`                                      | `.github/agents/localization-engineer.agent.md`    |
| `experimentation-engineer` | `config/feature-flags/**`                                             | `.github/agents/experimentation-engineer.agent.md` |

### Review Agents (read-only — never own implementation)

| Agent                    | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `security-reviewer`      | Security and privacy audits (may fix CRITICAL/HIGH)   |
| `accessibility-reviewer` | WCAG 2.2 AA compliance                                |
| `qa-tester`              | Live QA + bug discovery; files issues (no code edits) |

### Ops & Meta Agents

| Agent             | Purpose                                                                                |
| ----------------- | -------------------------------------------------------------------------------------- |
| `release-manager` | Changesets, versioning, release notes, store-submission prep                           |
| `ai-ops-engineer` | Owns `.github/agents/`, `.github/skills/`, `.github/instructions/`, `.github/prompts/` |

### Business Agents

| Agent                  | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `product-manager`      | Issue triage, backlog grooming, sprint planning |
| `marketing-strategist` | ASO, launch comms, content strategy             |
| `business-analyst`     | Pricing, competitive analysis, revenue metrics  |

### Label-to-Agent Mapping

| Label                        | Agent                      |
| ---------------------------- | -------------------------- |
| `platform:android`           | `android-engineer`         |
| `platform:ios`               | `ios-engineer`             |
| `platform:web`               | `web-engineer`             |
| `platform:windows`           | `windows-engineer`         |
| `platform:shared`, `kmp`     | `kmp-engineer`             |
| `backend`, `supabase`        | `backend-engineer`         |
| `ci`, `devops`               | `devops-engineer`          |
| `docs`, `documentation`      | `docs-writer`              |
| `security`, `privacy`        | `security-reviewer`        |
| `compliance`, `regulatory`   | `compliance-specialist`    |
| `a11y`, `accessibility`      | `accessibility-reviewer`   |
| `qa`, `testing`              | `qa-tester`                |
| `product`, `roadmap`         | `product-manager`          |
| `marketing`, `launch`        | `marketing-strategist`     |
| `business`, `pricing`        | `business-analyst`         |
| `performance`                | `performance-engineer`     |
| `i18n`, `localization`       | `localization-engineer`    |
| `analytics`, `metrics`       | `data-engineer`            |
| `experiment`, `feature-flag` | `experimentation-engineer` |
| `release`                    | `release-manager`          |
| `agent`, `skill`, `prompt`   | `ai-ops-engineer`          |
| `finance`, `domain`          | `finance-domain`           |

## Wave Sizing (Proven Metrics)

| Metric                     | Value                             |
| -------------------------- | --------------------------------- |
| Agents per wave            | **8–15** (sweet spot)             |
| Issues per sprint          | **4–6** per agent type            |
| Sprints per agent per wave | **~5**                            |
| Time per wave              | **~30 minutes**                   |
| CI overhead budget         | **~20%** (for failures + rebases) |
| Total PRs across 3 waves   | **140+**                          |

## Sprint Planning Algorithm

### Step 1: Query open issues

```bash
gh issue list --state open --json number,title,labels,milestone --limit 100
```

### Step 2: Categorize by agent

Map each issue to an agent using the label-to-agent table. If no label, infer from issue body/title.

### Step 3: Identify dependencies

| Dependency Rule                                   | Reason                                 |
| ------------------------------------------------- | -------------------------------------- |
| `backend-engineer` before `kmp-engineer` (schema) | Migrations must land before KMP models |
| `kmp-engineer` before platform agents             | Shared models must exist first         |
| `design-engineer` before platform agents (tokens) | Tokens must be generated before UI     |
| `architect` before implementation (ADRs)          | Decisions before implementation        |

### Step 4: Group into sprints

- 4–6 issues per sprint, balanced across agents
- Priority: bugs → security → features → docs → chores
- Never parallelize schema changes (backend → KMP → platform)
- Every sprint includes ≥1 business task

### Step 5: Track with SQL

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('s1-kmp-88', 'KMP: shared models (#88)', 'Update models in packages/', 'pending'),
  ('s1-web-443', 'Web: dashboard (#443)', 'Implement in apps/web/', 'pending'),
  ('s1-android-444', 'Android: tx list (#444)', 'Implement in apps/android/', 'pending');

INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('s1-web-443', 's1-kmp-88'),
  ('s1-android-444', 's1-kmp-88');
```

## Fleet Dispatch Template

### Agent Prompt Template

```
task(
  name: "s1-web-443",
  agent_type: "web-engineer",
  description: "Web dashboard #443",
  mode: "background",
  prompt: """
You are working on issue #443: [title].

## Issue Details
[paste issue body]

## Setup
Run: `node tools/agent-scripts/setup-worktree.js web feat dashboard 443`

## Work
[specific implementation instructions]

## Completion
Follow the canonical workflow in `docs/ai/workflow.md` ("Mandatory Pre-Push"), then create a PR with `Closes #443`.

## CI Monitoring
Poll PR checks and mergeability until the quality gate passes: CI green and `MERGEABLE`.
If failure: read logs, fix, repeat the canonical Mandatory Pre-Push flow, and push again.
Self-merge the agent-authored PR with squash after the quality gate passes.
"""
)
```

### Parallel Dispatch (entire sprint at once)

```
# Dispatch all independent agents simultaneously:
task(name: "s1-kmp-88",      agent_type: "kmp-engineer",      mode: "background", ...)
task(name: "s1-web-443",     agent_type: "web-engineer",      mode: "background", ...)
task(name: "s1-android-444", agent_type: "android-engineer",   mode: "background", ...)
task(name: "s1-docs-446",    agent_type: "docs-writer",        mode: "background", ...)
task(name: "s1-pm-triage",   agent_type: "product-manager",    mode: "background", ...)
```

**Critical rule**: Never dispatch a single background agent — use sync mode for solo tasks. Fleet = parallelism.

For dependency chains: dispatch independent agents first → `read_agent()` → dispatch dependents.

## Worktree Protocol

### Setup

```bash
node tools/agent-scripts/setup-worktree.js <agent-type> <type> <description> <issue#>
# Example: node tools/agent-scripts/setup-worktree.js web feat dashboard 443
# Creates: worktrees/wt-web-feat-dashboard-443 with branch feat/dashboard-443
```

### Naming Convention

```
worktrees/wt-[agent-type]-[type/description-issue#]
```

### Pre-Push (Mandatory)

Do not restate the command sequence here. Follow the canonical `docs/ai/workflow.md` **Mandatory Pre-Push** section: format/lint, verify, amend, fetch/rebase, push the agent's own feature branch with the approved Husky bypass, create/verify the PR, monitor CI + mergeability, then self-merge after the quality gate.

### PR Creation

```bash
node tools/agent-scripts/create-pr.js --title "type(scope): description (#N)" --closes N
```

### Post-Merge Cleanup

```bash
git worktree remove worktrees/wt-[agent]-[branch]
```

## CI Self-Healing Loop

```
Push → gh pr checks [N] + mergeability check → Failure or dirty? →
  gh run view [run-id] --log-failed →
  fix locally → follow docs/ai/workflow.md Mandatory Pre-Push →
  push → repeat until CI is green and the PR is MERGEABLE → self-merge
```

| Failure Type    | Fix                                                     |
| --------------- | ------------------------------------------------------- |
| Format errors   | `npm run format`, commit, push                          |
| Lint errors     | `npx eslint . --fix`, commit, push                      |
| Type errors     | Fix TS/Kotlin error, run ci:check, push                 |
| Test failures   | Fix test or code, run ci:check, push                    |
| Merge conflicts | `git fetch origin main && git rebase origin/main`, push |

## Rebase-All Pattern (Fleet Maintenance)

When main advances and multiple fleet PRs need rebasing, process each agent-owned worktree one at a time: sync with `origin/main`, rebase the feature branch, resolve conflicts, then follow `docs/ai/workflow.md` **Mandatory Pre-Push** before pushing. Use the canonical Windows Husky-bypass form from that workflow, and use `--force-with-lease` only after a successful rebase on the agent's own branch.

## Parallel Coordination Rules

### File Ownership

- No two agents edit the same file in parallel
- If needed: one leads, the other reviews

### Shared Config Files (single owner per fleet run)

| File                        | Owner             |
| --------------------------- | ----------------- |
| `gradle/libs.versions.toml` | `kmp-engineer`    |
| `settings.gradle.kts`       | `kmp-engineer`    |
| `package.json`              | `devops-engineer` |
| `turbo.json`                | `devops-engineer` |
| `eslint.config.mjs`         | `devops-engineer` |

### Schema Serialization (never parallelize)

1. `backend-engineer` → Supabase migration
2. `kmp-engineer` → SQLDelight .sq files
3. Plan as single coordinated task, not two independent ones

## Sprint Execution Phases

### Phase 1: Plan

Query issues → categorize → find deps → group sprints → SQL todos

### Phase 2: Dispatch

All independent agents in parallel → track agent IDs → wait for deps

### Phase 3: Monitor

```bash
# Sprint status dashboard
node tools/agent-scripts/sprint-status.js

# Per-PR monitoring
gh pr checks [number]
```

Poll `read_agent(agent_id)` → verify PRs → fix failures → update SQL todos

### Phase 4: Validate

All PRs open → all CI green → no conflicts → final `npm run ci:check` from main worktree

### Phase 5: Handoff

All PRs green & `MERGEABLE` → orchestrator merges each (`gh pr merge <n> --squash`) in the recommended order → add "## Needs Human Action" only where a real blocker (e.g. token/branch-protection limit, `## Needs Decision`) prevents self-merge → clean up worktrees

## Sprint Dashboard Query

```sql
SELECT t.id, t.title, t.status, t.updated_at,
  GROUP_CONCAT(td.depends_on) as blocked_by
FROM todos t
LEFT JOIN todo_deps td ON td.todo_id = t.id
LEFT JOIN todos dep ON td.depends_on = dep.id AND dep.status != 'done'
WHERE t.id LIKE 'sprint-%'
GROUP BY t.id
ORDER BY CASE t.status
  WHEN 'in_progress' THEN 1 WHEN 'blocked' THEN 2
  WHEN 'pending' THEN 3 WHEN 'done' THEN 4
END;
```

## Hard-Won Lessons (3 Waves, 140+ PRs)

| Lesson                             | Detail                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Pre-push is non-negotiable**     | Follow `docs/ai/workflow.md` Mandatory Pre-Push; stale local shortcuts cause avoidable CI failures |
| **`--max-warnings 0` for lint**    | Warnings accumulate; CI rejects them                                                               |
| **Husky bypass syntax**            | Use the canonical Windows syntax in `docs/ai/workflow.md`; do not copy stale snippets              |
| **Docs agents self-merge too**     | Agent-authored docs PRs follow the same push, PR, quality-gate, and self-merge policy              |
| **Never share worktrees**          | Branch interference is #1 pain point; every agent gets its own                                     |
| **Always include Co-authored-by**  | Omitting triggers PR title check failure                                                           |
| **Rebase immediately before push** | Stale branches compound merge conflicts across a fleet                                             |

## Business Sprint Integration

Every sprint includes ≥1 business task:

| Agent                  | Dispatch For                                      |
| ---------------------- | ------------------------------------------------- |
| `product-manager`      | Issue triage, backlog grooming, milestone updates |
| `marketing-strategist` | ASO optimization, launch comms, content           |
| `business-analyst`     | Pricing analysis, competitive research, metrics   |

## Reference Files

| Resource          | Path                          |
| ----------------- | ----------------------------- |
| Agent definitions | `.github/agents/*.agent.md`   |
| Worktree guide    | `docs/ai/worktrees.md`        |
| Fleet operations  | `docs/ai/fleet-operations.md` |
| Agent scripts     | `tools/agent-scripts/`        |
| AGENTS.md         | repo root                     |
