---
name: prompt-engineering
description: >
  Prompt engineering guidance for Finance agents. Use for topics related to
  prompt design, reusable prompts, Copilot instructions, agent handoffs,
  context packaging, task decomposition prompts, review prompts, or reducing
  ambiguity in AI-agent workflows.
---

# Prompt Engineering Skill

## Purpose

This skill covers **repo-specific prompt design and instruction hygiene** for Finance agents: packaging context, defining owned files, naming constraints, selecting related skills, and writing prompts that produce verifiable, scoped work.

## Out of Scope

- MCP server/tool configuration → use `mcp-agent-tooling`.
- Sprint selection and capacity planning → use `sprint-planning`.
- Agent dispatch/CI/merge operations → use `fleet-orchestration`.
- Issue filing quality and cross-platform duplicates → use `issue-management`.

## Related Skills

| Skill                 | Use For                                                  |
| --------------------- | -------------------------------------------------------- |
| `mcp-agent-tooling`   | Tool availability, MCP safety, and automation boundaries |
| `fleet-orchestration` | Turning prompts into parallel agent execution            |
| `sprint-planning`     | Selecting and sequencing work before prompt handoff      |
| `issue-management`    | Prompts that file high-quality scoped issues             |

## Repo-Specific Prompt Assets

| Path                          | Purpose                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `.github/prompts/*.prompt.md` | Reusable prompts for backlog, cleanup, fix-ci, rebase-all, review, sprint, team |
| `.github/instructions/*.md`   | Path-specific instructions loaded for code/skill/doc changes                    |
| `.github/agents/*.agent.md`   | Specialist agent definitions and ownership expectations                         |
| `.github/skills/*/SKILL.md`   | Durable domain knowledge invoked by trigger keywords                            |

## Prompt Shape for Finance Work

```markdown
## Goal

[Concrete outcome tied to issue/PR/sprint]

## Context

[Relevant paths, current behavior, constraints, related skills]

## Owned Files

[Explicit edit/create allowlist and files to avoid]

## Tasks

[Numbered, verifiable steps]

## Validation

[Allowed checks; if checks are forbidden, state the alternative evidence]

## Completion

[Expected summary, blockers, todo/status updates]
```

## Prompt Quality Rules

- Name the exact repository paths and ownership boundaries; "fix the app" is too broad.
- State what not to do when workflow or safety constraints matter (no secrets, no temp dirs, no external publishing).
- Prefer acceptance criteria over implementation guesses.
- Reference canonical workflow docs instead of embedding stale command blocks.
- Include platform parity explicitly: Web, iOS, Android, Windows, shared KMP, backend.
- Ask agents to verify with the smallest allowed evidence when builds/tests are forbidden.
- For review prompts, request high-confidence findings only and require file/line evidence.

## Anti-Patterns

| Anti-Pattern                | Better Prompt Pattern                                          |
| --------------------------- | -------------------------------------------------------------- |
| "Audit everything"          | Name surfaces, risk categories, and output format              |
| "Use best practices"        | Cite Finance rules: cents, privacy, offline-first, WCAG 2.2 AA |
| "Fix CI" without logs       | Include failing run/check names and relevant logs              |
| Hidden file ownership       | Provide an explicit edit allowlist and conflict boundaries     |
| Restating workflow commands | Point to `docs/ai/workflow.md` canonical sections              |
