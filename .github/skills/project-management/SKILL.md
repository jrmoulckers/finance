---
name: project-management
description: >
  Project management patterns for the Finance monorepo. Use for issue lifecycle,
  roadmap planning, milestone tracking, backlog grooming, release management,
  and cross-team coordination.
---

# Project Management Skill

This skill provides actionable guidance for planning, tracking, and delivering work in the Finance monorepo. It reflects the project's issue-first, feature-branch workflow and its Agentic Kanban methodology where AI agents are first-class contributors.

## Issue Lifecycle

Every piece of work follows a strict lifecycle tied to GitHub Issues, the Projects V2 board, and pull requests.

### Status Flow

```
Created (Triage) → Shaping → Ready → In Progress → In Review → Done
```

| Stage       | Entry Criteria                                 | Exit Criteria                             |
| ----------- | ---------------------------------------------- | ----------------------------------------- |
| Triage      | Issue created (auto-assigned by board)         | Labeled, prioritized, milestone assigned  |
| Shaping     | Requirements clear enough to estimate          | Effort sized, acceptance criteria written  |
| Ready       | Fully specified, dependencies resolved         | Assigned to agent or human                |
| In Progress | Worktree created, work started                 | PR opened with `Closes #N`               |
| In Review   | PR passes CI, ready for human review           | Approved and merged                      |
| Done        | PR merged → issue auto-closed by GitHub        | —                                        |

### WIP Limits

- Maximum 3 items in "In Progress" per person or agent at a time.
- Issues must pass through Shaping → Ready before In Progress (except P0 critical bugs).

### Label Taxonomy

Labels are additive. Every issue should have at least a **type** and **priority** label.

#### Priority

| Label | Meaning                        | SLA                    |
| ----- | ------------------------------ | ---------------------- |
| `P0`  | Critical — blocks release      | Fix within 24 hours    |
| `P1`  | High — significant user impact | Fix within current sprint |
| `P2`  | Medium — normal backlog item   | Schedule within 2 sprints |
| `P3`  | Low — nice to have             | Schedule when capacity allows |

#### Type

| Label     | Description                              |
| --------- | ---------------------------------------- |
| `feature`  | New user-facing capability              |
| `bug`      | Something broken that used to work      |
| `chore`    | Maintenance, dependency updates, CI     |
| `docs`     | Documentation only                      |
| `tech-debt`| Refactoring, cleanup, architectural     |

#### Platform

| Label     | Scope                          |
| --------- | ------------------------------ |
| `ios`     | iOS / iPadOS / macOS / watchOS |
| `android` | Android / Wear OS              |
| `web`     | Progressive Web App            |
| `windows` | Windows 11 (Compose Desktop)  |
| `shared`  | KMP packages (core/models/sync)|
| `backend` | Supabase / Edge Functions      |

#### Effort (T-shirt sizing)

| Label | Rough Scope                           |
| ----- | ------------------------------------- |
| `XS`  | < 1 hour — typo, config tweak        |
| `S`   | 1–4 hours — single-file change       |
| `M`   | 1–2 days — feature slice             |
| `L`   | 3–5 days — multi-file feature        |
| `XL`  | 1–2 weeks — cross-cutting work       |

XL issues should be decomposed into smaller sub-issues before entering "Ready."

### Milestones

| Milestone    | Purpose                                         |
| ------------ | ------------------------------------------------ |
| `v0.1-alpha` | Core infrastructure, basic CRUD, offline storage |
| `v0.1-beta`  | Feature-complete beta with sync and auth         |
| `v1.0`       | Production-ready launch across all platforms     |
| `post-launch`| Post-launch features, polish, advanced analytics |

Milestones align with pre-release versions. See `docs/guides/versioning-strategy.md` for the full version lifecycle.

### Issue Rules

1. **Every code change must reference a GitHub Issue.** No exceptions.
2. **Never close issues manually** with `gh issue close` — let GitHub close them when the PR with `Closes #N` merges.
3. **One issue per concern.** If an issue covers multiple unrelated changes, split it.
4. **Acceptance criteria** must be written before an issue enters "Ready."
5. **Cross-reference related issues** with `Refs #N` in the issue body.

## Roadmap Management

### Querying Roadmap Status

Use the GitHub CLI to inspect the current state of each milestone:

```bash
# All open issues for a milestone
gh issue list --milestone "v1.0" --state open

# Open issues by priority
gh issue list --milestone "v1.0" --state open --label "P0"
gh issue list --milestone "v1.0" --state open --label "P1"

# Closed issues (completed work)
gh issue list --milestone "v1.0" --state closed

# All issues for a platform within a milestone
gh issue list --milestone "v1.0" --label "ios" --state open

# Issues without a milestone (needs triage)
gh issue list --search "no:milestone is:open"

# Stale issues (no activity in 30 days)
gh issue list --search "is:open updated:<$(date -d '30 days ago' +%Y-%m-%d)"
```

### Sprint Velocity Tracking

Sprints are 2-week iterations tracked via the GitHub Projects V2 board's `Sprint` iteration field.

**Measuring velocity:**

```bash
# Issues closed in the current sprint (adjust dates)
gh issue list --state closed --search "closed:>2026-01-01 closed:<2026-01-15"

# Count by label for effort-weighted velocity
gh issue list --state closed --label "S" --search "closed:>2026-01-01" | wc -l
gh issue list --state closed --label "M" --search "closed:>2026-01-01" | wc -l
gh issue list --state closed --label "L" --search "closed:>2026-01-01" | wc -l
```

**Velocity benchmarks (effort-weighted points):**

| Effort | Points |
| ------ | ------ |
| XS     | 1      |
| S      | 2      |
| M      | 5      |
| L      | 8      |
| XL     | 13     |

Track total points closed per sprint to establish a rolling average.

### Blocker Identification and Escalation

A blocker is any issue that prevents progress on higher-priority work. When identified:

1. Add the `blocked` label to the affected issue.
2. Comment on the issue explaining what is blocked and why, linking to the blocking issue with `Blocked by #N`.
3. If the blocker is P0/P1, escalate immediately — assign it to the current sprint and notify the team.
4. If the blocker is cross-team (e.g., backend blocks mobile), tag the relevant agent or human owner.

## Backlog Grooming

### Weekly Triage Checklist

Perform triage weekly on all issues in the "Triage" column:

1. **Label:** Apply type, priority, platform, and effort labels.
2. **Milestone:** Assign to `v0.1-alpha`, `v0.1-beta`, `v1.0`, or `post-launch`.
3. **Duplicates:** Search for existing issues covering the same work. Link duplicates with `Duplicate of #N` and close the newer one.
4. **Acceptance criteria:** Ensure requirements are clear enough to implement. Move issues with unclear requirements back to the reporter with a question comment.
5. **Dependencies:** Identify and link blocking/blocked relationships.
6. **Assignment:** Move fully triaged issues to "Shaping" or directly to "Ready" if they are small and well-defined.

```bash
# Find issues in Triage (no labels)
gh issue list --search "is:open no:label"

# Find issues without a milestone
gh issue list --search "is:open no:milestone"
```

### Stale Issue Detection

Issues with no activity for 30+ days should be reviewed:

```bash
# Find stale issues
gh issue list --search "is:open updated:<$(date -d '30 days ago' +%Y-%m-%d)" --limit 50
```

For each stale issue:

- **Still relevant?** → Comment with a status update, re-prioritize if needed.
- **Blocked?** → Add `blocked` label and document the blocker.
- **No longer needed?** → Comment explaining why, then close.
- **Superseded?** → Link to the replacement issue and close as duplicate.

### Issue Decomposition

XL issues must be broken into smaller sub-issues before entering "Ready." Use GitHub's sub-issue feature or a task list:

```markdown
## Sub-Issues

- [ ] #201 — Define database schema for recurring rules
- [ ] #202 — Implement KMP model and repository
- [ ] #203 — Add Android UI for recurring transaction creation
- [ ] #204 — Add iOS UI for recurring transaction creation
- [ ] #205 — Add web UI for recurring transaction creation
- [ ] #206 — Write integration tests for recurring sync
```

**Decomposition guidelines:**

- Each sub-issue should be independently shippable (S or M effort).
- One sub-issue per platform when UI work is involved.
- Shared logic (KMP/backend) is a separate sub-issue from platform UI.
- Sub-issues should not have circular dependencies.

## Release Management

### Changelog Generation

Changelogs are generated automatically from [Changesets](https://github.com/changesets/changesets). Every user-facing PR must include a changeset.

```bash
# Add a changeset to describe the change
npx changeset

# Version packages (updates CHANGELOG.md)
npx changeset version

# Publish (human-gated — agents must NOT run this)
npx changeset publish
```

**Changeset summary rules:**

- Write for **users**, not developers.
- Describe the user-facing impact, not the implementation.
- Bad: "Refactor budget state management"
- Good: "Fix budget totals not updating after editing a category"

See `docs/guides/versioning-strategy.md` for the full Changeset workflow and bump-type decision tree.

### Version Bumping

Finance uses per-package semantic versioning managed by Changesets:

| Bump  | When                                                    |
| ----- | ------------------------------------------------------- |
| Major | Breaking changes (API removal, incompatible migrations) |
| Minor | New features (new screens, new export formats)          |
| Patch | Bug fixes, perf improvements, accessibility fixes       |

The Changesets GitHub Action opens a "Version Packages" PR when changesets are pending on `main`. A human reviews and merges the version PR, which triggers platform release pipelines.

### Release Notes Format

```markdown
## v1.3.0

### 🎉 New Features
- Add monthly budget rollover (#134)
- Support recurring transactions (#201)

### 🐛 Bug Fixes
- Fix transaction list not loading on slow connections (#256)
- Correct currency formatting for JPY (#261)

### ♿ Accessibility
- Add missing labels to budget category selector (#270)

### 🏗️ Internal
- Upgrade SQLDelight to 2.1.0
- Improve sync engine retry logic
```

### Platform-Specific Release Workflows

Each platform has a dedicated release pipeline triggered by platform-prefixed Git tags:

| Platform | Tag Format         | Pipeline                | Distribution              |
| -------- | ------------------ | ----------------------- | ------------------------- |
| iOS      | `ios/v1.3.0`       | `release-ios.yml`       | TestFlight → App Store    |
| Android  | `android/v1.3.0`   | `release-android.yml`   | Internal → Beta → Play Store |
| Web      | `web/v2.1.0`       | `release-web.yml`       | Vercel deployment         |
| Windows  | `windows/v1.3.0`   | `release-windows.yml`   | Flight ring → Microsoft Store |

**Release progression:** Internal testing (1–2 days) → Beta (3–7 days) → Staged rollout → Full release.

**Pre-release channels:**

```
alpha.1 → alpha.2 → ... → beta.1 → beta.2 → ... → stable (v1.0.0)
```

See `docs/guides/versioning-strategy.md` and `docs/guides/app-store-submission.md` for platform-specific details.

## Metrics and Reporting

### Sprint Burndown

Track open vs. closed issues per sprint to measure progress:

```bash
# Open issues in current milestone
gh issue list --milestone "v0.1-beta" --state open | wc -l

# Closed issues in current milestone
gh issue list --milestone "v0.1-beta" --state closed | wc -l

# Completion percentage
echo "scale=1; $(gh issue list --milestone 'v0.1-beta' --state closed | wc -l) * 100 / ($(gh issue list --milestone 'v0.1-beta' --state open | wc -l) + $(gh issue list --milestone 'v0.1-beta' --state closed | wc -l))" | bc
```

### Platform Parity Tracking

Track feature coverage across iOS, Android, Web, and Windows to ensure no platform falls behind:

```bash
# Open feature issues per platform
for platform in ios android web windows; do
  echo "$platform: $(gh issue list --label "$platform" --label "feature" --state open | wc -l) open"
done

# Closed feature issues per platform
for platform in ios android web windows; do
  echo "$platform: $(gh issue list --label "$platform" --label "feature" --state closed | wc -l) closed"
done
```

**Parity rule:** A feature is not "done" for a milestone until it ships on all four platforms (unless explicitly scoped to fewer platforms in the issue).

### Tech Debt Ratio

Monitor the ratio of tech-debt issues to total open issues:

```bash
# Tech debt count
gh issue list --label "tech-debt" --state open | wc -l

# Total open issues
gh issue list --state open | wc -l
```

**Target:** Keep tech-debt below 20% of total open issues. If it exceeds 20%, dedicate one sprint slot per sprint to debt reduction.

### CI Health

Monitor CI pass rates and build times via GitHub Actions:

```bash
# Recent workflow runs
gh run list --limit 20

# Failed runs in the last week
gh run list --status failure --limit 20

# View a specific failed run
gh run view <run-id> --log-failed
```

**Targets:**

| Metric              | Target     |
| ------------------- | ---------- |
| CI pass rate        | > 95%      |
| Average build time  | < 10 min   |
| Flaky test rate     | < 2%       |
| Time to green (fix) | < 4 hours  |

See `docs/architecture/monitoring.md` for observability infrastructure and `docs/architecture/alerting-rules.md` for alert thresholds.

## Cross-Team Coordination

### When Business and Engineering Intersect

Some work items span business analysis, marketing, legal, or design in addition to engineering. These should still be tracked as GitHub Issues:

```bash
# Create a non-engineering issue
gh issue create --title "Research competitor budgeting features" \
  --label "chore" --label "P3" \
  --milestone "post-launch" \
  --body "Analyze budgeting approaches in YNAB, Mint, and Monarch Money.

## Acceptance Criteria
- [ ] Feature comparison matrix
- [ ] Recommendations for Finance differentiation
- [ ] Documented in docs/design/
"
```

**Non-engineering issue types:**

| Work Type          | Label      | Typical Assignee        |
| ------------------ | ---------- | ----------------------- |
| Market research    | `chore`    | @finance-domain         |
| UX research        | `docs`     | @design-engineer        |
| Legal/compliance   | `chore`    | @security-reviewer      |
| Content writing    | `docs`     | @docs-writer            |
| Business analysis  | `chore`    | @finance-domain         |

### Fleet Coordination

When using Copilot CLI's `/fleet` command for parallel agent work:

1. **File ownership** is enforced per agent (see `AGENTS.md` for the ownership table).
2. **No two agents edit the same file in parallel.** The orchestrator assigns file ownership before dispatching.
3. **Shared config files** (`gradle/libs.versions.toml`, `settings.gradle.kts`, `package.json`) are edited by only one agent per fleet run.
4. **Schema changes are serialized** — `@backend-engineer` writes migrations, `@kmp-engineer` writes `.sq` files, in coordination.
5. **The last agent to commit runs `npm run ci:check`** before pushing.

### Sprint Retrospective Format

At the end of each 2-week sprint, document a retrospective:

```markdown
## Sprint Retrospective — Sprint N (YYYY-MM-DD to YYYY-MM-DD)

### Velocity
- Planned: X points
- Completed: Y points
- Carried over: Z points

### What Went Well
- (List successes)

### What Could Improve
- (List friction points)

### Action Items
- [ ] Action 1 — Owner
- [ ] Action 2 — Owner

### Blockers Encountered
- #N — Description and resolution
```

Store retrospectives in the GitHub Projects board as iteration notes, or as comments on a dedicated sprint tracking issue.

## Quick Reference

### Common Queries

```bash
# My assigned issues
gh issue list --assignee @me --state open

# High-priority open issues
gh issue list --label "P0" --state open
gh issue list --label "P1" --state open

# Issues ready for work
gh issue list --search "is:open label:P1,P2 no:assignee"

# PRs awaiting review
gh pr list --search "is:open review:required"

# Issues closed this week
gh issue list --state closed --search "closed:>$(date -d '7 days ago' +%Y-%m-%d)"
```

### Key Documents

| Document                                   | Purpose                                  |
| ------------------------------------------ | ---------------------------------------- |
| `docs/architecture/roadmap.md`             | Full development roadmap (Phases 0–12)   |
| `docs/architecture/project-board.md`       | GitHub Projects V2 board configuration   |
| `docs/guides/versioning-strategy.md`       | Semver, Changesets, pre-release workflow  |
| `docs/guides/workflow-cheatsheet.md`       | Daily commands and Git workflow           |
| `docs/guides/issue-triage-report.md`       | Latest backlog triage findings           |
| `docs/guides/app-store-submission.md`      | Platform-specific store submission guides|
| `AGENTS.md`                                | Agent roles, file ownership, fleet rules |
