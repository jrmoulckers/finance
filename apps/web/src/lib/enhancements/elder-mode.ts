/**
 * Simplified elder and caregiver accessibility mode.
 * Closes #1732.
 * @module enhancements/elder-mode
 */

import type { AccessibilityProfile, EmergencyContact } from './types';

/** Minimum touch target per WCAG 2.5.8 (enhanced) */
const MIN_TOUCH_TARGET_PX = 56;

/** Maximum top-level nav items in simplified mode */
const MAX_NAV_ITEMS = 5;

/** Default large font size for elder mode */
const DEFAULT_ELDER_FONT_SIZE_PX = 20;

/** Standard font size */
const STANDARD_FONT_SIZE_PX = 16;

/**
 * Create the default (disabled) accessibility profile.
 * @returns Standard accessibility profile
 */
export function createDefaultProfile(): AccessibilityProfile {
  return {
    enabled: false,
    minTouchTargetPx: 44, // standard WCAG minimum
    baseFontSizePx: STANDARD_FONT_SIZE_PX,
    highContrast: false,
    maxNavItems: 10,
    essentialFeaturesOnly: false,
    caregiverNotifications: false,
  };
}

/**
 * Create an elder-mode accessibility profile with larger targets and simplified UI.
 * @param emergencyContact - Optional emergency contact
 * @param caregiverNotifications - Whether to send caregiver notifications
 * @returns Elder-mode profile
 */
export function createElderProfile(
  emergencyContact?: EmergencyContact,
  caregiverNotifications: boolean = false,
): AccessibilityProfile {
  return {
    enabled: true,
    minTouchTargetPx: MIN_TOUCH_TARGET_PX,
    baseFontSizePx: DEFAULT_ELDER_FONT_SIZE_PX,
    highContrast: true,
    maxNavItems: MAX_NAV_ITEMS,
    essentialFeaturesOnly: true,
    emergencyContact,
    caregiverNotifications,
  };
}

/**
 * Toggle elder mode on or off.
 * @param profile - Current profile
 * @returns Toggled profile (elder if was standard, standard if was elder)
 */
export function toggleElderMode(profile: AccessibilityProfile): AccessibilityProfile {
  if (profile.enabled) {
    return createDefaultProfile();
  }
  return createElderProfile(profile.emergencyContact, profile.caregiverNotifications);
}

/**
 * Set the emergency contact.
 * @param profile - Current profile
 * @param contact - Emergency contact info
 * @returns Updated profile
 */
export function setEmergencyContact(
  profile: AccessibilityProfile,
  contact: EmergencyContact,
): AccessibilityProfile {
  return { ...profile, emergencyContact: contact };
}

/**
 * Enable or disable caregiver notifications.
 * @param profile - Current profile
 * @param enabled - Whether notifications should be on
 * @returns Updated profile
 */
export function setCaregiverNotifications(
  profile: AccessibilityProfile,
  enabled: boolean,
): AccessibilityProfile {
  return { ...profile, caregiverNotifications: enabled };
}

/**
 * Determine the font scale multiplier relative to standard 16px base.
 * @param profile - Accessibility profile
 * @returns Font scale factor (e.g. 1.25 for 20px)
 */
export function getFontScale(profile: AccessibilityProfile): number {
  return profile.baseFontSizePx / STANDARD_FONT_SIZE_PX;
}

/**
 * Filter navigation items to the allowed maximum.
 * @param items - Full list of nav item identifiers
 * @param profile - Accessibility profile
 * @returns Truncated list of nav items
 */
export function filterNavItems<T>(
  items: readonly T[],
  profile: AccessibilityProfile,
): readonly T[] {
  return items.slice(0, profile.maxNavItems);
}

/**
 * Check whether a feature should be shown based on the profile.
 * @param featureId - Feature identifier
 * @param essentialFeatures - Set of essential feature IDs
 * @param profile - Accessibility profile
 * @returns `true` if the feature should be visible
 */
export function isFeatureVisible(
  featureId: string,
  essentialFeatures: ReadonlySet<string>,
  profile: AccessibilityProfile,
): boolean {
  if (!profile.essentialFeaturesOnly) return true;
  return essentialFeatures.has(featureId);
}

/**
 * Get CSS custom properties for applying the accessibility profile.
 * @param profile - Accessibility profile
 * @returns Record of CSS custom property name → value
 */
export function getCSSCustomProperties(
  profile: AccessibilityProfile,
): Readonly<Record<string, string>> {
  return {
    '--a11y-min-touch-target': `${profile.minTouchTargetPx}px`,
    '--a11y-base-font-size': `${profile.baseFontSizePx}px`,
    '--a11y-font-scale': String(getFontScale(profile)),
    '--a11y-high-contrast': profile.highContrast ? '1' : '0',
  };
}
