# Agent Cookbook — Finance Monorepo

Practical recipes for common agent workflows. Each recipe includes the exact commands to run.

> **Related docs:** [Workflow](workflow.md) · [Worktrees](worktrees.md) · [Fleet Operations](fleet-operations.md) · [Troubleshooting](troubleshooting.md)

---

## Table of Contents

- [Recipe 1: Implement a Feature (Single Agent)](#recipe-1-implement-a-feature-single-agent)
- [Recipe 2: Fix a Bug](#recipe-2-fix-a-bug)
- [Recipe 3: Documentation-Only Change](#recipe-3-documentation-only-change)
- [Recipe 4: Fix a Failing CI Check](#recipe-4-fix-a-failing-ci-check)
- [Recipe 5: Resume Abandoned Work](#recipe-5-resume-abandoned-work)
- [Pre-Push Lint & Format Checklist](#️-mandatory-pre-push-lint--format-checklist)

---

## ⚠️ MANDATORY: Pre-Push Lint & Format Checklist

> **🚨 This is the #1 cause of fleet CI failures. Run these commands before EVERY `git push`.**

Every recipe that involves pushing code MUST include this checklist. It is repeated here as a standalone reference and embedded in each recipe below.

```bash
# Step 1: Auto-fix formatting and lint issues FIRST
npm run format          # auto-fix all Prettier formatting
npx eslint . --fix      # auto-fix all ESLint issues

# Step 2: Verify everything passes
npm run ci:check        # runs format:check + lint + type-check

# Step 3: If ci:check fails, fix remaining issues manually, then re-run:
npm run ci:check

# Step 4: Include the fixes in your commit
git add -A && git commit --amend --no-edit

# Step 5: NOW you may push
git push origin <branch-name>
```

**Pushing without a clean `npm run ci:check` is the #1 cause of CI failures. Agents that skip this waste CI time and create noise.**

---

## Recipe 1: Implement a Feature (Single Agent)

```bash
# 1. Create or verify a GitHub issue exists
gh issue create --title "feat: implement budget rollover" --body "..." || echo "Issue already exists"

# 2. Scan for existing worktree
git worktree list

# 3. Create worktree
git worktree add ../wt-kmp-feat-budget-rollover-134 -b feat/budget-rollover-134
cd ../wt-kmp-feat-budget-rollover-134

# 4. Implement changes...
# ... write code, tests ...

# 5. Commit
git add -A
git commit -m "feat(core): implement budget rollover (#134)"

# 6. ⚠️ MANDATORY PRE-PUSH CHECKLIST (NEVER skip)
npm run format
npx eslint . --fix
npm run ci:check          # MUST be clean
git add -A && git commit --amend --no-edit   # include fixes

# 7. Rebase and push
git fetch origin main && git rebase origin/main
git push origin feat/budget-rollover-134

# 8. Create PR
gh pr create --title "feat(core): implement budget rollover (#134)" \
  --body "## Summary\nImplement budget rollover logic.\n\nCloses #134"

# 9. Monitor CI until green
gh pr checks <number>
```

---

## Recipe 2: Fix a Bug

```bash
# 1. Verify issue exists
gh issue view 200

# 2. Create worktree
git worktree add ../wt-web-fix-auth-token-200 -b fix/auth-token-200
cd ../wt-web-fix-auth-token-200

# 3. Fix the bug...
# ... write fix, add regression test ...

# 4. Commit
git add -A
git commit -m "fix(web): handle expired auth token gracefully (#200)"

# 5. ⚠️ MANDATORY PRE-PUSH CHECKLIST (NEVER skip)
npm run format
npx eslint . --fix
npm run ci:check          # MUST be clean
git add -A && git commit --amend --no-edit   # include fixes

# 6. Rebase and push
git fetch origin main && git rebase origin/main
git push origin fix/auth-token-200

# 7. Create PR
gh pr create --title "fix(web): handle expired auth token gracefully (#200)" \
  --body "## Summary\nFix expired token handling.\n\nCloses #200"

# 8. Monitor CI
gh pr checks <number>
```

---

## Recipe 3: Documentation-Only Change

```bash
# 1. Create worktree
git worktree add ../wt-docs-update-api-ref-86 -b docs/api-reference-86
cd ../wt-docs-update-api-ref-86

# 2. Make documentation changes...

# 3. Commit
git add -A
git commit -m "docs: update API reference for sync endpoints (#86)"

# 4. ⚠️ MANDATORY PRE-PUSH CHECKLIST (NEVER skip — even for docs)
npm run format
npx eslint . --fix
npm run ci:check          # MUST be clean
git add -A && git commit --amend --no-edit   # include fixes

# 5. Rebase and push
git fetch origin main && git rebase origin/main
git push origin docs/api-reference-86

# 6. Create PR
gh pr create --title "docs: update API reference for sync endpoints (#86)" \
  --body "## Summary\nUpdate API docs.\n\nCloses #86"
```

---

## Recipe 4: Fix a Failing CI Check

When your PR is failing the "Lint & Format" CI check:

```bash
# 1. Navigate to your worktree
cd ../wt-<your-worktree>

# 2. Run the auto-fix commands
npm run format            # fix all Prettier issues
npx eslint . --fix        # fix all ESLint issues

# 3. Verify clean
npm run ci:check          # MUST pass completely

# 4. If ci:check still fails, fix remaining issues manually, then re-run:
npm run ci:check

# 5. Commit the fix
git add -A
git commit -m "style: fix formatting and lint issues (#N)"

# 6. Push
git push origin <branch-name>

# 7. Re-check CI
gh pr checks <number>
```

---

## Recipe 5: Resume Abandoned Work

```bash
# 1. Scan for existing worktrees
git worktree list

# 2. Navigate to the worktree
cd ../wt-android-feat-transactions-443

# 3. Understand current state
git status
git log --oneline -5

# 4. Continue work...

# 5. ⚠️ MANDATORY PRE-PUSH CHECKLIST (NEVER skip)
npm run format
npx eslint . --fix
npm run ci:check          # MUST be clean
git add -A && git commit --amend --no-edit

# 6. Rebase and push
git fetch origin main && git rebase origin/main
git push origin <branch-name>
```

---

_For the full workflow, see [workflow.md](workflow.md). For fleet operations, see [fleet-operations.md](fleet-operations.md). For troubleshooting CI failures, see [troubleshooting.md](troubleshooting.md)._
