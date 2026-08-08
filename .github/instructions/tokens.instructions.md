---
applyTo: '**/tokens/**,**/*.tokens.json'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Design Tokens

Use these rules for design-token sources, token JSON, and generated token outputs.

## Token System Rules

- Prefer DTCG-compatible JSON shape: `$value`, `$type`, and references such as `{color.blue.500}`.
- Keep a clear tier model: primitive → semantic → component.
- Add semantic purpose before platform output; generated outputs or consuming components handle platform-specific values.
- Define light, dark, high-contrast, and reduced-motion behavior where the token category requires it.
- Validate color choices against WCAG 2.2 AA contrast and avoid relying on color alone to communicate state.
- Keep token names stable. Treat removals or renames as breaking changes and document migration paths.

## Generated Output Rules

- Do not hand-edit generated token outputs.
- Update token sources/configuration, rerun the repo's token generator, and commit regenerated files in their owning paths.
- Keep source token files focused by tier/domain to reduce conflicts during parallel work.
- Do not introduce product-specific brand values into the shared layer unless the token is explicitly generic or configurable.
