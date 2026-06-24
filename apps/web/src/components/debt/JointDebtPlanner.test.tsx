// SPDX-License-Identifier: BUSL-1.1

/**
 * Render tests for the JointDebtPlanner component (#2153).
 *
 * Verifies the accessible ownership table, the avalanche/snowball comparison
 * across both partners' debts, ownership assignment, the goal-impact view, and
 * the recommendation-mode toggle. Data arrives via props (no repository mocks).
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { JointDebtPlanner } from './JointDebtPlanner';
import type { Debt } from '../../lib/debt-types';

const TODAY = '2025-01-01';

const debts: Debt[] = [
  {
    id: 'card',
    name: 'Rewards Card',
    balanceCents: 300_000,
    originalBalanceCents: 400_000,
    annualRateBps: 1999,
    minimumPaymentCents: 12_000,
    type: 'credit_card',
  },
  {
    id: 'loan',
    name: 'Car Loan',
    balanceCents: 100_000,
    originalBalanceCents: 150_000,
    annualRateBps: 500,
    minimumPaymentCents: 7_500,
    type: 'auto_loan',
  },
];

describe('JointDebtPlanner', () => {
  it('renders an empty state when there are no debts', () => {
    render(<JointDebtPlanner debts={[]} todayIso={TODAY} />);
    expect(screen.getByText('No debts to plan together')).toBeDefined();
  });

  it('renders a comparison table with scoped headers for both strategies', () => {
    render(<JointDebtPlanner debts={debts} todayIso={TODAY} />);

    expect(screen.getByRole('heading', { name: 'Joint Debt Payoff' })).toBeDefined();

    const avalancheHeader = screen.getByRole('columnheader', { name: /Avalanche/ });
    expect(avalancheHeader.getAttribute('scope')).toBe('col');
    // Avalanche is recommended for this higher-rate-vs-lower-rate mix.
    expect(avalancheHeader.textContent).toContain('recommended');

    const rowHeader = screen.getByRole('rowheader', { name: 'Time to debt-free' });
    expect(rowHeader.getAttribute('scope')).toBe('row');
  });

  it('exposes ownership and partner assignment for each debt', () => {
    render(<JointDebtPlanner debts={debts} todayIso={TODAY} />);

    const treatment = screen.getByLabelText('Treatment of Rewards Card') as HTMLSelectElement;
    expect(treatment.value).toBe('shared');

    fireEvent.change(treatment, { target: { value: 'jointly-funded' } });
    expect((screen.getByLabelText('Treatment of Rewards Card') as HTMLSelectElement).value).toBe(
      'jointly-funded',
    );

    const owner = screen.getByLabelText('Owner of Car Loan') as HTMLSelectElement;
    fireEvent.change(owner, { target: { value: 'partner-b' } });
    expect((screen.getByLabelText('Owner of Car Loan') as HTMLSelectElement).value).toBe(
      'partner-b',
    );
  });

  it('announces a recommendation through an aria-live region', () => {
    render(<JointDebtPlanner debts={debts} todayIso={TODAY} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('method');
  });

  it('shows the goal-impact trade-off for the default goals', () => {
    render(<JointDebtPlanner debts={debts} todayIso={TODAY} />);
    expect(screen.getByRole('rowheader', { name: 'Wedding fund' })).toBeDefined();
    expect(screen.getByRole('rowheader', { name: 'Home down payment' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Debt-first delay' })).toBeDefined();
  });

  it('collapses detail tables in recommendation mode but keeps the recommendation', () => {
    render(<JointDebtPlanner debts={debts} todayIso={TODAY} />);
    const toggle = screen.getByLabelText(/Recommendation mode/);
    fireEvent.click(toggle);

    // Detail tables are hidden...
    expect(screen.queryByRole('columnheader', { name: /Avalanche/ })).toBeNull();
    expect(screen.queryByRole('rowheader', { name: 'Wedding fund' })).toBeNull();
    // ...but the recommendation card stays.
    expect(screen.getByRole('status').textContent).toContain('method');
  });

  it('lets a couple add and remove a goal', () => {
    render(<JointDebtPlanner debts={debts} todayIso={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(screen.getByRole('rowheader', { name: 'New goal' })).toBeDefined();

    const removeButtons = screen.getAllByRole('button', { name: /Remove/ });
    fireEvent.click(removeButtons[0]);
    // The first original goal is gone from the impact table.
    expect(screen.queryByRole('rowheader', { name: 'Wedding fund' })).toBeNull();
  });

  it('recomputes the comparison when the extra payment changes', () => {
    render(<JointDebtPlanner debts={debts} todayIso={TODAY} />);
    const extra = screen.getByLabelText('Extra payment each month ($)');
    fireEvent.change(extra, { target: { value: '500' } });
    const caption = screen.getByText(/Both strategies paid with an extra/);
    expect(caption.textContent).toContain('$500');
  });
});
