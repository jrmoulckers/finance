// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IncomeVsExpenseCard } from './IncomeVsExpenseCard';

describe('IncomeVsExpenseCard', () => {
  it('shows money in, money out, and a surplus when income exceeds spend', () => {
    render(<IncomeVsExpenseCard incomeCents={450000} expenseCents={240000} currency="USD" />);

    const card = screen.getByRole('article', { name: 'Income versus expenses this month' });
    expect(within(card).getByText('Money in')).toBeInTheDocument();
    expect(within(card).getByText('Money out')).toBeInTheDocument();
    // Net surplus = 450000 - 240000 = 210000 -> $2,100.00
    expect(within(card).getByText(/\$2,100\.00/)).toBeInTheDocument();
    // Meaning is conveyed with a word, not colour alone.
    expect(within(card).getAllByText(/surplus this month/i).length).toBeGreaterThanOrEqual(1);
  });

  it('describes a shortfall when spending exceeds income', () => {
    render(<IncomeVsExpenseCard incomeCents={100000} expenseCents={160000} currency="USD" />);

    const card = screen.getByRole('article', { name: 'Income versus expenses this month' });
    expect(within(card).getAllByText(/shortfall this month/i).length).toBeGreaterThanOrEqual(1);
  });

  it('treats an equal in/out month as balanced', () => {
    render(<IncomeVsExpenseCard incomeCents={120000} expenseCents={120000} currency="USD" />);

    const card = screen.getByRole('article', { name: 'Income versus expenses this month' });
    expect(within(card).getAllByText(/balanced this month/i).length).toBeGreaterThanOrEqual(1);
  });
});
