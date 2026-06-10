// SPDX-License-Identifier: BUSL-1.1

import { forwardRef, type InputHTMLAttributes } from 'react';

import { AmountDisplay } from '../common/AmountDisplay';
import type { UseAmountInputResult } from '../../hooks/useAmountInput';

export interface AmountInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'onKeyDown'
> {
  amountInput: UseAmountInputResult;
  toggleLabel?: string;
  wrapperClassName?: string;
  displayLabel?: string;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  {
    amountInput,
    toggleLabel = 'Toggle amount sign',
    wrapperClassName,
    className,
    inputMode,
    displayLabel = 'Current amount',
    placeholder,
    ...props
  },
  ref,
) {
  const resolvedPlaceholder = placeholder ?? amountInput.placeholderValue;

  return (
    <div className={`form-amount-input${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      <AmountDisplay
        value={amountInput.displayValue}
        empty={amountInput.isEmpty}
        placeholder={resolvedPlaceholder}
        label={displayLabel}
        className="form-amount-input__display"
      />
      <div className="form-amount-input__controls">
        {amountInput.allowNegative && (
          <button
            type="button"
            className={`form-amount-input__toggle${amountInput.sign === 'negative' ? ' form-amount-input__toggle--negative' : ''}`}
            onClick={amountInput.toggleSign}
            aria-label={`${toggleLabel}: currently ${amountInput.sign}`}
          >
            {amountInput.sign === 'negative' ? '−' : '+'}
          </button>
        )}
        <input
          {...props}
          ref={ref}
          type="text"
          inputMode={inputMode ?? 'numeric'}
          className={className}
          value={amountInput.inputValue}
          placeholder={resolvedPlaceholder}
          onKeyDown={amountInput.handleKeyDown}
          onChange={amountInput.handleChange}
        />
      </div>
    </div>
  );
});
