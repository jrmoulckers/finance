---
name: sprint-planning
description: >
  Sprint planning and backlog management for multi-agent development. Use for
  topics related to sprint planning, prioritizing issues, decomposing work,
  sequencing dependencies, capacity planning, or balancing agent workloads.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Sprint Planning Skill

**Trigger:** sprint selection, issue prioritization, dependency sequencing, agent capacity, backlog-to-SQL planning.
**Inputs:** open issues, labels/milestones, target dates, available agents, known blockers.
**Related:** `issue-management` (issue quality), `project-management` (roadmap/milestones),
`security-review-methodology` (risk slots).

## Out of scope

- Issue body quality, duplicate detection, and label cleanup → use `issue-management`.
- Roadmap, milestone, release lifecycle, and backlog policy → use `project-management`.
- Agent dispatch, worktree setup, CI healing, rebases, and merge order → use the `team` prompt and
  workflow instructions.
- Product implementation details → use the relevant domain skill.

## Method

1. **Collect candidates** — list open issues with labels, milestones, priority, and blockers.
2. **Route ownership** — map work to agent roles by platform/component labels; infer only when labels are missing.
3. **Size capacity** — target 4–6 implementation issues per active agent, 1 audit/review slot, and ~20% buffer for CI or rebase churn.
4. **Sequence dependencies** — serialize schema/data-contract changes before shared models and platform consumers.
5. **Encode plan** — create SQL `todos` and `todo_deps` with issue references and clear completion criteria.
6. **Hand off execution** — send ready work through the `team` prompt and workflow instructions;
   this skill owns planning, not execution.
7. **Retro** — compare planned vs done, carry unfinished P1+ work, and capture dependency misses.

## Issue-to-agent routing

| Signal | Route |
| --- | --- |
| Platform label | Matching platform engineer |
| Shared library, API, data model | Shared/backend owner before platform consumers |
| CI, infra, release | DevOps or release owner |
| Security, privacy, compliance | Security reviewer or `compliance-specialist` |
| Accessibility, i18n, QA | Specialist reviewer/tester |
| Marketing, pricing, growth | Business/marketing owner |
| Cross-platform feature | Architect first, then scoped implementation issues |
| Missing or conflicting labels | Triage before scheduling |

## Dependency rules

- Shared contracts ship before dependent platform work.
- Schema or migration work is never parallelized with consumers of that schema.
- Bugs without a platform/component label are triage work, not sprint-ready work.
- Business tasks with no engineering dependency may run in parallel.
- Every sprint preserves issue-first work and conventional commit references: `type(scope): summary (#N)`.

## SQL pattern

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('sN-api-90', 'Updating API contract (#90)',
   'Change the shared contract and document migration/compatibility notes.', 'pending'),
  ('sN-shared-91', 'Updating shared model (#91)',
   'Consume the contract after #90 lands. Add tests.', 'pending'),
  ('sN-web-92', 'Integrating web flow (#92)',
   'Use the shared model from #91 and verify the affected route.', 'pending'),
  ('sN-review-93', 'Running privacy review (#93)',
   'Read-only review of the merged data-flow changes.', 'pending');

INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('sN-shared-91', 'sN-api-90'),
  ('sN-web-92', 'sN-shared-91'),
  ('sN-review-93', 'sN-web-92');
```

```sql
SELECT t.id, t.title FROM todos t
WHERE t.status = 'pending' AND t.id LIKE 'sN-%'
AND NOT EXISTS (
  SELECT 1 FROM todo_deps td
  JOIN todos dep ON td.depends_on = dep.id
  WHERE td.todo_id = t.id AND dep.status != 'done'
);
```

## Safety

Plan-only. Do not dispatch agents, edit code, push branches, or merge PRs from this skill. Escalate security/privacy blockers before scheduling dependent work.

## Output

A sprint plan with prioritized issues, owner routes, SQL todos/dependencies, capacity notes, and explicit handoff to execution.