---
applyTo: 'docs/**'
---

# Instructions for Documentation

You are working in the `docs/` directory, which contains all project documentation.

## Documentation Subdirectories

- `docs/ai/` — AI development workflow documentation (agents, skills, MCP, instructions)
- `docs/architecture/` — System architecture, technical decisions, diagrams
- `docs/design/` — UI/UX design system, components, accessibility guidelines
- `docs/business/` — Business analysis, pricing strategy, competitive research, revenue modeling
- `docs/marketing/` — Go-to-market strategy, app store optimization, launch communications

## Guidelines

- Write documentation for humans first, AI second — clear, concise, actionable
- Use consistent Markdown formatting and heading hierarchy
- Include code examples where they clarify concepts
- Keep documentation up to date with code changes (update docs in the same PR as code)
- Use relative links to reference other docs and source files
- Architecture Decision Records (ADRs) go in docs/architecture/ with sequential numbering
- All diagrams should be in Mermaid format (renders in GitHub) or have accompanying source files
- Documentation must be accessible: use alt text for images, clear heading structure, plain language
