// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook that runs browser feature detection on mount and caches
 * the result for the lifetime of the component tree.
 *
 * Returns a {@link BrowserSupportResult} with per-feature support status,
 * an `isFullySupported` convenience boolean, and the full report for
 * downstream components (e.g., {@link BrowserWarning}).
 *
 * Usage:
 * ```tsx
 * const { isFullySupported, report } = useBrowserSupport();
 * ```
 *
 * References: issue #1343
 */

import { useEffect, useState } from 'react';

import type { BrowserSupportReport } from '../utils/browserCompat';
import { detectBrowserSupport } from '../utils/browserCompat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Return type for the {@link useBrowserSupport} hook. */
export interface UseBrowserSupportResult {
  /** True when all required features are available. */
  readonly isFullySupported: boolean;
  /** True while the detection is still running. */
  readonly loading: boolean;
  /** Full feature detection report — `null` until detection completes. */
  readonly report: BrowserSupportReport | null;
}

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

/**
 * Module-level cache for the support report so detection runs at most
 * once per page load, even when multiple components mount the hook.
 */
let cachedReport: BrowserSupportReport | null = null;

/**
 * Clears the cached report. Intended for testing only.
 * @internal
 */
export function _clearBrowserSupportCache(): void {
  cachedReport = null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Runs feature detection on mount and returns the cached result.
 *
 * Detection runs once per page load (module-level cache). Subsequent
 * mounts of this hook return the cached report synchronously.
 */
export function useBrowserSupport(): UseBrowserSupportResult {
  const [report, setReport] = useState<BrowserSupportReport | null>(cachedReport);
  const [loading, setLoading] = useState<boolean>(cachedReport === null);

  useEffect(() => {
    if (cachedReport !== null) {
      // Already cached from a prior mount — use it immediately.
      setReport(cachedReport);
      setLoading(false);
      return;
    }

    // Run detection asynchronously to avoid blocking the first paint.
    const id = requestAnimationFrame(() => {
      const result = detectBrowserSupport();
      cachedReport = result;
      setReport(result);
      setLoading(false);
    });

    return () => cancelAnimationFrame(id);
  }, []);

  return {
    isFullySupported: report?.isFullySupported ?? true,
    loading,
    report,
  };
}
