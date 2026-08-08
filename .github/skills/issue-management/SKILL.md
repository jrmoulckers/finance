---
name: issue-management
description: >
  Issue creation quality, cross-platform scoping, and duplicate management. Use
  for topics related to issue filing, bug reports, platform scoping,
  cross-platform duplicates, label taxonomy, issue quality, or GitHub issue triage.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Issue Management Skill

**Trigger:** filing issues, bug reports, labels, platform scope, duplicates, issue quality,
post-session audit.
**Inputs:** candidate issue, reproduction, root cause evidence, platforms in scope, existing issue search.
**Related:** `ux-testing` (bug discovery), `project-management` (lifecycle/backlog),
`accessibility-testing` (a11y issue criteria), `security-review-methodology` (security findings).

## Out of scope

- Issue lifecycle, milestones, release tracking, and backlog grooming → use `project-management`.
- Sprint selection, sizing, and dependency sequencing → use `sprint-planning`.
- Live QA session design → use `ux-testing`.
- CI, branch hygiene, and merge operations → use the relevant workflow skill.

## Label taxonomy

| Label family | Use |
| --- | --- |
| Platform | `platform:web`, `platform:ios`, `platform:android`, `platform:desktop`, `platform:shared`, `platform:backend` |
| Type | `bug`, `feature`, `enhancement`, `task`, `docs`, `chore` |
| Priority | product-defined severity/urgency labels |
| Component | product-defined area labels |

> Use the product's actual label names. Drop platform labels that don't apply.

## Scoping decision tree

1. **Shared root cause?** If the fix is in shared code or shared data/schema/contract, file one shared issue.
2. **Platform-only behavior?** If the fix is platform-specific, file for that platform only.
3. **Same bug on multiple platforms?** Check implementations before guessing.
4. **Same implementation?** Use one shared issue with cross-platform notes.
5. **Different implementations?** File separate platform issues in the same batch and cross-reference siblings.

## Pre-filing gate

Before creating an issue:

- Scope is correct and complete; platform implementations were checked where relevant.
- Existing issues were searched; duplicates become comments or references, not new noise.
- Every path/line reference is verified against the current default branch.
- The issue has problem, root cause, fix, files, cross-platform notes, labels, and priority.
- Issue-first discipline is preserved; commits and PRs later reference the issue.

## Issue body templates

### Bug

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

[Platforms checked and whether duplicates are needed]
```

### Enhancement

```markdown
## Problem / Current State

[What's missing or inadequate]

## Expected Behavior

[Desired state]

## Implementation Notes

[Technical approach and constraints]

## Cross-Platform

[Platforms in scope and design notes]

## Related Issues

[Blocking, dependent, or duplicate issues]
```

## Duplicate management

- Duplicate means same root cause, same platform, and same fix.
- Do not close issues manually; allow PR merge automation to close them.
- Cross-reference related but distinct work with `Related: #N`.
- Platform siblings should link to the root issue and each other.

## Safety

Use file-based issue creation for complex Markdown in shells that escape backticks. Use repo-local or
approved session-local scratch files only, clean them up, and never use OS temp directories.

## Output

A filed or ready-to-file issue set with complete labels, verified references, duplicate decisions,
cross-platform scope, and post-filing audit results.
