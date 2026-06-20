// SPDX-License-Identifier: BUSL-1.1

/**
 * Lighthouse-audit detection.
 *
 * Synthetic Lighthouse runs load the app with no backend (api requests are
 * served the SPA-fallback index.html).  Without special handling the app would
 * perform navigation churn under audit — service-worker registration, an
 * unauthenticated redirect, and the first-run onboarding auto-launch — none of
 * which represent the page we actually want to measure.  Detecting the audit
 * lets those behaviours be skipped so Lighthouse measures a stable page.
 *
 * Detection is intentionally robust across reloads: the `?lhci=1` query param is
 * present on the initial navigation but may be dropped by a client-side route
 * change, whereas the Lighthouse user-agent token persists for the whole run.
 */
export function isLighthouseAudit(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (window.location.search.includes('lhci=1')) {
    return true;
  }

  return typeof navigator !== 'undefined' && /\bLighthouse\b/i.test(navigator.userAgent);
}
