# Git Worktree Pattern — Finance Monorepo

This document describes how to run parallel AI agents (and human contributors) using git worktrees instead of multiple repository clones.

## Why Worktrees Instead of Multiple Clones

|                | Multiple clones                         | Git worktrees                                         |
| -------------- | --------------------------------------- | ----------------------------------------------------- |
| git history    | Duplicated per clone                    | Single shared history                                 |
| Remote sync    | Must pull in every clone separately     | One remote, all worktrees see it                      |
| Disk usage     | High (full .git per clone)              | Low (one .git, lightweight per worktree)              |
| Branch safety  | Easy to forget to pull before branching | `git worktree add` always branches from current state |
| Resume-ability | No standard way to find abandoned work  | `git worktree list` shows all active work instantly   |
| Cleanup        | Delete entire folder                    | `git worktree remove <path>`                          |

## Repository Layout

```
finance/                 ← main worktree — RESERVED FOR HUMAN WORK
  .git/
  apps/
  packages/
  ...
  .git/worktrees/        ← git tracks all registered worktrees here

../wt-android-feat-transactions-443/    ← agent worktree (android agent, issue #443)
../wt-web-fix-auth-127/                 ← agent worktree (web agent, issue #127)
../wt-kmp-feat-schema-align-88/         ← agent worktree (kmp agent, issue #88)
../wt-backend-fix-rls-policies-22/      ← agent worktree (backend agent, issue #22)
```

All worktrees share the same `.git` database — commits, branches, and remotes are all unified.

## Naming Convention

```
wt-[agent-type]-[branch-name]
```

Where `branch-name` follows the standard convention: `type/description-issue#`

**Examples:**

```bash
wt-android-feat-transactions-443
wt-web-fix-auth-127
wt-kmp-feat-schema-align-88
wt-backend-fix-rls-policies-22
wt-ios-feat-login-ui-55
wt-windows-feat-data-layer-71
wt-devops-ci-backend-workflow-103
```

The naming encodes: **who** is doing the work, **what kind** of work, and **which issue** — enough for any agent to scan and resume without human guidance.

## Agent Workflow

### Starting Work on an Issue

```bash
# Step 1: From the main repo, check for an existing worktree for this issue
git -C /path/to/finance worktree list

# Step 2a: If a matching worktree exists — resume it
cd ../wt-android-feat-transactions-443
git status   # understand current state
# Continue work...

# Step 2b: If no matching worktree — create one
git -C /path/to/finance worktree add \
  ../wt-android-feat-transactions-443 \
  -b feat/transactions-443
cd ../wt-android-feat-transactions-443
# Begin work...
```

### ⚠️ MANDATORY: Pre-Push Workflow (NEVER skip)

> **🚨 This is the #1 cause of fleet CI failures. Run these commands before EVERY push.**

Before pushing, every agent MUST complete these steps **in order**:

```powershell
# Step 1: Auto-fix formatting and lint issues
npm run format
npx eslint . --fix

# Step 2: Verify formatting and lint pass
npm run format:check && npx eslint . --max-warnings 0

# Step 3: If step 2 fails, fix and repeat from step 1

# Step 4: Include the fixes in your commit
git add -A && git commit --amend --no-edit

# Step 5: Sync with main
git fetch origin main
git rebase origin/main

# Step 6: Push (bypass Husky pre-push hook)
$env:HUSKY = "0" ; git push --no-verify origin <branch-name>
```

> **Remote CI is the source of truth.** Local type-check may fail on TS 5.9.3 — see [CI Monitoring](ci-monitoring.md). The workflow above checks format and lint locally (reliable), and defers type-check to remote CI.

> **Note:** `lint-staged` is configured in `.husky/pre-commit` (`eslint --fix` + `prettier --write` for TS/JS files; `prettier --write` for JSON/YAML/MD/CSS). However, agents may bypass hooks or work in worktrees where hooks aren't active. **The explicit checklist above is mandatory regardless of hook status.**

Both `git fetch` and `git rebase origin/main` on your own branch are auto-approved — no human confirmation needed.

### Pushing and Opening a PR

```powershell
# Push the feature branch (bypass Husky)
$env:HUSKY = "0" ; git push --no-verify origin feat/transactions-443

# Open PR automatically
gh pr create `
  --title "feat(android): implement transaction list (#443)" `
  --body "## Summary
...

## Issues
Closes #443

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Monitoring CI and Merge Conflicts

After opening a PR, the agent **must monitor** it until it is merge-ready. **Work is NOT complete until all remote CI checks are green.** Remote CI is the source of truth — see [CI Monitoring](ci-monitoring.md).

1. Poll `gh pr checks <number>` until all checks pass
2. If **CI failures** appear:
   - Read the failure logs (`gh run view <run-id> --log-failed`)
   - Fix the issues locally in the worktree
   - **Run the [Pre-Push Workflow](#️-mandatory-pre-push-workflow-never-skip) before re-pushing**
   - Commit, rebase if needed, and push again
   - Restart the check cycle
3. If **merge conflicts** appear:
   - `git fetch origin main && git rebase origin/main`
   - Resolve conflicts
   - Run the pre-push workflow, then push
   - Restart the check cycle
4. Once **all checks are green and no conflicts exist** — the agent marks its work complete

> **Work is NOT complete until `gh pr checks` shows all green.** Opening a PR and pushing
> is not the finish line — a clean CI run is.

### Post-Merge Cleanup

After confirming the PR has been merged:

```bash
# From the main repo directory
git -C /path/to/finance worktree remove ../wt-android-feat-transactions-443

# Optionally prune the remote tracking branch
git -C /path/to/finance remote prune origin
```

Cleanup is automatic — the agent removes its own worktree once merge is confirmed.

## Human Workflow

Humans follow the same pattern but have more flexibility:

- The **main worktree** (`finance/`) is available for quick reads, ad-hoc exploration, and review
- For active feature development, humans should also use worktrees to avoid interfering with agent worktrees
- Humans can also work in a separate full clone if preferred — the worktree approach is a recommendation, not a requirement for humans

## Scanning for Resumable Work

Any agent asked to continue work on an issue should first scan:

```bash
# List all active worktrees with their branch names
git -C /path/to/finance worktree list --porcelain

# Parse for issue number (e.g., looking for issue #443)
# Match worktree paths containing "-443"
```

If a matching worktree is found, the agent resumes there rather than creating a new one. This preserves any in-progress commits or stashes.

## Constraints

- A branch can only be checked out in **one worktree at a time**. If you need a second agent on the same branch, it must coordinate with the first.
- There is no practical limit to the number of worktrees on one machine.
- The `main` branch itself lives in the main worktree — agents never check out `main` in a worktree.
