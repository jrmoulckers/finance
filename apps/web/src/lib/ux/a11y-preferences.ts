// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessibility preferences engine.
 *
 * Manages user accessibility preferences (font size, high contrast,
 * reduced motion, screen reader optimisations), persists them to
 * localStorage, and maps preferences to CSS custom properties for
 * UI application.
 *
 * All operations are pure and immutable — inputs are never mutated.
 * Follows WCAG 2.2 AA requirements.
 *
 * References: issue #1708
 */

import type { A11yCssMapping, A11yPreferences, FontSizePreference } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for persisted accessibility preferences. */
export const A11Y_STORAGE_KEY = 'finance-a11y-preferences';

/** Default accessibility preferences (respects system settings). */
export const DEFAULT_A11Y_PREFERENCES: A11yPreferences = {
  fontSize: 'medium',
  highContrast: false,
  reducedMotion: false,
  screenReaderOptimised: false,
  enhancedFocus: false,
  simplificationLevel: 'standard',
};

/** Font size values mapped to rem multipliers. */
const FONT_SIZE_MAP: Readonly<Record<FontSizePreference, number>> = {
  small: 0.875,
  medium: 1.0,
  large: 1.25,
  'x-large': 1.5,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load accessibility preferences from localStorage.
 *
 * Returns defaults if no preferences are stored or if parsing fails.
 *
 * @returns Persisted or default accessibility preferences.
 */
export function loadA11yPreferences(): A11yPreferences {
  try {
    const raw = globalThis.localStorage?.getItem(A11Y_STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<A11yPreferences>;
    return { ...DEFAULT_A11Y_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_A11Y_PREFERENCES;
  }
}

/**
 * Save accessibility preferences to localStorage.
 *
 * @param prefs - Preferences to persist.
 */
export function saveA11yPreferences(prefs: A11yPreferences): void {
  try {
    globalThis.localStorage?.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Silently fail — storage might be full or unavailable
  }
}

/**
 * Update a single preference field, returning a new preferences object.
 *
 * @param current - Current preferences.
 * @param key     - Preference key to update.
 * @param value   - New value for the key.
 * @returns Updated preferences.
 */
export function updatePreference<K extends keyof A11yPreferences>(
  current: A11yPreferences,
  key: K,
  value: A11yPreferences[K],
): A11yPreferences {
  return { ...current, [key]: value };
}

/**
 * Map accessibility preferences to CSS custom property changes.
 *
 * These mappings can be applied to the document root to change
 * visual presentation globally.
 *
 * @param prefs - Current accessibility preferences.
 * @returns Array of CSS property → value mappings.
 */
export function mapPreferencesToCss(prefs: A11yPreferences): A11yCssMapping[] {
  const mappings: A11yCssMapping[] = [];

  // Font size
  const multiplier = FONT_SIZE_MAP[prefs.fontSize];
  mappings.push({
    property: '--a11y-font-size-multiplier',
    value: String(multiplier),
  });
  mappings.push({
    property: '--a11y-base-font-size',
    value: `${multiplier}rem`,
  });

  // High contrast
  if (prefs.highContrast) {
    mappings.push({ property: '--a11y-border-width', value: '2px' });
    mappings.push({ property: '--a11y-contrast-mode', value: 'high' });
  } else {
    mappings.push({ property: '--a11y-border-width', value: '1px' });
    mappings.push({ property: '--a11y-contrast-mode', value: 'normal' });
  }

  // Reduced motion
  mappings.push({
    property: '--a11y-transition-duration',
    value: prefs.reducedMotion ? '0ms' : '200ms',
  });

  // Enhanced focus
  if (prefs.enhancedFocus) {
    mappings.push({ property: '--a11y-focus-outline-width', value: '3px' });
    mappings.push({ property: '--a11y-focus-outline-offset', value: '2px' });
  } else {
    mappings.push({ property: '--a11y-focus-outline-width', value: '2px' });
    mappings.push({ property: '--a11y-focus-outline-offset', value: '1px' });
  }

  return mappings;
}

/**
 * Apply accessibility CSS mappings to a target element.
 *
 * Typically called with `document.documentElement` to affect the whole page.
 *
 * @param element  - Target element to apply styles to.
 * @param mappings - CSS property mappings from {@link mapPreferencesToCss}.
 */
export function applyCssMappings(
  element: { style: { setProperty: (name: string, value: string) => void } },
  mappings: readonly A11yCssMapping[],
): void {
  for (const { property, value } of mappings) {
    element.style.setProperty(property, value);
  }
}

/**
 * Detect system-level accessibility preferences from media queries.
 *
 * Uses `window.matchMedia` to detect `prefers-reduced-motion` and
 * `prefers-contrast` settings.
 *
 * @returns Partial preferences reflecting system settings.
 */
export function detectSystemPreferences(): Partial<A11yPreferences> {
  const overrides: Record<string, unknown> = {};

  if (typeof globalThis.matchMedia === 'function') {
    if (globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      overrides.reducedMotion = true;
    }
    if (globalThis.matchMedia('(prefers-contrast: more)').matches) {
      overrides.highContrast = true;
    }
  }

  return overrides as Partial<A11yPreferences>;
}

/**
 * Merge system-detected preferences with user-stored preferences.
 *
 * User-stored values take precedence over system-detected values.
 * System values are only used for keys where no user preference exists.
 *
 * @param stored - User's persisted preferences.
 * @param system - System-detected preferences.
 * @returns Merged preferences.
 */
export function mergeWithSystemPreferences(
  stored: A11yPreferences,
  system: Partial<A11yPreferences>,
): A11yPreferences {
  // System prefs are only used as fallback — stored always wins
  return { ...DEFAULT_A11Y_PREFERENCES, ...system, ...stored };
}

/**
 * Get all available font size options with labels for UI rendering.
 *
 * @returns Array of font size options with display labels and rem values.
 */
export function getFontSizeOptions(): { value: FontSizePreference; label: string; rem: number }[] {
  return [
    { value: 'small', label: 'Small', rem: FONT_SIZE_MAP.small },
    { value: 'medium', label: 'Medium (Default)', rem: FONT_SIZE_MAP.medium },
    { value: 'large', label: 'Large', rem: FONT_SIZE_MAP.large },
    { value: 'x-large', label: 'Extra Large', rem: FONT_SIZE_MAP['x-large'] },
  ];
}
