---
name: design-tokens
description: >
  Design token system guidance for the Finance app. Use for topics related to
  DTCG tokens, Style Dictionary, color tokens, semantic tokens, component
  tokens, chart palettes, typography, spacing, motion, contrast, theming, or
  generated token outputs.
---

# Design Tokens Skill

## Purpose

This skill covers **design-token authoring and consumption patterns** for Finance: primitive → semantic → component token layers, accessible color systems, typography/spacing/motion tokens, and generated platform outputs.

## Out of Scope

- Component-level UI implementation in apps → use the relevant platform engineering skill.
- Manual QA or accessibility test execution → use `ux-testing` or `accessibility-testing`.
- Marketing/app-store visual copy → use `go-to-market`.
- Performance budgets for token output size → use `performance-budgets`.

## Related Skills

| Skill                   | Use For                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `accessibility-testing` | Validating contrast, reduced motion, focus visibility         |
| `ux-testing`            | Manual visual QA and interaction bug discovery                |
| `i18n-localization`     | Text expansion, locale-specific typography, number formatting |
| `performance-budgets`   | Bundle/CSS budget impact from token outputs                   |

## Repo-Specific Paths

| Path                                          | Purpose                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `.github/instructions/tokens.instructions.md` | Canonical token authoring rules for `config/tokens/**`           |
| `config/tokens/**`                            | Token source/config location when token source files are present |
| `apps/web/src/theme/tokens.css`               | Current web CSS token consumer/output                            |
| `apps/web/src/icons/tokens.ts`                | Icon sizing/stroke token consumer                                |

## Token Model

| Layer     | Owns                                     | Example                                     |
| --------- | ---------------------------------------- | ------------------------------------------- |
| Primitive | Raw palette/scale values                 | `color.blue.500`, `space.4`, `font.size.16` |
| Semantic  | Product meaning and theme adaptation     | `color.status.positive.fg`, `surface.card`  |
| Component | Component-specific aliases and overrides | `button.primary.bg`, `chart.axis.label`     |

## Authoring Rules

- Use DTCG-compatible JSON shape (`$value`, `$type`) and token references (`{color.blue.500}`).
- Define light, dark, and high-contrast behavior for semantic color tokens.
- Add reduced-motion alternatives for motion/animation tokens.
- Keep financial state accessible: pair color tokens with iconography, labels, patterns, or text.
- Treat token removals/renames as breaking changes; document migration notes for platform consumers.
- Do not hand-edit generated Style Dictionary outputs; update source/config and regenerate.

## Finance-Specific Checks

- Positive/negative/neutral financial values remain distinguishable under color-vision deficiencies.
- Chart/category palettes support enough distinct categories without relying solely on hue.
- Focus ring tokens meet contrast in all themes and remain visible over card/list surfaces.
- Currency and amount typography preserves alignment and digit readability at large font sizes.
