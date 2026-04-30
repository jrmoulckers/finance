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

import { useMultiCurrency } from '../../hooks/useMultiCurrency';
import type { Currency } from '../../kmp/bridge';

import './CurrencyDisplay.css';

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
  label = 'Currency',
  id = 'currency-selector',
}: CurrencySelectorProps) {
  const { supportedCurrencies } = useMultiCurrency();

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
        {label}
      </label>
      <select
        id={id}
        className="currency-selector__select"
        value={value}
        onChange={handleChange}
        aria-label={`Select ${label.toLowerCase()}`}
      >
        {supportedCurrencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code} (
            {currency.decimalPlaces === 0 ? 'no decimals' : `${currency.decimalPlaces} decimals`})
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

  if (from === to) return null;

  const rate = getRate(from, to);

  return (
    <div
      className="exchange-rate-indicator"
      role="status"
      aria-label={`Exchange rate from ${from} to ${to}`}
    >
      {loading ? (
        <span className="exchange-rate-indicator__loading">Loading rates…</span>
      ) : rate !== null ? (
        <>
          <span className="exchange-rate-indicator__rate">
            1 {from} = {rate.toFixed(4)} {to}
          </span>
          {lastUpdated && (
            <span className="exchange-rate-indicator__updated">
              Updated: {new Date(lastUpdated).toLocaleString()}
            </span>
          )}
          <span className="exchange-rate-indicator__source">Source: Static rates</span>
        </>
      ) : (
        <span className="exchange-rate-indicator__unavailable">
          Rate unavailable for {from}/{to}
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

export function MultiCurrencyTotals({
  items,
  title = 'Multi-Currency Totals',
}: MultiCurrencyTotalsProps) {
  const { calculateMultiCurrencyTotal, formatWithSymbol, defaultCurrency } = useMultiCurrency();

  const totals = calculateMultiCurrencyTotal(items);

  const grandTotalCents = totals.reduce((sum, t) => sum + t.convertedCents, 0);

  return (
    <section className="multi-currency-totals" aria-labelledby="multi-currency-title">
      <h3 id="multi-currency-title" className="multi-currency-totals__title">
        {title}
      </h3>

      {totals.length === 0 ? (
        <p className="multi-currency-totals__empty">No items to display.</p>
      ) : (
        <>
          <ul className="multi-currency-totals__list" role="list" aria-label="Currency breakdown">
            {totals.map((total) => (
              <li key={total.currency.code} className="multi-currency-totals__item">
                <span className="multi-currency-totals__currency">{total.currency.code}</span>
                <span className="multi-currency-totals__amount">
                  {formatWithSymbol(total.totalCents, total.currency)}
                </span>
                {total.currency.code !== defaultCurrency.code && (
                  <span
                    className="multi-currency-totals__converted"
                    aria-label={`Converted to ${defaultCurrency.code}`}
                  >
                    ≈ {formatWithSymbol(total.convertedCents, defaultCurrency)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div
            className="multi-currency-totals__grand"
            aria-label={`Grand total in ${defaultCurrency.code}`}
          >
            <span className="multi-currency-totals__grand-label">Total</span>
            <span className="multi-currency-totals__grand-value">
              {formatWithSymbol(grandTotalCents, defaultCurrency)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
