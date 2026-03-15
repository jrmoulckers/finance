# Issue-First Development Workflow

Every code change in this repository MUST be linked to a GitHub issue and delivered through a feature branch + PR.

## Default Workflow (MANDATORY for all AI agents)

AI agents MUST follow this workflow for every code change:

```
1. Create/verify GitHub issue exists
2. Create feature branch from main: git checkout -b <type>/<description>-<issue#>
3. Implement changes on feature branch
4. Commit with issue reference: type(scope): description (#N)
5. Push feature branch: git push origin <branch-name>
6. Create PR with `gh pr create` linking issues (Closes #N)
7. Human reviews and merges PR
```

### Branch Naming Convention

```
<type>/<short-description>-<issue-number>
```

Examples:
- `feat/web-data-layer-443`
- `fix/auth-token-refresh-127`
- `docs/api-reference-86`
- `chore/cleanup-unused-files-446`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`

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
2. **Always work on a feature branch** — never commit directly to `main`. Create a branch with `git checkout -b <type>/<description>-<issue#>`.
3. **Reference the issue** in every commit message using the format: `type(scope): description (#N)` where N is the issue number.
4. **Never implement features, fixes, or refactors** without a corresponding issue — even for small changes.
5. **When planning work**, decompose into issues BEFORE starting implementation.
6. **Push the feature branch** to origin when work is ready: `git push origin <branch-name>`.
7. **Create a PR** with `gh pr create` including a detailed description and `Closes #N` for each resolved issue.
8. **Never merge PRs** — PRs are merged by humans after review.
9. **Never run `gh issue close`** — issues close automatically when their PR merges. Premature closure breaks the audit trail.
10. **If main has advanced**, rebase onto `origin/main` before pushing: `git fetch origin main && git rebase origin/main`.

## Commit Message Format

```
type(scope): description (#123)
```

Examples:

- `feat(core): implement budget calculator (#134)`
- `fix(models): add JvmInline imports for KMP targets (#130)`
- `docs: update README with getting started guide (#86)`

## PR Description Format

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Bullet list of changes

## Issues
Closes #N
Closes #M
Refs #P (for related but not fully resolved issues)

## Testing
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Tests pass (`npm test`)
- [ ] Manual testing done
```

## Why This Matters

- Enables traceability from code → PR → issue → roadmap
- Keeps the project board accurate and up-to-date
- Ensures no work is lost or duplicated
- Makes it easy to understand what changed and why
- PRs provide a review checkpoint before code reaches `main`
