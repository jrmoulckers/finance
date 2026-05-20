/**
 * Public privacy mode for balances and amounts.
 * Closes #1643.
 * @module enhancements/privacy-mode
 */

import type { PrivacyModeConfig, PrivacyLevel, ScreenPrivacyOverride } from './types';

/** Masked text for amounts (screen-reader friendly) */
const MASKED_AMOUNT = '$•••.••';

/** Screen-reader accessible label for masked values */
const SR_MASKED_LABEL = 'Amount hidden for privacy';

/**
 * Create a default privacy mode configuration.
 * @returns Default config with privacy off
 */
export function createDefaultConfig(): PrivacyModeConfig {
  return {
    level: 'off',
    overrides: [],
    quickToggleEnabled: true,
  };
}

/**
 * Set the global privacy level.
 * @param config - Current config
 * @param level - New privacy level
 * @returns Updated config
 */
export function setPrivacyLevel(config: PrivacyModeConfig, level: PrivacyLevel): PrivacyModeConfig {
  return { ...config, level };
}

/**
 * Cycle privacy level: off → partial → full → off.
 * @param config - Current config
 * @returns Config with the next privacy level
 */
export function togglePrivacy(config: PrivacyModeConfig): PrivacyModeConfig {
  const cycle: Record<PrivacyLevel, PrivacyLevel> = {
    off: 'partial',
    partial: 'full',
    full: 'off',
  };
  return { ...config, level: cycle[config.level] };
}

/**
 * Get the effective privacy level for a specific screen.
 * Per-screen overrides take precedence over the global level.
 * @param config - Privacy config
 * @param screenId - Screen identifier
 * @returns Effective privacy level
 */
export function getEffectiveLevel(config: PrivacyModeConfig, screenId: string): PrivacyLevel {
  const override = config.overrides.find((o) => o.screenId === screenId);
  return override ? override.level : config.level;
}

/**
 * Set a per-screen privacy override.
 * @param config - Current config
 * @param screenId - Screen identifier
 * @param level - Privacy level for that screen
 * @returns Updated config
 */
export function setScreenOverride(
  config: PrivacyModeConfig,
  screenId: string,
  level: PrivacyLevel,
): PrivacyModeConfig {
  const filtered = config.overrides.filter((o) => o.screenId !== screenId);
  const override: ScreenPrivacyOverride = { screenId, level };
  return { ...config, overrides: [...filtered, override] };
}

/**
 * Remove a per-screen privacy override.
 * @param config - Current config
 * @param screenId - Screen identifier
 * @returns Updated config without the override
 */
export function removeScreenOverride(
  config: PrivacyModeConfig,
  screenId: string,
): PrivacyModeConfig {
  return {
    ...config,
    overrides: config.overrides.filter((o) => o.screenId !== screenId),
  };
}

/**
 * Mask a monetary amount based on privacy level.
 * - `off`: returns the formatted amount as-is
 * - `partial`: masks cents portion (e.g., "$1,234.••")
 * - `full`: masks entire amount ("$•••.••")
 * @param amountCents - Amount in integer cents
 * @param level - Active privacy level
 * @returns Masked or unmasked string
 */
export function maskAmount(amountCents: number, level: PrivacyLevel): string {
  if (level === 'off') {
    return formatCents(amountCents);
  }
  if (level === 'full') {
    return MASKED_AMOUNT;
  }
  // partial — show dollars, mask cents
  const sign = amountCents < 0 ? '-' : '';
  const absCents = Math.abs(amountCents);
  const dollars = Math.floor(absCents / 100);
  return `${sign}$${dollars.toLocaleString('en-US')}.••`;
}

/**
 * Get screen-reader accessible text for a masked value.
 * @param amountCents - Amount in integer cents
 * @param level - Active privacy level
 * @returns Accessible text — the real value when off, a privacy label otherwise
 */
export function getAriaLabel(amountCents: number, level: PrivacyLevel): string {
  if (level === 'off') {
    return formatCents(amountCents);
  }
  return SR_MASKED_LABEL;
}

/**
 * Mask a generic text field for transaction detail redaction.
 * @param text - Original text
 * @param level - Active privacy level
 * @returns Original text when off, redacted when partial/full
 */
export function maskText(text: string, level: PrivacyLevel): string {
  if (level === 'off') return text;
  if (level === 'partial') {
    if (text.length <= 4) return '••••';
    return text.slice(0, 2) + '•'.repeat(text.length - 2);
  }
  return '•'.repeat(Math.min(text.length, 8));
}

/**
 * Format integer cents as a USD string.
 * Uses banker's rounding (values are already integer cents so no rounding needed).
 * @param cents - Amount in integer cents
 * @returns Formatted dollar string
 */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absCents = Math.abs(cents);
  const dollars = Math.floor(absCents / 100);
  const remainder = absCents % 100;
  return `${sign}$${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
}
