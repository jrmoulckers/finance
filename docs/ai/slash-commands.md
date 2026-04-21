# Copilot Slash Commands (Prototype)

This document describes the prototype slash commands for Copilot CLI used in this repository.

Commands:

- /feature <description>
  - Creates a GitHub issue titled `Feature: <description>` (uses `gh issue create` if available).
  - Prints next-step commands to create a branch or worktree and reminds the user of the mandatory pre-push sequence.

- /issue <number>
  - Prints recommended branch and worktree commands for working on the given issue number.
  - Reminds the operator to run the pre-push sequence before pushing and opening a PR.

- /sprint <N> [agents]
  - Produces a /fleet-style command to dispatch N sprints across the given agents (comma-separated). If agents are omitted, defaults to the full agent set.
  - Each agent must follow the mandatory pre-push sequence before any push.

Mandatory pre-push sequence (include verbatim in every agent prompt):

1. npm run format
2. npx eslint . --fix
3. npm run format:check && npx eslint . --max-warnings 0
4. If step 3 fails, fix and repeat from step 1
5. git add -A && git commit --amend --no-edit
6. $env:HUSKY = "0" ; git push --force-with-lease --no-verify origin <branch> (if rebased) OR git push --no-verify origin <branch> (if fresh)
7. gh pr create with Closes #N
8. gh pr checks <number> — poll until green; fix failures, push again

Notes:

- These scripts are intentionally lightweight and only attempt to run `gh` when available. They print explicit commands for manual execution when automation is not possible.
- This prototype does not modify agent orchestration services; it is a convenience layer for human operators and early agents.
