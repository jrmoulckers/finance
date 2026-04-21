---
name: team
description: Deploy specific agent types for targeted work across N sprints
parameters:
  - name: agents
    description: Comma-separated list of agent types (e.g., android-engineer, ios-engineer, web-engineer)
    default: ''
  - name: N
    description: Number of sprints to execute
    default: 2
---

# Team — Targeted Agent Deployment

Deploy only the specified agent types — **{{ agents }}** — for **{{ N }}** sprints. Same workflow as the full sprint prompt, but scoped to the requested team.

## Execution Plan

### Phase 1: Sync and Filter

```bash
git fetch origin main
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees
gh pr list --state open --json number,title,headRefName,statusCheckRollup
```

- Parse the `agents` parameter into a list of agent types.
- Map each agent type to its label/path filter:

  | Agent Type             | Issue Filter                    |
  | ---------------------- | ------------------------------- |
  | `android-engineer`     | `platform:android`              |
  | `ios-engineer`         | `platform:ios`                  |
  | `web-engineer`         | `platform:web`                  |
  | `windows-engineer`     | `platform:windows`              |
  | `kmp-engineer`         | `platform:shared`, `comp:sync`  |
  | `backend-engineer`     | `comp:backend`, `comp:supabase` |
  | `devops-engineer`      | `ci`, `infrastructure`          |
  | `docs-writer`          | `documentation`                 |
  | `design-engineer`      | `design-system`                 |
  | `security-reviewer`    | `security`                      |
  | `product-manager`      | `business`, `product`           |
  | `marketing-strategist` | `marketing`                     |
  | `business-analyst`     | `monetization`, `pricing`       |

- Filter the issue backlog to only issues matching the requested agent types.
- Exclude issues already claimed by open PRs.

### Phase 2: Plan and Deploy

For each sprint (1 through {{ N }}):

1. **Select 1 issue per requested agent type** from the filtered backlog.
2. **Dispatch agents in parallel** using the `task` tool — one per agent type.

Each agent follows the identical workflow from the sprint prompt:

1. **Setup worktree** from `origin/main`
2. **Implement** the assigned issue with tests
3. **Pre-push checklist**: `npm run format` → `npx eslint . --fix` → `npm run ci:check`
4. **Rebase and push**: `git fetch origin main && git rebase origin/main && git push`
5. **Create PR** with `gh pr create` and `Closes #N`
6. **Monitor CI** until green

### Phase 3: Monitor and Report

- Poll agent completions via `read_agent` / `list_agents`.
- Track each in SQL todos.
- For failures: diagnose, re-dispatch, or escalate.
- After all waves complete, report:
  - Issues addressed per agent type
  - PRs opened with CI status
  - Remaining backlog for the scoped agent types
