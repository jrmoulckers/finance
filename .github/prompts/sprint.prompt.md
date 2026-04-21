---
name: sprint
description: Deploy N full sprints across all agent types in parallel waves
parameters:
  - name: N
    description: Number of sprints to execute
    default: 3
---

# Sprint — Full Fleet Deployment

Deploy **{{ N }}** sprints across all agent types. Each sprint dispatches up to 15 agents in parallel, each working in its own worktree with full CI validation.

## Execution Plan

### Phase 1: Sync and Assess

```bash
git fetch origin main
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees
gh pr list --state open --json number,title,headRefName,statusCheckRollup
```

- Pull latest `origin/main` so all worktrees rebase cleanly.
- Query the full open issue backlog and open PRs.
- Identify issues already claimed by open PRs to avoid duplicates.

### Phase 2: Plan Sprint Waves

For each sprint (1 through {{ N }}):

1. **Categorize unclaimed issues** by agent type using labels and file paths:

   | Label / Path                   | Agent Type          |
   | ------------------------------ | ------------------- |
   | `platform:android`             | `android-engineer`  |
   | `platform:ios`                 | `ios-engineer`      |
   | `platform:web`                 | `web-engineer`      |
   | `platform:windows`             | `windows-engineer`  |
   | `platform:shared`, `comp:sync` | `kmp-engineer`      |
   | `ci`, `infrastructure`         | `devops-engineer`   |
   | `documentation`                | `docs-writer`       |
   | `design-system`                | `design-engineer`   |
   | `security`                     | `security-reviewer` |
   | `business`, `product`          | `product-manager`   |

2. **Select 1 issue per agent type** (up to 15 agents per wave).
3. **Track assignments** in SQL todos to prevent double-dispatch.

### Phase 3: Deploy Agents in Parallel

For each agent in the wave, dispatch via the `task` tool:

````
task(
  agent_type="<agent-type>",
  name="s{{ sprint }}-<agent>-<issue#>",
  description="Sprint {{ sprint }}: <title>",
  prompt="""
You are the <agent-type> for the Finance monorepo.

## Your Assignment
Issue: #<number> — <title>
<issue body>

## Workflow (MANDATORY — follow every step)

### 1. Setup Worktree
```bash
cd G:\\personal\\finance
git fetch origin main
git worktree add ../wt-<agent>-<type>/<desc>-<issue#> -b <type>/<desc>-<issue#> origin/main
cd ../wt-<agent>-<type>/<desc>-<issue#>
npm install
````

### 2. Implement

- Read the issue requirements fully before writing code.
- Follow platform conventions from `.github/instructions/`.
- Write tests alongside implementation.
- Commit with: `type(scope): description (#<issue>)`

### 3. Pre-Push Checklist (NEVER SKIP)

```bash
npm run format
npx eslint . --fix
npm run ci:check
# If ci:check fails, fix and re-run until clean
git add -A && git commit --amend --no-edit
```

### 4. Rebase and Push

```bash
git fetch origin main
git rebase origin/main
git push origin <branch-name>
```

### 5. Create PR

```bash
gh pr create --title "type(scope): description (#<issue>)" \
  --body "## Summary\n<description>\n\n## Changes\n- <bullets>\n\nCloses #<issue>" \
  --base main
```

### 6. Monitor CI

```bash
gh pr checks <pr-number> --watch
```

If CI fails: read logs, fix locally, re-run step 3, push, repeat.
"""
)

````

### Phase 4: Monitor Completions

After dispatching all agents in a wave:

1. **Poll agent status** using `read_agent` / `list_agents`.
2. **Track results** in SQL:
   ```sql
   UPDATE todos SET status = 'done' WHERE id = '<todo-id>';
````

3. **Handle failures**: If an agent fails, read its output, diagnose, and re-dispatch or fix manually.
4. **Validate PRs**: For each completed PR, verify CI is green via `gh pr checks`.

### Phase 5: Repeat for Next Sprint

After wave N completes, repeat Phases 2–4 for the next sprint with remaining unclaimed issues.

### Phase 6: Summary Report

After all {{ N }} sprints complete, produce:

- Total issues addressed
- PRs opened (with links)
- CI status per PR
- Any failures or blocked items
- Remaining backlog size
