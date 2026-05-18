// SPDX-License-Identifier: BUSL-1.1

/**
 * Venmo-style amount input hook — cents-first formatting.
 *
 * As the user types digits, the display formats as currency from the right:
 * "" → type "1" → "$0.01" → type "2" → "$0.12" → type "3" → "$1.23"
 *
 * Backspace removes the last digit. Only numeric input is accepted.
 *
 * @module hooks/useAmountInput
 * @see Issues #1462
 */

import { useCallback, useState } from 'react';

/** Result returned by {@link useAmountInput}. */
export interface UseAmountInputResult {
  /** Formatted display string (e.g., "$1.23"). */
  displayValue: string;
  /** Raw integer value in cents (e.g., 123 for $1.23). */
  cents: number;
  /** Handler for keydown events on the input. Call this from onKeyDown. */
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Handler for change events — prevents native input, uses keydown only. */
  handleChange: () => void;
  /** Reset the amount to zero or a specific cents value. */
  reset: (initialCents?: number) => void;
  /** Set to a specific cents value (useful for edit mode). */
  setCents: (value: number) => void;
}

/**
 * Format cents as a currency display string.
 *
 * @param cents - Integer amount in smallest currency unit.
 * @param currencySymbol - Symbol to prepend (default "$").
 * @param decimalPlaces - Number of decimal places (default 2).
 */
export function formatCentsDisplay(
  cents: number,
  currencySymbol: string = '$',
  decimalPlaces: number = 2,
): string {
  const divisor = Math.pow(10, decimalPlaces);
  const value = (cents / divisor).toFixed(decimalPlaces);
  return `${currencySymbol}${value}`;
}

/**
 * Venmo-style cents-first amount input hook.
 *
 * @param options - Configuration options.
 * @param options.currencySymbol - Symbol to display (default "$").
 * @param options.decimalPlaces - Decimal places for the currency (default 2).
 * @param options.initialCents - Starting value in cents (default 0).
 */
export function useAmountInput(
  options: {
    currencySymbol?: string;
    decimalPlaces?: number;
    initialCents?: number;
  } = {},
): UseAmountInputResult {
  const { currencySymbol = '$', decimalPlaces = 2, initialCents = 0 } = options;

  const [rawCents, setRawCents] = useState(initialCents);

  const displayValue = formatCentsDisplay(rawCents, currencySymbol, decimalPlaces);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow Tab, Escape, and other navigation keys to pass through
    if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Enter') {
      return;
    }

    e.preventDefault();

    if (e.key === 'Backspace') {
      setRawCents((prev) => Math.floor(prev / 10));
      return;
    }

    // Only accept digit keys
    if (/^\d$/.test(e.key)) {
      const digit = parseInt(e.key, 10);
      setRawCents((prev) => {
        const next = prev * 10 + digit;
        // Cap at a reasonable maximum (999,999,999 cents = $9,999,999.99)
        return next > 999_999_999 ? prev : next;
      });
    }
  }, []);

  const handleChange = useCallback(() => {
    // No-op: we control the value entirely through keydown
  }, []);

  const reset = useCallback((initial?: number) => {
    setRawCents(initial ?? 0);
  }, []);

  const setCents = useCallback((value: number) => {
    setRawCents(Math.max(0, Math.trunc(value)));
  }, []);

  return {
    displayValue,
    cents: rawCents,
    handleKeyDown,
    handleChange,
    reset,
    setCents,
  };
}
