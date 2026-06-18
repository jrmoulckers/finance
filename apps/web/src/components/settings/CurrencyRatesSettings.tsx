// SPDX-License-Identifier: BUSL-1.1

/**
 * Currency Rates settings section.
 *
 * Displays current exchange rates with source indicators, allows manual
 * rate overrides, and provides a reset button per override.
 *
 * References: issue #1515
 */

import React, { useCallback, useMemo, useState } from 'react';

import type { ExchangeRate } from '../../lib/currency/exchange-rate-types';
import { STATIC_CURRENCY_CODES } from '../../lib/currency/static-rates';
import { useExchangeRates } from '../../hooks/useExchangeRates';
import { useLocalePreferences } from '../../hooks/useLocalePreferences';
import { createSettingsCopy } from '../../lib/i18n/settings-catalog';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Props for `CurrencyRatesSettings`. */
export interface CurrencyRatesSettingsProps {
  /** The user's base currency (ISO 4217). Defaults to "USD". */
  baseCurrency?: string;
}

/**
 * Settings section showing exchange rates with override controls.
 */
export const CurrencyRatesSettings: React.FC<CurrencyRatesSettingsProps> = ({
  baseCurrency = 'USD',
}) => {
  const {
    rates,
    loading,
    error,
    lastUpdated,
    providerName,
    isOffline,
    isStale,
    hasManualOverrides,
    setOverride,
    removeOverride,
    overrides,
    refresh,
  } = useExchangeRates(baseCurrency);

  const { locale, timeZone } = useLocalePreferences();
  const copy = createSettingsCopy(locale);
  const [editingPair, setEditingPair] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Show a subset of common currencies first, then all others
  const displayCurrencies = useMemo(() => {
    const common = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR'];
    const rest = STATIC_CURRENCY_CODES.filter((c) => c !== baseCurrency && !common.includes(c));
    return [...common, ...rest].filter((c) => c !== baseCurrency);
  }, [baseCurrency]);

  const handleStartEdit = useCallback((currencyCode: string, currentRate: number) => {
    setEditingPair(currencyCode);
    setEditValue(String(currentRate));
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingPair(null);
    setEditValue('');
  }, []);

  const handleSaveEdit = useCallback(
    (currencyCode: string) => {
      const parsed = parseFloat(editValue);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return; // invalid input — do nothing
      }
      setOverride(baseCurrency, currencyCode, parsed);
      setEditingPair(null);
      setEditValue('');
    },
    [baseCurrency, editValue, setOverride],
  );

  const handleResetOverride = useCallback(
    (currencyCode: string) => {
      removeOverride(baseCurrency, currencyCode);
    },
    [baseCurrency, removeOverride],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, currencyCode: string) => {
      if (e.key === 'Enter') {
        handleSaveEdit(currencyCode);
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit],
  );

  const formatTimestamp = (ts: string | null): string => {
    if (!ts) return copy.text('currencyRatesNever');
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
      }).format(new Date(ts));
    } catch {
      return ts;
    }
  };

  const getSourceLabel = (rate: ExchangeRate | undefined): string => {
    if (!rate) return copy.text('currencyRatesNotAvailable');
    return copy.sourceLabel(rate.source);
  };

  const isOverridden = (currencyCode: string): boolean => {
    return `${baseCurrency}:${currencyCode}` in overrides;
  };

  if (loading) {
    return (
      <section aria-label={copy.text('currencyRatesTitle')} className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">{copy.text('currencyRatesTitle')}</h3>
          <div className="settings-item settings-item--static" role="status" aria-live="polite">
            <span className="settings-item__label">{copy.text('currencyRatesLoading')}</span>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label={copy.text('currencyRatesTitle')} className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">{copy.text('currencyRatesTitle')}</h3>
          <div className="settings-item settings-item--static" role="alert">
            <span className="settings-item__label">
              {copy.text('currencyRatesError', { error })}
            </span>
          </div>
          <button
            type="button"
            className="settings-item settings-item--button"
            onClick={refresh}
            aria-label={copy.text('currencyRatesRetryAria')}
          >
            <span className="settings-item__label">{copy.text('currencyRatesRetry')}</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={copy.text('currencyRatesTitle')} className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">{copy.text('currencyRatesTitle')}</h3>

        {/* Meta info */}
        <div className="settings-item settings-item--static">
          <span className="settings-item__label">{copy.text('currencyRatesProvider')}</span>
          <span className="settings-item__value">{providerName}</span>
        </div>
        <div className="settings-item settings-item--static">
          <span className="settings-item__label">{copy.text('currencyRatesLastUpdated')}</span>
          <span className="settings-item__value">{formatTimestamp(lastUpdated)}</span>
        </div>
        <div className="settings-item settings-item--static">
          <span className="settings-item__label">{copy.text('currencyRatesBaseCurrency')}</span>
          <span className="settings-item__value">{baseCurrency}</span>
        </div>
        {(isOffline || isStale || hasManualOverrides) && (
          <div className="settings-item settings-item--static" role="status" aria-live="polite">
            <span className="settings-item__label">{copy.text('currencyRatesFreshness')}</span>
            <span className="settings-item__value settings-item__value--muted">
              {isOffline ? copy.text('currencyRatesOfflineFallback') + ' ' : ''}
              {isStale ? copy.text('currencyRatesStale') + ' ' : ''}
              {hasManualOverrides ? copy.text('currencyRatesManualOverridesActive') + ' ' : ''}
            </span>
          </div>
        )}

        {/* Rate list */}
        <details className="currency-rates-disclosure">
          <summary className="currency-rates-disclosure__summary">
            <span className="currency-rates-disclosure__title">
              {copy.text('currencyRatesExchangeRates')}
            </span>
            <span className="currency-rates-disclosure__hint">
              {copy.text('currencyRatesExpandHint')}
            </span>
          </summary>
          <div
            role="table"
            aria-label={copy.text('currencyRatesTableAria', { baseCurrency })}
            className="currency-rates-table"
          >
            <div role="row" className="currency-rates-table__header">
              <span role="columnheader" className="currency-rates-table__cell">
                {copy.text('currencyRatesCurrency')}
              </span>
              <span role="columnheader" className="currency-rates-table__cell">
                {copy.text('currencyRatesRate')}
              </span>
              <span role="columnheader" className="currency-rates-table__cell">
                {copy.text('currencyRatesSource')}
              </span>
              <span role="columnheader" className="currency-rates-table__cell">
                {copy.text('currencyRatesActions')}
              </span>
            </div>

            {displayCurrencies.map((code) => {
              const rate = rates[code];
              const isEditing = editingPair === code;
              const hasOverride = isOverridden(code);

              return (
                <div key={code} role="row" className="currency-rates-table__row">
                  <span role="cell" className="currency-rates-table__cell">
                    {code}
                  </span>
                  <span role="cell" className="currency-rates-table__cell">
                    {isEditing ? (
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className="currency-rates-table__input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, code)}
                        aria-label={copy.text('currencyRatesOverrideRateAria', {
                          fromCurrency: baseCurrency,
                          toCurrency: code,
                        })}
                        autoFocus
                      />
                    ) : (
                      <span>{rate ? rate.rate.toFixed(4) : '—'}</span>
                    )}
                  </span>
                  <span role="cell" className="currency-rates-table__cell">
                    <span
                      className={`currency-rates-badge currency-rates-badge--${rate?.source ?? 'static'}`}
                    >
                      {getSourceLabel(rate)}
                    </span>
                  </span>
                  <span role="cell" className="currency-rates-table__cell">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="currency-rates-table__action"
                          onClick={() => handleSaveEdit(code)}
                          aria-label={copy.text('currencyRatesSaveOverrideAria', {
                            currency: code,
                          })}
                        >
                          {copy.text('currencyRatesSave')}
                        </button>
                        <button
                          type="button"
                          className="currency-rates-table__action"
                          onClick={handleCancelEdit}
                          aria-label={copy.text('currencyRatesCancelEditingAria')}
                        >
                          {copy.text('currencyRatesCancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="currency-rates-table__action"
                          onClick={() => handleStartEdit(code, rate?.rate ?? 0)}
                          aria-label={copy.text('currencyRatesOverrideRateShortAria', {
                            currency: code,
                          })}
                        >
                          {copy.text('currencyRatesOverride')}
                        </button>
                        {hasOverride && (
                          <button
                            type="button"
                            className="currency-rates-table__action currency-rates-table__action--reset"
                            onClick={() => handleResetOverride(code)}
                            aria-label={copy.text('currencyRatesResetOverrideAria', {
                              currency: code,
                            })}
                          >
                            {copy.text('currencyRatesReset')}
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </details>

        {/* Disclaimer */}
        <div className="settings-item settings-item--static">
          <span className="settings-item__value settings-item__value--muted">
            {copy.text('currencyRatesDisclaimer')}
          </span>
        </div>
      </div>
    </section>
  );
};

export default CurrencyRatesSettings;
