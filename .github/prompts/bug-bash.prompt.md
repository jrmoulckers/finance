---
name: bug-bash
description: Run the bug-basher flow for a single pasted bug — infer the platform(s), investigate, file issue, fix (shared-once or widespread), PR, CI, self-merge.
parameters:
  - name: bug
    description: The bug report to fix (a short description, optionally with a screenshot and repro steps).
    default: (none)
  - name: platform
    description: Optional target platform (ios, android, web, windows, shared, or all). Default — infer from the report + screenshot, and treat an undefined platform as "fix everywhere affected".
    default: (infer / all)
---

# Bug Bash — Fix One Bug End-to-End (Any Platform)

Run the full [`bug-basher`](../agents/bug-basher.agent.md) lifecycle for a **single** reported bug across any of Finance's four platforms (iOS, Android, Web, Windows) or its shared `packages/`. This wrapper works both as a standalone fire-and-forget session and when invoked inside an existing session.

**Input:** the `bug` parameter — a description of the broken behavior, optionally with a screenshot and repro steps — plus an optional `platform` parameter. When `platform` is omitted, infer the affected platform(s) from the report and screenshot; treat an undefined platform as "fix every affected platform (or the shared code once)", never web-only.

## Execution Plan

Adopt the `bug-basher` agent and run its complete flow for the one bug in `{{bug}}` (target platform: `{{platform}}`):

1. **Intake** — parse `{{bug}}` and `{{platform}}`. Ask one clarifying question **only** if the repro is genuinely ambiguous; otherwise proceed.
2. **Infer platform(s)** — honor `{{platform}}` if given; otherwise infer from report + screenshot cues (iOS/SwiftUI, Android/Compose, Web/PWA, Windows/Compose-Desktop). If undefined or multi-platform, plan a shared or widespread fix.
3. **Investigate** — reproduce/trace against `main` (`grep`/`view`; for web, start your own dev server on a free port if needed — do NOT assume the shared `:5199` server exists). Search the inferred platform's code AND shared `packages/`. Pin the root cause with `file:line` verified against `main` HEAD.
4. **Decide scope** — root cause in shared code (`packages/`, `config/i18n`) → fix once (`platform:shared`); platform-specific + known platform → fix that platform natively; undefined/multi-platform → make the fix widespread across every affected platform (or file a cross-platform tracking issue with per-platform sub-issues). Never default to web-only. For large multi-native fixes you MAY dispatch platform sub-agents.
5. **File the issue** — issue-first via `gh issue create` with Problem / Root Cause / Fix / Files / Cross-Platform sections and correct labels (the right `platform:*` — `platform:shared`, a single platform, or multiple — plus `bug`/`enhancement`, plus `accessibility` when relevant). Run the `issue-management` scoping decision tree.
6. **Implement** — a surgical fix on this session's own worktree/branch, following the owning platform's conventions (web: hooks-only data flow, design tokens, ARIA/CSP; native: platform accessibility + conventions; shared: no platform leakage). Add/update the affected test.
7. **Validate & push** — pre-push checklist: `npm run format` → `npx eslint . --fix` → `npm run format:check && npx eslint . --max-warnings 0`, run affected tests, `git fetch origin main && git rebase origin/main`, then `$env:HUSKY = "0"; git push --no-verify origin <branch>`.
8. **PR** — `gh pr create --base main` with `Closes #N`; verify with `gh pr view <branch> --json number`.
9. **Drive to green & self-merge** — poll `gh pr checks` + `gh pr view --json mergeable,mergeStateStatus`; self-heal CI and conflicts; `gh pr merge <N> --squash` once green AND `MERGEABLE`.
10. **Clean up** — `git worktree remove <path>` after merge, then report the issue #, PR #, inferred platform(s), fix scope, and final merged state.

## Guardrails

- ⚠️ **NEVER edit `apps/web/vite.config.ts`** — the bug-bash host keeps a local-only uncommitted `allowedHosts` edit there.
- Respect all `AGENTS.md` human-gated operations. For the canonical push / merge / merge-conflict rules, follow `.github/instructions/workflow.instructions.md` (do not duplicate them).
- One bug per run — file separate issues for anything else you discover; do not scope-creep.

## Report

End with a short structured summary:

```
## Bug Bash Result
- Bug: <one-line>
- Platform(s): <inferred/explicit — ios | android | web | windows | shared | multiple>
- Fix scope: <shared-once | platform-native | widespread>
- Issue: #<N>
- PR: #<M> — <MERGED | green+MERGEABLE, blocked on: ...>
- Root cause: <file:line + one-line>
- Worktree: <removed | path retained because ...>
```
