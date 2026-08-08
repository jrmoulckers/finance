---
applyTo: 'apps/**'
---

# Instructions for Platform Applications

You are working in the `apps/` directory, which contains platform-specific application code.

## Platform Subdirectories

- `apps/ios/` — iOS, iPadOS, macOS, watchOS — **SwiftUI** with a staged Swift Export bridge (`Finance/KMP/`) while Swift-native repositories remain in use, Apple Keychain for secure storage, VoiceOver accessibility
- `apps/android/` — Android phones, tablets, Wear OS — **Jetpack Compose**, KMP direct dependency, Material 3 design system, TalkBack accessibility
- `apps/web/` — Progressive Web App — **TypeScript + React** (Kotlin/JS integration planned via `src/kmp/`), SQLite via wa-sqlite for local storage, ARIA attributes for accessibility, PWA with service worker
- `apps/windows/` — Windows 11 native app — **Compose Desktop (JVM)**, Windows Hello for biometric auth, Narrator accessibility

## Guidelines

- All apps consume shared logic from `packages/` — NEVER duplicate business logic in app code
- Each app is a thin UI layer — import business logic, models, and sync from packages/core, packages/models, and packages/sync
- Follow platform-native UI patterns and design guidelines (Human Interface Guidelines, Material Design, Fluent Design, etc.)
- All UI components must be accessible (screen reader support, dynamic type, keyboard navigation)
- Use platform-native navigation patterns
- Support offline operation — the app must function without network connectivity
- Handle sync conflicts gracefully with clear user-facing resolution options
- Local data is stored in SQLite and encrypted at rest — SQLCipher on iOS, Android, and Windows; the web PWA uses SQLite-WASM (OPFS) and relies on browser origin-storage isolation
- Design tokens (DTCG JSON) drive visual consistency — consume generated platform-native constants (Swift, XML resources, CSS variables, XAML resources)

## Prepared Native-Agent Overlay (Not Active)

Until canonical activation, `@android-engineer`, `@ios-engineer`, `@windows-engineer`, and `@kmp-engineer` retain their current runtime ownership. After activation, `@native-app-engineer` leads the three native apps plus shared KMP packages; `@web-engineer` continues to lead the PWA.

| Surface    | Concrete Finance rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android    | Own `apps/android/src/**`, `build.gradle.kts`, and `fastlane/**`; use Compose + Material 3, Koin/ViewModels/repositories, Timber only in debug, WorkManager, SQLDelight + SQLCipher, and BiometricPrompt/Android Keystore. Keep minSdk 28 and compile/target SDK 35 aligned through the version catalog. Preserve TalkBack, font scaling, 48dp targets, Paparazzi snapshots, and Glance widgets.                                                                                       |
| iOS        | Own `apps/ios/Finance/**`, `Shared/**`, `Tests/**`, `FinanceWatch/**`, `FinanceWidget/**`, `FinanceClip/**`, `Signing/**`, `fastlane/**`, and `Package.swift`; use SwiftUI, `@Observable`/`@MainActor`, complete strict concurrency, `os.Logger`, Keychain/biometrics, SQLCipher, VoiceOver, Dynamic Type, and 44pt targets. Preserve iOS 17, watchOS 10, and macOS 14 deployment targets and keep the live/stub Swift Export boundary explicit while native repositories still exist. |
| Windows    | Own `apps/windows/src/**`, `build.gradle.kts`, and `packaging/**`; use Compose Desktop/JVM only (no Electron/web wrapper), Koin, ViewModels/repositories, DPAPI, Windows Hello, Narrator, full keyboard operation, and high contrast. MSI is the sideload package and MSIX is the Store package; never describe an unsigned MSIX as shippable.                                                                                                                                         |
| Shared KMP | Do not duplicate financial or sync behavior in app code. Shared models, repositories, algorithms, SQLDelight, sync, and `expect`/`actual` boundaries live under `packages/` and follow `packages.instructions.md`; `@finance-domain` reviews money correctness without taking structural ownership.                                                                                                                                                                                    |

### Native Release Preparation

| Platform | Agent-prepared output                                                                                                                              | Human-gated final action                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Android  | Release AAB/APK, tests, mapping/metadata, and unsigned or CI-secret-backed signing configuration                                                   | Production keystore access, signing approval, and Google Play submission                                 |
| iOS      | Swift package resolution, tests, archive/export metadata, widgets/watch/App Clip checks, and unsigned CI archive where credentials are unavailable | Distribution certificate/profile access, notarization where applicable, and App Store Connect submission |
| Windows  | Compose distributable/MSI plus MSIX manifest/tooling checks and store metadata                                                                     | Certificate access, production signing, and Microsoft Store submission                                   |
| Web      | Production PWA build, service-worker/offline checks, and deployment metadata                                                                       | Production deployment or release promotion                                                               |

Never weaken signing checks, embed credentials, or convert a missing signing secret into a success-shaped published artifact.

Before calling a release candidate ready, `@release-manager` coordinates: no unresolved P0/P1 defects; affected security review complete; the accessibility audit passes; platform-parity status recorded; Changesets/version/changelog and store metadata prepared; migration/rollback readiness reviewed; and a human-approved signed build exists for each shipping native platform. Agents prepare evidence and unsigned artifacts, but humans approve credentials and perform signing, publishing, deployment, and store submission. An unsigned artifact may pass CI but is never release-ready.

## Platform Dependency Injection & Logging

- **Android** — Uses **Koin 4.0.1** for dependency injection. Define Koin modules in the app's DI layer; use `koin-compose-viewmodel` for ViewModel injection in Jetpack Compose screens. Use **Timber** (5.0.1) for logging — plant a `DebugTree` in debug builds only.
- **iOS** — Uses native **`os.Logger`** for structured logging (preferred over `NSLog` or `print`). DI is handled via Swift-native patterns (e.g., environment objects, manual injection via protocols).
- **Windows** — Mirrors Android's architecture: **Koin** for dependency injection with the ViewModel + Repository pattern on Compose Desktop (JVM). Use a JVM-appropriate logging abstraction; never log sensitive financial data.
- **Web** — No DI framework; dependencies flow through React context providers (e.g., `DatabaseProvider`) and custom hooks. See `web.instructions.md` for the data-access hook pattern.

## Environment Configurations

All platforms support three build variants with per-environment configuration:

- **debug** — Local development, verbose logging, mock data allowed
- **staging** — Pre-release testing against staging backend
- **release** — Production builds, no debug logging, analytics enabled

## Cross-Platform Concerns

- **i18n** — Internationalization framework in `packages/core` provides multi-language financial terminology. Platform apps consume localized strings from the shared layer.
- **`ownerId`** — All sync-enabled models include an `ownerId` field referencing the authenticated user. Platform apps must populate this on record creation.
- **Feature flags** — Managed via PostgreSQL + PowerSync; flags sync to clients for runtime evaluation of feature availability.
- **Accessibility routing** — `@accessibility-reviewer` remains review-only. Native findings route to the active platform owner now and `@native-app-engineer` after activation; web findings route to `@web-engineer`.
