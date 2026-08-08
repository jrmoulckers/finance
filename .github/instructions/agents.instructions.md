---
applyTo: 'agents/**,.github/agents/**'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Agent Definitions

You are working in canonical `agents/` or a consumer's materialized `.github/agents/`, which define
reusable custom agents and their operating boundaries. Author canonical changes under `agents/`;
consumer `.github/agents/` copies are generated and must not be edited directly.

## Agent File Schema

- Each file represents exactly one role and is named `<kebab-case-name>.agent.md`; frontmatter `name` must match the filename stem.
- Frontmatter is YAML with these keys unless a product repo explicitly extends the schema:

  | Key | Purpose |
  | --- | --- |
  | `name` | Filename stem in kebab-case. |
  | `description` | One-line summary shown in the agent picker. |
  | `model` | Capability tier, usually `standard` or `strong-reasoning`. |
  | `when_to_use` | Routing guidance for the orchestrator. |
  | `primary_paths` | Globs the agent leads or co-owns. |
  | `write_scope` | `full`, `scoped-write`, or `read-only`. |
  | `risk_level` | `low`, `medium`, or `high`. |
  | `tools` | Minimal required tools from `read`, `edit`, `search`, `shell`. |

- Use one clear role per file. Do not combine implementation, review, and product ownership in one agent.
- Keep `primary_paths` aligned with `AGENTS.md`; paths must exist or be called out as net-new in File Ownership.
- Grant `edit` only to agents that change files. Review-only agents may use `shell` for read-only verification but must not have `edit`.
- Bare `@kebab-case` references are reserved for canonical agent names and are integrity-checked.
  Write GitHub account names as links or code without a bare `@` handle.
- Declare skill dependencies in the **Related skills** block and prompt dependencies as "the
  `<name>` prompt"; both forms are integrity-checked against each member's selected assets.

## Content Expectations

Include the standard sections used by existing agents: Role, Capabilities, File Ownership, Workflow, Planning & Verification, Technical Context, Boundaries, and Human-Gated Operations.

Reference `workflow.instructions.md` and `AGENTS.md` instead of copying long global procedures that can drift.

Make capabilities product-agnostic by default. Product repos may add stack, platform, domain, and ownership details in their own `AGENTS.md` or scoped instructions.

## Boundaries

- Be conservative with credentials, deployments, publishing, destructive operations, and user data.
- Do not claim ownership of another agent's paths without listing them under "Do NOT edit".
- Do not bypass security, privacy, accessibility, or CI requirements for speed.
