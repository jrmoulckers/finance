# Finance bug loop (report → repair → verified)

## Start with the problem

In an active coding session, send a bug description or an existing issue link. No command, form,
label, or agent selection is required:

```text
Bug loop: On [platform/screen], [action] produces [actual result].
Expected: [expected result].
Requested fix: [optional].
Device/browser/OS: [optional].
```

The agent supplies investigation, issue, regression coverage, PR, and delivery evidence. Ask only
for information that blocks a safe fix. A requested fix is a hypothesis: keep the intended outcome
and explain any deviation. Never include real account data, balances, tokens, or credentials in a
report; use synthetic data.

This is the **single-report** entry point. For discovering multiple unknown defects use the
[`bug-bash` campaign](../../.github/prompts/README.md#bug-bash--bounded-bug-discovery-and-repair)
instead. The loop is not a background watcher: filing an issue does not start an agent.

## Lanes

| Fast lane — all must hold                                                 | Standard path — stop fast-lane shipping                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| One reproducible defect, clear expected behavior, small root-cause fix    | Ambiguous behavior, redesign, feature request, or unrelated defects                        |
| Presentation/copy/a11y/layout in existing code; no new deps or contracts  | Money math, rounding, currency, budgets, goals, recurrence (`@finance-domain` leads)       |
| No change to stored data, sync, auth, RLS, or other trust boundaries      | Schema/migrations, PowerSync rules, sync/conflict logic, auth, privacy, telemetry, secrets |
| Reversible without data repair; checkable locally on the affected surface | Dependencies, CI/deploy/infra, shared canon, or a platform the agent cannot run/verify     |

Only **web** changes can reach the 15-minute live target (see below). Native (iOS, Android,
Windows) fixes follow the standard path to a merged, CI-green PR and are reported as such; they
ship through the release workflows, which are human-gated. Never mislabel a fix as low risk to meet
a deadline.

## Execution contract

Use one owning session and one issue/PR per root cause; no discovery campaign, parallel agents, or
standing automation for a single report. Follow
[`AGENTS.md`](../../AGENTS.md) and
[`workflow.instructions.md`](../../.github/instructions/workflow.instructions.md) for issue reuse,
worktrees, pre-push checks, PR, and merge gates — they are not restated here.

| Elapsed | Action and exit evidence                                                                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–2 min | Record report time and deadline; infer platform(s) (undefined = every affected platform or one shared fix); search duplicates/active work and reuse the owning issue; reproduce on current `main`. |
| 2–7 min | Create/reuse the issue before editing. Add a regression that fails before the fix and passes after; make the smallest root-cause fix (prefer shared `packages/` fix for shared causes).            |
| 7–11    | Re-run the report scenario and the affected-surface checks, run the pre-push checklist, open the PR with `Closes #N` and evidence, watch CI and mergeability.                                      |
| 11–15   | Self-merge an owned PR once green and `MERGEABLE`; observe the Pages deployment for the merge SHA; re-run the reproduction live; report.                                                           |

These are budgets, not timeouts. At minute 10 without a CI-ready fix, say what remains; at 15 report
`target missed` with state and blocker. Never claim completion, skip checks, or merge a speculative
fix to beat the clock.

### Verification

- Reproduce first; if you cannot, report that instead of guessing a patch.
- Run the narrowest affected tests while iterating (`npm test`/Vitest for `apps/web`, Gradle
  targets for KMP/Android/Windows, `xcodebuild` where available), then the pre-push checklist once
  for the final candidate. Sync changes need integration tests.
- UI defects: exercise the real UI, including keyboard and screen-reader semantics (WCAG 2.2 AA).
  State plainly when a platform or device is unavailable and hand off verification.
- Existing PR CI is reused for the exact head SHA; do not add duplicate audits. Failing, flaky, or
  conflicting results are blockers, not passes.

### Verify delivery, not just merge (web)

[`Deploy — Web (Pages)`](../../.github/workflows/deploy-pages.yml) runs after a green **Web CI** on
`main`. Do not edit or dispatch it for routine repairs.

1. Read the merged PR's `mergeCommit.oid`; find the Pages run for that exact SHA
   (`gh run list --workflow deploy-pages.yml --commit <sha>`; the run's `head_sha` is the Web CI
   run's commit).
2. Require a successful deployment, then re-run the reproduction on the deployed site in a fresh
   browser context (avoids a cached service worker) with synthetic data.
3. Say **live verified** only with deployment evidence and a passing live reproduction. Otherwise
   say `merged`, `deployed; live behavior unverified`, or the exact blocked state.

Production (`deploy-production.yml`, tags) and store/native releases are human-gated (AGENTS.md
Category 6); report `merged` and the `## Needs Human Action` release step. Open/installed PWA
clients update only after the user accepts Refresh; never force-reload, clear site data, or
unregister a user's service worker.

## Evidence and recovery

Keep the issue/PR as the durable record: report time, deadline, reproduction, expected/actual,
risk lane, root cause, regression red→green, validation, merge SHA, deployment run, live check, and
elapsed time. No financial data in public issues or logs. Finish with a short status:

```text
Live verified | 12m elapsed | issue + PR links
Fixed: <user-visible result>.  Evidence: <deployment run + live repro result>.
```

If the live check fails, stop taking reports in that session and prefer a small forward fix, else a
scoped revert PR with its own checks. No direct pushes to `main`, no emergency bypass, no data
reset, no unapproved deploy. Start a fresh session from current `main` for the next report; never
commit on an already-merged branch or batch unverified repairs.
