// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { CurrencyDisplay } from '../common';

export interface IncomeVsExpenseCardProps {
  /** Total income this month, in integer cents (already purpose-filtered). */
  readonly incomeCents: number;
  /** Total spending this month, in integer cents (already purpose-filtered). */
  readonly expenseCents: number;
  /** ISO 4217 currency code for the displayed figures. */
  readonly currency?: string;
}

/** Shape icon for the net result — paired with text, never colour alone. */
const NET_ICON = { surplus: '▲', shortfall: '▼', even: '→' } as const;

/**
 * At-a-glance monthly cash-flow card: money in vs money out and the resulting
 * surplus or shortfall.
 *
 * The net figure is conveyed with a sign, a shape icon, and an explicit
 * "surplus"/"shortfall"/"balanced" word (plus an `sr-only` restatement), so the
 * meaning never depends on colour alone (WCAG 2.2 AA, 1.4.1 Use of Colour).
 */
export const IncomeVsExpenseCard: React.FC<IncomeVsExpenseCardProps> = ({
  incomeCents,
  expenseCents,
  currency = 'USD',
}) => {
  const income = Math.max(0, Math.round(incomeCents));
  const expense = Math.max(0, Math.round(expenseCents));
  const netCents = income - expense;
  const tone = netCents > 0 ? 'surplus' : netCents < 0 ? 'shortfall' : 'even';
  const netWord = tone === 'surplus' ? 'surplus' : tone === 'shortfall' ? 'shortfall' : 'balanced';

  return (
    <article
      className={`card income-expense-card income-expense-card--${tone}`}
      aria-label="Income versus expenses this month"
    >
      <div className="card__header">
        <h3 className="card__title">Income vs Expense</h3>
      </div>
      <dl className="income-expense-card__rows">
        <div className="income-expense-card__row">
          <dt className="income-expense-card__label">Money in</dt>
          <dd className="income-expense-card__amount">
            <CurrencyDisplay amount={income} currency={currency} context="income this month" />
          </dd>
        </div>
        <div className="income-expense-card__row">
          <dt className="income-expense-card__label">Money out</dt>
          <dd className="income-expense-card__amount">
            <CurrencyDisplay amount={expense} currency={currency} context="spent this month" />
          </dd>
        </div>
      </dl>
      <p className="income-expense-card__net" aria-live="polite">
        <span className="income-expense-card__net-icon" aria-hidden="true">
          {NET_ICON[tone]}
        </span>
        <CurrencyDisplay
          amount={netCents}
          currency={currency}
          colorize
          showSign
          context={`net ${netWord} this month`}
        />{' '}
        <span aria-hidden="true">{netWord} this month</span>
        <span className="sr-only">{`${netWord} this month`}</span>
      </p>
    </article>
  );
};

export default IncomeVsExpenseCard;
