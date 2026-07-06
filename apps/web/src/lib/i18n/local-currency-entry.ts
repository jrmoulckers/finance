// SPDX-License-Identifier: BUSL-1.1

import {
  getCurrencyFractionDigits,
  minorUnitFactor,
  normalizeCurrencyCode,
} from '../currency-metadata';

export type LocalCurrencyAmountError =
  | 'required'
  | 'invalid'
  | 'too-many-decimals'
  | 'not-positive'
  | 'too-large';

export interface LocalCurrencyAmountParseSuccess {
  readonly ok: true;
  readonly currency: string;
  readonly decimalPlaces: number;
  readonly minorUnits: number;
  readonly normalizedInput: string;
}

export interface LocalCurrencyAmountParseFailure {
  readonly ok: false;
  readonly currency: string;
  readonly decimalPlaces: number;
  readonly error: LocalCurrencyAmountError;
  readonly messageId: string;
  readonly messageValues: Readonly<Record<string, string | number>>;
}

export type LocalCurrencyAmountParseResult =
  | LocalCurrencyAmountParseSuccess
  | LocalCurrencyAmountParseFailure;

const LOCAL_CURRENCY_AMOUNT_ERROR_IDS: Readonly<Record<LocalCurrencyAmountError, string>> = {
  required: 'transaction.localAmount.error.required',
  invalid: 'transaction.localAmount.error.invalid',
  'too-many-decimals': 'transaction.localAmount.error.tooManyDecimals',
  'not-positive': 'transaction.localAmount.error.notPositive',
  'too-large': 'transaction.localAmount.error.tooLarge',
};

function failure(
  currency: string,
  decimalPlaces: number,
  error: LocalCurrencyAmountError,
): LocalCurrencyAmountParseFailure {
  return {
    ok: false,
    currency,
    decimalPlaces,
    error,
    messageId: LOCAL_CURRENCY_AMOUNT_ERROR_IDS[error],
    messageValues: { currency, decimalPlaces },
  };
}

/**
 * Normalize a locale-entered decimal string to a canonical `.`-decimal form.
 *
 * Handles both `.`-decimal ("1,234.56") and `,`-decimal ("1.234,56") locales by
 * treating the last-occurring separator as the decimal point and stripping the
 * other as a grouping separator. When only a comma is present, `decimalPlaces`
 * disambiguates a decimal comma ("7,24") from a grouping comma ("1,320").
 *
 * Exported so currency amount and FX-rate inputs can share one locale-aware
 * parser instead of re-implementing `.`-only `parseFloat` (issue #3326).
 */
export function normalizeNumberInput(input: string, decimalPlaces: number): string {
  const compact = input.trim().replace(/[\s_]/g, '');
  const lastDot = compact.lastIndexOf('.');
  const lastComma = compact.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const groupSeparator = decimalSeparator === '.' ? ',' : '.';
    return compact
      .replace(new RegExp(`\\${groupSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.');
  }

  if (lastComma >= 0 && lastDot < 0) {
    const fractionalLength = compact.length - lastComma - 1;
    return fractionalLength > 0 && fractionalLength <= decimalPlaces
      ? compact.replace(',', '.')
      : compact.replace(/,/g, '');
  }

  return compact.replace(/,/g, '');
}

export function parseLocalCurrencyAmountInput(
  input: string,
  currencyCode: string | null | undefined,
): LocalCurrencyAmountParseResult {
  const currency = normalizeCurrencyCode(currencyCode);
  const decimalPlaces = getCurrencyFractionDigits(currency);
  const normalizedInput = normalizeNumberInput(input, decimalPlaces);

  if (normalizedInput.length === 0) return failure(currency, decimalPlaces, 'required');
  if (!/^\+?\d+(?:\.\d+)?$/.test(normalizedInput))
    return failure(currency, decimalPlaces, 'invalid');

  const [wholePart, fractionPart = ''] = normalizedInput.replace(/^\+/, '').split('.');
  if (fractionPart.length > decimalPlaces)
    return failure(currency, decimalPlaces, 'too-many-decimals');

  const factor = BigInt(minorUnitFactor(currency));
  const whole = BigInt(wholePart);
  const fraction = BigInt(
    (fractionPart + '0'.repeat(decimalPlaces)).slice(0, decimalPlaces) || '0',
  );
  const minorUnits = whole * factor + fraction;

  if (minorUnits <= 0n) return failure(currency, decimalPlaces, 'not-positive');
  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER))
    return failure(currency, decimalPlaces, 'too-large');

  return {
    ok: true,
    currency,
    decimalPlaces,
    minorUnits: Number(minorUnits),
    normalizedInput,
  };
}

export function getLocalCurrencyAmountStep(currencyCode: string | null | undefined): string {
  const decimalPlaces = getCurrencyFractionDigits(currencyCode);
  return decimalPlaces === 0 ? '1' : `0.${'0'.repeat(Math.max(0, decimalPlaces - 1))}1`;
}

export function getLocalCurrencyAmountPlaceholder(currencyCode: string | null | undefined): string {
  const decimalPlaces = getCurrencyFractionDigits(currencyCode);
  return decimalPlaces === 0 ? '0' : `0.${'0'.repeat(decimalPlaces)}`;
}
