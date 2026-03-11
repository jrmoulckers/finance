# Finance — iOS App

Native Apple platform experience for the Finance multi-platform financial tracking application, built with **SwiftUI** and powered by **Kotlin Multiplatform (KMP)** shared logic.

## Requirements

| Tool       | Version | Notes                                    |
| ---------- | ------- | ---------------------------------------- |
| Xcode      | 16.0+   | Required for iOS 17 SDK and Swift 5.9+   |
| macOS      | 14.0+   | Sonoma or later                          |
| iOS Target | 17.0+   | Minimum deployment target                |
| watchOS    | 10.0+   | Companion app target                     |
| Swift      | 5.9+    | Required for `@Observable`, Swift macros |
| JDK        | 17+     | Required for KMP / Gradle builds         |

## Project Structure

```
apps/ios/
├── Package.swift                  # Swift Package manifest
├── Finance/
│   ├── FinanceApp.swift           # @main SwiftUI App entry point
│   ├── ContentView.swift          # Root view (placeholder)
│   ├── Info.plist                 # App configuration & privacy
│   └── Theme/
│       ├── FinanceColors.swift    # Color palette from design tokens
│       ├── FinanceTypography.swift # Type scale from design tokens
│       └── FinanceSpacing.swift   # Spacing & radius from design tokens
└── README.md                      # This file
```

## Getting Started

### 1. Open in Xcode

```bash
open apps/ios/Package.swift
```

Xcode will resolve the Swift Package and index the project. When the Xcode project (`.xcodeproj`) is created later, open that instead.

### 2. Build

Build the app using Xcode's **Product → Build** (⌘B), or from the command line:

```bash
cd apps/ios
xcodebuild -scheme Finance -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

### 3. Run on Simulator

Select an **iPhone 16** (or any iOS 17+ simulator) in Xcode's destination picker
and press **⌘R** to run.

## Design Tokens

The theme files (`FinanceColors`, `FinanceTypography`, `FinanceSpacing`) are
hand-mapped from the generated design tokens in `packages/design-tokens/`.

| Theme File                | Token Source                                                            |
| ------------------------- | ----------------------------------------------------------------------- |
| `FinanceColors.swift`     | `tokens/primitive/colors.json` + `tokens/semantic/`                     |
| `FinanceTypography.swift` | `tokens/primitive/typography.json` + `tokens/semantic/typography.json`  |
| `FinanceSpacing.swift`    | `tokens/primitive/spacing.json` + `tokens/primitive/border-radius.json` |

Colors support **light and dark mode** automatically using adaptive `UIColor` /
`NSColor` resolution.

## KMP Integration (Planned)

The app will consume shared business logic from the KMP modules:

- **`packages/core`** — Domain logic, use cases
- **`packages/models`** — Data models (SQLDelight entities)
- **`packages/sync`** — Supabase sync engine

Integration will use **Swift Export** (or KMP-NativeCoroutines / SKIE) to bridge
Kotlin `Flow` → Swift `AsyncSequence`. See
[`docs/guides/ios-setup.md`](../../docs/guides/ios-setup.md) for detailed
integration instructions.

## Architecture Principles

- **SwiftUI only** — No UIKit unless wrapping a component with no SwiftUI equivalent
- **`@Observable`** — All view models use the Observation framework (iOS 17+)
- **Keychain for secrets** — All tokens and keys stored in Apple Keychain
- **Dynamic Type** — All text uses system font styles; no hardcoded sizes
- **VoiceOver** — Every interactive element has an accessibility label
- **Edge-first** — All reads/writes go to local SQLite (KMP) first; full offline support
