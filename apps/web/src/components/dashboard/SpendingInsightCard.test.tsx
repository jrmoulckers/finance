// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpendingInsightCard } from './SpendingInsightCard';

// Mock CurrencyDisplay so the card can be tested without the privacy/locale
// providers; it simply echoes the (cents) amount for assertions.
vi.mock('../common', () => ({
  CurrencyDisplay: ({ amount }: { amount: number }) => (
    <span data-testid="currency">{`$${Math.round(amount / 100)}`}</span>
  ),
}));

describe('SpendingInsightCard', () => {
  it('returns null when there is no top category and no comparison', () => {
    const { container } = render(
      <SpendingInsightCard topCategory={null} totalSpending={0} comparison={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null when the top category has zero value', () => {
    const { container } = render(
      <SpendingInsightCard
        topCategory={{ name: 'Groceries', value: 0 }}
        totalSpending={0}
        comparison={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('surfaces the top category with amount and share', () => {
    render(
      <SpendingInsightCard
        topCategory={{ name: 'Groceries', value: 420 }}
        totalSpending={1500}
        comparison={null}
      />,
    );
    const card = screen.getByRole('article', { name: /spending insight/i });
    expect(card).toHaveTextContent('Groceries is your top category');
    expect(card).toHaveTextContent('$420');
    expect(card).toHaveTextContent('(28%)');
  });

  it('describes an increase with a word and an icon, not color alone', () => {
    render(
      <SpendingInsightCard
        topCategory={{ name: 'Groceries', value: 420 }}
        totalSpending={1500}
        comparison={{ percentChange: 15 }}
      />,
    );
    const card = screen.getByRole('article', { name: /spending insight/i });
    expect(card).toHaveTextContent('15% more than the previous period');
    expect(card).toHaveTextContent('↑');
  });

  it('describes a decrease as "less"', () => {
    render(
      <SpendingInsightCard
        topCategory={{ name: 'Groceries', value: 420 }}
        totalSpending={1500}
        comparison={{ percentChange: -22 }}
      />,
    );
    const card = screen.getByRole('article', { name: /spending insight/i });
    expect(card).toHaveTextContent('22% less than the previous period');
    expect(card).toHaveTextContent('↓');
  });

  it('omits the comparison clause when the rounded change is flat (0%)', () => {
    render(
      <SpendingInsightCard
        topCategory={{ name: 'Groceries', value: 420 }}
        totalSpending={1500}
        comparison={{ percentChange: 0.2 }}
      />,
    );
    const card = screen.getByRole('article', { name: /spending insight/i });
    expect(card).not.toHaveTextContent('than the previous period');
  });
});
