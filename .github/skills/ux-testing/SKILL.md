---
name: ux-testing
description: >
  UX testing methodology. Use for topics related to alpha testing, beta testing,
  QA, bug discovery, testing scenarios, manual testing, exploratory testing,
  or user experience validation.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# UX Testing Skill

**Trigger:** manual QA, exploratory testing, alpha/beta sessions, bug discovery, test scenarios,
user-visible workflow validation.
**Inputs:** surfaces/routes, platforms in scope, test data, user roles, browser/device constraints.
**Related:** `issue-management` (filing scoped issues), `accessibility-testing` (WCAG/a11y pass),
`performance-budgets` (latency/jank), `security-review-methodology` (security/privacy review).

## Out of scope

- Issue labels, duplicates, and filing mechanics → use `issue-management`.
- Accessibility conformance audits → use `accessibility-testing`.
- Security/privacy vulnerability review → use `security-review-methodology` or `privacy-compliance`.
- Sprint selection, CI, and merge operations → use the relevant workflow skill.

## Session setup

1. **Environment** — run the product with safe test data and reset instructions.
2. **Scope** — name feature areas, routes, roles, and platforms in scope.
3. **Tools** — open logs/devtools where useful; capture screenshots/video only when safe.
4. **Tracker** — use a GitHub issue, checklist, or SQL todos for session state.
5. **Evidence bar** — every candidate issue needs reproduction, expected result, and likely owner path.

## Platform checklist

| Platform | Check |
| --- | --- |
| Web | routing, responsive breakpoints, console/network errors, keyboard/mouse states |
| iOS | native navigation, gestures, Dynamic Type, offline/background behavior |
| Android | navigation, back behavior, permissions, font scaling, lifecycle states |
| Desktop | resizing, keyboard shortcuts, focus, menu/window behavior |

> Test only the platforms your product ships. Drop rows that don't apply.

## What to test

| Area | Look for |
| --- | --- |
| Navigation | deep links, active state, back/forward, auth guards, scroll/focus restoration |
| Forms | field coverage, validation, paste/input handling, submit feedback, error recovery |
| Search/filter | coverage, sort order, empty states, performance, result context |
| Data display | clickability, empty/error states, responsive cards/tables/charts, action affordances |
| Import/export | flow completion, preview, validation, duplicate handling, recovery |
| Settings/system | persistence, sync/status banners, preferences, console or runtime errors |

## Pre-filing gate

Before filing each issue:

- Run the `issue-management` scoping decision tree.
- Verify current code references; do not cite paths or lines from memory.
- Search for duplicates or related issues.
- Include platform scope, severity, reproduction, root cause, fix path, and validation.

## Bug report template

```markdown
## Problem

[User-visible behavior]

## Root Cause

[Technical explanation with verified file:line references]

## Fix

[Concrete change and verification]

## Files

- `path/to/file:NN-MM`

## Cross-Platform

[Platforms checked and whether separate issues are needed]
```

## Safety

Use safe test data. Do not file unverified issue floods; complete investigations and platform scoping before
batch filing. Do not use OS temp directories for issue bodies.

## Output

A session report plus validated issues with reproduction, evidence, severity, platform scope, and related links.
