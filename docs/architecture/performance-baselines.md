# Performance Baselines

**Status:** Proposed — targets to be validated during beta
**Date:** 2026-03-15
**Related:** [Monitoring Architecture](monitoring.md) · [Alerting Rules](alerting-rules.md) · [CI/CD Strategy](0006-cicd-strategy.md)
**Tickets:** #410

---

## Overview

This document defines target performance baselines for the Finance app across all platforms. These targets represent the performance contract with users — regressions beyond these thresholds trigger P2/P3 alerts and block releases.

Baselines will be measured and calibrated during the beta phase using real-world usage data. Until beta data is available, these targets are based on industry benchmarks for financial applications and the team's architectural expectations.

---

## 1. App Startup Performance

### Cold Start Time

The time from app launch (user taps icon / opens URL) to interactive UI.

| Platform    | Target | Measurement Method                      | Notes                                                  |
| ----------- | ------ | --------------------------------------- | ------------------------------------------------------ |
| **Android** | < 2.0s | `reportFullyDrawn()` / Macrobenchmark   | Includes Koin DI init, SQLCipher open, first frame     |
| **iOS**     | < 2.0s | `MetricKit` / Instruments Time Profiler | Includes Keychain access, SQLCipher open, first frame  |
| **Web**     | < 2.0s | Lighthouse TTI / `performance.mark()`   | Includes WASM SQLite init, service worker activation   |
| **Windows** | < 2.0s | Custom timing in Application entry      | Includes DPAPI token load, SQLCipher open, first frame |

### Warm Start Time

The time from app resume (background → foreground) to interactive UI.

| Platform    | Target  | Notes                                       |
| ----------- | ------- | ------------------------------------------- |
| **Android** | < 500ms | Activity `onResume` to interactive          |
| **iOS**     | < 500ms | `applicationDidBecomeActive` to interactive |
| **Web**     | < 300ms | Page visibility change to interactive       |
| **Windows** | < 500ms | Window activation to interactive            |

---

## 2. Sync Performance

### Initial Sync

First-time sync after account creation with a typical starter dataset.

| Metric                 | Target  | Typical Dataset                                                  |
| ---------------------- | ------- | ---------------------------------------------------------------- |
| **Time to first data** | < 5.0s  | 1 household, 3 accounts, 50 transactions, 5 categories, 1 budget |
| **Full initial sync**  | < 10.0s | Same dataset — complete download + local DB write                |

### Incremental Sync

Ongoing sync of new changes.

| Metric                       | Target  | Notes                                           |
| ---------------------------- | ------- | ----------------------------------------------- |
| **Single transaction sync**  | < 1.0s  | Time from local commit to server acknowledgment |
| **Batch sync (100 records)** | < 3.0s  | Bulk import or multi-device catch-up            |
| **Conflict resolution**      | < 500ms | Per-conflict resolution time                    |

### Sync Health Thresholds

Aligned with `HealthStatus.kt` constants:

| Status        | Sync Age     | Consecutive Failures | Pending Mutations |
| ------------- | ------------ | -------------------- | ----------------- |
| **Healthy**   | < 5 minutes  | 0                    | < 50              |
| **Degraded**  | 5–30 minutes | 1–3                  | 50–200            |
| **Unhealthy** | > 30 minutes | > 3                  | > 200             |

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

| Asset                  | Target                 | Notes                                    |
| ---------------------- | ---------------------- | ---------------------------------------- |
| **Initial JS bundle**  | < 200 KB (gzipped)     | Main app chunk, excludes WASM            |
| **SQLite WASM**        | < 500 KB (gzipped)     | wa-sqlite module                         |
| **Total initial load** | < 1 MB (gzipped)       | All resources for first meaningful paint |
| **Lazy-loaded routes** | < 50 KB each (gzipped) | Per-page code splitting                  |

---

## 5. Backend Performance

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

### Database Query Latency

| Query Type                | P95 Target | Notes                                    |
| ------------------------- | ---------- | ---------------------------------------- |
| **Simple read (by PK)**   | < 10ms     | Single row by UUID                       |
| **List query (with RLS)** | < 100ms    | Paginated list with RLS filter           |
| **Aggregate query**       | < 500ms    | Budget calculations, dashboard summaries |
| **Full-text search**      | < 200ms    | Transaction search with `tsvector`       |
| **Write (INSERT/UPDATE)** | < 50ms     | Single row with trigger overhead         |

---

## 6. Platform-Specific Metrics

### Android

| Metric                        | Target        | Measurement                                  |
| ----------------------------- | ------------- | -------------------------------------------- |
| **APK size**                  | < 30 MB       | Release APK (not AAB)                        |
| **Memory usage (idle)**       | < 100 MB      | After initial load, no active UI interaction |
| **Memory usage (active)**     | < 200 MB      | During active transaction list scrolling     |
| **Battery (background sync)** | < 1% per hour | Background sync with WorkManager             |
| **ANR rate**                  | < 0.1%        | Google Play Console                          |

### iOS

| Metric                        | Target        | Measurement            |
| ----------------------------- | ------------- | ---------------------- |
| **App size (installed)**      | < 50 MB       | Including frameworks   |
| **Memory usage (idle)**       | < 80 MB       | After initial load     |
| **Memory usage (active)**     | < 150 MB      | During active use      |
| **Battery (background sync)** | < 1% per hour | Background App Refresh |
| **Hang rate**                 | < 0.1%        | Xcode Organizer        |

### Windows

| Metric                  | Target   | Measurement         |
| ----------------------- | -------- | ------------------- |
| **Installer size**      | < 80 MB  | MSIX package        |
| **Memory usage (idle)** | < 150 MB | After initial load  |
| **Startup time**        | < 2.0s   | JVM cold start + UI |

---

## 7. Measurement & Reporting

### Automated Measurement (CI)

| What                  | How                                        | When                     |
| --------------------- | ------------------------------------------ | ------------------------ |
| Web Lighthouse scores | `lighthouserc.json` via Lighthouse CI      | Every PR (affected-only) |
| Web bundle size       | `vite build` output analysis               | Every PR (affected-only) |
| Android startup       | Macrobenchmark (when configured)           | Nightly or per-release   |
| iOS startup           | XCTest performance tests (when configured) | Nightly or per-release   |

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

## 8. Regression Prevention

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

## 9. Open Questions

1. **Android Macrobenchmark setup:** When will automated Android startup benchmarks be available in CI?
2. **iOS performance test runner:** Which CI runner supports XCTest performance tests? (macOS runner cost implications)
3. **PowerSync latency measurement:** How to instrument PowerSync round-trip latency independent of application logic?
4. **WASM startup optimization:** Current SQLite WASM init time is unknown — needs profiling during beta.
5. **Windows JVM startup:** JVM cold start may push Windows startup > 2s target. Evaluate GraalVM native-image or other AOT compilation.
