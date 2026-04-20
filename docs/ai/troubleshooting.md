# Troubleshooting — AI Agent Common Issues

Solutions for the most common problems AI agents encounter in the Finance monorepo.

> **Related docs:** [Workflow](workflow.md) · [Worktrees](worktrees.md) · [Fleet Operations](fleet-operations.md) · [Agent Cookbook](agent-cookbook.md)

---

## Table of Contents

- [PR Failing "Lint & Format / ESLint & Prettier" Check](#pr-failing-lint--format--eslint--prettier-check)
- [PR Failing Type-Check](#pr-failing-type-check)
- [Merge Conflicts After Rebase](#merge-conflicts-after-rebase)
- [Worktree Already Exists for Branch](#worktree-already-exists-for-branch)
- [Pre-Push Hook Blocking Push](#pre-push-hook-blocking-push)
- [CI Check Stuck or Not Running](#ci-check-stuck-or-not-running)

---

## PR Failing "Lint & Format / ESLint & Prettier" Check

> **🚨 This is the #1 most common CI failure for fleet agents.**

### Symptoms

- PR check "Lint & Format / ESLint & Prettier (pull_request)" shows ❌
- CI log shows Prettier formatting differences or ESLint errors
- Agent pushed code without running format/lint locally first

### Root Cause

The agent pushed code without running the mandatory pre-push lint & format checklist. This is almost always caused by skipping `npm run format` and `npx eslint . --fix` before pushing.

### Fix

```bash
# Navigate to your worktree
cd ../wt-<your-worktree>

# ⚠️ Run the MANDATORY Pre-Push Checklist:
npm run format            # Step 1: auto-fix all Prettier formatting
npx eslint . --fix        # Step 2: auto-fix all ESLint issues
npm run ci:check          # Step 3: verify everything passes

# If ci:check still fails, fix remaining issues manually, then:
npm run ci:check          # re-run to confirm clean

# Commit the fixes
git add -A && git commit -m "style: fix formatting and lint issues (#N)"

# Push
git push origin <branch-name>

# Verify CI passes
gh pr checks <number>
```

### Prevention

**ALWAYS run these commands before every `git push`:**

1. `npm run format` — auto-fix Prettier
2. `npx eslint . --fix` — auto-fix ESLint
3. `npm run ci:check` — must be fully clean
4. `git add -A && git commit --amend --no-edit` — include fixes in commit
5. NOW push

**Pushing without a clean `npm run ci:check` is the #1 cause of CI failures.**

> **Note:** `lint-staged` is configured in `.husky/pre-commit` and auto-formats staged files on commit (`eslint --fix` + `prettier --write` for TS/JS; `prettier --write` for JSON/YAML/MD/CSS). However, agents may bypass hooks or work in worktrees where hooks aren't active. **The explicit checklist above is mandatory regardless of hook status.**

---

## PR Failing Type-Check

### Symptoms

- CI log shows TypeScript compilation errors
- `npm run type-check` fails locally

### Fix

```bash
# Run type-check locally to see errors
npm run type-check

# Fix the TypeScript errors in your code

# Then run the full pre-push checklist:
npm run format
npx eslint . --fix
npm run ci:check          # must pass

git add -A && git commit --amend --no-edit
git push origin <branch-name>
```

---

## Merge Conflicts After Rebase

### Symptoms

- `git rebase origin/main` shows conflict markers
- PR shows merge conflicts on GitHub

### Fix

```bash
# Fetch latest main
git fetch origin main

# Rebase
git rebase origin/main

# If conflicts:
# 1. Resolve conflicts in affected files
# 2. Stage resolved files
git add <resolved-files>
git rebase --continue

# Run pre-push checklist after resolving
npm run format
npx eslint . --fix
npm run ci:check

git add -A && git commit --amend --no-edit
git push origin <branch-name>
```

---

## Worktree Already Exists for Branch

### Symptoms

- `git worktree add` fails with "branch already checked out" error

### Fix

```bash
# List existing worktrees
git worktree list

# If the worktree exists, navigate to it and resume
cd ../wt-<existing-worktree>
git status

# If the worktree is stale and the branch is no longer needed:
# Ask a human to verify, then remove:
git worktree remove ../wt-<stale-worktree>
```

---

## Pre-Push Hook Blocking Push

### Symptoms

- `git push` fails with "HUMAN CONFIRMATION REQUIRED"
- Hook requires interactive terminal input

### Fix

The `.husky/pre-push` hook is designed to block non-interactive (AI agent) pushes. Use `--no-verify` to bypass:

```bash
git push origin <branch-name> --no-verify
```

> **Important:** Only use `--no-verify` AFTER running the full pre-push checklist (`npm run format` → `npx eslint . --fix` → `npm run ci:check`). The hook exists as a safety net — bypassing it without running CI checks locally defeats its purpose.

---

## CI Check Stuck or Not Running

### Symptoms

- `gh pr checks` shows no checks or checks are stuck in "queued" state

### Fix

```bash
# Check if the workflow exists
gh workflow list

# If checks are stuck, try pushing an empty commit to re-trigger:
git commit --allow-empty -m "chore: re-trigger CI"
git push origin <branch-name>

# If CI infrastructure is down, wait and re-poll at increasing intervals
# Local validation remains the baseline:
npm run ci:check
```

---

_For the full workflow, see [workflow.md](workflow.md). For fleet operations, see [fleet-operations.md](fleet-operations.md). For agent recipes, see [agent-cookbook.md](agent-cookbook.md)._
