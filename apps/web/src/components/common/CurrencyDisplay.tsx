import React from 'react';

export interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  locale?: string;
  colorize?: boolean;
  showSign?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  currency = 'USD',
  locale = 'en-US',
  colorize = false,
  showSign = false,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: showSign ? 'exceptZero' : 'auto',
  });

  const formatted = formatter.format(amount);
  let colorClass = '';
  if (colorize) {
    if (amount > 0) colorClass = 'amount--positive';
    else if (amount < 0) colorClass = 'amount--negative';
  }

  const label = ariaLabel ?? (amount < 0 ? 'negative ' : '') + formatter.format(Math.abs(amount));

  return (
    <span className={`currency-display ${colorClass} ${className}`.trim()} aria-label={label}>
      {formatted}
    </span>
  );
};

export default CurrencyDisplay;
