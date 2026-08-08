---
applyTo: 'docs/**,*.md,**/README.md'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Documentation

Write documentation for humans first: clear, concise, accessible, and actionable.

This scope intentionally covers `docs/**`, root Markdown policy such as `AGENTS.md`, and nested
`README.md` files. It does not blanket-match every Markdown asset under `agents/`, `prompts/`,
`skills/`, or `instructions/`.

Root/local `AGENTS.md` and a more-specific scoped instruction override these shared defaults when
they apply to the same file. Generated assets are not local editing surfaces: consumer
`.github/agents/`, `.github/prompts/`, `.github/skills/`, and `.github/instructions/` copies remain
upstream-owned even when a nearby README is locally authored.

## Structure

- `docs/` is the default home for product documentation.
- Architecture Decision Records belong in `docs/architecture/` unless a product repo specifies another ADR location.
- Canonical agent, skill, prompt, and instruction documentation lives beside source assets under
  `agents/`, `skills/`, `prompts/`, and `instructions/`; consumer materializations live under the
  corresponding `.github/` paths and are read-only.
- Follow ownership in `AGENTS.md` and specialist agent files for substantive changes.

## Guidelines

- Use consistent Markdown heading hierarchy.
- Prefer relative links to sibling docs and source files.
- Include code examples only when they clarify usage.
- Update docs in the same PR as code when behavior or workflows change.
- Use Mermaid for diagrams when possible, or include editable source alongside images.
- Make docs accessible: descriptive link text, alt text for images, plain language, and no heading-level skips.
- Avoid product-private URLs, secrets, or environment-specific paths.
- Do not rewrite historical audit snapshots unless the task explicitly asks for an update.
