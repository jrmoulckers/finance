// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { formatCurrency, formatCurrencyLabel } from '../../lib/currency';

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
  /** Override the accessible label. */
  'aria-label'?: string;
}

/**
 * Renders a formatted currency amount from integer cents.
 *
 * Uses the centralized `formatCurrency` utility from `lib/currency`
 * to ensure consistent formatting across the application.
 */
export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  currency = 'USD',
  locale = 'en-US',
  colorize = false,
  showSign = false,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const formatted = formatCurrency(amount, {
    currency,
    locale,
    signDisplay: showSign ? 'exceptZero' : 'auto',
  });

  let colorClass = '';
  if (colorize) {
    if (amount > 0) colorClass = 'amount--positive';
    else if (amount < 0) colorClass = 'amount--negative';
  }

  const label = ariaLabel ?? formatCurrencyLabel(amount, { currency, locale });

  return (
    <span className={`currency-display ${colorClass} ${className}`.trim()} aria-label={label}>
      {formatted}
    </span>
  );
};

export default CurrencyDisplay;
