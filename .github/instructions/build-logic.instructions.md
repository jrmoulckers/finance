---
applyTo: 'build-logic/**'
---

# Instructions for Gradle Build Logic

You are working in `build-logic/`, owned by `@devops-engineer` for shared Gradle convention plugins and build configuration.

## Convention Plugin Rules

- Centralize common Kotlin Multiplatform, Android, JVM, coverage, and lint setup here instead of duplicating it in app or package `build.gradle.kts` files.
- Use Kotlin DSL convention plugins with stable plugin IDs and clear file names (for example, `finance.kmp.library.gradle.kts`).
- Use the Gradle version catalog (`libs`) for plugin and dependency versions; do not hardcode versions in convention plugins.
- Keep plugins idempotent and configuration-cache friendly: prefer Provider APIs, lazy configuration, and avoid reading files or environment variables during execution unless necessary.
- Preserve optional Android SDK behavior. Shared KMP conventions must continue to configure Android targets only when the SDK is available.
- Do not introduce machine-specific absolute paths or assumptions about developer-installed tools beyond the documented repo prerequisites.

## Verification Expectations

- When a convention changes, identify every app/package that applies it and update affected workflow triggers or cache keys if needed.
- Prefer small, composable conventions over a single plugin that configures unrelated platforms.
- Keep generated build artifacts out of source control; only commit source convention plugins and supporting configuration.
