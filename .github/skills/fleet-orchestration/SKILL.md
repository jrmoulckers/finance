---
name: fleet-orchestration
description: >
  Fleet orchestration for parallel multi-agent sprint execution. Use when
  deploying multiple agents across worktrees, planning sprints, or
  coordinating parallel PR workflows.
---

# Fleet Orchestration Skill

This skill enables a single orchestrating agent to plan, dispatch, and monitor a fleet of parallel agents working across the Finance monorepo. It covers the full lifecycle: issue triage → sprint planning → agent dispatch → CI monitoring → merge-ready handoff.

## Agent Type Registry

Every issue maps to exactly one agent type based on the files it will touch. Use this registry to categorize issues and dispatch the correct agent.

### Engineering Agents

| Agent Type         | File Ownership                                       | Agent Definition                           |
| ------------------ | ---------------------------------------------------- | ------------------------------------------ |
| `android-engineer` | `apps/android/**`                                    | `.github/agents/android-engineer.agent.md` |
| `ios-engineer`     | `apps/ios/**`                                        | `.github/agents/ios-engineer.agent.md`     |
| `web-engineer`     | `apps/web/**`                                        | `.github/agents/web-engineer.agent.md`     |
| `windows-engineer` | `apps/windows/**`                                    | `.github/agents/windows-engineer.agent.md` |
| `kmp-engineer`     | `packages/**`                                        | `.github/agents/kmp-engineer.agent.md`     |
| `backend-engineer` | `services/**`                                        | `.github/agents/backend-engineer.agent.md` |
| `devops-engineer`  | `.github/workflows/**`, `tools/**`, `build-logic/**` | `.github/agents/devops-engineer.agent.md`  |
| `design-engineer`  | `config/tokens/**`                                   | `.github/agents/design-engineer.agent.md`  |
| `docs-writer`      | `docs/**`, root `*.md` files                         | `.github/agents/docs-writer.agent.md`      |
| `architect`        | Cross-cutting design decisions, ADRs                 | `.github/agents/architect.agent.md`        |

### Review Agents (Read-Only)

| Agent Type               | Purpose                       | Agent Definition                                 |
| ------------------------ | ----------------------------- | ------------------------------------------------ |
| `security-reviewer`      | Security and privacy audits   | `.github/agents/security-reviewer.agent.md`      |
| `accessibility-reviewer` | WCAG 2.2 AA compliance audits | `.github/agents/accessibility-reviewer.agent.md` |

### Business Agents

| Agent Type             | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `product-manager`      | Issue triage, backlog grooming, milestone updates, sprint planning     |
| `marketing-strategist` | Go-to-market planning, launch communications, ASO, user engagement     |
| `business-analyst`     | Monetization strategy, pricing analysis, competitive research, metrics |

### Label-to-Agent Mapping

When categorizing issues by label, use this mapping:

| Label Pattern            | Agent Type               |
| ------------------------ | ------------------------ |
| `platform:android`       | `android-engineer`       |
| `platform:ios`           | `ios-engineer`           |
| `platform:web`           | `web-engineer`           |
| `platform:windows`       | `windows-engineer`       |
| `platform:shared`, `kmp` | `kmp-engineer`           |
| `backend`, `supabase`    | `backend-engineer`       |
| `ci`, `devops`           | `devops-engineer`        |
| `design`, `tokens`       | `design-engineer`        |
| `docs`, `documentation`  | `docs-writer`            |
| `architecture`, `adr`    | `architect`              |
| `security`, `privacy`    | `security-reviewer`      |
| `a11y`, `accessibility`  | `accessibility-reviewer` |
| `product`, `roadmap`     | `product-manager`        |
| `marketing`, `launch`    | `marketing-strategist`   |
| `business`, `pricing`    | `business-analyst`       |

If an issue has no matching label, infer the agent type from the issue title and description by identifying which files will be modified.

## Sprint Planning Algorithm

### Step 1: Query Open Issues

```bash
gh issue list --state open --json number,title,labels,milestone,assignees --limit 100
```

### Step 2: Categorize Issues

For each issue, determine the agent type using the label-to-agent mapping above. If no label matches, read the issue body to infer which files will change and map to the agent type registry.

### Step 3: Identify Dependencies

Certain issue combinations have implicit ordering constraints:

| Dependency Rule                                               | Reason                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `kmp-engineer` before platform agents                         | Shared models/logic must exist before platform integration            |
| `backend-engineer` before `kmp-engineer` (for schema changes) | Database migrations must land before KMP models reference new columns |
| `design-engineer` before platform agents (for token changes)  | Design tokens must be generated before UI code consumes them          |
| `architect` before implementation agents (for ADRs)           | Architecture decisions must be made before implementation begins      |

### Step 4: Group Into Sprints

- Target **4–6 issues per sprint**, balanced across agent types.
- Prioritize: bugs → security → features → docs → chores.
- Place dependency-blocked issues in a later sprint than their dependencies.
- Every sprint should include at least one business/management task.

### Step 5: Track With SQL Todos

Use the session database to track sprint execution:

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('sprint-1-web-443', 'Web: implement dashboard (#443)', 'Dispatch web-engineer to apps/web/', 'pending'),
  ('sprint-1-android-444', 'Android: transaction list (#444)', 'Dispatch android-engineer to apps/android/', 'pending'),
  ('sprint-1-kmp-445', 'KMP: budget model (#445)', 'Dispatch kmp-engineer to packages/', 'pending');

INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('sprint-1-web-443', 'sprint-1-kmp-445'),
  ('sprint-1-android-444', 'sprint-1-kmp-445');
```

## Fleet Dispatch Protocol

### Dispatching Agents

Use the `task` tool with `mode: "background"` to run agents in parallel. Each dispatched agent receives a complete, self-contained prompt including the issue number, worktree path, branch name, and full instructions.

**Critical rule:** Never dispatch a single background agent — dispatch multiple in parallel, or use sync mode for solo tasks. The fleet pattern exists for parallelism.

### Dispatch Template

For each issue in a sprint, call the `task` tool like this:

```
task(
  name: "sprint-1-web-443",
  agent_type: "web-engineer",
  description: "Web dashboard #443",
  mode: "background",
  prompt: """
You are working on issue #443: [issue title].

## Issue Details
[paste issue body]

## Setup
1. cd G:\personal\finance
2. git fetch origin main
3. git worktree add worktrees/wt-web-feat-dashboard-443 -b feat/dashboard-443 origin/main
4. cd worktrees/wt-web-feat-dashboard-443

## Work
[specific implementation instructions based on the issue]

## Pre-Push Checklist (MANDATORY)
1. npm run ci:check — must pass clean
2. If failures: npm run format && npx eslint . --fix, then re-run ci:check
3. Commit any fixes: git add -A && git commit -m "style(web): fix formatting (#443)"
4. git fetch origin main && git rebase origin/main
5. git push origin feat/dashboard-443 --no-verify
6. gh pr create --title "feat(web): implement dashboard (#443)" \
     --body "## Summary\n[description]\n\n## Issues\nCloses #443\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

## Post-Push
Monitor with: gh pr checks [pr-number]
Work is NOT complete until all checks are green.
If CI fails: read logs, fix locally, run ci:check, push again.
If merge conflict: git fetch origin main && git rebase origin/main, then push --force-with-lease.
"""
)
```

### Parallel Dispatch Example

Dispatch an entire sprint in one response:

```
# Call all three task() invocations simultaneously:

task(name: "s1-kmp-445",     agent_type: "kmp-engineer",     mode: "background", ...)
task(name: "s1-web-443",     agent_type: "web-engineer",     mode: "background", ...)
task(name: "s1-android-444", agent_type: "android-engineer",  mode: "background", ...)
task(name: "s1-docs-446",    agent_type: "docs-writer",       mode: "background", ...)
task(name: "s1-product",     agent_type: "product-manager",   mode: "background", ...)
```

When there are dependencies (e.g., platform agents depend on KMP), dispatch independent agents first, wait for completion via `read_agent`, then dispatch the dependent agents.

## Worktree Protocol

Every dispatched agent MUST follow the worktree lifecycle defined in `docs/ai/worktrees.md`.

### Creation (per agent)

```bash
cd G:\personal\finance
git fetch origin main
git worktree add worktrees/wt-[agent]-[type/description-issue#] -b [type/description-issue#] origin/main
cd worktrees/wt-[agent]-[type/description-issue#]
```

### Naming Convention

```
worktrees/wt-[agent-type]-[type/description-issue#]
```

Examples:

- `worktrees/wt-android-feat-transactions-443`
- `worktrees/wt-web-fix-auth-127`
- `worktrees/wt-kmp-feat-schema-align-88`
- `worktrees/wt-backend-fix-rls-policies-22`
- `worktrees/wt-docs-docs-api-reference-86`

### Pre-Push Sequence (MANDATORY — every agent, every push)

```bash
# 1. Local CI validation
npm run ci:check

# 2. Auto-fix if needed
npm run format
npx eslint . --fix
npm run ci:check   # confirm clean

# 3. Commit fixes
git add -A && git commit -m "style(scope): fix formatting (#N)"

# 4. Rebase onto latest main
git fetch origin main
git rebase origin/main

# 5. Push (--no-verify bypasses the interactive pre-push hook)
git push origin [branch] --no-verify

# 6. Open PR
gh pr create --title "type(scope): description (#N)" \
  --body "## Summary\n...\n\n## Issues\nCloses #N\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Post-Merge Cleanup

```bash
cd G:\personal\finance
git worktree remove worktrees/wt-[agent]-[branch]
```

## Parallel Coordination Rules

These rules prevent conflicts when multiple agents work simultaneously. They are defined in `AGENTS.md` under "Fleet Coordination Rules."

### File Ownership

No two agents may edit the same file in parallel. If a task requires changes from two agents in one file, one leads and the other reviews.

### Shared Config Files

These files may only be edited by **one agent per fleet run**:

| File                        | Assigned Owner    |
| --------------------------- | ----------------- |
| `gradle/libs.versions.toml` | `kmp-engineer`    |
| `settings.gradle.kts`       | `kmp-engineer`    |
| `package.json`              | `devops-engineer` |
| `turbo.json`                | `devops-engineer` |
| `eslint.config.mjs`         | `devops-engineer` |

### Schema Change Serialization

Database schema changes require coordinated, serialized execution:

1. `backend-engineer` writes Supabase migrations (`services/api/supabase/migrations/`)
2. `kmp-engineer` writes SQLDelight `.sq` files (`packages/core/src/commonMain/sqldelight/`)
3. Both must be in sync — plan as a single coordinated sprint task, not two independent ones

### Integration Validation

The last agent to complete in a sprint should run a full integration check:

```bash
cd G:\personal\finance
npm run ci:check
```

This catches cross-agent integration issues (e.g., a KMP change that breaks a web import).

## CI Self-Healing Protocol

After every push, agents must monitor and fix CI failures autonomously. Work is NOT complete until `gh pr checks` shows all green.

### Monitoring Loop

```bash
# Poll until resolved
gh pr checks [pr-number]

# If a check fails, read the logs
gh run view [run-id] --log-failed
```

### Failure Resolution

| Failure Type    | Resolution                                                                            |
| --------------- | ------------------------------------------------------------------------------------- |
| Format errors   | `npm run format`, commit, push                                                        |
| Lint errors     | `npx eslint . --fix`, commit, push                                                    |
| Type errors     | Fix the TypeScript/Kotlin error, run `ci:check`, commit, push                         |
| Test failures   | Fix the test or the code under test, run `ci:check`, commit, push                     |
| Merge conflicts | `git fetch origin main && git rebase origin/main`, resolve, push `--force-with-lease` |

### Self-Healing Cycle

```
Push → Poll gh pr checks → Failure detected →
  Read logs → Fix locally → npm run ci:check → Commit → Push →
  Poll gh pr checks → (repeat until green)
```

`git push --force-with-lease` on feature branches after a rebase is auto-approved. Never use `--force`.

## Business-Side Integration

Every sprint should include business and management tasks alongside engineering work. These agents do not write code — they produce analysis, plans, and content.

### Product Manager

Dispatch for:

- Issue triage and prioritization of the open backlog
- Backlog grooming — closing stale issues, adding labels, refining descriptions
- Milestone and roadmap updates
- Sprint retrospective summaries

### Marketing Strategist

Dispatch for:

- Go-to-market planning for upcoming features
- App store listing optimization (ASO) — title, description, keywords, screenshots
- Launch communications — blog posts, release notes, social media
- User engagement and retention analysis

### Business Analyst

Dispatch for:

- Monetization strategy and pricing model analysis
- Competitive landscape research
- Feature usage metrics analysis and recommendations
- Cost-benefit analysis for proposed features

### Including Business Tasks in Sprints

```
Sprint N — [Theme]

Engineering:
| Agent Type        | Issue | Title                         |
|-------------------|-------|-------------------------------|
| kmp-engineer      | #88   | Implement budget rollover     |
| web-engineer      | #443  | Dashboard redesign            |
| android-engineer  | #444  | Transaction list view         |

Business:
| Agent Type           | Task                                            |
|----------------------|-------------------------------------------------|
| product-manager      | Triage and label 20 new issues from backlog     |
| marketing-strategist | Draft Play Store listing for beta launch         |
| business-analyst     | Analyze freemium vs. subscription pricing models |
```

## Sprint Execution Walkthrough

### Phase 1: Plan

```
1. Query issues:     gh issue list --state open --json number,title,labels,milestone --limit 100
2. Categorize:       Map each issue to an agent type (see registry above)
3. Find deps:        Identify ordering constraints (KMP before platform, etc.)
4. Group sprints:    4–6 issues per sprint, balanced, deps respected
5. Track in SQL:     INSERT into todos table with dependencies
```

### Phase 2: Dispatch

```
1. Dispatch all independent agents in parallel via task(..., mode: "background")
2. Each agent prompt includes: issue details, worktree path, branch name, full instructions
3. Track agent IDs: store returned agent_id values for monitoring
4. For dependency-blocked agents: wait for prerequisite agents to complete first
```

### Phase 3: Monitor

```
1. Poll each agent:  read_agent(agent_id) — check for completion
2. On completion:    Verify the agent created a PR and CI is running
3. On failure:       Read agent output, diagnose, re-dispatch or fix manually
4. Track progress:   UPDATE todos SET status = 'done' WHERE id = '...'
```

### Phase 4: Validate

```
1. All PRs open:     gh pr list --state open --json number,title,headRefName
2. All CI green:     gh pr checks [number] for each PR
3. No conflicts:     Rebase any that have fallen behind main
4. Integration:      Final npm run ci:check from the main worktree
5. Mark complete:    UPDATE todos SET status = 'done' for the sprint
```

### Phase 5: Handoff

```
1. All PRs are merge-ready (CI green, no conflicts)
2. Add "## Needs Human Action" to any PR requiring manual review decisions
3. Humans review and merge at their discretion
4. After merge confirmation: git worktree remove for each completed worktree
```

## Monitoring Dashboard Query

Use this SQL to check sprint progress at any point:

```sql
SELECT
  t.id,
  t.title,
  t.status,
  t.updated_at,
  GROUP_CONCAT(td.depends_on) as blocked_by
FROM todos t
LEFT JOIN todo_deps td ON td.todo_id = t.id
LEFT JOIN todos dep ON td.depends_on = dep.id AND dep.status != 'done'
WHERE t.id LIKE 'sprint-%'
GROUP BY t.id
ORDER BY
  CASE t.status
    WHEN 'in_progress' THEN 1
    WHEN 'blocked' THEN 2
    WHEN 'pending' THEN 3
    WHEN 'done' THEN 4
  END;
```

## Reference Files

| Resource                 | Path                          |
| ------------------------ | ----------------------------- |
| Agent definitions        | `.github/agents/*.agent.md`   |
| Skill definitions        | `.github/skills/*/SKILL.md`   |
| Worktree lifecycle guide | `docs/ai/worktrees.md`        |
| Fleet operations guide   | `docs/ai/fleet-operations.md` |
| Agent overview           | `docs/ai/agents.md`           |
| Skills overview          | `docs/ai/skills.md`           |
| AI restrictions          | `docs/ai/restrictions.md`     |
| CI/CD workflow docs      | `docs/ai/workflow.md`         |
| Project AGENTS.md        | `AGENTS.md` (repo root)       |
