// SPDX-License-Identifier: BUSL-1.1

/**
 * useTheme — React hook for managing the application color theme.
 *
 * Supports explicit themes plus system auto-detection:
 *   - 'light'         — Light theme
 *   - 'dark'          — Standard dark theme (dark grays)
 *   - 'dark-oled'     — OLED-optimized dark theme (true black backgrounds)
 *   - 'high-contrast' — High-contrast theme for stronger separation
 *   - 'system'        — Follow OS prefers-color-scheme (default)
 *
 * Theme preference is persisted to localStorage and applied as a
 * `data-theme` attribute on `<html>`. When set to 'system', the
 * attribute is removed so the CSS `prefers-color-scheme` media query
 * and [data-theme] selectors work together.
 *
 * @example
 * ```tsx
 * const { theme, setTheme, resolvedTheme } = useTheme();
 *
 * <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeValue)}>
 *   <option value="system">System</option>
 *   <option value="light">Light</option>
 *   <option value="dark">Dark</option>
 *   <option value="dark-oled">OLED Dark</option>
 * </select>
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

/** Valid theme values that can be set by the user. */
export type ThemeValue = 'light' | 'dark' | 'dark-oled' | 'high-contrast' | 'system';

/** Density values that can be set by the user. */
export type DisplayDensity = 'comfortable' | 'compact';

/** The resolved (effective) theme after system preference resolution. */
export type ResolvedTheme = 'light' | 'dark' | 'dark-oled' | 'high-contrast';

export interface UseThemeResult {
  /** Current user-selected theme preference (may be 'system'). */
  theme: ThemeValue;

  /** The effective theme after resolving 'system' to light/dark. */
  resolvedTheme: ResolvedTheme;

  /** Update the theme preference. Persists to localStorage. */
  setTheme: (value: ThemeValue) => void;

  /** Ordered list of available theme options for building UI selectors. */
  themes: readonly ThemeValue[];

  /** Current display density preference. */
  displayDensity: DisplayDensity;

  /** Update display density and persist to localStorage. */
  setDisplayDensity: (value: DisplayDensity) => void;

  /** Ordered list of density options for building UI selectors. */
  densities: readonly DisplayDensity[];
}

export const THEME_STORAGE_KEY = 'finance-theme-preference';
export const DENSITY_STORAGE_KEY = 'finance-display-density-preference';
const THEME_ATTRIBUTE = 'data-theme';
const DENSITY_ATTRIBUTE = 'data-density';

/** All available theme values, in display order. */
const AVAILABLE_THEMES: readonly ThemeValue[] = [
  'system',
  'light',
  'dark',
  'dark-oled',
  'high-contrast',
] as const;

/** All available density values, in display order. */
const AVAILABLE_DENSITIES: readonly DisplayDensity[] = ['comfortable', 'compact'] as const;

/**
 * Read the persisted theme preference from localStorage.
 * Falls back to 'system' if nothing stored or value is invalid.
 */
export function getStoredTheme(): ThemeValue {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (
      stored === 'light' ||
      stored === 'dark' ||
      stored === 'dark-oled' ||
      stored === 'high-contrast' ||
      stored === 'system'
    ) {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR, privacy mode) — fall through
  }
  return 'system';
}

/** Read the persisted display density preference from localStorage. */
export function getStoredDisplayDensity(): DisplayDensity {
  try {
    const stored = localStorage.getItem(DENSITY_STORAGE_KEY);
    if (stored === 'comfortable' || stored === 'compact') {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR, privacy mode) — fall through
  }
  return 'comfortable';
}

/**
 * Detect the OS color scheme preference.
 */
function getSystemPreference(): 'light' | 'dark' {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

/**
 * Apply the resolved theme to the document element.
 * - For explicit themes: sets `data-theme="<value>"` on `<html>`.
 * - For 'system': removes the attribute so CSS media queries take over.
 */
export function applyTheme(value: ThemeValue): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (value === 'system') {
    root.removeAttribute(THEME_ATTRIBUTE);
  } else {
    root.setAttribute(THEME_ATTRIBUTE, value);
  }
}

export function applyDisplayDensity(value: DisplayDensity): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  if (value === 'compact') {
    root.setAttribute(DENSITY_ATTRIBUTE, value);
  } else {
    root.removeAttribute(DENSITY_ATTRIBUTE);
  }
}

export function applyStoredThemePreference(): void {
  applyTheme(getStoredTheme());
}

export function applyStoredDisplayDensityPreference(): void {
  applyDisplayDensity(getStoredDisplayDensity());
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<ThemeValue>(getStoredTheme);
  const [displayDensity, setDisplayDensityState] =
    useState<DisplayDensity>(getStoredDisplayDensity);
  const [systemPref, setSystemPref] = useState<'light' | 'dark'>(getSystemPreference);

  // Listen for OS color scheme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handler = (e: MediaQueryListEvent) => {
      setSystemPref(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Apply display density to DOM whenever it changes
  useEffect(() => {
    applyDisplayDensity(displayDensity);
  }, [displayDensity]);

  const setTheme = useCallback((value: ThemeValue) => {
    setThemeState(value);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // localStorage unavailable — theme still works for the session
    }
  }, []);

  const setDisplayDensity = useCallback((value: DisplayDensity) => {
    setDisplayDensityState(value);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, value);
    } catch {
      // localStorage unavailable — density still works for the session
    }
  }, []);

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return systemPref;
    }
    return theme;
  }, [theme, systemPref]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    themes: AVAILABLE_THEMES,
    displayDensity,
    setDisplayDensity,
    densities: AVAILABLE_DENSITIES,
  };
}
