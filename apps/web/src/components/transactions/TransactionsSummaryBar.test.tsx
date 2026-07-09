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

  it('renders a single net total', () => {
    render(
      <TransactionsSummaryBar
        summary={summary({
          count: 3,
          totalsByCurrency: [{ currency: 'USD', net: 2500 }],
          singleCurrencyNet: { currency: 'USD', net: 2500 },
        })}
      />,
    );
    expect(screen.getByText('USD 2500')).toBeInTheDocument();
  });

  it('lists each currency separately when mixed', () => {
    render(
      <TransactionsSummaryBar
        summary={summary({
          count: 2,
          isMixedCurrency: true,
          totalsByCurrency: [
            { currency: 'EUR', net: -700 },
            { currency: 'USD', net: 600 },
          ],
        })}
      />,
    );
    expect(screen.getByText('EUR -700')).toBeInTheDocument();
    expect(screen.getByText('USD 600')).toBeInTheDocument();
  });

  it('announces the net total in a live region for screen readers', () => {
    render(
      <TransactionsSummaryBar
        summary={summary({
          count: 3,
          totalsByCurrency: [{ currency: 'USD', net: -1500 }],
          singleCurrencyNet: { currency: 'USD', net: -1500 },
        })}
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('3 transactions');
    expect(status).toHaveTextContent(/net total negative 15\.00 USD/i);
  });

  it('omits the net when there are no net-contributing transactions', () => {
    render(<TransactionsSummaryBar summary={summary({ count: 2 })} />);
    expect(screen.queryByTestId('currency')).not.toBeInTheDocument();
  });
});
