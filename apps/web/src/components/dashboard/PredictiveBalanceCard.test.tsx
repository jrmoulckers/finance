// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PredictiveBalanceCard } from './PredictiveBalanceCard';
import type { PredictionSummary } from '../../lib/predictiveBalance';

function makePrediction(overrides: Partial<PredictionSummary> = {}): PredictionSummary {
  return {
    accounts: [
      {
        accountId: 'acc-1',
        accountName: 'Checking',
        currentBalanceCents: 500000,
        predictedBalanceCents: 475000,
        projectedSpendingCents: 35000,
        projectedIncomeCents: 10000,
        avgDailySpendingCents: 5000,
        avgDailyIncomeCents: 1500,
        daysRemaining: 7,
        confidence: 0.7,
        trend: 'negative',
      },
      {
        accountId: 'acc-2',
        accountName: 'Savings',
        currentBalanceCents: 1000000,
        predictedBalanceCents: 1005000,
        projectedSpendingCents: 0,
        projectedIncomeCents: 5000,
        avgDailySpendingCents: 0,
        avgDailyIncomeCents: 700,
        daysRemaining: 7,
        confidence: 0.8,
        trend: 'positive',
      },
    ],
    totalPredictedBalanceCents: 1480000,
    totalCurrentBalanceCents: 1500000,
    predictedChangeCents: -20000,
    generatedAt: '2025-07-24T10:00:00Z',
    endOfMonth: '2025-07-31',
    ...overrides,
  };
}

describe('PredictiveBalanceCard', () => {
  it('renders the card title', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    expect(screen.getByText('End-of-Month Forecast')).toBeInTheDocument();
  });

  it('displays the end-of-month date', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    expect(screen.getByText(/by 2025-07-31/)).toBeInTheDocument();
  });

  it('has accessible article landmark', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    expect(screen.getByRole('article', { name: /prediction/i })).toBeInTheDocument();
  });

  it('shows Predicted Balance label', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    expect(screen.getByText('Predicted Balance')).toBeInTheDocument();
  });

  it('shows Current Balance label', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    expect(screen.getByText('Current Balance')).toBeInTheDocument();
  });

  it('shows account breakdown toggle for multiple accounts', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    expect(screen.getByRole('button', { name: /show account breakdown/i })).toBeInTheDocument();
  });

  it('does not show toggle for single account', () => {
    const singleAccPrediction = makePrediction({
      accounts: [makePrediction().accounts[0]],
    });
    render(<PredictiveBalanceCard prediction={singleAccPrediction} />);
    expect(screen.queryByRole('button', { name: /account breakdown/i })).toBeNull();
  });

  it('expands account details on toggle click', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    fireEvent.click(screen.getByRole('button', { name: /show account breakdown/i }));
    expect(screen.getByText('Checking')).toBeInTheDocument();
    expect(screen.getByText('Savings')).toBeInTheDocument();
  });

  it('has correct aria-expanded state on toggle', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    const toggle = screen.getByRole('button', { name: /show account breakdown/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows confidence level in account details', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    fireEvent.click(screen.getByRole('button', { name: /show account breakdown/i }));
    // "High" and "confidence" are in the same element but may be split by text nodes.
    const confidenceElements = screen.getAllByText(/confidence/i);
    expect(confidenceElements.length).toBeGreaterThan(0);
  });

  it('uses role="status" for live prediction values', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows trend direction with aria-label', () => {
    render(<PredictiveBalanceCard prediction={makePrediction()} />);
    // The overall trend is negative (predictedChangeCents: -20000)
    expect(screen.getByLabelText('Balance decreasing')).toBeInTheDocument();
  });
});
