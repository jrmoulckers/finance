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
5. **Run `npm run ci:check` locally — MUST be clean before pushing**
   - `npm run format:check` catches Prettier issues
   - `npm run lint` catches ESLint issues
   - `npm run type-check` catches TypeScript errors
   - If any fail: run `npm run format` and/or `npx eslint . --fix`, re-run `ci:check`, commit fixes
6. Fetch and rebase onto origin/main (auto-approved, no human needed)
7. Push feature branch: git push origin <branch-name>
8. Create PR automatically with `gh pr create` including Closes #N
9. **Monitor PR with `gh pr checks` — poll until ALL checks are green**
   - CI failures: read logs, fix locally, run `ci:check` again, push, restart cycle
   - Merge conflicts: fetch + rebase + force-with-lease push, restart cycle
   - **Work is NOT complete until all remote checks are green**
10. Mark work complete once all checks pass and no conflicts remain
11. After human merges the PR: remove the worktree automatically
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

The main worktree (`finance/`) is reserved for human work.

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
7. **Run `npm run ci:check` locally before every push** — must be fully clean (format + lint + type-check). Auto-fix with `npm run format` and `npx eslint . --fix`, commit fixes, then re-run to confirm. Pushing without a clean `ci:check` is the primary cause of avoidable CI failures.
8. **Fetch and rebase** onto `origin/main` before pushing: `git fetch origin main && git rebase origin/main` — both are auto-approved.
9. **Push the feature branch** to origin: `git push origin <branch-name>` — auto-approved.
10. **Create a PR automatically** with `gh pr create` including a detailed description and `Closes #N` for each resolved issue.
11. **Monitor the PR with `gh pr checks`** — poll until ALL checks are green. Fix CI failures or merge conflicts, run `ci:check` locally again, push, restart cycle. **Work is NOT complete until all remote checks are green.**
12. **Never merge PRs** — PRs are merged by humans after review.
13. **Never run `gh issue close`** — issues close automatically when their PR merges.
14. **Clean up your worktree** after the PR is confirmed merged: `git worktree remove <path>`.

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

## Fleet Sprint Execution

When asked to execute sprints across multiple agent types, follow this protocol:

### 1. Query the Backlog

```bash
gh issue list --state open --limit 100 --json number,title,labels,milestone
```

### 2. Categorize by Agent Type

Map issues to agents based on labels and file paths:

- `platform:android` → @android-engineer
- `platform:ios` → @ios-engineer
- `platform:web` → @web-engineer
- `platform:windows` → @windows-engineer
- `platform:shared` / `comp:sync` → @kmp-engineer
- `ci` / `infrastructure` → @devops-engineer
- `security` → @security-reviewer
- `accessibility` → @accessibility-reviewer
- `documentation` → @docs-writer
- `design-system` → @design-engineer

### 3. Include Business Tasks

Every sprint MUST include at least one business/management task:

- @product-manager: Issue triage, roadmap updates, milestone tracking
- @marketing-strategist: Content creation, ASO, launch comms
- @business-analyst: Pricing analysis, competitive research, metrics

### 4. Create Sprint Plan

Use SQL todos for tracking:

```sql
INSERT INTO todos (id, title, description, status) VALUES
  ('sN-agent-issue', 'Title (#NNN)', 'Description', 'pending');
```

### 5. Dispatch Fleet

Launch all independent agents in parallel:

```
task(agent_type="android-engineer", mode="background", ...)
task(agent_type="ios-engineer", mode="background", ...)
task(agent_type="web-engineer", mode="background", ...)
```

### 6. Monitor & Resolve

- Track completions via agent notifications
- Push any unpushed work from agents that held off
- Resolve merge conflicts between parallel PRs
- Verify all CI checks pass

## Business Sprint Integration

Every sprint cycle must integrate business and management work alongside engineering tasks. This ensures the project advances holistically — not just in code output.

### Why Business Tasks Matter

Engineering-only sprints create blind spots: documentation drifts, roadmaps go stale, competitive positioning is ignored, and launch readiness suffers. Including business tasks in every sprint keeps the project on track across all dimensions.

### Required Business Coverage

Each sprint should touch at least one area from each category:

**Product & Planning:**

- Issue triage and backlog grooming (close stale issues, reprioritize)
- Milestone progress reviews and roadmap updates
- Feature specification and acceptance criteria refinement

**Go-to-Market:**

- App store optimization (screenshots, descriptions, keywords)
- Release notes and changelog drafting
- User-facing documentation updates

**Analytics & Strategy:**

- Competitive feature comparison updates
- Pricing model analysis and validation
- Key metrics definition and tracking setup

### Scheduling Business Tasks

Business tasks follow the same issue-first workflow as engineering:

1. Create a GitHub issue with the appropriate label (`business`, `product`, `marketing`)
2. Assign to the relevant agent or human
3. Track in the sprint plan SQL alongside engineering todos
4. Deliver output as a PR (docs, config changes) or issue comment (analysis, recommendations)
