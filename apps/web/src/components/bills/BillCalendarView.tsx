// SPDX-License-Identifier: BUSL-1.1

/**
 * Bill calendar timeline aligned with the user's pay cycle.
 *
 * Answers "what bills hit before my next payday?" by grouping upcoming bill
 * occurrences into pay periods (payday -> next payday), showing the total due
 * before each payday, and whether the expected income for that period covers
 * the bills due in it.
 *
 * The pure scheduling logic lives in `lib/bills/bill-calendar`; this component
 * only owns presentation, the payday-schedule form, and local persistence.
 *
 * Accessibility (WCAG 2.2 AA):
 *  - Semantic headings and an ordered list of periods.
 *  - All controls have associated labels.
 *  - Coverage status is conveyed by text + icon, never colour alone.
 *  - No motion is introduced, so reduced-motion preferences are respected.
 *
 * References: issue #2196
 */

import React, { useId, useMemo, useState } from 'react';
import { CurrencyDisplay } from '../common';
import { AppIcon } from '../icons';
import {
  buildBillCalendar,
  classifyPeriodRisk,
  DEFAULT_PERIODS_TO_SHOW,
  oneTimeDueCents,
  oneTimeOccurrences,
  PAYDAY_CADENCE_LABELS,
  PERIOD_RISK_LABELS,
  summarizeCalendarRisk,
  type PayPeriod,
  type PaydayCadence,
} from '../../lib/bills/bill-calendar';
import type { Bill } from '../../kmp/bridge';

/** Props for {@link BillCalendarView}. */
export interface BillCalendarViewProps {
  /** Bills to schedule against the pay cycle. */
  bills: Bill[];
}

const SCHEDULE_STORAGE_NAME = 'finance.bills.paydaySchedule.v1';

const CADENCE_OPTIONS: PaydayCadence[] = ['WEEKLY', 'BIWEEKLY', 'SEMI_MONTHLY', 'MONTHLY'];

interface StoredSchedule {
  cadence: PaydayCadence;
  anchorDate: string;
  incomeDollars: string;
}

/** Today as an ISO local date (`YYYY-MM-DD`). */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format an ISO local date as a short, human-readable label. */
function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Convert a dollars string into integer cents. */
function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function loadSchedule(): StoredSchedule {
  const fallback: StoredSchedule = {
    cadence: 'BIWEEKLY',
    anchorDate: todayIso(),
    incomeDollars: '',
  };
  try {
    const raw = window.localStorage.getItem(SCHEDULE_STORAGE_NAME);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredSchedule>;
    return {
      cadence: CADENCE_OPTIONS.includes(parsed.cadence as PaydayCadence)
        ? (parsed.cadence as PaydayCadence)
        : fallback.cadence,
      anchorDate:
        typeof parsed.anchorDate === 'string' && parsed.anchorDate.length > 0
          ? parsed.anchorDate
          : fallback.anchorDate,
      incomeDollars: typeof parsed.incomeDollars === 'string' ? parsed.incomeDollars : '',
    };
  } catch {
    return fallback;
  }
}

function persistSchedule(schedule: StoredSchedule): void {
  try {
    window.localStorage.setItem(SCHEDULE_STORAGE_NAME, JSON.stringify(schedule));
  } catch {
    // Persistence is best-effort; ignore quota/availability errors.
  }
}

const captionStyle: React.CSSProperties = {
  fontSize: 'var(--type-scale-caption-font-size)',
  color: 'var(--semantic-text-secondary)',
};

/** Coverage status pill rendered with text + icon (never colour alone). */
function CoverageStatus({
  period,
  incomeProvided,
}: {
  period: PayPeriod;
  incomeProvided: boolean;
}): React.ReactElement {
  if (!incomeProvided) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--spacing-1)',
          color: 'var(--semantic-text-secondary)',
          fontSize: 'var(--type-scale-caption-font-size)',
        }}
      >
        <AppIcon name="info" /> Add income to check coverage
      </span>
    );
  }

  const covered = period.covered;
  const magnitude = Math.abs(period.coverageCents);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-1)',
        fontWeight: 'var(--font-weight-semibold)',
        color: covered ? 'var(--semantic-positive, #059669)' : 'var(--semantic-negative, #dc2626)',
        fontSize: 'var(--type-scale-caption-font-size)',
      }}
    >
      <AppIcon name={covered ? 'check-circle' : 'alert-triangle'} />
      {covered ? (
        <>
          Covered · <CurrencyDisplay amount={magnitude} context="income left after bills" /> left
        </>
      ) : (
        <>
          Short by <CurrencyDisplay amount={magnitude} context="shortfall before payday" />
        </>
      )}
    </span>
  );
}

/** High-risk-week badge shown with an icon + text (never colour alone). */
function RiskBadge({
  period,
  incomeProvided,
}: {
  period: PayPeriod;
  incomeProvided: boolean;
}): React.ReactElement | null {
  const risk = classifyPeriodRisk(period, incomeProvided);
  if (risk !== 'shortfall' && risk !== 'tight') return null;
  return (
    <span className={`bill-risk-badge bill-risk-badge--${risk}`}>
      <AppIcon name={risk === 'shortfall' ? 'flame' : 'alert-triangle'} />
      {risk === 'shortfall' ? 'High-risk week' : 'Tight week'}
    </span>
  );
}

/** A single pay-period card. */
function PayPeriodCard({
  period,
  incomeProvided,
}: {
  period: PayPeriod;
  incomeProvided: boolean;
}): React.ReactElement {
  const headingId = `pay-period-${period.index}`;
  const risk = classifyPeriodRisk(period, incomeProvided);
  const oneTimeBills = oneTimeOccurrences(period);
  const accessibleStatus =
    risk === 'unknown' ? 'pay period' : `pay period — ${PERIOD_RISK_LABELS[risk]}`;
  return (
    <article
      className="card"
      aria-label={`Payday ${formatDate(period.paydayDate)}, ${accessibleStatus}`}
    >
      <div className="bill-period-card__header">
        <h4 id={headingId} style={{ margin: 0, fontWeight: 'var(--font-weight-semibold)' }}>
          <AppIcon name="wallet" /> Payday {formatDate(period.paydayDate)}
        </h4>
        <RiskBadge period={period} incomeProvided={incomeProvided} />
      </div>
      <p
        style={{ ...captionStyle, marginTop: 'var(--spacing-1)', marginBottom: 'var(--spacing-3)' }}
      >
        Bills due before {formatDate(period.nextPaydayDate)}
      </p>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--spacing-3)',
          flexWrap: 'wrap',
          marginBottom: 'var(--spacing-3)',
        }}
      >
        <span>
          <span style={captionStyle}>Due before payday</span>
          <br />
          <span className="card__value" style={{ margin: 0 }}>
            <CurrencyDisplay amount={period.totalDueCents} context="total bills due this period" />
          </span>
        </span>
        <CoverageStatus period={period} incomeProvided={incomeProvided} />
      </div>

      {oneTimeBills.length > 0 && (
        <p className="bill-period-card__onetime" style={captionStyle}>
          <AppIcon name="gift" /> Includes {oneTimeBills.length} one-time{' '}
          {oneTimeBills.length === 1 ? 'expense' : 'expenses'} ·{' '}
          <CurrencyDisplay
            amount={oneTimeDueCents(period)}
            context="one-time expenses this period"
          />
        </p>
      )}

      {period.bills.length === 0 ? (
        <p style={captionStyle}>No bills due before this payday.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {period.bills.map((bill) => (
            <li
              key={`${bill.billId}-${bill.dueDate}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 'var(--spacing-3)',
                padding: 'var(--spacing-2) 0',
                borderTop: '1px solid var(--semantic-border, #e5e7eb)',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{bill.name}</span>
                {bill.frequency === 'ONE_TIME' && (
                  <>
                    {' '}
                    <span className="bill-onetime-badge">
                      <AppIcon name="gift" /> One-time
                    </span>
                  </>
                )}
                <br />
                <span style={captionStyle}>
                  {bill.payee} · Due {formatDate(bill.dueDate)}
                  {bill.isAutoPay ? ' · Auto-pay' : ''}
                </span>
              </span>
              <CurrencyDisplay
                amount={bill.amountCents}
                currency={bill.currencyCode}
                context={`${bill.name} due ${formatDate(bill.dueDate)}`}
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** Payday-aligned bill calendar/timeline view. */
export const BillCalendarView: React.FC<BillCalendarViewProps> = ({ bills }) => {
  const fieldIdPrefix = useId();
  const [today] = useState(todayIso);
  const [schedule, setSchedule] = useState<StoredSchedule>(loadSchedule);

  const updateSchedule = (patch: Partial<StoredSchedule>): void => {
    setSchedule((prev) => {
      const next = { ...prev, ...patch };
      persistSchedule(next);
      return next;
    });
  };

  const incomeCents = dollarsToCents(schedule.incomeDollars);
  const incomeProvided = incomeCents > 0;

  const calendar = useMemo(
    () =>
      buildBillCalendar({
        bills,
        schedule: {
          cadence: schedule.cadence,
          anchorDate: schedule.anchorDate,
          expectedIncomeCents: incomeCents,
        },
        fromDate: today,
        periodsToShow: DEFAULT_PERIODS_TO_SHOW,
      }),
    [bills, schedule.cadence, schedule.anchorDate, incomeCents, today],
  );

  const cadenceId = `${fieldIdPrefix}-cadence`;
  const anchorId = `${fieldIdPrefix}-anchor`;
  const incomeId = `${fieldIdPrefix}-income`;

  const riskSummary = useMemo(
    () => summarizeCalendarRisk(calendar, incomeProvided),
    [calendar, incomeProvided],
  );

  return (
    <section aria-label="Bills by pay period">
      <form
        className="card"
        aria-label="Payday schedule"
        style={{ marginBottom: 'var(--spacing-4)' }}
        onSubmit={(e) => e.preventDefault()}
      >
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={{ fontWeight: 'var(--font-weight-semibold)', padding: 0 }}>
            Your payday schedule
          </legend>
          <p style={{ ...captionStyle, marginTop: 'var(--spacing-1)' }}>
            Tell us your pay cycle to see which bills fall in each pay period. One-time expenses —
            school fees, birthdays, sports signups — appear here too when you add them as a One-Time
            bill.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-4)',
              flexWrap: 'wrap',
              marginTop: 'var(--spacing-2)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
              <label htmlFor={cadenceId}>Pay cadence</label>
              <select
                id={cadenceId}
                value={schedule.cadence}
                onChange={(e) => updateSchedule({ cadence: e.target.value as PaydayCadence })}
                style={{
                  padding: 'var(--spacing-2) var(--spacing-3)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--semantic-border, #d1d5db)',
                  backgroundColor: 'var(--semantic-background-primary)',
                  color: 'var(--semantic-text-primary)',
                  fontSize: 'var(--type-scale-body-font-size)',
                }}
              >
                {CADENCE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {PAYDAY_CADENCE_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
              <label htmlFor={anchorId}>A recent payday</label>
              <input
                id={anchorId}
                type="date"
                value={schedule.anchorDate}
                onChange={(e) => updateSchedule({ anchorDate: e.target.value })}
                disabled={schedule.cadence === 'SEMI_MONTHLY'}
                aria-describedby={
                  schedule.cadence === 'SEMI_MONTHLY' ? `${anchorId}-hint` : undefined
                }
                style={{
                  padding: 'var(--spacing-2) var(--spacing-3)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--semantic-border, #d1d5db)',
                  backgroundColor: 'var(--semantic-background-primary)',
                  color: 'var(--semantic-text-primary)',
                  fontSize: 'var(--type-scale-body-font-size)',
                }}
              />
              {schedule.cadence === 'SEMI_MONTHLY' && (
                <span id={`${anchorId}-hint`} style={captionStyle}>
                  Paid on the 15th &amp; last day
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
              <label htmlFor={incomeId}>Expected income per paycheck</label>
              <input
                id={incomeId}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={schedule.incomeDollars}
                onChange={(e) => updateSchedule({ incomeDollars: e.target.value })}
                style={{
                  padding: 'var(--spacing-2) var(--spacing-3)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--semantic-border, #d1d5db)',
                  backgroundColor: 'var(--semantic-background-primary)',
                  color: 'var(--semantic-text-primary)',
                  fontSize: 'var(--type-scale-body-font-size)',
                }}
              />
            </div>
          </div>
        </fieldset>
      </form>

      <p aria-live="polite" style={{ ...captionStyle, marginBottom: 'var(--spacing-3)' }}>
        Next {calendar.periods.length} pay periods ·{' '}
        <CurrencyDisplay amount={calendar.totalDueCents} context="total bills due" /> in bills
        {incomeProvided &&
          (riskSummary.highRiskPeriodCount > 0 ? (
            <>
              {' '}
              · <AppIcon name="flame" /> {riskSummary.highRiskPeriodCount} high-risk{' '}
              {riskSummary.highRiskPeriodCount === 1 ? 'week' : 'weeks'} before payday
              {riskSummary.firstShortfallPaydayDate !== null && (
                <>
                  {' '}
                  — first shortfall on the {formatDate(riskSummary.firstShortfallPaydayDate)} payday
                </>
              )}
            </>
          ) : (
            <>
              {' '}
              · <AppIcon name="check-circle" /> on track across every payday
            </>
          ))}
        {riskSummary.oneTimeCount > 0 && (
          <>
            {' '}
            · <AppIcon name="gift" /> {riskSummary.oneTimeCount} one-time{' '}
            {riskSummary.oneTimeCount === 1 ? 'expense' : 'expenses'} (
            <CurrencyDisplay amount={riskSummary.oneTimeDueCents} context="one-time expenses" />)
          </>
        )}
      </p>

      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: 'var(--spacing-4)',
        }}
      >
        {calendar.periods.map((period) => (
          <li key={period.index}>
            <PayPeriodCard period={period} incomeProvided={incomeProvided} />
          </li>
        ))}
      </ol>
    </section>
  );
};

export default BillCalendarView;
