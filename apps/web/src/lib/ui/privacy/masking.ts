// SPDX-License-Identifier: BUSL-1.1

import { getCurrencyFractionDigits, getSafeCurrencyCode, minorUnitFactor } from '../../currency-metadata';
import { getCurrentLocale } from '../../i18n';

/** Canonical privacy masking modes for every money-rendering surface. */
export enum MaskingMode {
  Visible = 'Visible',
  Bucketed = 'Bucketed',
  Percent = 'Percent',
  Dots = 'Dots',
}

/** Options accepted by the canonical money formatter. */
export interface FormatAmountOptions {
  /** ISO-4217 currency code. */
  readonly currency?: string;
  /** Denominator for Percent mode when formatting progress. */
  readonly percentOfCents?: number;
  /** Explicit percent value for Percent mode. */
  readonly percentValue?: number;
  /** Minimum fraction digits for Visible mode. */
  readonly minimumFractionDigits?: number;
  /** Maximum fraction digits for Visible mode. */
  readonly maximumFractionDigits?: number;
  /** Compact notation for chart axes and constrained surfaces. */
  readonly compact?: boolean;
  /** Intl sign display option for Visible mode. */
  readonly signDisplay?: 'auto' | 'exceptZero' | 'always' | 'never';
  /** Intl currency display option for Visible mode. */
  readonly currencyDisplay?: 'symbol' | 'code' | 'name';
}

const DOT_MASK = '•••';
const PROGRESS_ONLY_LABEL = 'Progress only';
const BUCKETS_MAJOR = [
  0, 1, 10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
];

function currencyFormatter(
  locale: string,
  options: Required<Pick<FormatAmountOptions, 'currency'>> & FormatAmountOptions,
): Intl.NumberFormat {
  const currency = getSafeCurrencyCode(options.currency);
  const defaultFractionDigits = getCurrencyFractionDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: options.currencyDisplay ?? 'symbol',
    notation: options.compact ? 'compact' : 'standard',
    minimumFractionDigits: options.minimumFractionDigits ?? (options.compact ? 0 : defaultFractionDigits),
    maximumFractionDigits: options.maximumFractionDigits ?? (options.compact ? 0 : defaultFractionDigits),
    signDisplay: options.signDisplay ?? 'auto',
  });
}

function formatCurrencyMajor(
  valueMajor: number,
  locale: string,
  options: FormatAmountOptions,
): string {
  return currencyFormatter(locale, { currency: options.currency ?? 'USD', ...options }).format(
    valueMajor || 0,
  );
}

function formatCompactCurrency(valueMajor: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: getSafeCurrencyCode(currency),
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valueMajor || 0);
}

function bucketBounds(absMajor: number): { min: number; max: number } {
  if (absMajor <= 0) {
    return { min: 0, max: 0 };
  }

  for (let index = 0; index < BUCKETS_MAJOR.length - 1; index += 1) {
    const min = BUCKETS_MAJOR[index];
    const max = BUCKETS_MAJOR[index + 1];
    if (absMajor > min && absMajor <= max) {
      return { min, max };
    }
  }

  const highest = BUCKETS_MAJOR[BUCKETS_MAJOR.length - 1];
  return { min: highest, max: Number.POSITIVE_INFINITY };
}

function formatBucket(amountInCents: number, locale: string, currency: string): string {
  const absMajor = Math.abs(amountInCents) / minorUnitFactor(currency);
  const sign = amountInCents < 0 ? '-' : '';
  const { min, max } = bucketBounds(absMajor);

  if (min === 0 && max === 0) {
    return formatCompactCurrency(0, locale, currency);
  }

  if (!Number.isFinite(max)) {
    return `${sign}${formatCompactCurrency(min, locale, currency)}+`;
  }

  return `${sign}${formatCompactCurrency(min, locale, currency)}–${formatCompactCurrency(max, locale, currency)}`;
}

function formatPercent(
  amountInCents: number,
  locale: string,
  options: FormatAmountOptions,
): string {
  const percent =
    typeof options.percentValue === 'number'
      ? options.percentValue
      : typeof options.percentOfCents === 'number' && options.percentOfCents !== 0
        ? amountInCents / options.percentOfCents
        : null;

  if (percent === null) {
    return PROGRESS_ONLY_LABEL;
  }

  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(percent);
}

/**
 * Format an integer-cent monetary value through the single privacy-aware path.
 * All user-facing money strings must flow through this function or a component
 * that delegates to it.
 */
export function formatAmount(
  amountInCents: number,
  mode: MaskingMode = MaskingMode.Visible,
  locale = getCurrentLocale(),
  options: FormatAmountOptions = {},
): string {
  switch (mode) {
    case MaskingMode.Visible:
      return formatCurrencyMajor(
        amountInCents / minorUnitFactor(options.currency),
        locale,
        options,
      );
    case MaskingMode.Bucketed:
      return formatBucket(amountInCents, locale, options.currency ?? 'USD');
    case MaskingMode.Percent:
      return formatPercent(amountInCents, locale, options);
    case MaskingMode.Dots:
      return DOT_MASK;
    default:
      return DOT_MASK;
  }
}

/** Format a privacy-aware range from integer-cent lower and upper bounds. */
export function formatRange(
  minCents: number,
  maxCents: number,
  mode: MaskingMode = MaskingMode.Visible,
  locale = getCurrentLocale(),
  options: FormatAmountOptions = {},
): string {
  if (mode === MaskingMode.Percent) {
    return PROGRESS_ONLY_LABEL;
  }

  if (mode === MaskingMode.Dots) {
    return DOT_MASK;
  }

  const left = formatAmount(minCents, mode, locale, options);
  const right = formatAmount(maxCents, mode, locale, options);
  return left === right ? left : `${left}–${right}`;
}

/** Return true when a value is one of the supported masking modes. */
export function isMaskingMode(value: unknown): value is MaskingMode {
  return (
    value === MaskingMode.Visible ||
    value === MaskingMode.Bucketed ||
    value === MaskingMode.Percent ||
    value === MaskingMode.Dots
  );
}
