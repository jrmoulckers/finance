---
name: bug-bash
description: Run the pwa-bug-basher flow for a single pasted PWA bug — investigate, file issue, fix, PR, CI, self-merge.
parameters:
  - name: bug
    description: The bug report to fix (a short description, optionally with a screenshot and repro steps).
    default: (none)
---

# Bug Bash — Fix One PWA Bug End-to-End

Run the full [`pwa-bug-basher`](../agents/pwa-bug-basher.agent.md) lifecycle for a **single** reported web bug. This wrapper works both as a standalone fire-and-forget session and when invoked inside an existing session.

**Input:** the `bug` parameter — a description of the broken behavior, optionally with a screenshot and repro steps.

## Execution Plan

Adopt the `pwa-bug-basher` agent and run its complete flow for the one bug in `{{bug}}`:

1. **Intake** — parse `{{bug}}`. Ask one clarifying question **only** if the repro is genuinely ambiguous; otherwise proceed.
2. **Investigate** — reproduce/trace in `apps/web` against `main` (`grep`/`view`; start your own dev server on a free port if needed — do NOT assume the shared `:5199` server exists). Pin the root cause with `file:line` verified against `main` HEAD.
3. **File the issue** — issue-first via `gh issue create` with Problem / Root Cause / Fix / Files / Cross-Platform sections and correct labels (`platform:web` + `bug`/`enhancement`, plus `accessibility` when relevant). Run the `issue-management` scoping decision tree; if the root cause is shared, scope `platform:shared` instead.
4. **Implement** — a surgical fix on this session's own worktree/branch, following `@web-engineer` conventions (hooks-only data flow, design tokens, ARIA/CSP). Add/update the affected Vitest test.
5. **Validate & push** — pre-push checklist: `npm run format` → `npx eslint . --fix` → `npm run format:check && npx eslint . --max-warnings 0`, run affected web tests, `git fetch origin main && git rebase origin/main`, then `$env:HUSKY = "0"; git push --no-verify origin <branch>`.
6. **PR** — `gh pr create --base main` with `Closes #N`; verify with `gh pr view <branch> --json number`.
7. **Drive to green & self-merge** — poll `gh pr checks` + `gh pr view --json mergeable,mergeStateStatus`; self-heal CI and conflicts; `gh pr merge <N> --squash` once green AND `MERGEABLE`.
8. **Clean up** — `git worktree remove <path>` after merge, then report the issue #, PR #, and final merged state.

## Guardrails

- ⚠️ **NEVER edit `apps/web/vite.config.ts`** — the bug-bash host keeps a local-only uncommitted `allowedHosts` edit there.
- Respect all `AGENTS.md` human-gated operations. For the canonical push / merge / merge-conflict rules, follow `.github/instructions/workflow.instructions.md` (do not duplicate them).
- One bug per run — file separate issues for anything else you discover; do not scope-creep.

## Report

End with a short structured summary:

```
## Bug Bash Result
- Bug: <one-line>
- Issue: #<N>
- PR: #<M> — <MERGED | green+MERGEABLE, blocked on: ...>
- Root cause: <file:line + one-line>
- Worktree: <removed | path retained because ...>
```
