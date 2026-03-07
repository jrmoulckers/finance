# Performance Guide

This guide defines performance targets, profiling techniques, and optimization best practices for the Finance app across all platforms.

## Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| Cold start | < 2 s | Time from app launch to interactive UI |
| Scroll performance | 60 fps | No dropped frames in transaction lists |
| Memory budget | < 150 MB | Resident memory during normal use |
| SQLite aggregation | < 100 ms | SUM/GROUP BY over 10K+ rows |
| Dashboard load | < 200 ms | All aggregations for main screen |
| Sync payload parse | < 50 ms | Deserialize 100-transaction batch |

## Running Benchmarks

### Gradle benchmark script

```bash
# Run all benchmark suites
./gradlew -p tools/perf benchmark

# Filter to a specific suite
./gradlew -p tools/perf benchmark -Pbenchmark.filter=financial

# Adjust iterations
./gradlew -p tools/perf benchmark -Pbenchmark.iterations=500 -Pbenchmark.warmup=50
```

### Kotlin benchmark tests

```bash
# Run MoneyOperations benchmarks
./gradlew :packages:core:jvmTest --tests "*.benchmark.MoneyOperationsBenchmark"

# Run aggregation benchmarks
./gradlew :packages:core:jvmTest --tests "*.benchmark.AggregationBenchmark"
```

## Profiling by Platform

### Android

1. **Android Studio Profiler** — CPU, memory, and energy profiling in real time.
2. **System Trace** — Use `Debug.startMethodTracing()` or record a system trace from the Profiler tab to capture frame timings and method-level cost.
3. **Baseline Profiles** — Generate with `androidx.benchmark.macro` to improve startup and scroll performance.
4. **Strict Mode** — Enable in debug builds to catch disk/network I/O on the main thread:
   ```kotlin
   StrictMode.setThreadPolicy(
       StrictMode.ThreadPolicy.Builder()
           .detectAll()
           .penaltyLog()
           .build()
   )
   ```

### iOS

1. **Xcode Instruments** — Use the Time Profiler, Allocations, and Core Animation instruments.
2. **MetricKit** — Collect performance metrics from production devices via `MXMetricManager`.
3. **Signposts** — Annotate code with `os_signpost` for fine-grained profiling in Instruments:
   ```swift
   let log = OSLog(subsystem: "com.finance", category: "performance")
   os_signpost(.begin, log: log, name: "Dashboard Load")
   // ... load dashboard
   os_signpost(.end, log: log, name: "Dashboard Load")
   ```

### Web (PWA)

1. **Chrome DevTools Performance tab** — Record runtime performance, inspect flame charts, and identify long tasks.
2. **Lighthouse** — Audit startup performance, accessibility, and PWA compliance.
3. **`performance.mark()` / `performance.measure()`** — Add custom timing markers:
   ```javascript
   performance.mark('dashboard-start');
   // ... render dashboard
   performance.mark('dashboard-end');
   performance.measure('Dashboard Load', 'dashboard-start', 'dashboard-end');
   ```

### Windows (Compose Desktop)

1. **JVM Flight Recorder (JFR)** — Low-overhead profiling built into the JVM:
   ```bash
   java -XX:StartFlightRecording=duration=60s,filename=profile.jfr -jar app.jar
   ```
2. **VisualVM** — Monitor heap, threads, and CPU in real time.
3. **Windows Performance Analyzer (WPA)** — System-level ETW traces for GPU, disk, and thread analysis.

## SQLite Performance

### Query optimization

- **Index critical columns**: `date`, `category_id`, `account_id`, `household_id`, and `type` on the transactions table.
- **Use covering indexes** for frequent aggregation queries so SQLite can answer from the index alone.
- **Prefer `INTEGER` primary keys** — SQLite uses the rowid as primary key for integer PKs, avoiding an extra index.
- **Batch writes in transactions**: wrap multi-row INSERTs/UPDATEs in `BEGIN`/`COMMIT` to avoid per-statement journal syncs.

### Monitoring

- Enable SQLite query logging in debug builds to catch slow queries:
  ```kotlin
  // SQLDelight driver callback
  driver.execute(null, "PRAGMA journal_mode=WAL", 0)
  ```
- Target: no single query above 100 ms. Aggregation queries spanning 10K+ rows should stay under 100 ms with proper indexes.

## Compose Performance Best Practices

These apply to both Android (Jetpack Compose) and Windows (Compose Desktop).

### Use stable types

Compose skips recomposition for stable parameters. Ensure data classes used in composables are stable:

```kotlin
// Stable — all properties are immutable primitives or stable types
data class TransactionItem(
    val id: String,
    val amount: Long,
    val payee: String,
    val date: String,
)

// Unstable — mutable list triggers recomposition every time
data class TransactionList(
    val items: MutableList<TransactionItem>, // use List<> instead
)
```

### Use `key()` in lazy lists

Provide stable keys so Compose can reuse compositions when items move:

```kotlin
LazyColumn {
    items(transactions, key = { it.id }) { transaction ->
        TransactionRow(transaction)
    }
}
```

### Use `derivedStateOf` for derived values

Avoid recalculating derived values on every recomposition:

```kotlin
val totalSpending by remember {
    derivedStateOf {
        transactions.filter { it.type == "EXPENSE" }.sumOf { it.amount }
    }
}
```

### Avoid allocations in composition

- Do not create lambdas, lists, or objects inside composable functions unless wrapped in `remember`.
- Use `remember(key) { ... }` to cache expensive computations.
- Prefer `ImmutableList` from `kotlinx-collections-immutable` for list parameters.

### Minimize recomposition scope

- Extract frequently-changing UI into small composables so recomposition is scoped narrowly.
- Use `Modifier.drawWithContent` or `Canvas` for custom drawing instead of recomposing.

## Memory Management

### Budget: < 150 MB resident memory

- **Transaction lists**: load in pages (50–100 items). Do not hold the full transaction history in memory.
- **Images/icons**: use vector drawables or SVGs, not bitmaps. Cache icons per category.
- **Sync payloads**: stream-parse large sync responses rather than buffering the full JSON in memory.
- **SQLite cursors**: close cursors promptly. Use `use {}` blocks for auto-closing.

### Leak detection

- **Android**: Enable LeakCanary in debug builds. It detects Activity, Fragment, and ViewModel leaks automatically.
- **iOS**: Use Xcode's Memory Graph Debugger to find retain cycles.
- **JVM (Windows)**: Use VisualVM or JFR heap dumps to identify unexpected object retention.

## Startup Optimization

### Target: < 2 s cold start

1. **Defer non-essential work** — Initialize analytics, sync, and background tasks after the first frame renders.
2. **Lazy initialization** — Use `lazy {}` for singletons that are not needed on startup.
3. **Avoid disk I/O on main thread** — Load preferences, tokens, and cached data on a background dispatcher.
4. **Minimize dependency injection graph** — Only construct the objects needed for the launch screen.
5. **Android-specific**: Use a splash screen with `SplashScreen` API. Generate Baseline Profiles to pre-compile hot paths.
6. **iOS-specific**: Minimize work in `application(_:didFinishLaunchingWithOptions:)`. Use `@MainActor` carefully.

## CI Integration

Track performance regressions in CI by running the benchmark test suite on every PR:

```yaml
# Example GitHub Actions step
- name: Run performance benchmarks
  run: ./gradlew :packages:core:jvmTest --tests "*.benchmark.*"
```

Compare results against baseline thresholds defined in the benchmark tests. Any test failure indicates a regression that must be investigated before merging.
