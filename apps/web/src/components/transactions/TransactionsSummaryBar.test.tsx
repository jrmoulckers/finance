// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for TransactionsSummaryBar.
 * References: issue #3772
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import type { TransactionSummary } from '../../lib/transactions/summary';
import { TransactionsSummaryBar } from './TransactionsSummaryBar';

vi.mock('../common', () => ({
  CurrencyDisplay: ({ amount, currency }: { amount: number; currency: string }) => (
    <span data-testid="currency">
      {currency} {amount}
    </span>
  ),
}));

function summary(overrides: Partial<TransactionSummary>): TransactionSummary {
  return {
    count: 0,
    totalsByCurrency: [],
    isMixedCurrency: false,
    singleCurrencyNet: null,
    ...overrides,
  };
}

describe('TransactionsSummaryBar', () => {
  it('pluralizes the transaction count', () => {
    const { rerender } = render(<TransactionsSummaryBar summary={summary({ count: 1 })} />);
    expect(screen.getAllByText(/1 transaction\b/).length).toBeGreaterThan(0);

    rerender(<TransactionsSummaryBar summary={summary({ count: 4 })} />);
    expect(screen.getAllByText(/4 transactions/).length).toBeGreaterThan(0);
  });

  it('renders income, expense, and net totals', () => {
    render(
      <TransactionsSummaryBar
        summary={summary({
          count: 3,
          totalsByCurrency: [{ currency: 'USD', income: 5000, expenses: 2500, net: 2500 }],
          singleCurrencyNet: { currency: 'USD', income: 5000, expenses: 2500, net: 2500 },
        })}
      />,
    );
    expect(screen.getByText('USD 5000')).toBeInTheDocument();
    expect(screen.getByText('USD -2500')).toBeInTheDocument();
    expect(screen.getByText('USD 2500')).toBeInTheDocument();
  });

  it('lists each currency separately when mixed', () => {
    render(
      <TransactionsSummaryBar
        summary={summary({
          count: 2,
          isMixedCurrency: true,
          totalsByCurrency: [
            { currency: 'EUR', income: 0, expenses: 700, net: -700 },
            { currency: 'USD', income: 600, expenses: 0, net: 600 },
          ],
        })}
      />,
    );
    expect(screen.getAllByText('EUR -700').length).toBeGreaterThan(0);
    expect(screen.getAllByText('USD 600').length).toBeGreaterThan(0);
  });

  it('announces income, expense, and net totals in a live region for screen readers', () => {
    render(
      <TransactionsSummaryBar
        summary={summary({
          count: 3,
          totalsByCurrency: [{ currency: 'USD', income: 500, expenses: 2000, net: -1500 }],
          singleCurrencyNet: { currency: 'USD', income: 500, expenses: 2000, net: -1500 },
        })}
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('3 transactions');
    expect(status).toHaveTextContent(/net negative 15\.00 USD/i);
  });

  it('omits the totals when there are no net-contributing transactions', () => {
    render(<TransactionsSummaryBar summary={summary({ count: 2 })} />);
    expect(screen.queryByTestId('currency')).not.toBeInTheDocument();
  });
});
