---
applyTo: 'agents/**,.github/agents/**'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Agent Definitions

You are working in canonical `agents/` or a consumer's materialized `.github/agents/`, which define
reusable custom agents and their operating boundaries. Author canonical changes under `agents/`;
consumer `.github/agents/` copies are generated and must not be edited directly.

The canonical schema below applies to backbone `agents/*.agent.md` and their generated consumer
copies. A member's `localAgents` names product-owned roles or explicit replacements that are not
copied. Those local files may use documented local schema extensions, additional frontmatter keys,
sections, tools, or a locally documented flat schema when root/scoped `AGENTS.md` says so; this
shared instruction does not make the canonical schema exclusive for declared local roles.

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
- Bare `@kebab-case` references resolve only to selected canonical names or names declared through
  the member's `localAgents`; both are integrity-checked for selection closure. Write GitHub account
  names as links or code without a bare `@` handle.
- Declare skill dependencies in the **Related skills** block and prompt dependencies as "the
  `<name>` prompt"; both forms are integrity-checked against each member's selected assets.
- A canonical slug and a local slug must never both be selected. A same-slug local replacement is
  valid only when `localAgents` declares it and the member's explicit canonical selection omits it.

## Content Expectations

Include the standard sections used by existing agents: Role, Capabilities, File Ownership, Workflow, Planning & Verification, Technical Context, Boundaries, and Human-Gated Operations.

Reference the applicable root/local `AGENTS.md` and selected workflow or infrastructure-operations
instruction instead of copying long procedures that can drift.

Make capabilities product-agnostic by default. Product repos may add stack, platform, domain, and ownership details in their own `AGENTS.md` or scoped instructions.

Root/local `AGENTS.md` and more-specific scoped instructions override shared defaults for routing,
schema extensions, paths, tools, and operational authority. They may not silently relax mandatory
human gates.

## Boundaries

- Be conservative with credentials, deployments, publishing, destructive operations, and user data.
- Do not claim ownership of another agent's paths without listing them under "Do NOT edit".
- Do not bypass security, privacy, accessibility, or CI requirements for speed.
