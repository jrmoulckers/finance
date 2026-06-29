// SPDX-License-Identifier: BUSL-1.1

import { formatCurrency } from '../../lib/currency';
import type { GigTakeHomeResult, ProfitabilityPeriod } from '../../lib/gig-take-home';
import './mileage.css';

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatPerUnit(cents: number | null): string {
  return cents === null ? '—' : formatCurrency(cents);
}

const DEDUCTION_METHOD_LABELS: Record<GigTakeHomeResult['deductionMethod'], string> = {
  'standard-mileage': 'Standard mileage',
  'actual-expenses': 'Actual expenses',
};

const GRANULARITY_HEADERS: Record<ProfitabilityPeriod['granularity'], string> = {
  shift: 'Shift',
  day: 'Day',
  week: 'Week',
};

export interface TakeHomeSummaryProps {
  result: GigTakeHomeResult;
  periods?: ProfitabilityPeriod[];
}

/**
 * Presentational card showing estimated gig-driver take-home pay after expenses
 * and estimated taxes, plus optional day/week/shift profitability.
 *
 * All monetary values arrive as integer cents; this component only formats.
 */
export function TakeHomeSummary({ result, periods }: TakeHomeSummaryProps) {
  const granularity = periods?.[0]?.granularity;

  return (
    <section className="mileage-card" aria-labelledby="take-home-summary-title">
      <div className="mileage-card__header">
        <div>
          <h3 id="take-home-summary-title" className="mileage-card__title">
            Take-home pay estimate
          </h3>
          <p className="mileage-card__description">
            Gross payouts minus operating costs and estimated self-employment plus income taxes.
            Estimate only. Not tax advice.
          </p>
        </div>
      </div>

      <div className="mileage-stats">
        <article className="mileage-stat">
          <span className="mileage-stat__label">Gross payouts</span>
          <p className="mileage-stat__value">{formatCurrency(result.grossPayoutsCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Net cash profit</span>
          <p className="mileage-stat__value">{formatCurrency(result.netCashProfitCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Estimated tax set-aside</span>
          <p className="mileage-stat__value">{formatCurrency(result.totalTaxSetAsideCents)}</p>
        </article>
        <article className="mileage-stat">
          <span className="mileage-stat__label">Estimated take-home</span>
          <p className="mileage-stat__value">{formatCurrency(result.estimatedTakeHomeCents)}</p>
        </article>
      </div>

      <div className="deduction-summary__list" role="list" aria-label="Take-home breakdown">
        <div className="deduction-summary__item" role="listitem">
          <div className="deduction-summary__meta">
            <span className="deduction-summary__label">Self-employment tax</span>
            <span className="deduction-summary__caption">
              15.3% on 92.35% of net SE earnings (SS capped at the wage base)
            </span>
          </div>
          <strong>{formatCurrency(result.selfEmploymentTaxCents)}</strong>
        </div>
        <div className="deduction-summary__item" role="listitem">
          <div className="deduction-summary__meta">
            <span className="deduction-summary__label">Income-tax reserve</span>
            <span className="deduction-summary__caption">
              {formatPercent(result.incomeTaxReserveRate)} of taxable profit
            </span>
          </div>
          <strong>{formatCurrency(result.incomeTaxReserveCents)}</strong>
        </div>
        <div className="deduction-summary__item" role="listitem">
          <div className="deduction-summary__meta">
            <span className="deduction-summary__label">Tax-deduction basis</span>
            <span className="deduction-summary__caption">
              {DEDUCTION_METHOD_LABELS[result.deductionMethod]} ·{' '}
              {formatCurrency(result.taxDeductibleExpensesCents)} deducted
            </span>
          </div>
          <strong>{formatPercent(result.effectiveTaxRate)}</strong>
        </div>
      </div>

      {periods && periods.length > 0 && granularity ? (
        <div className="mileage-report__table-wrapper">
          <table className="mileage-report__table">
            <caption className="mileage-card__description">
              Profitability by {GRANULARITY_HEADERS[granularity].toLowerCase()}
            </caption>
            <thead>
              <tr>
                <th scope="col">{GRANULARITY_HEADERS[granularity]}</th>
                <th scope="col">Take-home</th>
                <th scope="col">Per mile</th>
                <th scope="col">Per hour</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.key}>
                  <td>{period.label}</td>
                  <td>{formatCurrency(period.estimatedTakeHomeCents)}</td>
                  <td>{formatPerUnit(period.takeHomePerMileCents)}</td>
                  <td>{formatPerUnit(period.takeHomePerHourCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
