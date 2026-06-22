---
name: dev-onboarding
description: >
  Developer onboarding and environment setup knowledge for the Finance
  monorepo. Use for topics related to setup, install, onboarding, getting
  started, prerequisites, environment, or new developer.
---

# Developer Onboarding Skill

## Purpose

This skill covers **developer environment setup and onboarding** — prerequisites, first-time setup, local scripts, Husky/lint-staged guardrails, and troubleshooting day-one tooling. Deeper platform build config and multi-agent operations belong to the related skills below.

## Out of Scope

- KMP source-set layout, Gradle targets, and SQLDelight config → use `kmp-development`.
- Supabase local stack, RLS, and Edge Functions → use `supabase-powersync`.
- MCP server wiring and agent tool permissions → use `mcp-agent-tooling`.
- Sprint planning, agent dispatch, CI healing, and merges → use `sprint-planning` and `fleet-orchestration`.

## Prerequisites

| Tool           | Version | Purpose                 |
| -------------- | ------- | ----------------------- |
| Git            | 2.40+   | Version control         |
| Node.js        | 22+     | Workspace tooling       |
| npm            | 10+     | Monorepo scripts        |
| VS Code        | 1.99+   | Primary editor          |
| GitHub Copilot | Latest  | AI completions + agents |

Optional: JDK 21 (for KMP/Gradle), Android SDK (for Android builds).

## Quick Start

```bash
git clone https://github.com/jrmoulckers/finance.git
cd finance
npm install       # installs deps + Husky hooks
code .            # VS Code recommends workspace extensions
```

For agent worktree setup:

```bash
node tools/agent-scripts/setup-worktree.js <agent-type> <type> <description> <issue#>
```

## Key Scripts

| Command                | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `npm run ci:check`     | Format check + lint + type-check (run before every push) |
| `npm run format`       | Auto-fix all Prettier issues                             |
| `npx eslint . --fix`   | Auto-fix all ESLint issues                               |
| `npm run ready-for-pr` | `ci:check` + KMP tests — full pre-PR gate                |
| `npm run test:kmp`     | Shared Kotlin tests                                      |
| `npm run lint:fix`     | Full-repo ESLint + Prettier autofix                      |

## Agent Automation Scripts (`tools/agent-scripts/`)

| Script              | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `setup-worktree.js` | Create worktree with correct naming and branch |
| `pre-push-check.js` | Run format + lint + type-check with `--fix`    |
| `create-pr.js`      | Push branch and create PR with linked issues   |
| `sprint-status.js`  | Dashboard for sprint progress and CI health    |

## Pre-Push Workflow (Mandatory)

Do not duplicate the command sequence in this onboarding skill. Follow `docs/ai/workflow.md` **Mandatory Pre-Push** as the canonical source: format/lint, verify, amend, fetch/rebase, push the agent-owned feature branch with the approved Husky bypass, create and verify the PR, monitor CI + mergeability, then self-merge agent-authored PRs after the quality gate passes.

## Local Quality Gates

- **Pre-commit** (`.husky/pre-commit`): `lint-staged` auto-fixes staged TS/JS, formats MD/JSON/YAML/CSS
- **Pre-push** (`.husky/pre-push`): Blocks non-interactive sessions; agents use the approved Husky bypass documented in `docs/ai/workflow.md`
- **Detekt** (Kotlin lint): Config in `config/detekt/`, run with `./gradlew detekt`

## Tools Directory

| Script                       | Purpose                            |
| ---------------------------- | ---------------------------------- |
| `tools/cleanup-worktrees.js` | Prune stale worktrees after merges |
| `tools/ci-check-quick.js`    | Lightweight local CI validation    |
| `tools/ready-for-pr.js`      | Full pre-PR validation gate        |
| `tools/setup.js`             | Initial environment setup          |
| `tools/gradle.js`            | Gradle helper utilities            |

## Repo Structure Overview

```
finance/
├── apps/           # Platform apps (ios, android, web, windows)
├── packages/       # Shared KMP code (core, models, sync)
├── services/api/   # Supabase backend + Edge Functions
├── docs/           # Architecture, guides, AI workflow
├── tools/          # Scripts + agent automation
├── .github/        # Agents, skills, workflows, instructions
└── config/         # Detekt, tokens, shared config
```

## Key References

| Document                             | Purpose                                  |
| ------------------------------------ | ---------------------------------------- |
| `AGENTS.md`                          | Agent roles, file ownership, fleet rules |
| `docs/ai/worktrees.md`               | Worktree lifecycle for agent work        |
| `docs/guides/workflow-cheatsheet.md` | Daily workflow commands                  |
| `.github/CONTRIBUTING.md`            | Contributor expectations                 |
| `docs/ai/skills.md`                  | All available agent skills               |

## Common Issues

- **Hooks don't run**: Re-run `npm install` (triggers Husky `prepare` script)
- **No auto-format on commit**: Ensure files are staged; `lint-staged` only processes staged files
- **CI fails locally**: Start with `npm run ci:check`; use `npm run ready-for-pr` for full validation
- **Gradle not found**: Install JDK 21; ensure `JAVA_HOME` is set
