// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GroceryModeSection, type GroceryModeSectionProps } from './GroceryModeSection';

function makeProps(overrides: Partial<GroceryModeSectionProps> = {}): GroceryModeSectionProps {
  return {
    accounts: [{ type: 'CHECKING', currentBalance: { amount: 200_000 } }],
    reservedCents: 0,
    bills: [
      {
        id: 'rent',
        name: 'Rent',
        amount: { amount: 120_000 },
        dueDate: '2025-07-03',
        status: 'UPCOMING',
      },
      {
        id: 'gym',
        name: 'Gym',
        amount: { amount: 5_000 },
        dueDate: '2025-07-02',
        status: 'PAID',
      },
    ],
    budgets: [
      {
        categoryId: 'cat-groceries',
        name: 'Groceries',
        amount: { amount: 60_000 },
        spentAmount: { amount: 38_000 },
      },
    ],
    categoryNames: new Map([['cat-groceries', 'Groceries']]),
    transactions: [],
    today: '2025-07-01',
    fallbackPayday: '2025-07-04',
    currency: 'USD',
    ...overrides,
  };
}

describe('GroceryModeSection', () => {
  it('maps domain bills/budgets into the card, ignoring paid bills', () => {
    render(<GroceryModeSection {...makeProps()} />);
    // Only the unpaid critical Rent ($1,200) is reserved -> $2,000 - $1,200 = $800.
    expect(
      screen.getByText(/You have \$800\.00 to spend before Friday, Jul 4/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Gym')).toBeNull();
  });

  it('auto-pins a grocery-like category by default', () => {
    render(<GroceryModeSection {...makeProps()} />);
    // 60000 budget - 38000 spent = 22000 -> $220.00 remaining, shown by default.
    expect(screen.getByText(/\$220\.00 left in your Groceries budget/i)).toBeInTheDocument();
  });
});
