---
name: fix-ci
description: Fix all failing CI checks across open PRs
parameters: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Fix CI — Repair Failing PRs

Find open PRs with failing checks, diagnose the failures, fix them, and verify the repo's CI recovers.

## Execution Plan

### 1. Identify Failing PRs

```bash
gh pr list --state open --limit 200 --json number,title,headRefName,author,statusCheckRollup
```

Filter to PRs with non-passing checks. For each one:

```bash
gh pr checks <number> --json name,state,conclusion,detailsUrl
```

### 2. Categorize Failures

| Failure type | Typical fix |
| --- | --- |
| Format | Run the repo's formatter and commit the result. |
| Lint | Run the repo's linter/fixer and correct remaining findings. |
| Type-check | Fix static analysis errors. |
| Build | Fix compilation or packaging errors. |
| Test | Fix the broken code or update invalid tests. |
| Merge conflict | Rebase onto the default branch and resolve safely. |

### 3. Fix Each PR

For each failing PR, work in its existing worktree or create one from the PR branch:

````
task(
  agent_type="task",
  name="fix-ci-<pr-number>",
  description="Fix CI for PR #<number>",
  prompt="""
Fix CI failures on PR #<number> (branch: <branch>).

## Failing Checks
<list failing checks and relevant log excerpts>

## Workflow

1. **Enter the worktree**
   ```bash
   git fetch origin <branch>
   git worktree add ../wt-fix-ci-<number> <branch>
   cd ../wt-fix-ci-<number>
   ```
   If a worktree already exists for this branch, use it instead.

2. **Read failing logs**
   ```bash
   gh run view <run-id> --log-failed
   ```

3. **Fix the issue**
   - Run the repo's format/lint/type-check/test/build commands relevant to the failing check.
   - Prefer the repo's documented scripts over ad hoc commands.
   - For conflicts: `git fetch origin <default-branch>` then rebase and resolve only conflicts you understand.

4. **Validate locally**
   - Run the repo's lint/format/type-check/test commands that cover the touched files.
   - Keep the working tree clean.

5. **Push**
   ```bash
   git add -A
   git commit -m "fix(ci): resolve <failure-type> (#<issue>)"
   git fetch origin <default-branch>
   git rebase origin/<default-branch>
   git push --force-with-lease origin <branch>
   ```
   Amend instead of creating a new commit when that is the repo's convention for the PR.

6. **Verify**
   ```bash
   gh pr checks <number> --watch
   gh pr view <number> --json mergeable,mergeStateStatus,author
   ```

7. **Merge or hand off**
   - Agent-authored PR: self-merge once CI is green and the PR is `MERGEABLE`.
   - Human-authored PR: leave it green and report that it is ready for the author.
"""
)
````

### 4. Report

```markdown
## CI Fix Report

### Fixed: X PRs
| PR | Branch | Failure | Fix Applied | CI Now |
| --- | --- | --- | --- | --- |
| ... |

### Still Failing: X PRs
| PR | Branch | Failure | Reason / Needs Human Action |
| --- | --- | --- | --- |
| ... |
```

Use `--force-with-lease` only on the PR branch you are repairing. Never use plain `git push --force`.
