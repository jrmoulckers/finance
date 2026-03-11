# iOS Development Setup Guide

Complete guide for setting up, building, and developing the Finance iOS app.

## Prerequisites

### Required Tools

1. **Xcode 16.0+** — Download from the [Mac App Store](https://apps.apple.com/app/xcode/id497799835) or [Apple Developer](https://developer.apple.com/xcode/)
2. **macOS 14.0+ (Sonoma)** — Required for Xcode 16
3. **JDK 17+** — Required for building KMP shared modules via Gradle
4. **Command Line Tools** — Install via `xcode-select --install`

### Recommended Tools

- [SwiftLint](https://github.com/realm/SwiftLint) — Swift linting (`brew install swiftlint`)
- [Accessibility Inspector](https://developer.apple.com/documentation/accessibility/accessibility-inspector) — Built into Xcode (Xcode → Open Developer Tool)

## Opening the Project

### Using Swift Package (Current)

The project is currently structured as a Swift Package:

```bash
# From the repository root
open apps/ios/Package.swift
```

Xcode will open the package, resolve dependencies, and index the source files.

### Using Xcode Project (Future)

Once the `.xcodeproj` is created (to support embedded frameworks, entitlements,
provisioning, etc.), open the project directly:

```bash
open apps/ios/Finance.xcodeproj
```

## Building the App

### In Xcode

1. Open the project as described above
2. Select the **Finance** scheme in the toolbar
3. Choose a destination: **iPhone 16** simulator (iOS 17+)
4. Press **⌘B** to build or **⌘R** to build and run

### From Command Line

```bash
cd apps/ios

# Build for simulator
xcodebuild -scheme Finance \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  build

# Run tests
xcodebuild -scheme Finance \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  test
```

## Running on Simulator

1. Open Xcode and select a simulator destination (iPhone 16 recommended)
2. Press **⌘R** to build and run
3. The app launches with the placeholder `ContentView` showing the Finance branding

### Useful Simulator Shortcuts

| Shortcut | Action                       |
| -------- | ---------------------------- |
| ⌘R       | Build & Run                  |
| ⌘.       | Stop running app             |
| ⌃⌘Z      | Shake gesture (debug menu)   |
| ⌘1–⌘3    | Scale simulator window       |
| ⌘⇧A      | Toggle light/dark appearance |

## KMP Integration (Swift Export)

### How It Works

The Finance app shares business logic with Android and other platforms via
**Kotlin Multiplatform (KMP)**. The shared code lives in:

| KMP Module        | Purpose                          |
| ----------------- | -------------------------------- |
| `packages/core`   | Domain logic, use cases, DI      |
| `packages/models` | Data models, SQLDelight entities |
| `packages/sync`   | Supabase sync engine             |

KMP compiles Kotlin code to a native Apple framework (`.xcframework`) that
Swift imports directly — no bridging headers, no Objective-C interop needed.

### Type Mapping

| Kotlin Type                  | Swift Type            |
| ---------------------------- | --------------------- |
| `kotlin.String`              | `Swift.String`        |
| `kotlin.Int`                 | `Swift.Int32`         |
| `kotlin.Long`                | `Swift.Int64`         |
| `kotlin.Boolean`             | `Swift.Bool`          |
| `kotlin.collections.List<T>` | `Swift.Array<T>`      |
| `T?` (nullable)              | `Swift.Optional<T>`   |
| `sealed class`               | Swift enum (via SKIE) |
| `Flow<T>`                    | `AsyncSequence<T>`    |

### Building the KMP Framework

```bash
# From the repository root
./gradlew :packages:core:linkReleaseFrameworkIosArm64

# Or for simulator (x86_64 / arm64)
./gradlew :packages:core:linkDebugFrameworkIosSimulatorArm64
```

The output framework is placed in:

```
packages/core/build/bin/iosArm64/releaseFramework/core.framework
```

### Xcode Project Configuration (Future)

When the `.xcodeproj` is set up, the following build settings will be configured:

1. **Run Script Build Phase** — Invokes Gradle to build the KMP framework before
   Swift compilation:

   ```bash
   cd "$SRCROOT/../../"
   ./gradlew :packages:core:linkDebugFrameworkIosSimulatorArm64
   ```

2. **Framework Search Paths** — Points to the Gradle build output:

   ```
   FRAMEWORK_SEARCH_PATHS = $(SRCROOT)/../../packages/core/build/bin/iosSimulatorArm64/debugFramework
   ```

3. **Linker Flags** — Links system SQLite for SQLDelight:

   ```
   OTHER_LINKER_FLAGS = -lsqlite3
   ```

4. **User Script Sandboxing** — Disabled for the KMP build phase:
   ```
   ENABLE_USER_SCRIPT_SANDBOXING = NO
   ```

### Consuming KMP in Swift

Once integrated, shared KMP logic is imported like any Swift module:

```swift
import Core  // KMP shared module

@Observable
final class AccountsViewModel {
    private let getAccountsUseCase: GetAccountsUseCase
    var accounts: [Account] = []

    init(getAccountsUseCase: GetAccountsUseCase) {
        self.getAccountsUseCase = getAccountsUseCase
    }

    func loadAccounts() async {
        // KMP Flow → Swift AsyncSequence (via SKIE / KMP-NativeCoroutines)
        for await accountList in getAccountsUseCase.invoke() {
            self.accounts = accountList
        }
    }
}
```

### Kotlin Flow → Swift AsyncSequence

The recommended bridging approach uses **SKIE** (by Touchlab), which
automatically generates Swift-friendly wrappers for Kotlin coroutines:

```kotlin
// Kotlin (packages/core)
class GetAccountsUseCase(private val repo: AccountRepository) {
    fun invoke(): Flow<List<Account>> = repo.observeAccounts()
}
```

```swift
// Swift (apps/ios) — with SKIE, Flow becomes AsyncSequence
func loadAccounts() async {
    for await accounts in getAccountsUseCase.invoke() {
        self.accounts = accounts
    }
}
```

## Project Architecture

```
┌─────────────────────────────────────────┐
│              SwiftUI Views              │
│  (ContentView, AccountsView, etc.)      │
├─────────────────────────────────────────┤
│           @Observable ViewModels         │
│  (AccountsViewModel, BudgetViewModel)   │
├─────────────────────────────────────────┤
│          Platform Services (Swift)       │
│  (KeychainService, BiometricService)    │
├─────────────────────────────────────────┤
│        KMP Shared Framework (.xcf)      │
│  (Core UseCases, Models, Sync Engine)   │
├─────────────────────────────────────────┤
│           SQLDelight (Local DB)          │
│         Supabase (Remote Sync)          │
└─────────────────────────────────────────┘
```

## Accessibility Testing

The app is designed to be fully accessible. Test with:

1. **VoiceOver** — Settings → Accessibility → VoiceOver (or triple-click Side button)
2. **Dynamic Type** — Settings → Accessibility → Display & Text Size → Larger Text
3. **Accessibility Inspector** — Xcode → Open Developer Tool → Accessibility Inspector
4. **Switch Control** — Settings → Accessibility → Switch Control

## Troubleshooting

### "No such module 'Core'"

The KMP framework hasn't been built yet. Run:

```bash
./gradlew :packages:core:linkDebugFrameworkIosSimulatorArm64
```

### Build fails with "Unsupported Swift version"

Ensure you're using Xcode 16+ with Swift 5.9+:

```bash
swift --version   # Should show 5.9 or later
xcodebuild -version  # Should show Xcode 16.0 or later
```

### Simulator won't boot

Reset the simulator:

```bash
xcrun simctl shutdown all
xcrun simctl erase all
```
