# AGENTS.md — Finance Monorepo

This file provides guidance for all AI agents (GitHub Copilot, Codex, Claude, and others) working in this repository.

## Project Overview

Finance is a multi-platform, native-first financial tracking application for personal, family, and partnered finances. It uses a monorepo architecture with an edge-first design — most computation happens on client devices, with a consolidated backend for data synchronization.

## Repository Layout

- `apps/` — Platform-specific applications (iOS, Android, Web, Windows)
- `packages/` — Shared libraries (core logic, data models, sync engine)
- `services/` — Backend services (consolidated API)
- `docs/` — Project documentation (AI workflow, architecture, design)
- `tools/` — Development tooling and scripts
- `.github/` — GitHub configuration, Copilot agents, skills, instructions

## Core Principles (MUST follow)

1. **Privacy first** — Never log, expose, or transmit sensitive financial data in plain text. All agent-generated code must treat user financial data as confidential by default.
2. **Edge-first architecture** — Prefer client-side computation. Backend calls should be for sync, not for business logic.
3. **Accessibility** — All UI code must meet WCAG 2.2 AA minimum. Use semantic elements, support screen readers, respect reduced motion and high contrast preferences.
4. **Security** — Follow OWASP guidelines. Never hardcode secrets. Always validate and sanitize inputs. Use parameterized queries.
5. **Transparency** — Document all significant decisions, trade-offs, and AI-generated code rationale in commit messages and PR descriptions.

## Coding Standards

- Write clear, self-documenting code. Comment only when intent isn't obvious from the code itself.
- Prefer small, focused functions and modules.
- Write tests alongside new code. Minimum: unit tests for business logic, integration tests for sync/API.
- Use consistent naming conventions per platform (camelCase for JS/TS/Swift, snake_case for Python, PascalCase for C#).
- All public APIs must have documentation comments.

## What NOT to Do

- Do NOT commit secrets, API keys, tokens, or credentials
- Do NOT add dependencies without documenting the reason
- Do NOT modify files in `secrets/` or environment files
- Do NOT bypass linters, formatters, or CI checks
- Do NOT generate placeholder/dummy implementations without marking them clearly with `// TODO:` comments
- Do NOT make changes outside the scope of the assigned task

## AI Agent Configuration

Custom agents are defined in `.github/agents/`. Each agent has a specific role:
- `architect` — System design and architecture decisions
- `docs-writer` — Documentation authoring and maintenance
- `security-reviewer` — Security and privacy code review
- `accessibility-reviewer` — Accessibility compliance review
- `finance-domain` — Financial domain logic and modeling

Agent skills are in `.github/skills/` and provide reusable domain knowledge.
Path-specific instructions are in `.github/instructions/`.

## Human-Gated Operations (MANDATORY)

The following operations MUST NEVER be performed by AI agents without explicit human approval. These restrictions apply to ALL AI tools working in this repository — GitHub Copilot, Codex, Claude, and any other agent.

### Category 1: Git Remote Operations
AI agents MUST NOT execute:
- `git push`, `git force-push`, `git push --force-with-lease`
- `git pull`, `git fetch` from untrusted remotes
- `git remote add`, `git remote remove`, `git remote set-url`
- `git merge` from remote branches
- `git rebase` onto remote branches
- Any operation that sends data to or receives data from a remote Git server

**Why:** Remote operations affect shared state and can introduce untrusted code or expose local work prematurely.

### Category 2: Pull Request & Review Operations
AI agents MUST NOT execute:
- Creating pull requests
- Merging or closing pull requests
- Approving or dismissing PR reviews
- Requesting reviewers
- Any `gh pr` CLI command that mutates state

**Why:** Code review is a critical human responsibility, especially for a financial application handling sensitive data.

### Category 3: Remote Platform Operations
AI agents MUST NOT execute:
- GitHub API writes (closing issues, changing labels, modifying repo settings)
- Deployment triggers or release publishing
- Hosting/infrastructure configuration changes
- Cloud service API calls (AWS, GCP, Azure, etc.)
- Any `gh repo`, `gh issue close/delete`, or `gh release` command

**Why:** Remote platform changes can affect production systems, billing, and user data.

### Category 4: Operations Outside Project Boundary
AI agents MUST NOT:
- Read, write, or execute files outside the repository root
- Access system directories, user home directories, or other projects
- Modify system configuration (PATH, env vars, registry, etc.)
- Install global packages or system-level tools

**Why:** This repository's agents should only affect this repository. System-level changes can break other projects or compromise security.

### Category 5: Destructive File Operations
AI agents MUST NOT execute:
- `rm -rf`, `del /S`, `Remove-Item -Recurse -Force` on directories
- Disk formatting, partitioning, or system-level file operations
- Bulk file deletion without explicit listing of each file

**Why:** Destructive operations are irreversible and can cause data loss.

### Category 6: Package Publishing & Distribution
AI agents MUST NOT execute:
- `npm publish`, `yarn publish`, `pnpm publish`
- App store submission or distribution commands
- Any command that distributes code to external registries

**Why:** Publishing affects downstream consumers and cannot be easily reversed.

### Category 7: Secret & Credential Operations
AI agents MUST NOT:
- Create, modify, or read `.env` files containing real credentials
- Access keychain, credential store, or secrets managers
- Generate or rotate API keys or tokens
- Modify authentication configuration

**Why:** Credential operations in a financial app carry extreme risk if mishandled.

### Category 8: Database Destructive Operations
AI agents MUST NOT execute:
- `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`
- `DELETE FROM` without a WHERE clause
- Schema migrations on production databases
- Any bulk data modification or deletion

**Why:** Financial data is irreplaceable. Database operations must be human-verified.

### Enforcement

These restrictions are enforced through:
1. **VS Code settings** — Terminal allowlist/denylist in `.vscode/settings.json`
2. **Agent instructions** — Each agent's `.agent.md` includes these restrictions
3. **Global instructions** — `.github/copilot-instructions.md` declares these rules
4. **Documentation** — `docs/ai/restrictions.md` provides full details
5. **Human review** — All AI-generated PRs require human approval before merge

If an AI agent encounters a task requiring a gated operation, it MUST:
1. Stop and clearly state what operation it needs to perform
2. Explain why the operation is necessary
3. Wait for explicit human approval before proceeding
4. Never attempt workarounds to bypass these restrictions

## Fleet / Swarm Workflows

This project supports Copilot CLI's `/fleet` command for parallel agent execution. For complex tasks, `/fleet` breaks down work and dispatches subtasks to specialized agents concurrently:

```bash
# In Copilot CLI
/fleet implement budget rollover with tests, docs, and security review
```

This is especially powerful with our custom agents — the fleet orchestrator can delegate architecture to `@architect`, implementation to domain agents, security review to `@security-reviewer`, and documentation to `@docs-writer`, all in parallel.

**Requirements:** Copilot CLI with Pro+ subscription. No special repo configuration needed.

See `docs/ai/` for complete AI development documentation.
