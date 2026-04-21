---
name: backlog
description: Show the current project status dashboard — issues, PRs, CI, worktrees
parameters: []
---

# Backlog — Project Status Dashboard

Generate a comprehensive status report for the Finance monorepo.

## Data Collection

Run all of these commands and collect the output:

### 1. Issue Backlog

```bash
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees,createdAt,updatedAt
```

Categorize issues by:

- **Agent type** (based on labels — see label→agent mapping in sprint prompt)
- **Priority** (milestone, age, label urgency)
- **Status** (has PR linked vs. unclaimed)

### 2. Open Pull Requests

```bash
gh pr list --state open --json number,title,headRefName,author,createdAt,updatedAt,statusCheckRollup,mergeable,reviewDecision
```

For each PR, report:

- **Title and number**
- **CI status**: passing / failing / pending
- **Merge conflicts**: yes / no
- **Review status**: approved / changes requested / pending
- **Age**: days since opened

### 3. Worktree Status

```bash
git worktree list
```

For each worktree:

- **Branch name** and linked issue
- **Status**: active (has open PR) / stale (no PR, or PR merged) / orphaned (branch deleted)
- **Recommendation**: keep / prune

### 4. CI Failures

For any PR with failing checks:

```bash
gh pr checks <number> --json name,state,conclusion
```

Group failures by type (lint, type-check, build, test).

## Report Format

Present a structured dashboard:

```
## 📊 Finance Monorepo Status

### Issues: X open (Y unclaimed, Z in progress)
| # | Title | Labels | Agent | Status |
|---|-------|--------|-------|--------|
| ... |

### Pull Requests: X open (Y passing, Z failing)
| # | Title | CI | Conflicts | Review | Age |
|---|-------|----|-----------|--------|-----|
| ... |

### CI Failures: X PRs failing
| PR | Failure Type | Details |
|----|-------------|---------|
| ... |

### Worktrees: X active, Y stale
| Path | Branch | Status | Recommendation |
|------|--------|--------|----------------|
| ... |

### Summary
- ✅ Done this sprint: N issues closed
- 🔄 In progress: N PRs open
- ❌ Blocked: N PRs failing CI
- 📋 Backlog: N unclaimed issues
- 🧹 Cleanup needed: N stale worktrees
```
