---
applyTo: "apps/**"
---
# Instructions for Platform Applications

You are working in the `apps/` directory, which contains platform-specific application code.

## Platform Subdirectories

- `apps/ios/` — iOS, iPadOS, macOS, watchOS (likely Swift/SwiftUI)
- `apps/android/` — Android phones, tablets, Wear OS (likely Kotlin/Compose)
- `apps/web/` — Progressive Web App (likely TypeScript/React or similar)
- `apps/windows/` — Windows 11 native app (likely C#/WinUI or similar)

## Guidelines

- Each app is a thin UI layer that consumes shared logic from `packages/`
- Do NOT duplicate business logic across apps — import from packages/core
- Follow platform-native UI patterns and design guidelines (Human Interface Guidelines, Material Design, Fluent Design, etc.)
- All UI components must be accessible (screen reader support, dynamic type, keyboard navigation)
- Use platform-native navigation patterns
- Support offline operation — the app must function without network connectivity
- Handle sync conflicts gracefully with clear user-facing resolution options
