---
name: project-management
description: >
  Project management patterns for the Finance monorepo. Use for issue lifecycle,
  roadmap planning, milestone tracking, backlog grooming, release management,
  and cross-team coordination.
---

# Project Management Skill

## Issue Lifecycle

```
Created (Triage) → Shaping → Ready → In Progress → In Review → Done
```

| Stage       | Entry                   | Exit                                      |
| ----------- | ----------------------- | ----------------------------------------- |
| Triage      | Issue created           | Labeled, prioritized, milestone assigned  |
| Shaping     | Requirements clear      | Effort sized, acceptance criteria written |
| Ready       | Fully specified         | Assigned to agent or human                |
| In Progress | Worktree created        | PR opened with `Closes #N`                |
| In Review   | PR passes CI            | Approved and merged                       |
| Done        | PR merged → auto-closed | —                                         |

**WIP limit**: Max 3 items in-progress per person/agent.

## Label Taxonomy

### Priority

| Label | SLA                                        |
| ----- | ------------------------------------------ |
| `P0`  | Fix within 24 hours (blocks release)       |
| `P1`  | Fix in current sprint (significant impact) |
| `P2`  | Schedule within 2 sprints (normal)         |
| `P3`  | When capacity allows (nice-to-have)        |

### Type

`feature`, `bug`, `chore`, `docs`, `tech-debt`

### Platform

`ios`, `android`, `web`, `windows`, `shared`, `backend`

### Effort (T-shirt)

| Label       | Scope                                       |
| ----------- | ------------------------------------------- |
| `XS` (1pt)  | < 1 hour                                    |
| `S` (2pt)   | 1–4 hours                                   |
| `M` (5pt)   | 1–2 days                                    |
| `L` (8pt)   | 3–5 days                                    |
| `XL` (13pt) | 1–2 weeks — **must decompose** before Ready |

## Issue-to-Agent Mapping

| Label Pattern            | Agent                    |
| ------------------------ | ------------------------ |
| `platform:android`       | `android-engineer`       |
| `platform:ios`           | `ios-engineer`           |
| `platform:web`           | `web-engineer`           |
| `platform:windows`       | `windows-engineer`       |
| `platform:shared`, `kmp` | `kmp-engineer`           |
| `backend`, `supabase`    | `backend-engineer`       |
| `ci`, `devops`           | `devops-engineer`        |
| `docs`                   | `docs-writer`            |
| `security`, `privacy`    | `security-reviewer`      |
| `a11y`, `accessibility`  | `accessibility-reviewer` |
| `product`, `roadmap`     | `product-manager`        |
| `marketing`, `launch`    | `marketing-strategist`   |
| `business`, `pricing`    | `business-analyst`       |

Cross-platform features → `architect` decomposes → one sub-issue per platform.

## Fleet Sprint Lifecycle

### 1. Plan

```bash
gh issue list --state open --json number,title,labels,milestone --limit 100
```

Categorize → detect dependencies → group 4–6 issues per sprint → SQL todos.

### 2. Dispatch

```bash
# Use fleet orchestration — all independent agents in parallel
node tools/agent-scripts/setup-worktree.js <agent> <type> <desc> <issue#>
```

### 3. Monitor CI

```bash
# Sprint dashboard
node tools/agent-scripts/sprint-status.js

# Per-PR checks
gh pr checks [number]

# Failed run logs
gh run view [run-id] --log-failed
```

### 4. Self-Heal

Fix failures → `node tools/agent-scripts/pre-push-check.js --fix` → push → repeat until green.

### 5. Handoff

All PRs merge-ready → humans review + merge → clean up worktrees.

## CI Monitoring Patterns

```bash
# Recent workflow runs
gh run list --limit 20

# Failed runs in last week
gh run list --status failure --limit 20
```

| Metric             | Target    |
| ------------------ | --------- |
| CI pass rate       | > 95%     |
| Average build time | < 10 min  |
| Flaky test rate    | < 2%      |
| Time to green      | < 4 hours |

## Worktree Cleanup

```bash
# After PR merge confirmed
git worktree remove worktrees/wt-[agent]-[branch]

# Bulk cleanup of stale worktrees
node tools/cleanup-worktrees.js
```

## Milestones

| Milestone     | Purpose                                 |
| ------------- | --------------------------------------- |
| `v0.1-alpha`  | Core infra, basic CRUD, offline storage |
| `v0.1-beta`   | Feature-complete with sync and auth     |
| `v1.0`        | Production-ready across all platforms   |
| `post-launch` | Post-launch features and polish         |

## Roadmap Queries

```bash
# Milestone progress
gh issue list --milestone "v1.0" --state open
gh issue list --milestone "v1.0" --state closed

# By priority
gh issue list --milestone "v1.0" --state open --label "P0"

# Needs triage (no labels/milestone)
gh issue list --search "is:open no:label"
gh issue list --search "is:open no:milestone"
```

## Backlog Grooming (Weekly)

1. **Label**: type, priority, platform, effort
2. **Milestone**: assign to appropriate release
3. **Duplicates**: link with `Duplicate of #N`
4. **Acceptance criteria**: ensure implementable
5. **Dependencies**: link blocking/blocked relationships
6. **Assignment**: move to Shaping or Ready

### Stale Issue Detection

```bash
gh issue list --search "is:open sort:updated-asc" --limit 50
```

### Issue Decomposition

XL issues → sub-issues before Ready:

- Each independently shippable (S or M)
- One per platform for UI work
- Shared logic separate from platform UI
- No circular dependencies

## Release Management

### Changesets

```bash
npx changeset          # describe the change (write for users, not devs)
npx changeset version  # update CHANGELOG.md
# npx changeset publish — HUMAN ONLY
```

### Version Bumping

| Bump  | When                  |
| ----- | --------------------- |
| Major | Breaking changes      |
| Minor | New features          |
| Patch | Bug fixes, perf, a11y |

### Platform Release Pipelines

| Platform | Tag Format       | Distribution                  |
| -------- | ---------------- | ----------------------------- |
| iOS      | `ios/v1.3.0`     | TestFlight → App Store        |
| Android  | `android/v1.3.0` | Internal → Beta → Play Store  |
| Web      | `web/v2.1.0`     | Vercel deployment             |
| Windows  | `windows/v1.3.0` | Flight ring → Microsoft Store |

**Progression**: Internal (1–2 days) → Beta (3–7 days) → Staged rollout → Full release.

## Metrics

### Sprint Velocity

Track effort-weighted points (XS=1, S=2, M=5, L=8, XL=13) closed per sprint.

### Tech Debt Ratio

Target: < 20% of open issues. If exceeded, dedicate 1 sprint slot to debt reduction.

### Platform Parity

Feature not "done" for a milestone until it ships on all 4 platforms (unless explicitly scoped).

## Cross-Team Coordination

### Business Sprint Integration

Every sprint includes at least 1 business task:

- **Product management**: triage, grooming, milestone updates (per sprint)
- **Marketing**: content, ASO, launch comms (bi-weekly)
- **Business analysis**: pricing, metrics, competitive research (monthly)

### Fleet Coordination Rules

- No two agents edit same file in parallel
- Shared config files: single owner per fleet run
- Schema changes strictly serialized: backend → KMP → platform
- Last agent runs `npm run ci:check` before pushing

## Key Documents

| Document             | Path                                  |
| -------------------- | ------------------------------------- |
| Roadmap              | `docs/architecture/roadmap.md`        |
| Project board config | `docs/architecture/project-board.md`  |
| Versioning strategy  | `docs/guides/versioning-strategy.md`  |
| Workflow cheatsheet  | `docs/guides/workflow-cheatsheet.md`  |
| Issue triage report  | `docs/guides/issue-triage-report.md`  |
| App store submission | `docs/guides/app-store-submission.md` |
| Fleet operations     | `docs/ai/fleet-operations.md`         |
| Agent scripts        | `tools/agent-scripts/`                |

## Issue Rules (Non-Negotiable)

1. Every code change references a GitHub issue
2. **Never** close issues with `gh issue close` — auto-close via PR merge
3. One issue per concern
4. Acceptance criteria before Ready
5. Cross-reference related issues with `Refs #N`
