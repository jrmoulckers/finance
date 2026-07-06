// SPDX-License-Identifier: BUSL-1.1

/**
 * CashRunwayPage — forward-looking cash runway forecast for small businesses.
 *
 * Combines current cash balances, upcoming bills (payroll, taxes, recurring
 * truck / business bills) and expected invoice payments into a day-by-day
 * projection of the running cash balance. Surfaces:
 *   - the runway date (when cash would go negative) and overall status,
 *   - the minimum projected balance and the date it is reached,
 *   - a timeline of projected balances with the events that drive them.
 *
 * Answers: "Can I cover payroll / taxes / bills before revenue lands?"
 *
 * All money is handled in integer cents via the pure engine in
 * `lib/cashflow/cash-runway`. Data is read exclusively through hooks.
 *
 * References: issue #2185
 */

import { useMemo, useState } from 'react';

import { EmptyState, Icon } from '../components/common';
import { IconToken } from '../icons/tokens';
import { useAccounts } from '../hooks/useAccounts';
import { useBills } from '../hooks/useBills';
import { useDisplayCurrencyRollup } from '../hooks/useDisplayCurrencyRollup';
import { useInvoices } from '../hooks/useInvoices';
import { useLocalePreferences } from '../hooks/useLocalePreferences';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { formatCurrency } from '../lib/currency';
import type { DisplayCurrencyAmount } from '../lib/budgeting/display-currency-rollups';
import {
  forecastCashRunway,
  todayIsoDate,
  type RecurrenceFrequency,
  type ScheduledCashEvent,
} from '../lib/cashflow/cash-runway';
import { formatDate } from '../utils/formatDate';
import type { Account, BillFrequency } from '../kmp/bridge';

import './CashRunwayPage.css';

const CASH_ACCOUNT_TYPES: ReadonlySet<Account['type']> = new Set(['CHECKING', 'SAVINGS', 'CASH']);

const HORIZON_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 4, label: '4 weeks' },
  { value: 8, label: '8 weeks' },
  { value: 12, label: '12 weeks' },
  { value: 26, label: '26 weeks' },
];

const BILL_FREQUENCY_TO_RECURRENCE: Record<BillFrequency, RecurrenceFrequency> = {
  ONE_TIME: 'once',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
};

/** Clamp a past date forward to today so overdue items count as imminent. */
function notBefore(isoDate: string, today: string): string {
  return isoDate < today ? today : isoDate;
}

export function CashRunwayPage() {
  const [horizonWeeks, setHorizonWeeks] = useState(12);

  const today = useMemo(() => todayIsoDate(), []);
  const reducedMotion = useReducedMotion();
  const { locale } = useLocalePreferences();

  const { accounts, loading: accountsLoading } = useAccounts();
  const { bills } = useBills();
  const { invoices } = useInvoices();

  const cashAccounts = useMemo(
    () => accounts.filter((account) => !account.isArchived && CASH_ACCOUNT_TYPES.has(account.type)),
    [accounts],
  );

  const upcomingBills = useMemo(
    () => bills.filter((bill) => bill.status === 'UPCOMING' || bill.status === 'OVERDUE'),
    [bills],
  );

  // Convert every currency-bearing forecast input into the user's display
  // currency BEFORE combining them. Cash account balances AND bills each carry
  // their own currency, so summing their raw minor units is meaningless (a
  // ₹40,000 balance is not $40,000) — the root cause of #3240. This reuses the
  // shared exchange-rate rollup and the #3460 minor-unit rescale, exactly as the
  // net-worth aggregation does (#3514). Invoices do not yet carry a currency
  // (#14) and are treated as already being in the display currency, consistent
  // with the rest of the invoice pipeline.
  const conversionInputs = useMemo<DisplayCurrencyAmount[]>(() => {
    const amounts: DisplayCurrencyAmount[] = [];
    for (const account of cashAccounts) {
      amounts.push({
        id: `account:${account.id}`,
        amountCents: account.currentBalance.amount,
        currency: account.currency.code,
      });
    }
    for (const bill of upcomingBills) {
      amounts.push({
        id: `bill:${bill.id}`,
        amountCents: Math.abs(bill.amount.amount),
        currency: bill.currency.code,
      });
    }
    return amounts;
  }, [cashAccounts, upcomingBills]);

  const {
    rollup,
    displayCurrency,
    unconvertedCurrencies,
    loading: ratesLoading,
  } = useDisplayCurrencyRollup(conversionInputs);

  // Map input id -> converted amount (display-currency minor units). Inputs whose
  // currency has no available rate are absent here; they are surfaced via
  // `unconvertedCurrencies` and excluded from the forecast rather than mixed in
  // using their own (incomparable) minor units.
  const convertedById = useMemo(
    () => new Map(rollup.convertedAmounts.map((amount) => [amount.id, amount.displayAmountCents])),
    [rollup],
  );

  const startingCashCents = useMemo(
    () =>
      cashAccounts.reduce(
        (sum, account) => sum + (convertedById.get(`account:${account.id}`) ?? 0),
        0,
      ),
    [cashAccounts, convertedById],
  );

  const events = useMemo<ScheduledCashEvent[]>(() => {
    const billEvents = upcomingBills.flatMap<ScheduledCashEvent>((bill) => {
      const amountCents = convertedById.get(`bill:${bill.id}`);
      // Skip bills whose currency has no rate — disclosed via
      // `unconvertedCurrencies`, never mixed into the forecast in raw units.
      if (amountCents === undefined) return [];
      return [
        {
          id: `bill:${bill.id}`,
          label: bill.name || bill.payee,
          direction: 'outflow',
          amountCents,
          date: notBefore(bill.dueDate, today),
          frequency: BILL_FREQUENCY_TO_RECURRENCE[bill.frequency],
          category: 'Bill',
        },
      ];
    });

    const invoiceEvents = invoices
      .filter((invoice) => invoice.status === 'Sent' || invoice.status === 'Overdue')
      .map<ScheduledCashEvent>((invoice) => ({
        id: `invoice:${invoice.id}`,
        label: invoice.clientName,
        direction: 'inflow',
        amountCents: Math.abs(invoice.amountCents),
        date: notBefore(invoice.expectedPayDate, today),
        frequency: 'once',
        category: 'Expected payment',
      }));

    return [...billEvents, ...invoiceEvents];
  }, [upcomingBills, invoices, today, convertedById]);

  const forecast = useMemo(
    () => forecastCashRunway({ startingCashCents, events, horizonWeeks, today }),
    [events, horizonWeeks, startingCashCents, today],
  );

  // Gate on exchange-rate readiness so the page never flashes an un-converted
  // (wrong) starting-cash figure before the rates resolve.
  const loading = accountsLoading || ratesLoading;

  const conversionDisclosure = useMemo<string | null>(() => {
    const parts: string[] = [];
    if (rollup.convertedCurrencyCodes.length > 0) parts.push(rollup.disclosure);
    if (unconvertedCurrencies.length > 0) {
      parts.push(`Excluded ${unconvertedCurrencies.join(', ')} — no exchange rate available.`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
  }, [rollup, unconvertedCurrencies]);

  /** Format cents in the resolved display currency (all forecast figures are converted into it). */
  const formatDisplay = (cents: number, options: { signDisplay?: 'exceptZero' } = {}): string =>
    formatCurrency(cents, { currency: displayCurrency, ...options });

  const hasInputs = events.length > 0 || startingCashCents !== 0;

  const scaleCents = useMemo(() => {
    const magnitudes = forecast.timeline.map((point) => Math.abs(point.balanceCents));
    return Math.max(Math.abs(forecast.startingCashCents), ...magnitudes, 1);
  }, [forecast]);

  const isShortfall = forecast.status === 'shortfall';
  const statusIcon = isShortfall ? IconToken.WARNING : IconToken.SUCCESS;
  const statusHeadline = isShortfall
    ? `Projected cash shortfall on ${formatDate(forecast.shortfallDate ?? forecast.startDate, { locale })}`
    : `Cash stays positive through ${formatDate(forecast.endDate, { locale })}`;
  const statusDetail = isShortfall
    ? forecast.runwayDays === 0
      ? 'Your cash is already below zero. Bring in revenue or defer outflows now.'
      : `You have about ${forecast.runwayDays} day${
          forecast.runwayDays === 1 ? '' : 's'
        } of runway before scheduled outflows exceed available cash.`
    : 'Scheduled outflows stay covered by your starting cash and expected inflows over the selected horizon.';

  return (
    <main className="cash-runway" aria-labelledby="cash-runway-title">
      <header className="cash-runway__header">
        <p className="cash-runway__eyebrow">Small business cash flow</p>
        <h1 id="cash-runway-title" className="cash-runway__title">
          Cash Runway
        </h1>
        <p className="cash-runway__description">
          Project your running cash balance forward to see whether you can cover payroll, taxes and
          recurring bills before revenue lands. Figures are planning estimates, converted into your
          display currency.
        </p>
      </header>

      <section className="cash-runway__card" aria-labelledby="cash-runway-controls-title">
        <h2 id="cash-runway-controls-title" className="cash-runway__card-title">
          Forecast horizon
        </h2>
        <div className="cash-runway__field">
          <label className="cash-runway__label" htmlFor="cash-runway-horizon">
            Project ahead
          </label>
          <select
            id="cash-runway-horizon"
            className="cash-runway__input"
            value={horizonWeeks}
            onChange={(changeEvent) => setHorizonWeeks(Number(changeEvent.target.value))}
          >
            {HORIZON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {!loading && hasInputs ? (
        <>
          <section
            className={`cash-runway__status cash-runway__status--${forecast.status}`}
            aria-labelledby="cash-runway-status-title"
          >
            <div className="cash-runway__status-heading">
              <Icon name={statusIcon} className="cash-runway__status-icon" />
              <h2 id="cash-runway-status-title" className="cash-runway__status-title">
                {statusHeadline}
              </h2>
            </div>
            <p className="cash-runway__status-detail">{statusDetail}</p>
          </section>

          <section className="cash-runway__card" aria-labelledby="cash-runway-summary-title">
            <h2 id="cash-runway-summary-title" className="cash-runway__card-title">
              Summary
            </h2>
            <dl className="cash-runway__summary-grid">
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Starting cash</dt>
                <dd className="cash-runway__metric-value">
                  {formatDisplay(forecast.startingCashCents)}
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Runway</dt>
                <dd className="cash-runway__metric-value">
                  {isShortfall
                    ? formatDate(forecast.shortfallDate ?? forecast.startDate, { locale })
                    : 'No shortfall'}
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Minimum balance</dt>
                <dd
                  className={`cash-runway__metric-value${
                    forecast.minBalanceCents < 0 ? ' cash-runway__metric-value--negative' : ''
                  }`}
                >
                  {formatDisplay(forecast.minBalanceCents)}
                  <span className="cash-runway__metric-sub">
                    on {formatDate(forecast.minBalanceDate, { locale })}
                  </span>
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Expected inflows</dt>
                <dd className="cash-runway__metric-value cash-runway__metric-value--positive">
                  {formatDisplay(forecast.totalInflowCents)}
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Scheduled outflows</dt>
                <dd className="cash-runway__metric-value cash-runway__metric-value--negative">
                  {formatDisplay(forecast.totalOutflowCents)}
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Projected ending cash</dt>
                <dd
                  className={`cash-runway__metric-value${
                    forecast.endingBalanceCents < 0 ? ' cash-runway__metric-value--negative' : ''
                  }`}
                >
                  {formatDisplay(forecast.endingBalanceCents)}
                </dd>
              </div>
            </dl>
            {conversionDisclosure && (
              <p
                role="note"
                style={{
                  marginTop: 'var(--spacing-3)',
                  marginBottom: 0,
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--semantic-text-secondary)',
                }}
              >
                {conversionDisclosure}
              </p>
            )}
          </section>

          <section className="cash-runway__card" aria-labelledby="cash-runway-timeline-title">
            <h2 id="cash-runway-timeline-title" className="cash-runway__card-title">
              Projected balance timeline
            </h2>
            <p className="cash-runway__timeline-intro">
              Starting cash of {formatDisplay(forecast.startingCashCents)} on{' '}
              {formatDate(forecast.startDate, { locale })}
              {forecast.timeline.length === 0
                ? ' with no scheduled events in this horizon.'
                : ', then each day with a scheduled inflow or outflow:'}
            </p>

            {forecast.timeline.length > 0 ? (
              <ol className="cash-runway__timeline">
                {forecast.timeline.map((point) => {
                  const widthPercent = Math.max(
                    2,
                    Math.round((Math.abs(point.balanceCents) / scaleCents) * 100),
                  );
                  const negative = point.balanceCents < 0;
                  return (
                    <li key={point.date} className="cash-runway__day">
                      <div className="cash-runway__day-head">
                        <span className="cash-runway__day-date">
                          {formatDate(point.date, { locale })}
                        </span>
                        <span
                          className={`cash-runway__day-balance${
                            negative ? ' cash-runway__day-balance--negative' : ''
                          }`}
                        >
                          {negative ? (
                            <Icon
                              name={IconToken.WARNING}
                              size={16}
                              className="cash-runway__day-balance-icon"
                            />
                          ) : null}
                          {formatDisplay(point.balanceCents)}
                          {negative ? (
                            <span className="cash-runway__sr-only"> (shortfall)</span>
                          ) : null}
                        </span>
                      </div>
                      <div
                        className={`cash-runway__bar-track${
                          reducedMotion ? ' cash-runway__bar-track--static' : ''
                        }`}
                        aria-hidden="true"
                      >
                        <div
                          className={`cash-runway__bar${
                            negative ? ' cash-runway__bar--negative' : ''
                          }`}
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                      <ul className="cash-runway__events">
                        {point.events.map((occurrence) => (
                          <li key={occurrence.id} className="cash-runway__event">
                            <span className="cash-runway__event-label">
                              {occurrence.label}
                              {occurrence.category ? (
                                <span className="cash-runway__event-category">
                                  {occurrence.category}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={`cash-runway__event-amount cash-runway__event-amount--${occurrence.direction}`}
                            >
                              {formatDisplay(occurrence.amountCents, {
                                signDisplay: 'exceptZero',
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="cash-runway__empty">
                No scheduled bills or expected payments fall within the next {horizonWeeks} weeks.
              </p>
            )}
          </section>
        </>
      ) : (
        <EmptyState
          title={loading ? 'Loading your cash position…' : 'No cash data yet'}
          description="Add a checking, savings or cash account and schedule bills or expected invoice payments to project your cash runway."
        />
      )}
    </main>
  );
}

export default CashRunwayPage;
