# Cross-Platform Performance Optimization Plan

**Status:** Proposed
**Date:** 2025-07-15
**Author:** System Architect
**Related:** [Performance Baselines](performance-baselines.md) · [Monitoring Architecture](monitoring.md) · [CI/CD Strategy](0006-cicd-strategy.md) · [Cross-Platform Framework](0001-cross-platform-framework.md)
**Ticket:** #76

---

## Executive Summary

This document provides an actionable performance optimization plan for the Finance app across all four platforms (Web, Android, iOS, Windows). It is based on a static code audit of the monorepo structure, build configurations, CI pipelines, shared KMP packages, and platform-specific application code. The plan identifies concrete bottlenecks, prioritizes optimizations by impact, defines a before/after metrics framework, and recommends CI performance gates.

The existing `performance-baselines.md` defines _what_ to measure and _what targets to hit_. This document defines _how to get there_: the specific code changes, architectural improvements, and tooling additions needed to meet and sustain those targets.

### Guiding Principles

All recommendations are evaluated through the project's decision framework:

1. **Edge-first** — Optimize local computation; never move edge work to the server for performance reasons.
2. **Privacy-first** — Performance instrumentation must remain consent-gated and PII-free.
3. **Native-first** — Platform-specific optimizations over cross-platform workarounds.
4. **Simplicity** — Prefer the least complex optimization that delivers measurable improvement.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Identified Bottlenecks](#2-identified-bottlenecks)
3. [Optimization Recommendations](#3-optimization-recommendations)
4. [Performance Budget Definitions](#4-performance-budget-definitions)
5. [Before/After Metrics Framework](#5-beforeafter-metrics-framework)
6. [CI Integration Recommendations](#6-ci-integration-recommendations)
7. [Implementation Roadmap](#7-implementation-roadmap)

---

## 1. Current State Assessment

### 1.1 Web (React + Vite + SQLite-WASM)

**Architecture:** SPA built with React 19, Vite 8, react-router-dom 7. SQLite-WASM via wa-sqlite with OPFS persistence. Service worker provides offline-first caching. All routes are lazy-loaded.

| Area                    | Current State                                                                         | Assessment                                         |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Code splitting**      | All 13 route pages are lazy-loaded via `React.lazy()`                                 | ✅ Good                                            |
| **Vendor chunking**     | Manual `manualChunks` splits react/react-dom/react-router-dom                         | ⚠️ Partial — Recharts, D3, Zod, sql.js not chunked |
| **Service worker**      | Cache-first for static assets, network-first for API. App shell pre-cached            | ✅ Good                                            |
| **WASM initialization** | SQLite-WASM loaded synchronously in `DatabaseProvider` before app renders             | 🔴 Blocking — entire app waits for DB init         |
| **Bundle dependencies** | D3 (≈70 KB gz), Recharts (≈45 KB gz), sql.js + wa-sqlite (≈300 KB gz)                 | ⚠️ Heavy charting deps                             |
| **Lighthouse CI**       | Configured with performance ≥ 90 (warn), accessibility ≥ 95 (error)                   | ✅ Good                                            |
| **Budget enforcement**  | `budget.json` defines resource and timing budgets; `lighthouserc-budget.json` asserts | ✅ Good                                            |
| **Source maps**         | `sourcemap: true` in production builds                                                | ⚠️ Consider removing for production                |
| **Tree-shaking**        | Vite/Rollup handles dead code elimination; D3 imported as full namespace              | ⚠️ D3 not tree-shaken                              |
| **CSP**                 | `'unsafe-inline'` present in dev script-src                                           | ⚠️ Security concern (dev only)                     |

### 1.2 Android (Kotlin + Jetpack Compose)

**Architecture:** Single-activity Compose app with Koin DI, SQLCipher, PowerSync. KMP shared modules (`core`, `models`, `sync`) consumed as project dependencies.

| Area                    | Current State                                                            | Assessment                                      |
| ----------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| **Baseline profiles**   | `baseline-prof.txt` exists with 15 critical path entries                 | ✅ Good foundation                              |
| **ProGuard/R8**         | Rules configured, but overly broad `keep` rules reduce optimization      | ⚠️ Over-keeping classes                         |
| **Startup sequence**    | `Application.onCreate()`: Timber → Koin (3 modules) → SyncWorker.enqueue | ⚠️ Koin init and sync scheduling on main thread |
| **Compose stability**   | No `@Stable`/`@Immutable` annotations observed on data classes           | ⚠️ May cause unnecessary recompositions         |
| **ViewModel lifecycle** | Standard `ViewModel` with Compose lifecycle integration                  | ✅ Good                                         |
| **SQLCipher**           | Encrypted local database (security requirement)                          | ⚠️ ~15-30% overhead vs plain SQLite             |
| **APK analysis**        | No size tracking in CI; debug APK uploaded but not measured              | 🔴 Missing size regression gate                 |
| **Background sync**     | WorkManager periodic sync via `SyncWorker`                               | ✅ Good                                         |
| **Dependencies**        | Compose BOM, Material Icons Extended (entire icon set)                   | ⚠️ Material Icons Extended adds ~2-3 MB         |

### 1.3 iOS (SwiftUI + KMP)

**Architecture:** SwiftUI app with `@Observable` view models, KMP bridge for shared logic, SQLCipher via KMP. Widget, Watch, and Clip extensions present.

| Area                   | Current State                                                  | Assessment                                      |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| **Performance doc**    | `apps/ios/PERFORMANCE.md` with detailed targets and checklists | ✅ Excellent — best-documented platform         |
| **LazyVStack usage**   | Confirmed in checklist; pagination at 50 items                 | ✅ Good                                         |
| **@Observable**        | Adopted over `ObservableObject` for finer-grained invalidation | ✅ Good                                         |
| **KMP bridge**         | Async calls, no main thread blocking                           | ✅ Good                                         |
| **DB indexes**         | Acknowledged as needed but incomplete                          | ⚠️ Missing indexes on filtered columns          |
| **In-memory caching**  | Planned but not yet implemented for frequent reads             | ⚠️ Repeated KMP round-trips                     |
| **Batch inserts**      | Not yet implemented for sync                                   | 🔴 Sync write performance impact                |
| **Chart rendering**    | `.drawingGroup()` not yet applied to Swift Charts              | ⚠️ Potential frame drops with > 500 data points |
| **XCTest performance** | Example in docs but not confirmed in CI                        | ⚠️ No automated perf regression detection       |
| **MetricKit**          | Planned but not confirmed as integrated                        | ⚠️ No field performance data collection         |

### 1.4 Windows (Compose Desktop / JVM)

**Architecture:** JVM-based Compose Desktop app with Koin DI, Ktor OkHttp engine, DPAPI for token storage. MSIX packaging.

| Area                     | Current State                                                                     | Assessment                                         |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| **JVM cold start**       | No AOT compilation; full JVM startup on every launch                              | 🔴 Likely exceeds 2s target                        |
| **Repository layer**     | All repositories are in-memory (`InMemory*Repository`) — not yet backed by SQLite | ⚠️ Data not persistent; placeholder implementation |
| **Memory management**    | No JVM heap tuning in build config or launch scripts                              | ⚠️ Default JVM settings                            |
| **MSIX packaging**       | `packageMsi` task exists; `continue-on-error: true` in CI                         | ⚠️ Packaging failures silently pass                |
| **Compose optimization** | No Stability configuration observed                                               | ⚠️ Potential over-recomposition                    |
| **CI pipeline**          | Build + package only; no tests, no size checks, no perf gates                     | 🔴 Weakest CI coverage                             |
| **Koin initialization**  | `startKoin` before `application {}` — blocks window render                        | ⚠️ DI on main thread before first frame            |

### 1.5 Shared Packages (KMP)

**Architecture:** `packages/core` (business logic), `packages/models` (data types), `packages/sync` (delta sync engine).

| Area                    | Current State                                                                         | Assessment                                             |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Aggregation**         | `FinancialAggregator` operates on in-memory `List<Transaction>`                       | ⚠️ O(n) full-scan per aggregation — no pre-computation |
| **Multiple passes**     | `monthlySpendingTrend()` calls `totalSpending()` N times, each scanning the full list | 🔴 O(n×m) complexity for trend calculation             |
| **Sync engine**         | Well-structured pull → resolve → push with batching, backoff, health reporting        | ✅ Good                                                |
| **Conflict resolution** | O(1) lookup via `associateBy` — efficient                                             | ✅ Good                                                |
| **Delta sync**          | Paginated pull, batched push, sequence tracking, checksum verification                | ✅ Good                                                |
| **MetricsCollector**    | Unbounded `mutableListOf` buffer — never applies back-pressure                        | ⚠️ Memory leak risk under high event volume            |
| **SyncHealthMonitor**   | Rolling window capped at 100 samples — bounded                                        | ✅ Good                                                |

### 1.6 Backend & Sync Infrastructure

| Area                     | Current State                                                                           | Assessment                               |
| ------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| **PowerSync sync rules** | Two buckets: `by_household`, `user_profile`                                             | ✅ Correct scope — minimal data exposure |
| **Edge functions**       | health-check, auth-webhook, data-export, account-deletion, passkey-\*, household-invite | ✅ Thin server layer                     |
| **API latency targets**  | Defined in performance-baselines.md                                                     | ✅ Good                                  |

---

## 2. Identified Bottlenecks

Bottlenecks are classified by severity:

- **P0 — Critical**: Directly degrades user experience below baseline targets
- **P1 — High**: Measurable impact on startup, frame rate, or memory
- **P2 — Medium**: Incremental improvement opportunity
- **P3 — Low**: Optimization for scale or future-proofing

### 2.1 Cross-Platform Bottlenecks

| ID       | Bottleneck                                                                                     | Severity | Platforms | Impact                                                        |
| -------- | ---------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------------------------- |
| **B-01** | `FinancialAggregator.monthlySpendingTrend()` is O(n×m) — scans full transaction list per month | **P0**   | All       | Dashboard load exceeds 200ms target with > 5,000 transactions |
| **B-02** | All aggregation functions do full-list scans with no pre-computation or caching                | **P1**   | All       | Repeated redundant computation on every dashboard render      |
| **B-03** | `MetricsCollector.eventBuffer` is unbounded `mutableListOf` — no cap or back-pressure          | **P2**   | All       | Memory growth if `flushEvents()` is not called regularly      |
| **B-04** | No SQLite index strategy documented or enforced for filtered columns                           | **P1**   | All       | Query performance degrades with data growth                   |
| **B-05** | Sync batch inserts not implemented — individual inserts during sync                            | **P1**   | All       | Initial/catch-up sync slower than target                      |

### 2.2 Web-Specific Bottlenecks

| ID       | Bottleneck                                                               | Severity | Impact                                                            |
| -------- | ------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------- |
| **B-10** | SQLite-WASM initialization blocks entire app render (`DatabaseProvider`) | **P0**   | Cold start shows loading spinner for 500ms-2s while WASM compiles |
| **B-11** | D3 imported as full namespace (`d3` package) — not tree-shakeable        | **P1**   | ~70 KB gzipped unnecessary bundle weight                          |
| **B-12** | Recharts pulls in D3 transitively; both present in bundle                | **P1**   | ~45 KB gzipped additional chart library weight                    |
| **B-13** | No `manualChunks` for large deps (Recharts, Zod, sql.js)                 | **P2**   | Initial load includes unnecessary library code                    |
| **B-14** | Source maps enabled in production build                                  | **P2**   | Exposes source code; marginal build size impact                   |
| **B-15** | No `size-limit` or bundle analysis in CI                                 | **P1**   | Bundle size regressions go undetected                             |
| **B-16** | Service worker pre-cache list is hardcoded and minimal                   | **P2**   | Cache miss on first navigation to non-root routes                 |

### 2.3 Android-Specific Bottlenecks

| ID       | Bottleneck                                                                            | Severity | Impact                                                      |
| -------- | ------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| **B-20** | `Material Icons Extended` imported as full dependency (~2-3 MB)                       | **P1**   | APK size inflation; increased DEX count                     |
| **B-21** | Koin DI initialization on main thread before first frame                              | **P1**   | Adds 50-200ms to cold start                                 |
| **B-22** | Baseline profiles cover only 15 methods — needs expansion                             | **P2**   | Suboptimal AOT compilation coverage for critical paths      |
| **B-23** | ProGuard rules over-keep with broad wildcards (`-keep class com.powersync.** { *; }`) | **P2**   | R8 cannot optimize/shrink kept classes                      |
| **B-24** | No APK size tracking in CI pipeline                                                   | **P1**   | Size regressions undetected until release                   |
| **B-25** | No Compose stability configuration for data classes from `packages/models`            | **P1**   | Unnecessary recompositions degrade scroll/frame performance |

### 2.4 iOS-Specific Bottlenecks

| ID       | Bottleneck                                                              | Severity | Impact                                                    |
| -------- | ----------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| **B-30** | Missing SQLite indexes on `account_id`, `date`, `category` columns      | **P1**   | Transaction list queries degrade with data growth         |
| **B-31** | No in-memory caching layer for frequently read data (accounts, budgets) | **P1**   | Repeated KMP bridge → SQLite round-trips per render cycle |
| **B-32** | Batch inserts not implemented for sync writes                           | **P1**   | Sync import performance below target                      |
| **B-33** | Swift Charts missing `.drawingGroup()` optimization                     | **P2**   | Frame drops with > 500 data points                        |
| **B-34** | No automated XCTest performance tests in CI                             | **P2**   | Performance regressions not caught before merge           |

### 2.5 Windows-Specific Bottlenecks

| ID       | Bottleneck                                                                       | Severity | Impact                                            |
| -------- | -------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| **B-40** | JVM cold start with no AOT/CDS optimization                                      | **P0**   | Estimated 3-5s startup vs 2s target               |
| **B-41** | All repositories are in-memory stubs — no persistent storage                     | **P0**   | Data lost on app close; blocks real-world testing |
| **B-42** | No JVM heap tuning (`-Xmx`, `-Xms`) in native distributions config               | **P1**   | Default heap sizing leads to GC pressure          |
| **B-43** | CI pipeline has no tests, no perf checks, MSIX packaging failure silently passes | **P1**   | Quality regressions undetected                    |
| **B-44** | Koin initialization blocks window creation                                       | **P2**   | DI setup delays first frame                       |

---

## 3. Optimization Recommendations

### Priority Legend

- **Quick Win**: < 1 day effort, high confidence improvement
- **Medium Effort**: 1-3 day effort, measurable improvement
- **Strategic**: 1-2 week effort, foundational improvement

---

### 3.1 Cross-Platform Optimizations

#### OPT-01: Optimize `FinancialAggregator` with Single-Pass Computation

**Addresses:** B-01, B-02
**Priority:** P0 · Medium Effort
**Impact:** Dashboard load time reduced from O(n×m) to O(n)

**Current:** `monthlySpendingTrend()` calls `totalSpending()` N times (once per month), each scanning the full transaction list. For 12 months and 10,000 transactions = 120,000 iterations.

**Proposed:** Single-pass aggregation that pre-groups transactions by month, then computes per-bucket totals:

```kotlin
fun monthlySpendingTrendOptimized(
    transactions: List<Transaction>,
    months: Int,
    referenceDate: LocalDate,
): List<MonthlyTotal> {
    val cutoff = referenceDate.minus(months, DateTimeUnit.MONTH)

    // Single pass: filter + group by month
    val byMonth = transactions.asSequence()
        .filter { it.type == TransactionType.EXPENSE
            && it.date >= cutoff && it.date <= referenceDate
            && it.deletedAt == null
            && it.status != TransactionStatus.VOID }
        .groupBy { YearMonth(it.date.year, it.date.month) }

    // Build results from pre-grouped data
    return (0 until months).map { offset ->
        val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
        val key = YearMonth(monthDate.year, monthDate.month)
        MonthlyTotal(
            year = key.year,
            month = key.month,
            total = Cents(byMonth[key]?.sumOf { it.amount.abs().amount } ?: 0L),
        )
    }.reversed()
}
```

**Metrics:**

- Before: Dashboard aggregation with 10K txns / 12 months → ~120K iterations
- After: Single pass → ~10K iterations (12× improvement)
- Target: < 100ms on all platforms (per `performance.budget.json` `sqliteAggregation`)

#### OPT-02: Implement Aggregation Result Caching in Core

**Addresses:** B-02
**Priority:** P1 · Medium Effort
**Impact:** Eliminates redundant computation across screen navigations

**Proposed:** Add a lightweight `AggregationCache` in `packages/core` that invalidates on transaction mutations:

```kotlin
class AggregationCache(
    private val invalidationFlow: Flow<Unit>, // emits when transactions change
    private val clock: Clock = Clock.System,
) {
    private val cache = ConcurrentHashMap<String, CachedResult>()
    private val maxAge = 30_000L // 30s TTL

    suspend fun <T> getOrCompute(key: String, compute: suspend () -> T): T { ... }
}
```

This eliminates repeated `FinancialAggregator` calls when navigating back to the dashboard without transaction changes. Invalidation is driven by the sync engine's mutation flow.

#### OPT-03: Define and Enforce SQLite Index Strategy

**Addresses:** B-04, B-30
**Priority:** P1 · Quick Win
**Impact:** Query latency for filtered lists drops from O(n) scan to O(log n) index lookup

**Proposed indexes** (add to SQLDelight `.sq` files and web `MIGRATIONS`):

```sql
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, date);
CREATE INDEX IF NOT EXISTS idx_transactions_household_id ON transactions(household_id);
CREATE INDEX IF NOT EXISTS idx_budgets_household_id ON budgets(household_id);
```

**Validation:** Run `EXPLAIN QUERY PLAN` on all repository queries and confirm index usage.

#### OPT-04: Implement Batched Sync Inserts

**Addresses:** B-05, B-32
**Priority:** P1 · Medium Effort
**Impact:** Sync write throughput increases 5-10× for bulk operations

**Proposed:** Wrap sync change application in SQLite transactions with configurable batch size:

```kotlin
// In platform-specific sync persistence layer
suspend fun applyChanges(changes: List<SyncChange>) {
    database.transaction {
        for (change in changes) {
            applyChange(change)
        }
    }
}
```

The sync engine already batches pushes via `SyncConfig.batchSize`. Apply the same pattern to pulls.

#### OPT-05: Cap `MetricsCollector` Event Buffer

**Addresses:** B-03
**Priority:** P2 · Quick Win
**Impact:** Prevents unbounded memory growth under high event volume

**Proposed:** Add a `maxBufferSize` parameter (default 1,000) to `MetricsCollector`. Drop oldest events when the buffer is full:

```kotlin
class MetricsCollector(
    private val consentProvider: () -> Boolean,
    private val clock: Clock = Clock.System,
    private val maxBufferSize: Int = 1_000,
) {
    private fun recordEvent(name: String, properties: Map<String, String>) {
        if (!consentProvider()) return
        if (eventBuffer.size >= maxBufferSize) eventBuffer.removeAt(0)
        eventBuffer.add(MetricEvent(name, clock.now(), properties))
    }
}
```

---

### 3.2 Web Optimizations

#### OPT-10: Non-Blocking SQLite-WASM Initialization

**Addresses:** B-10
**Priority:** P0 · Medium Effort
**Impact:** Reduces perceived cold start by 500ms-1.5s

**Current:** `DatabaseProvider` renders a loading spinner until `initDatabase()` resolves. The entire app tree (including auth, routing) is blocked.

**Proposed:** Decouple database initialization from the app shell rendering. Render the auth/navigation skeleton immediately, and defer database readiness to individual pages that need it:

```tsx
// main.tsx — render app shell immediately
createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider config={authConfig}>
      <BrowserRouter>
        <DatabaseProvider>
          {' '}
          {/* non-blocking provider */}
          <App />
        </DatabaseProvider>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);

// DatabaseProvider — expose loading state, don't block children
export function DatabaseProvider({ children }: Props) {
  const [db, setDb] = useState<SqliteDb | null>(null);
  useEffect(() => {
    initDatabase().then(setDb);
  }, []);
  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}

// useDatabase — pages that need the DB handle loading locally
export function useDatabase(): SqliteDb | null {
  return useContext(DatabaseContext); // null while loading
}
```

Pages that require the database (dashboard, transactions) show their own skeleton state. Auth-only pages (login, signup) render immediately.

#### OPT-11: Replace Full D3 Import with Modular Imports

**Addresses:** B-11
**Priority:** P1 · Quick Win
**Impact:** Reduces JS bundle by ~40-50 KB gzipped

**Current:** `"d3": "^7.9.0"` imports the entire D3 suite.

**Proposed:** Replace with specific D3 submodules:

```json
{
  "d3-scale": "^4.0.0",
  "d3-shape": "^3.0.0",
  "d3-array": "^3.0.0",
  "d3-format": "^3.0.0"
}
```

Then update imports from `import * as d3 from 'd3'` to `import { scaleLinear } from 'd3-scale'`. This enables Vite's tree-shaking to eliminate unused D3 modules.

#### OPT-12: Evaluate Recharts Replacement or Lazy-Load Charts

**Addresses:** B-12
**Priority:** P1 · Medium Effort
**Impact:** Removes ~45 KB gzipped from initial load if lazy-loaded

**Options:**

| Option                   | Bundle Size (gz) | Pros                       | Cons                      |
| ------------------------ | ---------------- | -------------------------- | ------------------------- |
| Recharts (current)       | ~45 KB           | Feature-rich, React-native | Heavy, wraps D3           |
| Lightweight SVG (custom) | ~5 KB            | Minimal, fully controlled  | Dev effort for new charts |
| Lazy-load Recharts       | 0 KB initial     | No upfront cost            | Flash of empty chart area |

**Recommended:** Lazy-load the charting library. Charts are not on the critical path — the dashboard should render the net worth number and account list first, then load charts progressively:

```tsx
const SpendingChart = lazy(() => import('./components/SpendingChart'));

function Dashboard() {
  return (
    <>
      <NetWorthCard /> {/* renders immediately */}
      <AccountsList /> {/* renders from cached SQLite */}
      <Suspense fallback={<ChartSkeleton />}>
        <SpendingChart /> {/* lazy loads Recharts */}
      </Suspense>
    </>
  );
}
```

#### OPT-13: Expand Vite Manual Chunks Configuration

**Addresses:** B-13
**Priority:** P2 · Quick Win
**Impact:** Better cache efficiency; unchanged vendor chunks survive app code changes

**Proposed addition to `vite.config.ts`:**

```typescript
manualChunks(id) {
  if (id.includes('node_modules/react-dom') ||
      id.includes('node_modules/react-router-dom') ||
      id.includes('node_modules/react/')) {
    return 'vendor-react';
  }
  if (id.includes('node_modules/recharts') ||
      id.includes('node_modules/d3')) {
    return 'vendor-charts';
  }
  if (id.includes('node_modules/zod')) {
    return 'vendor-validation';
  }
  if (id.includes('node_modules/sql.js') ||
      id.includes('node_modules/wa-sqlite')) {
    return 'vendor-sqlite';
  }
}
```

#### OPT-14: Add `size-limit` Bundle Tracking to CI

**Addresses:** B-15
**Priority:** P1 · Quick Win
**Impact:** Catches bundle size regressions before merge

**Proposed:** Add `size-limit` to `apps/web/package.json`:

```json
{
  "size-limit": [
    { "path": "dist/assets/vendor-react-*.js", "limit": "60 KB", "gzip": true },
    { "path": "dist/assets/vendor-charts-*.js", "limit": "60 KB", "gzip": true },
    { "path": "dist/assets/vendor-sqlite-*.js", "limit": "350 KB", "gzip": true },
    { "path": "dist/assets/main-*.js", "limit": "80 KB", "gzip": true }
  ]
}
```

Add a `size-limit` step to the `web-ci.yml` workflow:

```yaml
- name: Check bundle size
  run: npx size-limit
```

#### OPT-15: Conditionally Disable Source Maps in Production

**Addresses:** B-14
**Priority:** P2 · Quick Win
**Impact:** Build outputs smaller; source code not exposed in production

```typescript
build: {
  sourcemap: process.env.NODE_ENV !== 'production',
}
```

---

### 3.3 Android Optimizations

#### OPT-20: Replace Material Icons Extended with Per-Icon Imports

**Addresses:** B-20
**Priority:** P1 · Medium Effort
**Impact:** APK size reduction of 2-3 MB

**Current:** `implementation(libs.compose.material.icons.extended)` bundles the full icon set.

**Proposed:** Replace with individual icon imports:

```kotlin
// Instead of:
import androidx.compose.material.icons.extended.*
// Use:
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AttachMoney
```

Then remove the `material-icons-extended` dependency and only include `material-icons-core`.

#### OPT-21: Defer Koin Initialization Off Main Thread

**Addresses:** B-21
**Priority:** P1 · Quick Win
**Impact:** Reduces cold start by 50-200ms

**Proposed:** Move Koin initialization to a background coroutine with an `Initializer` pattern, or defer non-essential modules:

```kotlin
override fun onCreate() {
    super.onCreate()
    initLogging() // Fast, keep on main thread

    // Core DI on main thread (minimal: UI dependencies only)
    startKoin {
        androidContext(this@FinanceApplication)
        modules(appModule) // UI-critical dependencies only
    }

    // Defer heavy modules
    lifecycleScope.launch(Dispatchers.Default) {
        getKoin().loadModules(listOf(dataModule, authModule))
        SyncWorker.enqueuePeriodicSync(this@FinanceApplication)
    }
}
```

#### OPT-22: Expand Baseline Profiles

**Addresses:** B-22
**Priority:** P2 · Medium Effort
**Impact:** Improved AOT compilation coverage → faster screen transitions

**Proposed:** Generate baseline profiles automatically using Jetpack Macrobenchmark:

```kotlin
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generateBaselineProfile() = rule.collect("com.finance.android") {
        pressHome()
        startActivityAndWait()
        // Navigate critical user journeys
        device.findObject(By.text("Dashboard")).click()
        device.findObject(By.text("Transactions")).click()
        device.findObject(By.text("Accounts")).click()
        device.findObject(By.text("Budgets")).click()
    }
}
```

Add a CI step to regenerate profiles when UI code changes.

#### OPT-23: Tighten ProGuard Rules

**Addresses:** B-23
**Priority:** P2 · Medium Effort
**Impact:** Better R8 optimization → smaller DEX, faster class loading

**Proposed:** Replace blanket `keep` rules with specific keeps:

```pro
# Instead of:
# -keep class com.powersync.** { *; }
# Use:
-keep class com.powersync.connector.** { *; }
-keep class com.powersync.db.schema.** { *; }
-keepclassmembers class com.powersync.** {
    kotlinx.serialization.KSerializer serializer(...);
}
```

Test with release builds after each rule change and verify no runtime crashes.

#### OPT-24: Add APK Size Tracking to Android CI

**Addresses:** B-24
**Priority:** P1 · Quick Win
**Impact:** Prevents APK size regressions

**Proposed addition to `android-ci.yml`:**

```yaml
- name: Check APK size
  run: |
    APK_SIZE=$(stat -f%z apps/android/build/outputs/apk/debug/*.apk 2>/dev/null || \
               stat --printf="%s" apps/android/build/outputs/apk/debug/*.apk)
    APK_SIZE_MB=$(echo "scale=2; $APK_SIZE / 1048576" | bc)
    echo "APK size: ${APK_SIZE_MB} MB"
    echo "### 📦 APK Size: ${APK_SIZE_MB} MB" >> $GITHUB_STEP_SUMMARY
    # Fail if over 15MB (per performance-baselines.md target)
    if (( $(echo "$APK_SIZE_MB > 15" | bc -l) )); then
      echo "::error::APK size ${APK_SIZE_MB} MB exceeds 15 MB budget"
      exit 1
    fi
```

#### OPT-25: Configure Compose Stability for KMP Models

**Addresses:** B-25
**Priority:** P1 · Medium Effort
**Impact:** Reduces unnecessary recompositions in lists and detail screens

**Proposed:** Create a Compose compiler stability configuration file:

```
// compose-stability.conf
com.finance.models.*
com.finance.models.types.*
com.finance.core.money.*
com.finance.core.aggregation.MonthlyTotal
```

Configure in `build.gradle.kts`:

```kotlin
composeCompiler {
    stabilityConfigurationFile = rootProject.file("config/compose-stability.conf")
}
```

---

### 3.4 iOS Optimizations

#### OPT-30: Add SQLite Indexes (via SQLDelight)

**Addresses:** B-30
**Priority:** P1 · Quick Win
**Impact:** Transaction list load from ~200ms to < 50ms for 10K records

See OPT-03 above. iOS shares the same SQLDelight schema as Android and the web migration.

#### OPT-31: Implement In-Memory Cache Actor for Frequent Reads

**Addresses:** B-31
**Priority:** P1 · Medium Effort
**Impact:** Eliminates redundant KMP bridge calls on navigation

**Proposed:**

```swift
actor FinanceDataCache {
    private var accounts: [Account]?
    private var budgetSummaries: [BudgetSummary]?
    private var lastRefresh: Date?
    private let maxAge: TimeInterval = 30 // 30s cache TTL

    func accounts(fallback: () async -> [Account]) async -> [Account] {
        if let cached = accounts, let lr = lastRefresh,
           Date().timeIntervalSince(lr) < maxAge {
            return cached
        }
        let fresh = await fallback()
        accounts = fresh
        lastRefresh = Date()
        return fresh
    }

    func invalidate() { accounts = nil; budgetSummaries = nil }
}
```

Invalidation triggered by sync completion events from the KMP `SyncEngine`.

#### OPT-32: Implement Batched Sync Writes

**Addresses:** B-32
**Priority:** P1 · Medium Effort
**Impact:** Sync write throughput 5-10× improvement

See OPT-04 above. The implementation is in the platform-specific sync persistence layer that applies `SyncChange` records to local SQLite.

#### OPT-33: Apply `.drawingGroup()` to Swift Charts

**Addresses:** B-33
**Priority:** P2 · Quick Win
**Impact:** Eliminates frame drops on chart screens with > 500 data points

```swift
Chart(data) { item in
    BarMark(x: .value("Date", item.date), y: .value("Amount", item.amount))
}
.drawingGroup() // Rasterize to Metal layer
.chartXVisibleDomain(length: 30) // Show 30 days, lazy-load rest
```

#### OPT-34: Add XCTest Performance Benchmarks to iOS CI

**Addresses:** B-34
**Priority:** P2 · Medium Effort
**Impact:** Automated regression detection for startup and list load

Add `-resultBundlePath` output parsing to `ios-ci.yml`:

```yaml
- name: Extract performance metrics
  if: always()
  run: |
    xcrun xcresulttool get test-results summary \
      --path apps/ios/.build/TestResults.xcresult \
      --compact | python3 -c "
    import json, sys
    data = json.load(sys.stdin)
    # Extract and validate performance metrics
    print(json.dumps(data.get('metrics', {}), indent=2))
    "
```

---

### 3.5 Windows Optimizations

#### OPT-40: Enable JVM Class Data Sharing (CDS) for Fast Startup

**Addresses:** B-40
**Priority:** P0 · Medium Effort
**Impact:** JVM startup reduction of 30-50% (estimated 1-2s savings)

**Proposed:** Configure CDS in the native distribution:

```kotlin
compose.desktop {
    application {
        mainClass = "com.finance.desktop.MainKt"
        jvmArgs += listOf(
            "-Xshare:auto",
            "-XX:SharedArchiveFile=app-cds.jsa",
            "-Xmx256m",
            "-Xms64m",
        )
        nativeDistributions {
            targetFormats(TargetFormat.Msi)
            packageName = "Finance"
            packageVersion = "1.0.0"
            jvmArgs += listOf("-Xshare:auto")
        }
    }
}
```

**Future consideration:** Evaluate GraalVM Native Image for sub-second startup. This is a strategic investment that requires validating compatibility with Compose Desktop, Koin, and Ktor.

#### OPT-41: Implement SQLite-Backed Repositories for Windows

**Addresses:** B-41
**Priority:** P0 · Strategic
**Impact:** Enables data persistence, realistic performance profiling, and parity with other platforms

The current `InMemory*Repository` implementations must be replaced with SQLDelight-backed repositories using the same schema as Android and iOS. This is a functional requirement, not just performance.

#### OPT-42: Configure JVM Heap and GC Tuning

**Addresses:** B-42
**Priority:** P1 · Quick Win
**Impact:** Reduces GC pauses and memory pressure

```kotlin
jvmArgs += listOf(
    "-Xmx256m",         // Max heap — Finance is a lightweight app
    "-Xms64m",          // Initial heap
    "-XX:+UseG1GC",     // G1 collector for low-latency
    "-XX:MaxGCPauseMillis=50", // Target max GC pause
)
```

#### OPT-43: Add Tests and Size Checks to Windows CI

**Addresses:** B-43
**Priority:** P1 · Medium Effort
**Impact:** Catches regressions before merge

**Proposed enhancements to `windows-ci.yml`:**

```yaml
- name: Run unit tests
  run: ./gradlew :apps:windows:test

- name: Check MSIX size
  run: |
    $msix = Get-ChildItem -Path apps/windows/build -Filter "*.msi" -Recurse
    if ($msix) {
      $sizeMB = [math]::Round($msix.Length / 1MB, 2)
      echo "MSIX size: $sizeMB MB"
      echo "### 📦 MSIX Size: $sizeMB MB" >> $env:GITHUB_STEP_SUMMARY
      if ($sizeMB -gt 80) {
        echo "::error::MSIX size $sizeMB MB exceeds 80 MB budget"
        exit 1
      }
    }
```

#### OPT-44: Defer Koin Initialization on Windows

**Addresses:** B-44
**Priority:** P2 · Quick Win
**Impact:** Window appears faster; DI loads in background

Same pattern as OPT-21: initialize critical-path modules synchronously, defer data/sync modules.

---

## 4. Performance Budget Definitions

### 4.1 Unified Budget (extends `performance.budget.json`)

The root `performance.budget.json` defines the top-level budgets. This section adds enforceable sub-budgets per platform.

#### Startup Time Budget Breakdown

| Phase                      | Web                                 | Android                         | iOS                             | Windows                         |
| -------------------------- | ----------------------------------- | ------------------------------- | ------------------------------- | ------------------------------- |
| **Framework init**         | < 200ms (React hydration)           | < 200ms (Koin + Compose)        | < 150ms (SwiftUI)               | < 500ms (JVM + Koin)            |
| **Database open**          | < 500ms (WASM compile + OPFS)       | < 300ms (SQLCipher open)        | < 200ms (SQLCipher open)        | < 300ms (SQLCipher open)        |
| **First meaningful paint** | < 1,000ms (shell + login/dashboard) | < 1,500ms (first Compose frame) | < 1,000ms (first SwiftUI frame) | < 1,500ms (first Compose frame) |
| **Interactive**            | < 2,000ms (full TTI)                | < 2,000ms (reportFullyDrawn)    | < 1,500ms (interactive)         | < 2,000ms (interactive)         |

#### Memory Budget

| Platform    | Idle     | Active (scrolling list) | Background sync      |
| ----------- | -------- | ----------------------- | -------------------- |
| **Web**     | < 80 MB  | < 120 MB                | N/A (service worker) |
| **Android** | < 100 MB | < 200 MB                | < 50 MB              |
| **iOS**     | < 80 MB  | < 150 MB                | < 30 MB              |
| **Windows** | < 150 MB | < 250 MB                | < 100 MB             |

#### Bundle/Artifact Size Budget

| Platform    | Artifact                     | Budget       | Enforcement |
| ----------- | ---------------------------- | ------------ | ----------- |
| **Web**     | Initial JS (gzipped)         | < 200 KB     | CI error    |
| **Web**     | Total initial load (gzipped) | < 500 KB     | CI error    |
| **Web**     | Lazy route chunk (gzipped)   | < 50 KB each | CI warning  |
| **Web**     | SQLite WASM (gzipped)        | < 350 KB     | CI warning  |
| **Android** | Release APK (universal)      | < 15 MB      | CI error    |
| **iOS**     | IPA (App Store)              | < 20 MB      | CI warning  |
| **Windows** | MSIX installer               | < 80 MB      | CI warning  |

#### Frame Rate Budget

| Scenario                    | Target                  | Measurement                                                 |
| --------------------------- | ----------------------- | ----------------------------------------------------------- |
| **Transaction list scroll** | ≥ 60 FPS (16.7ms/frame) | Android Systrace / iOS Core Animation / Web Performance API |
| **Chart animation**         | ≥ 30 FPS                | Acceptable for chart transitions                            |
| **Screen transition**       | < 300ms to first frame  | Platform navigation profiler                                |

### 4.2 Sync Performance Budget

| Operation                              | Budget  | Notes                     |
| -------------------------------------- | ------- | ------------------------- |
| **Single record sync**                 | < 1s    | Local commit → server ACK |
| **Incremental sync (50 records)**      | < 2s    | Normal catch-up           |
| **Batch sync (100 records)**           | < 3s    | Extended offline replay   |
| **Conflict resolution (per conflict)** | < 100ms | LWW merge                 |
| **Initial sync (1K records)**          | < 10s   | First-time setup          |

### 4.3 Edge Computation Budget

Per the edge-first principle, all aggregation runs locally:

| Computation                    | Budget  | Dataset                                   |
| ------------------------------ | ------- | ----------------------------------------- |
| **Net worth**                  | < 10ms  | 20 accounts                               |
| **Monthly spending**           | < 50ms  | 10K transactions                          |
| **Spending by category**       | < 50ms  | 10K transactions                          |
| **Dashboard full aggregation** | < 100ms | 10K transactions, 20 accounts, 10 budgets |
| **12-month spending trend**    | < 100ms | 10K transactions                          |

---

## 5. Before/After Metrics Framework

### 5.1 Instrumentation Points

Each optimization maps to specific metrics that must be measured before implementation (baseline) and after (validation).

#### KMP Shared (all platforms)

| Metric                             | Instrumentation                                                                    | Tool                |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| Aggregation latency                | `measureTimeMillis {}` around `FinancialAggregator` calls                          | KMP unit benchmarks |
| Sync cycle duration                | Already instrumented in `SyncEngine.syncNow()` via `SyncResult.Success.durationMs` | `SyncHealthMonitor` |
| DB query latency                   | `measureTimeMillis {}` around repository calls                                     | KMP unit benchmarks |
| DB write latency (batch vs single) | `measureTimeMillis {}` around insert methods                                       | KMP unit benchmarks |

#### Web

| Metric                | Instrumentation                                                                                              | Tool                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Cold start / TTI      | `performance.mark('app-init-start')` in `main.tsx`, `performance.mark('app-interactive')` after first render | `web-vitals`, Lighthouse CI |
| WASM init time        | `performance.mark('wasm-init-start')` / `performance.mark('wasm-init-end')` in `initDatabase()`              | Performance API             |
| Bundle size per chunk | `vite build` output + `size-limit`                                                                           | CI step                     |
| LCP / INP / CLS       | `web-vitals` library callbacks                                                                               | Lighthouse CI, field data   |
| Route chunk load time | `performance.mark()` around lazy import resolution                                                           | Performance API             |

#### Android

| Metric               | Instrumentation                                         | Tool                            |
| -------------------- | ------------------------------------------------------- | ------------------------------- |
| Cold start           | `reportFullyDrawn()` in `MainActivity`                  | Macrobenchmark                  |
| APK size             | `assembleRelease` output                                | CI step with size check         |
| Frame rendering      | Compose compiler metrics (`-Pcompose.compiler.metrics`) | CI step                         |
| Recomposition count  | Compose compiler reports                                | Android Studio Layout Inspector |
| Memory (idle/active) | `adb shell dumpsys meminfo`                             | CI step on emulator             |

#### iOS

| Metric                  | Instrumentation                                             | Tool                       |
| ----------------------- | ----------------------------------------------------------- | -------------------------- |
| Cold start              | `os_signpost` from `FinanceApp.init` to first `body` render | Instruments Time Profiler  |
| Transaction list load   | `measure(metrics:)` in XCTest                               | XCTest performance tests   |
| KMP bridge call latency | `os_signpost` around KMP calls                              | Custom Instruments trace   |
| Memory footprint        | Xcode Memory Debugger                                       | Instruments Allocations    |
| Frame drops             | Animation Hitches instrument                                | Instruments Core Animation |

#### Windows

| Metric            | Instrumentation                                              | Tool                          |
| ----------------- | ------------------------------------------------------------ | ----------------------------- |
| Cold start        | `System.nanoTime()` at `main()` entry to first Compose frame | Custom logging                |
| JVM heap usage    | `-XX:+PrintGCDetails` + JFR                                  | VisualVM, JDK Flight Recorder |
| MSIX size         | Post-build file size check                                   | CI step                       |
| GC pause duration | JFR event `jdk.GCPhasePause`                                 | JDK Mission Control           |

### 5.2 Baseline Collection Process

Before implementing any optimization:

1. **Establish baseline:** Run the relevant benchmark 5+ times and record P50/P95.
2. **Document baseline** in the PR description with raw numbers.
3. **Implement optimization.**
4. **Re-run benchmark** same conditions, same iteration count.
5. **Document after metrics** in the PR description.
6. **Report delta** as absolute and percentage change.

Example PR template section:

```markdown
## Performance Impact

| Metric                           | Before (P50) | After (P50) | Delta  |
| -------------------------------- | ------------ | ----------- | ------ |
| Dashboard aggregation (10K txns) | 340ms        | 28ms        | -91.8% |
| Monthly trend (12 months)        | 180ms        | 15ms        | -91.7% |
```

---

## 6. CI Integration Recommendations

### 6.1 Performance CI Gates by Platform

#### Web (`web-ci.yml`)

| Gate                         | Tool                       | Threshold             | Enforcement        |
| ---------------------------- | -------------------------- | --------------------- | ------------------ |
| Lighthouse Performance       | `lighthouse-ci-action`     | ≥ 90                  | Warning (existing) |
| Lighthouse Accessibility     | `lighthouse-ci-action`     | ≥ 95                  | Error (existing)   |
| Bundle size (per chunk)      | `size-limit`               | Per budget table §4.1 | **Error** (new)    |
| Performance budget (timings) | `lighthouserc-budget.json` | Per `budget.json`     | Error (existing)   |

**New steps to add:**

```yaml
# After build, before Lighthouse
- name: Bundle size check
  run: npx size-limit

- name: Bundle analysis
  run: |
    echo "### 📦 Bundle Analysis" >> $GITHUB_STEP_SUMMARY
    du -sh apps/web/dist/assets/*.js | sort -rh >> $GITHUB_STEP_SUMMARY
```

#### Android (`android-ci.yml`)

| Gate                     | Tool                         | Threshold   | Enforcement             |
| ------------------------ | ---------------------------- | ----------- | ----------------------- |
| APK size                 | `stat` on APK                | < 15 MB     | **Error** (new)         |
| Unit tests               | `testDebugUnitTest`          | Pass        | Error (existing)        |
| Compose compiler metrics | `-Pcompose.compiler.metrics` | Report only | **Informational** (new) |

**New steps:**

```yaml
- name: Compose compiler metrics
  run: |
    ./gradlew :apps:android:assembleRelease \
      -Pcompose.compiler.metrics=true \
      -Pcompose.compiler.reportsDestination=build/compose-metrics
  continue-on-error: true

- name: Upload Compose metrics
  uses: actions/upload-artifact@v4
  with:
    name: compose-metrics
    path: apps/android/build/compose-metrics/
```

#### iOS (`ios-ci.yml`)

| Gate                   | Tool                | Threshold                   | Enforcement                                                                 |
| ---------------------- | ------------------- | --------------------------- | --------------------------------------------------------------------------- |
| Unit/perf tests        | `xcodebuild test`   | Pass                        | Error (existing)                                                            |
| XCTest perf benchmarks | `-resultBundlePath` | Report only                 | **Informational** (new — elevate to warning once baselines are established) |
| Coverage thresholds    | `xccov`             | ViewModel ≥ 80%, View ≥ 60% | Error (existing)                                                            |

#### Windows (`windows-ci.yml`)

| Gate            | Tool                            | Threshold | Enforcement                                 |
| --------------- | ------------------------------- | --------- | ------------------------------------------- |
| Build           | `./gradlew :apps:windows:build` | Pass      | Error (existing)                            |
| Unit tests      | `./gradlew :apps:windows:test`  | Pass      | **Error** (new)                             |
| MSIX size       | File size check                 | < 80 MB   | **Warning** (new)                           |
| Package success | `packageMsi`                    | Pass      | **Error** (change from `continue-on-error`) |

### 6.2 Cross-Platform KMP CI Gate

Add KMP benchmark tests to the shared CI pipeline:

```yaml
# In ci.yml or a new kmp-perf.yml
- name: KMP performance benchmarks
  run: |
    ./gradlew :packages:core:jvmTest \
      -Dtest.filter="*Benchmark*" \
      --parallel --build-cache
```

Example benchmark test:

```kotlin
class AggregationBenchmarkTest {
    @Test
    fun monthlySpendingTrend_10kTransactions_under100ms() {
        val transactions = generateTransactions(10_000)
        val elapsed = measureTimeMillis {
            FinancialAggregator.monthlySpendingTrend(transactions, 12, today)
        }
        assertTrue(elapsed < 100, "Expected < 100ms, got ${elapsed}ms")
    }
}
```

### 6.3 Performance Regression Detection Strategy

| Stage                 | Action                                                               | Tooling                             |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| **PR**                | Run affected-only perf checks                                        | Turborepo filter + platform CI      |
| **Pre-merge**         | All perf gates must pass or be explicitly overridden                 | GitHub required status checks       |
| **Post-merge (main)** | Run 3× Lighthouse, upload artifacts, track trends                    | `web-ci.yml` with `runs: 3` on push |
| **Nightly**           | Full perf suite including Macrobenchmark, XCTest perf, JVM profiling | Scheduled workflow                  |
| **Release**           | Manual validation against performance-baselines.md targets           | Release checklist                   |

---

## 7. Implementation Roadmap

### Phase 1: Quick Wins (Sprint 7 — 1 week)

| Optimization                        | Effort    | Bottleneck | Impact                        |
| ----------------------------------- | --------- | ---------- | ----------------------------- |
| OPT-03: SQLite indexes              | Quick Win | B-04, B-30 | All platforms: query perf     |
| OPT-05: Cap MetricsCollector buffer | Quick Win | B-03       | All: memory safety            |
| OPT-11: D3 modular imports          | Quick Win | B-11       | Web: -40-50 KB bundle         |
| OPT-13: Vite manual chunks          | Quick Win | B-13       | Web: cache efficiency         |
| OPT-14: `size-limit` in web CI      | Quick Win | B-15       | Web: regression detection     |
| OPT-15: Conditional source maps     | Quick Win | B-14       | Web: production hardening     |
| OPT-24: APK size tracking in CI     | Quick Win | B-24       | Android: regression detection |
| OPT-42: JVM heap tuning             | Quick Win | B-42       | Windows: GC improvement       |

### Phase 2: Core Optimizations (Sprint 8 — 2 weeks)

| Optimization                     | Effort    | Bottleneck | Impact                             |
| -------------------------------- | --------- | ---------- | ---------------------------------- |
| OPT-01: Single-pass aggregation  | Medium    | B-01       | All: 10-12× dashboard speedup      |
| OPT-04: Batched sync inserts     | Medium    | B-05, B-32 | All: 5-10× sync write throughput   |
| OPT-10: Non-blocking WASM init   | Medium    | B-10       | Web: -500ms to 1.5s cold start     |
| OPT-12: Lazy-load charts         | Medium    | B-12       | Web: 0 KB initial chart cost       |
| OPT-21: Defer Koin init          | Quick Win | B-21       | Android: -50-200ms cold start      |
| OPT-25: Compose stability config | Medium    | B-25       | Android: fewer recompositions      |
| OPT-31: iOS cache actor          | Medium    | B-31       | iOS: eliminate redundant KMP calls |
| OPT-43: Windows CI hardening     | Medium    | B-43       | Windows: quality gates             |

### Phase 3: Strategic Improvements (Sprint 9-10)

| Optimization                           | Effort    | Bottleneck | Impact                                 |
| -------------------------------------- | --------- | ---------- | -------------------------------------- |
| OPT-02: Aggregation caching            | Medium    | B-02       | All: eliminate redundant computation   |
| OPT-20: Remove Material Icons Extended | Medium    | B-20       | Android: -2-3 MB APK                   |
| OPT-22: Expanded baseline profiles     | Medium    | B-22       | Android: faster transitions            |
| OPT-23: Tighten ProGuard rules         | Medium    | B-23       | Android: better R8 optimization        |
| OPT-33: Swift Charts drawingGroup      | Quick Win | B-33       | iOS: chart frame rate                  |
| OPT-34: XCTest perf in iOS CI          | Medium    | B-34       | iOS: automated regression detection    |
| OPT-40: JVM CDS for Windows            | Medium    | B-40       | Windows: -30-50% startup               |
| OPT-41: SQLite repos for Windows       | Strategic | B-41       | Windows: data persistence (functional) |

### Phase 4: Advanced (Beta phase)

| Optimization                              | Effort    | Bottleneck | Impact                                |
| ----------------------------------------- | --------- | ---------- | ------------------------------------- |
| GraalVM native-image evaluation (Windows) | Strategic | B-40       | Windows: sub-second startup           |
| Android Macrobenchmark in CI              | Strategic | B-22       | Android: automated startup benchmarks |
| MetricKit integration (iOS)               | Medium    | —          | iOS: field performance data           |
| `web-vitals` field data collection        | Medium    | —          | Web: real-user performance data       |
| Nightly performance regression suite      | Strategic | —          | All: automated trend detection        |

---

## Open Questions

1. **Windows SQLite persistence priority:** Should B-41 (SQLite repositories) be elevated to Phase 1 since it's a functional blocker for realistic performance profiling?
2. **GraalVM compatibility:** Has Compose Desktop + Koin + Ktor been validated with GraalVM native-image? Need a spike to assess feasibility.
3. **Recharts vs. custom charts:** Should we invest in a lightweight custom chart library instead of lazy-loading Recharts? Depends on chart complexity requirements.
4. **Nightly CI runner cost:** The full perf suite (Macrobenchmark on emulator, XCTest perf on macOS, Windows profiling) requires all three runner types. Estimated cost: ~$50/month for nightly runs — is this acceptable?
5. **Performance dashboard:** Should we invest in a Grafana/similar dashboard to track performance trends over time, or is GitHub Actions artifact trending sufficient?

---

## Revision History

| Date       | Change                                                     | Author           |
| ---------- | ---------------------------------------------------------- | ---------------- |
| 2025-07-15 | Initial cross-platform performance optimization plan (#76) | System Architect |
