// SPDX-License-Identifier: BUSL-1.1

import './amount-display.css';

export interface AmountDisplayProps {
  value: string;
  placeholder?: string;
  empty?: boolean;
  label?: string;
  className?: string;
}

export function AmountDisplay({
  value,
  placeholder = '$0.00',
  empty = false,
  label,
  className = '',
}: AmountDisplayProps) {
  const resolvedValue = empty ? placeholder : value;

  return (
    <div
      className={`amount-display${empty ? ' amount-display--empty' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {label && <span className="amount-display__label">{label}</span>}
      <span className="amount-display__value">{resolvedValue}</span>
    </div>
  );
}
