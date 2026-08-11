# CI Monitoring — Finance Monorepo

How agents should monitor CI after pushing a branch.

> **Related docs:** [Workflow](workflow.md) · [Fleet Operations](fleet-operations.md) · [Troubleshooting](troubleshooting.md)

---

## The Correct Command

Use `gh pr checks` to monitor CI status on a PR:

```bash
gh pr checks <number>
```

Poll this command until all checks show ✅. **Work is NOT complete until all remote checks are green.**

### Reading failure logs

When a check fails:

```bash
# Find the failing run ID from gh pr checks output, then:
gh run view <run-id> --log-failed
```

Fix locally, follow the [canonical pre-push workflow](workflow.md#️-mandatory-pre-push-workflow-never-skip), push, and re-poll.

---

## Remote CI Is the Source of Truth

Local checks (`npm run ci:check`, `npm run format:check`, etc.) are useful for catching issues early, but **remote CI is the authoritative result**. A PR is not merge-ready until `gh pr checks` shows all green — regardless of what passes locally.

### Retracted: "Local type-check fails on TS 5.9.3"

This repo previously documented a known issue stating that TypeScript 5.9.3 rejects the `ignoreDeprecations` compiler option locally, so `npm run type-check` (and therefore `npm run ci:check`) failed even on clean code, and that agents should skip type-check locally. **That claim is false and is withdrawn.**

Measured on 2026-08-11:

- The installed compiler is **TypeScript 6.0.3**, not 5.9.3 (`node -e "require('typescript/package.json').version"`).
- `apps/web/tsconfig.json` carries `"ignoreDeprecations": "6.0"`, which 6.0.3 accepts.
- `npm run type-check` exits **0** across the repo, and `tsc -p apps/web/tsconfig.json --noEmit` exits **0** with no output.

A clean type-check is also the exact shape of an _aborted_ one — same exit code, same empty output — so the run was proved rather than assumed: planting `const planted: number = "definitely not a number";` in `apps/web/src` produced `TS2322` and exit **2**, then the probe was removed. The gate runs, and it is genuinely clean.

**Run type-check locally.** `npm run ci:check` is the full gate and is expected to pass. Remote CI remains authoritative for the reasons in the section above — it runs the platform jobs a local machine does not — but not because local type-check is broken.

> **Why this mattered enough to write down.** A wrong "known issue" is self-reinforcing: every agent that reads it skips the gate, and skipping the gate is what stops anyone discovering the claim is false. This one survived long enough to be copied into nine other documents, and the correction had reached only one of them. When retracting an exemption, grep for it — the claim spreads further than the fix does.

---

## Self-Healing Cycle

When `gh pr checks` shows a failure:

1. Read logs: `gh run view <run-id> --log-failed`
2. Fix locally in the worktree
3. Run the [canonical pre-push workflow](workflow.md#️-mandatory-pre-push-workflow-never-skip)
4. Push and re-poll `gh pr checks`
5. Repeat until all checks are green

If self-healing fails after two attempts, document the failure in the PR under `## Needs Help: CI Failure` and stop.

---

_For the full pre-push workflow, see [workflow.md](workflow.md). For fleet-specific CI patterns, see [fleet-operations.md](fleet-operations.md)._
