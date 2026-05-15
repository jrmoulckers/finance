// SPDX-License-Identifier: BUSL-1.1

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowserSupportReport } from '../../utils/browserCompat';

// ---------------------------------------------------------------------------
// Mock browserCompat before importing the hook
// ---------------------------------------------------------------------------

const mockReport: BrowserSupportReport = {
  pwa: [
    { name: 'Service Worker', supported: true, required: true },
    { name: 'Cache API', supported: true, required: true },
    { name: 'IndexedDB', supported: true, required: true },
    { name: 'Web Crypto', supported: true, required: true },
  ],
  css: [
    { name: 'CSS Custom Properties', supported: true, required: true },
    { name: 'CSS Grid', supported: true, required: true },
    { name: 'CSS Subgrid', supported: false, required: false },
    { name: 'CSS Container Queries', supported: false, required: false },
  ],
  storage: [
    { name: 'localStorage', supported: true, required: true },
    { name: 'sessionStorage', supported: true, required: false },
    { name: 'OPFS', supported: true, required: false },
  ],
  wasm: [{ name: 'WebAssembly', supported: true, required: true }],
  isFullySupported: true,
  missingRequired: [],
  missingOptional: [
    { name: 'CSS Subgrid', supported: false, required: false },
    { name: 'CSS Container Queries', supported: false, required: false },
  ],
  browser: 'chrome',
  polyfillsNeeded: [],
};

vi.mock('../../utils/browserCompat', () => ({
  detectBrowserSupport: vi.fn(() => mockReport),
}));

import { _clearBrowserSupportCache, useBrowserSupport } from '../useBrowserSupport';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  _clearBrowserSupportCache();

  // Mock requestAnimationFrame to run callbacks synchronously in tests.
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {
    /* noop */
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBrowserSupport', () => {
  it('returns loading true initially before detection completes', () => {
    // Override rAF to NOT call immediately — simulate async detection.
    vi.mocked(globalThis.requestAnimationFrame).mockImplementation(() => 42);

    _clearBrowserSupportCache();
    const { result } = renderHook(() => useBrowserSupport());

    expect(result.current.loading).toBe(true);
    expect(result.current.report).toBeNull();
    // Default to true when report is not yet available.
    expect(result.current.isFullySupported).toBe(true);
  });

  it('returns the full report after detection', () => {
    const { result } = renderHook(() => useBrowserSupport());

    expect(result.current.loading).toBe(false);
    expect(result.current.report).toEqual(mockReport);
    expect(result.current.isFullySupported).toBe(true);
  });

  it('reports isFullySupported false when required features are missing', async () => {
    const { detectBrowserSupport } = await import('../../utils/browserCompat');

    const unsupportedReport: BrowserSupportReport = {
      ...mockReport,
      isFullySupported: false,
      missingRequired: [{ name: 'WebAssembly', supported: false, required: true }],
    };

    vi.mocked(detectBrowserSupport).mockReturnValue(unsupportedReport);
    _clearBrowserSupportCache();

    const { result } = renderHook(() => useBrowserSupport());

    expect(result.current.isFullySupported).toBe(false);
    expect(result.current.report?.missingRequired).toHaveLength(1);
  });

  it('caches the report across multiple hook mounts', async () => {
    const { detectBrowserSupport } = await import('../../utils/browserCompat');

    // Ensure the mock returns the standard report for this test.
    vi.mocked(detectBrowserSupport).mockReturnValue(mockReport);
    _clearBrowserSupportCache();

    // First mount populates the cache.
    const { unmount } = renderHook(() => useBrowserSupport());
    unmount();

    // Second mount should not call detectBrowserSupport again.
    vi.mocked(detectBrowserSupport).mockClear();
    const { result } = renderHook(() => useBrowserSupport());

    expect(result.current.report).toEqual(mockReport);
    expect(result.current.loading).toBe(false);
    // detectBrowserSupport should NOT have been called again.
    expect(detectBrowserSupport).not.toHaveBeenCalled();
  });

  it('clears cache with _clearBrowserSupportCache', async () => {
    const { detectBrowserSupport } = await import('../../utils/browserCompat');

    // Populate cache.
    renderHook(() => useBrowserSupport());
    vi.mocked(detectBrowserSupport).mockClear();

    // Clear and re-mount.
    _clearBrowserSupportCache();

    renderHook(() => useBrowserSupport());

    expect(detectBrowserSupport).toHaveBeenCalledTimes(1);
  });
});
