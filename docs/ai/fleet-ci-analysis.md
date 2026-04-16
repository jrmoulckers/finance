# Fleet CI Failure Analysis

> Analysis date: 2026-04-16
> Context: 15 agents deployed in parallel, ~38 PRs created, 17 failing CI (45%)

## Executive Summary

**Root cause identified**: The `npm run ci:check` command that agents are instructed
to run before pushing does **not** match actual CI behavior. CI enforces
`--max-warnings 0` on ESLint; the local `ci:check` script does not. This means
agents can push code that passes local checks but fails remote CI.

**Fix applied in this PR**: The `lint` script in `package.json` now includes
`--max-warnings 0`, making `npm run ci:check` match CI exactly.

**Recommendation**: Use `npm run ready-for-pr` as the canonical pre-push command.
It already mirrors CI correctly and runs additional checks (web tests, KMP
compilation when Kotlin files changed).

## Failure Breakdown

### By Check Type

| Check                              | Failing PRs | % of Failures |
| ---------------------------------- | ----------- | ------------- |
| ESLint & Prettier                  | 16          | 94%           |
| Build & Test (KMP/Android/Windows) | 3           | 18%           |
| Unit Tests                         | 1           | 6%            |

_Note: Some PRs fail multiple checks._

### By Failure Mode

| Mode                           | Count | Root Cause                                                           |
| ------------------------------ | ----- | -------------------------------------------------------------------- |
| Prettier formatting (markdown) | ~8    | Agents create/edit `.md` files without running `npm run format`      |
| ESLint warnings (unused vars)  | ~8    | Agents introduce unused imports; `ci:check` silently allows warnings |
| KMP compilation errors         | 2     | Genuine code issues in shared Kotlin packages                        |
| Test regressions               | 1     | New code with test failures                                          |

### Detailed PR Analysis

#### Category 1: Prettier Formatting (Markdown)

Affected PRs: #921, #919, #911, #898, #896, #874, #870, #862, #857

**Example (PR #921 — marketing docs):**

```
[warn] docs/marketing/aso-keyword-research.md
[warn] docs/marketing/beta-insights-report.md
[warn] docs/marketing/brand-voice-guide.md
... (15 files total)
Code style issues found in 15 files. Run Prettier with --write to fix.
```

**Why it happens**: Agents write markdown files but never run `npm run format`
(which invokes `npx prettier --write .`). Prettier enforces consistent markdown
formatting (line wrapping, list indentation, table alignment, etc.).

**Fix**: Agents must run `npm run format` before committing.

#### Category 2: ESLint Warnings

Affected PRs: #922, #913, #906, #882, #875

**Example (PR #922 — web PWA):**

```
apps/web/src/pages/OfflineFallbackPage.test.tsx
  9:32  warning  'vi' is defined but never used  @typescript-eslint/no-unused-vars

apps/web/src/sw/service-worker.ts
  217:16  warning  'networkFirst' is defined but never used  @typescript-eslint/no-unused-vars

✖ 2 problems (0 errors, 2 warnings)
ESLint found too many warnings (maximum: 0).
```

**Why it happens**: The ESLint config uses `'warn'` for `no-unused-vars`, but CI
runs with `--max-warnings 0`. Agents write code with unused imports (especially
`vi` from Vitest in test files), and the local `npm run lint` command passes
because it doesn't enforce `--max-warnings 0`.

**The critical mismatch:**

| Command                                  | ESLint invocation                     | Warnings cause failure? |
| ---------------------------------------- | ------------------------------------- | ----------------------- |
| `npm run lint`                           | `npx eslint .`                        | ❌ No                   |
| `npm run ci:check`                       | calls `npm run lint` → `npx eslint .` | ❌ No                   |
| CI (`.github/workflows/lint-format.yml`) | `npx eslint . --max-warnings 0`       | ✅ Yes                  |
| `npm run ready-for-pr`                   | `npx eslint . --max-warnings 0`       | ✅ Yes                  |

**Fix**: Add `--max-warnings 0` to the root `lint` script in `package.json` so
that `ci:check` matches CI.

#### Category 3: KMP/Build Failures

Affected PRs: #908 (schema alignment), #916 (monitoring interfaces), #917 (windows)

These are genuine compilation errors in Kotlin Multiplatform code — not
lint/format issues. PR #908's Lint & Format check **passes**; only the KMP/Build
checks fail.

**Fix**: These require code-level fixes by the agents that authored them. The
`npm run ready-for-pr` command includes KMP compilation checks when Kotlin files
are changed, which would catch these locally.

## Main Branch Status

Main branch CI is **green** for all lint/format checks. The only failing check on
main is `Penetration Testing`, which is an infrastructure configuration issue
(not a code problem).

| Workflow            | Status on main           |
| ------------------- | ------------------------ |
| Lint & Format       | ✅ Pass                  |
| Changesets          | ✅ Pass                  |
| Security Scanning   | ✅ Pass                  |
| Penetration Testing | ❌ Fail (infrastructure) |

**Conclusion**: There are **no pre-existing lint/format failures on main**. All
PR failures are caused by agent-introduced issues.

## Root Causes (Prioritized)

### 1. `ci:check` ≠ CI (CRITICAL — fixed in this PR)

The `npm run lint` script in `package.json` runs `npx eslint .` without
`--max-warnings 0`. Since `ci:check` delegates to `lint`, warnings pass locally
but fail in CI.

**Fix**: Changed `package.json` `lint` script to include `--max-warnings 0`.

### 2. Agents Skip Formatting (HIGH)

Agents create or edit files (especially markdown) without running
`npm run format` before committing. The `lint-staged` pre-commit hook should
catch this for staged files, but agents may bypass it or not have it configured
in worktrees.

**Fix**: Agent workflow must include `npm run format` as a mandatory step before
any commit.

### 3. Agents Don't Use `ready-for-pr` (MEDIUM)

The `npm run ready-for-pr` script was designed to mirror CI exactly, but agent
instructions reference `ci:check` instead. `ready-for-pr` catches more issues
(Prettier, ESLint with `--max-warnings 0`, TypeScript, KMP compilation, and web
tests).

**Fix**: Update agent instructions to use `npm run ready-for-pr` as the primary
pre-push validation command.

### 4. Worktree `node_modules` May Be Missing (MEDIUM)

Agents working in worktrees may not have `node_modules` installed. The worktree
shares the git repo but not `node_modules`. Without dependencies, linting and
formatting tools won't work.

**Fix**: Agent workflow must include `npm install` (or `npm ci`) when entering a
worktree.

## The Perfect Pre-Push Workflow

This workflow guarantees CI will pass for lint/format checks when followed
exactly:

```bash
# ── In the worktree ──────────────────────────────────────────────────────────

# 1. Ensure dependencies are installed
npm install

# 2. Auto-fix all formatting issues (Prettier + ESLint)
npm run format
npx eslint . --fix --max-warnings 0

# 3. Stage all changes (including auto-fixed files)
git add -A

# 4. Commit (lint-staged will run as a safety net)
git commit -m "type(scope): description (#N)"

# 5. Validate with the EXACT CI-matching command
npm run ready-for-pr

# 6. If ready-for-pr fails:
#    - Fix the issues manually
#    - Repeat from step 2
#    - Amend the commit: git commit --amend --no-edit

# 7. Rebase on latest main
git fetch origin main && git rebase origin/main

# 8. Push
git push origin <branch-name>
```

### Minimum Viable Workflow (Lint/Format Only)

For docs-only or simple changes where you want the fastest feedback loop:

```bash
npm install
npm run format
npx eslint . --fix --max-warnings 0
git add -A && git commit -m "type(scope): description (#N)"

# Quick check — must pass before pushing
npx prettier --check . && npx eslint . --max-warnings 0

git push origin <branch-name>
```

## Agent Dispatch Prompt (Copy-Paste Ready)

Include this in every agent dispatch to guarantee CI compliance:

```
## ⚠️ MANDATORY Pre-Push Checklist (CI WILL FAIL without these)

Before EVERY `git push`, you MUST complete ALL of these steps IN ORDER:

1. **Install dependencies**: `npm install` (required in worktrees)
2. **Auto-fix formatting**: `npm run format` (fixes Prettier issues in ALL files including .md)
3. **Auto-fix lint**: `npx eslint . --fix --max-warnings 0` (fixes and catches ESLint issues)
4. **Stage fixes**: `git add -A`
5. **Commit** (or amend): `git commit --amend --no-edit` (if fixing after initial commit)
6. **Validate**: `npm run ready-for-pr` (mirrors EXACT CI checks — must pass)
7. **If step 6 fails**: fix issues, go back to step 2, repeat until green
8. **Rebase**: `git fetch origin main && git rebase origin/main`
9. **Push**: `git push origin <branch-name>`

### Common Pitfalls
- **Markdown files need Prettier too!** `npm run format` formats .md files
- **ESLint warnings are errors in CI!** Remove unused imports, especially `vi` in test files
- **`npm run ci:check` is NOT sufficient** — use `npm run ready-for-pr` instead
- **Worktrees don't share node_modules** — always run `npm install` first
```

## Recommended Instruction Changes

### 1. `.github/copilot-instructions.md`

Change references from `npm run ci:check` to `npm run ready-for-pr`:

```diff
- 5. **Run `npm run ci:check` locally — must be clean before pushing**
+ 5. **Run `npm run ready-for-pr` locally — must be clean before pushing**
```

### 2. `AGENTS.md`

Same change, plus add `npm install` to the worktree setup:

```diff
  3. **Create a worktree** if none exists
+ 3a. **Install dependencies**: `npm install` in the new worktree
  4. **Implement and commit** with issue references
- 5. **Run `npm run ci:check` locally — must be clean before pushing**
+ 5. **Run `npm run ready-for-pr` locally — must be clean before pushing**
```

### 3. `package.json` (fixed in this PR)

```diff
- "lint": "turbo run lint && npx eslint .",
+ "lint": "turbo run lint && npx eslint . --max-warnings 0",
```

## Action Plan

### Immediate (This PR)

- [x] Fix `npm run lint` to include `--max-warnings 0`
- [x] Create analysis document
- [ ] Merge this PR

### Short-Term (Next Sprint)

- [ ] Update `AGENTS.md` to reference `npm run ready-for-pr` instead of `ci:check`
- [ ] Update `.github/copilot-instructions.md` similarly
- [ ] Fix the 16 failing lint/format PRs (agents can be re-dispatched with
      instructions to run `npm run format && npx eslint . --fix --max-warnings 0`)
- [ ] Fix the 2 KMP build failures (code-level fixes)

### Long-Term

- [ ] Add a CI step that comments on PRs with auto-fix instructions when
      lint/format fails
- [ ] Investigate making `lint-staged` work reliably in worktrees
- [ ] Consider adding a git pre-push hook that runs `npm run ready-for-pr`
      (currently blocked by the `.husky/pre-push` hook design)
