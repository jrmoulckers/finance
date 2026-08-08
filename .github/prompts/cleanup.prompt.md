---
name: cleanup
description: Clean up the project — prune worktrees, identify stale PRs and issues
parameters:
  - name: stale-days
    description: Number of days of inactivity before a PR or issue is considered stale
    default: 30
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Cleanup — Project Hygiene

Identify stale worktrees, PRs, issues, and branches. Do not perform destructive remote operations without human approval.

## Execution Plan

### 1. Prune Stale Worktrees

```bash
git worktree list
git worktree prune
```

Flag worktrees whose branches are merged, deleted on the remote, or no longer have an open PR. Remove only worktrees you created and can prove are safe.

### 2. Identify Stale Pull Requests

```bash
gh pr list --state open --limit 200 --json number,title,headRefName,author,createdAt,updatedAt,isDraft,statusCheckRollup,mergeable,reviewDecision
```

Flag PRs that:

- Have not been updated in **{{ stale-days }}** days.
- Have failing CI with no recent fix attempt.
- Have merge conflicts older than 7 days.
- Are drafts with no activity.

Report PR number, title, author, last activity, CI status, and recommended action: close / rebase / nudge author / keep.

> Do **not** close PRs automatically. List recommendations for human review unless the PR is yours and the repo rules explicitly allow closure.

### 3. Identify Stale Issues

```bash
gh issue list --state open --limit 200 --json number,title,labels,createdAt,updatedAt,assignees
```

Flag issues that:

- Have not been updated in **{{ stale-days }}** days and have no linked PR.
- Are assigned but inactive.
- Have no labels or missing owner.

### 4. Check for Duplicates

Group issues by similar titles, labels, components, or linked files. Flag likely duplicates for human triage.

### 5. Branch Cleanup

```bash
git fetch --prune origin
git branch -r --merged origin/<default-branch>
```

List remote branches already merged to the default branch. Remote deletion is human-gated unless the repo's rules explicitly grant it.

### 6. Report

```markdown
## Cleanup Report

### Worktrees
- Pruned: X
- Active: Y
- Needs manual cleanup: Z

### Stale PRs ({{ stale-days }}+ days inactive)
| PR | Title | Last Activity | CI | Action |
| --- | --- | --- | --- | --- |
| ... |

### Stale Issues ({{ stale-days }}+ days inactive)
| # | Title | Labels | Last Activity | Action |
| --- | --- | --- | --- | --- |
| ... |

### Potential Duplicates
| Issue A | Issue B | Similarity | Recommendation |
| --- | --- | --- | --- |
| ... |

### Merged Branches
| Branch | Merged PR / Evidence |
| --- | --- |
| ... |

### Recommendations
- [ ] Close or update stale PRs listed above.
- [ ] Close or relabel stale issues listed above.
- [ ] Delete merged branches after human approval.
- [ ] Review duplicate candidates.
```
