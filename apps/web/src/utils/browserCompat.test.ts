// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectBrowserSupport,
  detectCacheApi,
  detectCssContainerQueries,
  detectCssCustomProperties,
  detectCssGrid,
  detectCssSubgrid,
  detectIndexedDB,
  detectLocalStorage,
  detectOpfs,
  detectPolyfillsNeeded,
  detectPwaFeatures,
  detectServiceWorker,
  detectSessionStorage,
  detectWebAssembly,
  detectWebCrypto,
  identifyBrowser,
} from './browserCompat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stores original globals so we can restore them in afterEach.
 */
let originalNavigator: PropertyDescriptor | undefined;
let originalCss: PropertyDescriptor | undefined;

beforeEach(() => {
  originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  originalCss = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  // Restore navigator and CSS if they were overridden.
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  }
  if (originalCss) {
    Object.defineProperty(globalThis, 'CSS', originalCss);
  }
});

// ---------------------------------------------------------------------------
// PWA feature detection
// ---------------------------------------------------------------------------

describe('PWA feature detection', () => {
  it('detects Service Worker when available', () => {
    // jsdom typically has serviceWorker on navigator
    expect(typeof detectServiceWorker()).toBe('boolean');
  });

  it('detects Cache API availability', () => {
    expect(typeof detectCacheApi()).toBe('boolean');
  });

  it('detects IndexedDB availability', () => {
    expect(detectIndexedDB()).toBe(true);
  });

  it('returns false for IndexedDB when it throws', () => {
    const original = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      get: () => {
        throw new Error('Blocked');
      },
      configurable: true,
    });
    expect(detectIndexedDB()).toBe(false);
    Object.defineProperty(globalThis, 'indexedDB', {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  it('detects Web Crypto when SubtleCrypto is available', () => {
    expect(typeof detectWebCrypto()).toBe('boolean');
  });

  it('returns four PWA feature entries', () => {
    const features = detectPwaFeatures();
    expect(features).toHaveLength(4);
    expect(features.every((f) => typeof f.supported === 'boolean')).toBe(true);
    expect(features.every((f) => f.required === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CSS feature detection
// ---------------------------------------------------------------------------

describe('CSS feature detection', () => {
  it('detects CSS custom properties via CSS.supports', () => {
    expect(typeof detectCssCustomProperties()).toBe('boolean');
  });

  it('detects CSS Grid via CSS.supports', () => {
    expect(typeof detectCssGrid()).toBe('boolean');
  });

  it('detects CSS Subgrid via CSS.supports', () => {
    expect(typeof detectCssSubgrid()).toBe('boolean');
  });

  it('detects CSS Container Queries via CSS.supports', () => {
    expect(typeof detectCssContainerQueries()).toBe('boolean');
  });

  it('returns false for CSS features when CSS.supports is unavailable', () => {
    Object.defineProperty(globalThis, 'CSS', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(detectCssCustomProperties()).toBe(false);
    expect(detectCssGrid()).toBe(false);
    expect(detectCssSubgrid()).toBe(false);
    expect(detectCssContainerQueries()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Storage detection
// ---------------------------------------------------------------------------

describe('Storage detection', () => {
  it('detects localStorage when available', () => {
    expect(detectLocalStorage()).toBe(true);
  });

  it('returns false for localStorage when it throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(detectLocalStorage()).toBe(false);
  });

  it('detects sessionStorage when available', () => {
    expect(detectSessionStorage()).toBe(true);
  });

  it('returns false for sessionStorage when it throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    expect(detectSessionStorage()).toBe(false);
  });

  it('detects OPFS availability', () => {
    expect(typeof detectOpfs()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// WebAssembly detection
// ---------------------------------------------------------------------------

describe('WebAssembly detection', () => {
  it('detects WebAssembly when available', () => {
    expect(detectWebAssembly()).toBe(true);
  });

  it('returns false when WebAssembly is undefined', () => {
    const original = globalThis.WebAssembly;
    Object.defineProperty(globalThis, 'WebAssembly', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(detectWebAssembly()).toBe(false);
    Object.defineProperty(globalThis, 'WebAssembly', {
      value: original,
      configurable: true,
      writable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Browser identification
// ---------------------------------------------------------------------------

describe('identifyBrowser', () => {
  function mockUserAgent(ua: string): void {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...navigator, userAgent: ua },
      configurable: true,
      writable: true,
    });
  }

  it('identifies Edge', () => {
    mockUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    );
    expect(identifyBrowser()).toBe('edge');
  });

  it('identifies Chrome', () => {
    mockUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(identifyBrowser()).toBe('chrome');
  });

  it('identifies Firefox', () => {
    mockUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    );
    expect(identifyBrowser()).toBe('firefox');
  });

  it('identifies Safari', () => {
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    );
    expect(identifyBrowser()).toBe('safari');
  });

  it('returns unknown for unrecognized user agents', () => {
    mockUserAgent('SomeCustomBot/1.0');
    expect(identifyBrowser()).toBe('unknown');
  });

  it('returns unknown when navigator is unavailable', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(identifyBrowser()).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Polyfill detection
// ---------------------------------------------------------------------------

describe('detectPolyfillsNeeded', () => {
  it('returns an array of polyfill identifiers', () => {
    const polyfills = detectPolyfillsNeeded();
    expect(Array.isArray(polyfills)).toBe(true);
    polyfills.forEach((p) => expect(typeof p).toBe('string'));
  });

  it('includes structuredClone when missing', () => {
    const original = globalThis.structuredClone;
    Object.defineProperty(globalThis, 'structuredClone', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const polyfills = detectPolyfillsNeeded();
    expect(polyfills).toContain('structuredClone');
    Object.defineProperty(globalThis, 'structuredClone', {
      value: original,
      configurable: true,
      writable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

describe('detectBrowserSupport', () => {
  it('returns a complete support report', () => {
    const report = detectBrowserSupport();
    expect(report.pwa).toHaveLength(4);
    expect(report.css).toHaveLength(4);
    expect(report.storage).toHaveLength(3);
    expect(report.wasm).toHaveLength(1);
    expect(typeof report.isFullySupported).toBe('boolean');
    expect(Array.isArray(report.missingRequired)).toBe(true);
    expect(Array.isArray(report.missingOptional)).toBe(true);
    expect(typeof report.browser).toBe('string');
    expect(Array.isArray(report.polyfillsNeeded)).toBe(true);
  });

  it('marks isFullySupported false when required features are missing', () => {
    // Remove WebAssembly to simulate a missing required feature.
    const original = globalThis.WebAssembly;
    Object.defineProperty(globalThis, 'WebAssembly', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const report = detectBrowserSupport();
    expect(report.isFullySupported).toBe(false);
    expect(report.missingRequired.some((f) => f.name === 'WebAssembly')).toBe(true);
    Object.defineProperty(globalThis, 'WebAssembly', {
      value: original,
      configurable: true,
      writable: true,
    });
  });
});
