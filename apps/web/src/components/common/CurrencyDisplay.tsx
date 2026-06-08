// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { formatCurrencyForScreenReader } from '../../lib/a11y';
import { useEffectiveMaskingMode, useIsPrivacyModeActive } from '../../contexts/PrivacyModeContext';
import { getAmountColor, useMoneyDisplay } from '../../lib/display-settings';
import { formatAmount, MaskingMode } from '../../lib/ui/privacy';

export interface CurrencyDisplayProps {
  /** Amount in integer cents (e.g., 12345 = $123.45). */
  amount: number;
  /** ISO 4217 currency code (default: `"USD"`). */
  currency?: string;
  /** BCP 47 locale tag (default: `"en-US"`). */
  locale?: string;
  /** Apply positive/negative color classes. */
  colorize?: boolean;
  /** Show explicit sign for non-zero amounts. */
  showSign?: boolean;
  /** Additional CSS class names. */
  className?: string;
  /**
   * Contextual description appended to the screen reader label.
   *
   * Provides additional meaning so amounts are not announced in
   * isolation (e.g., "Dining category", "Emergency Fund goal").
   */
  context?: string;
  /** Override the accessible label. */
  'aria-label'?: string;
}

/**
 * Renders a formatted currency amount from integer cents.
 *
 * Uses the centralized `formatCurrency` utility from `lib/currency`
 * for the accessible label, and applies user-configurable display
 * settings (decimal visibility, negative format, currency display mode,
 * and amount colors) via the `useMoneyDisplay()` hook.
 *
 * When privacy mode is active, the amount is replaced with a masked
 * placeholder (e.g., `$•••.••`) and the accessible label indicates
 * "Amount hidden".
 *
 * Accessibility: when `negativeFormat` is `'color-only'`, the visible
 * text omits the minus sign but the `aria-label` always includes
 * "negative" for screen readers so information is never conveyed by
 * color alone. The optional `context` prop appends a description
 * (e.g., "Dining category") so amounts announce their meaning.
 */
export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  currency = 'USD',
  locale = 'en-US',
  colorize = false,
  showSign = false,
  className = '',
  context,
  'aria-label': ariaLabel,
}) => {
  const displaySettings = useMoneyDisplay();
  const isPrivacyMode = useIsPrivacyModeActive();
  const maskingMode = useEffectiveMaskingMode();

  // Format the visible text using the canonical privacy-aware formatter.
  const baseFormatOptions = {
    currency,
    currencyDisplay: displaySettings.currencyDisplay,
    minimumFractionDigits: displaySettings.showDecimals ? 2 : 0,
    maximumFractionDigits: displaySettings.showDecimals ? 2 : 0,
  } as const;
  const formattedBase = formatAmount(amount, maskingMode, locale, {
    ...baseFormatOptions,
    signDisplay: showSign ? 'exceptZero' : 'auto',
  });
  const formattedAbsolute = formatAmount(Math.abs(amount), MaskingMode.Visible, locale, {
    ...baseFormatOptions,
    signDisplay: 'never',
  });
  const formatted =
    maskingMode === MaskingMode.Visible && amount < 0
      ? displaySettings.negativeFormat === 'parentheses'
        ? `(${formattedAbsolute})`
        : displaySettings.negativeFormat === 'color-only'
          ? formattedAbsolute
          : formattedBase
      : formattedBase;

  // Build CSS class for color (legacy class-based approach still supported).
  let colorClass = '';
  if (colorize && !isPrivacyMode) {
    if (amount > 0) colorClass = 'amount--positive';
    else if (amount < 0) colorClass = 'amount--negative';
    else colorClass = 'amount--zero';
  }

  // Apply user-chosen color via inline style when colorize is enabled.
  const colorStyle: React.CSSProperties | undefined =
    colorize && !isPrivacyMode ? { color: getAmountColor(amount, displaySettings) } : undefined;

  // The accessible label always uses the standard format with explicit
  // "negative" prefix and optional context so screen readers convey
  // sign and meaning regardless of visual negative format.
  const label = isPrivacyMode
    ? 'Amount hidden'
    : (ariaLabel ?? formatCurrencyForScreenReader(amount, currency, context));

  return (
    <span
      className={`currency-display ${colorClass} ${className}`.trim()}
      aria-label={label}
      style={colorStyle}
    >
      {formatted}
    </span>
  );
};

export default CurrencyDisplay;
