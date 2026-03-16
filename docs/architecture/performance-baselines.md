





---

## 8. Measurement & Reporting

### Automated Measurement (CI)

| What                    | How                                        | When                     |
| ----------------------- | ------------------------------------------ | ------------------------ |
| Web Lighthouse scores   | `lighthouserc.json` via Lighthouse CI      | Every PR (affected-only) |
| Web bundle size         | `vite build` output + `size-limit`         | Every PR (affected-only) |
| Android APK size        | `assembleRelease` output log               | Every PR (affected-only) |
| Android startup         | Macrobenchmark (when configured)           | Nightly or per-release   |
| iOS startup             | XCTest performance tests (when configured) | Nightly or per-release   |
| Client DB query latency | KMP unit benchmarks                        | Every PR (affected-only) |

### Manual Measurement (Beta)

| What                          | How                                         | When                   |
| ----------------------------- | ------------------------------------------- | ---------------------- |
| Real-world cold start         | Manual timing across test devices           | Weekly during beta     |
| Sync performance              | `SyncHealthMonitor` metrics from beta users | Continuous during beta |
| User-perceived responsiveness | Beta tester feedback surveys                | Bi-weekly during beta  |

### Baseline Calibration

After collecting 2 weeks of beta data:

1. Calculate P50, P95, P99 for each metric
2. Compare against targets in this document
3. Adjust targets if consistently exceeded (tighten) or consistently missed (relax with justification)
4. Lock final baselines for GA release
5. Configure alerting thresholds based on locked baselines (see [Alerting Rules](alerting-rules.md))

---

## 9. Regression Prevention

### CI Gates

| Gate                           | Enforcement | Action on Failure         |
| ------------------------------ | ----------- | ------------------------- |
| Lighthouse Performance ≥ 90   | Warning     | PR flagged, not blocked   |
| Lighthouse Accessibility ≥ 95 | Error       | PR blocked                |
| Bundle size budget exceeded    | Warning     | PR flagged with size diff |
| Web Core Web Vitals regression | Warning     | PR flagged                |

### Release Gates

| Gate                                 | Enforcement | Action on Failure          |
| ------------------------------------ | ----------- | -------------------------- |
| All Lighthouse categories ≥ target   | Required    | Release blocked            |
| No P0/P1 performance regressions     | Required    | Release blocked            |
| Beta metrics within ±10% of baseline | Recommended | Investigate before release |

---

## 10. Tool Summary

Quick reference of all measurement tools by category:

| Category       | Tool                                   | Platform  | Purpose                                        |
| -------------- | -------------------------------------- | --------- | ---------------------------------------------- |
| **Startup**    | Jetpack Macrobenchmark                 | Android   | Automated cold/warm start benchmarks           |
| **Startup**    | Xcode Instruments (App Launch)         | iOS       | Time Profiler for launch sequence              |
| **Startup**    | Lighthouse CI                          | Web       | TTI, LCP, and overall performance scoring      |
| **Sync**       | `SyncHealthMonitor`                    | All (KMP) | Client-side sync health reactive metrics       |
| **Sync**       | `MetricsCollector`                     | All (KMP) | Consent-gated sync performance event recording |
| **Sync**       | `sync_health_logs` table               | Server    | Server-side sync performance aggregation       |
| **Database**   | `measureTimeMillis {}`                 | All (KMP) | Inline query/write timing in Kotlin code       |
| **Database**   | SQLite `EXPLAIN QUERY PLAN`            | All       | Index usage verification                       |
| **Database**   | Supabase Dashboard                     | Server    | PostgreSQL query latency monitoring            |
| **UI**         | Android Studio Profiler                | Android   | CPU, memory, frame rendering traces            |
| **UI**         | Xcode Instruments (Core Animation)     | iOS       | Frame rendering and animation hitches          |
| **UI**         | Chrome DevTools Performance            | Web       | Long tasks, INP, rendering timeline            |
| **Bundle**     | `vite build` / `size-limit`            | Web       | JS bundle size tracking and CI enforcement     |
| **Bundle**     | `source-map-explorer`                  | Web       | Dependency size analysis via source maps       |
| **Bundle**     | Gradle `assembleRelease`               | Android   | APK size measurement                           |
| **Bundle**     | Xcode Archive / Fastlane `gym`         | iOS       | IPA size measurement                           |
| **Battery**    | Battery Historian                      | Android   | Wakelock, CPU, and network usage analysis      |
| **Battery**    | Xcode Energy Diagnostics               | iOS       | Energy impact profiling                        |
| **API**        | `k6` / `hey`                           | Server    | Load testing and response time measurement     |
| **API**        | External uptime monitor                | Server    | Health check response time tracking            |
| **Web Vitals** | `web-vitals` npm package               | Web       | Field measurement of LCP, INP, CLS, TTFB      |
| **Web Vitals** | Chrome UX Report (CrUX)               | Web       | Real-user performance data (post-launch)       |

---

## 11. Open Questions

1. **Android Macrobenchmark setup:** When will automated Android startup benchmarks be available in CI?
2. **iOS performance test runner:** Which CI runner supports XCTest performance tests? (macOS runner cost implications)
3. **PowerSync latency measurement:** How to instrument PowerSync round-trip latency independent of application logic?
4. **WASM startup optimization:** Current SQLite WASM init time is unknown — needs profiling during beta.
5. **Windows JVM startup:** JVM cold start may push Windows startup > 2s target. Evaluate GraalVM native-image or other AOT compilation.
