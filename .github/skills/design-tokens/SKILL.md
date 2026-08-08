---
name: design-tokens
description: >
  Design token system guidance. Use for topics related to DTCG tokens, color
  tokens, semantic tokens, component tokens, typography, spacing, motion,
  contrast, theming, token pipelines, or generated token outputs.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Design Tokens Skill

**Trigger:** token authoring, color/semantic/component tokens, typography/spacing/motion,
contrast, theming, generated token outputs.
**Inputs:** token source, platforms in scope, themes/modes, affected components, migration risk.
**Related:** `accessibility-testing` (contrast/motion validation), `ux-testing` (visual QA),
`i18n-localization` (text expansion), `performance-budgets` (token output size).

## Out of scope

- Component implementation → use the relevant engineering skill.
- Manual QA or WCAG test execution → use `ux-testing` or `accessibility-testing`.
- Marketing visuals or launch copy → use `go-to-market`.
- Bundle-budget decisions for generated outputs → use `performance-budgets`.

## Token model

| Layer | Owns | Example |
| --- | --- | --- |
| Primitive | Raw palette/scale values | `color.blue.500`, `space.4`, `font.size.16` |
| Semantic | Product meaning and theme adaptation | `color.status.success.fg`, `surface.card` |
| Component | Component aliases and overrides | `button.primary.bg`, `chart.axis.label` |

## Method

1. **Start at source** — edit the design-token source, not generated outputs.
2. **Separate layers** — primitive values feed semantic decisions; components consume semantic aliases.
3. **Cover modes** — define light, dark, high-contrast, and reduced-motion behavior where relevant.
4. **Avoid color-only meaning** — pair status colors with text, iconography, patterns, or labels.
5. **Protect consumers** — treat token removals/renames as breaking changes and include migration notes.
6. **Regenerate consistently** — run the product's token pipeline and verify platform outputs.
7. **Validate visually** — check focus rings, disabled states, data visualization palettes, and text scaling.

## Platform notes

| Platform | Check |
| --- | --- |
| Web | CSS variables/theme bridge, contrast, reduced motion, bundle impact |
| iOS | native color/font mapping, Dynamic Type, high contrast |
| Android | Material/theme mapping, font scaling, minimum touch target tokens |
| Desktop | high contrast, keyboard focus, window resizing |

> Keep only the platforms in scope. Drop rows that don't apply.

## Safety

Do not hand-edit generated token artifacts or silently break token names consumed by the product.
Route accessibility concerns to `accessibility-testing` when validation is required.

## Output

A token change plan or review with affected layers, platforms, generated outputs, validation evidence,
and migration notes for breaking changes.
