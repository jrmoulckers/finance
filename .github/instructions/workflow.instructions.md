# Issue-First Development Workflow

Every code change in this repository MUST be linked to a GitHub issue and delivered through a feature branch + PR.

## Default Workflow (MANDATORY for all AI agents)

AI agents MUST follow this workflow for every code change:

```
1. Create/verify GitHub issue exists
2. Scan for an existing worktree for this issue (git worktree list)
   a. If found: resume work in that worktree
   b. If not found: create a new worktree with the correct naming convention
3. Implement changes on feature branch inside the worktree
4. Commit with issue reference: type(scope): description (#N)
5. Fetch and rebase onto origin/main (auto-approved, no human needed)
6. Push feature branch: git push origin <branch-name>
7. Create PR automatically with `gh pr create` including Closes #N
8. Monitor PR: poll checks, fix CI failures, resolve merge conflicts — repeat until merge-ready
9. Mark work complete once all checks pass and no conflicts remain
10. After human merges the PR: remove the worktree automatically
```

## Worktree Setup (Required for Agents)

Agents MUST use git worktrees — not separate repository clones. See `docs/ai/worktrees.md` for full details.

### Worktree Naming Convention

```
wt-[agent-type]-[type/description-issue#]
```

**Examples:**

```bash
../wt-android-feat-transactions-443
../wt-web-fix-auth-127
../wt-kmp-feat-schema-align-88
../wt-backend-fix-rls-policies-22
```

### Creating a Worktree

```bash
# From the main repo
git worktree add ../wt-android-feat-transactions-443 -b feat/transactions-443

# Resume an existing worktree
git worktree list   # scan first
cd ../wt-android-feat-transactions-443
```

### Cleaning Up After Merge

```bash
git worktree remove ../wt-android-feat-transactions-443
```

The main worktree (`finance-human/`) is reserved for human work.

## Branch Naming Convention

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
2. **Always use a git worktree** — never commit directly in the main worktree or on `main`.
3. **Scan for existing worktrees first** — if a worktree for this issue already exists, resume it rather than creating a new one.
4. **Reference the issue** in every commit message using the format: `type(scope): description (#N)` where N is the issue number.
5. **Never implement features, fixes, or refactors** without a corresponding issue — even for small changes.
6. **When planning work**, decompose into issues BEFORE starting implementation.
7. **Fetch and rebase** onto `origin/main` before pushing: `git fetch origin main && git rebase origin/main` — both are auto-approved.
8. **Push the feature branch** to origin when work is ready: `git push origin <branch-name>` — auto-approved.
9. **Create a PR automatically** with `gh pr create` including a detailed description and `Closes #N` for each resolved issue.
10. **Monitor the PR** — poll `gh pr checks` until all checks pass. Fix any CI failures or merge conflicts and push again. Repeat until merge-ready.
11. **Never merge PRs** — PRs are merged by humans after review.
12. **Never run `gh issue close`** — issues close automatically when their PR merges. Premature closure breaks the audit trail.
13. **Clean up your worktree** after the PR is confirmed merged: `git worktree remove <path>`.

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
- Ensures no work is lost or duplicated — worktrees are resumable by any agent
- Makes it easy to understand what changed and why
- PRs provide a review checkpoint before code reaches `main`
