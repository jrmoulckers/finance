---
applyTo: 'tools/**'
---

# Instructions for Development Tools

You are working in the `tools/` directory, which contains development tooling, scripts, and automation for the Finance monorepo.

## Guidelines

- Scripts should be cross-platform compatible (prefer Node.js/TypeScript over bash for portability)
- Include usage instructions as comments at the top of each script
- Tools should fail loudly with clear error messages — never fail silently
- Validate inputs and prerequisites before executing
- Use environment variables for configuration, not hardcoded values
- All tools should support a `--help` flag or equivalent
- Write tests for any tool with complex logic
- Document each tool in a README.md within its directory

## Existing Tools

- **`tools/generate-changelog.js`** — Generates changelog from git history. Used by release workflows.
- **`npm run cleanup:worktrees`** — Removes merged or stale worktrees. Run periodically to keep the workspace clean.
- **`npm run format`** — Runs Prettier across the monorepo (respects `.prettierignore`).
- **`npm run ci:check`** — Full CI validation: format:check + lint + type-check.
- **`npm run ci:check:quick`** — Lightweight CI check for docs-only or non-code changes (skips type-check).

## CI & Release Workflows

- Platform release workflows exist for all 4 platforms (iOS, Android, Web, Windows) in `.github/workflows/`.
- Kotlin lint: **detekt** workflow runs in CI for KMP code quality.
- CI caching: Turbo remote cache, Konan cache, and Gradle cache reduce build times.
