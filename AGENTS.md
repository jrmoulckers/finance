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

## Fleet / Swarm Workflows

This project supports Copilot CLI's `/fleet` command for parallel agent execution. For complex tasks, `/fleet` breaks down work and dispatches subtasks to specialized agents concurrently:

```bash
# In Copilot CLI
/fleet implement budget rollover with tests, docs, and security review
```

This is especially powerful with our custom agents — the fleet orchestrator can delegate architecture to `@architect`, implementation to domain agents, security review to `@security-reviewer`, and documentation to `@docs-writer`, all in parallel.

**Requirements:** Copilot CLI with Pro+ subscription. No special repo configuration needed.

See `docs/ai/` for complete AI development documentation.
