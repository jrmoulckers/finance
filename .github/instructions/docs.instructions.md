---
applyTo: 'docs/**'
---

# Instructions for Documentation

You are working in the `docs/` directory, which contains all project documentation.

## Documentation Subdirectories

`docs/` is owned by `@docs-writer` by default; several subdirectories are **led by a specialist agent** (see the ownership note below).

| Subdirectory                     | Contents                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `docs/ai/`                       | AI development workflow — agents, skills, MCP, instructions, prompts (+ `docs/ai/audits/`)                  |
| `docs/architecture/`             | System architecture, technical decisions, ADRs (sequential numbering)                                       |
| `docs/design/`                   | UI/UX design system, components, accessibility guidelines                                                   |
| `docs/business/`                 | Business docs, subdivided: `roadmap/`, `sprints/`, `pricing/`, `revenue/`, `growth/`, `marketing/`          |
| `docs/marketing/`                | Go-to-market strategy, app store optimization, launch communications                                        |
| `docs/compliance/`               | Regulatory obligation matrix, jurisdictional data-residency, GDPR/CCPA corpus                               |
| `docs/security/`                 | Security reviews, threat models, transparency reports                                                       |
| `docs/legal/`                    | Licensing, terms, and other legal documentation                                                             |
| `docs/ops/`                      | Operations runbooks (e.g., CI-workflow rationale)                                                           |
| `docs/guides/`                   | How-to guides (onboarding, rollback, app-store submission)                                                  |
| `docs/audits/`                   | Point-in-time audit snapshots (feature parity, practice reviews) — historical; do not rewrite retroactively |
| `docs/testing/`                  | Test plans, QA scenarios, alpha/beta guidance                                                               |
| `docs/alpha/`                    | Alpha / early-access program notes                                                                          |
| `docs/auth/`                     | Authentication and account documentation                                                                    |
| `docs/research/`                 | Research notes and explorations                                                                             |
| `docs/android/`, `docs/windows/` | Platform-specific documentation                                                                             |

### Ownership

`docs/` defaults to `@docs-writer`. Specialist carve-outs (the ownership table in `AGENTS.md` is the authoritative source):

- `docs/architecture/` → `@architect`
- `docs/compliance/` → `@compliance-specialist`
- `docs/business/roadmap/`, `docs/business/sprints/` → `@product-manager`
- `docs/business/pricing/`, `docs/business/revenue/` → `@business-analyst`
- `docs/marketing/`, `docs/business/marketing/` → `@marketing-strategist`
- `docs/analytics/`, `docs/business/growth/` → `@data-engineer`
- `docs/i18n/` → `@localization-engineer`

When a subdirectory has a specialist owner, route substantive content changes through that agent; `@docs-writer` maintains structure, cross-links, and the default areas.

## Guidelines

- Write documentation for humans first, AI second — clear, concise, actionable
- Use consistent Markdown formatting and heading hierarchy
- Include code examples where they clarify concepts
- Keep documentation up to date with code changes (update docs in the same PR as code)
- Use relative links to reference other docs and source files
- Architecture Decision Records (ADRs) go in docs/architecture/ with sequential numbering
- All diagrams should be in Mermaid format (renders in GitHub) or have accompanying source files
- Documentation must be accessible: use alt text for images, clear heading structure, plain language
