---
name: cleanup
description: Clean up the project — prune worktrees, identify stale PRs and issues
parameters:
  - name: stale-days
    description: Number of days of inactivity before a PR or issue is considered stale
    default: 30
---

# Cleanup — Project Hygiene

Clean up stale worktrees, PRs, issues, and other project debris.

## Execution Plan

### 1. Prune Stale Worktrees

```bash
npm run cleanup:worktrees
```

This runs `node tools/cleanup-worktrees.js` which:

- Scans all worktrees
- Identifies branches that are merged to main or deleted on remote
- Reports which worktrees can be safely removed

Review the output. For worktrees confirmed safe to remove:

```bash
node tools/cleanup-worktrees.js --force
```

Also check for orphaned worktrees (worktree directory exists but git metadata is broken):

```bash
git worktree list
git worktree prune
```

### 2. Identify Stale Pull Requests

```bash
gh pr list --state open --json number,title,headRefName,author,createdAt,updatedAt,statusCheckRollup
```

Flag PRs that:

- Have not been updated in **{{ stale-days }}** days
- Have failing CI with no recent fix attempts
- Have merge conflicts that have persisted for over 7 days
- Are draft PRs with no activity

For each stale PR, report:

- PR number, title, author
- Last activity date
- Current CI status
- Recommended action: close / rebase / nudge author

> **Do NOT close PRs automatically.** List them for human review with recommendations.

### 3. Identify Stale Issues

```bash
gh issue list --state open --limit 200 --json number,title,labels,createdAt,updatedAt,assignees
```

Flag issues that:

- Have not been updated in **{{ stale-days }}** days and have no linked PR
- Are assigned but have no activity
- Have no labels (may be untriaged)

### 4. Check for Duplicate Issues

Scan issue titles for potential duplicates:

- Group issues by similar keywords
- Flag pairs with high title similarity
- Check if multiple issues reference the same component/feature

### 5. Branch Cleanup

```bash
git fetch --prune origin
git branch -r --merged origin/main
```

List remote branches that are merged to main but not yet deleted. These are safe to clean up (but flag for human deletion since this is a remote operation).

### 6. Report

```
## 🧹 Cleanup Report

### Worktrees
- Pruned: X worktrees removed
- Active: Y worktrees still in use
- Orphaned: Z worktrees need manual cleanup

### Stale PRs ({{ stale-days }}+ days inactive)
| PR | Title | Last Activity | CI | Action |
|----|-------|---------------|-----|--------|
| ... |

### Stale Issues ({{ stale-days }}+ days inactive)
| # | Title | Labels | Last Activity | Action |
|---|-------|--------|---------------|--------|
| ... |

### Potential Duplicates
| Issue A | Issue B | Similarity | Recommendation |
|---------|---------|-----------|----------------|
| ... |

### Merged Branches (safe to delete)
| Branch | Merged PR |
|--------|-----------|
| ... |

### Recommendations
- [ ] Close X stale PRs (listed above)
- [ ] Close Y stale issues (listed above)
- [ ] Delete Z merged branches
- [ ] Review N potential duplicate issues
```
