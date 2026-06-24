# Branch Protection — `main`

> **Canonical reference:** the authoritative, always-current branch-protection
> specification lives in
> [`.github/branch-protection.md`](../../.github/branch-protection.md). It
> documents the required-vs-informational status checks, the always-on
> **Required Checks Gatekeeper** (#2860), the CODEOWNERS / separation-of-duties
> approvals target (#2880), and the human setup checklist. This page is a short
> architecture-level pointer so the rules are not duplicated — and cannot drift —
> across two files.

## Summary

- Every change reaches `main` through a pull request — no direct pushes, no
  force pushes, and no branch deletion.
- A PR may merge only when the **required CI status checks pass** and the PR is
  `MERGEABLE`. The always-on _Required Checks Gatekeeper_ enforces lint, format,
  and the blocking security scans on every PR.
- Administrators are **not** exempt ("Include administrators").
- AI agents self-merge **their own** PRs once the quality gate is green. Review
  and approval requirements (CODEOWNERS, separation of duties) are a
  human-configured hardening target — see the canonical doc for current status.

For the exact required-check list, the path-filter caveat, and the **Needs Human
Action** setup steps, see
[`.github/branch-protection.md`](../../.github/branch-protection.md).
