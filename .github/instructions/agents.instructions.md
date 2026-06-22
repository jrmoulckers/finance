---
applyTo: '.github/agents/**'
---

# Instructions for Agent Definitions

You are working in `.github/agents/`, which defines Finance-specific custom agents and their operating boundaries.

## Agent File Schema

- Each file represents exactly one role and is named `<kebab-case-name>.agent.md`; the frontmatter `name` must match the filename stem.
- Frontmatter must include `name`, a concise `description`, and a minimal `tools` list. Grant `shell` only when the role genuinely needs command execution.
- Use one clear role per file. Do not combine implementation, review, and product responsibilities in a single agent definition.
- Keep `File Ownership` aligned with `AGENTS.md`; never claim paths owned by another agent without explicitly listing them under "Do NOT edit".

## Content Expectations

- Include the standard sections used by existing agents: Role, Capabilities, File Ownership, Workflow, Planning & Verification, Technical Context, Boundaries, and Human-Gated Operations.
- Reference the canonical workflow instructions instead of copying long global procedures that can drift.
- Make capabilities repo-specific: cite Finance platforms, KMP/Supabase/PowerSync/Turborepo, accessibility, security, and privacy constraints when relevant.
- Keep boundaries actionable and conservative for financial data, credentials, publishing, deployments, and destructive operations.
