---
applyTo: 'tokens/**,packages/tokens/**,vendor/@jrm/tokens/**,**/vendor/@jrm/tokens/**,**/*.tokens.json'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Instructions for Design Tokens

Use these rules for design-token source trees, token JSON, and generated outputs in the repository
that owns them. A local product overlay wins when it identifies the actual source, generated,
`dist/**`, or `vendor/**` paths for that repository.

## Ownership

- Source files are edited only in the owning token repository and path. For shared `@jrm/tokens`,
  that owner is `jrmoulckers/studio`; this backbone only records the sync contract.
- `dist/**`, generated files, and `vendor/**` are outputs, never alternate source trees. Do not
  hand-edit them.
- In consumer repositories, generated, vendored, provenance-stamped, and sync-owned token outputs
  are always read-only. Route a source change to the Studio/token owner, regenerate there, then use
  the studio sync flow to update consumers.
- A consumer-specific token belongs in the source path named by that product's root/scoped
  authority, not inside `vendor/@jrm/tokens` or another synced output.

## Token System Rules

- Prefer DTCG-compatible JSON shape: `$value`, `$type`, and references such as `{color.blue.500}`.
- Keep a clear tier model: primitive → semantic → component.
- Add semantic purpose before platform output; generated outputs or consuming components handle platform-specific values.
- Define light, dark, high-contrast, and reduced-motion behavior where the token category requires it.
- Validate color choices against WCAG 2.2 AA contrast and avoid relying on color alone to communicate state.
- Keep token names stable. Treat removals or renames as breaking changes and document migration paths.
- **Treat a changed token *value* as an announced change, not a routine update.** A rename or removal
  is the loud failure: consumers stop compiling and someone investigates. A value shift is the quiet
  one — every consumer still builds, every test still passes, and the rendered result moves. The
  ceremony belongs on the case that cannot announce itself.

### Announcing a token value change

The sync engine mirrors `dist/` verbatim and cannot tell a shifted value from an added file; both
arrive in the member PR's **Updated** list as a path. So the announcement has to come from the
owning repository, which is the only place that knows a value moved.

When a value changes in `jrmoulckers/studio`:

- State it in the change's own PR body and release notes as a **value shift**, with a before/after
  table of the affected tokens. Naming the tier is not enough — `spacing.md: 12px → 16px` is the
  reviewable unit.
- Say explicitly whether names were preserved. "Names stable, values moved" is the sentence a member
  needs, because it tells them the compile-clean path is the risky one.
- Call out visual-regression surfaces the member should re-check: spacing and radius shifts move
  layout, color shifts move contrast ratios and can break a WCAG 2.2 AA result that previously
  passed.

A member receiving a `chore(sync)` PR that touches `vendor/@jrm/tokens/**` should assume values may
have moved and verify visually before merging. An entry in **Updated** means the bytes changed; it
does not mean only additions arrived.

## Generated Output Rules

- Do not hand-edit generated token outputs.
- In the owning repository only, update token sources/configuration, rerun its documented generator,
  and commit regenerated files in their owning output paths.
- Keep source token files focused by tier/domain to reduce conflicts during parallel work.
- Do not introduce product-specific brand values into the shared layer unless the token is explicitly generic or configurable.
