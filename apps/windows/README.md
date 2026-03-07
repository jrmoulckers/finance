# Finance — Windows Desktop Client

Compose Desktop (JVM) application for the Finance personal finance tracker on Windows.

## Prerequisites

- **JDK 21** — automatically provisioned by Gradle toolchain; no manual install required
- **Windows 10/11** — primary target platform

## Project Structure

```
apps/windows/
├── build.gradle.kts                         # Compose Desktop build config
├── README.md                                # This file
└── src/main/kotlin/com/finance/desktop/
    ├── Main.kt                              # Entry point — Window + application
    ├── FinanceApp.kt                        # Root composable shell
    └── theme/
        └── FinanceDesktopTheme.kt           # Material 3 theme from design tokens
```

## Quick Start

From the repository root:

```bash
# Run the desktop application
./gradlew :apps:windows:run

# Build an MSI installer
./gradlew :apps:windows:packageMsi
```

## Architecture

| Layer | Description |
|---|---|
| **UI** | Compose Desktop with Material 3 — Fluent Design-aligned typography (Segoe UI via system default) |
| **Theme** | `FinanceDesktopTheme` — light/dark color schemes mapped from `packages/design-tokens` |
| **Shared** | Depends on `:packages:core`, `:packages:models`, `:packages:sync` via JVM target |

## Design Tokens

Colors, typography, and spacing are sourced from the monorepo's shared design tokens:

- **Colors**: `packages/design-tokens/tokens/primitive/colors.json` + semantic light/dark mappings
- **Typography**: `packages/design-tokens/tokens/semantic/typography.json` — uses `FontFamily.Default` (Segoe UI on Windows)
- **Spacing**: `packages/design-tokens/tokens/primitive/spacing.json` — exposed via `FinanceDesktopTheme.spacing`

## Theme Usage

```kotlin
@Composable
fun MyScreen() {
    FinanceDesktopTheme {
        // Access Material 3 tokens
        val primary = MaterialTheme.colorScheme.primary
        val bodyStyle = MaterialTheme.typography.bodyLarge

        // Access custom spacing
        val padding = FinanceDesktopTheme.spacing.lg  // 16.dp
    }
}
```

## Accessibility

- Semantic annotations (`contentDescription`, `heading()`) on key UI elements for Narrator compatibility
- System dark/light theme detection via `isSystemInDarkTheme()`
- High contrast mode support planned for future iteration

## Distribution

MSI packages are generated via `./gradlew :apps:windows:packageMsi`. Future iterations will add:

- MSIX packaging and signing for Microsoft Store
- Windows Hello biometric authentication
- DPAPI secure credential storage
- System tray integration and toast notifications
