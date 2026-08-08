# Prompt Library — Finance Monorepo

Reusable prompt templates for common fleet and project management operations. These prompts live in `.github/prompts/` and can be invoked in the Copilot CLI by referencing them in conversation.

## Usage

Reference a prompt by name when chatting with the Copilot CLI:

```
Use the sprint prompt with N=3
Run the backlog prompt
Use the team prompt for android-engineer, web-engineer with N=2
Run fix-ci
```

The CLI loads the `.prompt.md` file and follows the instructions inside, substituting any parameters you provide.

---

## Available Prompts

### `sprint` — Full Fleet Deployment

> **File:** `sprint.prompt.md`

Deploys N sprints across all agent types in parallel. Each sprint dispatches up to 15 agents, each working in its own worktree with full CI validation.

**Parameters:**

| Name | Default | Description              |
| ---- | ------- | ------------------------ |
| `N`  | `3`     | Number of sprints to run |

**Examples:**

```
Use the sprint prompt with N=3
Run 5 sprints using the sprint prompt
```

**What it does:**

1. Fetches latest main and queries open issues
2. Categorizes issues by agent type
3. Dispatches agents in parallel waves (1 issue per agent type per wave)
4. Each agent: creates worktree → implements → lint/format → rebase → push → create PR → monitor CI → self-merge
5. Reports results after all waves complete

---

### `team` — Targeted Agent Deployment

> **File:** `team.prompt.md`

Deploys only specific agent types for focused work. Use when you want to run a subset of the fleet.

**Parameters:**

| Name     | Default | Description                 |
| -------- | ------- | --------------------------- |
| `agents` | (none)  | Comma-separated agent types |
| `N`      | `2`     | Number of sprints           |

**Examples:**

```
Use the team prompt for android-engineer, ios-engineer, web-engineer with N=2
Run team prompt for kmp-engineer with N=1
```

---

### `backlog` — Project Status Dashboard

> **File:** `backlog.prompt.md`

Generates a comprehensive status report: open issues, PR status, CI health, worktree inventory, and cleanup recommendations.

**Parameters:** None

**Examples:**

```
Run the backlog prompt
Show me the project backlog
```

**What it shows:**

- Issue backlog categorized by agent type and priority
- Open PRs with CI status, merge conflicts, and review state
- Worktree inventory with stale/orphaned detection
- Summary of done, in-progress, and blocked items

---

### `fix-ci` — Fix Failing CI Checks

> **File:** `fix-ci.prompt.md`

Finds every open PR with failing CI and dispatches agents to fix them.

**Parameters:** None

**Examples:**

```
Run the fix-ci prompt
Fix all failing CI checks
```

**What it does:**

1. Lists all open PRs with failing checks
2. Categorizes failures (format, lint, type-check, build, test, conflicts)
3. Dispatches fix agents per PR (batched by type)
4. Each agent: reads logs → fixes → validates → pushes
5. Reports which PRs were fixed and which need human attention

---

### `rebase-all` — Rebase All Open PRs

> **File:** `rebase-all.prompt.md`

Rebases every open PR onto the latest `main` to prevent merge conflict accumulation.

**Parameters:** None

**Examples:**

```
Run the rebase-all prompt
Rebase all open PRs
```

**What it does:**

1. Fetches latest main
2. For each open PR: enters worktree → rebases → validates → pushes
3. Flags PRs with non-trivial conflicts for human resolution
4. Reports results (rebased / conflicting / already up-to-date)

---

### `review` — Parallel Code Review

> **File:** `review.prompt.md`

Dispatches code-review agents in parallel to review all (or selected) open PRs.

**Parameters:**

| Name    | Default | Description                         |
| ------- | ------- | ----------------------------------- |
| `scope` | `all`   | `all` or comma-separated PR numbers |

**Examples:**

```
Run the review prompt
Review PRs 42, 57, 63 using the review prompt
```

**What it does:**

1. Lists open PRs (filters by scope)
2. Dispatches `code-review` agents in parallel
3. Each reviews for: correctness, security, financial accuracy, accessibility, architecture, tests
4. Collects results: needs-changes vs. ready-to-merge
5. Produces structured review summaries

---

### `cleanup` — Project Hygiene

> **File:** `cleanup.prompt.md`

Prunes stale worktrees, identifies stale PRs/issues, finds duplicates, and lists merged branches.

**Parameters:**

| Name         | Default | Description                                 |
| ------------ | ------- | ------------------------------------------- |
| `stale-days` | `30`    | Days of inactivity before flagging as stale |

**Examples:**

```
Run the cleanup prompt
Clean up the project with stale-days=14
```

**What it does:**

1. Runs `npm run cleanup:worktrees` to prune merged worktrees
2. Lists PRs inactive for N+ days with recommendations
3. Lists unclaimed issues inactive for N+ days
4. Scans for duplicate issues by title similarity
5. Lists merged remote branches safe to delete
6. Produces a cleanup report (does NOT auto-close anything)

---

### `bug-bash` — Bounded Bug Discovery and Repair

> **File:** `bug-bash.prompt.md`

Runs the canonical bounded QA campaign across Finance's four platforms (iOS, Android, Web, Windows) and shared `packages/`: define a finite scenario list, dispatch read-only discovery to `qa-tester`, file one issue per verified defect, route bounded fixes to the active canonical owner, independently verify each fix, and report the campaign. It is a task mode, not a permanent bug-fixer agent.

**Parameters:**

| Name           | Default          | Description                                                     |
| -------------- | ---------------- | --------------------------------------------------------------- |
| `scope`        | `recent-changes` | Product area, recent change set, or test surface to investigate |
| `max-findings` | `5`              | Maximum verified defects to carry into issue and fix work       |

**Examples:**

```
Use the bug-bash prompt with scope="recent bank-connectivity changes" max-findings=3
Run bug-bash with scope="Android onboarding back navigation" max-findings=1
Run bug-bash with scope="JPY amount rounding in shared packages" max-findings=1
```

**Finance overlay:**

1. A pasted single-bug report is a valid one-scenario `scope`; use `max-findings=1` and ask one clarifying question only when its reproduction is genuinely ambiguous. The campaign can run in a standalone session or an existing session.
2. Infer affected platforms from the report and screenshot cues. An undefined platform means every affected platform or one shared fix, never web-only.
3. Search both the inferred platform implementation and shared `packages/` or `config/i18n`; verify the root cause against current `main` with `file:line` evidence.
4. Prefer one shared fix for a shared root cause. Otherwise implement natively on the known platform or make the fix widespread across every affected platform.
5. File issue-first with the correct `platform:*`, type, and accessibility labels by following the `issue-management` skill, then route implementation to `native-app-engineer`, `web-engineer`, or the applicable shared owner.
6. Add or update affected tests, run the complete workflow instructions through self-merge, remove the task worktree, and report issue/PR/platform/fix-scope/root-cause/worktree outcomes.
7. For web reproduction, use a free local port rather than assuming the shared `:5199` server exists.

> ⚠️ Never edits `apps/web/vite.config.ts` (the bug-bash host keeps a local-only `allowedHosts` edit there).

---

## Creating New Prompts

To add a new prompt:

1. Create a file in `.github/prompts/` with the `.prompt.md` extension.
2. Add frontmatter with `name`, `description`, and `parameters`.
3. Write the full instruction set the agent should follow.
4. Add an entry to this README.

**Template:**

```markdown
---
name: my-prompt
description: What this prompt does
parameters:
  - name: param1
    description: What this parameter controls
    default: value
---

# My Prompt — Title

<Instructions for the agent to follow>
```

## Design Principles

- **Deterministic**: Each prompt produces consistent results given the same inputs.
- **Self-contained, but DRY on canonical registries**: Prompts include the concrete steps an agent needs to execute. For project facts that evolve over time — the **label → agent map** (the `sprint-planning` skill) and the **pre-push / push / merge workflow** (`.github/instructions/workflow.instructions.md`) — prompts reference the canonical source instead of duplicating it, so they can't drift out of date.
- **Safe by default**: Prompts respect human-gated operations. Destructive actions are flagged, not executed.
- **Observable**: Every prompt ends with a structured report so the human can verify results.
