---
name: bug-bash
description: Run a bounded bug discovery, reproduction, fix, and verification campaign
parameters:
  - name: scope
    type: string
    description: Product area, recent change set, or test surface to investigate
    default: recent-changes
  - name: max-findings
    type: integer
    description: Maximum verified defects to carry into issue and fix work
    default: 5
    minimum: 1
    maximum: 10
built_ins:
  - task
  - read_agent
  - list_agents
  - sql_todos
agent_dependencies:
  - qa-tester
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Bug Bash — Bounded Discovery and Repair

Coordinate a time-boxed workflow across existing roles. This is a task-mode campaign, not a new or
permanent agent.

## Runtime Contract

This prompt requires Copilot App/CLI parameter interpolation, `task` dispatch, agent polling through
`read_agent` / `list_agents`, and SQL todos. These are runtime contracts, not repository custom-agent
slugs. Validate non-empty `{{ scope }}` and validate `{{ max-findings }}` as a positive integer within
its declared bounds. If interpolation or a required capability is unavailable, stop before dispatch,
issue creation, or mutation.

## Execution Plan

### 1. Resolve Authority, Roster, and Test Surface

Read root `AGENTS.md`, scoped `AGENTS.md` applicable to `{{ scope }}`, product documentation, and
applicable consumer `.github/instructions/`. In the canonical backbone, also consult source
`instructions/`.

Confirm that `qa-tester` is selected and applicable under the local routing overlay. Build the
implementation roster from known canonical plus declared-local roles, excluding disabled,
handoff-only, read-only, or out-of-scope roles. File presence in `.github/agents/` alone is not
dispatch authority. Infrastructure or pre-bootstrap repositories require an explicit local
infrastructure-safe override; otherwise stop with a read-only test plan.

Define a finite scenario list for `{{ scope }}` from recent changes, critical user paths, existing
tests, and documented risk. Cap verified findings at `{{ max-findings }}` and track each scenario in
SQL todos.

### 2. Discover and Reproduce

Dispatch one bounded read-only QA assignment:

```text
task(
  agent_type="qa-tester",
  name="bug-bash-discovery",
  description="Discover and reproduce bounded defects",
  prompt="Scope: {{ scope }}
  Finding limit: {{ max-findings }}
  Scenarios: <finite scenario list resolved in step 1>

  Test only these scenarios and return at most {{ max-findings }} verified findings. For each
  candidate include exact reproduction steps, expected/actual behavior, current-code evidence,
  severity, likely owner, and whether the result was reproduced. Do not modify code."
)
```

Use `read_agent` / `list_agents` to collect the result. Deduplicate candidates and discard anything
not reproducible. Stop discovery once the finding cap is reached; do not expand into unrelated areas.

### 3. File Verified Issues First

Before any fix:

1. Search open and recently closed issues with bounded `gh issue list --limit 100` queries.
2. File one focused issue per verified, non-duplicate defect using the repository's issue template.
3. Include reproduction steps, expected/actual behavior, evidence, severity, affected surface,
   verification plan, and the applicable owner.
4. Do not close issues manually; fixes must use `Closes #<issue>`.

Remote issue writes must comply with root/scoped authority. If issue creation is unavailable or
unauthorized, stop with complete issue drafts and do not begin implementation.

### 4. Dispatch Bounded Fixes

Route each issue to exactly one applicable owning role, with no more than three concurrent fixes.
Each task must:

- Prefer an app-native isolated project session/worktree from the latest default branch.
- Otherwise use only a runtime-provided, explicitly approved worktree location allowed by local
  authority; never invent a sibling path or reuse an unowned worktree.
- Reproduce the defect before changing code, implement the smallest root-cause fix, and add or update
  regression coverage.
- Run the repository's affected format/lint/type-check/test/build commands.
- Commit conventionally with the issue number, push the owned feature branch, and open a focused PR
  containing `Closes #<issue>`.
- Self-merge only when root/scoped `AGENTS.md` permits it, the session owns the PR, all required
  checks are green, the PR is conflict-free, and GitHub reports it mergeable.

Fork, human, shared, unknown, or unauthorized branches remain read-only handoffs.

### 5. Verify Independently and Report

After each fix, have the QA role re-run the original reproduction and relevant regression scenario
without modifying production code. A passing unit test alone is not enough when the original
user-visible reproduction can be exercised.

Report scenarios covered, verified defects, duplicate/non-reproducible candidates, issues filed, fix
PRs and CI/merge status, independent verification, remaining risk, and any `## Needs Human Action`
handoffs. End the campaign when the finite scenario list or finding cap is exhausted; do not create a
standing bug-bash role.
