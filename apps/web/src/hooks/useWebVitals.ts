// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for Web Vitals monitoring.
 *
 * Starts observing Core Web Vitals when the component mounts and
 * cleans up observers on unmount. Exposes the collected metrics for
 * UI display (e.g. in a developer performance panel).
 *
 * Usage:
 * ```tsx
 * const { metrics, navigation } = useWebVitals();
 * ```
 *
 * References: issue #770
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  observeWebVitals,
  disconnectWebVitals,
  getNavigationTiming,
  type WebVitalMetric,
} from '../lib/web-vitals';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseWebVitalsResult {
  /** All observed metrics. */
  readonly metrics: ReadonlyArray<WebVitalMetric>;
  /** Navigation timing data (available after page load). */
  readonly navigation: Record<string, number> | null;
  /** Clear all collected metrics. */
  clearMetrics: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebVitals(): UseWebVitalsResult {
  const [metrics, setMetrics] = useState<WebVitalMetric[]>([]);
  const [navigation, setNavigation] = useState<Record<string, number> | null>(null);
  const observedRef = useRef(false);

  const handleMetric = useCallback((metric: WebVitalMetric) => {
    setMetrics((prev) => {
      // Update existing metric of the same name (CLS accumulates)
      const existing = prev.findIndex((m) => m.name === metric.name);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = metric;
        return next;
      }
      return [...prev, metric];
    });
  }, []);

  useEffect(() => {
    if (observedRef.current) return;
    observedRef.current = true;

    observeWebVitals(handleMetric);

    // Capture navigation timing after load
    const captureNavTiming = () => {
      const timing = getNavigationTiming();
      if (timing) setNavigation(timing);
    };

    if (document.readyState === 'complete') {
      captureNavTiming();
    } else {
      window.addEventListener('load', captureNavTiming, { once: true });
    }

    return () => {
      disconnectWebVitals();
      observedRef.current = false;
    };
  }, [handleMetric]);

  const clearMetrics = useCallback(() => {
    setMetrics([]);
  }, []);

  return { metrics, navigation, clearMetrics };
}
