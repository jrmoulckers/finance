# Finance — iOS App

Native Apple platform experience for the Finance multi-platform financial tracking application, built with **SwiftUI** and powered by **Kotlin Multiplatform (KMP)** shared logic.

## Table of Contents

- [Requirements](#requirements)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Mock Data & SwiftUI Previews](#mock-data--swiftui-previews)
- [Localization](#localization)
- [Biometric Authentication](#biometric-authentication)
- [Testing](#testing)
- [Design Tokens](#design-tokens)
- [KMP Integration](#kmp-integration)
- [Architecture Principles](#architecture-principles)

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
├── Package.swift                          # Swift Package manifest (app + test targets)
├── Finance/
│   ├── FinanceApp.swift                   # @main SwiftUI App entry point
│   ├── ContentView.swift                  # Root view with tab navigation
│   ├── Info.plist                         # App configuration & privacy
│   ├── Models/                            # Shared model types
│   │   ├── AccountItem.swift              # Account, AccountGroup, AccountTypeUI
│   │   ├── TransactionItem.swift          # TransactionItem, TransactionType, Status
│   │   ├── BudgetItem.swift               # BudgetItem with computed progress
│   │   ├── GoalItem.swift                 # GoalItem with status tracking
│   │   └── PickerOption.swift             # Reusable picker option model
│   ├── Repositories/                      # Protocol-based data access layer
│   │   ├── AccountRepository.swift        # Protocol: getAccounts, getAccount, delete
│   │   ├── TransactionRepository.swift    # Protocol: CRUD + filtering
│   │   ├── BudgetRepository.swift         # Protocol: getBudgets
│   │   ├── GoalRepository.swift           # Protocol: getGoals
│   │   └── Mocks/                         # Mock implementations for dev/previews
│   │       ├── MockAccountRepository.swift
│   │       ├── MockTransactionRepository.swift
│   │       ├── MockBudgetRepository.swift
│   │       └── MockGoalRepository.swift
│   ├── ViewModels/                        # @Observable ViewModels (one per screen)
│   │   ├── DashboardViewModel.swift
│   │   ├── AccountsViewModel.swift
│   │   ├── AccountDetailViewModel.swift
│   │   ├── TransactionsViewModel.swift
│   │   ├── TransactionCreateViewModel.swift
│   │   ├── BudgetsViewModel.swift
│   │   ├── GoalsViewModel.swift
│   │   └── SettingsViewModel.swift
│   ├── Screens/                           # Full-screen SwiftUI views
│   │   ├── DashboardView.swift
│   │   ├── AccountsView.swift
│   │   ├── AccountDetailView.swift
│   │   ├── TransactionsView.swift
│   │   ├── TransactionCreateView.swift
│   │   ├── BudgetsView.swift
│   │   ├── GoalsView.swift
│   │   ├── SettingsView.swift
│   │   └── LockScreenView.swift           # Biometric auth gate overlay
│   ├── Security/                          # Auth & security managers
│   │   ├── BiometricAuthManager.swift     # Face ID / Touch ID wrapper
│   │   ├── KeychainManager.swift
│   │   ├── AppleSignInManager.swift
│   │   └── UniversalLinkHandler.swift
│   ├── Navigation/
│   │   └── MainTabView.swift              # Tab bar navigation controller
│   ├── Components/                        # Reusable UI components
│   │   ├── CurrencyLabel.swift
│   │   ├── EmptyStateView.swift
│   │   └── ProgressRing.swift
│   ├── Accessibility/                     # Accessibility utilities
│   ├── Charts/                            # Swift Charts visualizations
│   ├── Theme/                             # Design tokens
│   │   ├── FinanceColors.swift
│   │   ├── FinanceTypography.swift
│   │   └── FinanceSpacing.swift
│   └── Resources/
│       └── en.lproj/
│           ├── Localizable.strings        # 228 user-facing string keys
│           └── InfoPlist.strings           # Privacy descriptions
├── Tests/                                 # Unit test target (FinanceTests)
│   ├── TestHelpers.swift                  # Stub repositories & sample data
│   ├── AccountsViewModelTests.swift
│   ├── TransactionsViewModelTests.swift
│   ├── TransactionCreateViewModelTests.swift
│   ├── DashboardViewModelTests.swift
│   ├── BudgetsViewModelTests.swift
│   ├── GoalsViewModelTests.swift
│   ├── ModelTests.swift                   # Model computed properties
│   └── CurrencyFormattingTests.swift
├── FinanceWatch/                          # watchOS companion app
└── README.md                              # This file
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

### 4. Run Tests

```bash
cd apps/ios
swift test
```

Or using `xcodebuild`:

```bash
cd apps/ios
xcodebuild -scheme Finance -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' test
```

See [Testing](#testing) for details on test architecture and coverage.

## Architecture

The app follows the **MVVM (Model–View–ViewModel)** pattern with protocol-based
dependency injection. The data flow is:

```
┌──────────────────────────────────────────────────┐
│                  SwiftUI Views                   │
│  (DashboardView, AccountsView, GoalsView, etc.) │
├──────────────────────────────────────────────────┤
│             @Observable ViewModels               │
│  (DashboardViewModel, AccountsViewModel, etc.)   │
├──────────────────────────────────────────────────┤
│           Repository Protocols (Swift)           │
│  (AccountRepository, TransactionRepository, …)   │
├──────────────────────┬───────────────────────────┤
│  MockRepository      │  KMP-backed Repository   │
│  (development/tests) │  (future, via Swift Export)│
├──────────────────────┴───────────────────────────┤
│          Platform Services (Swift)               │
│  (BiometricAuthManager, KeychainManager)         │
├──────────────────────────────────────────────────┤
│         KMP Shared Framework (.xcf)              │
│  (Core UseCases, Models, Sync Engine)            │
├──────────────────────────────────────────────────┤
│            SQLDelight (Local DB)                 │
│          Supabase (Remote Sync)                  │
└──────────────────────────────────────────────────┘
```

**Data flow:** `View` → `ViewModel` → `Repository Protocol` → `MockRepository`
(current) or KMP-backed implementation (future).

Each ViewModel:

- Is annotated with `@Observable` and `@MainActor`
- Accepts its repository dependency via `init` (constructor injection)
- Exposes published state that views bind to directly
- Handles async loading, error states, and user actions

### Adding a New Screen

1. **Define the model** — Add a new file in `Models/` with the data type
2. **Define the repository protocol** — Create a protocol in `Repositories/` with `async throws` methods
3. **Implement the mock** — Add a `Mock*Repository` in `Repositories/Mocks/` with sample data
4. **Create the ViewModel** — Add an `@Observable @MainActor` class in `ViewModels/` that takes the repository protocol
5. **Build the view** — Create the SwiftUI view in `Screens/`, instantiating the ViewModel with a mock repository
6. **Add tests** — Write tests in `Tests/` using a stub repository (see [Testing](#testing))

Example ViewModel pattern:

```swift
@Observable
@MainActor
final class MyScreenViewModel {
    private let repository: MyRepository

    var items: [MyItem] = []
    var isLoading = false

    init(repository: MyRepository) {
        self.repository = repository
    }

    func loadItems() async {
        isLoading = true
        defer { isLoading = false }
        do {
            items = try await repository.getItems()
        } catch {
            items = []
        }
    }
}
```

## Mock Data & SwiftUI Previews

Every repository has a mock implementation in `Repositories/Mocks/` that returns
hardcoded sample data. These mocks serve two purposes:

1. **SwiftUI Previews** — Views can be previewed without network or database access
2. **Development** — The app runs with realistic data before KMP integration is complete

Mock repositories are plain structs conforming to the repository protocol:

```swift
struct MockAccountRepository: AccountRepository {
    func getAccounts() async throws -> [AccountItem] {
        // Returns hardcoded sample accounts
    }
}
```

When KMP integration is complete, the mock implementations will be swapped for
KMP-backed repositories — no changes needed to ViewModels or Views.

## Localization

All user-facing strings use the `String(localized:)` API introduced in iOS 15.
String keys match the literal English text, making source code readable without
lookup tables.

| File                                            | Contents                          |
| ----------------------------------------------- | --------------------------------- |
| `Resources/en.lproj/Localizable.strings`        | 228 string keys covering all screens |
| `Resources/en.lproj/InfoPlist.strings`           | Privacy usage descriptions (Face ID) |

### Adding a New String

1. Use `String(localized:)` in Swift code with the English text as the key:
   ```swift
   Text(String(localized: "My new label"))
   ```
2. Add the corresponding entry in `Localizable.strings`:
   ```
   "My new label" = "My new label";
   ```
3. To add a new language, create a new `.lproj` directory (e.g., `es.lproj/`)
   with translated versions of both `.strings` files.

## Biometric Authentication

The app supports **Face ID**, **Touch ID**, and **Optic ID** via the
`LocalAuthentication` framework, managed by `BiometricAuthManager`.

### App Lock

When enabled in Settings, a full-screen `LockScreenView` overlay gates access
to the app:

- **On launch** — The lock screen appears and triggers authentication automatically
- **On background return** — The app re-locks when entering the background
- **Manual retry** — A button allows the user to retry if authentication fails or is cancelled
- **Passcode fallback** — Uses `.deviceOwnerAuthentication` policy, which falls back to the device passcode

The lock preference is stored as a boolean in `UserDefaults` (non-sensitive).

### Sensitive Operations

Beyond the app lock gate, biometric authentication is also used to gate sensitive
operations such as exporting financial data and viewing full account numbers.

### Key Files

| File                        | Purpose                                    |
| --------------------------- | ------------------------------------------ |
| `Security/BiometricAuthManager.swift` | Face ID / Touch ID / Optic ID wrapper |
| `Screens/LockScreenView.swift`       | Full-screen biometric lock gate       |
| `ViewModels/SettingsViewModel.swift`  | Toggle for enabling/disabling app lock |

## Testing

The test target `FinanceTests` is defined in `Package.swift` and covers
ViewModels, model computed properties, and currency formatting.

### Test Architecture

Tests use **stub repositories** (defined in `TestHelpers.swift`) for dependency
injection. Each stub is a class conforming to the repository protocol with
configurable return values and error injection:

```swift
let repo = StubAccountRepository()
repo.accountsToReturn = SampleData.allAccounts
let vm = AccountsViewModel(repository: repo)

await vm.loadAccounts()
XCTAssertFalse(vm.accountGroups.isEmpty)
```

Stubs also record method calls for verification:

```swift
await vm.deleteAccount(id: "a1")
XCTAssertEqual(repo.deletedAccountIds, ["a1"])
```

### Coverage

| Test File                              | What It Tests                            |
| -------------------------------------- | ---------------------------------------- |
| `AccountsViewModelTests.swift`         | Loading, grouping by type, deletion      |
| `DashboardViewModelTests.swift`        | Aggregated balances, recent transactions |
| `TransactionsViewModelTests.swift`     | Filtering, sorting, deletion             |
| `TransactionCreateViewModelTests.swift`| Validation, creation, account loading    |
| `BudgetsViewModelTests.swift`          | Budget loading, progress calculations    |
| `GoalsViewModelTests.swift`            | Goal loading, status filtering           |
| `ModelTests.swift`                     | Computed properties on model types       |
| `CurrencyFormattingTests.swift`        | Minor-units-to-display formatting        |
| `TestHelpers.swift`                    | Stub repos, sample data, test error enum |

**68 test cases** across 9 test files.

### Running Tests

```bash
# Using Swift Package Manager
cd apps/ios && swift test

# Using xcodebuild
cd apps/ios
xcodebuild -scheme Finance -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' test
```

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

## KMP Integration

The app consumes shared business logic from the KMP modules:

- **`packages/core`** — Domain logic, use cases
- **`packages/models`** — Data models (SQLDelight entities)
- **`packages/sync`** — Supabase sync engine

Integration will use **Swift Export** (or KMP-NativeCoroutines / SKIE) to bridge
Kotlin `Flow` → Swift `AsyncSequence`. See
[`docs/guides/ios-setup.md`](../../docs/guides/ios-setup.md) for detailed
integration instructions.

### KMP Platform Bindings (Current State)

iOS-specific Kotlin implementations exist in `packages/sync/src/iosMain/`:

| File                      | Status      | Notes                                                    |
| ------------------------- | ----------- | -------------------------------------------------------- |
| `PlatformSHA256.ios.kt`   | ✅ Working  | Pure-Kotlin SHA-256 + `SecRandomCopyBytes` for secure random |
| `Sha256.ios.kt`           | ✅ Working  | Shared internal SHA-256 (avoids CommonCrypto cinterop)   |
| `KeyDerivation.ios.kt`    | ✅ Working  | PBKDF2-HMAC-SHA256, 100k iterations, 32-byte key output |
| `TokenStorage.ios.kt`     | ⚠️ In-memory | Matches Android/JVM/JS; TODO: Keychain via Swift Export  |

iOS is the first platform with a working key derivation function (KDF). Token
storage currently uses an in-memory implementation; Keychain integration is
planned for when the Swift Export bridge connects to the app's `KeychainManager`.

## Architecture Principles

- **SwiftUI only** — No UIKit unless wrapping a component with no SwiftUI equivalent
- **`@Observable`** — All view models use the Observation framework (iOS 17+)
- **MVVM + Protocols** — ViewModels depend on repository protocols, not concrete types
- **Keychain for secrets** — All tokens and keys stored in Apple Keychain
- **Dynamic Type** — All text uses system font styles; no hardcoded sizes
- **VoiceOver** — Every interactive element has an accessibility label
- **Localized** — All user-facing strings go through `String(localized:)`
- **Edge-first** — All reads/writes go to local SQLite (KMP) first; full offline support
