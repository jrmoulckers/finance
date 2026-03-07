# Workflow Cheat Sheet

Quick reference for common development tasks in the Finance monorepo.

## Table of Contents

- [Daily Commands](#daily-commands)
- [Git Workflow](#git-workflow)
- [KMP Patterns](#kmp-patterns)
- [CI Troubleshooting](#ci-troubleshooting)
- [Issue-First Workflow Rules](#issue-first-workflow-rules)

## Daily Commands

| Task | Command |
|------|---------|
| Build everything | `npm run build` |
| Run all tests | `npm test` |
| Build KMP only | `npm run build:kmp` |
| Run KMP tests | `npm run test:kmp` |
| Build design tokens | `npm run build:tokens` |
| Run specific package test | `node tools/gradle.js :packages:core:jvmTest` |
| Lint | `npm run lint` |
| Format | `npm run format` |
| First-time setup | `npm run setup` |
| Clean all build artifacts | `npm run clean` |

## Git Workflow

### Creating a new feature

```bash
# 1. Create issue first (ALWAYS)
gh issue create --title "[Phase N] Feature name" --body "Description" --label "phase-N,feature"

# 2. Branch from main
git checkout main && git pull origin main
git checkout -b phase-N/feature-name

# 3. Develop with issue references in commits
git commit -m "feat(scope): description (#ISSUE)" --no-verify

# 4. Push and create PR
git push origin phase-N/feature-name --no-verify
gh pr create --base main --title "Phase N: Feature" --body "Closes #ISSUE"
```

### Commit message format

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint. Every commit must reference an issue.

```
type(scope): description (#N)
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`.

Common scopes: `core`, `web`, `ios`, `android`, `windows`, `ci`, `tokens`.

### Common Git Issues

- **Merge conflict in package-lock.json** — Run `npm install` then `git add package-lock.json`
- **Stale branch** — `git fetch origin main && git rebase origin/main`
- **Force push needed** — Always use `--force-with-lease` (never `--force`)
- **Husky hook blocking push** — Use `--no-verify` for agent/automated pushes

## KMP Patterns

### NoOpSchema for Platform Drivers

`AndroidSqliteDriver` and `JdbcSqliteDriver` require a `schema` parameter. Since we use `generateAsync = true` in SQLDelight, provide a no-op schema wrapper for synchronous driver constructors:

```kotlin
private object NoOpSchema : SqlSchema<QueryResult.Value<Unit>> {
    override val version: Long = 1
    override fun create(driver: SqlDriver) = QueryResult.Value(Unit)
    override fun migrate(
        driver: SqlDriver,
        oldVersion: Long,
        newVersion: Long,
        vararg callbacks: AfterVersion
    ) = QueryResult.Value(Unit)
}
```

This is needed because `generateAsync = true` produces a `suspend fun create()` on the generated schema, but the synchronous driver constructors expect a non-suspend schema. See [ADR-0003](../architecture/0003-local-storage-strategy.md) for the storage strategy that led to this pattern.

### @JvmInline in commonMain

Always add the explicit import when using `@JvmInline` value classes in `commonMain`:

```kotlin
import kotlin.jvm.JvmInline

@JvmInline
value class AccountId(val value: String)
```

The import is not auto-resolved on the JS target, causing confusing compilation failures.

### No @Volatile in commonMain

`@Volatile` is JVM-only and will fail to compile on JS and Native targets. Use `Mutex` from `kotlinx.coroutines` for thread-safe mutable state in shared code:

```kotlin
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SharedState {
    private val mutex = Mutex()
    private var _value: Int = 0

    suspend fun update(newValue: Int) = mutex.withLock {
        _value = newValue
    }
}
```

### Clock injection for tests

Never use `Clock.System.now()` directly in testable code. Inject `Clock` as a parameter so tests can control time:

```kotlin
class TransactionService(private val clock: Clock = Clock.System) {
    fun createTransaction(amount: Long): Transaction {
        return Transaction(amount = amount, createdAt = clock.now())
    }
}

// In tests:
val fixedClock = object : Clock {
    override fun now() = Instant.parse("2026-01-15T10:00:00Z")
}
val service = TransactionService(clock = fixedClock)
```

## CI Troubleshooting

| Problem | Solution |
|---------|----------|
| `compileDebugKotlinAndroid` fails | CI needs `android-actions/setup-android@v3` — all KMP modules apply `com.android.library` |
| `Xcode_16.0.app not found` | Use `ls /Applications/Xcode*.app \| sort -V \| tail -1` to find installed version |
| `npm ci` lock file mismatch | Use `npm install` instead, or rebase onto main to pick up latest lock file |
| JS browser tests fail | Timing-sensitive — use `TestClock`, or skip with `-x jsBrowserTest` |
| `add-to-project` fails | Check that the project URL matches `projects/2` in the workflow file |
| Gradle daemon OOM | Add `-Dorg.gradle.jvmargs=-Xmx2g` or run `node tools/gradle.js --stop` to kill daemons |
| JDK version mismatch | Kotlin 2.1.0 requires JDK 21 (Temurin recommended) — `tools/gradle.js` auto-detects |

## Issue-First Workflow Rules

These rules are enforced across all contributors — human and AI. See [SDLC](../architecture/sdlc.md) for the full development lifecycle.

1. **NEVER** close issues with `gh issue close` — let PR merge auto-close via `Closes #N`
2. Every commit references an issue: `type(scope): description (#N)`
3. PR body has `Closes #N` on its own line
4. Issues are created **before** code is written
5. All PRs target `main` independently — no stacking PRs on other feature branches
6. AI agents follow the same lifecycle and review standards as human developers

## Related Documentation

- [SDLC — Development Lifecycle](../architecture/sdlc.md)
- [Local Supabase Development](local-supabase.md)
- [Architecture Decision Records](../architecture/)
- [AI Agent Configuration](../ai/)
- [Decision Log](../architecture/decision-log.md)
