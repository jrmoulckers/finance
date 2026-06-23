// SPDX-License-Identifier: BUSL-1.1
/**
 * Currency picker + foreign-exchange entry fields (issue #2202).
 *
 * Loaded lazily by {@link TransactionForm} so the currency option list, the
 * exchange-rate markup, and the foreign-currency conversion math all stay out
 * of the (saturated) shared route bundles. The transaction-currency picker is
 * always shown here; the exchange-rate fields appear only when the chosen
 * currency differs from the account's base currency.
 *
 * All durable state lives in the parent form; this component derives the live
 * base-currency equivalent for display only (the parent recomputes it
 * deterministically at submit via the same lazily-loaded `fx-convert` module).
 */

import { type ChangeEvent, useEffect } from 'react';

import { formatCurrency } from '../../lib/currency';
import { convertToBaseMinorUnits } from '../../lib/currency/fx-convert';
import { getCurrencyDecimals } from '../../lib/currency/minor-units';
import {
  getCurrencyLabel,
  getCurrencySymbol,
  getEntryCurrencyOptions,
  type FxCurrencyOption,
} from '../../lib/currency/entry-currencies';

export interface CurrencyFxSectionProps {
  /** Effective entry currency ISO code (override, else the account's). */
  readonly entryCurrencyCode: string;
  /** ISO code of the base (account) currency the amount converts to. */
  readonly baseCurrencyCode: string;
  /** Called with the chosen ISO code when the currency picker changes. */
  readonly onCurrencyChange: (code: string) => void;
  /** Reports the entry currency's display symbol so the amount field can show it. */
  readonly onEntrySymbolResolved: (symbol: string) => void;
  /** Signed amount the user typed, in the entry currency's integer minor units. */
  readonly originalMinorUnits: number;
  /** Current raw exchange-rate input value (base units per 1 foreign unit). */
  readonly exchangeRateInput: string;
  /** Called with the new raw value when the rate input changes. */
  readonly onExchangeRateChange: (value: string) => void;
  /** The rate validation message, when present. */
  readonly rateError?: string;
  /** ISO-8601 timestamp the rate was captured, or `null`. */
  readonly rateCapturedAt: string | null;
}

/** Format the captured exchange-rate timestamp for a human-readable hint. */
function formatRateCaptureTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/** Curated options plus the active entry/base codes if not already present. */
function buildOptions(entryCurrencyCode: string, baseCurrencyCode: string): FxCurrencyOption[] {
  const options = getEntryCurrencyOptions();
  const ensurePresent = (code: string) => {
    if (code && !options.some((option) => option.code === code)) {
      options.unshift({
        code,
        decimalPlaces: getCurrencyDecimals(code),
        label: getCurrencyLabel(code),
      });
    }
  };
  ensurePresent(entryCurrencyCode);
  ensurePresent(baseCurrencyCode);
  return options;
}

export default function CurrencyFxSection({
  entryCurrencyCode,
  baseCurrencyCode,
  onCurrencyChange,
  onEntrySymbolResolved,
  originalMinorUnits,
  exchangeRateInput,
  onExchangeRateChange,
  rateError,
  rateCapturedAt,
}: CurrencyFxSectionProps) {
  // Report the entry-currency symbol up to the parent's amount field. Done here
  // (not in the parent) so the `Intl` symbol path stays out of the route bundle.
  useEffect(() => {
    onEntrySymbolResolved(getCurrencySymbol(entryCurrencyCode));
  }, [entryCurrencyCode, onEntrySymbolResolved]);

  const options = buildOptions(entryCurrencyCode, baseCurrencyCode);
  const isForeignEntry = entryCurrencyCode !== baseCurrencyCode;
  const rate = Number.parseFloat(exchangeRateInput);
  const hasValidExchangeRate = exchangeRateInput.trim() !== '' && Number.isFinite(rate) && rate > 0;
  const hasRateError = Boolean(rateError);
  const baseEquivalentMinorUnits = hasValidExchangeRate
    ? convertToBaseMinorUnits({
        originalMinorUnits,
        originalDecimals: getCurrencyDecimals(entryCurrencyCode),
        baseDecimals: getCurrencyDecimals(baseCurrencyCode),
        rate,
      })
    : 0;

  return (
    <>
      {/* Currency (defaults from account, overridable for foreign spend) */}
      <div className="form-group">
        <label htmlFor="txn-currency" className="form-group__label">
          Currency
        </label>
        <p id="txn-currency-help" className="form-group__help">
          Defaults to the account currency. Switch it to log spend in a local currency (e.g. THB,
          MXN, JPY) with the exchange rate you were charged.
        </p>
        <select
          id="txn-currency"
          className="form-select"
          value={entryCurrencyCode}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onCurrencyChange(event.target.value)}
          aria-describedby="txn-currency-help"
        >
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Exchange rate + live base-currency equivalent (foreign spend only) */}
      {isForeignEntry && (
        <div className="form-group">
          <label
            htmlFor="txn-exchange-rate"
            className="form-group__label form-group__label--required"
          >
            Exchange rate
          </label>
          <p id="txn-exchange-rate-help" className="form-group__help">
            {`1 ${entryCurrencyCode} = ? ${baseCurrencyCode}. Enter the rate (including fees) your bank or card actually applied.`}
          </p>
          <input
            id="txn-exchange-rate"
            className={`form-input${hasRateError ? ' form-input--error' : ''}`}
            type="text"
            inputMode="decimal"
            value={exchangeRateInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onExchangeRateChange(event.target.value)
            }
            aria-invalid={hasRateError}
            aria-describedby={`txn-exchange-rate-help txn-fx-equivalent${
              hasRateError ? ' txn-exchange-rate-error' : ''
            }`}
            aria-required="true"
            autoComplete="off"
            placeholder="0.00"
          />
          {hasRateError && (
            <span id="txn-exchange-rate-error" className="form-error" role="alert">
              {rateError}
            </span>
          )}
          <p id="txn-fx-equivalent" className="form-hint" aria-live="polite">
            {hasValidExchangeRate
              ? `Base-currency equivalent: ${formatCurrency(baseEquivalentMinorUnits, {
                  currency: baseCurrencyCode,
                })} ${baseCurrencyCode}`
              : `Enter a rate to see the ${baseCurrencyCode} equivalent.`}
            {hasValidExchangeRate && rateCapturedAt
              ? ` · rate captured ${formatRateCaptureTime(rateCapturedAt)}`
              : ''}
          </p>
        </div>
      )}
    </>
  );
}
