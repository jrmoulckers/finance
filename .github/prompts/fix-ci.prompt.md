---
name: fix-ci
description: Fix all failing CI checks across open PRs
parameters: []
---

# Fix CI — Repair All Failing PRs

Find every open PR with failing CI checks, diagnose the failures, and fix them.

## Execution Plan

### Phase 1: Identify Failing PRs

```bash
gh pr list --state open --json number,title,headRefName,author,statusCheckRollup
```

Filter to PRs where `statusCheckRollup` contains any non-passing checks. For each failing PR, get detailed check info:

```bash
gh pr checks <number> --json name,state,conclusion,detailsUrl
```

### Phase 2: Categorize Failures

Group PRs by failure type to enable efficient batch fixing:

| Failure Type     | Typical Fix                                     |
| ---------------- | ----------------------------------------------- |
| `format:check`   | Run `npm run format` and commit                 |
| `lint`           | Run `npx eslint . --fix` and commit             |
| `type-check`     | Fix TypeScript errors                           |
| `build`          | Fix compilation errors                          |
| `test`           | Fix failing tests                               |
| `merge-conflict` | Rebase onto `origin/main` and resolve conflicts |

### Phase 3: Dispatch Fix Agents

For each failing PR, dispatch a fix agent (batch by agent type when possible):

````
task(
  agent_type="<appropriate-agent>",
  name="fix-ci-<pr-number>",
  description="Fix CI for PR #<number>",
  prompt="""
Fix the CI failures on PR #<number> (branch: <branch>).

## Failing Checks
<list of failing checks and their log output>

## Workflow

### 1. Enter the Worktree
```bash
cd <worktree-path-for-this-branch>
# OR if no worktree exists:
cd G:\\personal\\finance
git fetch origin <branch>
git worktree add ../wt-fix-ci-<number> <branch>
cd ../wt-fix-ci-<number>
npm install
````

### 2. Read Failure Logs

```bash
gh run view <run-id> --log-failed
```

### 3. Fix the Issues

- For format failures: `npm run format`
- For lint failures: `npx eslint . --fix`
- For type errors: fix the TypeScript issues
- For test failures: fix the failing tests
- For merge conflicts: `git fetch origin main && git rebase origin/main`

### 4. Validate the Fix

```bash
npm run format
npx eslint . --fix
npm run ci:check
```

### 5. Push

```bash
git add -A
git commit --amend --no-edit
# OR: git commit -m "fix(ci): resolve <failure-type> (#<issue>)"
git fetch origin main
git rebase origin/main
git push origin <branch> --force-with-lease
```

### 6. Verify

```bash
gh pr checks <number> --watch
```

"""
)

```

### Phase 4: Report

After all fix agents complete:

```

## CI Fix Report

### Fixed: X PRs

| PR  | Branch | Failure | Fix Applied | CI Now |
| --- | ------ | ------- | ----------- | ------ |
| ... |

### Still Failing: X PRs (needs human attention)

| PR  | Branch | Failure | Reason |
| --- | ------ | ------- | ------ |
| ... |

```

> **Note**: `--force-with-lease` is used here because we're amending commits on feature branches to fix CI. This is safe for agent-owned branches but requires human approval per project rules. If the agent cannot push, it should document the fix and flag for human push.
```
