# Tools

Development tooling and scripts for the Finance monorepo.

## Overview

This directory contains cross-platform scripts and Git hooks that support the development workflow. Scripts prefer Node.js for portability across Windows, macOS, and Linux.

## Contents

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

## Adding New Tools

- Write scripts in Node.js for cross-platform compatibility
- Include a usage comment at the top of each script
- Support a `--help` flag or equivalent
- Validate inputs and fail with clear error messages
