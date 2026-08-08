---
applyTo: 'skills/**'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Skill Authoring

You are working in `skills/`, which contains reusable, product-agnostic task playbooks and durable domain guidance.

## Skill File Schema

- Each skill lives at `skills/<skill-name>/SKILL.md`; frontmatter `name` must match `<skill-name>`.
- Frontmatter includes a concise `description` with trigger language: "Use for topics related to ...".
- Start the body with `# <Skill Name> Skill`, then include `## Purpose` and `## Out of Scope` before detailed guidance.
- Keep each skill focused on durable knowledge, decision trees, checklists, examples, and constraints that apply across products.

## Authoring Rules

- Do not duplicate full procedures owned by `workflow.instructions.md`, `AGENTS.md`, or another skill; summarize and point to the canonical source.
- Prefer crisp tables, decision trees, and acceptance checklists over broad prose.
- Make trigger language specific enough for correct invocation without catching unrelated coding tasks.
- Keep security, privacy, accessibility, and data-handling constraints explicit when relevant.
- Avoid product-private URLs, product names, and stack mandates unless the skill is explicitly scoped by a product repo.
