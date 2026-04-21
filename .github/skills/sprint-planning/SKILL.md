---
name: sprint-planning
description: >
  Sprint planning and backlog management for multi-agent development. Use when
  planning sprints, prioritizing issues, decomposing work, or balancing
  workloads across agent types.
---

# Sprint Planning Skill

## Proven Velocity Data (3 Waves, 140+ PRs)

| Metric                      | Value                         |
| --------------------------- | ----------------------------- |
| Issues per sprint per agent | **4–6** (sweet spot)          |
| Sprints per agent per wave  | **~5**                        |
| Time per wave               | **~30 minutes**               |
| Agents per wave             | **8–15**                      |
| CI overhead budget          | **~20%** (failures + rebases) |
| Doc agents                  | Require human push step       |
| Schema changes              | Must be strictly serialized   |

## Issue-to-Agent Mapping Algorithm

### Step 1: Extract labels

```bash
gh issue list --state open --json number,title,labels,milestone --limit 100
```

### Step 2: Map labels to agents

| Label(s)                                    | Agent                                     |
| ------------------------------------------- | ----------------------------------------- |
| `platform:android`                          | `android-engineer`                        |
| `platform:ios`                              | `ios-engineer`                            |
| `platform:web`, `comp:web`                  | `web-engineer`                            |
| `platform:windows`                          | `windows-engineer`                        |
| `platform:shared`, `comp:sync`, `comp:core` | `kmp-engineer`                            |
| `ci`, `infrastructure`                      | `devops-engineer`                         |
| `security`, `compliance`                    | `security-reviewer`                       |
| `accessibility`                             | `accessibility-reviewer`                  |
| `documentation`                             | `docs-writer`                             |
| `design-system`                             | `design-engineer`                         |
| `feature` (cross-platform)                  | `architect` → decompose → platform agents |
| `bug`                                       | Route by platform label                   |
| `monetization`, `pricing`                   | `business-analyst`                        |
| `marketing`, `launch`, `growth`             | `marketing-strategist`                    |
| `roadmap`, `planning`, `triage`             | `product-manager`                         |

### Step 3: Handle ambiguity

- **No matching label**: Infer from issue title/body — which files will change?
- **Multiple labels**: Use most specific match
- **Bugs without platform**: Triage to add platform label before scheduling
- **Cross-platform features**: `architect` designs → one sub-issue per platform

## Sprint Sizing Heuristics

| Category       | Target per Sprint | Rationale                          |
| -------------- | ----------------- | ---------------------------------- |
| Implementation | 4–6               | Fits parallel fleet dispatch       |
| Business/mgmt  | 1–2               | Product triage, pricing, marketing |
| Review/audit   | 1                 | Security or accessibility review   |

### Balance Rules

- Max 2 issues per agent type per sprint (unless second agent instance available)
- KMP shared code ships **before** platform integration
- Schema changes ship **before** KMP model updates
- Leave ~20% capacity for CI failures and rebases
- Alternate security and accessibility reviews (unless risk demands both)

## Dependency Analysis Patterns

### Code Path Dependencies

| Signal in Issue                                   | Depends On                            |
| ------------------------------------------------- | ------------------------------------- |
| Mentions `packages/core` or `packages/models`     | KMP compilation must succeed          |
| Mentions `packages/sync`                          | Sync engine stable                    |
| Platform integration (`apps/<platform>/src/kmp/`) | KMP package compiles for target       |
| Database schema changes                           | Serialized: backend → KMP → platforms |
| Design token consumption                          | Token pipeline runs first             |

### Schema Change Serialization (Never Parallelize)

1. `backend-engineer` → Supabase migration + sync rules
2. `kmp-engineer` → SQLDelight `.sq` files + shared models
3. Platform agents → consume new fields in data layer
4. **Each step merges before next begins**

### Encoding Dependencies in SQL

```sql
-- KMP must finish before Android can integrate
INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('s1-android-transactions', 's1-kmp-models');

-- Backend migration must land before KMP schema update
INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('s1-kmp-models', 's1-backend-migration');

-- Query: what's ready to start?
SELECT t.* FROM todos t
WHERE t.status = 'pending'
AND NOT EXISTS (
    SELECT 1 FROM todo_deps td
    JOIN todos dep ON td.depends_on = dep.id
    WHERE td.todo_id = t.id AND dep.status != 'done'
);
```

## Priority Framework

| Priority | Criteria                                | Sprint Action                      |
| -------- | --------------------------------------- | ---------------------------------- |
| **P0**   | Blocks launch, CI broken, security vuln | Immediate — displaces current work |
| **P1**   | Core feature, tech debt blocking work   | Must be in current sprint          |
| **P2**   | Feature enhancement, testing, docs      | Fill remaining capacity            |
| **P3**   | Nice-to-have, post-launch               | Backlog                            |

### Auto-Priority Rules

- `security` + `bug` = always P0
- Blocks 2+ other issues = at least P1
- Docs-only = P2 (unless blocks onboarding)
- Optimization/refactor = P3 (unless unblocks P1)

## Sprint Template

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('sN-backend-90', 'Schema migration (#90)',
   'Write Supabase migration for new columns. Update sync rules.', 'pending'),
  ('sN-kmp-88', 'Update shared models (#88)',
   'Add new fields to packages/models. Update .sq schemas.', 'pending'),
  ('sN-android-91', 'Android tx transfers (#91)',
   'Transfer pairing in apps/android/. Depends on KMP.', 'pending'),
  ('sN-web-92', 'Web budget rollover (#92)',
   'Rollover toggle in apps/web/. Depends on KMP.', 'pending'),
  ('sN-security-93', 'Security review (#93)',
   'Review sync PRs. Read-only.', 'pending'),
  ('sN-pm-94', 'Backlog triage (#94)',
   'Triage new issues, update milestones.', 'pending');

INSERT INTO todo_deps (todo_id, depends_on) VALUES
  ('sN-kmp-88', 'sN-backend-90'),
  ('sN-android-91', 'sN-kmp-88'),
  ('sN-web-92', 'sN-kmp-88');
```

## Sprint Status Queries

```sql
-- Progress summary
SELECT status, COUNT(*) as count FROM todos
WHERE id LIKE 'sN-%' GROUP BY status;

-- What's ready?
SELECT t.id, t.title FROM todos t
WHERE t.status = 'pending' AND t.id LIKE 'sN-%'
AND NOT EXISTS (
    SELECT 1 FROM todo_deps td JOIN todos dep ON td.depends_on = dep.id
    WHERE td.todo_id = t.id AND dep.status != 'done'
);

-- What's blocked and why?
SELECT t.id, t.title, dep.id as blocked_by, dep.status
FROM todos t JOIN todo_deps td ON td.todo_id = t.id
JOIN todos dep ON td.depends_on = dep.id
WHERE t.status = 'pending' AND t.id LIKE 'sN-%' AND dep.status != 'done';
```

Or use the dashboard: `node tools/agent-scripts/sprint-status.js`

## Business Sprint Integration

Every sprint includes business tasks alongside engineering:

### Per Sprint

- **Product management**: Issue triage, backlog grooming, milestone updates
  - Labels: `roadmap`, `planning`, `triage`

### Bi-Weekly

- **Marketing**: Content, ASO, launch comms
  - Labels: `marketing`, `launch`, `growth`

### Monthly

- **Business analysis**: Pricing, competitive research, metrics
  - Labels: `monetization`, `pricing`

Business tasks have **no engineering dependencies** — they run in parallel:

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('sN-pm-100', 'Sprint N triage (#100)',
   'Triage new issues. Assign labels and milestones.', 'pending'),
  ('sN-mktg-101', 'Update store listing (#101)',
   'Refresh descriptions for rollover feature.', 'pending');
-- No todo_deps needed — business runs in parallel
```

## Sprint Lifecycle Checklist

1. **Plan**: Query issues → categorize → detect deps → SQL todos
2. **Dispatch**: Fleet parallel dispatch (see fleet-orchestration skill)
   ```bash
   node tools/agent-scripts/setup-worktree.js <agent> <type> <desc> <issue#>
   ```
3. **Monitor**: `node tools/agent-scripts/sprint-status.js` + `gh pr checks`
4. **Review**: Security/accessibility reviewer audits merged PRs
5. **Retro**: Query todos for completion rate, carry-over
6. **Close**: Mark done; carry unfinished P1+ to next sprint

```sql
-- Carry over unfinished work
INSERT INTO todos (id, title, description, status)
SELECT REPLACE(id, 'sN-', 'sN+1-'), title,
  description || ' (carried from sprint N)', 'pending'
FROM todos WHERE id LIKE 'sN-%' AND status != 'done';
```
