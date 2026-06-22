---
applyTo: '.github/agents/**'
---

# Instructions for Agent Definitions

You are working in `.github/agents/`, which defines Finance-specific custom agents and their operating boundaries.

## Agent File Schema

- Each file represents exactly one role and is named `<kebab-case-name>.agent.md`; the frontmatter `name` must match the filename stem.
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

- Use one clear role per file. Do not combine implementation, review, and product responsibilities in a single agent definition.
- Keep `File Ownership` aligned with `AGENTS.md`; never claim paths owned by another agent without explicitly listing them under "Do NOT edit". Paths in `primary_paths` must exist, or be explicitly flagged as net-new in File Ownership.

## Content Expectations

- Include the standard sections used by existing agents: Role, Capabilities, File Ownership, Workflow, Planning & Verification, Technical Context, Boundaries, and Human-Gated Operations.
- Reference the canonical workflow instructions instead of copying long global procedures that can drift.
- Make capabilities repo-specific: cite Finance platforms, KMP/Supabase/PowerSync/Turborepo, accessibility, security, and privacy constraints when relevant.
- Keep boundaries actionable and conservative for financial data, credentials, publishing, deployments, and destructive operations.
