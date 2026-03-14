---
applyTo: 'apps/**'
---

# Instructions for Platform Applications

You are working in the `apps/` directory, which contains platform-specific application code.

## Platform Subdirectories

- `apps/ios/` — iOS, iPadOS, macOS, watchOS — **SwiftUI**, KMP via Swift Export, Apple Keychain for secure storage, VoiceOver accessibility
- `apps/android/` — Android phones, tablets, Wear OS — **Jetpack Compose**, KMP direct dependency, Material 3 design system, TalkBack accessibility
- `apps/web/` — Progressive Web App — **Kotlin/JS or TypeScript + React**, SQLite-WASM for local storage, ARIA attributes for accessibility, PWA with service worker
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
