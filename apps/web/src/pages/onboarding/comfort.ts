// SPDX-License-Identifier: BUSL-1.1

/**
 * Comfort/accessibility preference application for the onboarding flow.
 * Extracted from `OnboardingPage.tsx` (#3712).
 */

import {
  DEFAULT_FONT_SCALE_PREFERENCE,
  FONT_SCALE_OPTIONS,
  getFontScaleOption,
  setFontScalePreference,
} from '../../hooks/useFontScale';
import { setReducedMotionPreference } from '../../hooks/useReducedMotion';
import { applyTheme, THEME_STORAGE_KEY } from '../../hooks/useTheme';
import { setSimplifiedModePreference } from '../../lib/accessibility-preferences';

import { safeSetItem } from './storage';

export const DEFAULT_FONT_SCALE_INDEX = Math.max(
  FONT_SCALE_OPTIONS.findIndex((option) => option.value === DEFAULT_FONT_SCALE_PREFERENCE),
  0,
);

export const SIMPLE_MODE_FONT_SCALE_INDEX = Math.max(
  FONT_SCALE_OPTIONS.findIndex((option) => option.value === 'large'),
  DEFAULT_FONT_SCALE_INDEX,
);

export function applyComfortPreferences(
  fontScaleValue: number,
  reducedMotion: boolean,
  simplifiedMode: boolean,
  highContrast: boolean,
): void {
  const selectedFontScale =
    FONT_SCALE_OPTIONS[Math.min(Math.max(fontScaleValue, 0), FONT_SCALE_OPTIONS.length - 1)] ??
    getFontScaleOption(DEFAULT_FONT_SCALE_PREFERENCE);

  setFontScalePreference(selectedFontScale.value);
  setReducedMotionPreference(reducedMotion);
  setSimplifiedModePreference(simplifiedMode);

  const nextTheme = highContrast ? 'high-contrast' : 'system';
  safeSetItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}
