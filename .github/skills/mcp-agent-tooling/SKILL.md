---
name: mcp-agent-tooling
description: >
  MCP and agent tooling guidance for the Finance monorepo. Use for topics
  related to Model Context Protocol, MCP servers, .vscode/mcp.json, Copilot
  tools, agent scripts, tool permissions, token scopes, workspace filesystem
  access, or safe agent automation.
---

# MCP Agent Tooling Skill

## Purpose

This skill covers **safe use and maintenance of MCP server configuration and agent tooling** in the Finance repo, including `.vscode/mcp.json`, documented MCP server capabilities, and local automation scripts that agents use to coordinate work.

## Out of Scope

- Prompt wording and reusable task templates → use `prompt-engineering`.
- Fleet dispatch, CI monitoring, and merge ordering → use `fleet-orchestration`.
- Developer environment setup outside MCP/tooling → use `dev-onboarding`.
- Security review of application code → use `security-review-methodology`.

## Related Skills

| Skill                         | Use For                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `prompt-engineering`          | Prompt templates, instruction routing, and context packaging |
| `fleet-orchestration`         | Multi-agent execution, PR checks, merge ordering             |
| `dev-onboarding`              | Tool prerequisites and local setup                           |
| `security-review-methodology` | Trust boundaries, token scope review, and tool risk findings |

## Repo-Specific Paths

| Path                        | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `.vscode/mcp.json`          | Shared MCP server definitions and input prompts         |
| `docs/ai/mcp.md`            | Human-facing MCP configuration guide and risk notes     |
| `tools/agent-scripts/*.js`  | Local worktree, PR, status, and pre-push helper scripts |
| `.github/instructions/*.md` | Path-specific tool and workflow rules                   |

## Current MCP Servers

| Server                | Trust Boundary / Notes                                                             |
| --------------------- | ---------------------------------------------------------------------------------- |
| `github`              | Use read-only fine-grained PAT where possible; avoid broad `repo` write scope      |
| `sequential-thinking` | Local stdio tool; no auth, but still executes a package via `npx`                  |
| `memory`              | Persistent context; never store secrets or sensitive financial data                |
| `filesystem`          | Scoped to `${workspaceFolder}`; do not expand outside repo boundary                |
| `context7`            | Fetches library docs; avoid sending secrets or private data                        |
| `supabase`            | Requires prompted URL/key; treat service-role credentials as human-managed secrets |
| `playwright`          | Browser automation; avoid real user data and production accounts                   |

## Safe Tooling Rules

- Never hardcode tokens, service-role keys, URLs with credentials, or personal secrets in MCP config.
- Prefer `${input:...}` prompts and least-privilege scopes.
- Do not add tools that can mutate production infrastructure or publish artifacts.
- Keep filesystem access scoped to the workspace; do not configure arbitrary home/system paths.
- For agent helper scripts, point to canonical workflow docs instead of duplicating command sequences in skills.

## Review Checklist for MCP Changes

1. Does the server execute local code (`stdio`) or call a remote API (`http`)?
2. What data can the server read from the workspace or prompts?
3. What mutations can it perform, and are they allowed for agents?
4. Are credentials prompted, least-privilege, and documented?
5. Is the server trusted and pinned enough for financial-app development?
