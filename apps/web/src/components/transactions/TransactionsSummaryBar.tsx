// SPDX-License-Identifier: BUSL-1.1

/**
 * TransactionsSummaryBar — at-a-glance count plus income, expense, and net
 * totals for the visible ledger. Renders a visible summary and mirrors it in a
 * polite live region so screen-reader users hear the totals update as filters
 * and search change.
 *
 * Net total = income − expenses; transfers are excluded. When the visible set
 * spans multiple currencies each currency's totals are listed separately so
 * unlike currencies are never summed into a misleading single figure.
 *
 * References: issues #3772, #3605
 * @module components/transactions/TransactionsSummaryBar
 */

import React from 'react';

import type { CurrencyTotal, TransactionSummary } from '../../lib/transactions/summary';
import { CurrencyDisplay } from '../common';

import './transactions-summary-bar.css';

export interface TransactionsSummaryBarProps {
  /** Summary of the currently visible transactions. */
  summary: TransactionSummary;
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'transaction' : 'transactions'}`;
}

function amountWords(cents: number): string {
  const magnitude = (Math.abs(cents) / 100).toFixed(2);
  const sign = cents < 0 ? 'negative ' : '';
  return `${sign}${magnitude}`;
}

function screenReaderText(summary: TransactionSummary): string {
  if (summary.totalsByCurrency.length === 0) {
    return '';
  }
  const parts = summary.totalsByCurrency.map(
    (total) =>
      `Income ${amountWords(total.income)}, expenses ${amountWords(total.expenses)}, ` +
      `net ${amountWords(total.net)} ${total.currency}`,
  );
  return `. ${parts.join('. ')}`;
}

function CurrencyTotals({ total }: { total: CurrencyTotal }): React.ReactElement {
  return (
    <span className="transactions-summary-bar__currency" aria-hidden="true">
      <span className="transactions-summary-bar__metric transactions-summary-bar__metric--income">
        <span className="transactions-summary-bar__metric-label">Income</span>
        <CurrencyDisplay
          className="transactions-summary-bar__amount"
          amount={total.income}
          currency={total.currency}
          colorize
          showSign
        />
      </span>
      <span className="transactions-summary-bar__metric transactions-summary-bar__metric--expense">
        <span className="transactions-summary-bar__metric-label">Expenses</span>
        <CurrencyDisplay
          className="transactions-summary-bar__amount"
          amount={-total.expenses}
          currency={total.currency}
          colorize
          showSign
        />
      </span>
      <span className="transactions-summary-bar__metric transactions-summary-bar__metric--net">
        <span className="transactions-summary-bar__metric-label">Net</span>
        <CurrencyDisplay
          className="transactions-summary-bar__amount"
          amount={total.net}
          currency={total.currency}
          colorize
          showSign
        />
      </span>
    </span>
  );
}

export const TransactionsSummaryBar: React.FC<TransactionsSummaryBarProps> = ({ summary }) => {
  const hasTotals = summary.totalsByCurrency.length > 0;

  return (
    <div className="transactions-summary-bar">
      <span className="transactions-summary-bar__count">{countLabel(summary.count)}</span>
      {hasTotals && (
        <span className="transactions-summary-bar__totals">
          {summary.totalsByCurrency.map((total) => (
            <CurrencyTotals key={total.currency} total={total} />
          ))}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {countLabel(summary.count)}
        {screenReaderText(summary)}
      </span>
    </div>
  );
};

export default TransactionsSummaryBar;
