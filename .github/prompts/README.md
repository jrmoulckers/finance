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

### `bug-bash` — Fix One Bug End-to-End (Any Platform)

> **File:** `bug-bash.prompt.md`

Runs the [`bug-basher`](../agents/bug-basher.agent.md) lifecycle for a single reported bug on any of Finance's four platforms (iOS, Android, Web, Windows) or its shared `packages/`: infer the affected platform(s) from the report + screenshot → investigate → file a GitHub issue → implement a fix (shared-once when the root cause is shared, or widespread across every affected platform when the platform is undefined) on its own worktree → open a PR → drive cloud CI green → self-merge → clean up. Designed to be launched as a standalone, fire-and-forget session per bug, but also works when invoked inside an existing session.

**Parameters:**

| Name       | Default       | Description                                                                                                                            |
| ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `bug`      | (none)        | The bug report to fix (short description, optional screenshot + repro).                                                                |
| `platform` | (infer / all) | Optional target platform (`ios`, `android`, `web`, `windows`, `shared`, or `all`). Omit to infer; undefined = fix everywhere affected. |

**Examples:**

```
Use the bug-bash prompt with bug="Consent dialog toggle has insufficient contrast in dark mode"
Run bug-bash for: onboarding step 2 text can't be selected
Use bug-bash with bug="Amounts round incorrectly for JPY" platform="shared"
Use bug-bash with bug="Back button skips a screen" platform="android"
```

**What it does:**

1. Intakes the bug + optional platform (asks one clarifying question only if the repro is ambiguous)
2. Infers the affected platform(s) from the report + screenshot cues (honors an explicit `platform`)
3. Reproduces and root-causes it against `main` with verified `file:line`, across the platform's code and shared `packages/`
4. Files an issue-first GitHub issue with correct `platform:*` scoping (`platform:shared`, a single platform, or multiple for a widespread fix)
5. Implements the fix at the right scope on its own worktree + adds affected tests (shared-once, platform-native, or widespread across every affected platform — never web-only by default)
6. Runs the pre-push checklist → rebase → push → PR with `Closes #N`
7. Drives cloud CI green, resolves conflicts, self-merges once `MERGEABLE`, and removes its worktree

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
