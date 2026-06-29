// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';

import { CurrencyDisplay } from '../common';
import type { Transaction } from '../../kmp/bridge';
import {
  buildSavingsRateCardModel,
  buildSavingsRateDashboardSummary,
  type MonthlyCashFlow,
  type SavingsRateCardModel,
} from '../../lib/dashboard/savings-rate-summary';

export interface SavingsRateCardProps {
  /** Current month key (`YYYY-MM`). */
  readonly currentMonthKey: string;
  /** Previous month key (`YYYY-MM`) used for the period-over-period trend. */
  readonly previousMonthKey: string;
  /** Current-month transactions (already purpose-filtered). */
  readonly currentMonthTransactions: readonly Transaction[];
  /** Previous-month transactions (already purpose-filtered). */
  readonly previousMonthTransactions: readonly Transaction[];
  /** ISO 4217 currency code for the dollars-saved figure. */
  readonly currency?: string;
}

/** Sum income and expense (integer cents) for the savings-rate calculation. */
function toMonthlyCashFlow(month: string, transactions: readonly Transaction[]): MonthlyCashFlow {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const transaction of transactions) {
    if (transaction.type === 'INCOME') {
      incomeCents += Math.max(0, transaction.amount.amount);
    } else if (transaction.type === 'EXPENSE') {
      expenseCents += Math.abs(transaction.amount.amount);
    }
  }

  return { month, incomeCents, expenseCents };
}

/** Format a savings-rate percentage compactly (e.g. `50%`, `37.5%`, `-20%`). */
function formatSavingsRatePercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Plain-language period-over-period trend description (text, not colour alone). */
function describeSavingsRateTrend(
  trend: SavingsRateCardModel['trend'],
  deltaPercentagePoints: number | null,
): string {
  if (deltaPercentagePoints === null) {
    return 'No prior month to compare yet';
  }
  if (trend === 'flat') {
    return 'Flat vs last month';
  }
  const magnitude = Math.round(Math.abs(deltaPercentagePoints) * 10) / 10;
  const points = Number.isInteger(magnitude) ? magnitude.toFixed(0) : magnitude.toFixed(1);
  return `${trend === 'up' ? 'Up' : 'Down'} ${points} pts vs last month`;
}

const SAVINGS_RATE_TREND_ICON: Record<SavingsRateCardModel['trend'], string> = {
  up: '▲',
  down: '▼',
  flat: '→',
};

/**
 * Prominent, accessible Savings Rate summary card for the dashboard.
 *
 * Savings rate = (income − expenses) / income for the current month, compared
 * with the prior calendar month. Reuses the integer-cents savings-rate math in
 * `lib/dashboard/savings-rate-summary` (safe against divide-by-zero). Trend and
 * status are conveyed with text + a shape icon, never colour alone.
 */
export const SavingsRateCard: React.FC<SavingsRateCardProps> = ({
  currentMonthKey,
  previousMonthKey,
  currentMonthTransactions,
  previousMonthTransactions,
  currency = 'USD',
}) => {
  const model = useMemo(() => {
    const cashFlows: MonthlyCashFlow[] = [
      toMonthlyCashFlow(previousMonthKey, previousMonthTransactions),
      toMonthlyCashFlow(currentMonthKey, currentMonthTransactions),
    ];

    return buildSavingsRateCardModel(buildSavingsRateDashboardSummary(cashFlows, currentMonthKey));
  }, [currentMonthKey, previousMonthKey, currentMonthTransactions, previousMonthTransactions]);

  return (
    <article
      className={`card savings-rate-card savings-rate-card--${model.tone}`}
      aria-label="Savings rate this month"
    >
      <div className="card__header">
        <h3 className="card__title">Savings Rate</h3>
      </div>
      <div className="card__value" aria-live="polite">
        {model.hasIncome ? (
          <span
            aria-label={`${formatSavingsRatePercent(model.savingsRatePercent)} savings rate this month`}
          >
            {formatSavingsRatePercent(model.savingsRatePercent)}
          </span>
        ) : (
          <span aria-label="Savings rate not available. No income recorded this month">N/A</span>
        )}
      </div>
      <p className="list-item__secondary">
        {model.hasIncome ? (
          <>
            <CurrencyDisplay
              amount={model.savingsCents}
              currency={currency}
              colorize
              showSign
              context="saved this month"
            />{' '}
            saved this month
          </>
        ) : (
          'Add income this month to calculate your savings rate.'
        )}
      </p>
      {model.hasIncome ? (
        <p className="savings-rate-card__trend">
          <span className="savings-rate-card__trend-icon" aria-hidden="true">
            {SAVINGS_RATE_TREND_ICON[model.trend]}
          </span>
          {describeSavingsRateTrend(model.trend, model.deltaPercentagePoints)}
        </p>
      ) : null}
      <p className="savings-rate-card__status">{model.statusLabel}</p>
    </article>
  );
};

export default SavingsRateCard;
