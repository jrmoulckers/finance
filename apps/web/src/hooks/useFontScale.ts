// SPDX-License-Identifier: BUSL-1.1

/**
 * Hook that detects and applies the current browser font scale factor.
 *
 * The app stores a named preference and applies it as a percentage root
 * font-size so rem/em-based UI scales and reflows consistently. The largest
 * supported step reaches 200% text size for WCAG 2.2 SC 1.4.4.
 *
 * @module hooks/useFontScale
 * References: issues #1680, #2152
 */

import { useCallback, useEffect, useState } from 'react';

export type FontScalePreference =
  'small' | 'default' | 'comfortable' | 'large' | 'larger' | 'extra-large' | 'very-large' | 'huge';

export interface FontScaleOption {
  value: FontScalePreference;
  label: string;
  rootFontSize: string;
  scale: number;
  basePixels: number;
}

export const FONT_SCALE_STORAGE_KEY = 'finance-font-scale-preference';
export const DEFAULT_FONT_SCALE_PREFERENCE: FontScalePreference = 'default';

export const FONT_SCALE_OPTIONS: readonly FontScaleOption[] = [
  { value: 'small', label: 'Small', rootFontSize: '87.5%', scale: 0.875, basePixels: 14 },
  { value: 'default', label: 'Default', rootFontSize: '100%', scale: 1, basePixels: 16 },
  {
    value: 'comfortable',
    label: 'Comfortable',
    rootFontSize: '112.5%',
    scale: 1.125,
    basePixels: 18,
  },
  { value: 'large', label: 'Large', rootFontSize: '125%', scale: 1.25, basePixels: 20 },
  { value: 'larger', label: 'Larger', rootFontSize: '137.5%', scale: 1.375, basePixels: 22 },
  { value: 'extra-large', label: 'Extra Large', rootFontSize: '150%', scale: 1.5, basePixels: 24 },
  { value: 'very-large', label: 'Very Large', rootFontSize: '175%', scale: 1.75, basePixels: 28 },
  { value: 'huge', label: 'Huge', rootFontSize: '200%', scale: 2, basePixels: 32 },
] as const;

const FONT_SCALE_BY_PREFERENCE = new Map<FontScalePreference, FontScaleOption>(
  FONT_SCALE_OPTIONS.map((option) => [option.value, option]),
);

const LEGACY_FONT_SCALE_ALIASES: Record<string, FontScalePreference> = {
  medium: 'default',
  'x-large': 'extra-large',
};

/**
 * Clamp unknown or legacy persisted values to a supported scale option.
 */
export function normalizeFontScalePreference(preference: unknown): FontScalePreference {
  if (typeof preference !== 'string') {
    return DEFAULT_FONT_SCALE_PREFERENCE;
  }

  const normalized = LEGACY_FONT_SCALE_ALIASES[preference] ?? preference;
  return FONT_SCALE_BY_PREFERENCE.has(normalized as FontScalePreference)
    ? (normalized as FontScalePreference)
    : DEFAULT_FONT_SCALE_PREFERENCE;
}

export function getFontScaleOption(preference: unknown): FontScaleOption {
  return (
    FONT_SCALE_BY_PREFERENCE.get(normalizeFontScalePreference(preference)) ??
    FONT_SCALE_BY_PREFERENCE.get(DEFAULT_FONT_SCALE_PREFERENCE) ??
    FONT_SCALE_OPTIONS[1]
  );
}

/**
 * Get the current font scale factor relative to the 16px default.
 *
 * @returns The scale factor (e.g., 1.0 = default, 1.5 = 150%, 2.0 = 200%).
 */
function getFontScale(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 1;
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize / 16 : 1;
}

export function getStoredFontScalePreference(): FontScalePreference {
  try {
    return normalizeFontScalePreference(localStorage.getItem(FONT_SCALE_STORAGE_KEY));
  } catch {
    // localStorage unavailable — fall back to the default size
  }
  return DEFAULT_FONT_SCALE_PREFERENCE;
}

export function applyFontScalePreference(
  preference: FontScalePreference | string,
): FontScalePreference {
  if (typeof document === 'undefined') return normalizeFontScalePreference(preference);

  const option = getFontScaleOption(preference);
  document.documentElement.style.fontSize = option.rootFontSize;
  document.documentElement.style.setProperty('--finance-font-scale', String(option.scale));
  document.documentElement.setAttribute('data-font-scale', option.value);
  return option.value;
}

export function setFontScalePreference(
  preference: FontScalePreference | string,
): FontScalePreference {
  const normalizedPreference = normalizeFontScalePreference(preference);
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, normalizedPreference);
  } catch {
    // localStorage unavailable — still apply for this session
  }
  applyFontScalePreference(normalizedPreference);
  return normalizedPreference;
}

export function applyStoredFontScalePreference(): void {
  applyFontScalePreference(getStoredFontScalePreference());
}

export interface UseFontScaleResult {
  /** Current persisted font scale preference. */
  preference: FontScalePreference;
  /** Available scale choices for UI controls. */
  options: readonly FontScaleOption[];
  /** Persist and apply a new font scale preference. */
  setPreference: (preference: FontScalePreference | string) => void;
  /** Current font scale factor (1.0 = browser default 16px). */
  scale: number;
  /** Whether font size is enlarged (scale > 1.0). */
  isEnlarged: boolean;
  /** Whether font size is at or above 200% (WCAG 1.4.4 threshold). */
  isLargeScale: boolean;
}

/**
 * React hook that reactively tracks browser font scaling.
 *
 * Returns the current scale factor and boolean flags for
 * conditional layout adjustments.
 *
 * @example
 * ```tsx
 * const { isLargeScale } = useFontScale();
 *
 * return (
 *   <div className={isLargeScale ? 'stacked-layout' : 'side-by-side-layout'}>
 *     ...
 *   </div>
 * );
 * ```
 */
export function useFontScale(): UseFontScaleResult {
  const [preference, setPreferenceState] = useState(getStoredFontScalePreference);
  const [scale, setScale] = useState(getFontScale);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    // ResizeObserver on documentElement detects font size changes
    const observer = new ResizeObserver(() => {
      setScale(getFontScale());
    });

    observer.observe(document.documentElement);

    return () => observer.disconnect();
  }, []);

  const setPreference = useCallback((nextPreference: FontScalePreference | string) => {
    const normalizedPreference = setFontScalePreference(nextPreference);
    setPreferenceState(normalizedPreference);
    setScale(getFontScale());
  }, []);

  return {
    preference,
    options: FONT_SCALE_OPTIONS,
    setPreference,
    scale,
    isEnlarged: scale > 1,
    isLargeScale: scale >= 2,
  };
}
