# Web icon tokens

The web icon layer mirrors the shared KMP `IconToken` vocabulary and includes complete mappings for Standard Lucide, Material Symbols (Outlined/Rounded/Sharp), and Fluent UI System Icons (Regular/Filled).

Use `<Icon name={IconToken.HOME} />` from `components/common/Icon` so web UI follows the user's `icon_pack_id` preference. SF Symbols remain unsupported on web and fall back to Standard Lucide.

See [`docs/design/icon-system.md`](../../../../docs/design/icon-system.md) for the native per-OS iconography strategy, pack rules, defaults, and cross-platform mapping tables.
