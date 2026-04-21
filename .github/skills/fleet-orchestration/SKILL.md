---
name: fleet-orchestration
description: >
  Fleet orchestration for parallel multi-agent sprint execution. Use when
  deploying multiple agents across worktrees, planning sprints, or
  coordinating parallel PR workflows.
---

# Fleet Orchestration Skill

Proven across **3 waves, 140+ PRs, 17 sprints per agent type**. This skill covers the full lifecycle: issue triage → sprint planning → agent dispatch → CI monitoring → merge-ready handoff.

## Agent Registry

### Engineering Agents

| Agent              | File Ownership                     | Definition                                 |
| ------------------ | ---------------------------------- | ------------------------------------------ |
| `android-engineer` | `apps/android/**`                  | `.github/agents/android-engineer.agent.md` |
| `ios-engineer`     | `apps/ios/**`                      | `.github/agents/ios-engineer.agent.md`     |
| `web-engineer`     | `apps/web/**`                      | `.github/agents/web-engineer.agent.md`     |
| `windows-engineer` | `apps/windows/**`                  | `.github/agents/windows-engineer.agent.md` |
| `kmp-engineer`     | `packages/**`                      | `.github/agents/kmp-engineer.agent.md`     |
| `backend-engineer` | `services/**`                      | `.github/agents/backend-engineer.agent.md` |
| `devops-engineer`  | `.github/workflows/**`, `tools/**` | `.github/agents/devops-engineer.agent.md`  |
| `design-engineer`  | `config/tokens/**`                 | `.github/agents/design-engineer.agent.md`  |
| `docs-writer`      | `docs/**`, root `*.md`             | `.github/agents/docs-writer.agent.md`      |
| `architect`        | Cross-cutting, ADRs                | `.github/agents/architect.agent.md`        |

### Review Agents (read-only — never own implementation)

| Agent                    | Purpose                     |
| ------------------------ | --------------------------- |
| `security-reviewer`      | Security and privacy audits |
| `accessibility-reviewer` | WCAG 2.2 AA compliance      |

### Business Agents

| Agent                  | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `product-manager`      | Issue triage, backlog grooming, sprint planning |
| `marketing-strategist` | ASO, launch comms, content strategy             |
| `business-analyst`     | Pricing, competitive analysis, revenue metrics  |

### Label-to-Agent Mapping

| Label                    | Agent                    |
| ------------------------ | ------------------------ |
| `platform:android`       | `android-engineer`       |
| `platform:ios`           | `ios-engineer`           |
| `platform:web`           | `web-engineer`           |
| `platform:windows`       | `windows-engineer`       |
| `platform:shared`, `kmp` | `kmp-engineer`           |
| `backend`, `supabase`    | `backend-engineer`       |
| `ci`, `devops`           | `devops-engineer`        |
| `docs`, `documentation`  | `docs-writer`            |
| `security`, `privacy`    | `security-reviewer`      |
| `a11y`, `accessibility`  | `accessibility-reviewer` |
| `product`, `roadmap`     | `product-manager`        |
| `marketing`, `launch`    | `marketing-strategist`   |
| `business`, `pricing`    | `business-analyst`       |

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
Run: `node tools/agent-scripts/pre-push-check.js --fix`
Then: `node tools/agent-scripts/create-pr.js --title "feat(web): dashboard (#443)" --closes 443`

## CI Monitoring
Poll `gh pr checks [pr-number]` until green.
If failure: read logs, fix, re-run pre-push-check.js, push again.
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

```bash
node tools/agent-scripts/pre-push-check.js --fix
```

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
Push → gh pr checks [N] → Failure? →
  gh run view [run-id] --log-failed →
  Fix locally → node tools/agent-scripts/pre-push-check.js --fix →
  git push → Repeat until green
```

| Failure Type    | Fix                                                     |
| --------------- | ------------------------------------------------------- |
| Format errors   | `npm run format`, commit, push                          |
| Lint errors     | `npx eslint . --fix`, commit, push                      |
| Type errors     | Fix TS/Kotlin error, run ci:check, push                 |
| Test failures   | Fix test or code, run ci:check, push                    |
| Merge conflicts | `git fetch origin main && git rebase origin/main`, push |

## Rebase-All Pattern (Fleet Maintenance)

When main advances and multiple fleet PRs need rebasing:

```bash
# For each fleet worktree:
cd worktrees/wt-[agent]-[branch]
git fetch origin main
git rebase origin/main
node tools/agent-scripts/pre-push-check.js --fix
 = "0"; git push origin [branch] --force-with-lease
```

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

All PRs merge-ready → add "## Needs Human Action" where needed → humans merge → clean up worktrees

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

| Lesson                             | Detail                                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| **Pre-push is non-negotiable**     | Skipping ci:check = #1 cause of avoidable CI failures          |
| **`--max-warnings 0` for lint**    | Warnings accumulate; CI rejects them                           |
| **` = "0"`**                       | Cleanly bypasses Husky on Windows without `--no-verify`        |
| **Doc agents can't push**          | `docs-writer` needs human push step; note in sprint tracker    |
| **Never share worktrees**          | Branch interference is #1 pain point; every agent gets its own |
| **Always include Co-authored-by**  | Omitting triggers PR title check failure                       |
| **Rebase immediately before push** | Stale branches compound merge conflicts across a fleet         |

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
