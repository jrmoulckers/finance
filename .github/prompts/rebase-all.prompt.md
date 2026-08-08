---
name: rebase-all
description: Rebase all open PRs onto the latest default branch
parameters: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Rebase All — Sync Every Open PR

Fetch the latest default branch and rebase open PRs onto it so conflicts do not accumulate.

## Execution Plan

### 1. Fetch and Inventory

```bash
git fetch origin <default-branch>
gh pr list --state open --limit 200 --json number,title,headRefName,mergeable,statusCheckRollup
```

List open PRs and note existing conflicts.

### 2. Rebase Each PR

Process PRs sequentially to avoid worktree conflicts.

```bash
# If a worktree already exists for the branch, use it.
git worktree list
cd <existing-worktree>

# Otherwise create one.
git fetch origin <branch>
git worktree add ../wt-rebase-<number> <branch>
cd ../wt-rebase-<number>
```

Then rebase:

```bash
git fetch origin <default-branch>
git rebase origin/<default-branch>
```

If the rebase succeeds:

1. Run the repo's relevant format/lint/type-check/test commands.
2. Push with lease:
   ```bash
   git push --force-with-lease origin <branch>
   ```
3. Verify CI and mergeability:
   ```bash
   gh pr checks <number>
   gh pr view <number> --json mergeable,mergeStateStatus
   ```

If conflicts occur:

1. Auto-resolve only trivial conflicts you understand: whitespace, import order, regenerated artifacts, or lockfiles that can be recreated by the repo's package manager.
2. For semantic conflicts, abort and flag for human review:
   ```bash
   git rebase --abort
   ```
3. Record the conflicting files and recommended owner.

### 3. Clean Up

Remove only temporary worktrees created for this run after their PRs are pushed or safely aborted:

```bash
git worktree remove ../wt-rebase-<number>
```

### 4. Report

```markdown
## Rebase Report

### Successfully Rebased: X PRs
| PR | Branch | CI Status |
| --- | --- | --- |
| ... |

### Conflicts (Needs Human): X PRs
| PR | Branch | Conflicting Files |
| --- | --- | --- |
| ... |

### Already Up-to-Date: X PRs
| PR | Branch |
| --- | --- |
| ... |
```

Use `--force-with-lease` only for rebased PR branches you own or are authorized to repair. Never use plain `git push --force`.
