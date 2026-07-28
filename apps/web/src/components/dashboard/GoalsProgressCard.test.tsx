// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';

import { GoalsProgressCard } from './GoalsProgressCard';
import type { Goal } from '../../kmp/bridge';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Emergency fund',
    status: 'ACTIVE',
    currency: { code: 'USD', decimalPlaces: 2 },
    targetAmount: { amount: 100000 },
    currentAmount: { amount: 25000 },
    ...overrides,
  } as unknown as Goal;
}

function renderCard(goals: Goal[], maxVisible?: number) {
  return render(
    <MemoryRouter>
      <GoalsProgressCard goals={goals} currency="USD" maxVisible={maxVisible} />
    </MemoryRouter>,
  );
}

describe('GoalsProgressCard', () => {
  it('renders a labelled progress bar and percent for each active goal', () => {
    renderCard([
      makeGoal({
        id: 'g1',
        name: 'Emergency fund',
        currentAmount: { amount: 25000 },
        targetAmount: { amount: 100000 },
      }),
    ]);

    const card = screen.getByRole('article', { name: 'Savings goals progress' });
    expect(within(card).getByText('Emergency fund')).toBeInTheDocument();
    expect(within(card).getByText('25%')).toBeInTheDocument();
    const bar = within(card).getByRole('progressbar', {
      name: /Emergency fund: 25 percent funded/i,
    });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
  });

  it('excludes non-active goals and caps a percentage at 100', () => {
    renderCard([
      makeGoal({ id: 'g1', name: 'Vacation', status: 'COMPLETED' as Goal['status'] }),
      makeGoal({
        id: 'g2',
        name: 'New laptop',
        currentAmount: { amount: 200000 },
        targetAmount: { amount: 100000 },
      }),
    ]);

    const card = screen.getByRole('article', { name: 'Savings goals progress' });
    expect(within(card).queryByText('Vacation')).not.toBeInTheDocument();
    expect(within(card).getByText(/100%/)).toBeInTheDocument();
  });

  it('links to all goals when more exist than are shown inline', () => {
    renderCard(
      [
        makeGoal({ id: 'g1', name: 'A' }),
        makeGoal({ id: 'g2', name: 'B' }),
        makeGoal({ id: 'g3', name: 'C' }),
        makeGoal({ id: 'g4', name: 'D' }),
      ],
      2,
    );

    const card = screen.getByRole('article', { name: 'Savings goals progress' });
    expect(within(card).getByRole('link', { name: /View all 4 goals/i })).toHaveAttribute(
      'href',
      '/goals',
    );
  });

  it('shows an empty state with a call to action when there are no active goals', () => {
    renderCard([]);

    const card = screen.getByRole('article', { name: 'Savings goals progress' });
    expect(within(card).getByText(/No active goals yet/i)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Create a goal/i })).toHaveAttribute(
      'href',
      '/goals',
    );
  });
});
