# GitHub Copilot Instructions — Finance Monorepo

You are working in the Finance monorepo — a multi-platform, native-first financial tracking application.

**This file is a finance-specific overlay, not a policy source.** Studio-wide policy — the core
principles, the Definition of Done, issue-first development, coding standards, commit message
conventions, and all eight categories of Human-Gated Operations — lives in root
[`AGENTS.md`](../AGENTS.md) and in the studio-managed block at the bottom of this file. Each rule has
exactly one canonical owner; read it there rather than looking for a second copy here. Everything
below the studio markers is upstream-owned and must not be edited locally.

What follows is only what is genuinely finance-specific: this repo's architecture, its ratified
schema decisions, the exact local pre-push commands, and its known local quirks. Where a rule here is
**stricter** than the studio floor, it is an **additional local constraint on top of `AGENTS.md`** —
never a replacement for it, and never a relaxation.

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

## Development Workflow

The workflow itself — issue-first, worktree, branch, commit, push, PR, drive CI green, self-merge,
clean up — is defined in root [`AGENTS.md`](../AGENTS.md) and
[`.github/instructions/workflow.instructions.md`](instructions/workflow.instructions.md). Do not look
for a second copy of it here.

What is local to this repo is the **exact command sequence** below. Run it before **every** `git push`.

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

- **`npm run ci:check` type-check** — the previously documented "TypeScript 5.9.3 compatibility
  issues with the current tsconfig" claim was **incorrect**. The installed compiler is TypeScript
  **6.0.3**, and the failure was two genuine `noImplicitAny` errors on `react-router` v8 prop
  callbacks (`ResponsiveNav.tsx`, `SettingsPage.tsx`), both since fixed. `apps/web` now
  type-checks clean:

  ```powershell
  cd apps/web; node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
  ```

  Format + lint remain the fast pre-push gate, but type-check is no longer expected to fail.

- **`.prettierignore` coverage** — Prettier is configured to skip `*.kt`, `*.kts`, `*.swift`, `Caddyfile`, and `*.env*` files. Do not run Prettier on these file types.
- **Studio-managed canon is `.prettierignore`d** — `.github/copilot-instructions.md` and the generated
  files under `.github/agents/`, `.github/instructions/`, `.github/prompts/` and `.github/skills/` are
  authored upstream in `jrmoulckers/.github` and are not formatted to this repo's Prettier config.
  They are listed in `.prettierignore`; do not run `npm run format` against them and do not "fix"
  their formatting — a local edit inside the `studio:base` markers is detected as drift and the file
  is skipped on the next sync.
- **`npm run ci:check:quick`** — Use this for docs-only or non-code changes; it skips type-check.
- **Husky pre-push hook** — Blocks non-interactive (agent) pushes by default. Agents must bypass with `$env:HUSKY = "0" ; git push --no-verify origin <branch>`.

## Security — finance-specific controls

These are **additional local constraints layered on top of** the security and privacy rules in root
`AGENTS.md` (core principles, Category 7 secret handling, Category 8 destructive database
operations). They are not a replacement for them, and they are deliberately stricter because this
repository handles real financial data.

- **NEVER log sensitive financial data in plain text** — account numbers, balances, transaction
  amounts, merchant strings, and account identifiers must never reach `console.*`, `Log.*`,
  `logger.*`, crash reports, or analytics payloads. CI enforces this via the "Observability
  Guardrails" job and the gatekeeper's sensitive-data-logging backstop.
- **Encrypt financial data at rest and in transit** on every platform, including local device
  storage, not just the Supabase/PowerSync transport.
- **Least privilege on every sync-enabled table** — ownership is expressed through `owner_id`
  (`auth.uid()`) with `household_id` for household-level RLS isolation. Every new table and every new
  API endpoint must carry an RLS policy; there is no "public" financial data.
- **Product telemetry is consent-gated and excludes raw financial values.** Finance has no
  advertising business model — see `AGENTS.md` core principle 6.

## Finance-specific code conventions

Generic coding standards live in root `AGENTS.md`. Only these are local:

- Use variable and function names that reflect **financial domain terminology** (e.g. `postedBalance`,
  `budgetPeriod`, `recurringRule`) rather than generic names.
- **Sync operations require integration tests**, not just unit tests — the sync engine's conflict and
  replay behavior is not adequately covered by unit tests alone.
- Evaluate the **security posture of any financial or crypto dependency** before adding it, in
  addition to the studio-wide requirement to document why a dependency was added.

## File Organization

- One concern per file; split when files exceed ~300 lines
- Group by feature, not by type (e.g., `feature/component.tsx` + `feature/component.test.tsx`)
- Shared utilities go in the appropriate package under packages/

<!-- studio:base:start -->
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# GitHub Copilot — JRM Studio orientation

This file orients GitHub Copilot on the **Copilot surfaces**: chat and completions in VS Code,
`copilot.com`, code review, and the coding agent.

**`AGENTS.md` in the repository root is the authoritative operating guide.** Read it before acting.
It owns the golden rules, the Definition of Done, the issue-first workflow, and the mandatory
human-gated operations. This file never restates those rules — where the two could appear to
conflict, `AGENTS.md` wins.

> Distributed from `jrmoulckers/.github`. Everything outside the `studio:base` markers is
> repository-local and is never overwritten by the studio sync tool; add repository-specific
> Copilot orientation there rather than editing inside the managed region.

## Read order

1. **`AGENTS.md`** (root) — the operating guide. Product repositories extend it below the managed
   region; those local rules layer on top of the shared floor but never relax a human gate.
2. **The nearest scoped instructions** — `.github/instructions/*.instructions.md` apply by glob to
   the paths you are editing. A more specific file wins over a more general one.
3. **Product context** — whatever the repository's own `AGENTS.md` section points you to
   (architecture notes, ADRs, design or domain docs).

## The installed AI layer

Much of `.github/` is generated and distributed from the `jrmoulckers/.github` backbone:

| Path | What it is | How to use it |
| --- | --- | --- |
| `.github/agents/*.agent.md` | Role definitions with explicit boundaries | Delegate specialist work to the matching role instead of improvising one |
| `.github/skills/<name>/SKILL.md` | Reusable methodology and checklists | Consult the skill whose description matches the task before inventing an approach |
| `.github/prompts/*.prompt.md` | Repeatable multi-step workflows | Prefer the existing prompt over an ad-hoc plan for the work it covers |
| `.github/instructions/*.instructions.md` | Path-scoped rules | Applied automatically by glob; obey the most specific match |
| `agency.toml` | Reviewed MCP servers and tool allowlists | Do not add servers or widen tool grants locally |

**Provenance is per file, not per directory — and in some files, per region.** Three shapes:

- **Whole-file canon.** A `synced from jrmoulckers/.github` marker at the top and no region markers.
  The entire file is generated. The comment syntax varies with the file type — HTML in Markdown, `#`
  in `.toml`, `.yml`, `.gitattributes` and `.gitignore`, `/* */` in `.js`, `.ts`, `.css`, `.kt` and
  `.swift`, and none at all in `.json`, which has no comment syntax.
- **Managed-region files.** Root `AGENTS.md`, this file, and `.gitattributes` carry canon *between*
  the `studio:base:start` and `studio:base:end` markers and are member-owned everywhere else. The
  block is generated; the surrounding content is yours to write, trim, and maintain. Editing inside
  the markers is drift; editing outside them is expected. `sync/lib/copier.mjs` is authoritative for
  which files these are — the list above is illustrative and grows when a managed-merge kind is
  added.
- **Unmarked files.** Repository-owned and yours to edit normally. `.github/agents/` in particular
  routinely holds both tiers side by side: canonical studio roles alongside locally authored agents
  carrying authority specific to that repository.

Check the marker — and, in a managed-region file, which side of it you are on — before assuming
anything is off-limits.

**Never edit generated content to change shared behaviour.** A local edit is detected as drift, is
skipped on the next sync, and silently strands the repository on a stale copy. Change the canonical
source in `jrmoulckers/.github` and let it sync. Genuinely repository-specific behaviour belongs in
the local `AGENTS.md`, a locally authored agent, or a scoped instructions file.

## Working conventions

- **Issue first, PR always.** Read-only research needs no issue; the requirement starts before your
  first change. A change that ends at a local commit is not done.
- **Reference, never restate.** Each rule has exactly one canonical owner. Link to it rather than
  copying its text — duplicated policy drifts and hides which copy is authoritative.
- **Stay in scope.** Surgical edits only. Do not reformat or refactor code the task did not require.
- **Verify before claiming done.** Run the repository's own lint, type-check, test, and build
  commands. Do not report success on unverified work.
- **Say when you are unsure.** A short clarifying question beats a confident guess on anything
  touching security, privacy, data, or infrastructure.

## Stop and ask

`AGENTS.md` §"Human-Gated Operations" is the complete, canonical list. Pushing your own feature
branch and opening a PR are *required* steps — never pause for permission on those. Do stop for
anything that writes to a shared branch, acts on another author's PR, changes repository settings,
touches real secrets or credentials, reaches outside the repository root, deletes files in bulk, or
publishes or deploys.

When a task needs a gated operation and no human is available, finish everything that is
auto-approved and leave a `## Needs Human Action` note describing exactly what remains and why.
<!-- studio:base:end -->
