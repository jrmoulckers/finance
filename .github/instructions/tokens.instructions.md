---
applyTo: 'config/tokens/**'
---

# Instructions for Design Tokens

You are working in `config/tokens/`, owned by `@design-engineer` for design-token source/configuration inputs and Style Dictionary integration.

## Token System Rules

- Use DTCG-compatible JSON token shape (`$value`, `$type`, and references like `{color.blue.500}`) and keep the three-tier model: primitive → semantic → component.
- Add semantic purpose before platform output. Platform-specific values belong in generated outputs or component mappings, not in primitive tokens.
- Define light, dark, and high-contrast behavior for semantic color tokens, and include reduced-motion equivalents for motion/animation tokens.
- Validate color choices against WCAG 2.2 AA contrast and use color-vision-deficiency-safe palettes for financial charts/categories.
- Never convey financial state through color alone; pair color tokens with iconography, labels, or text patterns in consuming specs.

## Generated Output Rules

- Do not hand-edit generated Style Dictionary outputs. Update token sources/configuration, rerun the generator, and commit the regenerated files in their owning paths.
- Keep token names stable. Treat token removals or renames as breaking changes and document the migration path for platform consumers.
- Keep source token files focused by tier/domain (`primitive`, `semantic`, `component`) to avoid broad conflicts in fleet work.
