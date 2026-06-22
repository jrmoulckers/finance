# Start Here — AI Practice Entry Point

Welcome. This is the **canonical first page** for anyone — a new AI agent or a new human contributor — joining the Finance AI-first development practice. It links the essential documents in reading order so you don't have to guess where to begin.

> **Audience:** new AI agents picking up their first issue, and humans onboarding to how this repo uses AI. Already oriented? Jump to the [full documentation index](README.md).

## Table of Contents

- [The 60-Second Mental Model](#the-60-second-mental-model)
- [Read These First (in order)](#read-these-first-in-order)
- [The Non-Negotiables](#the-non-negotiables)
- [Where Things Live](#where-things-live)
- [Reference by Role](#reference-by-role)
- [Governance & Accountability](#governance--accountability)

## The 60-Second Mental Model

- **Issue-first.** Every change references a GitHub issue. No issue → create one first.
- **Worktree + feature branch.** Agents never commit on `main`; each task gets its own git worktree and branch.
- **PR to `main`.** Open a PR with `--base main` and `Closes #N`. Drive CI green.
- **Self-merge your own work.** Once the quality gate passes — **CI green AND the PR is `MERGEABLE`** — you merge **your own** PR. Merging a PR you did **not** author, and high-risk operations, stay human-gated.
- **The gate is the control.** There is no mandatory human pre-merge review of agent PRs; branch protection, required CI checks, issue traceability, and the documented restrictions are what keep the practice safe. See [Responsible AI § The Control Environment](responsible-ai.md#the-control-environment).

## Read These First (in order)

1. **[Workflow](workflow.md)** — the day-to-day loop (issue → worktree → commit → push → PR → CI → merge).
2. **[Worktrees](worktrees.md)** — how to create, resume, and clean up parallel worktrees.
3. **[Restrictions](restrictions.md)** — what is auto-approved vs. human-gated. Read this before you touch git remotes, secrets, schema, or releases.
4. **[Agents](agents.md)** + **[Agent Instructions](agent-instructions.md)** — the agent roster, each role's scope, and how reviewer roles differ.
5. **[Skills](skills.md)** — reusable domain knowledge bundles; load the relevant skill before solving a domain problem.
6. **[MCP Configuration](mcp.md)** — Model Context Protocol server setup (external tool access).
7. **[Fleet Operations](fleet-operations.md)** — how multiple agents run in parallel without colliding.
8. **[CI Monitoring](ci-monitoring.md)** — the correct `gh pr checks` pattern; remote CI is the source of truth.

For a quick command reference, see the [Workflow Cheat Sheet](../guides/workflow-cheatsheet.md).

## The Non-Negotiables

These are the rules that cause the most rework when skipped:

- **⚠️ Run the pre-push lint/format checklist before EVERY push.** `npm run format` → `npx eslint . --fix` → `npm run format:check && npx eslint . --max-warnings 0`. This is the #1 cause of avoidable CI failures. See [AGENTS.md](../../AGENTS.md#️-mandatory-pre-push-lint--format-never-skip).
- **Every PR targets `main`** with `--base main`. Never accumulate a program on a long-lived feature branch — it breaks staging auto-deploy and `Closes #N`. See [Fleet Operations § Branch & Merge Policy](fleet-operations.md#branch--merge-policy-mandatory).
- **`git push --force` is forbidden.** `--force-with-lease` is auto-approved **only** to re-push your **own** branch after a rebase/conflict resolution.
- **Never guess on financial logic.** Stop and document `## Needs Decision` — route to `@finance-domain` or a human.
- **Never commit secrets.** Use `.env.example` placeholders; see [Restrictions § Secrets](restrictions.md).
- **Definition of Done = merged to `main`** (or a green, `MERGEABLE` PR explicitly blocked with a `## Needs Human Action` note).

## Where Things Live

| Area                       | Location                                                                   | Source of truth                       |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| Agent definitions          | [`.github/agents/`](../../.github/agents/)                                 | The `*.agent.md` files                |
| Skills                     | [`.github/skills/`](../../.github/skills/)                                 | The `SKILL.md` files                  |
| Path-specific instructions | [`.github/instructions/`](../../.github/instructions/)                     | The `*.instructions.md` files         |
| Global instructions        | [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) | —                                     |
| Root agent guidance        | [`AGENTS.md`](../../AGENTS.md)                                             | Canonical policy for all AI tools     |
| MCP servers                | [`.vscode/mcp.json`](../../.vscode/mcp.json) · [mcp.md](mcp.md)            | `mcp.json` (config) / `mcp.md` (docs) |

> Counts drift quickly. Prefer counting the directory (or consulting the planned `ai-manifest`) over trusting a number written in prose. See the [CHANGELOG](CHANGELOG.md) for what changed and when.

## Reference by Role

- **Engineering agents** (`@kmp-engineer`, `@backend-engineer`, platform agents): [Agents](agents.md) → your row in the [ownership table](../../AGENTS.md#fleet-coordination-rules) → relevant [skill](skills.md).
- **Reviewers**: `@accessibility-reviewer` is **review-only**; `@security-reviewer` is the **emergency fixer**. See [Agent Instructions](agent-instructions.md#agent-types).
- **Orchestrator / fleet runs**: [Fleet Operations](fleet-operations.md).
- **Humans onboarding to the codebase**: start at the repo-wide [Documentation Index](../INDEX.md).

## Governance & Accountability

- [Responsible AI](responsible-ai.md) — principles, commitments, and the real control environment.
- [AI Governance](governance.md) — NIST AI RMF crosswalk and EU AI Act note, mapped to this repo's concrete controls.
- [Incident Response](incident-response.md) — what to do when an agent misbehaves (prompt injection, secret exposure, runaway merges, destructive ops).
- [AI Code Policy](ai-code-policy.md) — ownership, copyright, and contributor responsibilities.
- [AI Practice CHANGELOG](CHANGELOG.md) — how this practice has evolved.
- [AI-Practice Audit (2026-06)](audits/ai-practice-audit-2026-06.md) — the most recent point-in-time review of the AI practice.
