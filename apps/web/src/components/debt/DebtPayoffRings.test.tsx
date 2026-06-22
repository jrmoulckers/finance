// SPDX-License-Identifier: BUSL-1.1

/**
 * Render tests for the DebtPayoffRings component (#2175).
 *
 * Verifies the accessible ring (text alternative), estimated payoff date,
 * milestone ladder, debt selection, and the extra-payment what-if comparison.
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { DebtPayoffRings } from './DebtPayoffRings';
import type { Debt } from '../../lib/debt-types';

const TODAY = '2025-01-01';

const autoLoan: Debt = {
  id: 'auto',
  name: 'Auto Loan',
  balanceCents: 620_000, // $6,200 remaining
  originalBalanceCents: 1_000_000, // of $10,000 → 38% paid
  annualRateBps: 1200,
  minimumPaymentCents: 30_000,
  type: 'auto_loan',
};

const paidLoan: Debt = {
  id: 'paid',
  name: 'Personal Loan',
  balanceCents: 0,
  originalBalanceCents: 500_000,
  annualRateBps: 900,
  minimumPaymentCents: 20_000,
  type: 'personal_loan',
};

describe('DebtPayoffRings', () => {
  it('renders an empty state when there are no debts', () => {
    render(<DebtPayoffRings debts={[]} todayIso={TODAY} />);
    expect(screen.getByText('No debt accounts to visualize')).toBeDefined();
  });

  it('renders the ring with an accessible text alternative and payoff date', () => {
    render(<DebtPayoffRings debts={[autoLoan]} todayIso={TODAY} />);

    const ring = screen.getByRole('img');
    expect(ring.getAttribute('aria-label')).toContain('38% paid');
    expect(ring.getAttribute('aria-label')).toContain('Auto Loan');

    // Visible progress text alternative (no colour-only signalling).
    expect(screen.getByText('38% paid — $3,800 of $10,000')).toBeDefined();

    // Estimated payoff date is surfaced as a year.
    const payoffDate = screen.getByText('Estimated payoff date').nextElementSibling;
    expect(payoffDate?.textContent).toMatch(/\d{4}/);
  });

  it('renders the milestone ladder with reached and in-progress states', () => {
    render(<DebtPayoffRings debts={[autoLoan]} todayIso={TODAY} />);
    const milestones = screen.getByRole('list');
    // 38% paid → only the 25% milestone is reached.
    expect(within(milestones).getAllByText('Reached')).toHaveLength(1);
    expect(within(milestones).getAllByText('In progress')).toHaveLength(3);
    expect(within(milestones).getByText(/25% paid off — milestone reached/)).toBeDefined();
  });

  it('computes months saved and interest saved for an extra payment', () => {
    render(<DebtPayoffRings debts={[autoLoan]} todayIso={TODAY} />);

    const extraInput = screen.getByLabelText('Extra monthly payment ($)');
    fireEvent.change(extraInput, { target: { value: '200' } });

    const results = screen.getByRole('status');
    expect(within(results).getByText('Months saved')).toBeDefined();
    expect(within(results).getByText('Interest saved')).toBeDefined();
    expect(within(results).getByText(/saves \$/)).toBeDefined();
  });

  it('prompts for an extra payment before one is entered', () => {
    render(<DebtPayoffRings debts={[autoLoan]} todayIso={TODAY} />);
    const results = screen.getByRole('status');
    expect(results.getAttribute('aria-live')).toBe('polite');
    expect(within(results).getByText(/Add an extra monthly payment/)).toBeDefined();
  });

  it('lets the user switch between debt accounts', () => {
    render(<DebtPayoffRings debts={[autoLoan, paidLoan]} todayIso={TODAY} />);

    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('38% paid');

    const selector = screen.getByLabelText('Debt account');
    fireEvent.change(selector, { target: { value: 'paid' } });

    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('100% paid');
    expect(screen.getAllByText('Paid off').length).toBeGreaterThan(0);
  });

  it('does not show a debt selector for a single debt', () => {
    render(<DebtPayoffRings debts={[autoLoan]} todayIso={TODAY} />);
    expect(screen.queryByLabelText('Debt account')).toBeNull();
  });
});
