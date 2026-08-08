---
name: team
description: Deploy specific agent types for targeted work across N sprints
parameters:
  - name: agents
    type: agent-list
    description: Comma-separated list of agent types (e.g., backend-engineer, web-engineer, docs-writer)
    default: ''
    required: true
    minimum_items: 1
    maximum_items: 5
  - name: N
    type: integer
    description: Number of sprints to execute
    default: 1
    minimum: 1
    maximum: 3
built_ins:
  - task
  - read_agent
  - list_agents
  - sql_todos
agent_dependencies: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Team — Targeted Agent Deployment

Deploy only the requested agent types — **{{ agents }}** — for **{{ N }}** sprint waves.

## Runtime Contract

This prompt requires Copilot App/CLI parameter interpolation, `task` dispatch, agent polling through
`read_agent` / `list_agents`, and SQL todos. These are runtime contracts, not repository custom-agent
slugs. Before fetching or dispatching, validate `{{ N }}` as a positive integer within its declared
bounds and parse `{{ agents }}` into 1–5 non-empty, trimmed, unique slugs. If interpolation or any
required capability is unavailable, stop before dispatch or mutation.

## Execution Plan

### 1. Resolve Authority and Validate Requested Roles

Read root `AGENTS.md`, scoped `AGENTS.md` applicable to candidate work, and applicable consumer
`.github/instructions/`. In the canonical backbone, also consult source `instructions/`.

Every requested slug must be a known canonical role or a declared-local role and must be applicable
under the repository's local routing/ownership overlay. Presence in `.github/agents/` alone is not
sufficient. Reject the entire dispatch before work begins if any slug is unknown, disabled,
handoff-only, read-only for the proposed implementation, outside its ownership scope, or otherwise
inapplicable. Infrastructure and pre-bootstrap repositories require an explicit local
infrastructure-safe override for every requested role and assignment.

### 2. Sync and Filter

```bash
git fetch origin <default-branch>
gh issue list --state open --limit 200 --json number,title,labels,milestone,assignees,updatedAt
gh pr list --state open --limit 200 --json number,title,headRefName,statusCheckRollup,closingIssuesReferences
```

- Map each validated role to likely issues using labels and the resolved local routing/ownership
  overlay.
- Exclude issues referenced by collected open-PR `closingIssuesReferences`; do not infer linkage.

### 3. Plan and Deploy

For each sprint:

1. Select one focused issue per requested agent type.
2. Dispatch agents in parallel, one per assignment:
   ```text
   task(
     agent_type="<validated-agent-slug>",
     name="team-<wave-number>-<issue-number>",
     description="Implement issue #<issue-number>",
     prompt="<focused assignment plus resolved local authority and verification requirements>"
   )
   ```
3. Each agent follows the sprint workflow:
   - Prefer an app-native isolated project session/worktree from the latest default branch.
   - Otherwise use only a runtime-provided, explicitly approved worktree location allowed by local
     authority; never invent a sibling path or reuse an unowned worktree.
   - Implement with tests and scoped changes.
   - Run the repo's relevant format/lint/type-check/test/build commands.
   - Rebase, push, and create a PR with `Closes #N`.
   - Monitor CI; if it fails, read logs, fix, and re-push.
   - Self-merge only when root/scoped `AGENTS.md` permits it, the session owns the PR, all required
     checks are green, the PR is conflict-free, and GitHub reports it mergeable.

### 4. Monitor and Report

- Poll completions with `read_agent` / `list_agents`.
- Track assignments in SQL todos.
- Diagnose, re-dispatch, or escalate failures.
- Report issues addressed per agent type, PR status, blockers, and remaining scoped backlog.
