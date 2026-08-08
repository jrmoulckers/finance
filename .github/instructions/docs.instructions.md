---
applyTo: 'docs/**,**/*.md'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Documentation

Write documentation for humans first: clear, concise, accessible, and actionable.

## Structure

- `docs/` is the default home for product documentation.
- Architecture Decision Records belong in `docs/architecture/` unless a product repo specifies another ADR location.
- Agent, skill, prompt, and instruction documentation lives beside those assets at repo root unless a product repo overrides the layout.
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
