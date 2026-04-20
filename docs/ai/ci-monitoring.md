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

Fix locally, follow the [canonical pre-push workflow](workflow.md#-mandatory-pre-push-workflow-never-skip), push, and re-poll.

---

## Remote CI Is the Source of Truth

Local checks (`npm run ci:check`, `npm run format:check`, etc.) are useful for catching issues early, but **remote CI is the authoritative result**. A PR is not merge-ready until `gh pr checks` shows all green — regardless of what passes locally.

### Known Issue: Local type-check on TS 5.9.3

TypeScript 5.9.3 rejects the `ignoreDeprecations` compiler option locally, causing `npm run type-check` (and therefore `npm run ci:check`) to fail even on clean code. Remote CI uses a compatible configuration and is not affected.

**Workaround:** The [canonical pre-push workflow](workflow.md#-mandatory-pre-push-workflow-never-skip) intentionally checks only formatting and lint locally. Let remote CI handle the type-check.

---

## Self-Healing Cycle

When `gh pr checks` shows a failure:

1. Read logs: `gh run view <run-id> --log-failed`
2. Fix locally in the worktree
3. Run the [canonical pre-push workflow](workflow.md#-mandatory-pre-push-workflow-never-skip)
4. Push and re-poll `gh pr checks`
5. Repeat until all checks are green

If self-healing fails after two attempts, document the failure in the PR under `## Needs Help: CI Failure` and stop.

---

_For the full pre-push workflow, see [workflow.md](workflow.md). For fleet-specific CI patterns, see [fleet-operations.md](fleet-operations.md)._
