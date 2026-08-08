---
name: project-management
description: >
  Project management patterns. Use for topics related to issue lifecycle,
  roadmap planning, milestone tracking, backlog grooming, release management,
  sprint coordination, or cross-team coordination.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Project Management Skill

**Trigger:** roadmap, milestones, backlog grooming, release planning, issue lifecycle,
coordination, project health.
**Inputs:** goals, open issues, milestones, priorities, dependencies, capacity, release constraints.
**Related:** `issue-management` (issue quality/scoping), `ux-testing` (QA inputs),
`prompt-engineering` (agent handoffs), `security-review-methodology` (security gates).

## Out of scope

- Issue body quality, labels, duplicates, and platform scoping → use `issue-management`.
- Manual QA session design → use `ux-testing`.
- Agent execution, CI self-healing, and merge operations → use the relevant workflow skill.
- Platform implementation details → use the relevant engineering skill.

## Issue lifecycle

```text
Triage → Shaping → Ready → In Progress → In Review → Done
```

| Stage | Entry | Exit |
| --- | --- | --- |
| Triage | Issue created | Labeled, prioritized, assigned milestone or disposition |
| Shaping | Problem accepted | Acceptance criteria, dependencies, and effort are clear |
| Ready | Fully specified | Assigned to a human or agent |
| In Progress | Work starts | PR opened with `Closes #N` |
| In Review | PR and checks ready | Approved, green, mergeable, and merged |
| Done | PR merged | Issue auto-closed |

## Backlog grooming

1. **Label** — type, priority, platform/component, effort.
2. **Clarify** — problem, acceptance criteria, and non-goals.
3. **Deduplicate** — link duplicates or related issues.
4. **Sequence** — identify blockers, dependencies, and parallelizable work.
5. **Decompose** — split oversized work into independently shippable issues.
6. **Milestone** — assign only work that fits the release goal and capacity.

## Planning heuristics

| Signal | Action |
| --- | --- |
| Release blocker | Prioritize immediately and keep scope narrow |
| Ambiguous issue | Move to shaping before assignment |
| Oversized issue | Split before Ready |
| Cross-platform UI | Decide shared vs platform-specific work with `issue-management` |
| Repeated CI/quality failures | Reserve capacity for stabilization |

## Release management

- Use semantic versioning or the product's release model consistently.
- Write changes for users, not only implementers.
- Keep publishing, store submission, and production deployment human-gated when required.
- A change is not done until a PR exists, checks pass, the branch is mergeable, and the PR is merged.

## Metrics

| Metric | Watch for |
| --- | --- |
| Cycle time | Work stuck between Ready, In Progress, and Review |
| WIP | Too many active items per person/agent |
| Defect escape | Bugs found after release or late in review |
| Tech debt ratio | Debt crowding out feature and reliability work |
| CI health | Flakes, long builds, repeated red checks |

## Safety

Preserve issue-first, PR-always, and conventional-commit discipline. Do not close issues manually when
they should auto-close via PR merge. Escalate gated operations instead of working around them.

## Output

A prioritized plan, groomed backlog, milestone/release summary, or coordination report with blockers,
owners, dependencies, and next actions.
