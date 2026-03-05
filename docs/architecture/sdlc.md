# Software Development Lifecycle — Finance

## Methodology: Agentic Kanban

This project follows **Agentic Kanban** — a continuous-flow development methodology where AI agents are first-class contributors alongside human developers. It draws from:

- **Kanban** — Continuous flow with WIP limits and pull-based work
- **Shape Up** — Appetite-based scoping (define how much time work is *worth*, not how long it'll *take*)

The core dynamic: **humans direct, AI agents execute**. Humans own strategy, scoping, and review. Agents handle implementation, testing, and documentation. Work flows continuously — no sprints, no ceremonies, no artificial time boxes.

---

## Principles

1. **Continuous flow over fixed sprints** — Work flows through stages at its own pace. There are no sprint boundaries, standups, or velocity tracking. Items move forward when they're ready, not when a calendar says so.

2. **Appetite over estimates** — Instead of asking "how long will this take?", ask "how much time is this worth?" Define a time budget (appetite) for each feature. If it can't be done within the appetite, reshape it — don't extend the timeline.

3. **AI executes, humans direct** — Agents write code, tests, and documentation. Humans define scope, set priorities, review output, and make architectural decisions. This isn't about replacing developers — it's about leveraging AI for execution speed while humans focus on judgment.

4. **Small batches** — Break work into issues completable in 1–3 days. These are "AI-sized bites" — small enough for an agent to hold full context, large enough to deliver meaningful progress. Epics are composed of many small issues.

5. **Everything is an issue** — All work is tracked as GitHub Issues. No Slack threads, no mental to-do lists, no "I'll just quickly fix this." If it's worth doing, it's worth an issue. This creates a transparent, auditable record of all work.

6. **Ship when ready** — Features ship when they're done and reviewed, not on a schedule. There's no release train to catch. Continuous deployment means "done" = "in production."

---

## Work Types

| Type | Description | Tracking |
|------|-------------|----------|
| **Feature** | New user-facing capability. Involves UI, business logic, or new functionality visible to users. | Tracked as an epic (parent issue) with sub-issues for individual tasks. |
| **Bug** | Something broken that needs fixing. Deviates from expected behavior or acceptance criteria. | Single issue with reproduction steps and severity label. |
| **Task** | Internal work — refactoring, infrastructure, tooling, CI/CD, documentation, dependency updates. Not directly user-facing. | Single issue. |
| **Spike** | Time-boxed research to answer a question or reduce risk. Output is knowledge (an ADR, a recommendation, a proof of concept), not production code. | Single issue with a defined time box and deliverable. |

---

## Lifecycle Stages

Every work item flows through these stages, represented as columns on the project board:

| Stage | Description | Who Works | Exit Criteria |
|-------|-------------|-----------|---------------|
| **Triage** | New issues land here for prioritization. Includes bug reports, feature requests, and tasks. | Human | Prioritized, labeled, sized |
| **Shaping** | Define scope, acceptance criteria, constraints, and approach. Reduce ambiguity to zero. | Human + `@architect` | Clear scope, acceptance criteria, no open questions |
| **Ready** | Fully shaped and ready for implementation. Meets the Definition of Ready (below). | — | Meets Definition of Ready |
| **In Progress** | Active development. An agent or developer is working on this. | AI agents + Human | Code written, tests passing |
| **In Review** | PR open, awaiting review. Automated and human reviews in progress. | Human + `@security-reviewer`, `@accessibility-reviewer` | All reviews approved, CI green |
| **Done** | Merged to `main`. Deployed or ready to deploy. | — | Deployed or ready to deploy |

### WIP Limits

To maintain flow and prevent context-switching:

- **In Progress:** Max 3 items per developer/agent
- **In Review:** Max 5 items total
- **Shaping:** Max 3 items (don't over-shape ahead of capacity)

If a column hits its WIP limit, focus on completing existing work before pulling new items.

---

## Definition of Ready

An issue is **ready for implementation** when all of the following are true:

- [ ] Clear problem statement or user story ("As a [user], I want [capability] so that [benefit]")
- [ ] Acceptance criteria with testable conditions (specific, measurable outcomes)
- [ ] Affected packages/apps identified (labels applied: `app:mobile`, `app:web`, `pkg:core`, etc.)
- [ ] Platform scope defined (which platforms does this affect? iOS, Android, web, all?)
- [ ] Effort sized using t-shirt sizes:
  - **XS** — Less than half a day
  - **S** — Half a day to 1 day
  - **M** — 1–2 days
  - **L** — 2–3 days
  - **XL** — 3+ days (should be broken down further)
- [ ] Dependencies identified and resolved (blocked-by issues are done or have workarounds)
- [ ] No open questions (all ambiguity resolved during shaping)

---

## Definition of Done

A PR is **done** when all of the following are true:

- [ ] All acceptance criteria from the issue are met
- [ ] Tests written and passing (unit + integration where applicable)
- [ ] `@security-reviewer` approved (if the change touches data handling, authentication, cryptography, or API endpoints)
- [ ] `@accessibility-reviewer` approved (if the change touches UI components)
- [ ] Documentation updated (README, API docs, or user-facing docs as needed)
- [ ] No new linter or type errors introduced
- [ ] CI pipeline green (all checks passing)
- [ ] Human reviewer approved the PR

---

## Planning Cadence

No sprints, but regular rhythm:

| Cadence | Activity | Duration | Details |
|---------|----------|----------|---------|
| **Daily** | Triage new issues | ~5 min | Review incoming issues, label, and prioritize. Can be AI-assisted — agent drafts labels/priority, human approves. |
| **Weekly** | Board review | ~30 min | Review the board end-to-end. Unblock stuck items. Pull shaped items into Ready. Reprioritize backlog based on new information. |
| **Monthly** | Appetite planning | ~1 hr | Review roadmap progress. Set appetites for next month's work. Decide what's worth investing in and what to cut. Adjust priorities based on user feedback and metrics. |
| **Quarterly** | Strategic review | ~2 hr | Reassess product vision. Evaluate technology choices. Plan major features and architectural changes. Review whether the methodology itself is working. |

---

## Feature Development Flow

```
1. Human creates Feature issue with user story
   └─ "As a user, I want to categorize transactions so I can track spending"

2. Human (or @architect) shapes scope
   └─ Writes acceptance criteria, identifies affected packages, defines constraints
   └─ Breaks epic into sub-issues (each XS–L sized)

3. Issue moves to Ready
   └─ All sub-issues meet Definition of Ready

4. Assign to @copilot OR human developer
   └─ Agent picks up the issue, reads context, begins implementation

5. Agent/developer creates branch, implements, opens PR
   └─ Branch naming: feature/<issue-number>-short-description
   └─ Commit messages reference the issue number

6. Automated reviews: @security-reviewer, @accessibility-reviewer
   └─ Triggered automatically on PR creation

7. Human reviews PR
   └─ Code quality, architectural alignment, edge cases

8. Merge → Done
   └─ CI deploys to staging/production
```

---

## Bug Fixing Flow

```
1. Bug reported via issue template
   └─ Includes: steps to reproduce, expected vs actual behavior, environment details

2. Triage: reproduce, assess severity
   ├─ Critical — App crash, data loss, security vulnerability
   ├─ High — Major feature broken, no workaround
   ├─ Medium — Feature degraded, workaround exists
   └─ Low — Minor cosmetic issue, edge case

3. Critical/High: immediate fix
   └─ Skip shaping, go straight to In Progress
   └─ Hotfix branch: fix/<issue-number>-short-description

4. Medium/Low: shape, prioritize, enter normal flow
   └─ Goes through Shaping → Ready → In Progress like any other issue

5. Fix PR must include regression test
   └─ Test must fail without the fix and pass with it
```

---

## AI Agent Workflow

AI agents follow the same lifecycle as human developers. See [docs/ai/workflow.md](../ai/workflow.md) for detailed agent configuration and daily workflows.

### Key principles for AI in this lifecycle

- **Same lifecycle, same standards** — Issues assigned to `@copilot` flow through the same stages (Triage → Shaping → Ready → In Progress → In Review → Done). No shortcuts.

- **Same review requirements** — Agent PRs receive the same automated reviews (`@security-reviewer`, `@accessibility-reviewer`) and human review as human PRs. AI-authored code is not trusted by default.

- **Fleet mode for multi-faceted work** — Use `/fleet` for features that span multiple packages or require parallel work streams (e.g., implementing a feature across mobile + web + API simultaneously). The fleet orchestrator partitions the work and manages dependencies between agents.

- **Transparency** — All AI work is visible and auditable:
  - Commit messages explain *what* and *why*
  - PR descriptions document the agent's approach and decisions
  - Architecture Decision Records (ADRs) capture AI-generated design rationale in `docs/architecture/`
  - No "black box" changes — if an agent made a choice, the reasoning is documented

---

## Maintenance & Iteration

- **Dependency updates** — Monthly automated PRs via Dependabot or Renovate. Review and merge promptly to avoid security drift.

- **Technical debt** — Dedicate ~20% of capacity to tech debt reduction. Track debt items as `Task` issues with a `tech-debt` label. Don't let debt accumulate silently.

- **Retrospectives** — After each major feature ships, reflect on what worked and what didn't. Keep it lightweight — a short written retro in the issue or a brief discussion. Adjust the process based on findings.

- **Architecture decisions** — Documented as ADRs in `docs/architecture/`. Any significant technical decision (new dependency, pattern change, infrastructure choice) gets an ADR before implementation.

---

## Metrics (Future)

Track these to understand and improve flow:

| Metric | What It Measures | Target |
|--------|-----------------|--------|
| **Cycle time** | Time from Triage → Done | Decreasing trend |
| **Throughput** | Issues completed per week | Stable or increasing |
| **Bug rate** | Bugs per feature shipped | Decreasing trend |
| **Review turnaround** | Time from PR opened → approved | < 24 hours |

These are informational, not targets to game. Use them to identify bottlenecks and improve flow, not to measure individual performance.
