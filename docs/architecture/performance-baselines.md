# Performance Baselines

**Status:** Proposed — targets to be validated during beta
**Date:** 2026-03-15
**Updated:** 2026-06-15
**Related:** [Monitoring Architecture](monitoring.md) · [Alerting Rules](alerting-rules.md) · [CI/CD Strategy](0006-cicd-strategy.md)
**Tickets:** #410, #417

---

## Overview

This document defines target performance baselines for the Finance app across all platforms. These targets represent the performance contract with users — regressions beyond these thresholds trigger P2/P3 alerts and block releases.

Baselines will be measured and calibrated during the beta phase using real-world usage data. Until beta data is available, these targets are based on industry benchmarks for financial applications and the team's architectural expectations.

Each section below defines the target metric, the tools and methodology used to measure it, and the CI/release enforcement level.

---

## 1. App Startup Performance

### Cold Start Time

The time from app launch (user taps icon / opens URL) to interactive UI.

| Platform    | Target | Measurement Method                      | Notes                                                  |
| ----------- | ------ | --------------------------------------- | ------------------------------------------------------ |
| **Android** | < 2.0s | `reportFullyDrawn()` / Macrobenchmark   | Includes Koin DI init, SQLCipher open, first frame     |
| **iOS**     | < 1.5s | `MetricKit` / Instruments Time Profiler | Includes Keychain access, SQLCipher open, first frame  |
| **Web**     | < 2.0s | Lighthouse TTI / `performance.mark()`   | Includes WASM SQLite init, service worker activation   |
| **Windows** | < 2.0s | Custom timing in Application entry      | Includes DPAPI token load, SQLCipher open, first frame |

### Web-Specific Startup Metrics

| Metric                             | Target | Notes                                                    |
| ---------------------------------- | ------ | -------------------------------------------------------- |
| **LCP** (Largest Contentful Paint) | < 2.5s | Primary loading metric — see also Core Web Vitals below  |
| **TTI** (Time to Interactive)      | < 3.5s | Main thread idle after initial render, user can interact |

### Warm Start Time

The time from app resume (background → foreground) to interactive UI.

| Platform    | Target  | Notes                                       |
| ----------- | ------- | ------------------------------------------- |
| **Android** | < 500ms | Activity `onResume` to interactive          |
| **iOS**     | < 500ms | `applicationDidBecomeActive` to interactive |
| **Web**     | < 300ms | Page visibility change to interactive       |
| **Windows** | < 500ms | Window activation to interactive            |

### Measurement Methodology — App Startup

| Platform    | Tool                            | How to Measure                                                                                                                                                   |
| ----------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Android** | Android Studio Profiler         | Use **CPU Profiler → Startup** trace. Record from process start to `reportFullyDrawn()`. Measure on a mid-range device (e.g., Pixel 6a) with release build.      |
| **Android** | Jetpack Macrobenchmark          | Write a `StartupBenchmark` test using `StartupMode.COLD`. Run via `./gradlew :benchmark:connectedAndroidTest`. Produces P50/P95 over multiple iterations.        |
| **iOS**     | Xcode Instruments Time Profiler | Select **App Launch** template. Measure from process launch to first meaningful frame. Test on a baseline device (e.g., iPhone 13) with Release configuration.   |
| **iOS**     | MetricKit                       | Collect `MXAppLaunchMetric` histograms from beta users. Aggregate P50/P95 in analytics dashboard.                                                                |
| **Web**     | Lighthouse CI                   | Run `lhci autorun` in CI against the production build. TTI and LCP are reported automatically. Use `--preset=desktop` and `--preset=mobile` for both profiles.   |
| **Web**     | `performance.mark()` API        | Instrument `main.tsx` with `performance.mark('app-init-start')` and mark completion after first render. Collect via `PerformanceObserver` in `MetricsCollector`. |
| **Windows** | Custom `System.nanoTime()`      | Capture timestamp at `main()` entry and after first Compose frame render. Log delta to `MetricsCollector`. Profile with VisualVM or JFR for detailed breakdown.  |

---

## 2. Sync Performance

### Initial Sync

First-time sync after account creation or full re-sync.

| Metric                 | Target  | Dataset                                                          |
| ---------------------- | ------- | ---------------------------------------------------------------- |
| **Time to first data** | < 5.0s  | 1 household, 3 accounts, 50 transactions, 5 categories, 1 budget |
| **Full initial sync**  | < 10.0s | 1,000 records — complete download + local DB write               |

### Incremental Sync

Ongoing sync of new changes.

| Metric                            | Target  | Notes                                             |
| --------------------------------- | ------- | ------------------------------------------------- |
| **Single transaction sync**       | < 1.0s  | Time from local commit to server acknowledgment   |
| **Incremental sync (50 records)** | < 2.0s  | Typical multi-device catch-up after brief offline |
| **Batch sync (100 records)**      | < 3.0s  | Bulk import or extended offline catch-up          |
| **Conflict resolution**           | < 100ms | Per-conflict resolution time (LWW merge)          |

### Offline Queue Replay

Processing locally queued mutations when connectivity is restored.

| Metric                            | Target | Notes                                                         |
| --------------------------------- | ------ | ------------------------------------------------------------- |
| **Replay (100 queued mutations)** | < 5.0s | Sequential replay from PowerSync upload queue after reconnect |
| **Replay throughput**             | ≥ 20/s | Minimum mutations processed per second during replay          |

### Sync Health Thresholds

Aligned with `HealthStatus.kt` constants in `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/`:

| Status        | Sync Age     | Consecutive Failures | Pending Mutations |
| ------------- | ------------ | -------------------- | ----------------- |
| **Healthy**   | < 5 minutes  | 0                    | < 50              |
| **Degraded**  | 5–30 minutes | 1–3                  | 50–200            |
| **Unhealthy** | > 30 minutes | > 3                  | > 200             |

### Measurement Methodology — Sync Performance

| Metric               | Tool                              | How to Measure                                                                                                                                                                                           |
| -------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial sync         | `SyncHealthMonitor`               | Use `recordSyncSuccess(durationMs)` to capture full sync duration. Seed a test account with 1,000 records, trigger initial sync, measure end-to-end time from `SyncHealthMonitor.averageSyncDurationMs`. |
| Incremental sync     | `MetricsCollector`                | `recordSyncPerformance(durationMs, recordCount, success)` captures per-sync metrics. Aggregate P50/P95 from `sync_health_logs` table.                                                                    |
| Offline queue replay | PowerSync SDK instrumentation     | Disconnect network, create 100 mutations, reconnect. Measure time from reconnect to `pendingMutations == 0` via `SyncHealthMonitor.pendingMutations` StateFlow.                                          |
| Conflict resolution  | Custom timing in conflict handler | Wrap the LWW merge function with `measureTimeMillis {}`. Log per-conflict duration to `MetricsCollector`.                                                                                                |

---

## 3. User Interaction Responsiveness

### Transaction Entry

| Metric                 | Target  | Notes                                                       |
| ---------------------- | ------- | ----------------------------------------------------------- |
| **Perceived response** | < 100ms | Time from "Save" tap to UI confirmation (optimistic update) |
| **Local DB write**     | < 50ms  | SQLite INSERT including field encryption                    |
| **Sync queue enqueue** | < 20ms  | Adding mutation to PowerSync upload queue                   |

### Navigation

| Metric                  | Target         | Notes                                             |
| ----------------------- | -------------- | ------------------------------------------------- |
| **Screen transition**   | < 300ms        | Time from tap to next screen fully rendered       |
| **List scroll (60fps)** | < 16.7ms/frame | No dropped frames during transaction list scroll  |
| **Search results**      | < 200ms        | Time from keystroke to filtered results displayed |

### Budget & Goal Updates

| Metric                      | Target            | Notes                                                 |
| --------------------------- | ----------------- | ----------------------------------------------------- |
| **Budget create/edit**      | < 100ms perceived | Optimistic update, same as transaction entry          |
| **Goal progress update**    | < 100ms perceived | Triggered by transaction sync                         |
| **Dashboard recalculation** | < 500ms           | Aggregation of balances, budget progress, goal status |

### Measurement Methodology — UI Responsiveness

| Platform    | Tool                               | How to Measure                                                                                                                                         |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Android** | Android Studio Profiler            | Use **System Trace** to capture frame rendering. Check for janky frames (> 16.7ms) during list scroll. Measure input-to-render latency for tap events. |
| **Android** | Jetpack Benchmark                  | Write `MicrobenchmarkRule` tests for DB write and sync queue enqueue operations. Reports ns-level precision.                                           |
| **iOS**     | Xcode Instruments (Core Animation) | Use **Animation Hitches** instrument to detect dropped frames. Measure tap-to-render with signpost intervals (`os_signpost`).                          |
| **Web**     | Chrome DevTools Performance        | Record a Performance trace during user interactions. Check **Long Tasks** (> 50ms) and **INP** (Interaction to Next Paint).                            |
| **All**     | `MetricsCollector`                 | Instrument key user flows with `performance.mark()` (web) or `measureTimeMillis` (KMP). Aggregate via consent-gated analytics.                         |

---

## 4. Web Performance (Lighthouse & Core Web Vitals)

### Lighthouse CI Targets

Aligned with `apps/web/lighthouserc.json`:

| Category           | Target Score | CI Enforcement                     |
| ------------------ | ------------ | ---------------------------------- |
| **Performance**    | ≥ 90         | Warn (blocks merge recommendation) |
| **Accessibility**  | ≥ 95         | Error (blocks merge)               |
| **Best Practices** | ≥ 90         | Warn                               |
| **SEO**            | ≥ 90         | Informational                      |
| **PWA**            | ≥ 80         | Informational                      |

### Core Web Vitals Targets

| Metric                              | Target  | "Needs Improvement" | "Poor"  |
| ----------------------------------- | ------- | ------------------- | ------- |
| **LCP** (Largest Contentful Paint)  | < 2.5s  | 2.5–4.0s            | > 4.0s  |
| **FID** (First Input Delay)         | < 100ms | 100–300ms           | > 300ms |
| **INP** (Interaction to Next Paint) | < 200ms | 200–500ms           | > 500ms |
| **CLS** (Cumulative Layout Shift)   | < 0.1   | 0.1–0.25            | > 0.25  |
| **TTFB** (Time to First Byte)       | < 800ms | 800ms–1.8s          | > 1.8s  |

### Web Bundle Size Budget

| Asset                  | Target                 | Notes                                 |
| ---------------------- | ---------------------- | ------------------------------------- |
| **Total initial load** | < 500 KB (gzipped)     | All JS/CSS for first meaningful paint |
| **Initial JS bundle**  | < 200 KB (gzipped)     | Main app chunk, excludes WASM         |
| **SQLite WASM**        | < 500 KB (gzipped)     | wa-sqlite module (loaded async)       |
| **Lazy-loaded routes** | < 50 KB each (gzipped) | Per-page code splitting               |

### Measurement Methodology — Web Performance

| Metric          | Tool                                 | How to Measure                                                                                                                                          |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighthouse      | Lighthouse CI (`lhci`)               | Run `lhci autorun` in CI against the production build served locally. Configure in `apps/web/lighthouserc.json`. Runs on every PR touching `apps/web/`. |
| Core Web Vitals | Chrome DevTools / CrUX               | **Lab:** Lighthouse and `web-vitals` library. **Field:** Chrome UX Report (CrUX) once in production. Compare lab vs. field for calibration.             |
| Bundle size     | `vite build` + `source-map-explorer` | Analyze `vite build` output for chunk sizes. Use `source-map-explorer dist/assets/*.js` to identify large dependencies. Track in CI with size-limit.    |
| TTI / LCP       | `web-vitals` npm package             | Instrument with `onLCP()`, `onTTFB()`, `onINP()` callbacks. Report to `MetricsCollector` when consent is granted.                                       |

---

## 5. Database Performance

### Client-Side Database (SQLite / SQLCipher)

Local database operations on the device. These targets apply to all platforms using the shared SQLCipher database.

| Query Type                       | Target  | Notes                                            |
| -------------------------------- | ------- | ------------------------------------------------ |
| **Single record read (by PK)**   | < 5ms   | SQLite SELECT by UUID primary key                |
| **List query (100 records)**     | < 50ms  | Paginated transaction list with indexed filters  |
| **Single record write (INSERT)** | < 10ms  | INSERT including field-level encryption overhead |
| **Batch write (100 records)**    | < 500ms | Wrapped in a single SQLite transaction           |
| **Migration execution**          | < 30s   | Schema migration on app update, worst case       |

### Server-Side Database (Supabase PostgreSQL)

| Query Type                | P95 Target | Notes                                    |
| ------------------------- | ---------- | ---------------------------------------- |
| **Simple read (by PK)**   | < 10ms     | Single row by UUID                       |
| **List query (with RLS)** | < 100ms    | Paginated list with RLS filter           |
| **Aggregate query**       | < 500ms    | Budget calculations, dashboard summaries |
| **Full-text search**      | < 200ms    | Transaction search with `tsvector`       |
| **Write (INSERT/UPDATE)** | < 50ms     | Single row with trigger overhead         |

### Measurement Methodology — Database

| Scope        | Tool                        | How to Measure                                                                                                                     |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Client read  | SQLite `EXPLAIN QUERY PLAN` | Verify index usage. Wrap queries with `measureTimeMillis {}` in KMP code. Run on mid-range device with 10,000-record test dataset. |
| Client write | `measureTimeMillis {}`      | Measure INSERT duration including encryption overhead from `FieldEncryptor`. Test with and without active transactions.            |
| Migration    | Gradle test / manual timing | Run migration on a database pre-populated with production-scale data (50,000 records). Measure total `migrate()` execution time.   |
| Server read  | Supabase Dashboard          | Monitor P95 query latency in Supabase dashboard. Use `EXPLAIN ANALYZE` for slow query investigation.                               |
| Server write | `sync_health_logs` table    | Aggregate write latency from sync performance logs. Alert when P95 exceeds threshold.                                              |

---

## 6. Backend API Performance

### Edge Function Latency

| Function                 | P50 Target | P95 Target | P99 Target |
| ------------------------ | ---------- | ---------- | ---------- |
| **health-check**         | < 100ms    | < 300ms    | < 500ms    |
| **auth-webhook**         | < 200ms    | < 500ms    | < 1,000ms  |
| **data-export**          | < 2,000ms  | < 5,000ms  | < 10,000ms |
| **account-deletion**     | < 3,000ms  | < 8,000ms  | < 15,000ms |
| **passkey-register**     | < 300ms    | < 800ms    | < 1,500ms  |
| **passkey-authenticate** | < 300ms    | < 800ms    | < 1,500ms  |
| **household-invite**     | < 200ms    | < 500ms    | < 1,000ms  |

### Summary — API Response Time Targets

Simplified targets for quick reference:

| Endpoint Category             | Target (P50) | Notes                             |
| ----------------------------- | ------------ | --------------------------------- |
| **Health check**              | < 100ms      | Public, no auth required          |
| **Auth endpoints**            | < 500ms      | Login, register, token refresh    |
| **Data export (100 records)** | < 2s         | CSV/JSON export via Edge Function |

### Measurement Methodology — API Performance

| Metric            | Tool                         | How to Measure                                                                                                                                     |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge Function P50 | Supabase Dashboard           | Monitor invocation latency in the Functions dashboard. Export metrics for trending.                                                                |
| Edge Function P95 | Custom logging + aggregation | Log `duration_ms` in structured JSON from each Edge Function. Aggregate P50/P95/P99 via SQL query on logs.                                         |
| End-to-end API    | `curl` / `hey` / `k6`        | Run load tests with `k6` or `hey` against staging. Measure response times under load (10 concurrent users, 60s duration).                          |
| Health check      | External uptime monitor      | Configure 60s interval checks. Track response time history for baseline calibration. See [Alerting Rules](alerting-rules.md) for alert thresholds. |

---

## 7. Platform-Specific Metrics

### Bundle Size Targets

| Platform    | Artifact        | Target             | Notes                                      |
| ----------- | --------------- | ------------------ | ------------------------------------------ |
| **Web**     | Initial bundle  | < 500 KB (gzipped) | All resources for first meaningful paint   |
| **Android** | Release APK     | < 15 MB            | Universal APK; AAB will be smaller per-ABI |
| **iOS**     | IPA (App Store) | < 20 MB            | Compressed archive submitted to App Store  |
| **Windows** | MSIX installer  | < 80 MB            | Includes JVM runtime                       |

### Android

| Metric                        | Target        | Measurement                                  |
| ----------------------------- | ------------- | -------------------------------------------- |
| **APK size**                  | < 15 MB       | Release APK (`assembleRelease` output)       |
| **Memory usage (idle)**       | < 100 MB      | After initial load, no active UI interaction |
| **Memory usage (active)**     | < 200 MB      | During active transaction list scrolling     |
| **Battery (background sync)** | < 1% per hour | Background sync with WorkManager             |
| **Battery (active use)**      | < 5% per hour | Active use with screen on, typical workflow  |
| **ANR rate**                  | < 0.1%        | Google Play Console                          |

### iOS

| Metric                        | Target        | Measurement               |
| ----------------------------- | ------------- | ------------------------- |
| **IPA size**                  | < 20 MB       | App Store submission      |
| **Memory usage (idle)**       | < 80 MB       | After initial load        |
| **Memory usage (active)**     | < 150 MB      | During active use         |
| **Battery (background sync)** | < 1% per hour | Background App Refresh    |
| **Battery (active use)**      | < 5% per hour | Active use with screen on |
| **Hang rate**                 | < 0.1%        | Xcode Organizer           |

### Windows

| Metric                  | Target   | Measurement         |
| ----------------------- | -------- | ------------------- |
| **Installer size**      | < 80 MB  | MSIX package        |
| **Memory usage (idle)** | < 150 MB | After initial load  |
| **Startup time**        | < 2.0s   | JVM cold start + UI |

### Measurement Methodology — Platform Metrics

| Metric      | Platform | Tool                           | How to Measure                                                                                                                  |
| ----------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| APK size    | Android  | `./gradlew assembleRelease`    | Check file size of `app-release.apk`. Track in CI by logging size after build. Alert if > 15 MB.                                |
| IPA size    | iOS      | Xcode Archive                  | Archive with Release config, export for App Store. Check `.ipa` file size. Alternatively use Fastlane `gym` output.             |
| Bundle size | Web      | `vite build` output            | Parse build output for chunk sizes. Use `size-limit` npm package in CI to enforce budgets automatically.                        |
| Memory      | Android  | Android Studio Memory Profiler | Capture heap dump after 60s idle. Track **Java + Native** heap. Use `adb shell dumpsys meminfo <package>` for automated checks. |
| Memory      | iOS      | Xcode Memory Debugger          | Profile with **Allocations** instrument. Check memory footprint in Xcode Debug Navigator during active use.                     |
| Battery     | Android  | Battery Historian              | Collect `bugreport` after 1 hour background sync. Analyze with Battery Historian. Check `batterystats` for wakelock/CPU usage.  |
| Battery     | iOS      | Xcode Energy Diagnostics       | Profile with **Energy Log** instrument. Check CPU, network, and location usage during background refresh.                       |
| Battery     | All      | Manual field test              | Charge to 100%, run test workload for 1 hour, record battery delta. Use consistent device, brightness, and network conditions.  |

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
| Lighthouse Performance ≥ 90    | Warning     | PR flagged, not blocked   |
| Lighthouse Accessibility ≥ 95  | Error       | PR blocked                |
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

| Category       | Tool                               | Platform  | Purpose                                        |
| -------------- | ---------------------------------- | --------- | ---------------------------------------------- |
| **Startup**    | Jetpack Macrobenchmark             | Android   | Automated cold/warm start benchmarks           |
| **Startup**    | Xcode Instruments (App Launch)     | iOS       | Time Profiler for launch sequence              |
| **Startup**    | Lighthouse CI                      | Web       | TTI, LCP, and overall performance scoring      |
| **Sync**       | `SyncHealthMonitor`                | All (KMP) | Client-side sync health reactive metrics       |
| **Sync**       | `MetricsCollector`                 | All (KMP) | Consent-gated sync performance event recording |
| **Sync**       | `sync_health_logs` table           | Server    | Server-side sync performance aggregation       |
| **Database**   | `measureTimeMillis {}`             | All (KMP) | Inline query/write timing in Kotlin code       |
| **Database**   | SQLite `EXPLAIN QUERY PLAN`        | All       | Index usage verification                       |
| **Database**   | Supabase Dashboard                 | Server    | PostgreSQL query latency monitoring            |
| **UI**         | Android Studio Profiler            | Android   | CPU, memory, frame rendering traces            |
| **UI**         | Xcode Instruments (Core Animation) | iOS       | Frame rendering and animation hitches          |
| **UI**         | Chrome DevTools Performance        | Web       | Long tasks, INP, rendering timeline            |
| **Bundle**     | `vite build` / `size-limit`        | Web       | JS bundle size tracking and CI enforcement     |
| **Bundle**     | `source-map-explorer`              | Web       | Dependency size analysis via source maps       |
| **Bundle**     | Gradle `assembleRelease`           | Android   | APK size measurement                           |
| **Bundle**     | Xcode Archive / Fastlane `gym`     | iOS       | IPA size measurement                           |
| **Battery**    | Battery Historian                  | Android   | Wakelock, CPU, and network usage analysis      |
| **Battery**    | Xcode Energy Diagnostics           | iOS       | Energy impact profiling                        |
| **API**        | `k6` / `hey`                       | Server    | Load testing and response time measurement     |
| **API**        | External uptime monitor            | Server    | Health check response time tracking            |
| **Web Vitals** | `web-vitals` npm package           | Web       | Field measurement of LCP, INP, CLS, TTFB       |
| **Web Vitals** | Chrome UX Report (CrUX)            | Web       | Real-user performance data (post-launch)       |

---

## 11. Open Questions

1. **Android Macrobenchmark setup:** When will automated Android startup benchmarks be available in CI?
2. **iOS performance test runner:** Which CI runner supports XCTest performance tests? (macOS runner cost implications)
3. **PowerSync latency measurement:** How to instrument PowerSync round-trip latency independent of application logic?
4. **WASM startup optimization:** Current SQLite WASM init time is unknown — needs profiling during beta.
5. **Windows JVM startup:** JVM cold start may push Windows startup > 2s target. Evaluate GraalVM native-image or other AOT compilation.
