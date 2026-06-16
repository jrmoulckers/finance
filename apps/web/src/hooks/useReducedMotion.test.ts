// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyStoredReducedMotionPreference,
  setReducedMotionPreference,
  useReducedMotion,
} from './useReducedMotion';

const listeners = new Set<(event: MediaQueryListEvent) => void>();
let systemPrefersReducedMotion = false;

function installMatchMediaMock() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return systemPrefersReducedMotion;
      },
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function emitMediaChange() {
  const event = { matches: systemPrefersReducedMotion } as MediaQueryListEvent;
  listeners.forEach((listener) => listener(event));
}

describe('useReducedMotion', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-reduced-motion');
    listeners.clear();
    systemPrefersReducedMotion = false;
    installMatchMediaMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies the root attribute on first load when the OS requests reduced motion', () => {
    systemPrefersReducedMotion = true;

    applyStoredReducedMotionPreference();

    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'true');
  });

  it('applies the root attribute on first load when the app preference is enabled', () => {
    localStorage.setItem('finance-reduced-motion-preference', 'true');

    applyStoredReducedMotionPreference();

    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'true');
  });

  it('reacts to OS and app preference changes at runtime', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      systemPrefersReducedMotion = true;
      emitMediaChange();
    });
    expect(result.current).toBe(true);

    act(() => {
      systemPrefersReducedMotion = false;
      emitMediaChange();
    });
    expect(result.current).toBe(false);

    act(() => {
      setReducedMotionPreference(true);
    });
    expect(result.current).toBe(true);
    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'true');
  });
});
