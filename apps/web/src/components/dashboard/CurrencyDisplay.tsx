// SPDX-License-Identifier: BUSL-1.1

/**
 * Currency display components for multi-currency support.
 *
 * Provides CurrencySelector, ExchangeRateIndicator, and
 * MultiCurrencyTotals dashboard widget.
 *
 * References: issue #1075
 */

import { useCallback } from 'react';

import { useLocalePreferences } from '../../hooks/useLocalePreferences';
import { useMultiCurrency } from '../../hooks/useMultiCurrency';
import type { Currency } from '../../kmp/bridge';
import { translate } from '../../lib/i18n';

import './CurrencyDisplay.css';

/**
 * Resolve catalog strings against the active locale so the multi-currency
 * dashboard chrome stays translated and reacts to locale preference changes.
 */
function useCurrencyStrings() {
  const { locale } = useLocalePreferences();
  const t = useCallback(
    (id: string, values?: Record<string, string | number>) => translate(id, values, locale).text,
    [locale],
  );
  return { t, locale };
}

// ---------------------------------------------------------------------------
// CurrencySelector
// ---------------------------------------------------------------------------

export interface CurrencySelectorProps {
  /** Currently selected currency code. */
  value: string;
  /** Called when user selects a different currency. */
  onChange: (currency: Currency) => void;
  /** Optional label (defaults to "Currency"). */
  label?: string;
  /** HTML id for the select element. */
  id?: string;
}

export function CurrencySelector({
  value,
  onChange,
  label,
  id = 'currency-selector',
}: CurrencySelectorProps) {
  const { supportedCurrencies } = useMultiCurrency();
  const { t } = useCurrencyStrings();
  const resolvedLabel = label ?? t('dashboard.currency.selector.label');

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = supportedCurrencies.find((c) => c.code === e.target.value);
      if (selected) {
        onChange(selected);
      }
    },
    [supportedCurrencies, onChange],
  );

  return (
    <div className="currency-selector">
      <label htmlFor={id} className="currency-selector__label">
        {resolvedLabel}
      </label>
      <select
        id={id}
        className="currency-selector__select"
        value={value}
        onChange={handleChange}
        aria-label={t('dashboard.currency.selector.selectAria', {
          label: resolvedLabel.toLowerCase(),
        })}
      >
        {supportedCurrencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code} (
            {currency.decimalPlaces === 0
              ? t('dashboard.currency.selector.noDecimals')
              : t('dashboard.currency.selector.decimals', { count: currency.decimalPlaces })}
            )
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExchangeRateIndicator
// ---------------------------------------------------------------------------

export interface ExchangeRateIndicatorProps {
  /** Source currency code. */
  from: string;
  /** Target currency code. */
  to: string;
}

export function ExchangeRateIndicator({ from, to }: ExchangeRateIndicatorProps) {
  const { getRate, lastUpdated, loading } = useMultiCurrency();
  const { t, locale } = useCurrencyStrings();

  if (from === to) return null;

  const rate = getRate(from, to);

  return (
    <div
      className="exchange-rate-indicator"
      role="status"
      aria-label={t('dashboard.currency.rate.regionAria', { from, to })}
    >
      {loading ? (
        <span className="exchange-rate-indicator__loading">
          {t('dashboard.currency.rate.loading')}
        </span>
      ) : rate !== null ? (
        <>
          <span className="exchange-rate-indicator__rate">
            1 {from} = {rate.toFixed(4)} {to}
          </span>
          <span className="exchange-rate-indicator__source">
            {t('dashboard.currency.rate.source')}
          </span>
          {lastUpdated && (
            <span className="exchange-rate-indicator__updated">
              {t('dashboard.currency.rate.snapshot', {
                date: new Date(lastUpdated).toLocaleDateString(locale),
              })}
            </span>
          )}
        </>
      ) : (
        <span className="exchange-rate-indicator__unavailable">
          {t('dashboard.currency.rate.unavailable', { from, to })}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultiCurrencyTotals
// ---------------------------------------------------------------------------

export interface MultiCurrencyTotalsProps {
  /** Items with amounts in different currencies. */
  items: Array<{ amountCents: number; currency: Currency }>;
  /** Optional title. */
  title?: string;
}

export function MultiCurrencyTotals({ items, title }: MultiCurrencyTotalsProps) {
  const { calculateMultiCurrencyTotal, formatWithSymbol, defaultCurrency } = useMultiCurrency();
  const { t } = useCurrencyStrings();

  const totals = calculateMultiCurrencyTotal(items);
  const resolvedTitle = title ?? t('dashboard.currency.totals.title');

  const grandTotalCents = totals.reduce((sum, entry) => sum + entry.convertedCents, 0);

  return (
    <section className="multi-currency-totals" aria-labelledby="multi-currency-title">
      <h3 id="multi-currency-title" className="multi-currency-totals__title">
        {resolvedTitle}
      </h3>

      {totals.length === 0 ? (
        <p className="multi-currency-totals__empty">{t('dashboard.currency.totals.empty')}</p>
      ) : (
        <>
          <ul
            className="multi-currency-totals__list"
            role="list"
            aria-label={t('dashboard.currency.totals.breakdownAria')}
          >
            {totals.map((total) => (
              <li key={total.currency.code} className="multi-currency-totals__item">
                <span className="multi-currency-totals__currency">{total.currency.code}</span>
                <span className="multi-currency-totals__amount">
                  {formatWithSymbol(total.totalCents, total.currency)}
                </span>
                {total.currency.code !== defaultCurrency.code && (
                  <span
                    className="multi-currency-totals__converted"
                    aria-label={t('dashboard.currency.totals.convertedAria', {
                      code: defaultCurrency.code,
                    })}
                  >
                    ≈ {formatWithSymbol(total.convertedCents, defaultCurrency)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div
            className="multi-currency-totals__grand"
            aria-label={t('dashboard.currency.totals.grandAria', { code: defaultCurrency.code })}
          >
            <span className="multi-currency-totals__grand-label">
              {t('dashboard.currency.totals.grandLabel')}
            </span>
            <span className="multi-currency-totals__grand-value">
              {formatWithSymbol(grandTotalCents, defaultCurrency)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
