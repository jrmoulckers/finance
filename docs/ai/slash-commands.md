# Copilot Slash Commands (Prototype)

This document describes the prototype slash commands for Copilot CLI used in this repository. They are lightweight Node convenience scripts in [`scripts/`](../../scripts/) — a helper layer for human operators and early agents that **prints** the commands to run. They do not modify agent orchestration services.

> **Three distinct command surfaces — don't conflate them:**
>
> - **These prototype commands** (`/feature`, `/issue`, `/sprint`) — the `node scripts/dispatch-*.js` helpers documented here.
> - **Reusable prompts** in [`.github/prompts/`](../../.github/prompts/) (`sprint`, `team`, `backlog`, `fix-ci`, `rebase-all`, `review`, `cleanup`) — the Copilot CLI custom-prompt mechanism.
> - **`/fleet`** — the built-in Copilot CLI command for parallel multi-agent dispatch (see [`AGENTS.md`](../../AGENTS.md) § "Fleet / Swarm Workflows").
>
> Richer agent helper scripts (create-pr, rebase-and-push, pre-push-check, sprint-status, …) live in [`tools/agent-scripts/`](../../tools/agent-scripts/).

## Commands

- **`/feature <description>`** — run `node scripts/dispatch-feature.js "<description>"`
  - Creates a GitHub issue titled `Feature: <description>` (via `gh issue create`, label `automation`); falls back to printing the command if `gh` is unavailable.
  - Prints next-step branch/worktree commands and reminds the operator of the mandatory pre-push sequence.

- **`/issue <number>`** — run `node scripts/dispatch-issue.js <number>`
  - Prints the recommended branch (`feat/issue-<number>`) and worktree commands for the given issue.
  - Reminds the operator to run the pre-push sequence before pushing and opening a PR.

- **`/sprint <N> [agents]`** — run `node scripts/dispatch-sprint.js <N> "web-engineer,backend-engineer"`
  - Produces a `/fleet`-style command to dispatch N sprints across the given agents (comma-separated). If agents are omitted, it defaults to the **full 24-agent roster** (see [`.github/agents/`](../../.github/agents/)).
  - Each agent must follow the mandatory pre-push sequence before any push.

## Mandatory pre-push sequence (include verbatim in every agent prompt)

1. npm run format
2. npx eslint . --fix
3. npm run format:check && npx eslint . --max-warnings 0
4. If step 3 fails, fix and repeat from step 1
5. git add -A && git commit --amend --no-edit
6. $env:HUSKY = "0" ; git push --force-with-lease --no-verify origin <branch> (if rebased) OR git push --no-verify origin <branch> (if fresh)
7. gh pr create --base main with Closes #N
8. gh pr view <branch> --json number — verify the PR exists; if not, re-run step 7
9. gh pr checks <number> — poll until green; fix failures, push again
10. gh pr merge <number> --squash — self-merge your own PR once CI is green AND it is MERGEABLE

## Notes

- These scripts are intentionally lightweight and only attempt to run `gh` when available. They print explicit commands for manual execution when automation is not possible.
- This prototype does not modify agent orchestration services; it is a convenience layer for human operators and early agents.
- The canonical workflow rules live in [`AGENTS.md`](../../AGENTS.md), [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md), and [`.github/instructions/workflow.instructions.md`](../../.github/instructions/workflow.instructions.md).
