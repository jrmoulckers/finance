// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GroceryModeCard, type GroceryModeCardProps } from './GroceryModeCard';
import type { UpcomingBillInput } from '../../lib/dashboard/grocery-mode';

const RENT: UpcomingBillInput = {
  id: 'rent',
  name: 'Rent',
  amountCents: 120_000,
  dueDate: '2025-07-03',
  critical: true,
  paid: false,
};

const POWER: UpcomingBillInput = {
  id: 'power',
  name: 'Electric',
  amountCents: 8_500,
  dueDate: '2025-07-02',
  critical: true,
  paid: false,
};

function makeProps(overrides: Partial<GroceryModeCardProps> = {}): GroceryModeCardProps {
  return {
    availableFundsCents: 200_000,
    reservedCents: 0,
    bills: [RENT, POWER],
    categoryOptions: [
      { id: 'groceries', name: 'Groceries', budgetCents: 60_000, spentCents: 38_000 },
      { id: 'dining', name: 'Dining', budgetCents: 20_000, spentCents: 20_000 },
    ],
    today: '2025-07-01',
    incomeDates: [],
    fallbackPayday: '2025-07-04',
    currency: 'USD',
    defaultPinnedCategoryId: null,
    ...overrides,
  };
}

describe('GroceryModeCard', () => {
  it('renders the grocery mode eyebrow and a payday-aware title', () => {
    render(<GroceryModeCard {...makeProps()} />);
    expect(screen.getByText('Grocery mode')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /safe to spend before Friday, Jul 4/i }),
    ).toBeInTheDocument();
  });

  it('exposes the answer as a polite live region', () => {
    render(<GroceryModeCard {...makeProps()} />);
    const statuses = screen.getAllByRole('status');
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    expect(statuses.some((node) => node.getAttribute('aria-live') === 'polite')).toBe(true);
  });

  it('shows the safe-to-spend answer after setting aside bills', () => {
    // 200000 funds - (120000 + 8500) bills = 71500 -> $715.00
    render(<GroceryModeCard {...makeProps()} />);
    expect(
      screen.getByText(/You have \$715\.00 to spend before Friday, Jul 4/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/after setting aside \$1,285\.00 for bills/i)).toBeInTheDocument();
  });

  it('lists the upcoming critical bills, soonest first', () => {
    render(<GroceryModeCard {...makeProps()} />);
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Electric');
    expect(items[1]).toHaveTextContent('Rent');
  });

  it('shows a reassuring empty message when no critical bills are due', () => {
    render(<GroceryModeCard {...makeProps({ bills: [] })} />);
    expect(screen.getByText(/No critical bills are due before Friday, Jul 4/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('offers a labelled, keyboard-navigable category selector', () => {
    render(<GroceryModeCard {...makeProps()} />);
    const select = screen.getByRole('combobox', { name: /track a category/i });
    expect(select).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: /none/i })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
  });

  it('announces the pinned category remaining when one is selected', () => {
    render(<GroceryModeCard {...makeProps()} />);
    const select = screen.getByRole('combobox', { name: /track a category/i });
    fireEvent.change(select, { target: { value: 'groceries' } });
    // 60000 budget - 38000 spent = 22000 -> $220.00
    expect(screen.getByText(/\$220\.00 left in your Groceries budget/i)).toBeInTheDocument();
  });

  it('uses gentle copy when a pinned category budget is fully used', () => {
    render(<GroceryModeCard {...makeProps({ defaultPinnedCategoryId: 'dining' })} />);
    expect(screen.getByText(/used up your Dining budget for now/i)).toBeInTheDocument();
    expect(screen.getByText(/no stress, it resets next period/i)).toBeInTheDocument();
  });

  it('answers an affordability check in the affirmative', () => {
    render(<GroceryModeCard {...makeProps()} />);
    const input = screen.getByRole('textbox', { name: /can i afford/i });
    fireEvent.change(input, { target: { value: '50' } });
    expect(screen.getByText(/Yes, go for it/i)).toBeInTheDocument();
    expect(screen.getByText(/still have \$665\.00 free/i)).toBeInTheDocument();
  });

  it('answers an unaffordable check with supportive, non-alarming copy', () => {
    render(<GroceryModeCard {...makeProps()} />);
    const input = screen.getByRole('textbox', { name: /can i afford/i });
    fireEvent.change(input, { target: { value: '900' } });
    // 71500 safe - 90000 = -18500 short -> $185.00
    expect(screen.getByText(/Not just yet/i)).toBeInTheDocument();
    expect(screen.getByText(/\$185\.00 more than you have free/i)).toBeInTheDocument();
    expect(screen.getByText(/Maybe wait until Friday, Jul 4/i)).toBeInTheDocument();
  });

  it('frames a tight budget supportively rather than as a red alert', () => {
    render(
      <GroceryModeCard {...makeProps({ availableFundsCents: 100_000, bills: [RENT, POWER] })} />,
    );
    // 100000 - 128500 = -28500 short
    expect(screen.getByText(/Money's a little tight right now/i)).toBeInTheDocument();
    expect(screen.getByText(/you're about \$285\.00 short/i)).toBeInTheDocument();
    expect(
      screen.getByText(/It may help to hold off on extras until Friday, Jul 4/i),
    ).toBeInTheDocument();
  });

  it('works without a known payday, using the generic horizon', () => {
    render(<GroceryModeCard {...makeProps({ fallbackPayday: null, bills: [] })} />);
    expect(screen.getByRole('heading', { name: /safe to spend right now/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        /You have \$2,000\.00 to spend right now\. No critical bills are due first\./i,
      ),
    ).toBeInTheDocument();
  });

  it('estimates the next payday from recent income dates', () => {
    // A single monthly paycheck on Jun 20 projects forward ~30 days to Jul 20.
    render(<GroceryModeCard {...makeProps({ incomeDates: ['2025-06-20'], bills: [] })} />);
    expect(
      screen.getByRole('heading', { name: /safe to spend before .*Jul 20/i }),
    ).toBeInTheDocument();
  });
});
