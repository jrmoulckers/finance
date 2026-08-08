---
name: cleanup
description: Clean up the project — prune worktrees, identify stale PRs and issues
parameters:
  - name: stale-days
    type: integer
    description: Number of days of inactivity before a PR or issue is considered stale
    default: 30
    minimum: 1
    maximum: 365
built_ins: []
agent_dependencies: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Cleanup — Project Hygiene

Inventory stale worktrees, PRs, issues, and branches before considering any mutation.

## Runtime Contract

Require parameter interpolation and validate `{{ stale-days }}` as an integer within its declared
bounds. If interpolation is unavailable or the value is invalid, stop before inventory or mutation.
Read root `AGENTS.md` and applicable scoped `.github/instructions/` first. In the canonical
backbone, also consult source `instructions/`. Those local authorities decide whether cleanup is
allowed; use the more restrictive rule.

## Execution Plan

### 1. Audit Worktrees Without Mutation

```bash
git worktree list --porcelain
git worktree prune --dry-run --verbose
```

Record each worktree's path, branch, cleanliness, owning session, and evidence. Flag stale candidates,
but do not remove or prune anything. A path or branch name is not ownership proof; the current
runtime/session registry must show that this session created and owns the worktree.

### 2. Identify Stale Pull Requests

```bash
gh pr list --state open --limit 200 --json number,title,headRefName,author,createdAt,updatedAt,isDraft,statusCheckRollup,mergeable,reviewDecision,closingIssuesReferences
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

- Have not been updated in **{{ stale-days }}** days.
- Are assigned but inactive.
- Have no labels or missing owner.

Report an issue as linked only when that issue appears in a collected PR's
`closingIssuesReferences`; never infer linkage.

### 4. Check for Duplicates

Group issues by similar titles, labels, components, or linked files. Flag likely duplicates for human triage.

### 5. Branch Cleanup

```bash
git fetch origin <default-branch>
git branch -r --merged origin/<default-branch>
```

List remote branches already merged to the default branch. Do not delete local or remote branches
during the audit.

### 6. Authority Gate and Targeted Cleanup

Present the inventory and determine applicable authority before any cleanup:

1. Proceed only when root/scoped local rules permit cleanup and the user/runtime grants the required
   authority.
2. Remove only a specific clean worktree that the current session created and still owns, using its
   exact runtime-recorded path:
   ```bash
   git worktree remove <approved-owned-worktree-path>
   ```
3. Never recursively delete a path and never remove an unowned, shared, human-created, or unknown
   worktree.
4. `git worktree prune` is repository-wide. Run it only when its dry-run output contains exclusively
   current-session-owned stale metadata and local authority permits it; otherwise leave the metadata
   for a human handoff.
5. Delete a local branch only when the current session owns it, it is fully merged, its worktree has
   been safely removed, and local authority permits deletion. Remote branch deletion remains
   human-gated unless local rules explicitly grant the exact operation.

### 7. Report

```markdown
## Cleanup Report

### Worktrees
- Eligible session-owned: X
- Removed after authority gate: X
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
- [ ] Approve exact session-owned cleanup targets where appropriate.
- [ ] Delete merged branches only under applicable authority.
- [ ] Review duplicate candidates.
```
