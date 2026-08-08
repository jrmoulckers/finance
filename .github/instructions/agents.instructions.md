---
applyTo: '.github/agents/**'
---

# Instructions for Agent Definitions

You are working in `.github/agents/`, which defines Finance-specific custom agents and their operating boundaries.

## Canonical Preparation State

- The current 25 files remain authoritative until a later Studio sync atomically materializes the canonical roster. Preparation work must not delete, rename, or replace them.
- The planned state is 22 Studio-generated canonical definitions plus the Finance-authored `finance-domain.agent.md`.
- Product facts and path ownership belong in root `AGENTS.md` and scoped `.github/instructions/**`, not copied into generated role bodies.
- After activation, do not hand-edit Studio-generated agent files. Change canonical behavior in the backbone or Finance behavior in local overlays, then rematerialize through the approved Studio workflow.
- `bug-basher.agent.md` remains present only for runtime continuity before activation. Durable single-bug behavior belongs in `.github/prompts/bug-bash.prompt.md` and `.github/instructions/workflow.instructions.md`.

## Agent File Schema

- Each Finance-authored local file represents exactly one role and is named `<kebab-case-name>.agent.md`; the frontmatter `name` must match the filename stem.
- Frontmatter is YAML with **eight keys** (all agents in this repo use the full set):

  | Key             | Purpose                                                                                                                                                                                                                                                    |
  | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `name`          | Must match the filename stem (kebab-case).                                                                                                                                                                                                                 |
  | `description`   | One-line summary shown in the agent picker.                                                                                                                                                                                                                |
  | `model`         | Capability tier — `standard` or `strong-reasoning`.                                                                                                                                                                                                        |
  | `when_to_use`   | A sentence telling the orchestrator when to route to this agent.                                                                                                                                                                                           |
  | `primary_paths` | Glob(s) the agent leads or co-owns. Each must exist in the repo, or be flagged **net-new** in the File Ownership section.                                                                                                                                  |
  | `write_scope`   | `full`, `scoped-write`, or `read-only`.                                                                                                                                                                                                                    |
  | `risk_level`    | `low`, `medium`, or `high` — blast radius of the agent's writes.                                                                                                                                                                                           |
  | `tools`         | Minimal list from `read`, `edit`, `search`, `shell`. Grant `edit` only to agents that change code; grant `shell` only when the role needs command execution. A **review-only** agent may hold `shell` for read-only verification but MUST NOT hold `edit`. |

- Use one clear role per Finance-authored file. Do not combine implementation, review, and product responsibilities in a single agent definition.
- Keep `File Ownership` aligned with `AGENTS.md`; never claim paths owned by another agent without explicitly listing them under "Do NOT edit". Paths in `primary_paths` must exist, or be explicitly flagged as net-new in File Ownership.

## Content Expectations

- Include the standard sections used by existing agents: Role, Capabilities, File Ownership, Workflow, Planning & Verification, Technical Context, Boundaries, and Human-Gated Operations.
- Reference the canonical workflow instructions instead of copying long global procedures that can drift.
- Make capabilities repo-specific: cite Finance platforms, KMP/Supabase/PowerSync/Turborepo, accessibility, security, and privacy constraints when relevant.
- Keep boundaries actionable and conservative for financial data, credentials, publishing, deployments, and destructive operations.
- Canonical generation may use a different schema contract; validate generated files with Studio tooling rather than reshaping them to this local authoring template.
