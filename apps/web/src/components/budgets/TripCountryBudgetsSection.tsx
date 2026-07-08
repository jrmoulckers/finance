// SPDX-License-Identifier: BUSL-1.1

/**
 * TripCountryBudgetsSection — trip / country budgeting on the Budgets surface
 * (#2205).
 *
 * A digital nomad defines a named trip (countries, start/end dates, local
 * currency, optional tags) and a local-currency target. Spend is derived from
 * their REAL transactions by the pure scope engine and rolled up into their
 * home / display currency using the app's real exchange-rate primitives — this
 * component is presentation only and receives already-computed
 * {@link TripBudgetView}s plus handlers; it never imports a repository or hook.
 *
 * Accessibility (WCAG 2.2 AA):
 *  - every control has an associated <label htmlFor> (+ aria-describedby hint);
 *  - the result count and roll-up disclosures live in aria-live regions;
 *  - trip status and over-budget state use an icon AND text — never colour
 *    alone;
 *  - progress is exposed via role="progressbar" with min/now/max + label;
 *  - all actions are native buttons, keyboard reachable, and the progress fill
 *    honours `prefers-reduced-motion` (see the stylesheet).
 *
 * References: issue #2205
 */

import React, { useId, useState } from 'react';

import { AppIcon, type IconName } from '../icons';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { Checkbox } from '../common/Checkbox';
import {
  getTripBudgetStatus,
  parseTripBudgetAmount,
  splitTokens,
  type TripBudgetStatus,
  type TripBudgetView,
  type TripCountryBudgetFormInput,
} from '../../lib/budgeting/trip-country-budgets';

import './TripCountryBudgetsSection.css';

/** A selectable currency option (shape shared with the display-currency picker). */
export interface TripCurrencyOption {
  readonly value: string;
  readonly label: string;
}

export interface TripCountryBudgetsSectionProps {
  /** Views already filtered for the current archived + country selection. */
  readonly views: readonly TripBudgetView[];
  /** Distinct country codes across all trips, for the filter control. */
  readonly countries: readonly string[];
  /** Currently selected country filter (empty string = all). */
  readonly countryFilter: string;
  readonly onCountryFilterChange: (code: string) => void;
  /** Whether archived trips are included in the list. */
  readonly showArchived: boolean;
  readonly onShowArchivedChange: (next: boolean) => void;
  /** The user's global display currency — the default home roll-up currency. */
  readonly displayCurrency: string;
  /** Currencies offered in the local / display pickers. */
  readonly supportedCurrencies: readonly TripCurrencyOption[];
  /** `true` when exchange rates may be stale or offline (disclosed to the user). */
  readonly ratesStale: boolean;
  /** `true` while exchange rates are still loading. */
  readonly ratesLoading: boolean;
  /** Today as an ISO `YYYY-MM-DD` string, used for lifecycle status. */
  readonly today: string;
  readonly onCreate: (input: TripCountryBudgetFormInput) => void;
  readonly onArchiveChange: (id: string, archived: boolean) => void;
  readonly onDelete: (id: string) => void;
}

const STATUS_META: Record<TripBudgetStatus, { readonly label: string; readonly icon: IconName }> = {
  upcoming: { label: 'Upcoming', icon: 'calendar' },
  active: { label: 'Active', icon: 'plane' },
  ended: { label: 'Ended', icon: 'check-circle' },
  archived: { label: 'Archived', icon: 'package' },
};

/** Format an ISO date as e.g. "1 Jan 2026"; falls back to the raw string. */
function formatIsoDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A single trip/country budget card. */
const TripBudgetCard: React.FC<{
  readonly view: TripBudgetView;
  readonly today: string;
  readonly onArchiveChange: (id: string, archived: boolean) => void;
  readonly onDelete: (id: string) => void;
}> = ({ view, today, onArchiveChange, onDelete }) => {
  const { budget } = view;
  const status = getTripBudgetStatus(budget, today);
  const statusMeta = STATUS_META[status];
  const progressNow = Math.min(100, Math.max(0, view.percentUsed));
  const countryLabel = budget.countries.length > 0 ? budget.countries.join(', ') : 'Any country';
  const remainingAbsLocal = Math.abs(view.remainingLocalCents);

  return (
    <article className="tcb-card" aria-labelledby={`${budget.id}-name`}>
      <header className="tcb-card__header">
        <div>
          <h4 className="tcb-card__name" id={`${budget.id}-name`}>
            {budget.name}
          </h4>
          <p className="tcb-card__meta">
            <AppIcon name="map-pin" size={16} />
            <span>{countryLabel}</span>
            <span aria-hidden="true">·</span>
            <AppIcon name="calendar" size={16} />
            <span>
              {formatIsoDate(budget.startDate)} – {formatIsoDate(budget.endDate)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{budget.localCurrency}</span>
          </p>
        </div>
        <span className={`tcb-badge tcb-badge--${status}`}>
          <AppIcon name={statusMeta.icon} size={16} />
          <span>{statusMeta.label}</span>
        </span>
      </header>

      <div
        className="tcb-card__progress"
        role="progressbar"
        aria-valuenow={progressNow}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${budget.name} local budget: ${view.percentUsed}% used${
          view.isOverBudget ? ', over budget' : ''
        }`}
      >
        <div
          className={`tcb-card__progress-fill${
            view.isOverBudget ? ' tcb-card__progress-fill--over' : ''
          }`}
          style={{ width: `${progressNow}%` }}
        />
      </div>

      <dl className="tcb-card__figures">
        <div className="tcb-card__figure">
          <dt>Spent (local)</dt>
          <dd>
            <CurrencyDisplay
              amount={view.localSpentCents}
              currency={budget.localCurrency}
              context={`spent in ${budget.name}`}
            />{' '}
            <span className="tcb-card__muted">
              of <CurrencyDisplay amount={view.budgetLocalCents} currency={budget.localCurrency} />
            </span>
          </dd>
        </div>
        <div className="tcb-card__figure">
          <dt>Home roll-up</dt>
          <dd>
            {view.displayConversionAvailable &&
            view.displaySpentCents !== null &&
            view.budgetDisplayCents !== null ? (
              <>
                <CurrencyDisplay
                  amount={view.displaySpentCents}
                  currency={view.displayCurrency}
                  context={`spent in ${budget.name}, ${view.displayCurrency}`}
                />{' '}
                <span className="tcb-card__muted">
                  of{' '}
                  <CurrencyDisplay
                    amount={view.budgetDisplayCents}
                    currency={view.displayCurrency}
                  />
                </span>
              </>
            ) : (
              <span className="tcb-card__muted">No {view.displayCurrency} rate available</span>
            )}
          </dd>
        </div>
        <div className="tcb-card__figure">
          <dt>{view.isOverBudget ? 'Over by' : 'Remaining'}</dt>
          <dd className={view.isOverBudget ? 'tcb-card__over' : undefined}>
            <AppIcon name={view.isOverBudget ? 'alert-triangle' : 'check-circle'} size={16} />{' '}
            <CurrencyDisplay
              amount={remainingAbsLocal}
              currency={budget.localCurrency}
              context={
                view.isOverBudget ? `over budget in ${budget.name}` : `remaining in ${budget.name}`
              }
            />
            {view.isOverBudget ? ' over budget' : ' left'}
          </dd>
        </div>
      </dl>

      {view.unconvertedCurrencies.length > 0 ? (
        <p className="tcb-card__note">
          <AppIcon name="info" size={16} /> Excludes spend in{' '}
          {view.unconvertedCurrencies.join(', ')} (no exchange rate).
        </p>
      ) : null}

      <footer className="tcb-card__footer">
        <span className="tcb-card__count">
          {view.rollup.includedTransactionIds.length}{' '}
          {view.rollup.includedTransactionIds.length === 1 ? 'transaction' : 'transactions'}
        </span>
        <div className="tcb-card__actions">
          <button
            type="button"
            className="tcb-button tcb-button--ghost"
            onClick={() => onArchiveChange(budget.id, !budget.archived)}
          >
            <AppIcon name="package" size={16} />{' '}
            {budget.archived ? `Reopen ${budget.name}` : `Archive ${budget.name}`}
          </button>
          <button
            type="button"
            className="tcb-button tcb-button--danger"
            onClick={() => onDelete(budget.id)}
            aria-label={`Delete ${budget.name} trip budget`}
          >
            <AppIcon name="trash" size={16} /> Delete
          </button>
        </div>
      </footer>
    </article>
  );
};

/**
 * Trip & country budgets surface block, mounted inside the lazy Budgets route.
 */
export const TripCountryBudgetsSection: React.FC<TripCountryBudgetsSectionProps> = ({
  views,
  countries,
  countryFilter,
  onCountryFilterChange,
  showArchived,
  onShowArchivedChange,
  displayCurrency,
  supportedCurrencies,
  ratesStale,
  ratesLoading,
  today,
  onCreate,
  onArchiveChange,
  onDelete,
}) => {
  const fieldId = useId();
  const id = (suffix: string): string => `${fieldId}-${suffix}`;

  const [name, setName] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [localCurrency, setLocalCurrency] = useState('');
  const [homeCurrency, setHomeCurrency] = useState(displayCurrency);
  const [amount, setAmount] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = (): void => {
    setName('');
    setCountryInput('');
    setStartDate('');
    setEndDate('');
    setLocalCurrency('');
    setHomeCurrency(displayCurrency);
    setAmount('');
    setTagsInput('');
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setFormError('Give the trip a name.');
      return;
    }
    if (!startDate || !endDate) {
      setFormError('Enter a start and end date.');
      return;
    }
    if (endDate < startDate) {
      setFormError('The end date must be on or after the start date.');
      return;
    }
    if (!localCurrency) {
      setFormError('Choose the local currency you will spend in.');
      return;
    }
    const budgetLocalCents = parseTripBudgetAmount(amount, localCurrency);
    if (budgetLocalCents <= 0) {
      setFormError('Enter a budget amount greater than zero.');
      return;
    }

    setFormError(null);
    onCreate({
      name: trimmedName,
      countries: splitTokens(countryInput),
      startDate,
      endDate,
      localCurrency,
      displayCurrency: homeCurrency || displayCurrency,
      budgetLocalCents,
      tags: splitTokens(tagsInput),
    });
    resetForm();
  };

  const countOnlyConverted = views.filter((view) => view.displayConversionAvailable).length;
  const resultSummary =
    views.length === 0
      ? 'No trip budgets match the current filter.'
      : `Showing ${views.length} trip ${views.length === 1 ? 'budget' : 'budgets'}` +
        (countOnlyConverted < views.length
          ? ` (${views.length - countOnlyConverted} without a home-currency rate).`
          : '.');

  return (
    <section className="tcb" aria-labelledby={id('heading')}>
      <div className="tcb__intro">
        <span className="tcb__icon" aria-hidden="true">
          <AppIcon name="globe" size={20} />
        </span>
        <div>
          <h3 className="tcb__heading" id={id('heading')}>
            Trip &amp; country budgets
          </h3>
          <p className="tcb__subtitle">
            Budget a named trip in its local currency and watch spend, drawn from your real
            transactions, roll up into {displayCurrency}. Filter by country, then archive a finished
            trip without losing its history.
          </p>
        </div>
      </div>

      {(ratesStale || ratesLoading) && (
        <p className="tcb__rates" role="status" aria-live="polite">
          <AppIcon name="info" size={16} />{' '}
          {ratesLoading
            ? 'Loading exchange rates…'
            : 'Home-currency roll-ups use cached rates that may be stale or offline.'}
        </p>
      )}

      <form className="tcb-form" onSubmit={handleSubmit} noValidate aria-describedby={id('error')}>
        <p className="tcb-form__legend">New trip budget</p>
        <div className="tcb-form__grid">
          <div className="tcb-field">
            <label className="tcb-field__label" htmlFor={id('name')}>
              Trip name
            </label>
            <input
              id={id('name')}
              className="tcb-field__input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Bangkok Jan–Mar"
              autoComplete="off"
            />
          </div>
          <div className="tcb-field">
            <label className="tcb-field__label" htmlFor={id('countries')}>
              Countries
            </label>
            <input
              id={id('countries')}
              className="tcb-field__input"
              type="text"
              value={countryInput}
              onChange={(event) => setCountryInput(event.target.value)}
              placeholder="TH, VN"
              aria-describedby={id('countries-hint')}
              autoComplete="off"
            />
            <p id={id('countries-hint')} className="tcb-field__hint">
              ISO country codes, comma separated. Leave blank to include any country.
            </p>
          </div>
          <div className="tcb-field">
            <label className="tcb-field__label" htmlFor={id('start')}>
              Start date
            </label>
            <input
              id={id('start')}
              className="tcb-field__input"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="tcb-field">
            <label className="tcb-field__label" htmlFor={id('end')}>
              End date
            </label>
            <input
              id={id('end')}
              className="tcb-field__input"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
          <div className="tcb-field">
            <label className="tcb-field__label" htmlFor={id('local')}>
              Local currency
            </label>
            <select
              id={id('local')}
              className="tcb-field__input"
              value={localCurrency}
              onChange={(event) => setLocalCurrency(event.target.value)}
            >
              <option value="">Select…</option>
              {supportedCurrencies.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="tcb-field">
            <label className="tcb-field__label" htmlFor={id('home')}>
              Home roll-up currency
            </label>
            <select
              id={id('home')}
              className="tcb-field__input"
              value={homeCurrency}
              onChange={(event) => setHomeCurrency(event.target.value)}
            >
              {supportedCurrencies.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="tcb-field">
            <label className="tcb-field__label" htmlFor={id('amount')}>
              Budget (local currency)
            </label>
            <input
              id={id('amount')}
              className="tcb-field__input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="90000"
            />
          </div>
          <div className="tcb-field">
            <label className="tcb-field__label" htmlFor={id('tags')}>
              Tags
            </label>
            <input
              id={id('tags')}
              className="tcb-field__input"
              type="text"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="trip"
              aria-describedby={id('tags-hint')}
              autoComplete="off"
            />
            <p id={id('tags-hint')} className="tcb-field__hint">
              Optional. Only transactions carrying every listed tag are counted.
            </p>
          </div>
        </div>

        <div className="tcb-form__actions">
          <p className="tcb-form__error" id={id('error')} role="alert" aria-live="assertive">
            {formError ? (
              <>
                <AppIcon name="alert-circle" size={16} /> {formError}
              </>
            ) : (
              ''
            )}
          </p>
          <button type="submit" className="tcb-button tcb-button--primary">
            Add trip budget
          </button>
        </div>
      </form>

      <div className="tcb-filters">
        <div className="tcb-field tcb-field--inline">
          <label className="tcb-field__label" htmlFor={id('filter-country')}>
            Filter by country
          </label>
          <select
            id={id('filter-country')}
            className="tcb-field__input"
            value={countryFilter}
            onChange={(event) => onCountryFilterChange(event.target.value)}
          >
            <option value="">All countries</option>
            {countries.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <Checkbox
          id={id('show-archived')}
          className="tcb-checkbox"
          label="Show archived trips"
          checked={showArchived}
          onChange={(event) => onShowArchivedChange(event.target.checked)}
        />
      </div>

      <p className="tcb__count" role="status" aria-live="polite">
        {resultSummary}
      </p>

      {views.length === 0 ? (
        <p className="tcb__empty">
          Create a trip budget above to track local-currency spend with a {displayCurrency} roll-up.
        </p>
      ) : (
        <div className="tcb-cards">
          {views.map((view) => (
            <TripBudgetCard
              key={view.budget.id}
              view={view}
              today={today}
              onArchiveChange={onArchiveChange}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default TripCountryBudgetsSection;
