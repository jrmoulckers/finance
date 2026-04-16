// SPDX-License-Identifier: BUSL-1.1

/**
 * Web Vitals monitoring utility.
 *
 * Captures Core Web Vitals (LCP, FID/INP, CLS) and supplementary metrics
 * (FCP, TTFB) using the Performance Observer API. Results are logged in
 * development and can be sent to an analytics endpoint in production.
 *
 * This module is designed to be imported once in main.tsx and has no
 * React dependency — it works at the platform level.
 *
 * Metrics captured:
 *   - LCP  (Largest Contentful Paint) — target < 2500ms
 *   - FID  (First Input Delay)        — target < 100ms
 *   - INP  (Interaction to Next Paint) — target < 200ms
 *   - CLS  (Cumulative Layout Shift)  — target < 0.1
 *   - FCP  (First Contentful Paint)   — target < 2000ms
 *   - TTFB (Time to First Byte)       — target < 800ms
 *
 * Budget thresholds are aligned with the Lighthouse performance budget
 * defined in apps/web/budget.json.
 *
 * References: issue #770
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single performance metric observation. */
export interface WebVitalMetric {
  /** Metric name (e.g. 'LCP', 'CLS'). */
  readonly name: string;
  /** Observed value (ms for timing metrics, unitless for CLS). */
  readonly value: number;
  /** Rating based on Web Vitals thresholds. */
  readonly rating: 'good' | 'needs-improvement' | 'poor';
  /** Performance entry type used to collect this metric. */
  readonly entryType: string;
  /** Timestamp when the metric was observed. */
  readonly timestamp: number;
}

/** Callback invoked when a metric is observed. */
export type MetricReportCallback = (metric: WebVitalMetric) => void;

// ---------------------------------------------------------------------------
// Thresholds (aligned with budget.json and Google's Web Vitals)
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 2000, poor: 4000 },
  TTFB: { good: 800, poor: 1800 },
} as const;

function getRating(
  name: keyof typeof THRESHOLDS,
  value: number,
): 'good' | 'needs-improvement' | 'poor' {
  const t = THRESHOLDS[name];
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

// ---------------------------------------------------------------------------
// Observer setup
// ---------------------------------------------------------------------------

/** List of active observers for cleanup. */
const observers: PerformanceObserver[] = [];

/**
 * Observe a PerformanceObserver entry type and report metrics.
 */
function observe(
  entryType: string,
  metricName: keyof typeof THRESHOLDS,
  extractValue: (entries: PerformanceEntryList) => number | null,
  callback: MetricReportCallback,
): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      const value = extractValue(list.getEntries());
      if (value === null) return;

      callback({
        name: metricName,
        value,
        rating: getRating(metricName, value),
        entryType,
        timestamp: Date.now(),
      });
    });

    observer.observe({ type: entryType, buffered: true });
    observers.push(observer);
  } catch {
    // Observer type not supported — skip silently.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start observing Core Web Vitals and supplementary metrics.
 *
 * @param onReport  Called for each metric as it becomes available.
 */
export function observeWebVitals(onReport: MetricReportCallback): void {
  // LCP
  observe(
    'largest-contentful-paint',
    'LCP',
    (entries) => {
      const last = entries[entries.length - 1];
      return last ? (last as PerformanceEntry & { startTime: number }).startTime : null;
    },
    onReport,
  );

  // FID
  observe(
    'first-input',
    'FID',
    (entries) => {
      const first = entries[0];
      return first
        ? (first as PerformanceEntry & { processingStart: number; startTime: number })
            .processingStart - (first as PerformanceEntry & { startTime: number }).startTime
        : null;
    },
    onReport,
  );

  // CLS
  let clsValue = 0;
  observe(
    'layout-shift',
    'CLS',
    (entries) => {
      for (const entry of entries) {
        const ls = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!ls.hadRecentInput) {
          clsValue += ls.value;
        }
      }
      return clsValue;
    },
    onReport,
  );

  // FCP
  observe(
    'paint',
    'FCP',
    (entries) => {
      const fcp = entries.find((e) => e.name === 'first-contentful-paint');
      return fcp ? fcp.startTime : null;
    },
    onReport,
  );
}

/**
 * Disconnect all active Performance Observers.
 */
export function disconnectWebVitals(): void {
  for (const observer of observers) {
    observer.disconnect();
  }
  observers.length = 0;
}

/**
 * Get navigation timing metrics (TTFB, DOM load, etc.).
 *
 * Available after the page has fully loaded.
 */
export function getNavigationTiming(): Record<string, number> | null {
  if (typeof performance === 'undefined') return null;

  const nav = performance.getEntriesByType('navigation')[0] as
    | (PerformanceNavigationTiming & { startTime: number })
    | undefined;
  if (!nav) return null;

  return {
    ttfb: Math.round(nav.responseStart - nav.startTime),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
    domComplete: Math.round(nav.domComplete - nav.startTime),
    loadEvent: Math.round(nav.loadEventEnd - nav.startTime),
    transferSize: nav.transferSize,
    encodedBodySize: nav.encodedBodySize,
    decodedBodySize: nav.decodedBodySize,
  };
}

/**
 * Get resource loading summary for the current page.
 *
 * Groups resource entries by type and calculates total sizes and counts.
 */
export function getResourceSummary(): Record<
  string,
  { count: number; totalSize: number; totalDuration: number }
> {
  if (typeof performance === 'undefined') return {};

  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const summary: Record<string, { count: number; totalSize: number; totalDuration: number }> = {};

  for (const entry of entries) {
    const type = categorizeResource(entry.name);
    if (!summary[type]) {
      summary[type] = { count: 0, totalSize: 0, totalDuration: 0 };
    }
    summary[type].count++;
    summary[type].totalSize += entry.transferSize || 0;
    summary[type].totalDuration += entry.duration;
  }

  return summary;
}

/**
 * Categorize a resource URL by its file type.
 */
function categorizeResource(url: string): string {
  if (/\.js$/i.test(url)) return 'script';
  if (/\.css$/i.test(url)) return 'stylesheet';
  if (/\.(png|jpg|jpeg|gif|svg|webp|avif|ico)$/i.test(url)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)$/i.test(url)) return 'font';
  if (/\.wasm$/i.test(url)) return 'wasm';
  return 'other';
}
