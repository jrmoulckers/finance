---
name: backlog
description: Show the current project status dashboard — issues, PRs, CI, worktrees
parameters:
  - name: recent-days
    type: integer
    description: Number of days included in the recently completed issue summary
    default: 14
    minimum: 1
    maximum: 90
built_ins: []
agent_dependencies: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Backlog — Project Status Dashboard

Generate a concise status report for the product repository.

## Runtime Contract

Require parameter interpolation before collecting data. Validate `{{ recent-days }}` as an integer
within its declared bounds; stop without reporting if interpolation is unavailable or the value is
invalid. If any bounded query returns exactly its limit, label that section as truncated rather than
claiming a complete total.

## Data Collection

### 1. Issue Backlog

```bash
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees,createdAt,updatedAt
```

Categorize issues by owner, priority, and status. Do not infer issue/PR linkage from branch names,
worktrees, titles, or issue text.

### 2. Open Pull Requests

```bash
gh pr list --state open --limit 200 --json number,title,headRefName,author,createdAt,updatedAt,statusCheckRollup,mergeable,reviewDecision,closingIssuesReferences
```

Report CI status, conflicts, review status, and age for each PR. Treat
`closingIssuesReferences` as the only collected issue/PR linkage for this dashboard.

### 3. Worktree Status

```bash
git worktree list --porcelain
```

For each worktree, identify its branch and status. Associate a worktree with a PR only when its
collected branch exactly matches a collected `headRefName`; do not claim issue linkage without the
collected PR closing reference.

### 4. CI Failures

For PRs with failing checks:

```bash
gh pr checks <number> --json name,state,bucket,link,workflow
```

Group failures by type: format, lint, type-check, build, test, deploy, or other.

### 5. Recently Closed Issues

Compute the ISO date `{{ recent-days }}` days before today using a runtime date facility, then query
the bounded closed population:

```bash
gh issue list --state closed --limit 100 --search "closed:>=<YYYY-MM-DD>" --json number,title,closedAt,labels,assignees
```

Count and list only rows returned by this query. If 100 rows are returned, report "at least 100"
and mark the result truncated. Never derive "done recently" from open PRs or local branches.

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
- Done recently: N issues closed in the last {{ recent-days }} days
- In progress: N PRs open
- Blocked: N PRs failing CI or conflicting
- Backlog: N unclaimed issues
- Cleanup needed: N stale worktrees/branches
```
