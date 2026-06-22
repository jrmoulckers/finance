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
import { useInvoices } from '../hooks/useInvoices';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { formatCurrency } from '../lib/currency';
import {
  forecastCashRunway,
  todayIsoDate,
  type RecurrenceFrequency,
  type ScheduledCashEvent,
} from '../lib/cashflow/cash-runway';
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

/** Format a `YYYY-MM-DD` date for display, e.g. "Jan 15, 2025". */
function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Clamp a past date forward to today so overdue items count as imminent. */
function notBefore(isoDate: string, today: string): string {
  return isoDate < today ? today : isoDate;
}

export function CashRunwayPage() {
  const [horizonWeeks, setHorizonWeeks] = useState(12);

  const today = useMemo(() => todayIsoDate(), []);
  const reducedMotion = useReducedMotion();

  const { accounts, loading: accountsLoading } = useAccounts();
  const { bills } = useBills();
  const { invoices } = useInvoices();

  const startingCashCents = useMemo(
    () =>
      accounts
        .filter((account) => !account.isArchived && CASH_ACCOUNT_TYPES.has(account.type))
        .reduce((sum, account) => sum + account.currentBalance.amount, 0),
    [accounts],
  );

  const events = useMemo<ScheduledCashEvent[]>(() => {
    const billEvents = bills
      .filter((bill) => bill.status === 'UPCOMING' || bill.status === 'OVERDUE')
      .map<ScheduledCashEvent>((bill) => ({
        id: `bill:${bill.id}`,
        label: bill.name || bill.payee,
        direction: 'outflow',
        amountCents: Math.abs(bill.amount.amount),
        date: notBefore(bill.dueDate, today),
        frequency: BILL_FREQUENCY_TO_RECURRENCE[bill.frequency],
        category: 'Bill',
      }));

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
  }, [bills, invoices, today]);

  const forecast = useMemo(
    () => forecastCashRunway({ startingCashCents, events, horizonWeeks, today }),
    [events, horizonWeeks, startingCashCents, today],
  );

  const hasInputs = events.length > 0 || startingCashCents !== 0;

  const scaleCents = useMemo(() => {
    const magnitudes = forecast.timeline.map((point) => Math.abs(point.balanceCents));
    return Math.max(Math.abs(forecast.startingCashCents), ...magnitudes, 1);
  }, [forecast]);

  const isShortfall = forecast.status === 'shortfall';
  const statusIcon = isShortfall ? IconToken.WARNING : IconToken.SUCCESS;
  const statusHeadline = isShortfall
    ? `Projected cash shortfall on ${formatDate(forecast.shortfallDate ?? forecast.startDate)}`
    : `Cash stays positive through ${formatDate(forecast.endDate)}`;
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
          recurring bills before revenue lands. Figures are planning estimates in your account
          currency.
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

      {hasInputs ? (
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
                  {formatCurrency(forecast.startingCashCents)}
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Runway</dt>
                <dd className="cash-runway__metric-value">
                  {isShortfall
                    ? formatDate(forecast.shortfallDate ?? forecast.startDate)
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
                  {formatCurrency(forecast.minBalanceCents)}
                  <span className="cash-runway__metric-sub">
                    on {formatDate(forecast.minBalanceDate)}
                  </span>
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Expected inflows</dt>
                <dd className="cash-runway__metric-value cash-runway__metric-value--positive">
                  {formatCurrency(forecast.totalInflowCents)}
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Scheduled outflows</dt>
                <dd className="cash-runway__metric-value cash-runway__metric-value--negative">
                  {formatCurrency(forecast.totalOutflowCents)}
                </dd>
              </div>
              <div className="cash-runway__metric">
                <dt className="cash-runway__metric-label">Projected ending cash</dt>
                <dd
                  className={`cash-runway__metric-value${
                    forecast.endingBalanceCents < 0 ? ' cash-runway__metric-value--negative' : ''
                  }`}
                >
                  {formatCurrency(forecast.endingBalanceCents)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="cash-runway__card" aria-labelledby="cash-runway-timeline-title">
            <h2 id="cash-runway-timeline-title" className="cash-runway__card-title">
              Projected balance timeline
            </h2>
            <p className="cash-runway__timeline-intro">
              Starting cash of {formatCurrency(forecast.startingCashCents)} on{' '}
              {formatDate(forecast.startDate)}
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
                        <span className="cash-runway__day-date">{formatDate(point.date)}</span>
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
                          {formatCurrency(point.balanceCents)}
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
                              {formatCurrency(occurrence.amountCents, {
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
          title={accountsLoading ? 'Loading your cash position…' : 'No cash data yet'}
          description="Add a checking, savings or cash account and schedule bills or expected invoice payments to project your cash runway."
        />
      )}
    </main>
  );
}

export default CashRunwayPage;
