# Tools

Development tooling and scripts for the Finance monorepo.

## Overview

This directory contains cross-platform scripts and Git hooks that support the development workflow. Scripts prefer Node.js for portability across Windows, macOS, and Linux.

## Contents

### `dev-full.mjs` — One-command local full-stack web e2e (on edge)

The seamless developer entry point. Brings up the local Supabase **edge** stack
(auth + Postgres/RLS via Docker), wires the web app to it (writes
`apps/web/.env.local` from `supabase status`), and launches the web app — all in
one command. On a **fresh clone it installs dependencies first** (so the path is
truly clone → run), runs `doctor.mjs`, and skips startup if the stack is already
running. When `supabase start` fails it **classifies the cause** instead of
assuming a rate-limit: a true registry pull limit is retried with backoff, while
a corrupt local image (`exit 255` / `exec format error`) or a migration/SQL error
fails fast with the specific fix. No global Supabase CLI required (uses
`npx --yes supabase`).

Dependency install is automatic and idempotent: it runs `npm install` only when
`node_modules` is missing or when `package-lock.json` has changed since the last
install (tracked by a content hash in `node_modules/.dev-full-install`, so a
plain `git checkout` does not trigger a redundant reinstall).

**Usage:**

```bash
npm run dev:full                 # install deps if needed → preflight → stack → wire web → launch + open browser
npm run dev:full -- --reset      # also reset the DB (migrations + seed) first
npm run dev:full -- --e2e        # bring up stack, run the live Playwright e2e suite
npm run dev:full -- --no-open    # don't auto-open the browser
npm run dev:full -- --skip-install   # skip the automatic dependency install
npm run dev:full -- --install        # force a dependency (re)install
npm run dev:full -- --skip-doctor
node tools/dev-full.mjs --help
```

In VS Code, the **"Dev: Full Stack (web on edge)"** task and the **F5** launch
config (`.vscode/tasks.json` / `launch.json`) wrap this for a true one-click
start — on a fresh clone, **F5 installs dependencies, brings up the stack, and
launches the app** with no manual `npm install`. See
[`docs/guides/full-stack-local.md`](../docs/guides/full-stack-local.md).

### `doctor.mjs` — Local dev preflight / health check

Verifies the host is ready for the full local stack **before** you start it,
catching the failures that otherwise stall a cold `supabase start`: Docker
daemon reachable (not just installed), enough free disk to extract the Supabase
images, required ports free (54321 Supabase, 5173 Vite), a resolvable Supabase
CLI, and whether dependencies are installed (warns on a fresh/stale clone —
non-fatal, since `dev:full`/F5 install automatically). Exits non-zero on a hard
failure so `dev-full.mjs` and CI can gate on it.

**Usage:**

```bash
npm run doctor                         # human-readable report
node tools/doctor.mjs --json           # machine-readable report
node tools/doctor.mjs --quiet          # only warnings/failures
node tools/doctor.mjs --min-disk-gb=40 # override the recommended-disk threshold
node tools/doctor.mjs --help
```

### `check-devenv.mjs` — Open-and-go dev environment bootstrap

The "open the repo and it sets itself up" entry point. Runs **automatically when
the folder opens in VS Code** (the `Setup: Check & heal dev environment` task in
`.vscode/tasks.json` uses `runOn: folderOpen`) and is also available as
`npm run check-devenv`. Its philosophy is **auto-heal what is safe, guide for what is
not**:

- **Auto-heals** npm dependencies — runs `npm install` when `node_modules` is
  missing or stale (reusing the same lockfile-hash logic as `dev-full.mjs`, so a
  plain `git checkout` does not trigger a redundant reinstall).
- **Detects but never force-installs** the system tools that need elevation or a
  reboot — Node.js (≥ the `engines.node` floor), a **JDK 21** (checks `PATH` then
  falls back to `$JAVA_HOME/bin`), and Docker — printing the exact fix for each.
- Stays **quiet when healthy** (a single confirmation line) and never interrupts
  opening the folder: a merely-missing system tool is advisory (exit 0). It exits
  non-zero only when an auto-heal it actually attempted (`npm install`) failed.

For the heavyweight path (validate → install → git hooks → **first build**) use
`setup.js` / `npm run setup`. For the runtime preflight (Docker daemon, disk,
ports) use `doctor.mjs` / `npm run doctor`.

**Usage:**

```bash
npm run check-devenv                    # check + auto-heal deps (the folder-open default)
node tools/check-devenv.mjs --quiet     # print only when action is needed (silent when healthy)
node tools/check-devenv.mjs --dry-run   # report what it would do; never installs
node tools/check-devenv.mjs --help
```

### `gradle.js` — Cross-platform Gradle wrapper

A Node.js script that invokes `gradlew` (Unix) or `gradlew.bat` (Windows) automatically based on the current OS. It also auto-detects JDK 21 if `JAVA_HOME` is not already set.

**Usage:**

```bash
# Instead of ./gradlew or gradlew.bat:
node tools/gradle.js <gradle-args>

# Examples
node tools/gradle.js :packages:core:build
node tools/gradle.js allTests
node tools/gradle.js clean
```

### `token-preview-serve.mjs` — Design token preview with hot reload

Generates a self-contained HTML preview of all design tokens (primitive, semantic, component) and serves it on `localhost:3333` with live reload. When any token JSON file changes, the preview regenerates and the browser refreshes automatically via Server-Sent Events.

**Usage:**

```bash
# Start the dev server (port 3333)
npm run tokens:preview

# Or with a custom port
node tools/token-preview-serve.mjs --port 4000

# Generate the HTML without serving (CI, snapshots)
npm run tokens:preview:generate
```

**What the preview shows:**

| Section          | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| Primitive Colors | Full palette grids with hex values                            |
| Chart Colors     | IBM CVD-safe data visualization palette                       |
| Semantic Colors  | Light / Dark / OLED Dark themes side by side                  |
| WCAG Contrast    | Contrast ratio checks for all text/background pairs per theme |
| Typography       | Live-rendered type scale samples (Display → Caption)          |
| Spacing          | Horizontal bar visualization of the 4px/8px spacing scale     |
| Border Radius    | Visual samples of each radius token                           |
| Elevation        | Shadow samples from none → xl                                 |
| Motion           | Duration and easing token values with animated indicators     |

Output: `packages/design-tokens/build/preview/index.html` (gitignored build artifact).

### `token-preview-generate.mjs` — Standalone token preview generator

The generation engine used by `token-preview-serve.mjs`. Can be run independently to produce the HTML preview without starting a server.

### `git-hooks/` — Custom Git hooks

Contains hooks that enforce repository safety rules. See [`git-hooks/README.md`](git-hooks/README.md) for full details.

**Setup (one-time per clone):**

```bash
git config core.hooksPath tools/git-hooks
```

**Available hooks:**

| Hook       | Purpose                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pre-push` | Requires interactive human confirmation before `git push`. Blocks non-interactive sessions (AI agents, CI) automatically. |

### `performance-benchmark.js` - Build and runtime performance benchmarking

Measures build times, bundle sizes, and runtime metrics across all platforms. Compares against `performance.budget.json` budgets and optional baselines.

    node tools/performance-benchmark.js                    # Full benchmark
    node tools/performance-benchmark.js --platform web     # Web only
    node tools/performance-benchmark.js --compare          # Compare to baseline
    node tools/performance-benchmark.js --save-baseline    # Save current as baseline

### `coverage-report.js` - Cross-platform coverage aggregation

Aggregates code coverage from Kover (KMP), Istanbul (Web), JaCoCo (Android), and xccov (iOS). Enforces per-module thresholds and generates badges.

    node tools/coverage-report.js                          # Aggregate report
    node tools/coverage-report.js --badge                  # Generate coverage badge

### `dependency-audit.js` - Dependency vulnerability scanner

Runs npm audit and scans Gradle dependencies for known vulnerabilities. Supports severity filtering and auto-fix.

    node tools/dependency-audit.js                         # Full audit
    node tools/dependency-audit.js --severity high         # High+ only
    node tools/dependency-audit.js --fix                   # Auto-fix npm issues

### `release-checklist.js` - Pre-release validation

Validates release readiness: git state, changeset presence, version consistency, platform-specific checks.

    node tools/release-checklist.js                        # Full checklist
    node tools/release-checklist.js --platform android     # Android only

### `build-analysis.js` - Build configuration analyzer

Analyzes Turbo and Gradle configurations for optimization opportunities.

    node tools/build-analysis.js                           # Full analysis
    node tools/build-analysis.js --recommend               # Show recommendations

### `test-shard-config.js` - Dynamic test shard allocation

Generates optimal test shard configurations for CI matrix builds based on test file counts.

    node tools/test-shard-config.js                        # Generate shard config
    node tools/test-shard-config.js --platform web         # Web sharding only
    node tools/test-shard-config.js --json                 # JSON output for CI matrix

### `security-scan.js` - Local security scanner

Detects hardcoded secrets, runs static code analysis patterns, and checks dependency vulnerabilities.

    node tools/security-scan.js                            # Full scan
    node tools/security-scan.js --secrets-only             # Secret detection only

### `check-workflow-security.mjs` - Privileged workflow regression gate

Checks GitHub Actions workflows for full-SHA action pins, immutable external
tooling, input-to-shell interpolation, inherited reusable secrets, protected
release environments, least-privilege job permissions, verified k6 downloads,
preview secret isolation, and reviewed Finance-local reusable workflow drift.

```bash
npm run workflow:security:test
npm run workflow:security:check
node tools/check-workflow-security.mjs --help
```

### `ci-health-dashboard.js` - CI/CD health metrics

Queries GitHub Actions via gh CLI for workflow success rates, build times, and flaky test detection.

    node tools/ci-health-dashboard.js                      # Dashboard view
    node tools/ci-health-dashboard.js --days 14            # 14-day window
    node tools/ci-health-dashboard.js --alerts-only        # Show alerts only

### `fleet-status.js` - Fleet PR monitoring

Monitors open pull requests across the fleet: CI status, merge conflicts, staleness.

    node tools/fleet-status.js                             # Fleet status
    node tools/fleet-status.js --watch                     # Poll every 60s

### `worktree-cleanup.js` - Enhanced worktree cleanup

Detects stale worktrees (merged branches, closed PRs, inactive branches) with PR status integration.

    node tools/worktree-cleanup.js                         # Dry run
    node tools/worktree-cleanup.js --force                 # Remove stale worktrees
    node tools/worktree-cleanup.js --stale-days 14         # Custom staleness threshold

### `workflow-metrics.js` - AI agent workflow metrics collector

Collects AI-agent workflow health from the GitHub API via the `gh` CLI: CI failure rate per PR, time-to-merge-ready, fleet runs, and per-agent-type acceptance / change-request / revert rates. Outputs a Markdown summary + JSON. Best-effort: non-derivable metrics are emitted as `null` with an explanatory note. Degrades gracefully (exit 0) when `gh` is missing or unauthenticated. Implements the automation described in [`docs/ai/workflow-metrics.md`](../docs/ai/workflow-metrics.md). Addresses issues #2866 and #2865.

    node tools/workflow-metrics.js                         # Markdown + JSON to stdout
    node tools/workflow-metrics.js --days 30 --limit 200   # Window + scan limit
    node tools/workflow-metrics.js --json                  # JSON only
    node tools/workflow-metrics.js --out-dir metrics-out   # Also write JSON + MD files

Runs weekly via [`.github/workflows/ai-metrics.yml`](../.github/workflows/ai-metrics.yml).

### `ai-manifest.js` - AI configuration manifest generator

Scans `.github/agents/*.agent.md`, `.github/skills/*/SKILL.md`, `.github/instructions/*.instructions.md`, and `.vscode/mcp.json` (JSONC-aware) and emits a JSON + Markdown manifest (counts + names) of the AI configuration surface. Addresses issue #2863.

    node tools/ai-manifest.js                              # Markdown + JSON to stdout
    node tools/ai-manifest.js --json                       # JSON only
    node tools/ai-manifest.js --out-dir out                # Write ai-manifest.{json,md}

### `check-ai-manifest.js` - AI manifest drift check

Compares hardcoded counts in `docs/ai/README.md`, `docs/INDEX.md`, and `AGENTS.md` against the real filesystem counts (via `ai-manifest.js`). It also validates the exact 22-role generated roster, provenance stamps, the sole local `finance-domain` agent, retired-role absence, the canonical runtime documentation, and the 72-entry Studio sync inventory. **Informational by default** (warns, exit 0) to avoid racing concurrent doc edits; set `STRICT=1` or pass `--strict` to make drift blocking. Addresses issues #2863, #4009, #4014, and #4019.

    node tools/check-ai-manifest.js                        # Warn-only (exit 0)
    STRICT=1 node tools/check-ai-manifest.js               # Blocking (exit 1 on drift)

Runs on PRs touching the AI config surface via [`.github/workflows/ai-manifest-check.yml`](../.github/workflows/ai-manifest-check.yml).

### `ai-eval/run-evals.js` - Agent-output eval harness (scaffold)

Loads golden-task fixtures from `tools/ai-eval/golden-tasks/`, evaluates a candidate agent output against each task's rubric, and prints a scorecard (text / `--json` / job summary). A scaffold — the model-invocation step is a `// TODO(human)`; until wired it scores automatable rubric checks against the repo or a fixture sample candidate. See [`tools/ai-eval/README.md`](ai-eval/README.md). Addresses issue #2862.

    node tools/ai-eval/run-evals.js                        # Run all golden tasks
    node tools/ai-eval/run-evals.js --json                 # JSON scorecard
    node tools/ai-eval/run-evals.js --task <id>            # Run a single task
    STRICT=1 node tools/ai-eval/run-evals.js               # Exit 1 if below threshold

Runs (non-blocking) on agent/skill changes via [`.github/workflows/ai-eval.yml`](../.github/workflows/ai-eval.yml).

### `check-migration-reversals.js` - Reverse-migration coverage check

Verifies every `services/api/supabase/migrations/*.sql` has a matching `services/api/supabase/migrations/down/<name>.down.sql`. Exits 1 if any reverse migration is missing. Supports issue #2881.

    node tools/check-migration-reversals.js                # Exit 1 on missing down files
    node tools/check-migration-reversals.js --json         # JSON report

Runs on PRs touching migrations via [`.github/workflows/migration-reversal-check.yml`](../.github/workflows/migration-reversal-check.yml).

### `setup-branch-protection.sh` - Apply `main` branch protection (human-run only)

⚠️ **HUMAN-RUN ONLY — AI agents must not execute this.** Applies the `main`
branch-protection config documented in
[`.github/branch-protection.md`](../.github/branch-protection.md) in one idempotent
`gh api` call: requires the always-on gatekeeper + lint + PR-title checks, 2 reviews

- Code Owner review, enforce-for-admins, linear history, conversation resolution, and
  no force-push/deletions. Requires `gh` authenticated with repo admin scope. Prompts
  for confirmation before writing. Supports the human items in #2860 / #2880.

      ./tools/setup-branch-protection.sh                     # current repo, main
      ./tools/setup-branch-protection.sh owner/repo main     # explicit target

### `verify-required-checks.mjs` - Robust deploy gate on a required check-run

Gates a production deploy on a required aggregate check-run (default
`Required Checks Gatekeeper`) for a specific commit SHA by polling the
check-runs REST API directly. Replaces `lewagon/wait-on-check-action` in
`deploy-production.yml` (#3915): the gatekeeper job `needs:` the ~20-30 min
CodeQL/security jobs, so GitHub does not **create** its check-run until those
finish. A fast staging deploy then triggered promotion and the old wait step
looked for a check-run that did not exist yet, hard-failing with "The requested
check was never run against this ref". This poller fails **closed**:

- **pass** — gatekeeper completed with an allowed conclusion (`success`/`skipped`)
- **fail** (immediate) — gatekeeper completed with a real failure
- **wait** — gatekeeper missing/queued/in_progress (it is legitimately created late)
- **deadline with no pass** — exit 1 (never deploys an ungated SHA)

Reads a token from `GITHUB_TOKEN`/`GH_TOKEN` (needs `checks: read`). Unit tests
in `verify-required-checks.test.mjs` (`node --test`); quick self-check via
`node tools/verify-required-checks.mjs --self-test`.

    node tools/verify-required-checks.mjs --sha <commit-sha> [--timeout 1500] [--interval 20]

## Suggested `package.json` scripts

`package.json` is shared and is not edited by the DevOps agent. When a maintainer
next touches `package.json`, adding the following `scripts` entries makes the
tools above first-class npm commands (each script also documents its suggested
name in its header comment):

```jsonc
{
  "scripts": {
    "metrics:workflow": "node tools/workflow-metrics.js",
    "ai:manifest": "node tools/ai-manifest.js",
    "ai:manifest:check": "node tools/check-ai-manifest.js",
    "ai:eval": "node tools/ai-eval/run-evals.js",
    "db:check:reversals": "node tools/check-migration-reversals.js",
  },
}
```

## Adding New Tools

- Write scripts in Node.js for cross-platform compatibility
- Include a usage comment at the top of each script
- Support a `--help` flag or equivalent
- Validate inputs and fail with clear error messages
