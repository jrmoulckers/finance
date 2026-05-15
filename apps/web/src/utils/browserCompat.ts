// SPDX-License-Identifier: BUSL-1.1

/**
 * Cross-browser feature detection utilities for the Finance PWA.
 *
 * Provides runtime detection of critical browser APIs required for the
 * offline-first architecture (Service Worker, Cache API, IndexedDB,
 * Web Crypto, WebAssembly) and CSS features used by the design system.
 *
 * All detection is done via capability checks — never user-agent sniffing
 * for feature gating. Browser identification is provided solely for
 * analytics and diagnostics.
 *
 * References: issue #1343
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Individual feature support status. */
export interface FeatureSupport {
  /** Human-readable feature name. */
  readonly name: string;
  /** Whether the feature is available in the current browser. */
  readonly supported: boolean;
  /** Whether this feature is critical for app functionality. */
  readonly required: boolean;
}

/** Comprehensive browser support report. */
export interface BrowserSupportReport {
  /** PWA API support (Service Worker, Cache API, etc.). */
  readonly pwa: readonly FeatureSupport[];
  /** CSS feature support (custom properties, grid, etc.). */
  readonly css: readonly FeatureSupport[];
  /** Storage API availability. */
  readonly storage: readonly FeatureSupport[];
  /** WebAssembly support (required for SQLite-WASM). */
  readonly wasm: readonly FeatureSupport[];
  /** True when all required features are available. */
  readonly isFullySupported: boolean;
  /** List of missing required features. */
  readonly missingRequired: readonly FeatureSupport[];
  /** List of missing optional features. */
  readonly missingOptional: readonly FeatureSupport[];
  /** Detected browser name for analytics. */
  readonly browser: BrowserName;
  /** Polyfills that should be loaded. */
  readonly polyfillsNeeded: readonly string[];
}

/** Known browser identifiers for analytics. */
export type BrowserName = 'chrome' | 'firefox' | 'safari' | 'edge' | 'unknown';

// ---------------------------------------------------------------------------
// PWA feature detection
// ---------------------------------------------------------------------------

/** Detects whether the Service Worker API is available. */
export function detectServiceWorker(): boolean {
  return 'serviceWorker' in navigator;
}

/** Detects whether the Cache API is available. */
export function detectCacheApi(): boolean {
  return 'caches' in window;
}

/** Detects whether the IndexedDB API is available. */
export function detectIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Firefox private browsing may throw on indexedDB access.
    return false;
  }
}

/** Detects whether the Web Crypto API (SubtleCrypto) is available. */
export function detectWebCrypto(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    crypto !== null &&
    typeof crypto.subtle !== 'undefined' &&
    crypto.subtle !== null
  );
}

/** Returns all PWA-related feature checks. */
export function detectPwaFeatures(): FeatureSupport[] {
  return [
    { name: 'Service Worker', supported: detectServiceWorker(), required: true },
    { name: 'Cache API', supported: detectCacheApi(), required: true },
    { name: 'IndexedDB', supported: detectIndexedDB(), required: true },
    { name: 'Web Crypto', supported: detectWebCrypto(), required: true },
  ];
}

// ---------------------------------------------------------------------------
// CSS feature detection
// ---------------------------------------------------------------------------

/** Detects CSS custom properties (CSS variables) support. */
export function detectCssCustomProperties(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return false;
  }
  return CSS.supports('color', 'var(--test)');
}

/** Detects CSS Grid Layout support. */
export function detectCssGrid(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return false;
  }
  return CSS.supports('display', 'grid');
}

/** Detects CSS Subgrid support. */
export function detectCssSubgrid(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return false;
  }
  return CSS.supports('grid-template-columns', 'subgrid');
}

/** Detects CSS Container Queries support. */
export function detectCssContainerQueries(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return false;
  }
  return CSS.supports('container-type', 'inline-size');
}

/** Returns all CSS feature checks. */
export function detectCssFeatures(): FeatureSupport[] {
  return [
    { name: 'CSS Custom Properties', supported: detectCssCustomProperties(), required: true },
    { name: 'CSS Grid', supported: detectCssGrid(), required: true },
    { name: 'CSS Subgrid', supported: detectCssSubgrid(), required: false },
    { name: 'CSS Container Queries', supported: detectCssContainerQueries(), required: false },
  ];
}

// ---------------------------------------------------------------------------
// Storage detection
// ---------------------------------------------------------------------------

/** Detects localStorage availability. */
export function detectLocalStorage(): boolean {
  try {
    const key = '__finance_storage_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Detects sessionStorage availability. */
export function detectSessionStorage(): boolean {
  try {
    const key = '__finance_storage_test__';
    sessionStorage.setItem(key, '1');
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Detects OPFS (Origin Private File System) availability. */
export function detectOpfs(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

/** Returns all storage feature checks. */
export function detectStorageFeatures(): FeatureSupport[] {
  return [
    { name: 'localStorage', supported: detectLocalStorage(), required: true },
    { name: 'sessionStorage', supported: detectSessionStorage(), required: false },
    { name: 'OPFS', supported: detectOpfs(), required: false },
  ];
}

// ---------------------------------------------------------------------------
// WebAssembly detection
// ---------------------------------------------------------------------------

/** Detects WebAssembly support (required for SQLite-WASM). */
export function detectWebAssembly(): boolean {
  try {
    if (typeof WebAssembly !== 'object' || WebAssembly === null) {
      return false;
    }
    // Verify instantiate function exists (full WASM support).
    return typeof WebAssembly.instantiate === 'function';
  } catch {
    return false;
  }
}

/** Returns WebAssembly feature checks. */
export function detectWasmFeatures(): FeatureSupport[] {
  return [{ name: 'WebAssembly', supported: detectWebAssembly(), required: true }];
}

// ---------------------------------------------------------------------------
// Browser identification (analytics only — never for feature gating)
// ---------------------------------------------------------------------------

/**
 * Identifies the browser for analytics and diagnostics.
 *
 * Uses user-agent heuristics — ONLY for reporting, never for feature
 * gating. Feature availability is always determined via capability checks.
 */
export function identifyBrowser(): BrowserName {
  if (typeof navigator === 'undefined' || !navigator.userAgent) {
    return 'unknown';
  }

  const ua = navigator.userAgent;

  // Edge (Chromium-based) — check before Chrome since Edge UA includes "Chrome".
  if (ua.includes('Edg/') || ua.includes('Edge/')) {
    return 'edge';
  }

  // Chrome — must not match Edge.
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    return 'chrome';
  }

  // Firefox.
  if (ua.includes('Firefox/')) {
    return 'firefox';
  }

  // Safari — must not match Chrome or Edge.
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    return 'safari';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Polyfill detection
// ---------------------------------------------------------------------------

/**
 * Determines which polyfills are needed based on current feature support.
 *
 * Returns an array of polyfill identifiers that should be loaded.
 */
export function detectPolyfillsNeeded(): string[] {
  const polyfills: string[] = [];

  if (typeof globalThis.structuredClone !== 'function') {
    polyfills.push('structuredClone');
  }

  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    polyfills.push('crypto.randomUUID');
  }

  if (typeof globalThis.queueMicrotask !== 'function') {
    polyfills.push('queueMicrotask');
  }

  return polyfills;
}

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

/**
 * Runs all feature detection checks and returns a comprehensive report.
 *
 * Results are not cached — call this once and store the result if you
 * need to reference it multiple times.
 */
export function detectBrowserSupport(): BrowserSupportReport {
  const pwa = detectPwaFeatures();
  const css = detectCssFeatures();
  const storage = detectStorageFeatures();
  const wasm = detectWasmFeatures();

  const allFeatures = [...pwa, ...css, ...storage, ...wasm];
  const missingRequired = allFeatures.filter((f) => f.required && !f.supported);
  const missingOptional = allFeatures.filter((f) => !f.required && !f.supported);

  return {
    pwa,
    css,
    storage,
    wasm,
    isFullySupported: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    browser: identifyBrowser(),
    polyfillsNeeded: detectPolyfillsNeeded(),
  };
}
