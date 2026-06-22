// SPDX-License-Identifier: BUSL-1.1

/**
 * FirePlannerPage — FIRE (Financial Independence / Retire Early) calculator.
 *
 * A fully client-side, edge-computed planner for the saver who cares about the
 * *date* they can stop working. Inputs: current invested assets, annual
 * spending, annual contributions, expected real return, and the safe withdrawal
 * rate (SWR). Outputs: the FI number, years/months-to-FI (and projected FI
 * date), the Coast-FI number (and whether already Coast-FI), and a year-by-year
 * projection chart.
 *
 * All maths lives in the pure engine (`../lib/fire`); this page is presentation
 * only. Money is handled in integer cents end-to-end and converted to major
 * units (dollars) solely at the chart boundary, which expects display values.
 *
 * Accessibility (WCAG 2.2 AA):
 * - Every control has an associated <label htmlFor> and an aria-describedby hint.
 * - Results are announced via an aria-live status region.
 * - The projection chart ships a text alternative + data table (TrendLineChart).
 * - Status (Coast-FI / reachability) is conveyed with icon **and** text — never
 *   colour alone.
 *
 * References: issue #2114
 */

import React, { useId, useMemo, useState } from 'react';

import { AppIcon } from '../components/icons';
import { TrendLineChart } from '../components/charts';
import type { TrendDataPoint, TrendSeries } from '../components/charts/TrendLineChart';
import { formatCurrency } from '../lib/currency';
import {
  calculateFIREPlan,
  DEFAULT_RETIREMENT_AGE,
  MAX_FI_SEARCH_YEARS,
  type FIREPlanResult,
} from '../lib/fire';

import './FirePlannerPage.css';

// ---------------------------------------------------------------------------
// Parsing helpers (string inputs → cents / rates), defensive against junk input
// ---------------------------------------------------------------------------

/** Parse a dollar string into non-negative integer cents. */
function parseDollarsToCents(value: string): number {
  const dollars = Number.parseFloat(value);
  if (!Number.isFinite(dollars)) return 0;
  return Math.max(0, Math.round(dollars * 100));
}

/** Parse a percent string (e.g. "5") into a decimal rate (0.05). Allows negatives. */
function parsePercentToRate(value: string): number {
  const percent = Number.parseFloat(value);
  if (!Number.isFinite(percent)) return 0;
  return percent / 100;
}

/** Parse an age string into a whole number, or null when blank/invalid. */
function parseAge(value: string): number | null {
  const age = Number.parseInt(value, 10);
  if (!Number.isFinite(age) || age < 0) return null;
  return age;
}

/** Human-friendly "X years, Y months" (omitting zero parts). */
function formatDuration(years: number, months: number): string {
  const yearLabel = years === 1 ? '1 year' : `${years} years`;
  const monthLabel = months === 1 ? '1 month' : `${months} months`;
  if (years === 0) return monthLabel;
  if (months === 0) return yearLabel;
  return `${yearLabel}, ${monthLabel}`;
}

/** Format an ISO calendar date (YYYY-MM-DD) as e.g. "March 2041". */
function formatFiDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
}

/** A labelled numeric input with a unit affix and a screen-reader hint. */
const NumberField: React.FC<NumberFieldProps> = ({
  id,
  label,
  value,
  onChange,
  hint,
  prefix,
  suffix,
  min,
  step,
}) => (
  <div className="fire-field">
    <label className="fire-field__label" htmlFor={id}>
      {label}
    </label>
    <div className="fire-field__control">
      {prefix ? (
        <span className="fire-field__affix" aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      <input
        id={id}
        className="fire-field__input"
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-hint`}
      />
      {suffix ? (
        <span className="fire-field__affix fire-field__affix--suffix" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </div>
    <p id={`${id}-hint`} className="fire-field__hint">
      {hint}
    </p>
  </div>
);

interface ResultCardProps {
  label: string;
  value: string;
  children?: React.ReactNode;
  ariaLabel?: string;
}

/** A single headline result tile. */
const ResultCard: React.FC<ResultCardProps> = ({ label, value, children, ariaLabel }) => (
  <article className="fire-result-card" aria-label={ariaLabel ?? label}>
    <p className="fire-result-card__label">{label}</p>
    <p className="fire-result-card__value">{value}</p>
    {children ? <div className="fire-result-card__detail">{children}</div> : null}
  </article>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const FirePlannerPage: React.FC = () => {
  const fieldIdPrefix = useId();
  const fid = (suffix: string): string => `${fieldIdPrefix}-${suffix}`;

  const [currentInvested, setCurrentInvested] = useState('100000');
  const [annualSpending, setAnnualSpending] = useState('40000');
  const [annualContribution, setAnnualContribution] = useState('24000');
  const [realReturnPercent, setRealReturnPercent] = useState('5');
  const [swrPercent, setSwrPercent] = useState('4');
  const [currentAge, setCurrentAge] = useState('35');
  const [retirementAge, setRetirementAge] = useState('65');

  const plan: FIREPlanResult = useMemo(
    () =>
      calculateFIREPlan({
        currentInvestedCents: parseDollarsToCents(currentInvested),
        annualSpendingCents: parseDollarsToCents(annualSpending),
        annualContributionCents: parseDollarsToCents(annualContribution),
        realReturnRate: parsePercentToRate(realReturnPercent),
        swrRate: parsePercentToRate(swrPercent),
        currentAge: parseAge(currentAge),
        traditionalRetirementAge: parseAge(retirementAge) ?? DEFAULT_RETIREMENT_AGE,
      }),
    [
      currentInvested,
      annualSpending,
      annualContribution,
      realReturnPercent,
      swrPercent,
      currentAge,
      retirementAge,
    ],
  );

  const fiReachable = Number.isFinite(plan.fiNumberCents);
  const ageNumber = parseAge(currentAge);
  const retirementAgeNumber = parseAge(retirementAge) ?? DEFAULT_RETIREMENT_AGE;
  const calendarYearNow = new Date().getFullYear();

  // Chart series (dollars — TrendLineChart formats values as major units).
  const chartSeries: TrendSeries[] = useMemo(
    () => [
      { dataKey: 'portfolio', name: 'Projected portfolio' },
      { dataKey: 'fiTarget', name: 'FI number' },
    ],
    [],
  );

  const chartData: TrendDataPoint[] = useMemo(
    () =>
      plan.projection.map((point) => ({
        label:
          ageNumber != null
            ? `Age ${ageNumber + point.year}`
            : String(calendarYearNow + point.year),
        portfolio: point.balanceCents / 100,
        fiTarget: point.fiNumberCents / 100,
      })),
    [plan.projection, ageNumber, calendarYearNow],
  );

  // Concise live summary for assistive tech.
  const summary = useMemo(() => {
    if (!fiReachable) {
      return 'Enter a safe withdrawal rate above 0% to calculate your FI number.';
    }
    const fiText = formatCurrency(plan.fiNumberCents);
    if (plan.yearsToFI.alreadyFI) {
      return `Your FI number is ${fiText}. Your current investments already meet it — you are financially independent.`;
    }
    if (!plan.yearsToFI.reachedFI) {
      return `Your FI number is ${fiText}. At these inputs your portfolio does not reach it within ${MAX_FI_SEARCH_YEARS} years.`;
    }
    const duration = formatDuration(plan.yearsToFI.years, plan.yearsToFI.months);
    const dateText = plan.fiDateIso ? ` (around ${formatFiDate(plan.fiDateIso)})` : '';
    return `Your FI number is ${fiText}. At your current savings you reach financial independence in ${duration}${dateText}.`;
  }, [fiReachable, plan]);

  // Precomputed display strings (kept out of JSX to avoid nested ternaries).
  const fiNumberDisplay = fiReachable ? formatCurrency(plan.fiNumberCents) : '—';
  const coastNumberDisplay = Number.isFinite(plan.coastFINumberCents)
    ? formatCurrency(plan.coastFINumberCents)
    : '—';

  let timeToFiValue = '—';
  if (fiReachable) {
    if (plan.yearsToFI.alreadyFI) {
      timeToFiValue = 'Reached';
    } else if (plan.yearsToFI.reachedFI) {
      timeToFiValue = formatDuration(plan.yearsToFI.years, plan.yearsToFI.months);
    } else {
      timeToFiValue = 'Not reachable';
    }
  }

  return (
    <div className="fire-page">
      <header className="fire-page__header">
        <span className="fire-page__icon" aria-hidden="true">
          <AppIcon name="flame" />
        </span>
        <div>
          <h2 className="fire-page__title">FIRE Planner</h2>
          <p className="fire-page__subtitle">
            Model your path to financial independence — your FI number, when you can stop working,
            and whether you have already hit Coast FI.
          </p>
        </div>
      </header>

      <div className="fire-layout">
        {/* ---- Inputs ---- */}
        <form
          className="fire-form"
          aria-label="Financial independence inputs"
          onSubmit={(event) => event.preventDefault()}
        >
          <h3 className="fire-form__legend">Your numbers</h3>
          <div className="fire-form__grid">
            <NumberField
              id={fid('current')}
              label="Current invested assets"
              value={currentInvested}
              onChange={setCurrentInvested}
              hint="Total of investment and retirement accounts, in US dollars."
              prefix="$"
              min={0}
              step={1000}
            />
            <NumberField
              id={fid('spending')}
              label="Annual spending in retirement"
              value={annualSpending}
              onChange={setAnnualSpending}
              hint="What you expect to spend each year, in today's dollars."
              prefix="$"
              min={0}
              step={1000}
            />
            <NumberField
              id={fid('contribution')}
              label="Annual contributions"
              value={annualContribution}
              onChange={setAnnualContribution}
              hint="How much you invest each year, spread evenly across the year."
              prefix="$"
              min={0}
              step={1000}
            />
            <NumberField
              id={fid('return')}
              label="Expected real return"
              value={realReturnPercent}
              onChange={setRealReturnPercent}
              hint="Annual return after inflation. A diversified portfolio is often modelled at 4–7%."
              suffix="%"
              step={0.1}
            />
            <NumberField
              id={fid('swr')}
              label="Safe withdrawal rate (SWR)"
              value={swrPercent}
              onChange={setSwrPercent}
              hint="Share of the portfolio withdrawn each year. The Trinity Study popularised 4%."
              suffix="%"
              min={0.1}
              step={0.1}
            />
            <NumberField
              id={fid('age')}
              label="Current age"
              value={currentAge}
              onChange={setCurrentAge}
              hint="Used to label the timeline and the Coast-FI horizon. Optional."
              min={0}
              step={1}
            />
            <NumberField
              id={fid('retirement-age')}
              label="Traditional retirement age"
              value={retirementAge}
              onChange={setRetirementAge}
              hint="When the Coast-FI calculation assumes you will tap your portfolio."
              min={0}
              step={1}
            />
          </div>
        </form>

        {/* ---- Results ---- */}
        <section className="fire-results" aria-label="Results">
          <p className="fire-results__summary" role="status" aria-live="polite">
            {summary}
          </p>

          <div className="fire-results__grid">
            <ResultCard
              label="FI number"
              value={fiNumberDisplay}
              ariaLabel="Financial independence number"
            >
              <span className="fire-result-card__formula">annual spending ÷ SWR</span>
            </ResultCard>

            <ResultCard
              label="Time to financial independence"
              value={timeToFiValue}
              ariaLabel="Time to financial independence"
            >
              {fiReachable && plan.yearsToFI.alreadyFI ? (
                <span className="fire-status fire-status--positive">
                  <span className="fire-status__icon" aria-hidden="true">
                    <AppIcon name="check-circle" />
                  </span>
                  You have already reached your FI number.
                </span>
              ) : null}
              {fiReachable && !plan.yearsToFI.alreadyFI && plan.yearsToFI.reachedFI ? (
                <span className="fire-result-card__formula">
                  {plan.fiDateIso ? `around ${formatFiDate(plan.fiDateIso)}` : null}
                </span>
              ) : null}
              {fiReachable && !plan.yearsToFI.reachedFI ? (
                <span className="fire-status fire-status--warning">
                  <span className="fire-status__icon" aria-hidden="true">
                    <AppIcon name="alert-triangle" />
                  </span>
                  Not reached within {MAX_FI_SEARCH_YEARS} years — try higher contributions or
                  returns, or lower spending.
                </span>
              ) : null}
            </ResultCard>

            <ResultCard
              label="Coast-FI number"
              value={coastNumberDisplay}
              ariaLabel="Coast financial independence number"
            >
              {plan.isCoastFI ? (
                <span className="fire-status fire-status--positive">
                  <span className="fire-status__icon" aria-hidden="true">
                    <AppIcon name="check-circle" />
                  </span>
                  Coast FI reached — your investments can grow to your FI number by age{' '}
                  {retirementAgeNumber} with no further contributions.
                </span>
              ) : (
                <span className="fire-status fire-status--neutral">
                  <span className="fire-status__icon" aria-hidden="true">
                    <AppIcon name="circle" />
                  </span>
                  Not yet Coast FI — the amount you would need invested today to coast to FI by age{' '}
                  {retirementAgeNumber}.
                </span>
              )}
            </ResultCard>

            {fiReachable && plan.yearsToFI.reachedFI && !plan.yearsToFI.alreadyFI ? (
              <ResultCard
                label="Contributions vs growth at FI"
                value={formatCurrency(plan.yearsToFI.projectedCents)}
                ariaLabel="Contributions versus growth at financial independence"
              >
                <span className="fire-result-card__split">
                  <span>You invest {formatCurrency(plan.totalContributionsToFICents)}</span>
                  <span>Growth adds {formatCurrency(plan.totalGrowthToFICents)}</span>
                </span>
              </ResultCard>
            ) : null}
          </div>

          {fiReachable && chartData.length > 1 ? (
            <div className="fire-results__chart">
              <TrendLineChart
                data={chartData}
                series={chartSeries}
                title="Projected portfolio vs FI number"
                height={320}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default FirePlannerPage;
