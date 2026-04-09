# iOS Performance Guidelines

Performance targets, profiling strategies, and optimization patterns for the
Finance iOS app. All engineers should review this before shipping new features.

---

## Performance Targets

| Metric                         | Target   | Measurement Tool             |
| ------------------------------ | -------- | ---------------------------- |
| Cold launch to interactive     | < 1.5 s  | Instruments → App Launch     |
| Screen transitions             | < 300 ms | Instruments → Time Profiler  |
| List scrolling                 | 60 FPS   | Instruments → Core Animation |
| Transaction list (1 000 items) | < 500 ms | Instruments → Time Profiler  |
| Memory (idle dashboard)        | < 50 MB  | Instruments → Allocations    |
| Widget timeline refresh        | < 2 s    | `os_signpost` in provider    |
| KMP bridge call (single query) | < 100 ms | `os_signpost` around call    |

---

## Profiling Toolkit

### Instruments Templates

| Template           | Use Case                                        |
| ------------------ | ----------------------------------------------- |
| **Time Profiler**  | CPU hot-spots, slow function calls              |
| **Allocations**    | Memory growth, retain cycles, transient spikes  |
| **Leaks**          | Retain cycles in closures, `@Observable` graphs |
| **Core Animation** | Off-screen rendering, dropped frames, blending  |
| **App Launch**     | Pre-main and post-main startup time breakdown   |
| **Network**        | Supabase sync payload sizes, request latency    |
| **Energy Log**     | Background task energy impact, GPS/BLE usage    |

### os_signpost for Custom Spans

Use `os_signpost` to bracket critical sections so they appear in Instruments:

```swift
import os

private let perfLog = OSLog(subsystem: "com.finance", category: .pointsOfInterest)

func loadDashboard() async {
    os_signpost(.begin, log: perfLog, name: "Dashboard Load")
    defer { os_signpost(.end, log: perfLog, name: "Dashboard Load") }
    // …
}
```

### MetricKit

Register `MXMetricManager` in the App Delegate to receive daily performance
diagnostics from the field:

- Hang rate (> 250 ms main-thread stalls)
- Launch duration histogram
- Memory peak footprint
- Disk write volume

---

## Optimization Checklist

### Views & Lists

- [x] Use `LazyVStack` / `List` for all scrollable content — never `VStack`
      with > ~20 children.
- [x] Apply `.id()` on list items keyed to stable identifiers to avoid
      unnecessary diffing.
- [x] Implement pagination for transactions (50 items per page via
      `LIMIT`/`OFFSET` in SQLDelight queries).
- [x] Use `.drawingGroup()` on complex Swift Charts to rasterise into a
      single Metal layer.
- [x] Prefer `@Observable` (Observation framework) over `ObservableObject` —
      finer-grained invalidation reduces unnecessary view re-renders.

### Data Layer

- [x] All reads go to local SQLite first (edge-first architecture).
- [ ] Index frequently filtered columns (`account_id`, `date`, `category`)
      in SQLDelight `.sq` files.
- [x] KMP bridge calls are `async` — never block the main thread.
- [ ] Cache frequently read data (account list, budget summaries) in an
      in-memory `actor` to avoid repeated round-trips through KMP.
- [ ] Batch inserts during sync using SQLDelight transactions.

### Images & Assets

- [x] Use SF Symbols for all iconography — zero image decoding cost.
- [x] If receipt images are added, use `preparingThumbnail(of:)` for list
      cells and load full-size on detail view only.
- [ ] Compress exported PDFs with `CGContext` Quartz filters.

### Background & Sync

- [x] `BGAppRefreshTask` registered with 30-minute minimum interval.
- [ ] Use `URLSession` background transfers for sync payloads > 1 MB.
- [x] Debounce rapid-fire writes (e.g., amount text field) before
      persisting to SQLite.

### Memory

- [x] Verify no retain cycles in `@Observable` view models — use
      `Instruments → Leaks` after every sprint.
- [ ] Release chart data arrays when navigating away from the Charts tab
      (use `.onDisappear`).
- [x] Avoid storing full transaction history in memory — use pagination.

---

## Known Considerations

### KMP Bridge Overhead

Kotlin/Native ↔ Swift calls cross an interop boundary. While individual
calls are fast (< 1 ms), avoid tight loops that make thousands of bridge
calls. Instead, batch data on the Kotlin side and return a single list.

### SQLite Query Performance

- Always query indexed columns (`id`, `account_id`, `date`).
- Use `EXPLAIN QUERY PLAN` in the SQLDelight IDE plugin to verify index
  usage.
- Avoid `SELECT *` — project only the columns needed for the current screen.

### Swift Charts Rendering

`BarMark` and `LineMark` with > 500 data points can cause frame drops.
Mitigation:

1. Aggregate data (daily → weekly → monthly) before charting.
2. Wrap the `Chart` in `.drawingGroup()` to rasterise off the main thread.
3. Use `.chartXVisibleDomain()` to limit the visible range and lazy-load
   adjacent data.

### Dynamic Type at Extreme Sizes

At AX5 (the largest accessibility text size), list rows can grow
significantly. Test with `Settings → Accessibility → Larger Text → AX5`:

- Ensure no text truncation without `lineLimit(nil)`.
- Verify tap targets remain ≥ 44×44 pt.
- Check that `ScrollView` accommodates taller content without clipping.

---

## Automated Performance Testing

### XCTest Performance Metrics

Add `measure(metrics:)` blocks to unit tests for regression detection:

```swift
func testTransactionListLoadPerformance() {
    let repo = StubTransactionRepository()
    repo.transactionsToReturn = generateTransactions(count: 1000)

    measure(metrics: [XCTClockMetric(), XCTMemoryMetric()]) {
        let vm = TransactionsViewModel(repository: repo)
        let expectation = expectation(description: "load")
        Task { @MainActor in
            await vm.loadTransactions()
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 5)
    }
}
```

### CI Integration

- Run `xcodebuild test` with `-resultBundlePath` to capture `.xcresult`
  bundles.
- Extract performance metrics from the result bundle using
  `xcresulttool get --format json`.
- Fail CI if cold launch exceeds 2.0 s or transaction list load exceeds
  800 ms (headroom above targets).

---

## Revision History

| Date       | Change                                    | Author       |
| ---------- | ----------------------------------------- | ------------ |
| 2025-07-14 | Initial performance guidelines (Sprint 6) | iOS Platform |
