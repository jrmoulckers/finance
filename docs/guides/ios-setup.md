# iOS Development Setup Guide

Complete guide for setting up, building, and developing the Finance iOS app.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Opening the Project](#opening-the-project)
- [Building the App](#building-the-app)
- [Running on Simulator](#running-on-simulator)
- [MVVM Architecture](#mvvm-architecture)
- [Adding a New Screen](#adding-a-new-screen)
- [Running Tests](#running-tests)
- [KMP Integration (Swift Export)](#kmp-integration-swift-export)
- [KMP Platform Bindings — Current State](#kmp-platform-bindings--current-state)
- [Project Architecture](#project-architecture)
- [Accessibility Testing](#accessibility-testing)
- [Troubleshooting](#troubleshooting)

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

## MVVM Architecture

The iOS app uses the **MVVM (Model–View–ViewModel)** pattern with protocol-based
repository injection. This decouples views from data sources and enables easy
swapping between mock data (for development and previews) and KMP-backed
implementations (for production).

### Data Flow

```
View  →  ViewModel  →  Repository Protocol  →  Implementation
                                                  ├── MockRepository (current)
                                                  └── KMP-backed (future)
```

### Layers

| Layer            | Location                      | Responsibility                                         |
| ---------------- | ----------------------------- | ------------------------------------------------------ |
| **Models**       | `Finance/Models/`             | Shared data types (`AccountItem`, `BudgetItem`, etc.)  |
| **Repositories** | `Finance/Repositories/`       | Protocols defining async data-access contracts         |
| **Mocks**        | `Finance/Repositories/Mocks/` | In-memory implementations with sample data             |
| **ViewModels**   | `Finance/ViewModels/`         | `@Observable @MainActor` classes that own screen state |
| **Views**        | `Finance/Screens/`            | SwiftUI views that bind to ViewModel state             |

### ViewModel Conventions

Every ViewModel follows the same pattern:

- Annotated with `@Observable` (iOS 17 Observation framework) and `@MainActor`
- Accepts repository protocol(s) through its `init` (constructor injection)
- Exposes state properties that views bind to directly
- Contains `async` methods for loading and mutating data
- Handles errors gracefully (empty state, not crashes)

```swift
@Observable
@MainActor
final class AccountsViewModel {
    private let repository: AccountRepository

    var accountGroups: [AccountGroup] = []
    var isLoading = false

    init(repository: AccountRepository) {
        self.repository = repository
    }

    func loadAccounts() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let accounts = try await repository.getAccounts()
            // Group, sort, transform…
        } catch {
            accountGroups = []
        }
    }
}
```

### Current ViewModels

| ViewModel                    | Screen            | Repository Dependencies                  |
| ---------------------------- | ----------------- | ---------------------------------------- |
| `DashboardViewModel`         | Dashboard         | Account, Transaction, Budget             |
| `AccountsViewModel`          | Accounts list     | AccountRepository                        |
| `AccountDetailViewModel`     | Account detail    | AccountRepository, TransactionRepository |
| `TransactionsViewModel`      | Transactions list | TransactionRepository                    |
| `TransactionCreateViewModel` | New transaction   | TransactionRepository, AccountRepository |
| `BudgetsViewModel`           | Budgets           | BudgetRepository                         |
| `GoalsViewModel`             | Goals             | GoalRepository                           |
| `SettingsViewModel`          | Settings          | BiometricAuthManager                     |

## Adding a New Screen

Follow these steps to add a new screen that fits the established MVVM pattern:

### 1. Define the Model

Create a new file in `Finance/Models/` with your data type:

```swift
// Finance/Models/CategoryItem.swift
struct CategoryItem: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let icon: String
}
```

### 2. Define the Repository Protocol

Create a protocol in `Finance/Repositories/` with `async throws` methods:

```swift
// Finance/Repositories/CategoryRepository.swift
protocol CategoryRepository: Sendable {
    func getCategories() async throws -> [CategoryItem]
}
```

### 3. Implement the Mock

Add a mock in `Finance/Repositories/Mocks/` with hardcoded sample data:

```swift
// Finance/Repositories/Mocks/MockCategoryRepository.swift
struct MockCategoryRepository: CategoryRepository {
    func getCategories() async throws -> [CategoryItem] {
        [
            CategoryItem(id: "c1", name: "Groceries", icon: "cart"),
            CategoryItem(id: "c2", name: "Transport", icon: "car"),
        ]
    }
}
```

### 4. Create the ViewModel

Add an `@Observable @MainActor` class in `Finance/ViewModels/`:

```swift
// Finance/ViewModels/CategoriesViewModel.swift
import Observation

@Observable
@MainActor
final class CategoriesViewModel {
    private let repository: CategoryRepository
    var categories: [CategoryItem] = []
    var isLoading = false

    init(repository: CategoryRepository) {
        self.repository = repository
    }

    func loadCategories() async {
        isLoading = true
        defer { isLoading = false }
        do {
            categories = try await repository.getCategories()
        } catch {
            categories = []
        }
    }
}
```

### 5. Build the View

Create the SwiftUI view in `Finance/Screens/`:

```swift
// Finance/Screens/CategoriesView.swift
import SwiftUI

struct CategoriesView: View {
    @State private var viewModel: CategoriesViewModel

    init(repository: CategoryRepository = MockCategoryRepository()) {
        _viewModel = State(initialValue: CategoriesViewModel(repository: repository))
    }

    var body: some View {
        List(viewModel.categories) { category in
            Label(category.name, systemImage: category.icon)
        }
        .task { await viewModel.loadCategories() }
    }
}

#Preview {
    CategoriesView()
}
```

### 6. Add Tests

Write tests in `Tests/` using a stub repository (see [Running Tests](#running-tests)):

```swift
// Tests/CategoriesViewModelTests.swift
@testable import FinanceApp
import XCTest

final class CategoriesViewModelTests: XCTestCase {
    @MainActor
    func testLoadCategories() async {
        let repo = StubCategoryRepository()
        repo.categoriesToReturn = [/* sample data */]
        let vm = CategoriesViewModel(repository: repo)

        await vm.loadCategories()

        XCTAssertFalse(vm.categories.isEmpty)
    }
}
```

## Running Tests

The test target `FinanceTests` is defined in `Package.swift` and contains
68 test cases across 9 test files. Tests cover all ViewModels, model computed
properties, and currency formatting.

### Quick Start

```bash
# Using Swift Package Manager (fastest)
cd apps/ios && swift test

# Using xcodebuild (matches CI)
cd apps/ios
xcodebuild -scheme Finance \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  test
```

### Test Architecture

Tests use **stub repositories** defined in `Tests/TestHelpers.swift`. Each stub
is a configurable class that:

- Returns pre-set data via properties like `accountsToReturn`
- Throws errors on demand via an `errorToThrow` property
- Records method calls for verification (e.g., `deletedAccountIds`)

```swift
// Set up a stub with sample data
let repo = StubAccountRepository()
repo.accountsToReturn = SampleData.allAccounts

// Inject into ViewModel
let vm = AccountsViewModel(repository: repo)
await vm.loadAccounts()

// Assert state
XCTAssertEqual(vm.accountGroups.count, 4)

// Verify side effects
await vm.deleteAccount(id: "a1")
XCTAssertEqual(repo.deletedAccountIds, ["a1"])
```

`SampleData` (in `TestHelpers.swift`) provides a deterministic factory of
sample accounts, transactions, budgets, and goals used across all test files.

### Test Coverage

| Test File                               | Cases | What It Tests                               |
| --------------------------------------- | ----- | ------------------------------------------- |
| `AccountsViewModelTests.swift`          | 5     | Loading, grouping by type, deletion, errors |
| `DashboardViewModelTests.swift`         | —     | Aggregated balances, recent transactions    |
| `TransactionsViewModelTests.swift`      | —     | Filtering, sorting, deletion                |
| `TransactionCreateViewModelTests.swift` | —     | Validation, creation, account loading       |
| `BudgetsViewModelTests.swift`           | —     | Budget loading, progress calculations       |
| `GoalsViewModelTests.swift`             | —     | Goal loading, status filtering              |
| `ModelTests.swift`                      | —     | Computed properties on model types          |
| `CurrencyFormattingTests.swift`         | —     | Minor-units-to-display formatting           |
| `TestHelpers.swift`                     | —     | Stub repos, sample data, test error enum    |

**Total: 68 test cases across 9 files.**

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

## KMP Platform Bindings — Current State

iOS-specific Kotlin implementations exist in `packages/sync/src/iosMain/` and
provide platform-native cryptography and token storage:

| File                    | Path             | Status                                                                                |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `PlatformSHA256.ios.kt` | `…/sync/auth/`   | ✅ Pure-Kotlin SHA-256 + `SecRandomCopyBytes` for secure random                       |
| `Sha256.ios.kt`         | `…/sync/crypto/` | ✅ Shared internal SHA-256 implementation (avoids CommonCrypto cinterop)              |
| `KeyDerivation.ios.kt`  | `…/sync/crypto/` | ✅ PBKDF2-HMAC-SHA256 — 100k iterations, 32-byte key. First platform with working KDF |
| `TokenStorage.ios.kt`   | `…/sync/auth/`   | ⚠️ In-memory storage (matches Android/JVM/JS). TODO: Keychain via Swift Export        |

**Key notes:**

- iOS is the **first platform** with a working key derivation function (KDF).
  Android and JVM/JS still use stub implementations.
- The `KeyDerivation` implementation uses PBKDF2-HMAC-SHA256 as a deterministic
  fallback because Argon2id is not available through Apple framework interop
  exposed to the KMP module.
- Token storage uses an in-memory implementation matching other platforms.
  The plan is to delegate to the app's `KeychainManager` once the Swift Export
  bridge is wired up.

## Project Architecture

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
