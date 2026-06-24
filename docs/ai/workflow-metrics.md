# Workflow Metrics — Finance AI Agents

This document defines measurable metrics for evaluating the efficiency, reliability, and quality of the AI agent development workflow. These metrics inform pain point prioritization and track improvement over time.

> **Related docs:** [Pain Points](pain-points.md) · [Workflow](workflow.md) · [Fleet Operations](fleet-operations.md) · [CI Monitoring](ci-monitoring.md)

---

## Table of Contents

- [Purpose](#purpose)
- [Metric Categories](#metric-categories)
- [Core Metrics](#core-metrics)
  - [Cycle Time Metrics](#cycle-time-metrics)
  - [Quality Metrics](#quality-metrics)
  - [CI/CD Metrics](#cicd-metrics)
  - [Fleet Operations Metrics](#fleet-operations-metrics)
  - [Documentation Metrics](#documentation-metrics)
- [Collection Methods](#collection-methods)
- [Reporting](#reporting)
- [Thresholds and Alerts](#thresholds-and-alerts)

---

## Purpose

Metrics serve three goals:

1. **Identify friction** — High cycle times or failure rates reveal pain points before they are reported
2. **Measure improvement** — After fixing a pain point, metrics confirm the fix is working
3. **Guide prioritization** — Metrics data drives which pain points to fix first

Metrics are NOT used to evaluate individual agent "performance." They measure system health.

---

## Metric Categories

| Category             | What it measures                                           |
| -------------------- | ---------------------------------------------------------- |
| **Cycle Time**       | How long it takes to move from issue → merge-ready PR      |
| **Quality**          | How often agent work requires rework or human intervention |
| **CI/CD**            | Build success rate, failure patterns, time-to-green        |
| **Fleet Operations** | Parallel agent coordination effectiveness                  |
| **Documentation**    | How often docs are the root cause of agent errors          |

---

## Core Metrics

### Cycle Time Metrics

#### CT-1: Issue to First Push

**Definition:** Time from when an agent starts working on an issue to the first `git push` of the feature branch.

**Measurement:** `first_push_timestamp - work_start_timestamp`

**Target:** < 2 hours for a standard feature; < 4 hours for cross-platform features.

**Why it matters:** Long times suggest the agent is stuck (unclear requirements, missing documentation, tooling issues).

---

#### CT-2: First Push to Merge-Ready

**Definition:** Time from first push to the PR reaching merge-ready state (all CI green, no conflicts, no outstanding review items).

**Measurement:** `merge_ready_timestamp - first_push_timestamp`

**Target:** < 30 minutes for a clean PR; < 2 hours if CI self-healing is needed.

**Why it matters:** Long times indicate CI issues, flaky tests, or conflict resolution delays.

---

#### CT-3: Issue to Merge-Ready (End-to-End)

**Definition:** Total time from issue assignment to merge-ready PR. This is the sum of CT-1 and CT-2.

**Measurement:** `merge_ready_timestamp - issue_assigned_timestamp`

**Target:** < 4 hours for a standard feature.

**Why it matters:** The primary productivity metric. Tracks overall workflow efficiency.

---

#### CT-4: PR Review Turnaround

**Definition:** Time from PR marked merge-ready to human review completion (approval or change request).

**Measurement:** `review_completed_timestamp - merge_ready_timestamp`

**Why it matters:** Not agent-controlled, but long review times reduce throughput. Tracking this metric helps identify human bottlenecks.

---

### Quality Metrics

#### Q-1: Avoidable CI Failure Rate

**Definition:** Percentage of CI runs that fail due to issues the pre-push checklist would have caught locally — formatting and lint (`npm run format:check && npx eslint . --max-warnings 0`). Type-check is excluded: it is unreliable locally on TS 5.9.3 (see [CI Monitoring](ci-monitoring.md)), so type failures are a remote-CI concern, not an avoidable local miss.

**Measurement:** `avoidable_failures / total_ci_runs × 100`

**Target:** < 5%

**Why it matters:** Avoidable CI failures waste time and indicate agents are skipping the pre-push checklist. Directly related to [PP-0002](pain-points.md#pp-0002-agents-skip-npm-run-cicheck-before-pushing).

---

#### Q-2: Human Intervention Rate

**Definition:** Percentage of PRs where a human must intervene before the agent finishes (excluding normal review). Includes: asking the agent to fix something, resolving a question the agent couldn't, or taking over the task.

**Measurement:** `prs_needing_intervention / total_prs × 100`

**Target:** < 20%

**Why it matters:** High intervention rates mean agents are frequently blocked or producing incomplete work.

---

#### Q-3: Rework Rate

**Definition:** Percentage of PRs that receive a "Changes Requested" review and require additional commits.

**Measurement:** `prs_with_changes_requested / total_prs × 100`

**Target:** < 30%

**Why it matters:** Rework indicates the initial agent output didn't meet quality standards. Persistently high rework suggests instruction or skill gaps.

---

#### Q-4: Financial Logic Escalation Rate

**Definition:** Frequency of `## Needs Decision` markers in PRs for financial logic questions.

**Measurement:** Count per sprint.

**Why it matters:** Appropriate escalation is expected — agents should NOT guess on financial logic. But an unusually high rate may indicate the `@finance-domain` agent or `financial-modeling` skill needs improvement.

---

### CI/CD Metrics

#### CI-1: CI Success Rate

**Definition:** Percentage of CI runs that pass on the first attempt after each push.

**Measurement:** `successful_first_runs / total_pushes × 100`

**Target:** > 85%

**Why it matters:** The baseline health metric for CI. Below target suggests systemic issues (flaky tests, infrastructure problems, or agents not running local checks).

---

#### CI-2: Time to Green

**Definition:** Time from push to all CI checks passing (includes self-healing cycles).

**Measurement:** `all_checks_green_timestamp - push_timestamp`

**Target:** < 15 minutes (first-pass green); < 45 minutes (with self-healing)

**Why it matters:** Long CI times block agent work and reduce throughput.

---

#### CI-3: Self-Healing Success Rate

**Definition:** When CI fails, how often does the agent successfully fix the issue and achieve green CI without human help?

**Measurement:** `self_healed_failures / total_ci_failures × 100`

**Target:** > 70%

**Why it matters:** Measures the effectiveness of the self-healing workflow documented in [ci-monitoring.md](ci-monitoring.md) and [fleet-operations.md](fleet-operations.md).

---

#### CI-4: Flaky Test Rate

**Definition:** CI runs that fail and then pass on re-run without code changes.

**Measurement:** `reruns_that_pass / total_reruns × 100`

**Target:** < 5% of all CI runs should be flaky

**Why it matters:** Flaky tests erode trust in CI and waste agent time. High rates indicate test infrastructure issues.

---

### Fleet Operations Metrics

#### FL-1: Fleet Completion Rate

**Definition:** Percentage of fleet operations where ALL agent PRs reach merge-ready without human intervention (excluding normal review).

**Measurement:** `fully_autonomous_fleets / total_fleets × 100`

**Target:** > 80%

**Why it matters:** The primary fleet health metric. Measures whether agents can operate independently in parallel.

---

#### FL-2: Fleet Cycle Time

**Definition:** Time from fleet dispatch to all PRs reaching merge-ready state.

**Measurement:** `last_pr_merge_ready_timestamp - fleet_dispatch_timestamp`

**Target:** < 6 hours for a standard fleet (4–6 agents)

**Why it matters:** Measures total throughput of parallel agent work.

---

#### FL-3: Cross-Agent Conflict Rate

**Definition:** Frequency of merge conflicts between fleet agent PRs.

**Measurement:** Count per fleet operation.

**Target:** 0 per fleet (file ownership rules should prevent this)

**Why it matters:** Conflicts indicate file ownership violations. Any non-zero count triggers a review of the ownership table in [fleet-operations.md](fleet-operations.md).

---

#### FL-4: Fleet Escalation Rate

**Definition:** Percentage of fleet operations where the orchestrator must escalate to a human (CI failure unresolvable after 2 attempts, financial logic decision, or coordination breakdown).

**Measurement:** `escalated_fleets / total_fleets × 100`

**Target:** < 20%

**Why it matters:** High escalation rates indicate the fleet model needs refinement — either agent instructions, coordination rules, or tooling.

---

### Documentation Metrics

#### DOC-1: Docs-Caused Error Rate

**Definition:** Frequency of agent errors that are traced back to missing, outdated, or inaccurate documentation.

**Measurement:** Count per sprint. Each pain point in [pain-points.md](pain-points.md) with category "Documentation" contributes.

**Target:** < 2 per sprint

**Why it matters:** Documentation is the primary communication channel for agent configuration. Errors caused by docs are a failure of the docs system, not the agent.

---

#### DOC-2: Documentation Coverage

**Definition:** Percentage of workflow steps, agent operations, and tooling configurations that are documented.

**Measurement:** Audit-based — review each agent's workflow against docs and count undocumented steps.

**Target:** > 95%

**Why it matters:** Undocumented workflows force agents to guess or ask humans, reducing autonomy.

---

## Collection Methods

Most metrics are collected passively through existing tools:

| Metric source         | Tool                       | How to query                                                       |
| --------------------- | -------------------------- | ------------------------------------------------------------------ |
| CI run data           | GitHub Actions API         | `gh run list --branch <branch> --json status,conclusion,createdAt` |
| PR lifecycle          | GitHub Pull Request API    | `gh pr list --json createdAt,mergedAt,reviews,labels`              |
| Fleet PR data         | GitHub Issues/PRs          | `gh pr list --search "fleet #<parent>"`                            |
| Pain point count      | This repo (pain-points.md) | Manual count from the document                                     |
| Self-healing attempts | PR commit history          | Count fix commits after CI failure on the same branch              |

**Automated collection:** The `tools/workflow-metrics.js` collector queries the GitHub API and generates a metrics report (Markdown + JSON). Run it with `node tools/workflow-metrics.js` (see `--help` for options such as `--days` and `--out-dir`); it is not yet wired to an npm script. Metrics it does not cover are still gathered manually during sprint retrospectives.

---

## Reporting

### Sprint Report Template

At the end of each sprint (or monthly), generate a report:

```markdown
## Workflow Metrics Report — Sprint N (YYYY-MM-DD)

### Cycle Time

- CT-3 (Issue to Merge-Ready): avg Xh, median Xh
- CT-2 (Push to Merge-Ready): avg Xmin, median Xmin

### Quality

- Q-1 (Avoidable CI Failures): X%
- Q-2 (Human Intervention): X%
- Q-3 (Rework Rate): X%

### CI/CD

- CI-1 (Success Rate): X%
- CI-2 (Time to Green): avg Xmin
- CI-3 (Self-Healing Rate): X%

### Fleet

- FL-1 (Completion Rate): X%
- FL-3 (Cross-Agent Conflicts): X total

### Pain Points

- Open: X (Critical: X, High: X, Medium: X, Low: X)
- Resolved this sprint: X
- New this sprint: X

### Action Items

- [ ] Fix PP-XXXX (Critical)
- [ ] Investigate Q-1 regression
```

---

## Thresholds and Alerts

Define thresholds that trigger action when crossed:

| Metric | Green | Yellow | Red   | Action when Red                           |
| ------ | ----- | ------ | ----- | ----------------------------------------- |
| CI-1   | > 85% | 70–85% | < 70% | Audit recent CI failures; file pain point |
| Q-1    | < 5%  | 5–15%  | > 15% | Enforce pre-push checklist; add git hook  |
| Q-2    | < 20% | 20–35% | > 35% | Review agent instructions and skills      |
| FL-1   | > 80% | 60–80% | < 60% | Review fleet coordination rules           |
| FL-3   | 0     | 1–2    | 3+    | Audit file ownership table                |
| CT-3   | < 4h  | 4–8h   | > 8h  | Investigate bottleneck (tooling or docs)  |

---

_Last updated: 2026-06-24. Maintained by `@docs-writer`._
