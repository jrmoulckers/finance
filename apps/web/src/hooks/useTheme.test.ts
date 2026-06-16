// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from './useTheme';

// ---------------------------------------------------------------------------
// Mock localStorage and matchMedia
// ---------------------------------------------------------------------------

let mockStorage: Record<string, string> = {};
let darkModeListeners: Array<(e: { matches: boolean }) => void> = [];
let isDarkMode = false;

beforeEach(() => {
  mockStorage = {};
  darkModeListeners = [];
  isDarkMode = false;

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
  });

  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? isDarkMode : false,
    media: query,
    addEventListener: (_: string, handler: (e: { matches: boolean }) => void) => {
      if (query === '(prefers-color-scheme: dark)') {
        darkModeListeners.push(handler);
      }
    },
    removeEventListener: (_: string, handler: (e: { matches: boolean }) => void) => {
      darkModeListeners = darkModeListeners.filter((h) => h !== handler);
    },
    dispatchEvent: () => false,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
  }));
});

afterEach(() => {
  // Clean up root attributes
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-density');
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTheme', () => {
  it('defaults to system theme when nothing stored', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
  });

  it('reads stored preference from localStorage', () => {
    mockStorage['finance-theme-preference'] = 'dark';

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
  });

  it('resolves system preference to light when OS is light mode', () => {
    isDarkMode = false;

    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe('light');
  });

  it('resolves system preference to dark when OS is dark mode', () => {
    isDarkMode = true;

    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('returns explicit theme as resolvedTheme when not system', () => {
    mockStorage['finance-theme-preference'] = 'dark-oled';

    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe('dark-oled');
  });

  it('persists theme to localStorage on setTheme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(mockStorage['finance-theme-preference']).toBe('dark');
    expect(result.current.theme).toBe('dark');
  });

  it('applies data-theme attribute to document root', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('removes data-theme attribute when set to system', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => {
      result.current.setTheme('system');
    });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('provides available theme options', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.themes).toEqual([
      'system',
      'light',
      'dark',
      'dark-oled',
      'high-contrast',
    ]);
  });

  it('defaults to comfortable density when nothing stored', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.displayDensity).toBe('comfortable');
    expect(document.documentElement.hasAttribute('data-density')).toBe(false);
  });

  it('reads stored compact density from localStorage', () => {
    mockStorage['finance-display-density-preference'] = 'compact';

    const { result } = renderHook(() => useTheme());

    expect(result.current.displayDensity).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('persists compact density and applies data-density to document root', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setDisplayDensity('compact');
    });

    expect(mockStorage['finance-display-density-preference']).toBe('compact');
    expect(result.current.displayDensity).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('removes data-density when returning to comfortable density', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setDisplayDensity('compact');
    });
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');

    act(() => {
      result.current.setDisplayDensity('comfortable');
    });

    expect(document.documentElement.hasAttribute('data-density')).toBe(false);
  });

  it('provides available density options', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.densities).toEqual(['comfortable', 'compact']);
  });

  it('updates resolvedTheme when OS preference changes', () => {
    isDarkMode = false;

    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe('light');

    // Simulate OS dark mode change
    act(() => {
      for (const listener of darkModeListeners) {
        listener({ matches: true });
      }
    });

    expect(result.current.resolvedTheme).toBe('dark');
  });
});
