---
name: fix-ci
description: Fix all failing CI checks across open PRs
parameters: []
built_ins:
  - task
agent_dependencies: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Fix CI — Repair Failing PRs

Find open PRs with failing checks, diagnose the failures, fix them, and verify the repo's CI recovers.

## Runtime Contract

This prompt requires the Copilot App/CLI `task` dispatch contract. If it is unavailable, stop before
creating a session/worktree or mutating a branch. Read root `AGENTS.md` and applicable scoped
`.github/instructions/`; in the canonical backbone, also consult source `instructions/`. Fail closed
when ownership or mutation authority cannot be proved.

## Execution Plan

### 1. Identify Failing PRs

```bash
gh pr list --state open --limit 200 --json number,title,headRefName,headRefOid,headRepositoryOwner,isCrossRepository,author,statusCheckRollup
```

Filter to PRs with non-passing checks. For each one:

```bash
gh pr checks <number> --json name,state,bucket,link,workflow
```

### 2. Prove Ownership and Authority

Before session/worktree creation, checkout, rebase, commit, push, or merge, record:

- Exact PR, head repository, head branch, and head OID.
- Evidence from the runtime/session registry that the current session created and owns the branch,
  or explicit user authorization assigning that exact branch to this session.
- The root/scoped rule that permits the intended mutation.

Author name alone is not proof of branch ownership. Fork PRs and human/shared branches are read-only
handoffs by default. An agent-authored branch from another session is also shared until explicitly
assigned. If ownership or authority is missing, inspect logs read-only and report the repair; do not
create a worktree or mutate the branch.

### 3. Categorize Failures

| Failure type | Typical fix |
| --- | --- |
| Format | Run the repo's formatter and commit the result. |
| Lint | Run the repo's linter/fixer and correct remaining findings. |
| Type-check | Fix static analysis errors. |
| Build | Fix compilation or packaging errors. |
| Test | Fix the broken code or update invalid tests. |
| Merge conflict | Rebase onto the default branch and resolve safely. |

### 4. Fix Each Authorized PR

For each authorized, current-session-owned PR, prefer an app-native isolated PR/project session. Do
not reuse another session's worktree. If app-native isolation is unavailable, require a
runtime-provided, explicitly approved worktree location that complies with root/scoped authority.
Never invent a sibling path.

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

1. **Open isolated work**
   - Reconfirm that this session owns the exact branch and OID before mutation.
   - Prefer the app-native PR/project session.
   - If the local tracking branch does not exist, create it explicitly from the remote head:
   ```bash
   git fetch origin <head-ref>:refs/remotes/origin/<head-ref>
   git branch --track <local-branch> origin/<head-ref>
   ```
   - Only in the approved fallback, attach `<local-branch>` at the runtime-provided location:
   ```bash
   git worktree add <approved-worktree-path> <local-branch>
   ```

2. **Read failing logs**
   ```bash
   gh run view <run-id> --log-failed
   ```

3. **Fix the issue**
   - Run the repo's format/lint/type-check/test/build commands relevant to the failing check.
   - Prefer the repo's documented scripts over ad hoc commands.
   - Before editing, require `git status --porcelain` to be empty. Stop on pre-existing changes.
   - For conflicts, rebase only after rechecking current-session ownership and authority.

4. **Validate locally**
   - Run the repo's lint/format/type-check/test commands that cover the touched files.
   - Inspect the changed path list and reject unexpected files.

5. **Push**
   ```bash
   git add -- <repaired-paths>
   git commit -m "fix(ci): resolve <failure-type> (#<issue>)"
   git fetch origin <default-branch>
   git rebase origin/<default-branch>
   git push --force-with-lease origin <branch>
   ```
   Stage only known repaired paths after the clean-tree check. Never amend unless the user explicitly
   requests it and local authority permits it. Use `--force-with-lease` only when the runtime record
   still proves this exact branch is current-session-owned and authorized; otherwise stop and hand
   off.

6. **Verify**
   ```bash
   gh pr checks <number> --watch
   gh pr view <number> --json mergeable,mergeStateStatus,author
   ```

7. **Merge or hand off**
   - Self-merge only when root/scoped `AGENTS.md` permits it, the current session owns the PR, every
     required check is green, the PR is conflict-free, and GitHub reports it mergeable.
   - Fork, human, shared, unowned, or unauthorized PR: leave a read-only handoff.
"""
)
````

### 5. Report

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

Never use plain `git push --force`.
