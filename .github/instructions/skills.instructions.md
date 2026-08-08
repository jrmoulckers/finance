---
applyTo: 'skills/**,.github/skills/**'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Skill Authoring

Canonical skills are authored under `skills/` in `jrmoulckers/.github` and materialized under
`.github/skills/` in opted-in consumers.

- Edit `skills/` only in the canonical backbone.
- Treat consumer `.github/skills/` copies as generated, upstream-owned, read-only assets. Route a
  reusable change to the backbone and resync it; put product-specific guidance in a documented local
  skill or scoped instruction instead.
- Root/local `AGENTS.md` and more-specific scoped instructions decide product applicability and may
  narrow these shared defaults.

## Skill File Schema

- Each canonical skill lives at `skills/<skill-name>/SKILL.md` and materializes as
  `.github/skills/<skill-name>/SKILL.md`; frontmatter `name` must match `<skill-name>`.
- Frontmatter includes a concise `description` with trigger language: "Use for topics related to ...".
- Start the body with `# <Skill Name> Skill`, then include `## Purpose` and `## Out of Scope` before detailed guidance.
- Keep each skill focused on durable knowledge, decision trees, checklists, examples, and constraints that apply across products.

## Authoring Rules

- Do not duplicate full procedures owned by `workflow.instructions.md`, `AGENTS.md`, or another skill; summarize and point to the canonical source.
- Prefer crisp tables, decision trees, and acceptance checklists over broad prose.
- Make trigger language specific enough for correct invocation without catching unrelated coding tasks.
- Keep security, privacy, accessibility, and data-handling constraints explicit when relevant.
- Avoid product-private URLs, product names, and stack mandates unless the skill is explicitly scoped by a product repo.
