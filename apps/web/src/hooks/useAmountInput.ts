// SPDX-License-Identifier: BUSL-1.1

/**
 * Venmo-style amount input hook — cents-first formatting.
 *
 * As the user types digits, the display formats as currency from the right:
 * "" → type "1" → "$0.01" → type "2" → "$0.12" → type "3" → "$1.23"
 *
 * Backspace removes the last digit. Optional direct text entry and sign toggling
 * remain supported for existing forms.
 *
 * @module hooks/useAmountInput
 * @see Issues #1462, #1912, #1916
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

const DEFAULT_MAX_CENTS = 99_999_999;
const PASS_THROUGH_KEYS = new Set([
  'Tab',
  'Escape',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

export type AmountInputMode = 'incremental' | 'standard';
export type AmountSign = 'positive' | 'negative';

export interface UseAmountInputOptions {
  currencySymbol?: string;
  decimalPlaces?: number;
  initialCents?: number;
  allowNegative?: boolean;
  maxCents?: number;
  mode?: AmountInputMode;
}

/** Result returned by {@link useAmountInput}. */
export interface UseAmountInputResult {
  /** Formatted display string (e.g., "$1.23" or "-$1.23"). */
  displayValue: string;
  /** Controlled input value for the underlying text field. */
  inputValue: string;
  /** Placeholder shown while the field is empty. */
  placeholderValue: string;
  /** Whether the amount currently has no entered digits. */
  isEmpty: boolean;
  /** Raw integer value in cents (e.g., 123 for $1.23 or -123 for -$1.23). */
  cents: number;
  /** Current sign for the amount. */
  sign: AmountSign;
  /** Whether negative values are currently allowed. */
  allowNegative: boolean;
  /** Handler for keydown events on the input. */
  handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  /** Handler for change events to support direct text entry and paste. */
  handleChange: React.ChangeEventHandler<HTMLInputElement>;
  /** Reset the amount to zero or a specific cents value. */
  reset: (initialCents?: number) => void;
  /** Set to a specific cents value (useful for edit mode). */
  setCents: (value: number) => void;
  /** Toggle between positive and negative signs. */
  toggleSign: () => void;
  /** Explicitly set the current sign. */
  setSign: (sign: AmountSign) => void;
}

function clampMagnitude(value: number, maxCents: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.trunc(value)), maxCents);
}

function normalizeSign(value: number, allowNegative: boolean): AmountSign {
  return allowNegative && value < 0 ? 'negative' : 'positive';
}

function parseAmountText(
  value: string,
  decimalPlaces: number,
  allowNegative: boolean,
  maxCents: number,
): { magnitudeCents: number; sign: AmountSign } {
  const normalized = value.replace(/−/g, '-').trim();
  const sign: AmountSign = allowNegative && normalized.startsWith('-') ? 'negative' : 'positive';
  const numeric = normalized.replace(/[^0-9.]/g, '');

  if (!numeric) {
    return { magnitudeCents: 0, sign };
  }

  const [wholePart = '0', fractionPart = ''] = numeric.split('.', 2);
  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';

  if (decimalPlaces === 0) {
    return {
      magnitudeCents: clampMagnitude(Number.parseInt(whole, 10) || 0, maxCents),
      sign,
    };
  }

  const fraction = fractionPart.slice(0, decimalPlaces).padEnd(decimalPlaces, '0');
  const magnitude = Number.parseInt(`${whole}${fraction}`, 10);

  return {
    magnitudeCents: clampMagnitude(Number.isNaN(magnitude) ? 0 : magnitude, maxCents),
    sign,
  };
}

export function parseAmountInput(
  value: string,
  decimalPlaces: number = 2,
  allowNegative: boolean = true,
): number {
  const { magnitudeCents, sign } = parseAmountText(
    value,
    decimalPlaces,
    allowNegative,
    Number.MAX_SAFE_INTEGER,
  );

  return sign === 'negative' ? -magnitudeCents : magnitudeCents;
}

/**
 * Format cents as a currency display string.
 */
export function formatCentsDisplay(
  cents: number,
  currencySymbol: string = '$',
  decimalPlaces: number = 2,
): string {
  const signPrefix = cents < 0 ? '-' : '';
  const value = Math.abs(cents) / Math.pow(10, decimalPlaces);

  return `${signPrefix}${currencySymbol}${value.toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })}`;
}

function formatSignedMagnitude(
  magnitudeCents: number,
  sign: AmountSign,
  currencySymbol: string,
  decimalPlaces: number,
): string {
  return formatCentsDisplay(
    sign === 'negative' ? -magnitudeCents : magnitudeCents,
    currencySymbol,
    decimalPlaces,
  );
}

function formatPlainAmount(
  magnitudeCents: number,
  sign: AmountSign,
  decimalPlaces: number,
): string {
  if (magnitudeCents === 0) {
    return sign === 'negative' ? '-' : '';
  }

  const signPrefix = sign === 'negative' ? '-' : '';
  return `${signPrefix}${(magnitudeCents / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces)}`;
}

/**
 * Venmo-style cents-first amount input hook.
 */
export function useAmountInput(options: UseAmountInputOptions = {}): UseAmountInputResult {
  const {
    currencySymbol = '$',
    decimalPlaces = 2,
    initialCents = 0,
    allowNegative = true,
    maxCents = DEFAULT_MAX_CENTS,
    mode = 'incremental',
  } = options;

  const [magnitudeCents, setMagnitudeCents] = useState(() =>
    clampMagnitude(Math.abs(initialCents), maxCents),
  );
  const [sign, setSignState] = useState<AmountSign>(() =>
    normalizeSign(initialCents, allowNegative),
  );

  useEffect(() => {
    if (!allowNegative) {
      setSignState('positive');
    }
  }, [allowNegative]);

  useEffect(() => {
    setMagnitudeCents((current) => clampMagnitude(current, maxCents));
  }, [maxCents]);

  const setSign = useCallback(
    (nextSign: AmountSign) => {
      setSignState(allowNegative ? nextSign : 'positive');
    },
    [allowNegative],
  );

  const toggleSign = useCallback(() => {
    if (!allowNegative) {
      return;
    }

    setSignState((current) => (current === 'negative' ? 'positive' : 'negative'));
  }, [allowNegative]);

  const syncFromCents = useCallback(
    (value: number) => {
      const next = Math.trunc(value);
      setMagnitudeCents(clampMagnitude(Math.abs(next), maxCents));
      setSignState(normalizeSign(next, allowNegative));
    },
    [allowNegative, maxCents],
  );

  const cents = useMemo(() => {
    const effectiveSign = allowNegative ? sign : 'positive';
    return effectiveSign === 'negative' ? -magnitudeCents : magnitudeCents;
  }, [allowNegative, magnitudeCents, sign]);

  const isEmpty = magnitudeCents === 0;
  const effectiveSign = allowNegative ? sign : 'positive';
  const placeholderValue = useMemo(
    () => formatSignedMagnitude(0, effectiveSign, currencySymbol, decimalPlaces),
    [currencySymbol, decimalPlaces, effectiveSign],
  );
  const formattedValue = useMemo(
    () => formatSignedMagnitude(magnitudeCents, effectiveSign, currencySymbol, decimalPlaces),
    [currencySymbol, decimalPlaces, effectiveSign, magnitudeCents],
  );

  const handleKeyDown = useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
    (event) => {
      if (mode !== 'incremental') {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey || PASS_THROUGH_KEYS.has(event.key)) {
        return;
      }

      event.preventDefault();

      if (event.key === 'Backspace') {
        setMagnitudeCents((current) => Math.floor(current / 10));
        return;
      }

      if (allowNegative && (event.key === '+' || event.key === '-' || event.key === '−')) {
        setSign(event.key === '+' ? 'positive' : 'negative');
        return;
      }

      if (/^\d$/.test(event.key)) {
        const digit = Number.parseInt(event.key, 10);
        setMagnitudeCents((current) => {
          const next = current * 10 + digit;
          return next > maxCents ? current : next;
        });
      }
    },
    [allowNegative, maxCents, mode, setSign],
  );

  const handleChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      const rawValue = event.target.value.replace(/−/g, '-');
      const parsed = parseAmountText(rawValue, decimalPlaces, allowNegative, maxCents);
      const trimmedValue = rawValue.trim();
      const nextSign: AmountSign = trimmedValue.startsWith('-')
        ? 'negative'
        : trimmedValue.startsWith('+')
          ? 'positive'
          : allowNegative
            ? effectiveSign
            : 'positive';

      setMagnitudeCents(parsed.magnitudeCents);
      setSignState(nextSign);
    },
    [allowNegative, decimalPlaces, effectiveSign, maxCents],
  );

  const reset = useCallback(
    (initial: number = 0) => {
      syncFromCents(initial);
    },
    [syncFromCents],
  );

  const setCents = useCallback(
    (value: number) => {
      syncFromCents(value);
    },
    [syncFromCents],
  );

  return {
    displayValue: isEmpty ? placeholderValue : formattedValue,
    inputValue:
      mode === 'standard'
        ? formatPlainAmount(magnitudeCents, effectiveSign, decimalPlaces)
        : isEmpty
          ? ''
          : formattedValue,
    placeholderValue,
    isEmpty,
    cents,
    sign: effectiveSign,
    allowNegative,
    handleKeyDown,
    handleChange,
    reset,
    setCents,
    toggleSign,
    setSign,
  };
}
