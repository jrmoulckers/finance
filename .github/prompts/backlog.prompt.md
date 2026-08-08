---
name: backlog
description: Show the current project status dashboard — issues, PRs, CI, worktrees
parameters: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Backlog — Project Status Dashboard

Generate a concise status report for the product repository.

## Data Collection

### 1. Issue Backlog

```bash
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees,createdAt,updatedAt
```

Categorize issues by owner/agent, priority, and status (unclaimed, in progress, blocked, linked PR).

### 2. Open Pull Requests

```bash
gh pr list --state open --limit 200 --json number,title,headRefName,author,createdAt,updatedAt,statusCheckRollup,mergeable,reviewDecision
```

Report CI status, conflicts, review status, and age for each PR.

### 3. Worktree Status

```bash
git worktree list
```

For each worktree, identify branch, linked issue/PR, status, and recommendation.

### 4. CI Failures

For PRs with failing checks:

```bash
gh pr checks <number> --json name,state,conclusion
```

Group failures by type: format, lint, type-check, build, test, deploy, or other.

## Report Format

```markdown
## Project Status

### Issues: X open (Y unclaimed, Z in progress)
| # | Title | Labels | Owner | Status |
| --- | --- | --- | --- | --- |
| ... |

### Pull Requests: X open (Y passing, Z failing)
| # | Title | CI | Conflicts | Review | Age |
| --- | --- | --- | --- | --- | --- |
| ... |

### CI Failures: X PRs failing
| PR | Failure Type | Details |
| --- | --- | --- |
| ... |

### Worktrees: X active, Y stale
| Path | Branch | Status | Recommendation |
| --- | --- | --- | --- |
| ... |

### Summary
- Done recently: N issues closed
- In progress: N PRs open
- Blocked: N PRs failing CI or conflicting
- Backlog: N unclaimed issues
- Cleanup needed: N stale worktrees/branches
```
