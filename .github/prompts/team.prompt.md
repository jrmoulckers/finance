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
- Map each requested agent type to its issue filter using the canonical **label → agent map** in the `sprint-planning` skill (`.github/skills/sprint-planning/SKILL.md` → "Issue-to-Agent Mapping Algorithm" → Step 2) — the single source of truth for all 25 agent types. Invert it (agent → its labels) to filter the backlog for each requested agent.

- Filter the issue backlog to only issues matching the requested agent types.
- Exclude issues already claimed by open PRs.

### Phase 2: Plan and Deploy

For each sprint (1 through {{ N }}):

1. **Select 1 issue per requested agent type** from the filtered backlog.
2. **Dispatch agents in parallel** using the `task` tool — one per agent type.

Each agent follows the identical workflow from the sprint prompt:

1. **Setup worktree** from `origin/main`
2. **Implement** the assigned issue with tests
3. **Pre-push checklist**: `npm run format` → `npx eslint . --fix` → `npm run format:check && npx eslint . --max-warnings 0` (NOT `ci:check` — type-check fails locally)
4. **Rebase and push**: `git fetch origin main && git rebase origin/main`, then `$env:HUSKY = "0"; git push --no-verify origin <branch>`
5. **Create PR** with `gh pr create --base main` and `Closes #N`
6. **Monitor CI**, then **self-merge** (`gh pr merge <pr> --squash`) once green and `MERGEABLE`, and remove the worktree

### Phase 3: Monitor and Report

- Poll agent completions via `read_agent` / `list_agents`.
- Track each in SQL todos.
- For failures: diagnose, re-dispatch, or escalate.
- After all waves complete, report:
  - Issues addressed per agent type
  - PRs opened with CI status
  - Remaining backlog for the scoped agent types
