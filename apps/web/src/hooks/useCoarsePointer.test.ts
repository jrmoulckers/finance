// SPDX-License-Identifier: BUSL-1.1

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prefersCoarsePointer, useCoarsePointer } from './useCoarsePointer';

// ---------------------------------------------------------------------------
// Mock matchMedia
// ---------------------------------------------------------------------------

let mediaMatches: Record<string, boolean> = {};

function createMockMatchMedia() {
  return (query: string) => ({
    matches: mediaMatches[query] ?? false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
  });
}

beforeEach(() => {
  mediaMatches = {};
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// prefersCoarsePointer
// ---------------------------------------------------------------------------

describe('prefersCoarsePointer', () => {
  it('returns false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(prefersCoarsePointer()).toBe(false);
  });

  it('returns false for a fine pointer that can hover (desktop mouse)', () => {
    mediaMatches = { '(pointer: coarse)': false, '(hover: none)': false };
    vi.stubGlobal('matchMedia', createMockMatchMedia());

    expect(prefersCoarsePointer()).toBe(false);
  });

  it('returns true when the primary pointer is coarse', () => {
    mediaMatches = { '(pointer: coarse)': true, '(hover: none)': false };
    vi.stubGlobal('matchMedia', createMockMatchMedia());

    expect(prefersCoarsePointer()).toBe(true);
  });

  it('returns true when the device cannot hover', () => {
    mediaMatches = { '(pointer: coarse)': false, '(hover: none)': true };
    vi.stubGlobal('matchMedia', createMockMatchMedia());

    expect(prefersCoarsePointer()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useCoarsePointer
// ---------------------------------------------------------------------------

describe('useCoarsePointer', () => {
  it('reports false on a fine-pointer device', () => {
    mediaMatches = { '(pointer: coarse)': false, '(hover: none)': false };
    vi.stubGlobal('matchMedia', createMockMatchMedia());

    const { result } = renderHook(() => useCoarsePointer());

    expect(result.current).toBe(false);
  });

  it('reports true on a coarse-pointer device', () => {
    mediaMatches = { '(pointer: coarse)': true, '(hover: none)': false };
    vi.stubGlobal('matchMedia', createMockMatchMedia());

    const { result } = renderHook(() => useCoarsePointer());

    expect(result.current).toBe(true);
  });

  it('does not throw when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => useCoarsePointer());

    expect(result.current).toBe(false);
  });
});
