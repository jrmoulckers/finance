// SPDX-License-Identifier: BUSL-1.1

/**
 * TransactionsSummaryBar — at-a-glance count and net total for the visible
 * ledger. Renders a visible summary and mirrors it in a polite live region so
 * screen-reader users hear the totals update as filters and search change.
 *
 * Net total = income − expenses; transfers are excluded. When the visible set
 * spans multiple currencies each currency's net is listed separately so unlike
 * currencies are never summed into a misleading single figure.
 *
 * References: issue #3772
 * @module components/transactions/TransactionsSummaryBar
 */

import React from 'react';

import type { TransactionSummary } from '../../lib/transactions/summary';
import { CurrencyDisplay } from '../common';

import './transactions-summary-bar.css';

export interface TransactionsSummaryBarProps {
  /** Summary of the currently visible transactions. */
  summary: TransactionSummary;
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'transaction' : 'transactions'}`;
}

function netScreenReaderText(summary: TransactionSummary): string {
  if (summary.totalsByCurrency.length === 0) {
    return '';
  }
  const parts = summary.totalsByCurrency.map((total) => {
    const magnitude = (Math.abs(total.net) / 100).toFixed(2);
    const sign = total.net < 0 ? 'negative ' : '';
    return `${sign}${magnitude} ${total.currency}`;
  });
  return `. Net total ${parts.join(', ')}`;
}

export const TransactionsSummaryBar: React.FC<TransactionsSummaryBarProps> = ({ summary }) => {
  const hasNet = summary.totalsByCurrency.length > 0;

  return (
    <div className="transactions-summary-bar">
      <span className="transactions-summary-bar__count">{countLabel(summary.count)}</span>
      {hasNet && (
        <span className="transactions-summary-bar__net" aria-hidden="true">
          <span className="transactions-summary-bar__net-label">Net</span>
          {summary.totalsByCurrency.map((total) => (
            <CurrencyDisplay
              key={total.currency}
              className="transactions-summary-bar__amount"
              amount={total.net}
              currency={total.currency}
              colorize
              showSign
            />
          ))}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {countLabel(summary.count)}
        {netScreenReaderText(summary)}
      </span>
    </div>
  );
};

export default TransactionsSummaryBar;
