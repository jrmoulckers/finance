---
name: sprint-planning
description: >
  Sprint planning and backlog management for multi-agent development. Use when
  planning sprints, prioritizing issues, decomposing work, or balancing
  workloads across agent types.
---

# Sprint Planning Skill

This skill provides structured guidance for planning development sprints in the Finance monorepo, where work is dispatched across specialized AI agents and human contributors operating in parallel worktrees.

## Issue Categorization by Agent Type

Route GitHub issues to the correct agent based on labels. When an issue carries multiple labels, use the most specific match. Cross-platform `feature` issues go to `architect` for design decomposition first, then fan out to platform agents.

| Label(s)                                    | Agent Type                              |
| ------------------------------------------- | --------------------------------------- |
| `platform:android`                          | android-engineer                        |
| `platform:ios`                              | ios-engineer                            |
| `platform:web`, `comp:web`                  | web-engineer                            |
| `platform:windows`                          | windows-engineer                        |
| `platform:shared`, `comp:sync`, `comp:core` | kmp-engineer                            |
| `ci`, `infrastructure`                      | devops-engineer                         |
| `security`, `compliance`                    | security-reviewer                       |
| `accessibility`                             | accessibility-reviewer                  |
| `documentation`                             | docs-writer                             |
| `design-system`                             | design-engineer                         |
| `feature` (cross-platform)                  | architect → platform agents             |
| `bug`                                       | Route to platform based on other labels |
| `monetization`, `pricing`                   | business-analyst                        |
| `marketing`, `launch`, `growth`             | marketing-strategist                    |
| `roadmap`, `planning`, `triage`             | product-manager                         |

### Routing Rules

- **Bugs**: Always carry a platform label. Route to the matching platform agent. If no platform label exists, triage the issue to add one before scheduling.
- **Features**: Cross-platform features require an `architect` design pass that produces one sub-issue per platform. Each sub-issue gets its own platform label and agent assignment.
- **Business tasks**: `product-manager`, `business-analyst`, and `marketing-strategist` create GitHub issues just like engineering work — they follow the same issue-first workflow.
- **Reviews**: `security-reviewer` and `accessibility-reviewer` are read-only reviewers. They never own implementation issues; they review PRs opened by other agents.

## Sprint Sizing

A single sprint should contain a balanced mix of implementation, review, and business tasks.

| Category              | Target per Sprint | Rationale                                      |
| --------------------- | ----------------- | ---------------------------------------------- |
| Implementation issues | 4–6               | Fits parallel `/fleet` dispatch across agents  |
| Business/mgmt tasks   | 1–2               | Product triage, pricing, marketing cadence     |
| Review/audit tasks    | 1                 | Security or accessibility review of recent PRs |

### Balance Guidelines

- **Spread across platforms** — avoid assigning more than 2 issues to the same agent type in one sprint. If 3 Android issues are urgent, split across two sprints or parallelize with a second agent instance.
- **Respect the dependency chain** — KMP shared code ships before platform integration. Schema changes ship before KMP model updates. Never schedule a platform issue in the same sprint as its KMP dependency unless the KMP work is already merged.
- **Leave capacity for CI failures** — agents spend time fixing CI; plan for ~20% overhead.
- **One review per sprint** — security or accessibility. Alternate between them unless a risk signal demands both.

## Dependency Detection

Detect and encode dependencies before scheduling. The following patterns indicate blocking relationships.

### Code Path Dependencies

| Signal in the issue                               | Depends on                                        |
| ------------------------------------------------- | ------------------------------------------------- |
| Mentions `packages/core` or `packages/models`     | KMP compilation must succeed first                |
| Mentions `packages/sync` or sync behavior         | Sync engine (#466) must be stable                 |
| Platform integration (`apps/<platform>/src/kmp/`) | Corresponding KMP package must compile for target |
| Database schema changes (new columns, migrations) | Serialized: backend → KMP → platforms             |
| Design token consumption                          | `design-engineer` token pipeline must run first   |

### Schema Change Serialization

Schema changes follow a strict ordering to avoid runtime mismatches:

1. **backend-engineer** writes the Supabase migration and sync rules
2. **kmp-engineer** updates SQLDelight `.sq` files and shared models
3. **Platform agents** update their data layers to consume new fields
4. Each step merges before the next begins — never parallelize schema work

### Encoding Dependencies

Use the `todo_deps` SQL table to make dependencies explicit and queryable:

```sql
-- KMP must finish before Android can integrate
INSERT INTO todo_deps (todo_id, depends_on) VALUES ('s1-android-transactions', 's1-kmp-models');

-- Backend migration must land before KMP schema update
INSERT INTO todo_deps (todo_id, depends_on) VALUES ('s1-kmp-models', 's1-backend-migration');
```

Query for ready work (no unfinished dependencies):

```sql
SELECT t.* FROM todos t
WHERE t.status = 'pending'
AND NOT EXISTS (
    SELECT 1 FROM todo_deps td
    JOIN todos dep ON td.depends_on = dep.id
    WHERE td.todo_id = t.id AND dep.status != 'done'
);
```

## Priority Framework

Assign every issue a priority level before scheduling. Higher priorities fill the sprint first.

| Priority | Criteria                                         | Sprint Action                           |
| -------- | ------------------------------------------------ | --------------------------------------- |
| **P0**   | Blocks launch, CI broken, security vulnerability | Immediate — displaces current work      |
| **P1**   | Core feature, tech debt blocking other work      | Must be in the current sprint           |
| **P2**   | Feature enhancement, testing, documentation      | Fill remaining sprint capacity          |
| **P3**   | Nice-to-have, post-launch, optimization          | Backlog — schedule when capacity allows |

### Priority Assignment Rules

- A `security` label with `bug` is always P0.
- Issues blocking 2+ other issues are at least P1.
- Documentation-only issues are P2 unless they block onboarding.
- Optimization and refactoring are P3 unless they unblock a P1 feature.

## Sprint Template

Use this SQL pattern to plan and track a sprint. Each todo ID encodes the sprint number, agent type, and issue number for traceability.

```sql
-- Sprint N planning
INSERT INTO todos (id, title, description, status) VALUES
  ('sN-kmp-models-88',     'Update shared models (#88)',
   'Add transferTransactionId, recurringRuleId to Transaction; isRollover to Budget; accountId, status to Goal in packages/models. Update .sq schemas in packages/core.', 'pending'),
  ('sN-backend-migration-90', 'Schema migration for new fields (#90)',
   'Write versioned Supabase migration adding transfer_transaction_id, recurring_rule_id, is_rollover, account_id, status columns. Update sync rules YAML.', 'pending'),
  ('sN-android-transactions-91', 'Android transaction transfers UI (#91)',
   'Implement transfer transaction pairing in apps/android. Depends on KMP model update.', 'pending'),
  ('sN-web-budget-rollover-92', 'Web budget rollover toggle (#92)',
   'Add rollover toggle to budget form in apps/web. Depends on KMP model update.', 'pending'),
  ('sN-security-review-93', 'Security review of sync PRs (#93)',
   'security-reviewer audits all sync-related PRs merged this sprint. Read-only.', 'pending'),
  ('sN-pm-triage-94', 'Backlog triage and milestone update (#94)',
   'product-manager triages new issues, updates milestone progress, grooms backlog.', 'pending');

-- Dependencies: schema serialization chain
INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('sN-kmp-models-88',           'sN-backend-migration-90'),
  ('sN-android-transactions-91', 'sN-kmp-models-88'),
  ('sN-web-budget-rollover-92',  'sN-kmp-models-88');
```

### Reading Sprint Status

```sql
-- Sprint progress summary
SELECT status, COUNT(*) as count FROM todos
WHERE id LIKE 'sN-%'
GROUP BY status;

-- What's ready to start next?
SELECT t.id, t.title FROM todos t
WHERE t.status = 'pending' AND t.id LIKE 'sN-%'
AND NOT EXISTS (
    SELECT 1 FROM todo_deps td
    JOIN todos dep ON td.depends_on = dep.id
    WHERE td.todo_id = t.id AND dep.status != 'done'
);

-- What's blocked and why?
SELECT t.id, t.title, dep.id as blocked_by, dep.status
FROM todos t
JOIN todo_deps td ON td.todo_id = t.id
JOIN todos dep ON td.depends_on = dep.id
WHERE t.status = 'pending' AND t.id LIKE 'sN-%'
AND dep.status != 'done';
```

## Business Sprint Integration

Every sprint cycle includes business tasks alongside engineering work. Business roles create GitHub issues following the same issue-first workflow — they are tracked, labeled, and closed via PRs or manual completion.

### Product Management (per sprint)

- **Issue triage**: Review and label new issues, assign priorities, close duplicates.
- **Backlog grooming**: Reorder backlog by priority, split oversized issues, add acceptance criteria.
- **Milestone progress**: Update milestone completion percentages, flag at-risk items.
- Label: `roadmap`, `planning`, or `triage`.

### Marketing (as scheduled)

- **Content creation**: Blog posts, changelog entries, social media for feature launches.
- **Launch planning**: Go-to-market checklist for beta and GA milestones.
- **ASO optimization**: App store listing copy, screenshots, keyword research.
- Label: `marketing`, `launch`, or `growth`.

### Business Analysis (per sprint)

- **Pricing validation**: Review competitive landscape, validate pricing tiers against usage data.
- **Competitive monitoring**: Track feature parity with competing finance apps.
- **Metric reviews**: Analyze retention, engagement, and conversion funnels.
- Label: `monetization` or `pricing`.

### Integration Pattern

Business tasks follow the same sprint cadence but do not block engineering work:

```sql
-- Business tasks have no engineering dependencies
INSERT INTO todos (id, title, description, status) VALUES
  ('sN-pm-triage-100',    'Sprint N issue triage (#100)',
   'Triage all new issues opened since last sprint. Assign labels, priorities, and milestones.', 'pending'),
  ('sN-marketing-aso-101', 'Update app store listing (#101)',
   'Refresh App Store and Play Store descriptions for budget rollover feature launch.', 'pending');

-- No INSERT into todo_deps — business tasks run in parallel with engineering
```

## Sprint Lifecycle Checklist

1. **Plan**: Identify candidate issues, assign priorities, detect dependencies, insert into `todos`.
2. **Dispatch**: Use `/fleet` or individual agent assignment. Each agent gets a worktree.
3. **Monitor**: Poll `gh pr checks` on all sprint PRs. Dispatch fix agents for CI failures.
4. **Review**: Security and/or accessibility reviewer audits merged PRs.
5. **Retro**: Query `todos` for completion rate, blocked items, and carry-over to next sprint.
6. **Close**: Mark sprint complete; carry unfinished P1+ items to the next sprint.

```sql
-- End-of-sprint: carry over unfinished P1+ work
INSERT INTO todos (id, title, description, status)
SELECT
  REPLACE(id, 'sN-', 'sN+1-'),
  title,
  description || ' (carried from sprint N)',
  'pending'
FROM todos
WHERE id LIKE 'sN-%' AND status != 'done';
```
