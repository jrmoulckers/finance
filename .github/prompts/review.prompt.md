---
name: review
description: Run code review on all open PRs using parallel review agents
parameters:
  - name: scope
    description: "Scope of review: 'all' for every open PR, or a comma-separated list of PR numbers"
    default: all
---

# Review — Parallel Code Review for Open PRs

Dispatch code-review agents in parallel to review all (or selected) open PRs.

## Execution Plan

### Phase 1: Identify PRs to Review

```bash
gh pr list --state open --json number,title,headRefName,author,additions,deletions,changedFiles,labels
```

If `scope` is `all`, review every open PR. Otherwise, filter to the specified PR numbers.

Skip PRs that:

- Are draft PRs (not ready for review)
- Have zero changed files
- Were authored by `dependabot` or other bots

### Phase 2: Dispatch Review Agents

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

1. **Code correctness** — logic errors, edge cases, off-by-one errors
2. **Security** — hardcoded secrets, SQL injection, XSS, missing auth checks
3. **Financial accuracy** — monetary calculations use cents (Long/integer), no floating point for money
4. **Accessibility** — WCAG 2.2 AA compliance, ARIA labels, keyboard navigation
5. **Architecture** — follows edge-first patterns, data flows through hooks/repositories
6. **Tests** — adequate coverage for new logic, no broken tests

## Steps

1. Read the PR diff:
   ```bash
   gh pr diff <number>
````

2. Read the linked issue for context:

   ```bash
   gh issue view <linked-issue-number>
   ```

3. Check the PR's file list and identify which platform/package is affected:

   ```bash
   gh pr view <number> --json files
   ```

4. Review each changed file against the relevant `.github/instructions/` coding standards.

5. Verify the pre-push checklist was followed (formatting, linting, type-check should pass).

## Output Format

Produce a structured review:

```
## PR #<number> Review: <title>

### 🔴 Critical (must fix)
- [file:line] Description of critical issue

### 🟡 Suggestions (should fix)
- [file:line] Description of suggestion

### 🟢 Looks Good
- Summary of what's well-done

### Verdict: APPROVE / REQUEST_CHANGES / COMMENT
<brief justification>
```

Only flag genuine issues — never comment on style, formatting, or trivial matters that linters handle.
"""
)

```

Launch all review agents in parallel (they are read-only and cannot conflict).

### Phase 3: Collect and Summarize

After all review agents complete, produce a summary:

```

## Review Summary — X PRs Reviewed

### Needs Changes: Y PRs

| PR  | Critical Issues | Suggestions |
| --- | --------------- | ----------- |
| ... |

### Ready to Merge: Z PRs

| PR  | Title | Reviewer Notes |
| --- | ----- | -------------- |
| ... |

### Review Details

<Full review output for each PR>
```
