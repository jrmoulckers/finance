---
applyTo: 'apps/**'
---

# Instructions for Platform Applications

You are working in the `apps/` directory, which contains platform-specific application code.

## Platform Subdirectories

- `apps/ios/` — iOS, iPadOS, macOS, watchOS — **SwiftUI**, KMP integration planned via Swift Export (currently pure Swift), Apple Keychain for secure storage, VoiceOver accessibility
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
- Local data is stored in SQLite + SQLCipher (encrypted at rest) on all platforms
- Design tokens (DTCG JSON) drive visual consistency — consume generated platform-native constants (Swift, XML resources, CSS variables, XAML resources)

## Platform Dependency Injection & Logging

- **Android** — Uses **Koin 4.0.1** for dependency injection. Define Koin modules in the app's DI layer; use `koin-compose-viewmodel` for ViewModel injection in Jetpack Compose screens. Use **Timber** (5.0.1) for logging — plant a `DebugTree` in debug builds only.
- **iOS** — Uses native **`os.Logger`** for structured logging (preferred over `NSLog` or `print`). DI is handled via Swift-native patterns (e.g., environment objects, manual injection via protocols).
