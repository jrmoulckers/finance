# iOS icon system

The iOS app mirrors the shared `IconToken` vocabulary from `packages/core` and renders through `IconView`.

- Preference key: `icon_pack_id` (`IconPackPreference.key`), matching `ICON_PACK_PREFERENCE_KEY` in KMP.
- Packs: `standard_lucide` and `ios_sf_symbols`.
- SF Symbols render with `Image(systemName:)` via `SFSymbolsMapping.swift`.
- Standard renders template SVGs from `Finance/Resources/Icons.xcassets/lucide` via asset names like `lucide.home`.

## Adding a new Lucide asset

1. Add the token to the shared KMP `IconToken` and mappings first.
2. Mirror the token in `apps/ios/Finance/Components/IconToken.swift`.
3. Add the SF Symbol to `SFSymbolsMapping.swift` and the Lucide icon name to `LucideMapping.swift`.
4. Copy the Lucide SVG from the `lucide-static` package into `apps/ios/Finance/Resources/Icons.xcassets/lucide/<name>.imageset/<name>.svg`.
5. Set the imageset `Contents.json` properties to preserve vectors and render as a template image so SwiftUI tint works.
6. Update `IconViewTests` to keep mapping completeness green.

`palm-tree` is currently sourced from Lucide's `tree-palm.svg` because the shared mapping uses `palm-tree` as the public asset name.

## Current iOS icon audit

Top hard-coded `Image(systemName:)` usages before migration:

1. `checkmark.circle.fill` (8)
2. `checkmark` (7)
3. `plus` (6)
4. `xmark.circle.fill` (5)
5. `plus.circle.fill` (3)
6. `chevron.right` (3)
7. `xmark` (2)
8. `exclamationmark.triangle.fill` (2)
9. `questionmark.circle.fill` (1)
10. `trophy.fill` (1)
11. `person.crop.circle.fill` (1)
12. `wifi.slash` (1)
13. `person.badge.plus` (1)
14. `lock.fill` (1)
15. `line.3.horizontal.decrease.circle` (1)
