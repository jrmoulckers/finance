---
name: prompt-engineering
description: >
  Prompt engineering guidance. Use for topics related to prompt design,
  reusable prompts, Copilot instructions, agent handoffs, context packaging,
  task decomposition prompts, review prompts, or reducing ambiguity in AI workflows.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Prompt Engineering Skill

**Trigger:** reusable prompts, agent handoffs, context packaging, task decomposition, review prompts,
instruction hygiene, ambiguity reduction.
**Inputs:** goal, target repo/scope, owned files, constraints, related skills, validation expectations.
**Related:** `issue-management` (issue-filing prompts), `project-management` (planning handoffs),
`mcp-agent-tooling` (tool boundaries), `ux-testing` (QA prompts).

## Out of scope

- MCP server/tool configuration → use `mcp-agent-tooling`.
- Backlog selection, capacity, and sequencing → use `project-management` or `sprint-planning`.
- CI dispatch, branch hygiene, and merge operations → use the relevant workflow skill.
- Issue filing quality and duplicates → use `issue-management`.

## Prompt shape

```markdown
## Goal

[Concrete outcome tied to issue/PR/workstream]

## Context

[Relevant paths, current behavior, constraints, related skills]

## Owned Files

[Explicit edit/create allowlist and files to avoid]

## Tasks

[Numbered, verifiable steps]

## Validation

[Allowed checks; if unavailable, alternative evidence]

## Completion

[Expected summary, blockers, todo/status updates]
```

## Method

1. **Name the outcome** — specify the user-visible or repo-visible result.
2. **Constrain ownership** — list editable paths, read-only paths, and conflict boundaries.
3. **Package context** — include issue numbers, relevant files, logs, screenshots, and decisions.
4. **Prefer acceptance criteria** — describe success before prescribing implementation.
5. **State safety limits** — secrets, external services, destructive operations, temp paths, and publishing rules.
6. **Make validation explicit** — smallest meaningful checks, expected command names, or evidence fallback.
7. **Define output** — summary format, files changed, unresolved blockers, and follow-up issues.

## Anti-patterns

| Anti-pattern | Better prompt pattern |
| --- | --- |
| "Audit everything" | Name surfaces, risk categories, and output format |
| "Use best practices" | Cite product rules, acceptance criteria, and related skills |
| "Fix CI" without logs | Include failing checks, run IDs, and relevant excerpts |
| Hidden ownership | Provide an explicit edit allowlist and files to avoid |
| Stale commands | Reference canonical docs or ask for repo-native checks |

## Safety

Do not embed secrets, private URLs, or broad write permissions in prompts. Avoid prompts that encourage
agents to bypass issue-first, PR-always, or conventional-commit discipline.

## Output

A scoped prompt or prompt review with goal, context, ownership, tasks, validation, safety constraints, and
completion contract.
