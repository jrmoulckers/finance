---
name: review
description: Run code review on all open PRs using parallel review agents
parameters:
  - name: scope
    description: "Scope of review: 'all' for every open PR, or a comma-separated list of PR numbers"
    default: all
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Review — Parallel Code Review for Open PRs

Review all or selected open PRs with read-only review agents.

## Execution Plan

### 1. Identify PRs

```bash
gh pr list --state open --limit 200 --json number,title,headRefName,author,isDraft,additions,deletions,changedFiles,labels
```

If `scope` is `all`, review every open PR. Otherwise filter to the requested PR numbers.

Skip PRs that:

- Are drafts.
- Have zero changed files.
- Were authored by bots unless explicitly requested.

### 2. Dispatch Review Agents

For each PR, dispatch a `code-review` agent:

````
task(
  agent_type="code-review",
  name="review-pr-<number>",
  description="Review PR #<number>",
  prompt="""
Review PR #<number>: "<title>"
Branch: <branch>
Author: <author>

## Review Focus

1. **Correctness** — logic errors, edge cases, broken flows, data loss.
2. **Security & privacy** — secrets, injection, XSS, missing authorization, unsafe data exposure.
3. **Accessibility** — semantic structure, keyboard support, labels, contrast, reduced motion where UI changes are present.
4. **Architecture** — follows the product's boundaries, ownership, and data-flow conventions.
5. **Tests** — meaningful coverage for new logic and regressions; no brittle or disabled tests.

## Steps

1. Read the PR diff:
   ```bash
   gh pr diff <number>
   ```
2. Read the linked issue for context when present:
   ```bash
   gh issue view <linked-issue-number>
   ```
3. Inspect the changed file list:
   ```bash
   gh pr view <number> --json files
   ```
4. Review changed files against `AGENTS.md` and relevant `instructions/` files.
5. Check whether the repo's lint/format/type-check/test expectations were addressed.

## Output Format

```markdown
## PR #<number> Review: <title>

### Critical
- [file:line] Issue and impact

### Suggestions
- [file:line] Improvement and rationale

### Looks Good
- What is solid

### Verdict: APPROVE / REQUEST_CHANGES / COMMENT
<brief justification>
```

Only flag genuine issues. Do not comment on style, formatting, or trivial matters handled by tools.
"""
)
````

Launch review agents in parallel; they are read-only and cannot conflict.

### 3. Summarize

```markdown
## Review Summary — X PRs Reviewed

### Needs Changes: Y PRs
| PR | Critical Issues | Suggestions |
| --- | --- | --- |
| ... |

### Ready to Merge: Z PRs
| PR | Title | Notes |
| --- | --- | --- |
| ... |

### Review Details
<Full review output for each PR>
```
