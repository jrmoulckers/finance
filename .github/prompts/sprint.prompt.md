---
name: sprint
description: Deploy N full sprints across agent types in parallel waves
parameters:
  - name: N
    type: integer
    description: Number of sprints to execute
    default: 2
    minimum: 1
    maximum: 3
  - name: max-parallel
    type: integer
    description: Maximum concurrent assignments in a sprint wave
    default: 3
    minimum: 1
    maximum: 5
built_ins:
  - task
  - read_agent
  - list_agents
  - sql_todos
agent_dependencies: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Sprint — Fleet Deployment

Deploy at most **{{ N }}** bounded sprint waves with no more than **{{ max-parallel }}** concurrent
assignments per wave.

## Runtime Contract

This prompt requires Copilot App/CLI parameter interpolation, `task` dispatch, agent polling through
`read_agent` / `list_agents`, and SQL todos. These are runtime contracts, not custom-agent slugs.
Validate `{{ N }}` and `{{ max-parallel }}` as positive integers within their declared bounds before
fetching or dispatching. If any required capability or interpolation is unavailable, stop before
dispatch or mutation.

## Execution Plan

### 1. Resolve Local Authority and Applicable Roster

Read root `AGENTS.md`, every scoped `AGENTS.md` applicable to candidate work, and applicable consumer
`.github/instructions/`. In the canonical backbone, also consult source `instructions/`.

Build the dispatch roster from canonical plus declared-local slugs, then exclude roles that local
routing marks disabled, read-only for the proposed implementation, handoff-only, outside ownership,
or otherwise inapplicable. File presence under `.github/agents/` is discovery evidence, not dispatch
authority. If the repository is infrastructure or pre-bootstrap, dispatch only when a local
infrastructure-safe override explicitly permits the role and work; otherwise stop with a handoff.

### 2. Sync and Assess

```bash
git fetch origin <default-branch>
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees,updatedAt
gh pr list --state open --limit 200 --json number,title,headRefName,statusCheckRollup,closingIssuesReferences
```

- Start from the latest default branch.
- Query open issues and PRs.
- Exclude issues already claimed by open PRs.

### 3. Plan Sprint Waves

For each sprint:

1. Categorize unclaimed issues using collected `closingIssuesReferences`, labels, affected files,
   and the resolved local ownership/routing overlay.
2. Select one focused issue per applicable agent type, capped at `{{ max-parallel }}` assignments.
3. Batch small related issues only when they touch the same files and keep the PR focused.
4. Track assignments in SQL todos to prevent double-dispatch.
5. Publish a recommended merge order for dependent PRs: schema/contracts first, shared APIs next, build/CI config before leaf app or docs work.

### 4. Deploy Agents in Parallel

For each assignment:

````
task(
  agent_type="<agent-type>",
  name="wave-<wave-number>-<agent>-<issue-number>",
  description="Sprint wave <wave-number>: <title>",
  prompt="""
You are the <agent-type> for this product repository.

## Assignment
Issue: #<number> — <title>
<issue body>

## Workflow

1. **Open isolated work**
   - Prefer an app-native isolated project session/worktree created from the current default branch.
   - Otherwise require a runtime-provided, explicitly approved worktree location allowed by
     root/scoped authority. Never invent a sibling path.
   - Record the created session, path, branch, and issue as current-session-owned before mutation.

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
   Self-merge only when root/scoped `AGENTS.md` permits it, this session owns the PR, all required
   checks are green, the PR is conflict-free, and GitHub reports it mergeable. Remove only the exact
   worktree created and owned by this session.
"""
)
````

### 5. Monitor Completion

- Poll agents via `read_agent` / `list_agents`.
- Update SQL todos as work moves from pending → in_progress → done/blocked.
- Re-dispatch or manually fix failed agents.
- Verify every PR has green CI and is mergeable before declaring the sprint complete.

### 6. Repeat and Report

After all **{{ N }}** waves:

- Issues addressed.
- PRs opened/merged with CI status.
- Failures, blockers, and `## Needs Human Action` items.
- Remaining backlog by owner/agent type.
