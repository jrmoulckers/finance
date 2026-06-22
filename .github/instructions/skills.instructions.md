---
applyTo: '.github/skills/**'
---

# Instructions for Skill Authoring

You are working in `.github/skills/`, which contains reusable Finance domain knowledge invoked by trigger topics.

## Skill File Schema

- Each skill lives at `.github/skills/<skill-name>/SKILL.md`; the frontmatter `name` must match `<skill-name>`.
- Frontmatter must include a concise `description` that names trigger keywords or topics using "Use for topics related to ...".
- Start the body with `# <Skill Name> Skill`, then include `## Purpose` and `## Out of Scope` before detailed guidance.
- Keep each skill focused on durable domain knowledge, decision trees, checklists, examples, and repo-specific constraints.

## Authoring Rules

- Do not duplicate full procedures already owned by `workflow.instructions.md`, `AGENTS.md`, or another skill; summarize the rule and point to the canonical source.
- Prefer crisp tables, decision trees, and acceptance checklists over broad prose.
- Make trigger language specific enough that the skill is invoked for the right work and not for unrelated coding tasks.
- Keep security, privacy, accessibility, and financial-data handling constraints explicit when the skill touches user data or money movement.
