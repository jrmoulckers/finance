// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SharedGoalBadge, SharedGoalContributions } from './SharedGoalContributions';
import type { Goal } from '../../kmp/bridge';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    householdId: 'household-1',
    name: 'House Down Payment',
    description: null,
    targetAmount: { amount: 8000000 },
    currentAmount: { amount: 5000000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    targetDate: '2099-12-31',
    status: 'ACTIVE',
    icon: 'home',
    color: null,
    accountId: null,
    sortOrder: 0,
    ...syncMetadata,
    ...overrides,
  } as Goal;
}

const TEST_KEY = 'finance:shared-goal:test';

function seedConfig(): void {
  window.localStorage.setItem(
    TEST_KEY,
    JSON.stringify({
      contributors: [
        { id: 'alex', name: 'Alex', contributedCents: 3000000, monthlyIncomeCents: 600000 },
        { id: 'bailey', name: 'Bailey', contributedCents: 2000000, monthlyIncomeCents: 400000 },
      ],
      milestones: [
        { id: 'down', label: 'Down payment', amountCents: 4000000 },
        { id: 'closing', label: 'Closing costs', amountCents: 1500000 },
      ],
      privacy: 'detailed',
      incomeWeighted: false,
    }),
  );
}

describe('SharedGoalContributions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedConfig();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the section, partner names and a visibility toggle', () => {
    render(<SharedGoalContributions goal={makeGoal()} storageKey={TEST_KEY} />);

    expect(screen.getByRole('region', { name: /shared contributions/i })).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Bailey')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /detailed/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /summarized/i })).not.toBeChecked();
  });

  it('exposes accessible progress bars for the household and each partner', () => {
    render(<SharedGoalContributions goal={makeGoal()} storageKey={TEST_KEY} />);

    const bars = screen.getAllByRole('progressbar');
    // household total + 2 partners + 2 milestones
    expect(bars.length).toBe(5);
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute('aria-valuenow');
      expect(bar).toHaveAttribute('aria-valuemax');
    });
  });

  it('renders the milestone checklist with text status (not colour alone)', () => {
    render(<SharedGoalContributions goal={makeGoal()} storageKey={TEST_KEY} />);

    const checklist = screen.getByRole('list', { name: /milestone checklist/i });
    expect(within(checklist).getByText('Down payment')).toBeInTheDocument();
    expect(within(checklist).getByText('Complete')).toBeInTheDocument();
    expect(within(checklist).getByText('In progress')).toBeInTheDocument();
  });

  it('shows suggested monthly targets per person when a target date is set', () => {
    render(<SharedGoalContributions goal={makeGoal()} storageKey={TEST_KEY} />);

    expect(screen.getAllByText(/suggested monthly/i).length).toBe(2);
  });

  it('hides exact partner amounts when switched to summarized', () => {
    render(<SharedGoalContributions goal={makeGoal()} storageKey={TEST_KEY} />);

    // Detailed mode shows per-partner "contributed" amounts.
    expect(screen.getAllByText(/contributed/i).length).toBe(2);

    fireEvent.click(screen.getByRole('radio', { name: /summarized/i }));

    expect(screen.queryAllByText(/contributed/i)).toHaveLength(0);
    // Relative effort/share is still shown so partners keep context.
    expect(screen.getAllByText(/% of household savings/i).length).toBeGreaterThan(0);
  });

  it('toggles the add-partner editor', () => {
    render(<SharedGoalContributions goal={makeGoal()} storageKey={TEST_KEY} />);

    const addButton = screen.getByRole('button', { name: /add partner/i });
    expect(addButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(addButton);

    expect(screen.getByRole('button', { name: /close partner form/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByLabelText(/partner name/i)).toBeInTheDocument();
  });
});

describe('SharedGoalBadge', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when there is no stored config', () => {
    const { container } = render(<SharedGoalBadge goalId="goal-x" goalName="Solo goal" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a single contributor', () => {
    window.localStorage.setItem(
      'finance:shared-goal:goal-solo',
      JSON.stringify({
        contributors: [{ id: 'you', name: 'You', contributedCents: 100, monthlyIncomeCents: null }],
        milestones: [],
        privacy: 'detailed',
        incomeWeighted: false,
      }),
    );
    const { container } = render(<SharedGoalBadge goalId="goal-solo" goalName="Solo goal" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('summarizes partners and the leader when two contributors exist', () => {
    window.localStorage.setItem(
      'finance:shared-goal:goal-pair',
      JSON.stringify({
        contributors: [
          { id: 'alex', name: 'Alex', contributedCents: 3000000, monthlyIncomeCents: null },
          { id: 'bailey', name: 'Bailey', contributedCents: 2000000, monthlyIncomeCents: null },
        ],
        milestones: [],
        privacy: 'detailed',
        incomeWeighted: false,
      }),
    );
    render(<SharedGoalBadge goalId="goal-pair" goalName="Shared goal" />);
    expect(screen.getByText(/2 partners/i)).toBeInTheDocument();
    expect(screen.getByText(/alex leads/i)).toBeInTheDocument();
  });
});
