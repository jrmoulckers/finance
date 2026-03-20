---
name: dev-onboarding
description: >
  Developer onboarding and environment setup knowledge for the Finance
  monorepo. Use for topics related to setup, install, onboarding, getting
  started, prerequisites, environment, or new developer.
---

# Developer Onboarding Skill

This skill provides the current setup and workflow guidance for the Finance monorepo.

## Prerequisites Checklist

| Tool                | Minimum Version | Install Guide                  | Purpose                   |
| ------------------- | --------------- | ------------------------------ | ------------------------- |
| Git                 | 2.40+           | https://git-scm.com/           | Version control           |
| Node.js             | 22+             | https://nodejs.org/            | Workspace tooling         |
| npm                 | 10+             | Bundled with Node.js           | Monorepo scripts          |
| VS Code             | 1.99+           | https://code.visualstudio.com/ | Primary editor            |
| GitHub Copilot      | Latest          | VS Code Marketplace            | AI completions + chat     |
| GitHub Copilot Chat | Latest          | VS Code Marketplace            | Agent mode, custom agents |

## First-Time Setup

```bash
git clone https://github.com/jrmoulckers/finance.git
cd finance
npm install
code .
```

After install:

- Husky hooks are installed via the root `prepare` script.
- VS Code should recommend the workspace extensions.
- Copilot Chat can then use the repo's custom agents, skills, and instructions.

## Current Local Quality Gates

### Lint-Staged and Pre-Commit

- Root `package.json` includes `lint-staged`.
- `.husky/pre-commit` runs `npx lint-staged`.
- Staged JavaScript and TypeScript files are auto-fixed with `eslint --fix` and `prettier --write`.
- Staged Markdown, JSON, YAML, CSS, HTML, Kotlin, and Gradle Kotlin files are auto-formatted with Prettier.

### Pre-Push Guardrail

- `.husky/pre-push` requires interactive confirmation before pushing.
- Non-interactive sessions are blocked automatically unless a human explicitly uses `git push --no-verify`.
- This is why AI agents cannot rely on ordinary `git push` flows in this repository.

## Useful Scripts

- `npm run ci:check` — format check, lint, and type-check.
- `npm run ready-for-pr` — `ci:check` plus KMP tests.
- `npm run lint:fix` — full-repo ESLint and Prettier autofix.
- `npm run test:kmp` — runs the shared Kotlin tests currently wired into the root workflow.

## MCP Server Verification

After opening the workspace, verify MCP servers are running:

1. Open Command Palette.
2. Run `MCP: List Servers`.
3. Confirm the expected servers are available for GitHub, memory, sequential thinking, and documentation lookup.

If a server is stopped, inspect the VS Code Output panel before retrying.

## GitHub PAT Guidance

When the GitHub MCP server requests a token, prefer a fine-grained read-only token scoped to `jrmoulckers/finance` with read access to contents, issues, pull requests, and metadata.

Avoid full `repo` access unless a human intentionally needs write capability outside the MCP flow.

## Helpful References

- `README.md` — project overview and root workflow.
- `docs/guides/workflow-cheatsheet.md` — daily branch, commit, validation, and release workflow.
- `.github/CONTRIBUTING.md` — contributor expectations, including pre-PR validation.
- `tools/README.md` — hook behavior and local tooling overview.

## Common Onboarding Issues

### Hooks do not run

- Re-run `npm install` so the `prepare` script reinstalls Husky.
- Confirm the `.husky/` directory exists in the repo root.

### Auto-formatting does not happen on commit

- Make sure files are staged before committing; `lint-staged` only processes staged files.
- Check that Prettier and ESLint are installed from the root workspace.

### CI-style validation fails locally

- Start with `npm run ci:check` for formatting, lint, and type errors.
- Use `npm run ready-for-pr` before handing work off for review.
