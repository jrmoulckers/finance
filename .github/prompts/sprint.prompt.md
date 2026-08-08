---
name: sprint
description: Deploy N full sprints across agent types in parallel waves
parameters:
  - name: N
    description: Number of sprints to execute
    default: 3
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Sprint — Fleet Deployment

Deploy **{{ N }}** sprint waves across the product's agent types. Each agent works in its own worktree, opens a PR, watches CI, and self-merges only after the quality gate passes.

## Execution Plan

### 1. Sync and Assess

```bash
git fetch origin <default-branch>
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees
gh pr list --state open --limit 200 --json number,title,headRefName,statusCheckRollup
```

- Start from the latest default branch.
- Query open issues and PRs.
- Exclude issues already claimed by open PRs.

### 2. Plan Sprint Waves

For each sprint:

1. Categorize unclaimed issues by labels, affected files, and the ownership tables in `AGENTS.md`
   and `.github/agents/` (`agents/` in the canonical backbone).
2. Select one focused issue per available agent type, limiting each wave to the number the repo can safely validate in parallel.
3. Batch small related issues only when they touch the same files and keep the PR focused.
4. Track assignments in SQL todos to prevent double-dispatch.
5. Publish a recommended merge order for dependent PRs: schema/contracts first, shared APIs next, build/CI config before leaf app or docs work.

### 3. Deploy Agents in Parallel

For each assignment:

````
task(
  agent_type="<agent-type>",
  name="s{{ sprint }}-<agent>-<issue#>",
  description="Sprint {{ sprint }}: <title>",
  prompt="""
You are the <agent-type> for this product repository.

## Assignment
Issue: #<number> — <title>
<issue body>

## Workflow

1. **Setup worktree**
   ```bash
   git fetch origin <default-branch>
   git worktree add ../wt-<agent>-<type>-<issue#> -b <type>/<short-description>-<issue#> origin/<default-branch>
   cd ../wt-<agent>-<type>-<issue#>
   ```

2. **Implement**
   - Read the issue fully before changing files.
   - Follow `AGENTS.md`, relevant `.github/agents/`, and relevant `.github/instructions/`.
   - Keep the diff scoped and write/update tests where behavior changes.
   - Commit with `type(scope): description (#<issue>)`.

3. **Validate**
   - Run the repo's documented format/lint/type-check/test/build commands for the affected surface.
   - Fix failures before pushing.

4. **Rebase and push**
   ```bash
   git fetch origin <default-branch>
   git rebase origin/<default-branch>
   git push origin <branch-name>
   ```

5. **Create PR**
   ```bash
   gh pr create --base <default-branch> --title "type(scope): description (#<issue>)" --body "## Summary
   <description>

   ## Changes
   - <bullets>

   Closes #<issue>"
   ```

6. **Monitor CI**
   ```bash
   gh pr checks <pr-number> --watch
   gh pr view <pr-number> --json mergeable,mergeStateStatus
   ```
   If CI fails, read logs with `gh run view --log-failed`, fix locally, re-validate, and push again.

7. **Self-merge and clean up**
   Once CI is green and the PR is `MERGEABLE`, merge your own PR if permitted by `AGENTS.md`, then remove the worktree.
"""
)
````

### 4. Monitor Completion

- Poll agents via `read_agent` / `list_agents`.
- Update SQL todos as work moves from pending → in_progress → done/blocked.
- Re-dispatch or manually fix failed agents.
- Verify every PR has green CI and is mergeable before declaring the sprint complete.

### 5. Repeat and Report

After all **{{ N }}** waves:

- Issues addressed.
- PRs opened/merged with CI status.
- Failures, blockers, and `## Needs Human Action` items.
- Remaining backlog by owner/agent type.
