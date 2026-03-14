# Workflow Cheat Sheet

Quick-reference commands, common patterns, and decision log for the Finance monorepo.

## Daily Commands

```bash
# Pull latest and install dependencies
git pull && npm install

# Build everything
npm run build

# Run all tests
npm test

# Run only KMP (Kotlin) tests
npm run test:kmp

# Start the web app locally
npm run dev -w apps/web

# Lint and format
npm run lint
npm run format:check
```

## Git Workflow

```bash
# Create a feature branch (always from main)
git checkout main && git pull
git checkout -b feat/description-123    # 123 = issue number

# Commit with conventional format
git commit -m "feat(core): implement budget calculator (#123)"

# Push (pre-push hook validates automatically)
git push origin feat/description-123
```

### Commit Message Format

```
type(scope): description (#issue)
```

| Type       | Use for                                |
| ---------- | -------------------------------------- |
| `feat`     | New user-facing capability             |
| `fix`      | Bug fix                                |
| `docs`     | Documentation only                     |
| `style`    | Formatting, no logic change            |
| `refactor` | Code restructuring, no behavior change |
| `test`     | Adding or updating tests               |
| `chore`    | Maintenance, dependencies              |
| `ci`       | CI/CD workflow changes                 |
| `perf`     | Performance improvement                |

### Branch Naming

```
type/short-description-ISSUE
```

Examples: `feat/budget-rollover-134`, `fix/web-blank-page-345`, `docs/readme-update-274`

## Gradle (KMP)

```bash
# Run any Gradle command cross-platform
node tools/gradle.js <args>

# Build shared packages
node tools/gradle.js :packages:core:build :packages:models:build :packages:sync:build

# Run JVM tests for a specific package
node tools/gradle.js :packages:core:jvmTest

# List available tasks
node tools/gradle.js tasks
```

## AI Agents (Copilot Chat)

Type `@agent-name` in VS Code Copilot Chat:

| Agent                     | Role                                                   |
| ------------------------- | ------------------------------------------------------ |
| `@architect`              | System design, API contracts, cross-platform decisions |
| `@docs-writer`            | Documentation authoring and maintenance                |
| `@security-reviewer`      | Security and privacy code review                       |
| `@accessibility-reviewer` | WCAG 2.2 AA compliance review                          |
| `@finance-domain`         | Financial modeling and domain logic                    |
| `@backend-engineer`       | Supabase, PostgreSQL, PowerSync                        |
| `@kmp-engineer`           | Kotlin Multiplatform shared code                       |
| `@android-engineer`       | Jetpack Compose, Android platform                      |
| `@ios-engineer`           | SwiftUI, iOS platform                                  |
| `@web-engineer`           | React, PWA, service workers                            |
| `@windows-engineer`       | Compose Desktop, Windows platform                      |
| `@design-engineer`        | Design tokens, color systems, typography               |
| `@devops-engineer`        | CI/CD, Turborepo, Fastlane                             |

## Project Structure Quick Reference

| Path                      | What's there                                          |
| ------------------------- | ----------------------------------------------------- |
| `packages/core/`          | Business logic — budgeting, categorization, analytics |
| `packages/models/`        | Data models, SQLDelight schemas, migrations           |
| `packages/sync/`          | Sync engine, conflict resolution, mutation queue      |
| `packages/design-tokens/` | DTCG JSON tokens → Swift/CSS/XML/XAML                 |
| `apps/android/`           | Jetpack Compose UI                                    |
| `apps/ios/`               | SwiftUI UI                                            |
| `apps/web/`               | React + TypeScript PWA                                |
| `apps/windows/`           | Compose Desktop (JVM) UI                              |
| `services/api/`           | Supabase project (Edge Functions, migrations)         |
| `docs/architecture/`      | ADRs, roadmap, SDLC methodology                       |
| `.github/agents/`         | Custom Copilot agent definitions                      |
| `.github/skills/`         | Reusable domain knowledge for agents                  |

## Decision Log

Key architecture decisions made during development, documented as ADRs:

| ADR                                                           | Decision                 | Chosen                           |
| ------------------------------------------------------------- | ------------------------ | -------------------------------- |
| [0001](docs/architecture/0001-cross-platform-framework.md)    | Cross-platform framework | KMP (Kotlin Multiplatform)       |
| [0002](docs/architecture/0002-backend-sync-architecture.md)   | Backend + sync           | Supabase + PowerSync             |
| [0003](docs/architecture/0003-local-storage-strategy.md)      | Local storage            | SQLite + SQLDelight + SQLCipher  |
| [0004](docs/architecture/0004-auth-security-architecture.md)  | Authentication           | Passkeys + OAuth 2.0/PKCE        |
| [0005](docs/architecture/0005-design-system-approach.md)      | Design system            | Design tokens (DTCG) + native UI |
| [0006](docs/architecture/0006-cicd-strategy.md)               | CI/CD                    | GitHub Actions + Turborepo       |
| [0007](docs/architecture/0007-hosting-strategy.md)            | Hosting                  | Self-hosted VPS (~$10-20/mo)     |
| [0009](docs/architecture/0009-legal-monetization-analysis.md) | Monetization             | Freemium + donations             |

## Common Patterns

### Financial calculations

Always use integer cents (`Long`) — never floating point for money:

```kotlin
// ✅ Correct
val price: Long = 1999  // $19.99 in cents

// ❌ Wrong
val price: Double = 19.99
```

### KMP expect/actual

Platform-specific code uses `expect`/`actual` declarations:

```kotlin
// commonMain — declare the interface
expect class DatabaseFactory {
    fun createDriver(): SqlDriver
}

// androidMain — provide implementation
actual class DatabaseFactory(private val context: Context) {
    actual fun createDriver(): SqlDriver = AndroidSqliteDriver(...)
}
```

### Sync conflict resolution

Tables use strategy-based resolution via `ConflictStrategy`:

```kotlin
// Simple fields: last-write-wins (default)
// Complex data (budgets, goals, households): field-level merge
val resolver = ConflictStrategy.resolverFor(tableName)
val resolved = resolver.resolve(localChange, remoteChange)
```
