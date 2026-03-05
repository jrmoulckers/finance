# GitHub Projects Configuration — Finance

## Overview

The Finance project uses a single GitHub Projects V2 board as the central planning and tracking hub. This document defines the board structure, custom fields, views, and automation.

## Board Setup

### Custom Fields

Define these custom fields for the project board:

| Field | Type | Options | Purpose |
|-------|------|---------|---------|
| Status | Single select | Triage, Shaping, Ready, In Progress, In Review, Done | Workflow stage |
| Priority | Single select | Critical, High, Medium, Low | Urgency/importance |
| Effort | Single select | XS, S, M, L, XL | T-shirt sizing |
| Platform | Single select | iOS, Android, Web, Windows, Shared, Backend | Primary platform |
| Component | Single select | Core, Models, Sync, API, Docs, Tools, CI/CD | Codebase area |
| Sprint | Iteration | 2-week iterations | Optional time-boxing |
| Target Release | Text | Free-form (e.g., "v0.1", "MVP", "Beta") | Release planning |

### Views

#### 1. Board View (Default)

- **Layout:** Board
- **Columns:** Triage → Shaping → Ready → In Progress → In Review → Done
- **Group by:** Status
- **Purpose:** Day-to-day workflow management

#### 2. Roadmap View

- **Layout:** Timeline/Table
- **Group by:** Target Release
- **Sort by:** Priority
- **Purpose:** High-level planning, stakeholder communication

#### 3. Platform View

- **Layout:** Board
- **Group by:** Platform
- **Filter:** Status != Done
- **Purpose:** See workload distribution across platforms

#### 4. Triage View

- **Layout:** Table
- **Filter:** Status = Triage
- **Sort by:** Created date (newest first)
- **Purpose:** Quick triage of new issues

#### 5. My Work View

- **Layout:** Table
- **Filter:** Assignee = @me
- **Sort by:** Priority
- **Purpose:** Individual developer focus

## Automation Rules

Configure these automation rules via GitHub Projects settings (Settings → Workflows) or GitHub Actions:

1. **New issue → Triage:** When an issue is added to the project, set Status = Triage.
2. **PR opened → In Review:** When a linked PR is opened, move to In Review.
3. **PR merged → Done:** When a linked PR is merged, move to Done.
4. **Issue closed → Done:** When an issue is closed, move to Done.
5. **Stale detection:** Issues in "In Progress" for >7 days without activity get flagged.

## Workflow Rules

1. **WIP Limits:** Max 3 items in "In Progress" per person/agent at a time.
2. **Triage SLA:** New issues should be triaged within 24 hours.
3. **Review SLA:** PRs should get first review within 48 hours.
4. **No skipping:** Issues must pass through Shaping → Ready before In Progress (except Critical bugs).

## Integration with AI Agents

- Issues in "Ready" with the `good-first-issue` label are ideal for @copilot assignment.
- Agent-generated PRs appear in "In Review" automatically.
- AI agents can be assigned issues directly — they appear in the board like any contributor.
- Fleet mode (`/fleet`) creates sub-tasks that should be linked as sub-issues.

## Setting Up the Board

Step-by-step (a human must do this on GitHub):

1. Go to https://github.com/jrmoulckers/finance/projects
2. Create new project → Board
3. Add custom fields as defined above
4. Create views as defined above
5. Set up automation rules in Project Settings → Workflows
6. Link the project to the repository
