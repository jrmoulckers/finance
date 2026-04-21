---
name: rebase-all
description: Rebase all open PRs onto latest main
parameters: []
---

# Rebase All — Sync Every Open PR with Main

Fetch the latest `main` branch and rebase every open PR onto it. This keeps all in-flight work up to date and avoids merge conflicts accumulating.

## Execution Plan

### Phase 1: Fetch and Inventory

```bash
git fetch origin main
gh pr list --state open --json number,title,headRefName,mergeable,statusCheckRollup
```

List all open PRs. Note which ones already have merge conflicts (`mergeable: "CONFLICTING"`).

### Phase 2: Rebase Each PR

For each open PR, process sequentially to avoid worktree conflicts:

```bash
# If a worktree already exists for this branch:
git worktree list | grep <branch>
cd <existing-worktree>

# Otherwise create a temporary worktree:
cd G:\personal\finance
git fetch origin <branch>
git worktree add ../wt-rebase-<number> <branch>
cd ../wt-rebase-<number>
```

Then rebase:

```bash
git fetch origin main
git rebase origin/main
```

**If rebase succeeds cleanly:**

```bash
npm run format
npx eslint . --fix
npm run ci:check
# Only push if ci:check passes:
git push origin <branch> --force-with-lease
```

**If rebase has conflicts:**

1. Attempt auto-resolution for trivial conflicts (whitespace, import order).
2. For non-trivial conflicts, abort the rebase and flag for human review:
   ```bash
   git rebase --abort
   ```
3. Record the PR as needing manual conflict resolution.

### Phase 3: Clean Up Temporary Worktrees

```bash
# Remove any worktrees created just for rebasing
git worktree remove ../wt-rebase-<number>
```

### Phase 4: Report

```
## Rebase Report

### Successfully Rebased: X PRs
| PR | Branch | CI Status |
|----|--------|-----------|
| ... |

### Conflicts (needs human): X PRs
| PR | Branch | Conflicting Files |
|----|--------|-------------------|
| ... |

### Already Up-to-Date: X PRs
| PR | Branch |
|----|--------|
| ... |
```

> **Note**: `--force-with-lease` is used because rebasing rewrites history on feature branches. This is standard practice for feature branches but requires human approval per project rules. If the push is blocked, document the rebase status and flag for human push.
