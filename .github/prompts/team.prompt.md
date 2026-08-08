---
name: team
description: Deploy specific agent types for targeted work across N sprints
parameters:
  - name: agents
    description: Comma-separated list of agent types (e.g., backend-engineer, web-engineer, docs-writer)
    default: ''
  - name: N
    description: Number of sprints to execute
    default: 2
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Team — Targeted Agent Deployment

Deploy only the requested agent types — **{{ agents }}** — for **{{ N }}** sprint waves.

## Execution Plan

### 1. Sync and Filter

```bash
git fetch origin <default-branch>
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees
gh pr list --state open --limit 200 --json number,title,headRefName,statusCheckRollup
```

- Parse `agents` into a list of agent types.
- Map each agent to likely issues using labels, file ownership in `AGENTS.md`, and materialized
  `.github/agents/` metadata (`agents/` is the backbone-only canonical source).
- Exclude issues already claimed by open PRs.

### 2. Plan and Deploy

For each sprint:

1. Select one focused issue per requested agent type.
2. Dispatch agents in parallel, one per assignment.
3. Each agent follows the sprint workflow:
   - Create/resume a worktree from the default branch.
   - Implement with tests and scoped changes.
   - Run the repo's relevant format/lint/type-check/test/build commands.
   - Rebase, push, and create a PR with `Closes #N`.
   - Monitor CI; if it fails, read logs, fix, and re-push.
   - Self-merge only the agent's own PR once CI is green and the PR is `MERGEABLE`.

### 3. Monitor and Report

- Poll completions with `read_agent` / `list_agents`.
- Track assignments in SQL todos.
- Diagnose, re-dispatch, or escalate failures.
- Report issues addressed per agent type, PR status, blockers, and remaining scoped backlog.
