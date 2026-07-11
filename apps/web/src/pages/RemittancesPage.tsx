// SPDX-License-Identifier: BUSL-1.1

/**
 * RemittancesPage — track money sent abroad: fees, FX rate, and recipient
 * details (issue #2170).
 *
 * The persona sends ~$500/month to family in Mexico and needs to see, at a
 * glance, how much was sent, how much was lost to fees and FX margin, the rate
 * the recipient received, and how much actually arrived.
 *
 * Edge / client-side only — entries persist to localStorage via
 * `useRemittances`. All FX/fee math is delegated to the pure `lib/remittance`
 * module. Every user-facing string is routed through the i18n catalog and all
 * money/numbers are formatted per the active locale (CLDR).
 *
 * Accessibility (WCAG 2.2 AA):
 * - Section landmarks with `aria-label`; a single page-level `<h1>` heading,
 *   with `<h2>` sub-section headings.
 * - Every control has an associated `<label>`; required fields set
 *   `aria-required`; errors wire `aria-invalid` + `aria-describedby` to
 *   `role="alert"` messages.
 * - The live estimate and summary use `aria-live="polite"`.
 * - The fee model is a `<fieldset>`/`<legend>` radio group.
 *
 * References: issue #2170
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ConfirmDialog, CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { useLocalePreferences } from '../hooks/useLocalePreferences';
import { useRemittances } from '../hooks/useRemittances';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { formatCurrency } from '../lib/currency';
import { formatCurrencyGroup } from '../lib/currency-utils';
import {
  SUPPORTED_CURRENCY_METADATA,
  getCurrencyFractionDigits,
  minorUnitFactor,
} from '../lib/currency-metadata';
import { translate } from '../lib/i18n';
import { normalizeNumberInput } from '../lib/i18n/local-currency-entry';
import {
  quoteRemittance,
  projectUpcomingRemittances,
  advanceRemittanceDate,
  REMITTANCE_FREQUENCIES,
} from '../lib/remittance';
import type {
  RemittanceFeeModel,
  RemittanceFrequency,
  RemittanceQuote,
  RemittanceRecord,
} from '../lib/remittance';
import { formatDate } from '../utils/formatDate';
import './remittances.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// FX rates carry more fractional precision than currency amounts; format/entry
// allow up to 6 decimals (see `formatRate`).
const RATE_MAX_DECIMALS = 6;

function toMinor(value: string, currency: string): number {
  const normalized = normalizeNumberInput(value, getCurrencyFractionDigits(currency));
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num)) return Number.NaN;
  return Math.round(num * minorUnitFactor(currency));
}

function parseRate(value: string): number {
  return Number.parseFloat(normalizeNumberInput(value, RATE_MAX_DECIMALS));
}

function formatRate(rate: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(rate);
}

/** Plain (non-grouped) numeric string suitable for a `type="number"` input. */
function rateInputValue(rate: number): string {
  return String(Number(rate.toFixed(RATE_MAX_DECIMALS)));
}

function formatCountry(value: string, locale: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    try {
      const display = new Intl.DisplayNames([locale], { type: 'region' });
      return display.of(trimmed.toUpperCase()) ?? trimmed.toUpperCase();
    } catch {
      return trimmed.toUpperCase();
    }
  }
  return trimmed;
}

function recordToQuote(record: RemittanceRecord): RemittanceQuote {
  return quoteRemittance({
    sendAmountMinor: record.sendAmountMinor,
    feeMinor: record.feeMinor,
    fxRate: record.fxRate,
    feeModel: record.feeModel,
    sourceCurrency: record.sourceCurrency,
    destCurrency: record.destCurrency,
    referenceRate: record.referenceRate ?? undefined,
  });
}

function describedBy(id: string, hasError: boolean, hasHelp: boolean): string | undefined {
  const ids: string[] = [];
  if (hasHelp) ids.push(`${id}-help`);
  if (hasError) ids.push(`${id}-error`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

const CURRENCY_OPTIONS = SUPPORTED_CURRENCY_METADATA;

// ---------------------------------------------------------------------------
// Estimate (live quote preview)
// ---------------------------------------------------------------------------

interface EstimateProps {
  quote: RemittanceQuote;
  locale: string;
  t: (id: string, values?: Record<string, string | number>) => string;
}

const Estimate: React.FC<EstimateProps> = ({ quote, locale, t }) => (
  <section
    className="remittance-estimate"
    aria-label={t('remittance.preview.title')}
    aria-live="polite"
  >
    <h2 className="remittance-section__title">{t('remittance.preview.title')}</h2>
    <dl className="remittance-estimate__grid">
      <div className="remittance-estimate__item remittance-estimate__item--hero">
        <dt>{t('remittance.preview.received')}</dt>
        <dd>
          <CurrencyDisplay amount={quote.receivedMinor} currency={quote.destCurrency} />
        </dd>
      </div>
      <div className="remittance-estimate__item">
        <dt>{t('remittance.preview.totalPaid')}</dt>
        <dd>
          <CurrencyDisplay amount={quote.totalPaidMinor} currency={quote.sourceCurrency} />
        </dd>
      </div>
      <div className="remittance-estimate__item">
        <dt>{t('remittance.preview.feesLost')}</dt>
        <dd>
          <CurrencyDisplay amount={quote.feeMinor} currency={quote.sourceCurrency} />
        </dd>
      </div>
      <div className="remittance-estimate__item">
        <dt>{t('remittance.preview.appliedRate')}</dt>
        <dd>
          {t('remittance.preview.rateValue', {
            sourceCurrency: quote.sourceCurrency,
            rate: formatRate(quote.appliedRate, locale),
            destCurrency: quote.destCurrency,
          })}
        </dd>
      </div>
      <div className="remittance-estimate__item">
        <dt>{t('remittance.preview.effectiveRate')}</dt>
        <dd>
          {t('remittance.preview.rateValue', {
            sourceCurrency: quote.sourceCurrency,
            rate: formatRate(quote.effectiveRate, locale),
            destCurrency: quote.destCurrency,
          })}
        </dd>
      </div>
      {quote.totalCostMinor !== null ? (
        <>
          <div className="remittance-estimate__item">
            <dt>{t('remittance.preview.fxMargin')}</dt>
            <dd>
              <CurrencyDisplay
                amount={quote.fxSpreadCostMinor ?? 0}
                currency={quote.sourceCurrency}
              />
            </dd>
          </div>
          <div className="remittance-estimate__item remittance-estimate__item--cost">
            <dt>{t('remittance.preview.totalCost')}</dt>
            <dd>
              <CurrencyDisplay amount={quote.totalCostMinor} currency={quote.sourceCurrency} />
            </dd>
          </div>
        </>
      ) : (
        <div className="remittance-estimate__item remittance-estimate__hint">
          <dt className="remittance-visually-hidden">{t('remittance.preview.totalCost')}</dt>
          <dd>{t('remittance.preview.noReference')}</dd>
        </div>
      )}
    </dl>
  </section>
);

// ---------------------------------------------------------------------------
// History item
// ---------------------------------------------------------------------------

interface HistoryItemProps {
  record: RemittanceRecord;
  locale: string;
  t: (id: string, values?: Record<string, string | number>) => string;
  onDelete: () => void;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ record, locale, t, onDelete }) => {
  const quote = recordToQuote(record);
  const country = formatCountry(record.recipient.country, locale);
  const sentLabel = formatCurrency(quote.totalPaidMinor, {
    currency: record.sourceCurrency,
    locale,
  });
  const feeModelLabel =
    record.feeModel === 'INCLUSIVE'
      ? t('remittance.history.feeModel.inclusive')
      : t('remittance.history.feeModel.additive');

  return (
    <article
      className="remittance-card"
      role="listitem"
      aria-label={t('remittance.history.itemAria', {
        amount: sentLabel,
        recipient: record.recipient.name,
        country,
        date: formatDate(record.date, { locale }),
      })}
    >
      <header className="remittance-card__header">
        <div>
          <h3 className="remittance-card__name">{record.recipient.name}</h3>
          <p className="remittance-card__meta">
            {country} · {formatDate(record.date, { locale })} · {feeModelLabel}
          </p>
        </div>
        <button
          type="button"
          className="remittance-card__delete"
          onClick={onDelete}
          aria-label={t('remittance.history.deleteAria', {
            recipient: record.recipient.name,
            date: formatDate(record.date, { locale }),
          })}
        >
          {t('remittance.history.delete')}
        </button>
      </header>
      <dl className="remittance-card__figures">
        <div>
          <dt>{t('remittance.history.sent')}</dt>
          <dd>
            <CurrencyDisplay amount={quote.totalPaidMinor} currency={record.sourceCurrency} />
          </dd>
        </div>
        <div>
          <dt>{t('remittance.history.fee')}</dt>
          <dd>
            <CurrencyDisplay amount={quote.feeMinor} currency={record.sourceCurrency} />
          </dd>
        </div>
        <div>
          <dt>{t('remittance.history.rate')}</dt>
          <dd>
            {t('remittance.preview.rateValue', {
              sourceCurrency: record.sourceCurrency,
              rate: formatRate(quote.appliedRate, locale),
              destCurrency: record.destCurrency,
            })}
          </dd>
        </div>
        <div>
          <dt>{t('remittance.history.received')}</dt>
          <dd className="remittance-card__received">
            <CurrencyDisplay amount={quote.receivedMinor} currency={record.destCurrency} />
          </dd>
        </div>
        <div>
          <dt>{t('remittance.history.effectiveRate')}</dt>
          <dd>
            {t('remittance.preview.rateValue', {
              sourceCurrency: record.sourceCurrency,
              rate: formatRate(quote.effectiveRate, locale),
              destCurrency: record.destCurrency,
            })}
          </dd>
        </div>
      </dl>
    </article>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const RemittancesPage: React.FC = () => {
  const { locale } = useLocalePreferences();
  const {
    remittances,
    summary,
    recipientBreakdown,
    loading,
    error,
    refresh,
    createRemittance,
    deleteRemittance,
  } = useRemittances();

  const t = useCallback(
    (id: string, values: Record<string, string | number> = {}) =>
      translate(id, values, locale).text,
    [locale],
  );

  const [deletingRecord, setDeletingRecord] = useState<RemittanceRecord | null>(null);

  const handleConfirmDelete = useCallback(() => {
    if (deletingRecord) {
      deleteRemittance(deletingRecord.id);
      setDeletingRecord(null);
    }
  }, [deletingRecord, deleteRemittance]);

  // Form state
  const [recipientName, setRecipientName] = useState('');
  const [recipientCountry, setRecipientCountry] = useState('MX');
  const [date, setDate] = useState(today);
  const [sourceCurrency, setSourceCurrency] = useState('USD');
  const [destCurrency, setDestCurrency] = useState('MXN');
  const [sendAmount, setSendAmount] = useState('');
  const [fee, setFee] = useState('');
  const [feeModel, setFeeModel] = useState<RemittanceFeeModel>('ADDITIVE');
  const [fxRate, setFxRate] = useState('');
  const [referenceRate, setReferenceRate] = useState('');
  const [note, setNote] = useState('');
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'none' | RemittanceFrequency>(
    'none',
  );
  const [recurrenceNextDate, setRecurrenceNextDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Mid-market reference rate from the exchange-rate service (base = source
  // currency), used to prefill the FX/reference rate fields (#3296).
  const { rates: fxRates } = useExchangeRates(sourceCurrency);
  const midMarketRate =
    sourceCurrency !== destCurrency ? (fxRates[destCurrency]?.rate ?? null) : null;

  // Prefill the mid-market reference rate when the user has not typed one, so the
  // FX-margin estimate is populated by default without clobbering manual input.
  useEffect(() => {
    if (midMarketRate && midMarketRate > 0) {
      setReferenceRate((prev) => (prev.trim() ? prev : rateInputValue(midMarketRate)));
    }
  }, [midMarketRate]);

  const applyMidMarketRate = useCallback(() => {
    if (midMarketRate && midMarketRate > 0) {
      const value = rateInputValue(midMarketRate);
      setFxRate(value);
      setReferenceRate(value);
    }
  }, [midMarketRate]);

  // Project the next occurrence of each recurring remittance over the coming
  // quarter so the sender can see scheduled outflows at a glance (#3265).
  const upcomingRemittances = useMemo(() => {
    const from = today();
    const horizon = advanceRemittanceDate(from, 'quarterly');
    const projected = projectUpcomingRemittances(remittances, from, horizon);
    // One per recurring remittance (its next occurrence), soonest first.
    const seen = new Set<string>();
    const next: typeof projected = [];
    for (const item of projected) {
      if (seen.has(item.record.id)) continue;
      seen.add(item.record.id);
      next.push(item);
    }
    return next;
  }, [remittances]);

  const parsedSendMinor = toMinor(sendAmount, sourceCurrency);
  const parsedFeeMinor = fee.trim() ? toMinor(fee, sourceCurrency) : 0;
  const parsedFx = parseRate(fxRate);
  const parsedRef = referenceRate.trim() ? parseRate(referenceRate) : undefined;

  const previewQuote = useMemo<RemittanceQuote | null>(() => {
    if (!Number.isFinite(parsedSendMinor) || parsedSendMinor <= 0) return null;
    if (!Number.isFinite(parsedFx) || parsedFx <= 0) return null;
    const feeMinor = Number.isFinite(parsedFeeMinor) ? Math.max(0, parsedFeeMinor) : 0;
    const ref =
      parsedRef !== undefined && Number.isFinite(parsedRef) && parsedRef > 0
        ? parsedRef
        : undefined;
    try {
      return quoteRemittance({
        sendAmountMinor: parsedSendMinor,
        feeMinor,
        fxRate: parsedFx,
        feeModel,
        sourceCurrency,
        destCurrency,
        referenceRate: ref,
      });
    } catch {
      return null;
    }
  }, [
    parsedSendMinor,
    parsedFeeMinor,
    parsedFx,
    parsedRef,
    feeModel,
    sourceCurrency,
    destCurrency,
  ]);

  const validate = useCallback((): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!recipientName.trim()) next.recipientName = t('remittance.form.recipientName.required');
    if (!recipientCountry.trim())
      next.recipientCountry = t('remittance.form.recipientCountry.required');
    if (!date) next.date = t('remittance.form.date.required');
    if (!sendAmount.trim()) {
      next.sendAmount = t('remittance.form.sendAmount.required');
    } else if (!Number.isFinite(parsedSendMinor) || parsedSendMinor <= 0) {
      next.sendAmount = t('remittance.form.sendAmount.invalid');
    }
    if (fee.trim() && (!Number.isFinite(parsedFeeMinor) || parsedFeeMinor < 0)) {
      next.fee = t('remittance.form.fee.invalid');
    }
    if (!fxRate.trim()) {
      next.fxRate = t('remittance.form.fxRate.required');
    } else if (!Number.isFinite(parsedFx) || parsedFx <= 0) {
      next.fxRate = t('remittance.form.fxRate.invalid');
    }
    if (
      referenceRate.trim() &&
      (parsedRef === undefined || !Number.isFinite(parsedRef) || parsedRef <= 0)
    ) {
      next.referenceRate = t('remittance.form.referenceRate.invalid');
    }
    if (sourceCurrency === destCurrency) {
      next.destCurrency = t('remittance.form.destCurrency.sameCurrency');
    }
    return next;
  }, [
    recipientName,
    recipientCountry,
    date,
    sendAmount,
    fee,
    fxRate,
    referenceRate,
    sourceCurrency,
    destCurrency,
    parsedSendMinor,
    parsedFeeMinor,
    parsedFx,
    parsedRef,
    t,
  ]);

  const resetForm = useCallback(() => {
    setRecipientName('');
    setSendAmount('');
    setFee('');
    setFxRate('');
    setReferenceRate('');
    setNote('');
    setRecurrenceFrequency('none');
    setRecurrenceNextDate('');
    setErrors({});
    setSubmitError(null);
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setSubmitError(null);
      const validationErrors = validate();
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) return;

      const created = createRemittance({
        date,
        sourceCurrency,
        destCurrency,
        sendAmountMinor: parsedSendMinor,
        feeMinor: Number.isFinite(parsedFeeMinor) ? Math.max(0, parsedFeeMinor) : 0,
        fxRate: parsedFx,
        feeModel,
        referenceRate:
          parsedRef !== undefined && Number.isFinite(parsedRef) && parsedRef > 0 ? parsedRef : null,
        recipient: { name: recipientName.trim(), country: recipientCountry.trim() },
        note: note.trim() ? note.trim() : null,
        recurrence:
          recurrenceFrequency === 'none'
            ? null
            : {
                frequency: recurrenceFrequency,
                nextDate: recurrenceNextDate.trim() ? recurrenceNextDate : date,
              },
      });

      if (!created) {
        setSubmitError(t('remittance.form.saveError'));
        return;
      }
      resetForm();
    },
    [
      validate,
      createRemittance,
      date,
      sourceCurrency,
      destCurrency,
      parsedSendMinor,
      parsedFeeMinor,
      parsedFx,
      parsedRef,
      feeModel,
      recipientName,
      recipientCountry,
      note,
      recurrenceFrequency,
      recurrenceNextDate,
      resetForm,
      t,
    ],
  );

  if (loading) {
    return (
      <div className="remittance-page__loading">
        <LoadingSpinner label={t('remittance.history.loading')} />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  const hasRecords = remittances.length > 0;

  return (
    <div className="remittance-page">
      <header className="remittance-page__header">
        <h1 className="remittance-page__title">{t('remittance.page.title')}</h1>
        <p className="remittance-page__subtitle">{t('remittance.page.subtitle')}</p>
      </header>

      {/* Entry form */}
      <section className="remittance-section" aria-label={t('remittance.form.title')}>
        <h2 className="remittance-section__title">{t('remittance.form.title')}</h2>
        <form className="remittance-form" onSubmit={handleSubmit} noValidate>
          {submitError && (
            <p className="remittance-form__banner-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="remittance-field">
            <label htmlFor="remit-recipient-name" className="remittance-field__label">
              {t('remittance.form.recipientName.label')}
              <span aria-hidden="true"> *</span>
            </label>
            <input
              id="remit-recipient-name"
              className="remittance-field__input"
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              aria-required="true"
              aria-invalid={Boolean(errors.recipientName)}
              aria-describedby={describedBy(
                'remit-recipient-name',
                Boolean(errors.recipientName),
                false,
              )}
              autoComplete="off"
            />
            {errors.recipientName && (
              <p id="remit-recipient-name-error" className="remittance-field__error" role="alert">
                {errors.recipientName}
              </p>
            )}
          </div>

          <div className="remittance-field">
            <label htmlFor="remit-recipient-country" className="remittance-field__label">
              {t('remittance.form.recipientCountry.label')}
              <span aria-hidden="true"> *</span>
            </label>
            <input
              id="remit-recipient-country"
              className="remittance-field__input"
              type="text"
              value={recipientCountry}
              onChange={(e) => setRecipientCountry(e.target.value)}
              aria-required="true"
              aria-invalid={Boolean(errors.recipientCountry)}
              aria-describedby={describedBy(
                'remit-recipient-country',
                Boolean(errors.recipientCountry),
                true,
              )}
              autoComplete="off"
            />
            <p id="remit-recipient-country-help" className="remittance-field__help">
              {t('remittance.form.recipientCountry.help')}
            </p>
            {errors.recipientCountry && (
              <p
                id="remit-recipient-country-error"
                className="remittance-field__error"
                role="alert"
              >
                {errors.recipientCountry}
              </p>
            )}
          </div>

          <div className="remittance-field">
            <label htmlFor="remit-date" className="remittance-field__label">
              {t('remittance.form.date.label')}
              <span aria-hidden="true"> *</span>
            </label>
            <input
              id="remit-date"
              className="remittance-field__input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-required="true"
              aria-invalid={Boolean(errors.date)}
              aria-describedby={describedBy('remit-date', Boolean(errors.date), false)}
            />
            {errors.date && (
              <p id="remit-date-error" className="remittance-field__error" role="alert">
                {errors.date}
              </p>
            )}
          </div>

          <div className="remittance-field-row">
            <div className="remittance-field">
              <label htmlFor="remit-source-currency" className="remittance-field__label">
                {t('remittance.form.sourceCurrency.label')}
              </label>
              <select
                id="remit-source-currency"
                className="remittance-field__input"
                value={sourceCurrency}
                onChange={(e) => setSourceCurrency(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="remittance-field">
              <label htmlFor="remit-dest-currency" className="remittance-field__label">
                {t('remittance.form.destCurrency.label')}
              </label>
              <select
                id="remit-dest-currency"
                className="remittance-field__input"
                value={destCurrency}
                onChange={(e) => setDestCurrency(e.target.value)}
                aria-invalid={Boolean(errors.destCurrency)}
                aria-describedby={describedBy(
                  'remit-dest-currency',
                  Boolean(errors.destCurrency),
                  false,
                )}
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
              {errors.destCurrency && (
                <p id="remit-dest-currency-error" className="remittance-field__error" role="alert">
                  {errors.destCurrency}
                </p>
              )}
            </div>
          </div>

          <div className="remittance-field-row">
            <div className="remittance-field">
              <label htmlFor="remit-send-amount" className="remittance-field__label">
                {t('remittance.form.sendAmount.label')}
                <span aria-hidden="true"> *</span>
              </label>
              <input
                id="remit-send-amount"
                className="remittance-field__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                aria-required="true"
                aria-invalid={Boolean(errors.sendAmount)}
                aria-describedby={describedBy(
                  'remit-send-amount',
                  Boolean(errors.sendAmount),
                  false,
                )}
              />
              {errors.sendAmount && (
                <p id="remit-send-amount-error" className="remittance-field__error" role="alert">
                  {errors.sendAmount}
                </p>
              )}
            </div>
            <div className="remittance-field">
              <label htmlFor="remit-fee" className="remittance-field__label">
                {t('remittance.form.fee.label')}
              </label>
              <input
                id="remit-fee"
                className="remittance-field__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                aria-invalid={Boolean(errors.fee)}
                aria-describedby={describedBy('remit-fee', Boolean(errors.fee), false)}
              />
              {errors.fee && (
                <p id="remit-fee-error" className="remittance-field__error" role="alert">
                  {errors.fee}
                </p>
              )}
            </div>
          </div>

          <fieldset className="remittance-fieldset">
            <legend className="remittance-field__label">
              {t('remittance.form.feeModel.label')}
            </legend>
            <label className="remittance-radio">
              <input
                type="radio"
                name="remit-fee-model"
                value="ADDITIVE"
                checked={feeModel === 'ADDITIVE'}
                onChange={() => setFeeModel('ADDITIVE')}
              />
              <span>{t('remittance.form.feeModel.additive')}</span>
            </label>
            <label className="remittance-radio">
              <input
                type="radio"
                name="remit-fee-model"
                value="INCLUSIVE"
                checked={feeModel === 'INCLUSIVE'}
                onChange={() => setFeeModel('INCLUSIVE')}
              />
              <span>{t('remittance.form.feeModel.inclusive')}</span>
            </label>
          </fieldset>

          <div className="remittance-field-row">
            <div className="remittance-field">
              <label htmlFor="remit-fx-rate" className="remittance-field__label">
                {t('remittance.form.fxRate.label')}
                <span aria-hidden="true"> *</span>
              </label>
              <input
                id="remit-fx-rate"
                className="remittance-field__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                aria-required="true"
                aria-invalid={Boolean(errors.fxRate)}
                aria-describedby={describedBy('remit-fx-rate', Boolean(errors.fxRate), true)}
              />
              <p id="remit-fx-rate-help" className="remittance-field__help">
                {t('remittance.form.fxRate.help', { sourceCurrency, destCurrency })}
              </p>
              {errors.fxRate && (
                <p id="remit-fx-rate-error" className="remittance-field__error" role="alert">
                  {errors.fxRate}
                </p>
              )}
            </div>
            <div className="remittance-field">
              <label htmlFor="remit-reference-rate" className="remittance-field__label">
                {t('remittance.form.referenceRate.label')}
              </label>
              <input
                id="remit-reference-rate"
                className="remittance-field__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={referenceRate}
                onChange={(e) => setReferenceRate(e.target.value)}
                aria-invalid={Boolean(errors.referenceRate)}
                aria-describedby={describedBy(
                  'remit-reference-rate',
                  Boolean(errors.referenceRate),
                  true,
                )}
              />
              <p id="remit-reference-rate-help" className="remittance-field__help">
                {t('remittance.form.referenceRate.help')}
              </p>
              {midMarketRate && midMarketRate > 0 && (
                <div className="remittance-field__prefill">
                  <button
                    type="button"
                    className="remittance-field__prefill-button"
                    onClick={applyMidMarketRate}
                  >
                    {t('remittance.form.fxRate.prefill')}
                  </button>
                  <span className="remittance-field__help">
                    {t('remittance.form.fxRate.prefillHint', {
                      rate: formatRate(midMarketRate, locale),
                    })}
                  </span>
                </div>
              )}
              {errors.referenceRate && (
                <p id="remit-reference-rate-error" className="remittance-field__error" role="alert">
                  {errors.referenceRate}
                </p>
              )}
            </div>
          </div>

          <div className="remittance-field-row">
            <div className="remittance-field">
              <label htmlFor="remit-recurrence" className="remittance-field__label">
                {t('remittance.form.recurrence.label')}
              </label>
              <select
                id="remit-recurrence"
                className="remittance-field__input"
                value={recurrenceFrequency}
                onChange={(e) =>
                  setRecurrenceFrequency(e.target.value as 'none' | RemittanceFrequency)
                }
                aria-describedby="remit-recurrence-help"
              >
                <option value="none">{t('remittance.form.recurrence.none')}</option>
                {REMITTANCE_FREQUENCIES.map((freq) => (
                  <option key={freq} value={freq}>
                    {t(`remittance.form.recurrence.freq.${freq}`)}
                  </option>
                ))}
              </select>
              <p id="remit-recurrence-help" className="remittance-field__help">
                {t('remittance.form.recurrence.help')}
              </p>
            </div>
            {recurrenceFrequency !== 'none' && (
              <div className="remittance-field">
                <label htmlFor="remit-recurrence-next" className="remittance-field__label">
                  {t('remittance.form.recurrence.nextDate.label')}
                </label>
                <input
                  id="remit-recurrence-next"
                  className="remittance-field__input"
                  type="date"
                  value={recurrenceNextDate}
                  min={date}
                  onChange={(e) => setRecurrenceNextDate(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="remittance-field">
            <label htmlFor="remit-note" className="remittance-field__label">
              {t('remittance.form.note.label')}
            </label>
            <input
              id="remit-note"
              className="remittance-field__input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
            />
          </div>

          {previewQuote && <Estimate quote={previewQuote} locale={locale} t={t} />}

          <div className="remittance-form__actions">
            <button type="submit" className="remittance-form__submit">
              {t('remittance.form.submit')}
            </button>
          </div>
        </form>
      </section>

      {hasRecords ? (
        <>
          <section
            className="remittance-section"
            aria-label={t('remittance.summary.title')}
            aria-live="polite"
          >
            <h2 className="remittance-section__title">{t('remittance.summary.title')}</h2>
            <div className="remittance-summary-grid">
              <article className="remittance-metric" aria-label={t('remittance.summary.totalSent')}>
                <p className="remittance-metric__label">{t('remittance.summary.totalSent')}</p>
                <p className="remittance-metric__value">
                  {formatCurrencyGroup(summary.sentByCurrency, locale)}
                </p>
              </article>
              <article className="remittance-metric" aria-label={t('remittance.summary.totalFees')}>
                <p className="remittance-metric__label">{t('remittance.summary.totalFees')}</p>
                <p className="remittance-metric__value remittance-metric__value--negative">
                  {formatCurrencyGroup(summary.feesByCurrency, locale)}
                </p>
              </article>
              <article
                className="remittance-metric"
                aria-label={t('remittance.summary.totalReceived')}
              >
                <p className="remittance-metric__label">{t('remittance.summary.totalReceived')}</p>
                <p className="remittance-metric__value remittance-metric__value--positive">
                  {formatCurrencyGroup(summary.receivedByCurrency, locale)}
                </p>
              </article>
              <article className="remittance-metric" aria-label={t('remittance.summary.totalCost')}>
                <p className="remittance-metric__label">{t('remittance.summary.totalCost')}</p>
                <p className="remittance-metric__value remittance-metric__value--negative">
                  {formatCurrencyGroup(summary.totalCostByCurrency, locale)}
                </p>
              </article>
              <article
                className="remittance-metric"
                aria-label={t('remittance.summary.destinations')}
              >
                <p className="remittance-metric__label">{t('remittance.summary.destinations')}</p>
                <p className="remittance-metric__value">
                  {summary.destinationCountries.length > 0
                    ? summary.destinationCountries
                        .map((country) => formatCountry(country, locale))
                        .join(' · ')
                    : t('remittance.summary.none')}
                </p>
              </article>
            </div>
          </section>

          {recipientBreakdown.length > 0 && (
            <section className="remittance-section" aria-label={t('remittance.bySupplier.title')}>
              <h2 className="remittance-section__title">{t('remittance.bySupplier.title')}</h2>
              <div className="remittance-summary-grid" role="list">
                {recipientBreakdown.map((recipient) => (
                  <article key={recipient.name} className="remittance-metric" role="listitem">
                    <p className="remittance-metric__label">
                      {recipient.name}
                      {recipient.country ? ` · ${formatCountry(recipient.country, locale)}` : ''}
                    </p>
                    <p className="remittance-metric__value">
                      {formatCurrencyGroup(recipient.sentByCurrency, locale)}
                    </p>
                    <p className="remittance-metric__label">
                      {t('remittance.bySupplier.transfers', { count: recipient.count })} ·{' '}
                      {t('remittance.summary.totalCost')}:{' '}
                      {formatCurrencyGroup(recipient.totalCostByCurrency, locale)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {upcomingRemittances.length > 0 && (
            <section
              className="remittance-section"
              aria-label={t('remittance.upcoming.title')}
            >
              <h2 className="remittance-section__title">{t('remittance.upcoming.title')}</h2>
              <ul className="remittance-upcoming" role="list">
                {upcomingRemittances.map((item) => {
                  const freq = item.record.recurrence?.frequency;
                  const frequencyLabel = freq
                    ? t(`remittance.form.recurrence.freq.${freq}`)
                    : '';
                  return (
                    <li
                      key={item.record.id}
                      className="remittance-upcoming__item"
                      aria-label={t('remittance.upcoming.itemAria', {
                        amount: formatCurrency(
                          item.totalPaidMinor,
                          item.record.sourceCurrency,
                          locale,
                        ),
                        recipient: item.record.recipient.name,
                        date: formatDate(item.date, locale),
                        frequency: frequencyLabel,
                      })}
                    >
                      <div className="remittance-upcoming__main">
                        <span className="remittance-upcoming__recipient">
                          {item.record.recipient.name}
                        </span>
                        <span className="remittance-upcoming__date">
                          {formatDate(item.date, locale)}
                        </span>
                      </div>
                      <div className="remittance-upcoming__meta">
                        <CurrencyDisplay
                          amount={item.totalPaidMinor}
                          currency={item.record.sourceCurrency}
                        />
                        <span className="remittance-upcoming__badge">
                          {t('remittance.upcoming.badge', { frequency: frequencyLabel })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="remittance-section" aria-label={t('remittance.history.title')}>
            <h2 className="remittance-section__title">
              {t('remittance.history.title')} ({summary.count})
            </h2>
            <div className="remittance-history" role="list">
              {remittances.map((record) => (
                <HistoryItem
                  key={record.id}
                  record={record}
                  locale={locale}
                  t={t}
                  onDelete={() => setDeletingRecord(record)}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section
          className="remittance-section remittance-empty"
          aria-label={t('remittance.empty.title')}
        >
          <h2 className="remittance-empty__title">{t('remittance.empty.title')}</h2>
          <p className="remittance-empty__body">{t('remittance.empty.body')}</p>
        </section>
      )}

      <ConfirmDialog
        isOpen={deletingRecord !== null}
        title={t('remittance.history.confirmDelete.title')}
        message={
          deletingRecord
            ? t('remittance.history.confirmDelete.message', {
                recipient: deletingRecord.recipient.name,
                date: formatDate(deletingRecord.date, { locale }),
              })
            : ''
        }
        confirmLabel={t('remittance.history.confirmDelete.confirm')}
        cancelLabel={t('remittance.history.confirmDelete.cancel')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingRecord(null)}
      />
    </div>
  );
};

export default RemittancesPage;
