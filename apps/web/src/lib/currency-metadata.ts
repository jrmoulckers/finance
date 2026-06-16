// SPDX-License-Identifier: BUSL-1.1

export interface CurrencyMetadata {
  readonly code: string;
  readonly decimalPlaces: number;
  readonly label: string;
}

export const FALLBACK_CURRENCY = 'USD';

export const SUPPORTED_CURRENCY_METADATA: readonly CurrencyMetadata[] = [
  { code: 'USD', decimalPlaces: 2, label: 'USD – US Dollar' },
  { code: 'EUR', decimalPlaces: 2, label: 'EUR – Euro' },
  { code: 'GBP', decimalPlaces: 2, label: 'GBP – British Pound' },
  { code: 'JPY', decimalPlaces: 0, label: 'JPY – Japanese Yen' },
  { code: 'CAD', decimalPlaces: 2, label: 'CAD – Canadian Dollar' },
  { code: 'AUD', decimalPlaces: 2, label: 'AUD – Australian Dollar' },
  { code: 'CHF', decimalPlaces: 2, label: 'CHF – Swiss Franc' },
  { code: 'CNY', decimalPlaces: 2, label: 'CNY – Chinese Yuan' },
  { code: 'INR', decimalPlaces: 2, label: 'INR – Indian Rupee' },
  { code: 'MXN', decimalPlaces: 2, label: 'MXN – Mexican Peso' },
  { code: 'BRL', decimalPlaces: 2, label: 'BRL – Brazilian Real' },
  { code: 'KRW', decimalPlaces: 0, label: 'KRW – South Korean Won' },
] as const;

const metadataByCode = new Map(SUPPORTED_CURRENCY_METADATA.map((currency) => [currency.code, currency]));

export function normalizeCurrencyCode(code: string | null | undefined): string {
  const normalized = (code ?? FALLBACK_CURRENCY).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : FALLBACK_CURRENCY;
}

export function getCurrencyMetadata(code: string | null | undefined): CurrencyMetadata {
  const normalized = normalizeCurrencyCode(code);
  return metadataByCode.get(normalized) ?? { code: normalized, decimalPlaces: getCurrencyFractionDigits(normalized), label: `${normalized} – ${normalized}` };
}

export function getSafeCurrencyCode(code: string | null | undefined): string {
  const normalized = normalizeCurrencyCode(code);
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: normalized }).format(1);
    return normalized;
  } catch {
    return FALLBACK_CURRENCY;
  }
}

export function getCurrencyFractionDigits(currency: string | null | undefined): number {
  const normalized = normalizeCurrencyCode(currency);
  const known = metadataByCode.get(normalized);
  if (known) return known.decimalPlaces;

  try {
    return (
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: normalized,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function minorUnitFactor(currency: string | null | undefined): number {
  return 10 ** getCurrencyFractionDigits(currency);
}
