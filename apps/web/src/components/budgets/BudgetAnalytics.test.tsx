// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetAnalytics, type BudgetAnalyticsProps } from './BudgetAnalytics';

// Mock CurrencyDisplay to simplify assertions
vi.mock('../common', () => ({
  CurrencyDisplay: ({ amount, currency }: { amount: number; currency?: string }) => (
    <span data-testid="currency">{`${currency ?? 'USD'} ${amount}`}</span>
  ),
}));

const defaultProps: BudgetAnalyticsProps = {
  totalIncome: 500_000, // $5,000
  totalSpent: 350_000, // $3,500
  totalBudget: 400_000, // $4,000
  daysElapsed: 15,
  totalDays: 30,
  previousPeriodSpent: 300_000, // $3,000
  currentCategorySpending: new Map([
    ['Food', 100_000],
    ['Housing', 150_000],
    ['Transport', 50_000],
    ['Entertainment', 30_000],
    ['Health', 20_000],
  ]),
  previousCategorySpending: new Map([
    ['Food', 90_000],
    ['Housing', 140_000],
    ['Transport', 60_000],
    ['Entertainment', 25_000],
    ['Health', 30_000],
  ]),
  currency: 'USD',
};

describe('BudgetAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the analytics section', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    expect(screen.getByLabelText('Budget analytics')).toBeInTheDocument();
  });

  it('displays savings rate card', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    expect(screen.getByLabelText('Savings rate')).toBeInTheDocument();
    // 30% savings: ($5000 - $3500) / $5000
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('displays spending trajectory card', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    expect(screen.getByLabelText('Spending trajectory')).toBeInTheDocument();
  });

  it('displays budget health card', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    expect(screen.getByLabelText('Budget health')).toBeInTheDocument();
  });

  it('renders health indicator with accessible status', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    // 350000 spent of 400000 budget, 15 of 30 days:
    // expected rate = 400000/30 = ~13333/day, actual = 350000/15 = ~23333/day
    // ratio ~1.75 → over-budget
    expect(screen.getByText('Over Budget')).toBeInTheDocument();
  });

  it('displays days remaining', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    expect(screen.getByText('15 days remaining in period')).toBeInTheDocument();
  });

  it('displays period comparison when previous data is available', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    expect(screen.getByLabelText('Period comparison')).toBeInTheDocument();
    // current 350000 vs previous 300000 = 17% higher
    expect(screen.getByText(/higher/)).toBeInTheDocument();
  });

  it('displays empty state for comparison when no previous data', () => {
    render(<BudgetAnalytics {...defaultProps} previousPeriodSpent={null} />);
    expect(screen.getByText('Not enough data for comparison')).toBeInTheDocument();
  });

  it('displays category trends card', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    expect(screen.getByLabelText('Category trends')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Housing')).toBeInTheDocument();
  });

  it('shows empty category state when no data', () => {
    render(
      <BudgetAnalytics
        {...defaultProps}
        currentCategorySpending={new Map()}
        previousCategorySpending={new Map()}
      />,
    );
    expect(screen.getByText('No category data available')).toBeInTheDocument();
  });

  it('renders progress bars with accessible roles', () => {
    render(<BudgetAnalytics {...defaultProps} />);
    const progressBars = screen.getAllByRole('progressbar');
    // At minimum: trajectory bar + 5 category bars
    expect(progressBars.length).toBeGreaterThanOrEqual(6);
  });

  it('handles singular day remaining', () => {
    render(<BudgetAnalytics {...defaultProps} daysElapsed={29} totalDays={30} />);
    expect(screen.getByText('1 day remaining in period')).toBeInTheDocument();
  });

  it('handles zero income gracefully', () => {
    render(<BudgetAnalytics {...defaultProps} totalIncome={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
