// SPDX-License-Identifier: BUSL-1.1

/**
 * InvestmentProjections — compound-growth projection card for the investments
 * page (#2118).
 *
 * Lets an index-fund / FIRE-minded investor connect today's portfolio value and
 * a recurring contribution to a range of future-value scenarios over a multi-year
 * horizon. Pure projection math lives in `lib/investments/projections`; this
 * component only owns the form state and presentation.
 *
 * Accessibility (WCAG 2.2 AA):
 * - Every input has an associated `<label>` and `aria-describedby` help text.
 * - The growth chart (shared `TrendLineChart`) ships a text summary, a keyboard
 *   navigable data table, and is not the sole carrier of meaning.
 * - The scenario summary is a real `<table>` with a caption and scoped headers;
 *   gains are conveyed with text ("Growth"), never colour alone.
 * - A polite live region announces the expected projected value as inputs change.
 *
 * Data scope: projects from LOCAL holdings + user assumptions only. Real-time
 * price / brokerage ingestion is separate, blocked work (see PR notes).
 */

import React, { useId, useMemo, useState } from 'react';
import { TrendLineChart } from '../charts';
import { CurrencyDisplay } from '../common';
import { formatCurrency } from '../../lib/currency';
import {
  buildProjectionChartData,
  deriveProjectionScenarios,
  projectPortfolioGrowth,
} from '../../lib/investments/projections';

export interface InvestmentProjectionsProps {
  /** Current portfolio market value in cents (from the portfolio summary). */
  readonly currentValueCents: number;
  /** Optional amount invested to date in cents (sum of holding cost bases). */
  readonly investedToDateCents?: number;
  /** Currency code for formatting (defaults to USD). */
  readonly currency?: string;
}

/** Default form assumptions for a long-horizon index-fund investor. */
const DEFAULT_MONTHLY_CONTRIBUTION_DOLLARS = '500';
const DEFAULT_YEARS = 20;
const DEFAULT_EXPECTED_RETURN_PERCENT = 7;
const SCENARIO_SPREAD = 0.03;

/** Parse a dollar string into integer cents, guarding against bad input. */
function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

/** Clamp a numeric input to a sensible inclusive range. */
function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const InvestmentProjections: React.FC<InvestmentProjectionsProps> = ({
  currentValueCents,
  investedToDateCents,
  currency = 'USD',
}) => {
  const fieldId = useId();
  const contributionId = `${fieldId}-contribution`;
  const contributionHelpId = `${fieldId}-contribution-help`;
  const yearsId = `${fieldId}-years`;
  const yearsHelpId = `${fieldId}-years-help`;
  const returnId = `${fieldId}-return`;
  const returnHelpId = `${fieldId}-return-help`;
  const disclaimerId = `${fieldId}-disclaimer`;

  const [monthlyContribution, setMonthlyContribution] = useState(
    DEFAULT_MONTHLY_CONTRIBUTION_DOLLARS,
  );
  const [years, setYears] = useState(DEFAULT_YEARS);
  const [expectedReturnPercent, setExpectedReturnPercent] = useState(
    DEFAULT_EXPECTED_RETURN_PERCENT,
  );

  const contributionCents = dollarsToCents(monthlyContribution);

  const result = useMemo(() => {
    const scenarios = deriveProjectionScenarios(expectedReturnPercent / 100, SCENARIO_SPREAD);
    return projectPortfolioGrowth({
      currentValueCents,
      contributionCents,
      contributionFrequency: 'monthly',
      years,
      scenarios,
    });
  }, [currentValueCents, contributionCents, years, expectedReturnPercent]);

  const chart = useMemo(() => buildProjectionChartData(result), [result]);

  const expectedScenario =
    result.scenarios.find((scenario) => scenario.scenario.id === 'expected') ??
    result.scenarios[Math.floor(result.scenarios.length / 2)];

  const liveSummary = expectedScenario
    ? `Expected projection: ${formatCurrency(expectedScenario.finalValueCents, { currency })} after ${result.years} ${result.years === 1 ? 'year' : 'years'}.`
    : '';

  const cardStyle: React.CSSProperties = {
    marginBottom: 'var(--spacing-6)',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 'var(--spacing-2) var(--spacing-3)',
    border: '1px solid var(--semantic-border, #e5e7eb)',
    borderRadius: 'var(--radius-md, 0.375rem)',
    background: 'var(--semantic-background-primary, #fff)',
    color: 'var(--semantic-text-primary, #111)',
    font: 'inherit',
  };

  const helpStyle: React.CSSProperties = {
    display: 'block',
    marginTop: 'var(--spacing-1)',
    fontSize: 'var(--type-scale-caption-font-size)',
    color: 'var(--semantic-text-secondary)',
  };

  const cellStyle: React.CSSProperties = {
    padding: 'var(--spacing-3)',
    borderBottom: '1px solid var(--semantic-border, #e5e7eb)',
    textAlign: 'right',
  };

  const headerCellStyle: React.CSSProperties = {
    padding: 'var(--spacing-3)',
    borderBottom: '2px solid var(--semantic-border, #e5e7eb)',
    textAlign: 'right',
  };

  return (
    <section className="page-section" aria-label="Compound-growth projection">
      <div className="card" style={cardStyle}>
        <h3 style={{ fontWeight: 'var(--font-weight-semibold)', marginTop: 0 }}>
          Growth Projection
        </h3>
        <p id={disclaimerId} style={{ color: 'var(--semantic-text-secondary)', marginTop: 0 }}>
          Estimates how today&rsquo;s holdings plus recurring contributions could compound over
          time. Returns are treated as expected <strong>real</strong> (inflation-adjusted) rates, so
          values are in today&rsquo;s dollars. Projections are illustrative, not a guarantee of
          future performance.
        </p>

        {/* Scenario inputs */}
        <div
          style={{
            display: 'grid',
            gap: 'var(--spacing-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            marginBottom: 'var(--spacing-5)',
          }}
        >
          <div className="form-group">
            <label htmlFor={contributionId} style={{ fontWeight: 'var(--font-weight-medium)' }}>
              Monthly contribution
            </label>
            <input
              id={contributionId}
              type="number"
              inputMode="decimal"
              min={0}
              step={50}
              value={monthlyContribution}
              onChange={(event) => setMonthlyContribution(event.target.value)}
              aria-describedby={contributionHelpId}
              style={inputStyle}
            />
            <span id={contributionHelpId} style={helpStyle}>
              Amount added each month, in dollars.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor={yearsId} style={{ fontWeight: 'var(--font-weight-medium)' }}>
              Years to project
            </label>
            <input
              id={yearsId}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              value={years}
              onChange={(event) => setYears(clampNumber(Number(event.target.value), 1, 100))}
              aria-describedby={yearsHelpId}
              style={inputStyle}
            />
            <span id={yearsHelpId} style={helpStyle}>
              Horizon in years (1&ndash;100).
            </span>
          </div>

          <div className="form-group">
            <label htmlFor={returnId} style={{ fontWeight: 'var(--font-weight-medium)' }}>
              Expected annual return
            </label>
            <input
              id={returnId}
              type="number"
              inputMode="decimal"
              min={-20}
              max={20}
              step={0.5}
              value={expectedReturnPercent}
              onChange={(event) =>
                setExpectedReturnPercent(clampNumber(Number(event.target.value), -20, 20))
              }
              aria-describedby={returnHelpId}
              style={inputStyle}
            />
            <span id={returnHelpId} style={helpStyle}>
              Expected real return, % per year. Conservative and optimistic scenarios are derived at
              &minus;3% and +3%.
            </span>
          </div>
        </div>

        {/* Polite live announcement for assistive tech */}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {liveSummary}
        </p>

        {/* Growth chart with built-in text + data-table alternatives */}
        <TrendLineChart
          data={chart.data as Array<{ label: string; [key: string]: string | number }>}
          series={chart.series.map((s) => ({ dataKey: s.dataKey, name: s.name }))}
          currency={currency}
          title="Projected portfolio value by scenario"
          height={320}
        />

        {/* Scenario summary table */}
        <div style={{ overflowX: 'auto', marginTop: 'var(--spacing-5)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption
              style={{
                textAlign: 'left',
                fontWeight: 'var(--font-weight-semibold)',
                marginBottom: 'var(--spacing-2)',
              }}
            >
              Projected value after {result.years} {result.years === 1 ? 'year' : 'years'}
            </caption>
            <thead>
              <tr>
                <th scope="col" style={{ ...headerCellStyle, textAlign: 'left' }}>
                  Scenario
                </th>
                <th scope="col" style={headerCellStyle}>
                  Annual return
                </th>
                <th scope="col" style={headerCellStyle}>
                  Projected value
                </th>
                <th scope="col" style={headerCellStyle}>
                  Total invested
                </th>
                <th scope="col" style={headerCellStyle}>
                  Growth
                </th>
              </tr>
            </thead>
            <tbody>
              {result.scenarios.map((scenario) => (
                <tr key={scenario.scenario.id}>
                  <th scope="row" style={{ ...cellStyle, textAlign: 'left' }}>
                    {scenario.scenario.label}
                  </th>
                  <td style={cellStyle}>
                    {(scenario.scenario.annualReturnRate * 100).toFixed(1)}%
                  </td>
                  <td style={cellStyle}>
                    <CurrencyDisplay amount={scenario.finalValueCents} currency={currency} />
                  </td>
                  <td style={cellStyle}>
                    <CurrencyDisplay
                      amount={scenario.totalContributionsCents}
                      currency={currency}
                    />
                  </td>
                  <td style={cellStyle}>
                    <CurrencyDisplay amount={scenario.totalGrowthCents} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Contribution tracking */}
        <div
          style={{
            display: 'grid',
            gap: 'var(--spacing-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            marginTop: 'var(--spacing-5)',
          }}
          aria-label="Contribution tracking"
          role="group"
        >
          <div>
            <p className="card__title">Starting value</p>
            <p className="card__value">
              <CurrencyDisplay amount={result.startingValueCents} currency={currency} />
            </p>
          </div>
          {typeof investedToDateCents === 'number' && (
            <div>
              <p className="card__title">Invested to date</p>
              <p className="card__value">
                <CurrencyDisplay amount={investedToDateCents} currency={currency} />
              </p>
            </div>
          )}
          <div>
            <p className="card__title">Recurring contribution</p>
            <p className="card__value">
              <CurrencyDisplay amount={result.contributionCents} currency={currency} />
            </p>
          </div>
          <div>
            <p className="card__title">
              Contributions over {result.years} {result.years === 1 ? 'year' : 'years'}
            </p>
            <p className="card__value">
              <CurrencyDisplay
                amount={expectedScenario?.totalContributionsCents ?? 0}
                currency={currency}
              />
            </p>
          </div>
          <div>
            <p className="card__title">Projected growth (expected)</p>
            <p className="card__value">
              <CurrencyDisplay
                amount={expectedScenario?.totalGrowthCents ?? 0}
                currency={currency}
              />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default InvestmentProjections;
