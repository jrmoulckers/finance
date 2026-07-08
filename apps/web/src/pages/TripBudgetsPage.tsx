// SPDX-License-Identifier: BUSL-1.1

/**
 * TripBudgetsPage — trip / country "envelopes" for digital nomads (#2205).
 *
 * Lets a traveller budget a named trip in its local currency (e.g. "Bangkok
 * Jan–Mar" in THB), log local-currency spend, watch progress in both the local
 * currency and a rolled-up home currency, filter spend by trip, and archive a
 * finished trip without losing its historical totals.
 *
 * All money maths lives in the pure engine (`../lib/budgets`); this page is
 * presentation + local state only. Amounts are integer minor units end-to-end
 * and the home-currency roll-up uses each trip's caller-entered FX rate — never
 * a live/network rate (see the engine header for the FX contract). For input
 * convenience the page assumes two-decimal currencies (THB, USD, EUR, GBP …),
 * so the entered FX rate equals the engine's "home-minor per local-minor" rate.
 *
 * Accessibility (WCAG 2.2 AA):
 * - Every date / amount / currency control has an associated <label htmlFor>
 *   and an aria-describedby hint.
 * - Computed roll-up totals live in an aria-live status region.
 * - Trip status and over-budget state are conveyed with an icon **and** text,
 *   never colour alone.
 * - The spend ledger is a real <table> with a <caption> text alternative and
 *   scoped headers; the trip filter is a labelled <select>.
 *
 * References: issue #2205
 */

import React, { useId, useMemo, useState } from 'react';

import { AppIcon, type IconName } from '../components/icons';
import { dollarsToCents, formatCurrency } from '../lib/currency';
import {
  archiveTripBudget,
  summarizeTripBudget,
  summarizeTripBudgets,
  unarchiveTripBudget,
  type TripBudget,
  type TripBudgetReport,
  type TripBudgetStatus,
  type TripTransaction,
} from '../lib/budgets';

import './TripBudgetsPage.css';

// ---------------------------------------------------------------------------
// Parsing helpers (string inputs → integer minor units / rates)
// ---------------------------------------------------------------------------

/** Parse a major-unit string (e.g. "1200.50") into non-negative minor units. */
function parseMajorToMinor(value: string): number {
  const major = Number.parseFloat(value);
  if (!Number.isFinite(major) || major < 0) return 0;
  return dollarsToCents(major);
}

/** Parse a positive FX rate string; returns 0 when blank/invalid. */
function parseRate(value: string): number {
  const rate = Number.parseFloat(value);
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return rate;
}

/** Today's date as an ISO `YYYY-MM-DD` string in the local timezone. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/** Format an ISO date as e.g. "1 Jan 2026" for compact display. */
function formatIsoDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Status presentation (icon + text — never colour alone)
// ---------------------------------------------------------------------------

const STATUS_META: Record<TripBudgetStatus, { label: string; icon: IconName }> = {
  upcoming: { label: 'Upcoming', icon: 'calendar' },
  active: { label: 'Active', icon: 'plane' },
  ended: { label: 'Ended', icon: 'check-circle' },
  archived: { label: 'Archived', icon: 'package' },
};

// ---------------------------------------------------------------------------
// Seed data — a worked example so the page is useful on first load
// ---------------------------------------------------------------------------

const SEED_TRIPS: readonly TripBudget[] = [
  {
    id: 'trip-bangkok',
    name: 'Bangkok Jan–Mar',
    country: 'Thailand',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    localCurrency: 'THB',
    homeCurrency: 'USD',
    plannedLocalMinor: 9_000_000, // ฿90,000.00
    fxRateHomePerLocal: 0.028,
    archived: false,
    archivedAt: null,
    archivedSnapshot: null,
  },
];

const SEED_TRANSACTIONS: readonly TripTransaction[] = [
  {
    id: 'seed-1',
    amountMinor: 1_200_000, // ฿12,000.00
    currency: 'THB',
    date: '2026-01-05',
    country: 'Thailand',
    tripId: 'trip-bangkok',
  },
  {
    id: 'seed-2',
    amountMinor: 850_000, // ฿8,500.00
    currency: 'THB',
    date: '2026-02-10',
    country: 'Thailand',
    tripId: 'trip-bangkok',
  },
];

// ---------------------------------------------------------------------------
// Field sub-components
// ---------------------------------------------------------------------------

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}

/** A labelled form control with an optional screen-reader hint. */
const Field: React.FC<FieldProps> = ({ id, label, hint, children }) => (
  <div className="trip-field">
    <label className="trip-field__label" htmlFor={id}>
      {label}
    </label>
    {children}
    {hint ? (
      <p id={`${id}-hint`} className="trip-field__hint">
        {hint}
      </p>
    ) : null}
  </div>
);

interface TripCardProps {
  report: TripBudgetReport;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}

/** A single trip envelope card with local + home progress. */
const TripCard: React.FC<TripCardProps> = ({ report, onArchive, onUnarchive }) => {
  const status = STATUS_META[report.status];
  const utilisationPercent = Math.min(100, Math.round(report.utilizationBps / 100));
  const remainingLabel = report.remainingLocalMinor < 0 ? 'Over by' : 'Remaining';
  const remainingMinor = Math.abs(report.remainingLocalMinor);

  const localSpent = formatCurrency(report.localSpentMinor, { currency: report.localCurrency });
  const localPlanned = formatCurrency(report.plannedLocalMinor, { currency: report.localCurrency });
  const homeSpent = formatCurrency(report.homeSpentMinor, { currency: report.homeCurrency });
  const homePlanned = formatCurrency(report.plannedHomeMinor, { currency: report.homeCurrency });

  return (
    <article className="trip-card" aria-labelledby={`${report.id}-name`}>
      <header className="trip-card__header">
        <div>
          <h3 className="trip-card__name" id={`${report.id}-name`}>
            {report.name}
          </h3>
          <p className="trip-card__meta">
            <AppIcon name="map-pin" size={16} />
            <span>{report.country || 'Any country'}</span>
            <span aria-hidden="true">·</span>
            <AppIcon name="calendar" size={16} />
            <span>
              {formatIsoDate(report.startDate)} – {formatIsoDate(report.endDate)}
            </span>
          </p>
        </div>
        <span className={`trip-badge trip-badge--${report.status}`}>
          <AppIcon name={status.icon} size={16} />
          <span>{status.label}</span>
        </span>
      </header>

      <div
        className="trip-card__progress"
        role="progressbar"
        aria-valuenow={utilisationPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${report.name} budget used: ${utilisationPercent}%`}
      >
        <div
          className={`trip-card__progress-fill${
            report.overBudget ? ' trip-card__progress-fill--over' : ''
          }`}
          style={{ width: `${utilisationPercent}%` }}
        />
      </div>

      <dl className="trip-card__figures">
        <div className="trip-card__figure">
          <dt>Spent (local)</dt>
          <dd>
            {localSpent} <span className="trip-card__muted">of {localPlanned}</span>
          </dd>
        </div>
        <div className="trip-card__figure">
          <dt>Home roll-up</dt>
          <dd>
            {homeSpent} <span className="trip-card__muted">of {homePlanned}</span>
          </dd>
        </div>
        <div className="trip-card__figure">
          <dt>{remainingLabel}</dt>
          <dd className={report.overBudget ? 'trip-card__over' : undefined}>
            {report.overBudget ? (
              <AppIcon name="alert-triangle" size={16} />
            ) : (
              <AppIcon name="check-circle" size={16} />
            )}{' '}
            {formatCurrency(remainingMinor, { currency: report.localCurrency })}
            {report.overBudget ? ' over budget' : ''}
          </dd>
        </div>
      </dl>

      <footer className="trip-card__footer">
        <span className="trip-card__count">
          {report.transactionCount} {report.transactionCount === 1 ? 'transaction' : 'transactions'}
        </span>
        {report.archived ? (
          <button
            type="button"
            className="trip-button trip-button--ghost"
            onClick={() => onUnarchive(report.id)}
          >
            Reopen {report.name}
          </button>
        ) : (
          <button
            type="button"
            className="trip-button trip-button--ghost"
            onClick={() => onArchive(report.id)}
          >
            Archive {report.name}
          </button>
        )}
      </footer>
    </article>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

let nextLocalId = 1;
function makeId(prefix: string): string {
  nextLocalId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextLocalId}`;
}

export const TripBudgetsPage: React.FC = () => {
  const idPrefix = useId();
  const fid = (suffix: string): string => `${idPrefix}-${suffix}`;
  const today = useMemo(() => todayIso(), []);

  const [trips, setTrips] = useState<TripBudget[]>(() => [...SEED_TRIPS]);
  const [transactions, setTransactions] = useState<TripTransaction[]>(() => [...SEED_TRANSACTIONS]);
  const [filterTripId, setFilterTripId] = useState<string>('all');

  // Create-trip form state.
  const [tripName, setTripName] = useState('');
  const [tripCountry, setTripCountry] = useState('');
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const [tripLocalCurrency, setTripLocalCurrency] = useState('THB');
  const [tripHomeCurrency, setTripHomeCurrency] = useState('USD');
  const [tripPlanned, setTripPlanned] = useState('');
  const [tripRate, setTripRate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Add-spend form state.
  const [spendTripId, setSpendTripId] = useState('');
  const [spendDate, setSpendDate] = useState('');
  const [spendAmount, setSpendAmount] = useState('');
  const [spendCountry, setSpendCountry] = useState('');

  const reports = useMemo(
    () => trips.map((trip) => summarizeTripBudget(trip, transactions, today)),
    [trips, transactions, today],
  );
  const rollup = useMemo(
    () => summarizeTripBudgets(trips, transactions, today),
    [trips, transactions, today],
  );

  const activeReports = reports.filter((report) => !report.archived);
  const archivedReports = reports.filter((report) => report.archived);

  const visibleTransactions = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (filterTripId === 'all') return sorted;
    return sorted.filter((tx) => tx.tripId === filterTripId);
  }, [transactions, filterTripId]);

  const tripById = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips]);

  const handleCreateTrip = (event: React.FormEvent): void => {
    event.preventDefault();
    const planned = parseMajorToMinor(tripPlanned);
    const rate = parseRate(tripRate);

    if (!tripName.trim()) {
      setFormError('Give the trip a name.');
      return;
    }
    if (!tripStart || !tripEnd || tripEnd < tripStart) {
      setFormError('Enter a start date and an end date on or after it.');
      return;
    }
    if (rate <= 0) {
      setFormError('Enter the FX rate (home currency per 1 unit of local currency).');
      return;
    }

    const newTrip: TripBudget = {
      id: makeId('trip'),
      name: tripName.trim(),
      country: tripCountry.trim(),
      startDate: tripStart,
      endDate: tripEnd,
      localCurrency: tripLocalCurrency.trim().toUpperCase() || 'USD',
      homeCurrency: tripHomeCurrency.trim().toUpperCase() || 'USD',
      plannedLocalMinor: planned,
      fxRateHomePerLocal: rate,
      archived: false,
      archivedAt: null,
      archivedSnapshot: null,
    };

    setTrips((current) => [...current, newTrip]);
    setFormError(null);
    setTripName('');
    setTripCountry('');
    setTripStart('');
    setTripEnd('');
    setTripPlanned('');
    setTripRate('');
  };

  const handleAddSpend = (event: React.FormEvent): void => {
    event.preventDefault();
    const tripId = spendTripId || activeReports[0]?.id;
    const trip = tripId ? tripById.get(tripId) : undefined;
    const amount = parseMajorToMinor(spendAmount);
    if (!trip || !spendDate || amount <= 0) {
      return;
    }

    const newTx: TripTransaction = {
      id: makeId('tx'),
      amountMinor: amount,
      currency: trip.localCurrency,
      date: spendDate,
      country: spendCountry.trim() || trip.country,
      tripId: trip.id,
    };
    setTransactions((current) => [...current, newTx]);
    setSpendAmount('');
    setSpendDate('');
    setSpendCountry('');
  };

  const handleArchive = (id: string): void => {
    setTrips((current) =>
      current.map((trip) => (trip.id === id ? archiveTripBudget(trip, transactions, today) : trip)),
    );
  };

  const handleUnarchive = (id: string): void => {
    setTrips((current) =>
      current.map((trip) => (trip.id === id ? unarchiveTripBudget(trip) : trip)),
    );
  };

  const summaryText = useMemo(() => {
    if (rollup.activeTripCount === 0) {
      return 'No active trips yet. Create a trip envelope to start tracking spend abroad.';
    }
    const spent = formatCurrency(rollup.totalSpentHomeMinor, { currency: rollup.homeCurrency });
    const planned = formatCurrency(rollup.totalPlannedHomeMinor, { currency: rollup.homeCurrency });
    const remaining = formatCurrency(Math.abs(rollup.totalRemainingHomeMinor), {
      currency: rollup.homeCurrency,
    });
    const verb = rollup.totalRemainingHomeMinor < 0 ? 'over by' : 'leaving';
    const tripWord = rollup.activeTripCount === 1 ? 'trip' : 'trips';
    return `Across ${rollup.activeTripCount} active ${tripWord}, you have spent ${spent} of ${planned} planned, ${verb} ${remaining} in your home currency.`;
  }, [rollup]);

  return (
    <div className="trip-page">
      <header className="trip-page__header">
        <span className="trip-page__icon" aria-hidden="true">
          <AppIcon name="globe" />
        </span>
        <div>
          <h1 className="trip-page__title">Trip &amp; Country Budgets</h1>
          <p className="trip-page__subtitle">
            Budget a trip in its local currency, track spend inside the trip dates, and roll every
            envelope up into one home-currency view. Archive a trip when it ends. Its history stays
            intact.
          </p>
        </div>
      </header>

      <section
        className="trip-summary"
        aria-label="Home-currency roll-up"
        role="status"
        aria-live="polite"
      >
        <p className="trip-summary__text">{summaryText}</p>
      </section>

      <div className="trip-layout">
        <section className="trip-section" aria-labelledby={fid('trips-heading')}>
          <h2 className="trip-section__heading" id={fid('trips-heading')}>
            Active trips
          </h2>
          {activeReports.length === 0 ? (
            <p className="trip-empty">
              No active trips. Use the form to plan your next destination.
            </p>
          ) : (
            <div className="trip-cards">
              {activeReports.map((report) => (
                <TripCard
                  key={report.id}
                  report={report}
                  onArchive={handleArchive}
                  onUnarchive={handleUnarchive}
                />
              ))}
            </div>
          )}

          {archivedReports.length > 0 ? (
            <>
              <h2 className="trip-section__heading" id={fid('archived-heading')}>
                Archived trips
              </h2>
              <div className="trip-cards">
                {archivedReports.map((report) => (
                  <TripCard
                    key={report.id}
                    report={report}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
                  />
                ))}
              </div>
            </>
          ) : null}
        </section>

        <aside className="trip-side">
          <form
            className="trip-form"
            aria-labelledby={fid('create-heading')}
            onSubmit={handleCreateTrip}
          >
            <h2 className="trip-form__heading" id={fid('create-heading')}>
              Plan a new trip
            </h2>

            <Field id={fid('name')} label="Trip name" hint="e.g. Bangkok Jan–Mar">
              <input
                id={fid('name')}
                className="trip-field__input"
                type="text"
                value={tripName}
                onChange={(event) => setTripName(event.target.value)}
                aria-describedby={`${fid('name')}-hint`}
              />
            </Field>

            <Field
              id={fid('country')}
              label="Country / region"
              hint="Matches spend tagged to this place."
            >
              <input
                id={fid('country')}
                className="trip-field__input"
                type="text"
                value={tripCountry}
                onChange={(event) => setTripCountry(event.target.value)}
                aria-describedby={`${fid('country')}-hint`}
              />
            </Field>

            <div className="trip-form__row">
              <Field id={fid('start')} label="Start date">
                <input
                  id={fid('start')}
                  className="trip-field__input"
                  type="date"
                  value={tripStart}
                  onChange={(event) => setTripStart(event.target.value)}
                />
              </Field>
              <Field id={fid('end')} label="End date">
                <input
                  id={fid('end')}
                  className="trip-field__input"
                  type="date"
                  value={tripEnd}
                  onChange={(event) => setTripEnd(event.target.value)}
                />
              </Field>
            </div>

            <div className="trip-form__row">
              <Field id={fid('local')} label="Local currency" hint="ISO code, e.g. THB.">
                <input
                  id={fid('local')}
                  className="trip-field__input"
                  type="text"
                  maxLength={3}
                  value={tripLocalCurrency}
                  onChange={(event) => setTripLocalCurrency(event.target.value)}
                  aria-describedby={`${fid('local')}-hint`}
                />
              </Field>
              <Field id={fid('home')} label="Home currency" hint="Roll-up currency, e.g. USD.">
                <input
                  id={fid('home')}
                  className="trip-field__input"
                  type="text"
                  maxLength={3}
                  value={tripHomeCurrency}
                  onChange={(event) => setTripHomeCurrency(event.target.value)}
                  aria-describedby={`${fid('home')}-hint`}
                />
              </Field>
            </div>

            <Field
              id={fid('planned')}
              label="Planned amount (local currency)"
              hint="Total you intend to spend on this trip."
            >
              <input
                id={fid('planned')}
                className="trip-field__input"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={tripPlanned}
                onChange={(event) => setTripPlanned(event.target.value)}
                aria-describedby={`${fid('planned')}-hint`}
              />
            </Field>

            <Field
              id={fid('rate')}
              label="FX rate (home per 1 local)"
              hint="Stored rate, for example 0.028 home dollars per local unit. Never fetched live."
            >
              <input
                id={fid('rate')}
                className="trip-field__input"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.0001"
                value={tripRate}
                onChange={(event) => setTripRate(event.target.value)}
                aria-describedby={`${fid('rate')}-hint`}
              />
            </Field>

            {formError ? (
              <p className="trip-form__error" role="alert">
                <AppIcon name="alert-circle" size={16} /> {formError}
              </p>
            ) : null}

            <button type="submit" className="trip-button trip-button--primary">
              Create trip envelope
            </button>
          </form>

          <form
            className="trip-form"
            aria-labelledby={fid('spend-heading')}
            onSubmit={handleAddSpend}
          >
            <h2 className="trip-form__heading" id={fid('spend-heading')}>
              Log local-currency spend
            </h2>

            <Field id={fid('spend-trip')} label="Trip">
              <select
                id={fid('spend-trip')}
                className="trip-field__input"
                value={spendTripId || activeReports[0]?.id || ''}
                onChange={(event) => setSpendTripId(event.target.value)}
              >
                {activeReports.length === 0 ? (
                  <option value="">No active trips</option>
                ) : (
                  activeReports.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.name} ({report.localCurrency})
                    </option>
                  ))
                )}
              </select>
            </Field>

            <Field id={fid('spend-date')} label="Date">
              <input
                id={fid('spend-date')}
                className="trip-field__input"
                type="date"
                value={spendDate}
                onChange={(event) => setSpendDate(event.target.value)}
              />
            </Field>

            <Field
              id={fid('spend-amount')}
              label="Amount (local currency)"
              hint="Recorded in the selected trip's local currency."
            >
              <input
                id={fid('spend-amount')}
                className="trip-field__input"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={spendAmount}
                onChange={(event) => setSpendAmount(event.target.value)}
                aria-describedby={`${fid('spend-amount')}-hint`}
              />
            </Field>

            <Field id={fid('spend-country')} label="Country (optional)">
              <input
                id={fid('spend-country')}
                className="trip-field__input"
                type="text"
                value={spendCountry}
                onChange={(event) => setSpendCountry(event.target.value)}
              />
            </Field>

            <button
              type="submit"
              className="trip-button trip-button--primary"
              disabled={activeReports.length === 0}
            >
              Add spend
            </button>
          </form>
        </aside>
      </div>

      <section className="trip-section" aria-labelledby={fid('ledger-heading')}>
        <div className="trip-ledger__head">
          <h2 className="trip-section__heading" id={fid('ledger-heading')}>
            Spend ledger
          </h2>
          <Field id={fid('filter')} label="Filter by trip">
            <select
              id={fid('filter')}
              className="trip-field__input"
              value={filterTripId}
              onChange={(event) => setFilterTripId(event.target.value)}
            >
              <option value="all">All trips</option>
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {visibleTransactions.length === 0 ? (
          <p className="trip-empty">No spend logged for this view yet.</p>
        ) : (
          <table className="trip-table">
            <caption className="trip-table__caption">
              Spend entries{filterTripId === 'all' ? ' across all trips' : ' for the selected trip'}
              , newest first, shown in each trip&apos;s local currency.
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Trip</th>
                <th scope="col">Country</th>
                <th scope="col" className="trip-table__amount">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((tx) => {
                const trip = tx.tripId ? tripById.get(tx.tripId) : undefined;
                const currency = trip?.localCurrency ?? tx.currency;
                return (
                  <tr key={tx.id}>
                    <td>{formatIsoDate(tx.date)}</td>
                    <td>{trip?.name ?? 'Unassigned'}</td>
                    <td>{tx.country || '—'}</td>
                    <td className="trip-table__amount">
                      {formatCurrency(Math.abs(tx.amountMinor), { currency })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default TripBudgetsPage;
