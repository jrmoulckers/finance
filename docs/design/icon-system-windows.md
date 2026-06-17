# Windows icon system

The Windows app renders semantic `IconToken` values through `IconView`, using the pack selected by `icon_pack_id`.

## Sources

- Fluent UI System Icons: Microsoft `microsoft/fluentui-system-icons`, MIT license, 24px SVGs from `assets/<Icon Name>/SVG/ic_fluent_<name>_24_regular.svg` and `_filled.svg`.
- Lucide Standard pack: `lucide-static` SVG package, ISC license, files from `icons/<name>.svg`.

## Vendoring procedure

1. Add or update token mappings in `packages/core/src/commonMain/kotlin/com/finance/core/icons/mappings/`.
2. Download Fluent 24px regular and filled SVGs into:
   - `apps/windows/src/main/resources/icons/fluent-regular/`
   - `apps/windows/src/main/resources/icons/fluent-filled/`
3. Download Lucide SVGs into `apps/windows/src/main/resources/icons/lucide/`.
4. Run `:packages:core:allTests` and `:apps:windows:compileKotlin`.

Only a starter subset is vendored. `IconView` checks classpath resources before calling `painterResource` and falls back to a placeholder icon for mapped-but-not-yet-vendored SVGs. Some semantic tokens intentionally alias to the closest available Fluent glyph when the exact table name is not present in the upstream 24px set (for example, loan/balance-style finance tokens alias to `Money`, and piggy-bank aliases to `Savings`).
