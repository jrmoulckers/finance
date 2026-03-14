# Issue-First Development Workflow

Every code change in this repository MUST be linked to a GitHub issue.

## Issue Lifecycle

Issues follow a strict lifecycle tied to PRs:

```
Created (Open) → PR opened with "Closes #N" → PR merged → Issue auto-closed by GitHub
```

**Rules:**

- **NEVER close issues manually** with `gh issue close` — let GitHub close them when the PR merges
- An issue is **in progress** when a PR referencing it is open
- An issue is **done** only when the PR that closes it has been merged into `main`
- Use `Closes #N` (not `Refs #N`) in PR descriptions to enable auto-close on merge
- Put each `Closes #N` on its own line in the PR body for reliable parsing

## Rules for AI Agents

1. **Before writing any code**, verify that a GitHub issue exists for the work. If no issue exists, create one first using `gh issue create`.
2. **Reference the issue** in every commit message using the format: `type(scope): description (#N)` where N is the issue number.
3. **Never implement features, fixes, or refactors** without a corresponding issue — even for small changes.
4. **When planning work**, decompose into issues BEFORE starting implementation. Use the project board to track status.
5. **PR descriptions** must include `Closes #N` for every issue the PR completes. Use `Refs #N` only for issues that are related but not fully resolved by the PR.
6. **Never run `gh issue close`** — issues close automatically when their PR merges. Premature closure breaks the audit trail.

## Commit Message Format

```
type(scope): description (#123)
```

Examples:

- `feat(core): implement budget calculator (#134)`
- `fix(models): add JvmInline imports for KMP targets (#130)`
- `docs: update README with getting started guide (#86)`

## Why This Matters

- Enables traceability from code → PR → issue → roadmap
- Keeps the project board accurate and up-to-date
- Ensures no work is lost or duplicated
- Makes it easy to understand what changed and why
