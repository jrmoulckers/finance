---
applyTo: '**'
---

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
5. **⚠️ MANDATORY: Run the Pre-Push Lint & Format Checklist (NEVER skip)**
   a. `npm run format` — auto-fix Prettier
   b. `npx eslint . --fix` — auto-fix ESLint
   c. `npm run format:check && npx eslint . --max-warnings 0` — verify (NOT `npm run ci:check`; type-check may fail locally — see Known Local Issues)
   d. If step c fails: fix manually, repeat steps a-c
   e. `git add -A && git commit --amend --no-edit` (to include fixes)
6. Fetch and rebase onto origin/main (auto-approved, no human needed)
7. Push feature branch: `$env:HUSKY = "0" ; git push --no-verify origin <branch-name>` — **MANDATORY, auto-approved, do NOT ask for permission**
8. Create PR automatically with `gh pr create` including Closes #N — **MANDATORY, auto-approved, do NOT ask for permission**
9. **Verify the PR exists** — run `gh pr view <branch>` immediately after `gh pr create`. If it returns "no pull requests found", you have NOT created a PR — re-run step 8 until it succeeds.
10. **Monitor PR with `gh pr checks` AND `gh pr view --json mergeable,mergeStateStatus` — poll until BOTH:**
    - All checks are green (no failures, no pending)
    - `mergeable == MERGEABLE` and `mergeStateStatus in {CLEAN, UNSTABLE}` (no conflicts)
    - CI failures: read logs, re-run the Pre-Push Checklist (steps 5a-5e), push, restart cycle
    - Merge conflicts: trigger the **Merge Conflict Protocol** (see section below) — treated with the same P0 urgency as a red CI check
    - **Work is NOT complete until checks are green AND the PR is conflict-free**
11. **Merge your own PR** once the quality gate passes: `gh pr merge <number> --squash` (auto-approved — full autonomy on agent-authored PRs; use `--admin` to clear a branch-protection `BLOCKED` state only after local type-check + lint + affected tests are green, and document the override in the PR)
12. Mark work complete once the PR is merged (steps 9, 10, and 11 all pass)
13. After the PR is merged: remove the worktree automatically
```

> ⚠️ **MANDATORY**: Steps 7, 8, and 9 (push + create PR + verify PR exists) are auto-approved and required. Stopping at step 6 (local commit only) is a **workflow violation**. A task is incomplete if it ends without a pushed branch, an open PR, AND a `gh pr view` confirmation. Step 9's verification is what catches the silent-failure mode where an agent thinks it created a PR but `gh pr create` actually errored. Step 11 (self-merge) is also auto-approved once the quality gate (CI green AND `MERGEABLE`) passes — agents have full lifecycle autonomy on the PRs they author.

## Definition of Done (DoD)

A task is **DONE** only when ALL of the following are true. Agents MUST verify each before terminating their work loop:

| Gate | Verification command                                    | Pass criteria                                                                                                                                |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `git status`                                            | Clean working tree                                                                                                                           |
| 2    | `git log origin/<branch>..HEAD`                         | Empty (all commits pushed)                                                                                                                   |
| 3    | `gh pr view <branch> --json number`                     | Returns a PR number (proves PR exists)                                                                                                       |
| 4    | `gh pr checks <number>`                                 | All checks `pass` or `skipping`; none `fail`                                                                                                 |
| 5    | `gh pr view <number> --json mergeable,mergeStateStatus` | `mergeable=MERGEABLE` and not `DIRTY`/`BEHIND`                                                                                               |
| 6    | PR body contains `Closes #N` for each resolved issue    | Visual / `gh pr view --json body`                                                                                                            |
| 7    | `gh pr view <number> --json state`                      | `MERGED` (self-merged once gates 4 & 5 pass) — or a `## Needs Human Action: merge` note if a token/branch-protection limit blocks self-merge |

**Gates 4 AND 5 carry equal weight.** A green-CI PR sitting in a `CONFLICTING` state is not done. A conflict-free PR with a red CI check is not done. Both must clear before the agent merges. Agents have **full autonomy to merge their own PRs** (`gh pr merge <number> --squash`) once gates 4 and 5 pass — no human approval required.

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
7. **⚠️ MANDATORY PRE-PUSH: Run the Lint & Format Checklist (NEVER skip)** — see the full checklist below. Verify with `npm run format:check && npx eslint . --max-warnings 0` (NOT `npm run ci:check`; type-check may fail locally — see Known Local Issues). Pushing without clean format + lint is the #1 cause of avoidable CI failures.
8. **Fetch and rebase** onto `origin/main` before pushing: `git fetch origin main && git rebase origin/main` — both are auto-approved.
9. **Push the feature branch** to origin: `$env:HUSKY = "0" ; git push --no-verify origin <branch-name>` — **MANDATORY, auto-approved, do NOT ask for permission**.
10. **Create a PR automatically** with `gh pr create` including a detailed description and `Closes #N` for each resolved issue — **MANDATORY, auto-approved, do NOT ask for permission**.
11. **Monitor the PR with `gh pr checks`** — poll until ALL checks are green. Fix CI failures or merge conflicts, re-run the pre-push checklist, push, restart cycle. **Work is NOT complete until all remote checks are green AND the PR is `MERGEABLE`.**
12. **Merge your own PR** once the quality gate passes — `gh pr merge <N> --squash`. Agents have full autonomy to merge the PRs they author (use `--admin` to clear a branch-protection `BLOCKED` state only after local type-check + lint + affected tests are green, and document the override). Do NOT merge a PR you did not author without explicit human direction.
13. **Never run `gh issue close`** — issues close automatically when their PR merges.
14. **Clean up your worktree** after the PR is merged: `git worktree remove <path>`.

### ⚠️ MANDATORY: Pre-Push Lint & Format Checklist (NEVER skip)

> **🚨 This is the #1 cause of fleet CI failures. Run these commands before EVERY `git push`.**

```bash
# Step 1: Auto-fix formatting and lint issues
npm run format          # auto-fix all Prettier formatting
npx eslint . --fix      # auto-fix all ESLint issues

# Step 2: Verify format and lint pass (NOT ci:check — see Known Local Issues)
npm run format:check && npx eslint . --max-warnings 0

# Step 3: If step 2 fails, fix remaining issues manually, then repeat steps 1-2

# Step 4: Include the fixes in your commit
git add -A && git commit --amend --no-edit

# Step 5: Push (bypass Husky pre-push hook for agents)
$env:HUSKY = "0" ; git push --no-verify origin <branch-name>

# Step 6: Create PR
gh pr create --fill --body "Closes #N"

# Step 7: Monitor until green
gh pr checks <number> --watch
```

**Pushing without clean format + lint is the #1 cause of CI failures. Agents that skip this waste CI time and create noise.**

### ⚠️ MANDATORY: Merge Conflict Protocol (treat as P0, same as red CI)

> **🚨 Merge conflicts block merges just as effectively as red checks. Agents must self-heal conflicts with the same urgency as CI failures.**

A PR with `mergeable == CONFLICTING` or `mergeStateStatus == DIRTY` is **not merge-ready**, even if every CI check is green. The orchestrator and the owning agent MUST resolve conflicts before declaring the task done.

**Detection (poll every CI cycle, not just on first push):**

```bash
gh pr view <number> --json mergeable,mergeStateStatus,headRefName
```

| `mergeable`   | `mergeStateStatus`    | Action                                                                |
| ------------- | --------------------- | --------------------------------------------------------------------- |
| `MERGEABLE`   | `CLEAN` or `UNSTABLE` | ✅ OK — continue monitoring CI                                        |
| `MERGEABLE`   | `BEHIND`              | Rebase: `git fetch origin main && git rebase origin/main` and re-push |
| `CONFLICTING` | `DIRTY`               | Run **Auto-Resolve Cycle** below                                      |
| `UNKNOWN`     | `UNKNOWN`             | Wait 10s and re-poll; GitHub is still computing                       |

**Auto-Resolve Cycle (run in the agent's own worktree):**

```bash
# 1. Sync with main
git fetch origin main

# 2. Attempt rebase
git rebase origin/main

# 3a. If rebase succeeds cleanly:
#    Re-run the Pre-Push Lint & Format Checklist (above), then:
$env:HUSKY = "0" ; git push --force-with-lease --no-verify origin <branch>

# 3b. If rebase reports conflicts:
git status                          # list conflicted files
git diff --name-only --diff-filter=U  # machine-readable conflict list
```

**Conflict triage rules:**

1. **Auto-resolvable conflicts** (resolve without asking):
   - `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` — delete, re-run install, commit (`git checkout --theirs <lockfile> && npm install`)
   - Generated files (token outputs, OpenAPI clients, SQLDelight generated code) — re-run generator and accept fresh output
   - `CHANGELOG.md` top section — keep both entries in date order
   - Whitespace / import-order only — accept incoming + auto-format
2. **Semantic conflicts** (escalate, never guess):
   - Same function or method body edited on both sides
   - Schema migrations touching the same table
   - Conflicting refactors (renames vs. body edits)
   - Financial-logic or security-sensitive code
3. **After resolving each file**: `git add <file>` then `git rebase --continue`.
4. **If three auto-resolve attempts fail or any semantic conflict is hit**: stop, run `git rebase --abort`, and add `## Needs Human Action: merge conflict` to the PR body with the conflicted file list.

**Force-with-lease is auto-approved for resolving merge conflicts on the agent's own branch** (this is the one documented exception to the "force-push requires human approval" rule — the rebase that resolved the conflict is the implicit human-equivalent action). NEVER use plain `--force`.

**Conflict prevention is cheaper than conflict resolution.** See "Robust Git Practices" below.

### Robust Git Practices (conflict prevention)

To minimize merge-conflict churn during parallel fleet runs, agents MUST follow these practices:

1. **Rebase before every push, not just the first.** If your branch has been open for more than ~30 minutes or any other PR has merged to `main` since your last push, `git fetch origin main && git rebase origin/main` before pushing again. This surfaces conflicts immediately rather than at PR-review time.
2. **Narrow file scope per branch.** One logical change set per branch. If you find yourself editing files across more than one agent's ownership zone (see Fleet Coordination Rules), split into separate worktrees and separate PRs.
3. **Respect file ownership.** Re-read the ownership table in `AGENTS.md` before editing shared config (`gradle/libs.versions.toml`, `package.json`, `turbo.json`, `settings.gradle.kts`). Only the designated owner edits these per fleet run.
4. **Touch generated files only via their generator.** Never hand-edit Style Dictionary output, SQLDelight generated Kotlin, OpenAPI clients, or `*.lock` files. Re-run the generator and commit the diff.
5. **Keep PRs small.** A PR over ~500 lines of diff or ~20 files is a conflict magnet. Decompose at planning time, not after the conflict.
6. **Sequence schema work.** Backend migration + KMP SQLDelight changes ride a single PR (one task, one branch, two coordinated authors) — never two parallel PRs.
7. **Commit `package-lock.json` last.** If a PR also bumps versions in `package.json`, commit the lockfile update as the very last commit before push so a rebase only ever has to rerun `npm install` once.
8. **Use `git rerere` locally.** `git config rerere.enabled true` lets git auto-replay your past conflict resolutions if the same conflict reappears after a force-push.

### Known Local Issues

- **`npm run ci:check` type-check may fail locally** — TypeScript 5.9.3 has compatibility issues with the current tsconfig. Format + lint (`npm run format:check && npx eslint . --max-warnings 0`) is sufficient for local pre-push validation. Remote CI is the source of truth for type-check.
- **`.prettierignore` coverage** — Prettier is configured to skip `*.kt`, `*.kts`, `*.swift`, `Caddyfile`, and `*.env*` files. Do not run Prettier on these file types.
- **`npm run ci:check:quick`** — Use this for docs-only or non-code changes; it skips type-check.
- **Husky pre-push hook** — Blocks non-interactive (agent) pushes by default. Agents must bypass with `$env:HUSKY = "0" ; git push --no-verify origin <branch>`.

## Commit Message Format

```
type(scope): description (#N)
```

Where N is the issue number. Always include the issue reference.

Examples:

- `feat(core): implement budget calculator (#134)`
- `fix(models): add JvmInline imports for KMP targets (#130)`
- `docs: update README with getting started guide (#86)`

Always include the Co-authored-by trailer:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

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
- PRs provide a CI quality gate and an auditable checkpoint before code reaches `main`

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

#### Prepared Canonical Dispatch (Not Active)

Continue using the current mappings above until Studio canonical materialization replaces the runtime definitions. After activation:

- `platform:android`, `platform:ios`, `platform:windows`, `platform:shared`, `comp:sync`, and client SQLDelight work → `@native-app-engineer`
- Supabase migrations, RLS, database tests, seed data, and PowerSync sync rules → `@database-engineer`
- SLOs, monitoring semantics, incidents, rollback/recovery verification, and capacity → `@sre-engineer`
- API/Auth/Edge Function behavior → `@backend-engineer`
- A single reported bug → run `.github/prompts/bug-bash.prompt.md`; do not require a permanent bug-basher role
- Money-affecting work → include `@finance-domain` for correctness review while the structural owner implements

Do not dispatch the future-only slugs before their generated definitions are materialized.

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

### 4a. Batch Related Small Issues into Combined PRs

To reduce conflict surface area and review churn, the orchestrator MUST batch small issues that touch the same files into a single combined PR. Batching reduces parallel-PR conflicts, cuts CI runs, and gives the human fewer PRs to review.

**Mandatory batching candidates:**

| Pattern                              | Combine into one PR                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Dependency CVE bumps                 | All bumps of a given ecosystem (e.g. `chore(deps): KMP security bumps`) — one PR for #1290/#1291/#1292 |
| Lint/style cleanups                  | All ESLint or Prettier cleanups of the same surface — one PR per app                                   |
| Detekt cleanups                      | All detekt fixes per platform — one PR for #1296/#1297/#1299                                           |
| CI workflow tweaks                   | Related `.github/workflows/` edits — one PR per workflow                                               |
| Doc-only edits in the same directory | One PR per `docs/` subdir per sprint                                                                   |
| Token/design refreshes               | One PR per token generation                                                                            |

**Do NOT batch:**

- Feature work across different packages (one PR each — keeps reviews focused).
- Anything touching schema (`packages/models/`, Supabase migrations) — always its own PR.
- Anything that mixes security fixes with feature changes (separate so security can land fast).
- PRs whose combined diff exceeds ~500 lines or ~20 files.

Each batched PR's body MUST list every issue it closes:

```
Closes #1290
Closes #1291
Closes #1292
```

### 4b. Emit a Recommended Merge Order

After the sprint plan is built, the orchestrator MUST publish a recommended merge order so that whoever merges the PRs (the orchestrator itself, by default, or a human) avoids creating conflicts that then have to be resolved.

**Merge-order heuristics (top of list = merge first):**

1. **Schema + migrations** (Supabase migration + matching SQLDelight) — blocks every downstream PR.
2. **Shared package APIs** (`packages/core`, `packages/models`, `packages/sync`) — platforms depend on these.
3. **Design tokens** (`packages/design-tokens/` regenerations) — platform UI imports these.
4. **Build / CI config** (`gradle/libs.versions.toml`, `package.json`, workflow files) — affects everything; merge before app PRs to avoid lockfile churn.
5. **Backend services** (`services/api/`) — clients call these.
6. **Platform app PRs** (`apps/web`, `apps/android`, `apps/ios`, `apps/windows`) — leaf nodes, no downstream dependents; safe to merge in any order amongst themselves.
7. **Docs / PM / marketing** — can merge at any time, but bunching them last keeps the diff history tidy.

Publish the order in the sprint plan and as a top-comment on each PR (e.g., `Merge order: 3 of 9 — depends on #1885 (schema) and #1887 (tokens)`).

### 5. Dispatch Fleet

Launch all independent agents in parallel:

```
task(agent_type="android-engineer", mode="background", ...)
task(agent_type="ios-engineer", mode="background", ...)
task(agent_type="web-engineer", mode="background", ...)
```

### 6. Monitor & Resolve

- Track completions via agent notifications
- For every agent that signals "done", run the **Definition of Done** gate-check (above). If any of gates 1-7 fails, re-dispatch the agent into its worktree to finish.
- Push any unpushed work from agents that held off
- Resolve merge conflicts between parallel PRs using the **Merge Conflict Protocol** — conflicts carry the same P0 weight as red CI checks
- **Merge each PR** (in the recommended merge order) once it clears the quality gate (CI green AND `MERGEABLE`) — the orchestrator has full autonomy to land agent-authored PRs with `gh pr merge <N> --squash`. The sprint is shippable only when every PR is merged (or left green and `MERGEABLE` with a documented `## Needs Human Action` blocker).

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
