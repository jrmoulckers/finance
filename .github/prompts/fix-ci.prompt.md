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
cd <path-to-main-checkout>   # the primary clone; sibling worktrees are created next to it
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
npm run format:check && npx eslint . --max-warnings 0   # NOT ci:check — type-check fails locally
```

### 5. Push

```bash
git add -A
git commit --amend --no-edit
# OR: git commit -m "fix(ci): resolve <failure-type> (#<issue>)"
git fetch origin main
git rebase origin/main
$env:HUSKY = "0"; git push --no-verify --force-with-lease origin <branch>   # bypass pre-push hook; force-with-lease re-pushes the rebased branch
```

### 6. Verify

```bash
gh pr checks <number> --watch
```

### 7. Merge or Hand Off

Once CI is green **and** the PR is `MERGEABLE` (`gh pr view <number> --json mergeable,mergeStateStatus,author`):

- **Agent-authored / fleet PR** — the orchestrator self-merges in the recommended merge order: `gh pr merge <number> --squash` (`AGENTS.md` Category 2).
- **Human-authored PR** — do **not** merge; leave it green and note that it is ready for its author.

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

> **Note**: `--force-with-lease` re-pushes the amended/rebased commits on the PR's own feature branch. Per `AGENTS.md` Category 1, force-with-lease on an agent's **own** branch (to re-push after a rebase or conflict resolution) is **auto-approved** — no human approval needed. Never use plain `git push --force`.
```
