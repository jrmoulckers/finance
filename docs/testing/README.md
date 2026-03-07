# Testing Guide — Finance Monorepo

## Running Tests

| Command | What it runs |
|---------|-------------|
| `npm test` | All tests (KMP JVM + Turbo) |
| `npm run test:kmp` | KMP JVM tests only |
| `node tools/gradle.js :packages:core:jvmTest` | Core package tests |
| `node tools/gradle.js :packages:sync:jvmTest` | Sync package tests |
| `node tools/gradle.js :packages:models:jvmTest` | Models package tests |

## Test Structure

```
packages/core/src/
  commonMain/   ← Source code
  commonTest/   ← Shared tests (run on all targets)
  jvmMain/      ← JVM-specific source
  jvmTest/      ← JVM-specific tests (if any)
```

- **Unit tests**: `src/commonTest/` — run on JVM and JS targets
- **Integration tests**: `src/commonTest/.../integration/` — multi-component scenarios
- **Android UI tests** (future): `apps/android/src/androidTest/`

## Conventions

- Test file mirrors source: `MoneyOperations.kt` → `MoneyOperationsTest.kt`
- Use `kotlin.test` annotations: `@Test`, `@BeforeTest`
- Use `kotlinx.coroutines.test.runTest` for coroutine tests
- Use [Turbine](https://github.com/cashapp/turbine) for Flow testing
- Use `TestFixtures.kt` for shared test data

## Financial Test Requirements

Financial logic tests MUST cover:
- Zero amounts
- Negative amounts
- Overflow (Long.MAX_VALUE boundaries)
- Rounding edge cases (banker's rounding: half-to-even)
- Currency boundaries (JPY = 0 decimals, BHD = 3 decimals)
- Empty collections (no transactions, no accounts)

## Writing a New Test

```kotlin
package com.finance.core.example

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals

class MyCalculatorTest {
    @Test
    fun \`calculates total correctly\`() {
        val items = listOf(Cents(100), Cents(250), Cents(50))
        val total = items.fold(Cents.ZERO) { acc, c -> acc + c }
        assertEquals(Cents(400), total)
    }
}
```

## Test Data

- `TestFixtures.kt` — shared accounts, transactions, budgets for unit tests
- `SampleData.kt` — realistic mock data for Android UI previews
- **NEVER** use real financial data in tests

## CI

- CI runs `jvmTest` on every PR (see `.github/workflows/ci.yml`)
- JS browser tests are skipped in CI (timing issues with ChromeHeadless — see #173)
- Android instrumented tests run via `.github/workflows/android-ci.yml`

## Coverage Targets

| Package | Target | Rationale |
|---------|--------|-----------|
| packages/core | 90%+ | All financial logic |
| packages/models | 80%+ | Schema and migration logic |
| packages/sync | 80%+ | Sync, conflict resolution, encryption |
| apps/android | 60%+ | ViewModels and business logic (not UI) |
