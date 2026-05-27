# GitHub Copilot Instructions — Finance Monorepo

You are working in the Finance monorepo — a multi-platform, native-first financial tracking application.

## Human Approval Required (CRITICAL)

The following operations require EXPLICIT human approval. NEVER perform these autonomously:

- **Git remote operations** — **MUST push own feature branches** (`git push origin <feature-branch>`) — this is mandatory and auto-approved, never ask for permission; **MUST** `git fetch origin main` and `git rebase origin/main` on own feature branch as pre-push hygiene; no pushing to `main`/`master`/release branches; no `git push --force`; `git push --force-with-lease` on feature branches requires human approval; no `pull`/`remote`/`merge` from remote
- **PR/review operations** — **MUST create PRs** with linked issues and detailed descriptions — this is mandatory and auto-approved, never ask for permission; no merging, closing, or approving PRs or reviews
- **Remote platform mutations** — No issue close/reopen/delete; no repo settings/releases/deployments. Label edits ARE allowed for routine triage, EXCEPT gating/lifecycle labels (`blocked`, `breaking-change`, `security`, `stale`, and any `wontfix`/`duplicate`/`invalid`/`do-not-merge` style label) which remain human-only. See `AGENTS.md` §"Category 3" for the full rule.
- **Outside project boundary** — No file access outside the repository root; no system config changes; no global package installs
- **Destructive file operations** — See detailed rules below
- **Package publishing** — See detailed rules below
- **Secret/credential access** — See detailed rules below
- **Database destructive ops** — See detailed rules below

If you need to perform any of these, STOP, explain what you need and why, and wait for human approval.

### Destructive File Operations — Detailed Rules

You MUST NOT delete directories or perform bulk file removal. Specific prohibitions:

- NEVER run `rm -rf`, `del /S`, `Remove-Item -Recurse -Force`, or any recursive delete
- NEVER delete more than one file in a single command without listing each file explicitly
- NEVER overwrite a file without reading it first to understand what you're replacing
- NEVER use wildcard deletion (`rm *.js`, `del *.log`) — always name each file

**Instead, do this:**

- To remove a single file: use the standard file tools, not shell commands
- To remove multiple files: list each file by name and explain why each should be deleted
- To clean build artifacts: tell the human to run `npm run clean` or equivalent
- If a directory needs removal: state the directory path and contents, then ask the human to delete it

### Package Publishing — Detailed Rules

You MUST NOT distribute code to any external registry or platform. Specific prohibitions:

- NEVER run `npm publish`, `yarn publish`, `pnpm publish`, or any publish command
- NEVER run `docker push`, `docker buildx push`, or push container images
- NEVER submit to app stores, package registries, or CDNs
- NEVER run deployment scripts (`deploy.sh`, `cdk deploy`, `terraform apply`, etc.)
- NEVER create GitHub Releases with attached binaries

**Instead, do this:**

- Prepare the package/release and document the steps for the human to execute
- Create a checklist of pre-publish verification steps
- Write release notes and changelogs, then ask the human to publish

### Secret & Credential Operations — Detailed Rules

You MUST NOT access, create, or modify real credentials. Specific prohibitions:

- NEVER create or edit `.env` files containing actual API keys, passwords, tokens, or connection strings
- NEVER read files in a `secrets/`, `.secrets/`, or `credentials/` directory
- NEVER access the system keychain, Windows Credential Manager, macOS Keychain, or Linux secret-service
- NEVER generate real API keys or tokens (e.g., via `openssl rand`, `ssh-keygen`, `gpg --gen-key`)
- NEVER hardcode any value that looks like a secret (long random strings, base64 blobs, connection URIs with passwords)
- NEVER echo, log, or display the contents of environment variables that may contain secrets

**Instead, do this:**

- Create `.env.example` or `.env.template` files with placeholder values like `YOUR_API_KEY_HERE`
- Reference environment variable names (`process.env.DATABASE_URL`) without the actual values
- Document what secrets are needed and where the human should configure them
- Use placeholder values in tests (e.g., `test-api-key-not-real`)

### Database Destructive Operations — Detailed Rules

You MUST NOT execute operations that delete, truncate, or irreversibly modify database data. Specific prohibitions:

- NEVER run `DROP TABLE`, `DROP DATABASE`, `DROP INDEX`, or any `DROP` statement
- NEVER run `TRUNCATE TABLE` or `TRUNCATE`
- NEVER run `DELETE FROM` without a `WHERE` clause (full table deletion)
- NEVER run `ALTER TABLE ... DROP COLUMN` (irreversible schema change)
- NEVER execute database migration scripts against anything other than a local dev database
- NEVER run `pg_restore`, `mongorestore`, or database restore commands
- NEVER modify database connection strings to point at production/staging systems

**Instead, do this:**

- Write migration scripts and ask the human to review and execute them
- Use `SELECT` queries to inspect data before proposing changes
- Create migration files with both `up` and `down` operations
- For test data: use `INSERT` into local development databases only
- Propose the SQL and explain its impact, then let the human run it

## Architecture Context

- **Monorepo** with apps/, packages/, services/, docs/, tools/
- **Edge-first**: Business logic runs on client devices; backend is for sync only
- **Platforms**: iOS (SwiftUI; Swift Export bridge planned), Android (Kotlin), Web (TypeScript + React PWA), **Windows 11 (Compose Desktop — first-class beta target, mirrors Android DI/ViewModel architecture)**
- **Shared code** lives in packages/ (core logic, data models, sync engine)
- **Current KMP package reality**: `packages/core` checks in `commonMain`, `commonTest`, `iosMain`, `jsMain`, and `jvmMain` source sets; `packages/models` and `packages/sync` also check in `androidMain`, and `packages/sync` also has `jsTest`
- **Single backend API** in services/api/ for data synchronization
- **KMP Web integration**: Dual-path — TypeScript repositories remain for beta while KMP JS bindings are validated in parallel via `apps/web/src/kmp/`

## Schema Alignment Decisions

The following schema additions have been approved to align KMP models with Supabase (apply via versioned migrations):

- **transactions**: Add `transfer_transaction_id UUID` (nullable FK to self, links transfer pairs) and `recurring_rule_id UUID` (nullable FK to recurring rules)
- **budgets**: Add `is_rollover BOOLEAN NOT NULL DEFAULT false` (enables unused budget carry-forward)
- **goals**: Add `account_id UUID` (nullable FK to accounts, links goal to a funding account) and `status TEXT NOT NULL DEFAULT 'active'` (enum: active, completed, archived)
- **All sync-enabled tables**: Standardize on `owner_id UUID` referencing `auth.uid()` for direct ownership queries; `household_id` remains for household-level RLS isolation

## Additional Architecture

- **Feature flags**: Managed via PostgreSQL + PowerSync sync rules; flags sync to clients for runtime evaluation
- **Environment configs**: Three build variants — `debug`, `staging`, `release` — with per-environment configuration
- **i18n framework**: Internationalization support in `packages/core` for multi-language financial terminology
- **All models include `ownerId`**: Every sync-enabled model has an `ownerId` field referencing the authenticated user

## Development Workflow (MANDATORY)

All code changes MUST follow this workflow:

1. **Create or verify a GitHub issue** exists for the work (`gh issue create` if needed)
2. **Scan for an existing worktree** for this issue: `git worktree list` — resume if found
3. **Create a worktree** if none exists: `git worktree add ../wt-[agent-type]-[branch] -b [branch]`
4. **Implement and commit** with issue references: `type(scope): description (#N)`
5. **⚠️ MANDATORY PRE-PUSH: Lint & Format (NEVER skip — see checklist below). Verify with `npm run format:check && npx eslint . --max-warnings 0` (NOT `npm run ci:check` — type-check may fail locally; see Known Local Issues).**
6. **Fetch and rebase**: `git fetch origin main && git rebase origin/main` (auto-approved)
7. **Push the feature branch**: `$env:HUSKY = "0" ; git push --no-verify origin <branch-name>` — **MANDATORY, auto-approved, do NOT ask for permission**
8. **Create a PR automatically** with `gh pr create` — include `Closes #N` and a detailed description — **MANDATORY, auto-approved, do NOT ask for permission**
9. **Verify the PR exists**: `gh pr view <branch> --json number` — if it doesn't return a PR number, `gh pr create` silently failed; re-run step 8. **Not running this verification step is how "ghost PR" workflow gaps happen.**
10. **Monitor `gh pr checks` AND PR merge state** — poll `gh pr view <N> --json mergeable,mergeStateStatus` until BOTH all checks are green AND the PR shows `MERGEABLE` (not `DIRTY`/`BEHIND`/`CONFLICTING`). **Merge conflicts carry the same P0 weight as red CI checks.** Fix CI via the Pre-Push Checklist; fix conflicts via the Merge Conflict Protocol (rebase → auto-resolve lockfiles/generated files → force-with-lease push; escalate semantic conflicts with `## Needs Human Action`). **Work is NOT complete until checks are green AND the PR is conflict-free.**
11. **Never commit directly to `main`** — all changes go through feature branches and PRs
12. **Never merge PRs** — humans review and merge; agents get the PR to merge-ready state
13. **Clean up the worktree** after merge is confirmed: `git worktree remove <path>`

> ⚠️ **MANDATORY**: Steps 7, 8, and 9 (push + create PR + verify PR exists) are auto-approved and required. Stopping at step 6 (local commit only) is a **workflow violation**. So is finishing step 8 without the step-9 verification — that's how branches end up pushed with no PR open. A task is incomplete if it ends without a confirmed-existing PR that is both CI-green and conflict-free.

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

> **Note:** `lint-staged` is configured in `.husky/pre-commit` and auto-formats staged files on commit (`eslint --fix` + `prettier --write` for TS/JS; `prettier --write` for JSON/YAML/MD/CSS). However, agents may bypass hooks or work in worktrees where hooks aren't active. **The explicit checklist above is mandatory regardless of hook status.**

Worktree naming: `wt-[agent-type]-[type/description-issue#]` — e.g., `wt-android-feat-transactions-443`

See `docs/ai/worktrees.md` for the full worktree lifecycle guide.

Tooling notes:

- `npm run format:check && npx eslint . --max-warnings 0` — verify format + lint before every push (preferred over `npm run ci:check` — see Known Local Issues)
- `npm run ci:check` — format:check + lint + type-check; use for full validation when TS is stable locally
- `npm run ci:check:quick` — lightweight check for docs-only or non-code changes
- `npm run format` — auto-fix all Prettier issues; `npx eslint . --fix` — auto-fix ESLint issues
- `npm run cleanup:worktrees` — clean up merged/stale worktrees
- `tools/generate-changelog.js` — generate changelog from git history
- `lint-staged` runs from `.husky/pre-commit` and auto-formats staged files before commit.
- `.husky/pre-push` blocks non-interactive pushes — agents bypass with `$env:HUSKY = "0" ; git push --no-verify`.
- `.prettierignore` covers `*.kt`, `*.kts`, `*.swift`, `Caddyfile`, `*.env*` — Prettier skips these files.
- Kotlin lint: **detekt** runs in CI via GitHub Actions workflow.
- CI caching: Turbo remote cache, Konan cache, and Gradle cache are configured for faster builds.
- Platform release workflows exist for all 4 platforms (iOS, Android, Web, Windows) in `.github/workflows/`.

### Known Local Issues

- **`npm run ci:check` type-check may fail locally** — TypeScript 5.9.3 has compatibility issues with the current tsconfig. Format + lint (`npm run format:check && npx eslint . --max-warnings 0`) is sufficient for local pre-push validation. Remote CI is the source of truth for type-check.
- **`.prettierignore` coverage** — Prettier is configured to skip `*.kt`, `*.kts`, `*.swift`, `Caddyfile`, and `*.env*` files. Do not run Prettier on these file types.
- **`npm run ci:check:quick`** — Use this for docs-only or non-code changes; it skips type-check.
- **Husky pre-push hook** — Blocks non-interactive (agent) pushes by default. Agents must bypass with `$env:HUSKY = "0" ; git push --no-verify origin <branch>`.

## Code Quality Requirements

- Write clean, self-documenting code with minimal but meaningful comments
- Every public function/method must have a documentation comment
- Follow platform-native conventions (don't force one language's patterns on another)
- Prefer pure functions and immutable data structures where possible
- All business logic must have unit tests; sync operations need integration tests
- Use descriptive variable and function names that reflect financial domain terminology

## Security (CRITICAL for financial app)

- NEVER hardcode secrets, API keys, or credentials
- NEVER log sensitive financial data (account numbers, balances, transactions) in plain text
- Always use parameterized queries — no string interpolation in SQL/queries
- Validate and sanitize all inputs at trust boundaries
- Use encryption at rest and in transit for financial data
- Follow the principle of least privilege for all API endpoints and data access

## Accessibility

- All UI must meet WCAG 2.2 AA standards minimum
- Use semantic HTML/native elements; support screen readers
- Respect user preferences: reduced motion, high contrast, font scaling
- Never convey information through color alone
- All interactive elements must have appropriate labels and focus management

## Privacy & Ethics

- Collect only the minimum data necessary
- All data collection must be transparent and documented
- Support data export and deletion (GDPR/CCPA compliance)
- Never sell, share, or use financial data for advertising
- Default to the most private option in every design decision

## Commit Messages

- Use conventional commits: `type(scope): description (#N)` where N is the issue number
- Types: feat, fix, docs, style, refactor, test, chore, ci, perf
- Scope should reference the app/package/service being changed
- Always include issue reference `(#N)` in every commit message
- Include "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" trailer

## Dependencies

- Document the reason for every new dependency in the PR description
- Prefer well-maintained, actively developed packages
- Evaluate security posture before adding financial/crypto dependencies
- Minimize dependency count — prefer standard library solutions when adequate

## File Organization

- One concern per file; split when files exceed ~300 lines
- Group by feature, not by type (e.g., `feature/component.tsx` + `feature/component.test.tsx`)
- Shared utilities go in the appropriate package under packages/
